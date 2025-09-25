import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const TABLE_NAME = process.env.TABLE_NAME as string;
const DEFAULT_TENANT = (process.env.DEFAULT_TENANT || 't-demo').toLowerCase();
const DEFAULT_USER = (process.env.DEFAULT_USER || 'u-demo').toLowerCase();

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,PUT',
};

function json(status: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode: status, headers: { ...CORS_HEADERS, 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

function getMethod(event: APIGatewayProxyEventV2): string {
  return (event as any)?.requestContext?.http?.method || (event as any).httpMethod || '';
}

function getPath(event: APIGatewayProxyEventV2): string {
  return (event as any)?.requestContext?.http?.path || (event as any).path || '';
}

function slugify(value: string | undefined): string {
  if (value === undefined || value === null) return '';
  const normalized = value.toString().trim();
  if (!normalized) return '';
  return normalized
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeStringArray(input: any): string[] | undefined {
  if (input === undefined) return undefined;
  if (input === null) return [];
  if (Array.isArray(input)) {
    return input
      .map((item) => (item === undefined || item === null ? '' : String(item).trim()))
      .filter((item) => item.length > 0);
  }
  const str = String(input).trim();
  if (!str) return [];
  return str
    .split(/[\r\n,]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function extractMemberIdFromPath(path: string): string | null {
  if (!path) return null;
  const segments = path.split('/').filter(Boolean);
  const idxMember = segments.lastIndexOf('members');
  if (idxMember >= 0 && segments[idxMember + 1]) {
    const candidate = segments[idxMember + 1];
    if (candidate === 'index.html') {
      return null;
    }
    return candidate;
  }
  return null;
}

async function streamToString(stream: any): Promise<string> {
  if (stream && typeof stream.transformToString === 'function') return stream.transformToString();
  return await new Promise<string>((resolve, reject) => {
    const chunks: any[] = [];
    (stream as Readable)
      .on('data', (chunk) => chunks.push(chunk))
      .on('error', (err) => reject(err))
      .on('end', () => resolve(Buffer.concat(chunks as any).toString('utf-8')));
  });
}

async function listBriefings(event: APIGatewayProxyEventV2) {
  const qs = event.queryStringParameters || {};
  const tenantId = qs.tenantId || 't-demo';
  const userId = qs.userId || 'u-demo';
  const limit = Math.min(parseInt(qs.limit || '10', 10) || 10, 50);
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
      ExpressionAttributeValues: { ':pk': `TENANT#${tenantId}#USER#${userId}`, ':sk': 'BRIEFING#' },
      ScanIndexForward: false,
      Limit: limit,
    }) as any,
  );
  return json(200, { ok: true, items: res.Items || [] });
}

async function getBriefing(event: APIGatewayProxyEventV2) {
  const qs = event.queryStringParameters || {};
  const tenantId = qs.tenantId || 't-demo';
  const userId = qs.userId || 'u-demo';
  const sk = qs.sk; // BRIEFING#...
  if (!sk) return json(400, { ok: false, error: 'sk_required' });
  const ddbRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { pk: `TENANT#${tenantId}#USER#${userId}`, sk } }));
  const item = ddbRes.Item as any;
  if (!item) return json(404, { ok: false, error: 'not_found' });
  const bucket = item.bucket as string;
  const key = item.s3key as string;
  if (!bucket || !key) return json(500, { ok: false, error: 'missing_artifact_link' });
  const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const text = await streamToString(obj.Body as any);
  const payload = JSON.parse(text);
  return json(200, { ok: true, item, payload });
}

async function getNote(event: APIGatewayProxyEventV2) {
  const qs = event.queryStringParameters || {};
  const tenantId = qs.tenantId || 't-demo';
  const userId = qs.userId || 'u-demo';
  const sk = qs.sk; // BRIEFING#...
  if (!sk) return json(400, { ok: false, error: 'sk_required' });
  const noteKey = `NOTE#${sk}`;
  const res = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { pk: `TENANT#${tenantId}#USER#${userId}`, sk: noteKey } }));
  return json(200, { ok: true, note: res.Item?.note || '' });
}

async function saveNote(event: APIGatewayProxyEventV2) {
  const body = event.body ? JSON.parse(event.body) : {};
  const tenantId = body.tenantId || 't-demo';
  const userId = body.userId || 'u-demo';
  const sk = body.sk; // BRIEFING#...
  const note = body.note ?? '';
  if (!sk) return json(400, { ok: false, error: 'sk_required' });
  const noteKey = `NOTE#${sk}`;
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: `TENANT#${tenantId}#USER#${userId}`,
        sk: noteKey,
        note,
        updatedAt: new Date().toISOString(),
      },
    }),
  );
  return json(200, { ok: true });
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const method = getMethod(event);
  const path = getPath(event);
  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }
  if (method === 'GET' && path.includes('/members/') && !path.endsWith('/roadmap')) return getMemberProfile(event);
  if (method === 'PUT' && path.includes('/members/') && path.endsWith('/roadmap')) return saveMemberRoadmap(event);
  if (method === 'GET' && path.endsWith('/team/settings')) return getTeamSettings(event);
  if (method === 'PUT' && path.endsWith('/team/settings')) return updateTeamSettings(event);
  if (method === 'GET' && path.endsWith('/briefing/list')) return listBriefings(event);
  if (method === 'GET' && path.endsWith('/briefing/get')) return getBriefing(event);
  if (method === 'GET' && path.endsWith('/briefing/note')) return getNote(event);
  if (method === 'POST' && path.endsWith('/briefing/note')) return saveNote(event);
  if (method === 'GET' && path.endsWith('/config')) return getConfig(event);
  if (method === 'GET' && path.endsWith('/insights/checklist')) return getChecklist(event);
  if (method === 'GET' && path.endsWith('/insights/trends')) return getWeeklyTrends(event);
  if (method === 'POST' && path.endsWith('/insights/checklist')) return saveChecklist(event);
  if (method === 'GET' && path.endsWith('/auth/login')) return redirectToHostedUi(event);
  if (method === 'GET' && path.endsWith('/roadmap/list')) return listRoadmaps(event);
  if (method === 'GET' && path.endsWith('/roadmap/get')) return getRoadmap(event);
  if (method === 'POST' && path.endsWith('/roadmap/save')) return saveRoadmap(event);
  if (method === 'POST' && path.endsWith('/roadmap/approve')) return approveRoadmap(event);
  if (method === 'POST' && path.endsWith('/roadmap/share')) return shareRoadmap(event);
  return json(404, { ok: false, error: 'not_found' });
};

async function getChecklist(event: APIGatewayProxyEventV2) {
  const qs = event.queryStringParameters || {};
  const tenantId = qs.tenantId || 't-demo';
  const userId = qs.userId || 'u-demo';
  const day = qs.day || new Date().toISOString().slice(0, 10);
  const key = `CHECKLIST#${day}`;
  const res = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { pk: `TENANT#${tenantId}#USER#${userId}`, sk: key } }));
  const defaults = {
    items: [
      { id: 'review-summary', title: '지난 주 요약 확인', done: false },
      { id: 'okr-status', title: 'OKR/태스크 상태 업데이트', done: false },
      { id: 'agenda', title: '오늘 1:1 아젠다 공유', done: false },
    ],
    updatedAt: null,
  };
  const item = (res.Item as any) || { ...defaults, day };
  return json(200, { ok: true, day, checklist: item.items || defaults.items });
}

async function saveChecklist(event: APIGatewayProxyEventV2) {
  const body = event.body ? JSON.parse(event.body) : {};
  const tenantId = body.tenantId || 't-demo';
  const userId = body.userId || 'u-demo';
  const day = body.day || new Date().toISOString().slice(0, 10);
  const items = Array.isArray(body.items) ? body.items : [];
  const key = `CHECKLIST#${day}`;
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: `TENANT#${tenantId}#USER#${userId}`,
        sk: key,
        items,
        updatedAt: new Date().toISOString(),
      },
    }),
  );
  return json(200, { ok: true });
}

// Hosted UI login redirect
async function redirectToHostedUi(event: APIGatewayProxyEventV2) {
  const base = process.env.COGNITO_HOSTED_UI_BASE || '';
  const clientId = process.env.COGNITO_CLIENT_ID || '';
  const redirect = process.env.OAUTH_REDIRECT_URI || '';
  const scope = encodeURIComponent('openid email profile');
  if (!base || !clientId || !redirect) {
    return json(500, { ok: false, error: 'hosted_ui_not_configured' });
  }
  const url = `${base.replace(/\/$/, '')}/login?client_id=${encodeURIComponent(clientId)}&response_type=code&scope=${scope}&redirect_uri=${encodeURIComponent(redirect)}`;
  return { statusCode: 302, headers: { Location: url }, body: '' } as any;
}

// Feature flags / Release config (D15)
async function getConfig(event: APIGatewayProxyEventV2) {
  const qs = event.queryStringParameters || {};
  const tenantId = qs.tenantId || 't-demo';
  let flags: any = {};
  try { flags = JSON.parse(process.env.FEATURE_FLAGS || '{}'); } catch {}
  const allow = Array.isArray(flags?.rollout?.tenantAllowlist) ? flags.rollout.tenantAllowlist : [];
  const enabledForTenant = allow.length === 0 || allow.includes(tenantId);
  return json(200, { ok: true, flags: { ...flags, enabledForTenant } });
}

// Weekly Trends (D12)
async function getWeeklyTrends(event: APIGatewayProxyEventV2) {
  const qs = event.queryStringParameters || {};
  const tenantId = qs.tenantId || 't-demo';
  const userId = qs.userId || 'u-demo';

  // Use ISO year-week key for caching (e.g., 2025-W38)
  const now = new Date();
  const firstJan = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor(((now as any) - (firstJan as any)) / 86400000);
  const week = Math.ceil((days + firstJan.getDay() + 1) / 7);
  const weekKey = `${now.getFullYear()}-W${String(week).padStart(2, '0')}`;
  const cacheSk = `INSIGHT#TRENDS#${weekKey}`;

  // Try cache
  const cached = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { pk: `TENANT#${tenantId}#USER#${userId}`, sk: cacheSk } }));
  if ((cached.Item as any)?.cards) {
    return json(200, { ok: true, week: weekKey, source: 'cache', cards: (cached.Item as any).cards });
  }

  // Query latest GitHub summaries as seed data
  const { QueryCommand } = await import('@aws-sdk/lib-dynamodb');
  const summariesRes = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
      ExpressionAttributeValues: { ':pk': `TENANT#${tenantId}#USER#${userId}`, ':sk': 'GITHUB#SUMMARY#' },
      ScanIndexForward: false,
      Limit: 10,
    }) as any,
  );
  const items = (summariesRes.Items || []) as any[];
  const latest = items[0]?.metrics || {};
  const prev = items[1]?.metrics || {};

  const pct = (a: number, b: number) => {
    if (!b && !a) return 0;
    if (!b) return 100;
    return Math.round(((a - b) / Math.max(1, b)) * 100);
  };

  const contributionsNow = Number(latest.contributions || 0);
  const contributionsPrev = Number(prev.contributions || 0);
  const collabNow = Number(latest.collaboration || 0);
  const collabPrev = Number(prev.collaboration || 0);
  const complexityNow = Number(latest.complexity || 0);
  const complexityPrev = Number(prev.complexity || 0);

  const cards = [
    {
      id: 'trend-contrib',
      title: 'Contribution Momentum',
      value: contributionsNow,
      deltaPct: pct(contributionsNow, contributionsPrev),
      insight: contributionsNow >= contributionsPrev ? 'Throughput up — keep PR cadence.' : 'Throughput dipped — time-block deep work.',
    },
    {
      id: 'trend-collab',
      title: 'Collaboration Pulse',
      value: collabNow,
      deltaPct: pct(collabNow, collabPrev),
      insight: collabNow >= collabPrev ? 'More reviews/discussions — good signal.' : 'Engagement down — prompt async feedback.',
    },
    {
      id: 'trend-complexity',
      title: 'Work Complexity',
      value: complexityNow,
      deltaPct: pct(complexityNow, complexityPrev),
      insight: complexityNow > complexityPrev ? 'Complexity rising — split PRs, add context.' : 'Stable complexity — maintain flow.',
    },
  ];

  // Cache with TTL (7 days)
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: `TENANT#${tenantId}#USER#${userId}`,
        sk: cacheSk,
        type: 'INSIGHT_TRENDS_WEEKLY',
        week: weekKey,
        cards,
        createdAt: new Date().toISOString(),
        ttl: Math.floor((Date.now() + 7 * 24 * 3600 * 1000) / 1000),
      },
    }),
  );

  return json(200, { ok: true, week: weekKey, source: 'computed', cards });
}

// Roadmap APIs
async function listRoadmaps(event: APIGatewayProxyEventV2) {
  const qs = event.queryStringParameters || {};
  const tenantId = qs.tenantId || 't-demo';
  const userId = qs.userId || 'u-demo';
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
    ExpressionAttributeValues: { ':pk': `TENANT#${tenantId}#USER#${userId}`, ':sk': 'ROADMAP#' },
    ScanIndexForward: false,
    Limit: 20,
  }) as any);
  return json(200, { ok: true, items: res.Items || [] });
}

async function getRoadmap(event: APIGatewayProxyEventV2) {
  const qs = event.queryStringParameters || {};
  const tenantId = qs.tenantId || 't-demo';
  const userId = qs.userId || 'u-demo';
  const rid = qs.rid as string;
  if (!rid) return json(400, { ok: false, error: 'rid_required' });
  const sk = `ROADMAP#${rid}`;
  const res = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { pk: `TENANT#${tenantId}#USER#${userId}`, sk } }));
  return json(200, { ok: true, item: res.Item || null });
}

async function saveRoadmap(event: APIGatewayProxyEventV2) {
  const body = event.body ? JSON.parse(event.body) : {};
  const tenantId = body.tenantId || 't-demo';
  const userId = body.userId || 'u-demo';
  const rid = body.rid || `r-${Date.now()}`;
  const title = body.title || 'Personal Roadmap';
  const goals = Array.isArray(body.goals) ? body.goals : [];
  const status = (body.status as string) || 'DRAFT';
  const now = new Date().toISOString();
  await ddb.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      pk: `TENANT#${tenantId}#USER#${userId}`,
      sk: `ROADMAP#${rid}`,
      rid,
      title,
      goals,
      status,
      updatedAt: now,
      createdAt: body.createdAt || now,
    },
  }));
  return json(200, { ok: true, rid });
}

async function approveRoadmap(event: APIGatewayProxyEventV2) {
  const body = event.body ? JSON.parse(event.body) : {};
  const tenantId = body.tenantId || 't-demo';
  const userId = body.userId || 'u-demo';
  const rid = body.rid as string;
  if (!rid) return json(400, { ok: false, error: 'rid_required' });
  const sk = `ROADMAP#${rid}`;
  const now = new Date().toISOString();
  await ddb.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      pk: `TENANT#${tenantId}#USER#${userId}`,
      sk,
      rid,
      status: 'APPROVED',
      updatedAt: now,
    },
  }));
  return json(200, { ok: true });
}

async function shareRoadmap(event: APIGatewayProxyEventV2) {
  const body = event.body ? JSON.parse(event.body) : {};
  const rid = body.rid || 'r-unknown';
  // For demo, just return a stub link to the detail page
  const link = `/roadmap/edit?rid=${encodeURIComponent(rid)}`;
  return json(200, { ok: true, link });
}

async function fetchBriefingsForMember(tenantId: string, userId: string, limit: number) {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
      ExpressionAttributeValues: {
        ':pk': `TENANT#${tenantId}#USER#${userId}`,
        ':sk': 'BRIEFING#',
      },
      ScanIndexForward: false,
      Limit: limit,
    }) as any,
  );
  const items = (res.Items || []) as Record<string, any>[];
  return items.map((item) => ({
    sk: item.sk,
    createdAt: item.createdAt || item.generatedAt || null,
    meeting: item.meeting || null,
    meetingTitle: item.meeting?.title || item.title || null,
    bucket: item.bucket,
    s3key: item.s3key,
  }));
}

async function fetchRoadmapsForMember(tenantId: string, userId: string) {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
      ExpressionAttributeValues: {
        ':pk': `TENANT#${tenantId}#USER#${userId}`,
        ':sk': 'ROADMAP#',
      },
      ScanIndexForward: false,
      Limit: 50,
    }) as any,
  );
  const items = (res.Items || []) as Record<string, any>[];
  return items.map((item) => ({
    rid: item.rid || item.sk?.replace('ROADMAP#', ''),
    title: item.title || 'Personal Roadmap',
    goals: Array.isArray(item.goals) ? item.goals : [],
    status: item.status || 'DRAFT',
    updatedAt: item.updatedAt || null,
    createdAt: item.createdAt || null,
  }));
}

async function fetchGithubSummaryForMember(tenantId: string, userId: string) {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
      ExpressionAttributeValues: {
        ':pk': `TENANT#${tenantId}#USER#${userId}`,
        ':sk': 'GITHUB#SUMMARY#',
      },
      ScanIndexForward: false,
      Limit: 1,
    }) as any,
  );
  const item = ((res.Items || []) as Record<string, any>[])[0];
  if (!item) return null;
  return {
    narrative: item.narrative || '',
    counts: item.counts || {},
    metrics: item.metrics || {},
    createdAt: item.createdAt || item.generatedAt || null,
  };
}

async function fetchNotifySettings(tenantId: string, userId: string) {
  const res = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { pk: `TENANT#${tenantId}#USER#${userId}`, sk: 'NOTIFY#SETTINGS' } }),
  );
  const item = (res.Item as Record<string, any>) || {};
  return {
    sesEnabled: !!item.sesEnabled,
    slackEnabled: !!item.slackEnabled,
    slackWebhook: item.slackWebhook || '',
    email: item.email || '',
    updatedAt: item.updatedAt || null,
  };
}

async function saveNotificationSettings(tenantId: string, userId: string, settings: { sesEnabled?: boolean; slackEnabled?: boolean; slackWebhook?: string; email?: string }) {
  const cleaned: Record<string, any> = {
    pk: `TENANT#${tenantId}#USER#${userId}`,
    sk: 'NOTIFY#SETTINGS',
    sesEnabled: !!settings.sesEnabled,
    slackEnabled: !!settings.slackEnabled,
    updatedAt: new Date().toISOString(),
  };
  if (settings.slackWebhook !== undefined) {
    cleaned.slackWebhook = settings.slackWebhook ? String(settings.slackWebhook).trim() : '';
  }
  if (settings.email !== undefined) {
    cleaned.email = settings.email ? String(settings.email).trim() : '';
  }
  await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: cleaned }));
}

async function fetchTeamProfileRecord(tenantId: string) {
  const res = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { pk: `TENANT#${tenantId}`, sk: 'PROFILE' } }),
  );
  const item = res.Item as Record<string, any> | undefined;
  if (!item) return null;
  const { pk, sk, ttl, ...rest } = item;
  return rest;
}

async function getMemberProfile(event: APIGatewayProxyEventV2) {
  if (!TABLE_NAME) return json(500, { ok: false, error: 'table_not_configured' });
  const path = getPath(event);
  const memberRaw = extractMemberIdFromPath(path);
  if (!memberRaw) return json(400, { ok: false, error: 'member_id_required' });
  const qs = event.queryStringParameters || {};
  const tenantId = slugify(qs.tenantId) || DEFAULT_TENANT;
  const memberId = slugify(memberRaw) || DEFAULT_USER;
  const limit = Math.min(parseInt(qs.briefingLimit || '5', 10) || 5, 20);
  try {
    const [briefings, roadmaps, github, notify, team] = await Promise.all([
      fetchBriefingsForMember(tenantId, memberId, limit),
      fetchRoadmapsForMember(tenantId, memberId),
      fetchGithubSummaryForMember(tenantId, memberId),
      fetchNotifySettings(tenantId, memberId),
      fetchTeamProfileRecord(tenantId),
    ]);
    const displayName = team?.ownerName && slugify(team.ownerName) === memberId ? team.ownerName : memberId;
    return json(200, {
      ok: true,
      tenantId,
      memberId,
      profile: {
        displayName,
        email: team?.ownerEmail || '',
      },
      briefings: { items: briefings },
      roadmap: { items: roadmaps },
      github,
      notifications: notify,
    });
  } catch (err) {
    console.error('member-profile-error', err);
    return json(500, { ok: false, error: 'member_profile_failed' });
  }
}

async function saveMemberRoadmap(event: APIGatewayProxyEventV2) {
  if (!TABLE_NAME) return json(500, { ok: false, error: 'table_not_configured' });
  const path = getPath(event);
  const memberRaw = extractMemberIdFromPath(path);
  if (!memberRaw) return json(400, { ok: false, error: 'member_id_required' });
  const qs = event.queryStringParameters || {};
  const body = event.body ? JSON.parse(event.body) : {};
  const tenantId = slugify(body.tenantId || qs.tenantId) || DEFAULT_TENANT;
  const memberId = slugify(memberRaw) || DEFAULT_USER;
  const ridInput = body.rid ? String(body.rid).trim() : '';
  const rid = ridInput || `r-${Date.now()}`;
  const goalsNormalized = normalizeStringArray(body.goals);
  const now = new Date().toISOString();
  const item: Record<string, any> = {
    pk: `TENANT#${tenantId}#USER#${memberId}`,
    sk: `ROADMAP#${rid}`,
    rid,
    title: body.title ? String(body.title).trim() : 'Personal Roadmap',
    goals: goalsNormalized ?? [],
    status: (body.status && String(body.status).trim().toUpperCase()) || 'DRAFT',
    updatedAt: now,
    createdAt: body.createdAt || now,
  };
  const putParams: Record<string, any> = { TableName: TABLE_NAME, Item: item };
  if (body.expectedUpdatedAt) {
    putParams.ConditionExpression = 'attribute_not_exists(updatedAt) OR updatedAt = :expected';
    putParams.ExpressionAttributeValues = { ':expected': body.expectedUpdatedAt };
  }
  await ddb.send(new PutCommand(putParams));
  return json(200, { ok: true, rid, updatedAt: now });
}

async function getTeamSettings(event: APIGatewayProxyEventV2) {
  if (!TABLE_NAME) return json(500, { ok: false, error: 'table_not_configured' });
  const qs = event.queryStringParameters || {};
  const tenantId = slugify(qs.tenantId) || DEFAULT_TENANT;
  const ownerUser = slugify(qs.userId) || DEFAULT_USER;
  try {
    const [team, notify] = await Promise.all([
      fetchTeamProfileRecord(tenantId),
      fetchNotifySettings(tenantId, ownerUser),
    ]);
    return json(200, {
      ok: true,
      tenantId,
      settings: {
        mission: team?.mission || '',
        primaryMetric: team?.primaryMetric || '',
        goals: Array.isArray(team?.goals) ? team?.goals : [],
        techStack: Array.isArray(team?.techStack) ? team?.techStack : [],
        headline: team?.headline || '',
        onboardingStage: team?.onboardingStage || '',
        onboardingCompleted: !!team?.onboardingCompleted,
      },
      notifications: notify,
    });
  } catch (err) {
    console.error('team-settings-fetch-error', err);
    return json(500, { ok: false, error: 'team_settings_failed' });
  }
}

async function updateTeamSettings(event: APIGatewayProxyEventV2) {
  if (!TABLE_NAME) return json(500, { ok: false, error: 'table_not_configured' });
  const body = event.body ? JSON.parse(event.body) : {};
  const tenantId = slugify(body.tenantId || event.queryStringParameters?.tenantId) || DEFAULT_TENANT;
  const now = new Date().toISOString();
  const mission = body.mission !== undefined ? (body.mission === null ? null : String(body.mission).trim()) : undefined;
  const primaryMetric = body.primaryMetric !== undefined ? (body.primaryMetric === null ? null : String(body.primaryMetric).trim()) : undefined;
  const headline = body.headline !== undefined ? (body.headline === null ? null : String(body.headline).trim()) : undefined;
  const goals = normalizeStringArray(body.goals);
  const techStack = normalizeStringArray(body.techStack);
  const onboardingStage = body.onboardingStage !== undefined ? (body.onboardingStage === null ? null : String(body.onboardingStage).trim()) : undefined;
  const onboardingCompleted = body.onboardingCompleted !== undefined ? !!body.onboardingCompleted : undefined;

  const names: Record<string, string> = { '#updatedAt': 'updatedAt' };
  const values: Record<string, any> = { ':updatedAt': now };
  const sets: string[] = ['#updatedAt = :updatedAt'];

  const addSet = (field: string, value: any) => {
    const nameKey = `#${field}`;
    const valueKey = `:${field}`;
    names[nameKey] = field;
    values[valueKey] = value;
    sets.push(`${nameKey} = ${valueKey}`);
  };

  if (mission !== undefined) addSet('mission', mission);
  if (primaryMetric !== undefined) addSet('primaryMetric', primaryMetric);
  if (headline !== undefined) addSet('headline', headline);
  if (goals !== undefined) addSet('goals', goals);
  if (techStack !== undefined) addSet('techStack', techStack);
  if (onboardingStage !== undefined) addSet('onboardingStage', onboardingStage);
  if (onboardingCompleted !== undefined) addSet('onboardingCompleted', onboardingCompleted);

  if (sets.length === 1 && !body.notifications) {
    return json(400, { ok: false, error: 'no_fields_to_update' });
  }

  if (sets.length > 1) {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { pk: `TENANT#${tenantId}`, sk: 'PROFILE' },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      }),
    );
  }

  if (body.notifications) {
    const notifications = body.notifications as Record<string, any>;
    const notificationUser = slugify(notifications.userId) || DEFAULT_USER;
    await saveNotificationSettings(tenantId, notificationUser, {
      sesEnabled: !!notifications.sesEnabled,
      slackEnabled: !!notifications.slackEnabled,
      slackWebhook:
        notifications.slackWebhook === undefined
          ? undefined
          : notifications.slackWebhook
          ? String(notifications.slackWebhook).trim()
          : '',
      email:
        notifications.email === undefined
          ? undefined
          : String(notifications.email).trim(),
    });
  }

  return json(200, { ok: true });
}

