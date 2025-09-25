import { APIGatewayProxyEvent, APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);
const TABLE_NAME = process.env.TABLE_NAME as string;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT',
  'content-type': 'application/json',
};

function getMethod(event: any): string | undefined {
  return event?.requestContext?.http?.method || event?.httpMethod;
}

function getPath(event: any): string | undefined {
  return event?.requestContext?.http?.path || event?.path || event?.rawPath;
}

function parseBody(event: APIGatewayProxyEventV2 | APIGatewayProxyEvent): any {
  const raw = (event as any).isBase64Encoded && event.body ? Buffer.from(event.body, 'base64').toString('utf-8') : (event.body || '');
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function randomSuffix(length = 4): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function normalizeTextArray(value: any): string[] | undefined {
  if (value === undefined) return undefined;
  if (value === null) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter((item) => item.length > 0);
  }
  const str = String(value).trim();
  if (!str) return [];
  return str
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function optionalString(value: any): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function response(statusCode: number, body: Record<string, any>) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

function sanitizeTeam(item: Record<string, any> | undefined | null) {
  if (!item) return null;
  const { pk, sk, ...rest } = item;
  return rest;
}

async function handleCreateTeam(event: APIGatewayProxyEventV2 | APIGatewayProxyEvent) {
  const body = parseBody(event) ?? {};
  const nameRaw: string = (body.name ?? body.teamName ?? '').toString().trim();
  const ownerUserId: string | undefined = body.ownerUserId ? String(body.ownerUserId).trim() : body.userId ? String(body.userId).trim() : undefined;
  const ownerEmail: string | undefined = body.ownerEmail ? String(body.ownerEmail).trim() : body.email ? String(body.email).trim() : undefined;
  const ownerName: string | undefined = body.ownerName ? String(body.ownerName).trim() : undefined;
  const goals: string[] | undefined = normalizeTextArray(body.goals);
  const techStack: string[] | undefined = normalizeTextArray(body.techStack ?? body.tech);

  if (!nameRaw) {
    return response(400, { ok: false, error: 'team_name_required' });
  }

  const baseSlug = slugify(nameRaw) || `team-${randomSuffix(6)}`;
  let requestedId = body.tenantId ? String(body.tenantId).trim().toLowerCase() : undefined;
  if (requestedId) {
    requestedId = slugify(requestedId);
  }

  const now = new Date().toISOString();
  const audit: Record<string, any> = {
    createdAt: now,
    updatedAt: now,
  };
  if (ownerUserId) audit.ownerUserId = ownerUserId;
  if (ownerEmail) audit.ownerEmail = ownerEmail.toLowerCase();
  if (ownerName) audit.ownerName = ownerName;

  const maxAttempts = 5;
  let attempt = 0;
  let finalTenantId = requestedId || baseSlug;
  let created = false;

  while (attempt < maxAttempts && !created) {
    const candidate = attempt === 0 ? finalTenantId : `${baseSlug}-${randomSuffix(4)}`;
    try {
      await ddb.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            pk: `TENANT#${candidate}`,
            sk: 'PROFILE',
            tenantId: candidate,
            name: nameRaw,
            slug: candidate,
            goals: goals ?? [],
            techStack: techStack ?? [],
            onboardingStage: 'created',
            ...audit,
          },
          ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)',
        }),
      );
      finalTenantId = candidate;
      created = true;
    } catch (err: any) {
      if (err?.code === 'ConditionalCheckFailedException') {
        attempt += 1;
        continue;
      }
      throw err;
    }
  }

  if (!created) {
    return response(409, { ok: false, error: 'tenant_conflict' });
  }

  if (ownerUserId || ownerEmail) {
    try {
      await ddb.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            pk: `TENANT#${finalTenantId}#USER#${ownerUserId ?? ownerEmail ?? 'owner'}`,
            sk: 'PROFILE',
            tenantId: finalTenantId,
            userId: ownerUserId ?? null,
            email: ownerEmail ? ownerEmail.toLowerCase() : null,
            role: 'owner',
            ...audit,
          },
          ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)',
        }),
      );
    } catch (err: any) {
      if (err?.code !== 'ConditionalCheckFailedException') {
        throw err;
      }
    }
  }

  return response(200, {
    ok: true,
    tenantId: finalTenantId,
    name: nameRaw,
    goals: goals ?? [],
    techStack: techStack ?? [],
    ownerUserId: ownerUserId ?? null,
    ownerEmail: ownerEmail ? ownerEmail.toLowerCase() : null,
  });
}

async function handleGetTeam(event: APIGatewayProxyEventV2 | APIGatewayProxyEvent) {
  const rawId = event.pathParameters?.tenantId || '';
  const tenantId = slugify(rawId);
  if (!tenantId) {
    return response(400, { ok: false, error: 'tenant_id_required' });
  }
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: `TENANT#${tenantId}`, sk: 'PROFILE' },
    }),
  );
  const team = sanitizeTeam(res.Item as Record<string, any> | undefined);
  if (!team) {
    return response(404, { ok: false, error: 'team_not_found' });
  }
  return response(200, { ok: true, team });
}

async function handleUpdateTeam(event: APIGatewayProxyEventV2 | APIGatewayProxyEvent) {
  const rawId = event.pathParameters?.tenantId || '';
  const tenantId = slugify(rawId);
  if (!tenantId) {
    return response(400, { ok: false, error: 'tenant_id_required' });
  }
  const body = parseBody(event) ?? {};
  const mission = optionalString(body.mission ?? body.teamMission ?? body.vision);
  const primaryMetric = optionalString(body.primaryMetric ?? body.focusMetric ?? body.successMetric);
  const headline = optionalString(body.headline ?? body.tagline ?? body.story);
  const calendarEmail = optionalString(body.calendarEmail ?? body.primaryCalendarEmail ?? body.calendarUser);
  const githubOrg = optionalString(body.githubOrg);
  const githubRepo = optionalString(body.githubRepo);
  const onboardingStage = optionalString(body.onboardingStage);
  const onboardingCompleted = typeof body.onboardingCompleted === 'boolean' ? body.onboardingCompleted : undefined;
  const goals = normalizeTextArray(body.goals ?? body.objectives ?? body.okrs);
  const techStack = normalizeTextArray(body.techStack ?? body.tech ?? body.stack);

  const now = new Date().toISOString();
  const sets: string[] = ['#updatedAt = :updatedAt'];
  const names: Record<string, string> = { '#updatedAt': 'updatedAt' };
  const values: Record<string, any> = { ':updatedAt': now };

  if (mission !== undefined) {
    names['#mission'] = 'mission';
    values[':mission'] = mission;
    sets.push('#mission = :mission');
  }
  if (primaryMetric !== undefined) {
    names['#primaryMetric'] = 'primaryMetric';
    values[':primaryMetric'] = primaryMetric;
    sets.push('#primaryMetric = :primaryMetric');
  }
  if (headline !== undefined) {
    names['#headline'] = 'headline';
    values[':headline'] = headline;
    sets.push('#headline = :headline');
  }
  if (calendarEmail !== undefined) {
    names['#calendarEmail'] = 'calendarEmail';
    values[':calendarEmail'] = calendarEmail ? calendarEmail.toLowerCase() : null;
    sets.push('#calendarEmail = :calendarEmail');
  }
  if (githubOrg !== undefined) {
    names['#githubOrg'] = 'githubOrg';
    values[':githubOrg'] = githubOrg;
    sets.push('#githubOrg = :githubOrg');
  }
  if (githubRepo !== undefined) {
    names['#githubRepo'] = 'githubRepo';
    values[':githubRepo'] = githubRepo;
    sets.push('#githubRepo = :githubRepo');
  }
  if (onboardingStage !== undefined) {
    names['#onboardingStage'] = 'onboardingStage';
    values[':onboardingStage'] = onboardingStage;
    sets.push('#onboardingStage = :onboardingStage');
  }
  if (onboardingCompleted !== undefined) {
    names['#onboardingCompleted'] = 'onboardingCompleted';
    values[':onboardingCompleted'] = onboardingCompleted;
    sets.push('#onboardingCompleted = :onboardingCompleted');
  }
  if (goals !== undefined) {
    names['#goals'] = 'goals';
    values[':goals'] = goals;
    sets.push('#goals = :goals');
  }
  if (techStack !== undefined) {
    names['#techStack'] = 'techStack';
    values[':techStack'] = techStack;
    sets.push('#techStack = :techStack');
  }

  if (sets.length <= 1) {
    return response(400, { ok: false, error: 'no_fields_to_update' });
  }

  try {
    const updated = await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { pk: `TENANT#${tenantId}`, sk: 'PROFILE' },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
        ReturnValues: 'ALL_NEW',
      }),
    );
    const team = sanitizeTeam(updated.Attributes as Record<string, any> | undefined);
    return response(200, { ok: true, team });
  } catch (err: any) {
    if (err?.code === 'ConditionalCheckFailedException') {
      return response(404, { ok: false, error: 'team_not_found' });
    }
    console.error('team-update-error', err);
    return response(500, { ok: false, error: 'internal_error' });
  }
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

  const rawPath = getPath(event) || '';
  const normalizedPath = rawPath.replace(/\/+$/, '').toLowerCase();

  if (method === 'GET' && /\/v1\/teams\//.test(normalizedPath)) {
    return handleGetTeam(event);
  }
  if (method === 'PUT' && /\/v1\/teams\//.test(normalizedPath)) {
    return handleUpdateTeam(event);
  }
  if (method === 'POST') {
    return handleCreateTeam(event);
  }

  return response(405, { ok: false, error: 'method_not_allowed' });
};
