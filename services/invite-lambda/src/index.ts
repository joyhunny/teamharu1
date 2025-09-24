import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import crypto from 'crypto';

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);
const ses = new SESv2Client({});
const TABLE_NAME = process.env.TABLE_NAME as string;
const FRONTEND_URL = process.env.FRONTEND_URL as string | undefined;
const SES_SENDER = process.env.SES_SENDER as string | undefined;

function base64url(bytes: Buffer) {
  return bytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function handlePostInvite(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const body = event.body ? JSON.parse(event.body) : {};
  const email: string | undefined = body.email;
  const tenantId: string | undefined = body.tenantId;
  if (!email) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'email_required' }) };
  }

  const token = base64url(crypto.randomBytes(24));
  const now = Math.floor(Date.now() / 1000);
  const ttl = now + 60 * 60; // 1h

  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: `INVITE#${token}`,
        sk: 'PENDING',
        type: 'INVITE',
        email,
        tenantId: tenantId ?? null,
        status: 'PENDING',
        createdAt: new Date(now * 1000).toISOString(),
        ttl,
      },
      ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)'
    }),
  );

  const acceptUrl = FRONTEND_URL ? `${FRONTEND_URL}/invite/accept?token=${token}` : `${event.headers['x-forwarded-proto'] || 'https'}://${event.headers.host}/prod/invite/${token}`;

  if (SES_SENDER) {
    try {
      await ses.send(
        new SendEmailCommand({
          FromEmailAddress: SES_SENDER,
          Destination: { ToAddresses: [email] },
          Content: {
            Simple: {
              Subject: { Data: 'Your TeamHR magic link' },
              Body: {
                Text: { Data: `Click to get started: ${acceptUrl}\nThis link expires in 60 minutes.` },
                Html: { Data: `<p>Click to get started:</p><p><a href=\"${acceptUrl}\">${acceptUrl}</a></p><p>This link expires in 60 minutes.</p>` },
              },
            },
          },
        }),
      );
    } catch (e) {
      // Non-fatal for demo if SES not verified
      console.warn('SES send failed:', e);
    }
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true, token, acceptUrl }) };
}

async function handleGetInvite(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const token = event.pathParameters?.token;
  if (!token) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'token_required' }) };
  }
  const pk = `INVITE#${token}`;
  const res = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { pk, sk: 'PENDING' } }));
  const item = res.Item as any;
  if (!item) {
    return { statusCode: 404, body: JSON.stringify({ ok: false, error: 'not_found_or_used' }) };
  }

  // Mark as used
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk, sk: 'PENDING' },
      UpdateExpression: 'SET #status = :s, usedAt = :t',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':s': 'USED', ':t': new Date().toISOString() },
    }),
  );

  const redirect = FRONTEND_URL ? `${FRONTEND_URL}/onboarding?token=${token}` : undefined;
  if (redirect) {
    return { statusCode: 302, headers: { Location: redirect }, body: '' };
  }
  return { statusCode: 200, body: JSON.stringify({ ok: true, token }) };
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const method = event.requestContext.http.method;
  const route = event.requestContext.http.path || '';
  if (method === 'POST' && route.endsWith('/invite')) {
    return handlePostInvite(event);
  }
  if (method === 'GET' && /\/invite\//.test(route)) {
    return handleGetInvite(event);
  }
  return { statusCode: 404, body: JSON.stringify({ ok: false, error: 'not_found' }) };
};
