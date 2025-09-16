import { Duration, RemovalPolicy, Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Alarm, ComparisonOperator, Dashboard, GraphWidget, LegendPosition, Metric, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';
import { Bucket, BlockPublicAccess } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { OriginAccessIdentity, Distribution, ViewerProtocolPolicy, AllowedMethods, CachePolicy, ResponseHeadersPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { S3Origin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { CfnWebACL, CfnWebACLAssociation } from 'aws-cdk-lib/aws-wafv2';
import { RestApi, LambdaIntegration, Deployment, Stage } from 'aws-cdk-lib/aws-apigateway';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { Table, AttributeType, BillingMode } from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { UserPool, UserPoolClient, OAuthScope, ProviderAttribute, UserPoolIdentityProviderGoogle, CfnUserPoolDomain } from 'aws-cdk-lib/aws-cognito';
import * as path from 'path';

export class TeamHRStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Configurable resource prefix (context/env). Example: -c resourcePrefix=team-ai
    const resourcePrefix: string = (this.node.tryGetContext('resourcePrefix') as string) || process.env.RESOURCE_PREFIX || 'teamhr';

    // S3 bucket for static site assets
    const siteBucket = new Bucket(this, 'WebBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      autoDeleteObjects: false,
      removalPolicy: RemovalPolicy.RETAIN,
      enforceSSL: true,
    });

    // CloudFront Origin Access Identity
    const oai = new OriginAccessIdentity(this, 'WebOAI');
    siteBucket.addToResourcePolicy(
      new PolicyStatement({
        actions: ['s3:GetObject'],
        resources: [siteBucket.arnForObjects('*')],
        principals: [oai.grantPrincipal],
      }),
    );

    // CloudFront distribution
    const distribution = new Distribution(this, 'WebDistribution', {
      defaultBehavior: {
        origin: new S3Origin(siteBucket, { originAccessIdentity: oai }),
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: ResponseHeadersPolicy.SECURITY_HEADERS,
      },
      defaultRootObject: 'index.html',
      comment: 'TeamHR Frontend (D1)',
    });

    // Deploy minimal static site assets (from repo web/public)
    new BucketDeployment(this, 'DeployWebAssets', {
      destinationBucket: siteBucket,
      sources: [Source.asset(path.resolve(__dirname, '../../..', 'web/public'))],
      distribution,
      distributionPaths: ['/*'],
    });

    // WAFv2 Web ACL with AWS Managed Rules
    const wafMetricName = `${resourcePrefix}WebWAF`;
    const webAcl = new CfnWebACL(this, 'WebWAF', {
      defaultAction: { allow: {} },
      scope: 'CLOUDFRONT',
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: wafMetricName,
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: 'AWS-AWSManagedRulesCommonRuleSet',
          priority: 0,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'CommonRuleSet',
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    new CfnWebACLAssociation(this, 'WebWAFAssoc', {
      resourceArn: `arn:aws:cloudfront::${Stack.of(this).account}:distribution/${distribution.distributionId}`,
      webAclArn: webAcl.attrArn,
    });

    // DynamoDB table (generic key schema pk/sk)
    const table = new Table(this, 'TeamHRTable', {
      partitionKey: { name: 'pk', type: AttributeType.STRING },
      sortKey: { name: 'sk', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY, // change to RETAIN in prod
    });

    // Health Lambda (Node.js)
    const healthFn = new NodejsFunction(this, 'HealthFunction', {
      entry: path.resolve(__dirname, '../../..', 'services/health-lambda/src/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_18_X,
      memorySize: 128,
      timeout: Duration.seconds(5),
      tracing: Tracing.ACTIVE,
      functionName: `${resourcePrefix}-health`,
      environment: {
        TABLE_NAME: table.tableName,
      },
    });
    table.grantReadData(healthFn);

    // API Gateway REST API with /health
    const api = new RestApi(this, 'TeamHRApi', {
      deploy: false, // we'll control stage for naming
      restApiName: `${resourcePrefix}-api`,
    });
    const health = api.root.addResource('health');
    health.addMethod('GET', new LambdaIntegration(healthFn));

    const deployment = new Deployment(this, 'ApiDeployment', { api });
    const stage = new Stage(this, 'ProdStage', { deployment, stageName: 'prod', tracingEnabled: true });
    api.deploymentStage = stage;

    // Observability: CloudWatch metrics and placeholder alarms/dashboard
    // API Gateway metrics (errors/latency)
    const api5xxMetric = new Metric({
      namespace: 'AWS/ApiGateway',
      metricName: '5XXError',
      dimensionsMap: { ApiName: api.restApiName, Stage: stage.stageName },
      period: Duration.minutes(5),
      statistic: 'sum',
    });
    const apiLatencyP95 = new Metric({
      namespace: 'AWS/ApiGateway',
      metricName: 'Latency',
      dimensionsMap: { ApiName: api.restApiName, Stage: stage.stageName },
      period: Duration.minutes(5),
      statistic: 'p95',
    });
    const apiLatencyP50 = new Metric({
      namespace: 'AWS/ApiGateway',
      metricName: 'Latency',
      dimensionsMap: { ApiName: api.restApiName, Stage: stage.stageName },
      period: Duration.minutes(5),
      statistic: 'p50',
    });

    // WAF (CloudFront scope) metrics placeholder — relies on WebACL metric name
    const wafBlockedMetric = new Metric({
      namespace: 'AWS/WAFV2',
      metricName: 'BlockedRequests',
      dimensionsMap: { WebACL: wafMetricName, Region: 'Global' },
      period: Duration.minutes(5),
      statistic: 'sum',
    });

    // Placeholder alarms (thresholds to be refined later)
    new Alarm(this, 'Api5xxAlarm', {
      metric: api5xxMetric,
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Placeholder: API Gateway 5XX spikes (>=1 in 5m) — tune later',
    });

    new Alarm(this, 'ApiLatencyP95Alarm', {
      metric: apiLatencyP95,
      threshold: 300, // TRD: sync API P95 < 300ms
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
      alarmDescription: 'TRD: API Gateway latency p95 >= 300ms',
    });

    new Alarm(this, 'ApiLatencyP50Alarm', {
      metric: apiLatencyP50,
      threshold: 60, // ms per TRD p50 target
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
      alarmDescription: 'TRD: API Gateway latency p50 >= 60ms',
    });

    new Alarm(this, 'WafBlockedRequestsAlarm', {
      metric: wafBlockedMetric,
      threshold: 100, // placeholder
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Placeholder: WAF blocked requests spike (>=100 in 5m)',
    });

    // Simple Ops dashboard with key widgets
    const dashboard = new Dashboard(this, 'OpsDashboard', {
      dashboardName: `${resourcePrefix}-ops-${Stack.of(this).stackName}`,
    });
    dashboard.addWidgets(
      new GraphWidget({
        title: 'API 5XX (sum, 5m)',
        left: [api5xxMetric],
        legendPosition: LegendPosition.RIGHT,
        width: 12,
      }),
      new GraphWidget({
        title: 'API Latency p95 (ms, 5m)',
        left: [apiLatencyP95],
        legendPosition: LegendPosition.RIGHT,
        width: 12,
      }),
    );
    dashboard.addWidgets(
      new GraphWidget({
        title: 'API Latency p50 (ms, 5m)',
        left: [apiLatencyP50],
        legendPosition: LegendPosition.RIGHT,
        width: 12,
      }),
      new GraphWidget({
        title: 'WAF Blocked Requests (sum, 5m)',
        left: [wafBlockedMetric],
        legendPosition: LegendPosition.RIGHT,
        width: 12,
      }),
    );

    // Cognito User Pool and Hosted UI setup
    const userPool = new UserPool(this, 'UserPool', {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      passwordPolicy: { minLength: 8, requireLowercase: true, requireUppercase: true, requireDigits: true },
      removalPolicy: RemovalPolicy.DESTROY, // change to RETAIN in prod
    });

    // Identity Providers (optional placeholders, require context vars)
    const googleClientId = this.node.tryGetContext('googleClientId');
    const googleClientSecret = this.node.tryGetContext('googleClientSecret');
    if (googleClientId && googleClientSecret) {
      new UserPoolIdentityProviderGoogle(this, 'GoogleIdP', {
        clientId: googleClientId,
        clientSecret: googleClientSecret,
        userPool,
        attributeMapping: {
          email: ProviderAttribute.GOOGLE_EMAIL,
          givenName: ProviderAttribute.GOOGLE_GIVEN_NAME,
          familyName: ProviderAttribute.GOOGLE_FAMILY_NAME,
        },
      });
    }

    // Note: GitHub is not a built-in Cognito IdP. Add via OIDC/SAML if applicable.

    const callbackUrls: string[] = this.node.tryGetContext('oauthCallbackUrls') ?? ['https://example.com/api/auth/callback'];
    const logoutUrls: string[] = this.node.tryGetContext('oauthLogoutUrls') ?? ['https://example.com'];
    const userPoolClient = new UserPoolClient(this, 'UserPoolClient', {
      userPool,
      generateSecret: false,
      oAuth: {
        callbackUrls,
        logoutUrls,
        scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE],
      },
      supportedIdentityProviders: undefined, // derives from configured IdPs
    });

    const domainPrefix = this.node.tryGetContext('cognitoDomainPrefix') || `${resourcePrefix}-${Stack.of(this).account}`;
    const userPoolDomain = new CfnUserPoolDomain(this, 'CognitoDomain', {
      domain: domainPrefix.toLowerCase(),
      userPoolId: userPool.userPoolId,
    });

    // Outputs
    new CfnOutput(this, 'CloudFrontURL', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'Frontend distribution URL',
    });
    new CfnOutput(this, 'ApiBaseUrl', {
      value: api.url ?? 'unknown',
      description: 'API Gateway base URL',
    });
    new CfnOutput(this, 'HealthEndpoint', {
      value: api.urlForPath('/health'),
      description: 'GET /health endpoint',
    });
    new CfnOutput(this, 'CognitoHostedUiBase', {
      value: `https://${userPoolDomain.domain}.auth.${Stack.of(this).region}.amazoncognito.com`,
      description: 'Cognito Hosted UI base domain',
    });
  }
}
