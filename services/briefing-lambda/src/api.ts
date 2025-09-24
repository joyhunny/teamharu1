import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const TABLE_NAME = process.env.TABLE_NAME as string;

function json(status: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode: status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
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
  const method = event.requestContext.http.method;
  const path = event.requestContext.http.path || '';
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
