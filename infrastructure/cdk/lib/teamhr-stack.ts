import { Duration, RemovalPolicy, Stack, StackProps, CfnOutput, SecretValue } from 'aws-cdk-lib';
import { Alarm, ComparisonOperator, Dashboard, GraphWidget, LegendPosition, Metric, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';
import { Bucket, BlockPublicAccess } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { OriginAccessIdentity, Distribution, CfnDistribution, ViewerProtocolPolicy, AllowedMethods, CachePolicy, ResponseHeadersPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { S3Origin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { CfnWebACL, CfnWebACLAssociation } from 'aws-cdk-lib/aws-wafv2';
import { RestApi, LambdaIntegration, Deployment, Stage } from 'aws-cdk-lib/aws-apigateway';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { Table, AttributeType, BillingMode, ProjectionType } from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { UserPool, UserPoolClient, OAuthScope, ProviderAttribute, UserPoolIdentityProviderGoogle, CfnUserPoolDomain, UserPoolClientIdentityProvider, StringAttribute, ResourceServerScope } from 'aws-cdk-lib/aws-cognito';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import * as path from 'path';

export class TeamHRStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Configurable resource prefix (context/env). Example: -c resourcePrefix=team-ai
    const resourcePrefix: string = (this.node.tryGetContext('resourcePrefix') as string) || process.env.RESOURCE_PREFIX || 'teamhr';

    const coerceString = (value: unknown): string | undefined => {
      if (value === undefined || value === null) {
        return undefined;
      }
      const str = String(value).trim();
      return str.length > 0 ? str : undefined;
    };

    const coerceStringArray = (value: unknown): string[] | undefined => {
      if (value === undefined || value === null) {
        return undefined;
      }
      if (Array.isArray(value)) {
        const normalized = value
          .map((item) => coerceString(item))
          .filter((item): item is string => !!item);
        return normalized.length > 0 ? normalized : undefined;
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
          return undefined;
        }
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            return coerceStringArray(parsed);
          }
        } catch {}
        const normalized = trimmed
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item.length > 0);
        return normalized.length > 0 ? normalized : undefined;
      }
      return undefined;
    };

    // S3 bucket for static site assets
    const siteBucket = new Bucket(this, 'WebBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      autoDeleteObjects: false,
      removalPolicy: RemovalPolicy.RETAIN,
      enforceSSL: true,
      // Static assets via CloudFront OAI: prefer S3-managed encryption to avoid KMS permission issues
      encryption: require('aws-cdk-lib/aws-s3').BucketEncryption.S3_MANAGED,
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

    const distributionResource = distribution.node.defaultChild as CfnDistribution;
    const stackRegion = Stack.of(this).region;
    // Deploy minimal static site assets (from repo web/public)
    new BucketDeployment(this, 'DeployWebAssets', {
      destinationBucket: siteBucket,
      sources: [Source.asset(path.resolve(__dirname, '../../..', 'web/public'))],
      distribution,
      distributionPaths: ['/*'],
    });

    // WAFv2 Web ACL with AWS Managed Rules
    const wafMetricName = `${resourcePrefix}WebWAF`;
    const wafScope: 'CLOUDFRONT' | 'REGIONAL' = stackRegion && stackRegion !== 'us-east-1' ? 'REGIONAL' : 'CLOUDFRONT';
    const webAcl = new CfnWebACL(this, 'WebWAF', {
      defaultAction: { allow: {} },
      scope: wafScope,
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

    if (wafScope === 'CLOUDFRONT') {
      distributionResource.addPropertyOverride('DistributionConfig.WebACLId', webAcl.attrArn);
    }

    // DynamoDB table (generic key schema pk/sk)
    const table = new Table(this, 'TeamHRTable', {
      partitionKey: { name: 'pk', type: AttributeType.STRING },
      sortKey: { name: 'sk', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY, // change to RETAIN in prod
      timeToLiveAttribute: 'ttl',
      encryption: require('aws-cdk-lib/aws-dynamodb').TableEncryption.AWS_MANAGED,
    });
    // D2 scaffold: GSIs per TRD (gate by env/context to avoid multi-GSI update error)
    const createGsi1 = ((process.env.CREATE_GSI1 ?? 'true').toLowerCase() === 'true');
    const createGsi2 = ((process.env.CREATE_GSI2 ?? 'false').toLowerCase() === 'true');
    if (createGsi1) {
      table.addGlobalSecondaryIndex({
        indexName: 'GSI1',
        partitionKey: { name: 'gsi1pk', type: AttributeType.STRING },
        sortKey: { name: 'gsi1sk', type: AttributeType.STRING },
        projectionType: ProjectionType.ALL,
      });
    }
    if (createGsi2) {
      table.addGlobalSecondaryIndex({
        indexName: 'GSI2',
        partitionKey: { name: 'gsi2pk', type: AttributeType.STRING },
        sortKey: { name: 'gsi2sk', type: AttributeType.STRING },
        projectionType: ProjectionType.ALL,
      });
    }

    // Health Lambda (Node.js)
    const healthFn = new NodejsFunction(this, 'HealthFunction', {
      entry: path.resolve(__dirname, '../../..', 'services/health-lambda/src/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_18_X,
      memorySize: 128,
      timeout: Duration.seconds(5),
      tracing: Tracing.ACTIVE,
      functionName: `${resourcePrefix}-${Stack.of(this).stackName.toLowerCase()}-health`,
      environment: {
        TABLE_NAME: table.tableName,
      },
      bundling: { externalModules: ['aws-sdk', '@aws-sdk/*'] },
    });
    table.grantReadData(healthFn);

    // API Gateway REST API with /health
    const api = new RestApi(this, 'TeamHRApi', {
      deploy: false, // we'll control stage for naming
      restApiName: `${resourcePrefix}-api`,
    });
    const health = api.root.addResource('health');
    health.addMethod('GET', new LambdaIntegration(healthFn));

    // D2: Tenant onboarding Lambda and API (POST /tenant)
    const tenantFn = new NodejsFunction(this, 'TenantFunction', {
      entry: path.resolve(__dirname, '../../..', 'services/tenant-lambda/src/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_18_X,
      memorySize: 256,
      timeout: Duration.seconds(10),
      tracing: Tracing.ACTIVE,
      functionName: `${resourcePrefix}-${Stack.of(this).stackName.toLowerCase()}-tenant`,
      environment: {
        TABLE_NAME: table.tableName,
      },
      bundling: { externalModules: ['aws-sdk', '@aws-sdk/*'] },
    });
    table.grantReadWriteData(tenantFn);

    const tenant = api.root.addResource('tenant');
    tenant.addMethod('POST', new LambdaIntegration(tenantFn));

    // D3: Invite Lambda and API (POST /invite, GET /invite/{token})
    const frontendUrl = `https://${distribution.distributionDomainName}`;
    const inviteFn = new NodejsFunction(this, 'InviteFunction', {
      entry: path.resolve(__dirname, '../../..', 'services/invite-lambda/src/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_18_X,
      memorySize: 256,
      timeout: Duration.seconds(10),
      tracing: Tracing.ACTIVE,
      functionName: `${resourcePrefix}-${Stack.of(this).stackName.toLowerCase()}-invite`,
      environment: {
        TABLE_NAME: table.tableName,
        FRONTEND_URL: frontendUrl,
        SES_SENDER: process.env.SES_SENDER ?? '',
      },
      bundling: { externalModules: ['aws-sdk', '@aws-sdk/*'] },
    });
    table.grantReadWriteData(inviteFn);
    inviteFn.addToRolePolicy(
      new PolicyStatement({
        actions: ['ses:SendEmail', 'ses:SendRawEmail'],
        resources: ['*'],
      }),
    );
    const invite = api.root.addResource('invite');
    invite.addMethod('POST', new LambdaIntegration(inviteFn));
    const inviteToken = invite.addResource('{token}');
    inviteToken.addMethod('GET', new LambdaIntegration(inviteFn));

    // D4: GitHub OAuth + event collection
    const githubFn = new NodejsFunction(this, 'GithubFunction', {
      entry: path.resolve(__dirname, '../../..', 'services/github-lambda/src/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_18_X,
      memorySize: 256,
      timeout: Duration.seconds(15),
      tracing: Tracing.ACTIVE,
      functionName: `${resourcePrefix}-${Stack.of(this).stackName.toLowerCase()}-github`,
      environment: {
        TABLE_NAME: table.tableName,
        GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID ?? '',
        GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET ?? '',
        GITHUB_TOKEN: process.env.GITHUB_TOKEN ?? '', // demo fallback
      },
      bundling: { externalModules: ['aws-sdk', '@aws-sdk/*'] },
    });
    table.grantReadWriteData(githubFn);

    const oauth = api.root.addResource('oauth');
    const gh = oauth.addResource('github');
    const ghStart = gh.addResource('start');
    ghStart.addMethod('GET', new LambdaIntegration(githubFn));
    const ghCallback = gh.addResource('callback');
    ghCallback.addMethod('GET', new LambdaIntegration(githubFn));

    const ghCollect = api.root.addResource('github').addResource('collect');
    ghCollect.addMethod('POST', new LambdaIntegration(githubFn));
    ghCollect.addMethod('GET', new LambdaIntegration(githubFn));

    const ghSummary = api.root.getResource('github')?.addResource('summary') ?? api.root.addResource('github').addResource('summary');
    ghSummary.addMethod('GET', new LambdaIntegration(githubFn));

    // D6: Google Calendar ingestion (read-only)
    const calendarFn = new NodejsFunction(this, 'CalendarFunction', {
      entry: path.resolve(__dirname, '../../..', 'services/calendar-lambda/src/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_18_X,
      memorySize: 256,
      timeout: Duration.seconds(15),
      tracing: Tracing.ACTIVE,
      functionName: `${resourcePrefix}-${Stack.of(this).stackName.toLowerCase()}-calendar`,
      environment: {
        GOOGLE_ACCESS_TOKEN: process.env.GOOGLE_ACCESS_TOKEN ?? '', // demo fallback
      },
      bundling: { externalModules: ['aws-sdk', '@aws-sdk/*'] },
    });

    const calendar = api.root.addResource('calendar');
    const meetings = calendar.addResource('meetings');
    meetings.addMethod('GET', new LambdaIntegration(calendarFn));

    const deployment = new Deployment(this, 'ApiDeployment', { api });
    const stage = new Stage(this, 'ProdStage', { deployment, stageName: 'prod', tracingEnabled: true });
    api.deploymentStage = stage;
    // OAuth callback URI is derived at runtime from request domain+stage to avoid CFN cycles

    if (wafScope === 'REGIONAL' && stackRegion) {
      const apiStageArn = `arn:aws:apigateway:${stackRegion}::/restapis/${api.restApiId}/stages/${stage.stageName}`;
      new CfnWebACLAssociation(this, 'ApiWafAssociation', {
        resourceArn: apiStageArn,
        webAclArn: webAcl.attrArn,
      });
    }

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
    // Resource-specific latency metrics for /health (D1 SLO)
    const apiLatencyP95Health = new Metric({
      namespace: 'AWS/ApiGateway',
      metricName: 'Latency',
      dimensionsMap: { ApiName: api.restApiName, Stage: stage.stageName, Resource: '/health', Method: 'GET' },
      period: Duration.minutes(5),
      statistic: 'p95',
    });
    const apiLatencyP50Health = new Metric({
      namespace: 'AWS/ApiGateway',
      metricName: 'Latency',
      dimensionsMap: { ApiName: api.restApiName, Stage: stage.stageName, Resource: '/health', Method: 'GET' },
      period: Duration.minutes(5),
      statistic: 'p50',
    });

    // WAF (CloudFront scope) metrics placeholder ??relies on WebACL metric name
    const wafMetricRegion = wafScope === 'CLOUDFRONT' ? 'Global' : stackRegion ?? 'REGIONAL';
    const wafBlockedMetric = new Metric({
      namespace: 'AWS/WAFV2',
      metricName: 'BlockedRequests',
      dimensionsMap: { WebACL: wafMetricName, Region: wafMetricRegion },
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
      alarmDescription: 'Placeholder: API Gateway 5XX spikes (>=1 in 5m) ??tune later',
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

    // D1 SLO: /health stricter latency targets
    new Alarm(this, 'HealthLatencyP95Alarm', {
      metric: apiLatencyP95Health,
      threshold: 120,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
      alarmDescription: 'D1: /health latency p95 >= 120ms',
    });
    new Alarm(this, 'HealthLatencyP50Alarm', {
      metric: apiLatencyP50Health,
      threshold: 60,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
      alarmDescription: 'D1: /health latency p50 >= 60ms',
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

    // /health latency widgets (D1 SLO)
    dashboard.addWidgets(
      new GraphWidget({
        title: '/health Latency p95 (ms, 5m)',
        left: [apiLatencyP95Health],
        legendPosition: LegendPosition.RIGHT,
        width: 12,
      }),
      new GraphWidget({
        title: '/health Latency p50 (ms, 5m)',
        left: [apiLatencyP50Health],
        legendPosition: LegendPosition.RIGHT,
        width: 12,
      }),
    );

    

    // D14: Billing (placeholder) – alarms on EstimatedCharges (USD)
    const billingMetric = new Metric({
      namespace: 'AWS/Billing',
      metricName: 'EstimatedCharges',
      dimensionsMap: { Currency: 'USD' },
      period: Duration.hours(6),
      statistic: 'Maximum',
    });
    new Alarm(this, 'BillingSpikeAlarm', {
      metric: billingMetric,
      threshold: 50, // placeholder monthly budget
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Billing: Estimated charges over $50 (placeholder)',
    });

    // Cognito User Pool and Hosted UI setup
    const userPool = new UserPool(this, 'UserPool', {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      passwordPolicy: { minLength: 8, requireLowercase: true, requireUppercase: true, requireDigits: true },
      removalPolicy: RemovalPolicy.DESTROY, // change to RETAIN in prod
      // ABAC-ready: include tenantId as a custom attribute
      customAttributes: {
        tenantId: new StringAttribute({ mutable: true }),
      },
    });

    // Identity Providers (optional placeholders, require context vars)
    const googleClientId = coerceString(this.node.tryGetContext('googleClientId')) ?? coerceString(process.env.GOOGLE_CLIENT_ID);
    const googleClientSecret =
      coerceString(this.node.tryGetContext('googleClientSecret')) ?? coerceString(process.env.GOOGLE_CLIENT_SECRET);

    const identityProviders = [UserPoolClientIdentityProvider.COGNITO];
    let googleProvider: UserPoolIdentityProviderGoogle | undefined;
    if (googleClientId && googleClientSecret) {
      googleProvider = new UserPoolIdentityProviderGoogle(this, 'GoogleIdP', {
        clientId: googleClientId,
        clientSecretValue: SecretValue.unsafePlainText(googleClientSecret),
        userPool,
        attributeMapping: {
          email: ProviderAttribute.GOOGLE_EMAIL,
          givenName: ProviderAttribute.GOOGLE_GIVEN_NAME,
          familyName: ProviderAttribute.GOOGLE_FAMILY_NAME,
        },
        scopes: ['openid', 'profile', 'email'],
      });
      identityProviders.push(UserPoolClientIdentityProvider.GOOGLE);
    }

    // Note: GitHub is not a built-in Cognito IdP. Add via OIDC/SAML if applicable.

    const callbackUrls =
      coerceStringArray(this.node.tryGetContext('oauthCallbackUrls')) ??
      coerceStringArray(process.env.OAUTH_CALLBACK_URLS) ??
      ['https://example.com/api/auth/callback'];
    const logoutUrls =
      coerceStringArray(this.node.tryGetContext('oauthLogoutUrls')) ??
      coerceStringArray(process.env.OAUTH_LOGOUT_URLS) ??
      ['https://example.com'];
    // ABAC-ready: define resource server and scopes
    const scopeTenantRead = new ResourceServerScope({ scopeName: 'tenant.read', scopeDescription: 'Read tenant data' });
    const scopeTenantWrite = new ResourceServerScope({ scopeName: 'tenant.write', scopeDescription: 'Write tenant data' });
    const resourceServer = userPool.addResourceServer('ApiResourceServer', {
      identifier: `${resourcePrefix}-api`,
      userPoolResourceServerName: 'api',
      scopes: [scopeTenantRead, scopeTenantWrite],
    });

    const userPoolClient = new UserPoolClient(this, 'UserPoolClient', {
      userPool,
      generateSecret: false,
      oAuth: {
        callbackUrls,
        logoutUrls,
        scopes: [
          OAuthScope.OPENID,
          OAuthScope.EMAIL,
          OAuthScope.PROFILE,
          OAuthScope.resourceServer(resourceServer, scopeTenantRead),
          OAuthScope.resourceServer(resourceServer, scopeTenantWrite),
        ],
      },
      supportedIdentityProviders: identityProviders,
    });
    if (googleProvider) {
      userPoolClient.node.addDependency(googleProvider);
    }

    const domainPrefixInput =
      coerceString(process.env.COGNITO_DOMAIN_PREFIX) ?? coerceString(this.node.tryGetContext('cognitoDomainPrefix'));
    const fallbackDomain = `${resourcePrefix}-${Stack.of(this).stackName.toLowerCase()}`;
    const domainPrefix = (domainPrefixInput ?? fallbackDomain).toLowerCase();
    const userPoolDomain = new CfnUserPoolDomain(this, 'CognitoDomain', {
      domain: domainPrefix,
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
    new CfnOutput(this, 'TenantEndpoint', {
      value: api.urlForPath('/tenant'),
      description: 'POST /tenant endpoint (create/select tenant)',
    });
    new CfnOutput(this, 'InviteEndpoint', {
      value: api.urlForPath('/invite'),
      description: 'POST /invite endpoint (send magic link)',
    });
    new CfnOutput(this, 'GithubStartAuth', {
      value: api.urlForPath('/oauth/github/start'),
      description: 'GET start GitHub OAuth',
    });
    new CfnOutput(this, 'GithubCollectEndpoint', {
      value: api.urlForPath('/github/collect'),
      description: 'POST/GET GitHub events collect endpoint',
    });
    new CfnOutput(this, 'GithubSummaryEndpoint', {
      value: api.urlForPath('/github/summary'),
      description: 'GET GitHub weekly summary endpoint',
    });
    new CfnOutput(this, 'CalendarMeetingsEndpoint', {
      value: api.urlForPath('/calendar/meetings'),
      description: 'GET Calendar 1:1 detection endpoint',
    });
    new CfnOutput(this, 'CognitoHostedUiBase', {
      value: `https://${userPoolDomain.domain}.auth.${Stack.of(this).region}.amazoncognito.com`,
      description: 'Cognito Hosted UI base domain',
    });

    // D7: Step Functions GenerateBriefing
    const briefingsBucket = new Bucket(this, 'BriefingsBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      autoDeleteObjects: false,
      removalPolicy: RemovalPolicy.RETAIN,
      enforceSSL: true,
    });

    const briefingFn = new NodejsFunction(this, 'BriefingFunction', {
      entry: path.resolve(__dirname, '../../..', 'services/briefing-lambda/src/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_18_X,
      memorySize: 256,
      timeout: Duration.seconds(20),
      tracing: Tracing.ACTIVE,
      environment: {
        TABLE_NAME: table.tableName,
        BRIEFINGS_BUCKET: briefingsBucket.bucketName,
      },
      bundling: { externalModules: ['aws-sdk', '@aws-sdk/*'] },
    });
    table.grantReadWriteData(briefingFn);
    briefingsBucket.grantWrite(briefingFn);

    const dlq = new Queue(this, 'BriefingDLQ');

    const tLoad = new tasks.LambdaInvoke(this, 'LoadSummary', {
      lambdaFunction: briefingFn,
      payload: sfn.TaskInput.fromObject({ action: 'load_summary', tenantId: sfn.JsonPath.stringAt('$.tenantId'), userId: sfn.JsonPath.stringAt('$.userId') }),
      resultPath: '$.loaded',
    }).addRetry({ maxAttempts: 2, backoffRate: 2.0, interval: Duration.seconds(2) });

    const tBuild = new tasks.LambdaInvoke(this, 'BuildBriefing', {
      lambdaFunction: briefingFn,
      payload: sfn.TaskInput.fromObject({ action: 'build_briefing', tenantId: sfn.JsonPath.stringAt('$.tenantId'), userId: sfn.JsonPath.stringAt('$.userId'), meeting: sfn.JsonPath.objectAt('$.meeting'), summaryItems: sfn.JsonPath.listAt('$.loaded.Payload.summaryItems') }),
      resultPath: '$.built',
    }).addRetry({ maxAttempts: 2, backoffRate: 2.0, interval: Duration.seconds(2) });

    const tWrite = new tasks.LambdaInvoke(this, 'WriteOutput', {
      lambdaFunction: briefingFn,
      payload: sfn.TaskInput.fromObject({ action: 'write_output', tenantId: sfn.JsonPath.stringAt('$.tenantId'), userId: sfn.JsonPath.stringAt('$.userId'), meeting: sfn.JsonPath.objectAt('$.meeting'), briefing: sfn.JsonPath.objectAt('$.built.Payload.briefing') }),
      resultPath: '$.written',
    }).addRetry({ maxAttempts: 2, backoffRate: 2.0, interval: Duration.seconds(2) });

    const sendToDlq = new tasks.SqsSendMessage(this, 'SendToDLQ', {
      queue: dlq,
      messageBody: sfn.TaskInput.fromObject({ error: sfn.JsonPath.stringAt('$.Error'), cause: sfn.JsonPath.stringAt('$.Cause'), input: sfn.JsonPath.objectAt('$$.Execution.Input') }),
    });

    tLoad.addCatch(sendToDlq, { resultPath: '$.failure' });
    tBuild.addCatch(sendToDlq, { resultPath: '$.failure' });
    tWrite.addCatch(sendToDlq, { resultPath: '$.failure' });

    const definition = tLoad.next(tBuild).next(tWrite);
    const stateMachine = new sfn.StateMachine(this, 'GenerateBriefingMachine', {
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      timeout: Duration.minutes(2),
    });

    // API trigger Lambda to start execution
    const startFn = new NodejsFunction(this, 'BriefingStartFunction', {
      entry: path.resolve(__dirname, '../../..', 'services/briefing-lambda/src/start.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_18_X,
      memorySize: 128,
      timeout: Duration.seconds(10),
      tracing: Tracing.ACTIVE,
      environment: {
        STATE_MACHINE_ARN: stateMachine.stateMachineArn,
      },
      bundling: { externalModules: ['aws-sdk', '@aws-sdk/*'] },
    });
    stateMachine.grantStartExecution(startFn);

    const briefing = api.root.addResource('briefing');
    const generate = briefing.addResource('generate');
    generate.addMethod('POST', new LambdaIntegration(startFn));

    // D14: Observability for Step Functions SLO (avg 60s, p95 120s, ceiling 2m)
    const sfnExecTimeP95 = new Metric({
      namespace: 'AWS/States',
      metricName: 'ExecutionTime',
      dimensionsMap: { StateMachineArn: stateMachine.stateMachineArn },
      period: Duration.minutes(5),
      statistic: 'p95',
    });
    const sfnExecTimeAvg = new Metric({
      namespace: 'AWS/States',
      metricName: 'ExecutionTime',
      dimensionsMap: { StateMachineArn: stateMachine.stateMachineArn },
      period: Duration.minutes(5),
      statistic: 'Average',
    });
    const sfnExecTimeMax = new Metric({
      namespace: 'AWS/States',
      metricName: 'ExecutionTime',
      dimensionsMap: { StateMachineArn: stateMachine.stateMachineArn },
      period: Duration.minutes(5),
      statistic: 'Maximum',
    });
    const sfnFailed = new Metric({
      namespace: 'AWS/States',
      metricName: 'ExecutionsFailed',
      dimensionsMap: { StateMachineArn: stateMachine.stateMachineArn },
      period: Duration.minutes(5),
      statistic: 'sum',
    });

    new Alarm(this, 'SfnExecP95Alarm', {
      metric: sfnExecTimeP95,
      threshold: 120000, // 120s in ms
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
      alarmDescription: 'SLO: Briefing state machine p95 >= 120s',
    });
    new Alarm(this, 'SfnExecAvgAlarm', {
      metric: sfnExecTimeAvg,
      threshold: 60000, // 60s in ms
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
      alarmDescription: 'SLO: Briefing state machine avg >= 60s',
    });
    new Alarm(this, 'SfnExecMaxAlarm', {
      metric: sfnExecTimeMax,
      threshold: 120000, // ceiling 2m
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Ceiling: Briefing state machine max >= 120s',
    });
    new Alarm(this, 'SfnFailedAlarm', {
      metric: sfnFailed,
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Briefing state machine executions failed',
    });

    // D14: Step Functions widgets
    dashboard.addWidgets(
      new GraphWidget({ title: 'Briefing Exec Time p95 (ms, 5m)', left: [sfnExecTimeP95], width: 12, legendPosition: LegendPosition.RIGHT }),
      new GraphWidget({ title: 'Briefing Exec Time avg/max (ms, 5m)', left: [sfnExecTimeAvg, sfnExecTimeMax], width: 12, legendPosition: LegendPosition.RIGHT }),
    );
    dashboard.addWidgets(
      new GraphWidget({ title: 'Briefing Executions Failed (sum, 5m)', left: [sfnFailed], width: 12, legendPosition: LegendPosition.RIGHT }),
    );

    // Briefing API (list/get/note)
    const briefingApiFn = new NodejsFunction(this, 'BriefingApiFunction', {
      entry: path.resolve(__dirname, '../../..', 'services/briefing-lambda/src/api.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_18_X,
      memorySize: 256,
      timeout: Duration.seconds(15),
      tracing: Tracing.ACTIVE,
      environment: {
        TABLE_NAME: table.tableName,
        FEATURE_FLAGS: JSON.stringify({
          betaBanner: true,
          roadmap: true,
          trends: true,
          checklist: true,
          rollout: { tenantAllowlist: [(process.env.DEFAULT_TENANT ?? 't-demo')] },
        }),
      },
      bundling: { externalModules: ['aws-sdk', '@aws-sdk/*'] },
    });
    table.grantReadWriteData(briefingApiFn);
    briefingsBucket.grantRead(briefingApiFn);

    const list = briefing.addResource('list');
    list.addMethod('GET', new LambdaIntegration(briefingApiFn));
    const get = briefing.addResource('get');
    get.addMethod('GET', new LambdaIntegration(briefingApiFn));
    const note = briefing.addResource('note');
    note.addMethod('GET', new LambdaIntegration(briefingApiFn));
    note.addMethod('POST', new LambdaIntegration(briefingApiFn));

    const insights = api.root.addResource('insights');
    const checklist = insights.addResource('checklist');
    checklist.addMethod('GET', new LambdaIntegration(briefingApiFn));
    checklist.addMethod('POST', new LambdaIntegration(briefingApiFn));
    // D12: Weekly trends endpoint
    const trends = insights.addResource('trends');
    trends.addMethod('GET', new LambdaIntegration(briefingApiFn));

    // D15: Feature configuration endpoint
    const configRes = api.root.addResource('config');
    configRes.addMethod('GET', new LambdaIntegration(briefingApiFn));

    // D11: Roadmap routes
    const roadmap = api.root.addResource('roadmap');
    roadmap.addResource('list').addMethod('GET', new LambdaIntegration(briefingApiFn));
    roadmap.addResource('get').addMethod('GET', new LambdaIntegration(briefingApiFn));
    roadmap.addResource('save').addMethod('POST', new LambdaIntegration(briefingApiFn));
    roadmap.addResource('approve').addMethod('POST', new LambdaIntegration(briefingApiFn));
    roadmap.addResource('share').addMethod('POST', new LambdaIntegration(briefingApiFn));

    new CfnOutput(this, 'BriefingGenerateEndpoint', {
      value: api.urlForPath('/briefing/generate'),
      description: 'POST to start GenerateBriefing execution',
    });
    new CfnOutput(this, 'BriefingListEndpoint', {
      value: api.urlForPath('/briefing/list'),
      description: 'GET recent briefings',
    });

    // D9: Notification (SES/Slack) + T-1h alert via EventBridge
    const notifyFn = new NodejsFunction(this, 'NotifyFunction', {
      entry: path.resolve(__dirname, '../../..', 'services/notify-lambda/src/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_18_X,
      memorySize: 256,
      timeout: Duration.seconds(20),
      tracing: Tracing.ACTIVE,
      environment: {
        TABLE_NAME: table.tableName,
        FRONTEND_URL: `https://${distribution.distributionDomainName}`,
        SES_SENDER: process.env.SES_SENDER ?? '',
        DEFAULT_TENANT: process.env.DEFAULT_TENANT ?? 't-demo',
        DEFAULT_USER: process.env.DEFAULT_USER ?? 'u-demo',
        GOOGLE_ACCESS_TOKEN: process.env.GOOGLE_ACCESS_TOKEN ?? '', // demo only
        SLACK_WEBHOOK: process.env.SLACK_WEBHOOK ?? '',
      },
      bundling: { externalModules: ['aws-sdk', '@aws-sdk/*'] },
    });
    table.grantReadWriteData(notifyFn);
    notifyFn.addToRolePolicy(new PolicyStatement({ actions: ['ses:SendEmail', 'ses:SendRawEmail'], resources: ['*'] }));

    const notify = api.root.addResource('notify');
    const notifySettings = notify.addResource('settings');
    notifySettings.addMethod('GET', new LambdaIntegration(notifyFn));
    notifySettings.addMethod('POST', new LambdaIntegration(notifyFn));
    const notifyPreview = notify.addResource('preview');
    notifyPreview.addMethod('GET', new LambdaIntegration(notifyFn));

    // EventBridge schedule: every 5 minutes
    const rule = new (require('aws-cdk-lib/aws-events').Rule)(this, 'NotifyRule', {
      schedule: require('aws-cdk-lib/aws-events').Schedule.rate(Duration.minutes(5)),
    });
    const targets = require('aws-cdk-lib/aws-events-targets');
    rule.addTarget(new targets.LambdaFunction(notifyFn));

    new CfnOutput(this, 'NotifyPreviewEndpoint', {
      value: api.urlForPath('/notify/preview'),
      description: 'GET notification preview endpoint',
    });
  }
}


















