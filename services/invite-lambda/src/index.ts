import { APIGatewayProxyEvent, APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
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

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'OPTIONS,POST',
  'content-type': 'application/json',
};

function base64url(bytes: Buffer) {
  return bytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function getHeader(event: any, name: string): string | undefined {
  const headers = event?.headers || {};
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) return headers[key];
  }
  return undefined;
}

function getMethod(event: any): string | undefined {
  return event?.requestContext?.http?.method || event?.httpMethod;
}

function getPath(event: any): string | undefined {
  return event?.requestContext?.http?.path || event?.path || event?.rawPath;
}

function getStage(event: any): string | undefined {
  return event?.requestContext?.stage;
}

function parseBody(event: APIGatewayProxyEventV2 | APIGatewayProxyEvent): any {
  const raw = (event as any).isBase64Encoded && event.body ? Buffer.from(event.body, 'base64').toString('utf-8') : (event.body || '');
  const ct = (getHeader(event, 'content-type') || '').toLowerCase();
  try {
    if (ct.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams(raw);
      return Object.fromEntries(params.entries());
    }
    if (raw && ct.includes('application/json')) {
      return JSON.parse(raw);
    }
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function jsonResponse(statusCode: number, body: Record<string, any>) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

async function handlePostInvite(event: APIGatewayProxyEventV2 | APIGatewayProxyEvent): Promise<APIGatewayProxyResultV2> {
  const body = parseBody(event);
  const email: string | undefined = (body.email || '').toString().trim();
  const tenantId: string | undefined = body.tenantId ? String(body.tenantId).trim() : undefined;
  const creatorEmail: string | undefined = body.creatorEmail ? String(body.creatorEmail).trim() : undefined;
  const creatorUserId: string | undefined = body.creatorUserId ? String(body.creatorUserId).trim() : undefined;
  const creatorName: string | undefined = body.creatorName ? String(body.creatorName).trim() : undefined;
  if (!email) {
    return jsonResponse(400, { ok: false, error: 'email_required' });
  }
  if (!tenantId) {
    return jsonResponse(400, { ok: false, error: 'tenant_required' });
  }

  const token = base64url(crypto.randomBytes(24));
  const nowMs = Date.now();
  const ttl = Math.floor(nowMs / 1000) + 60 * 60; // 1h

  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: `INVITE#${token}`,
        sk: 'PENDING',
        type: 'INVITE',
        email,
        tenantId,
        status: 'PENDING',
        createdAt: new Date(nowMs).toISOString(),
        creatorEmail: creatorEmail ?? null,
        creatorUserId: creatorUserId ?? null,
        creatorName: creatorName ?? null,
        ttl,
      },
      ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)'
    }),
  );

  const proto = getHeader(event, 'x-forwarded-proto') || 'https';
  const host = getHeader(event, 'host');
  const stage = getStage(event) || 'prod';
  const acceptUrl = FRONTEND_URL
    ? `${FRONTEND_URL}/invite/accept/index.html?token=${token}`
    : (host ? `${proto}://${host}/${stage}/invite/${token}` : `/invite/${token}`);

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
                Html: {
                  Data: `<p>Click to get started:</p><p><a href=\"${acceptUrl}\">${acceptUrl}</a></p><p>This link expires in 60 minutes.</p>`
                },
              },
            },
          },
        }),
      );
    } catch (e) {
      console.warn('SES send failed:', e);
    }
  }

  return jsonResponse(200, { ok: true, token, acceptUrl, tenantId });
}

async function handleGetInvite(event: APIGatewayProxyEventV2 | APIGatewayProxyEvent): Promise<APIGatewayProxyResultV2> {
  const token = event.pathParameters?.token;
  if (!token) {
    return jsonResponse(400, { ok: false, error: 'token_required' });
  }
  const pk = `INVITE#${token}`;
  const res = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { pk, sk: 'PENDING' } }));
  const item = res.Item as any;
  if (!item) {
    return jsonResponse(404, { ok: false, error: 'not_found_or_used' });
  }

  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk, sk: 'PENDING' },
      UpdateExpression: 'SET #status = :s, usedAt = :t',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':s': 'USED', ':t': new Date().toISOString() },
    }),
  );

  const redirect = FRONTEND_URL ? `${FRONTEND_URL}/onboarding/index.html?token=${token}` : undefined;
  if (redirect) {
    return {
      statusCode: 302,
      headers: {
        ...CORS_HEADERS,
        Location: redirect,
      },
      body: '',
    };
  }
  return jsonResponse(200, { ok: true, token });
}

export const handler = async (event: APIGatewayProxyEventV2 | APIGatewayProxyEvent): Promise<APIGatewayProxyResultV2> => {
  const method = (getMethod(event) || '').toUpperCase();
  if (method === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  const route = getPath(event) || '';
  if (method === 'POST' && /\/?invite$/.test(route)) {
    return handlePostInvite(event);
  }
  if (method === 'GET' && /\/invite\//.test(route)) {
    return handleGetInvite(event);
  }
  return jsonResponse(404, { ok: false, error: 'not_found' });
};
