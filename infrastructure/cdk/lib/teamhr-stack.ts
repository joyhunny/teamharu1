import { Duration, RemovalPolicy, Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Bucket, BlockPublicAccess } from 'aws-cdk-lib/aws-s3';
import { OriginAccessIdentity, Distribution, ViewerProtocolPolicy, AllowedMethods, CachePolicy, ResponseHeadersPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { S3Origin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { CfnWebACL, CfnWebACLAssociation } from 'aws-cdk-lib/aws-wafv2';
import { RestApi, LambdaIntegration, Deployment, Stage } from 'aws-cdk-lib/aws-apigateway';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Table, AttributeType, BillingMode, RemovalPolicy as DynamoRemovalPolicy } from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { UserPool, UserPoolClient, OAuthScope, ProviderAttribute, UserPoolIdentityProviderGoogle, CfnUserPoolDomain } from 'aws-cdk-lib/aws-cognito';
import * as path from 'path';

export class TeamHRStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

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

    // WAFv2 Web ACL with AWS Managed Rules
    const webAcl = new CfnWebACL(this, 'WebWAF', {
      defaultAction: { allow: {} },
      scope: 'CLOUDFRONT',
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'TeamHRWebWAF',
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
      resourceArn: distribution.distributionArn,
      webAclArn: webAcl.attrArn,
    });

    // DynamoDB table (generic key schema pk/sk)
    const table = new Table(this, 'TeamHRTable', {
      partitionKey: { name: 'pk', type: AttributeType.STRING },
      sortKey: { name: 'sk', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: DynamoRemovalPolicy.DESTROY, // change to RETAIN in prod
    });

    // Health Lambda (Node.js)
    const healthFn = new NodejsFunction(this, 'HealthFunction', {
      entry: path.join(__dirname, '../../..', 'services/health-lambda/src/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_18_X,
      memorySize: 128,
      timeout: Duration.seconds(5),
      environment: {
        TABLE_NAME: table.tableName,
      },
    });
    table.grantReadData(healthFn);

    // API Gateway REST API with /health
    const api = new RestApi(this, 'TeamHRApi', {
      deploy: false, // we'll control stage for naming
    });
    const health = api.root.addResource('health');
    health.addMethod('GET', new LambdaIntegration(healthFn));

    const deployment = new Deployment(this, 'ApiDeployment', { api });
    const stage = new Stage(this, 'ProdStage', { deployment, stageName: 'prod' });
    api.deploymentStage = stage;

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

    const domainPrefix = this.node.tryGetContext('cognitoDomainPrefix') || `teamhr-${Stack.of(this).account}`;
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
      value: api.urlForPath('/', stage),
      description: 'API Gateway base URL',
    });
    new CfnOutput(this, 'HealthEndpoint', {
      value: api.urlForPath('/health', stage),
      description: 'GET /health endpoint',
    });
    new CfnOutput(this, 'CognitoHostedUiBase', {
      value: `https://${userPoolDomain.domain}.auth.${Stack.of(this).region}.amazoncognito.com`,
      description: 'Cognito Hosted UI base domain',
    });
  }
}
