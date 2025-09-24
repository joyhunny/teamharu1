import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);

const TABLE_NAME = process.env.TABLE_NAME as string;
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID as string | undefined;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET as string | undefined;
const DEMO_PAT = process.env.GITHUB_TOKEN as string | undefined; // fallback for demo

function json(statusCode: number, body: any): APIGatewayProxyResultV2 {
  return { statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

async function fetchJsonWithRetry(url: string, init: any, retries = 3, backoffMs = 500): Promise<any> {
  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init as any);
      if (res.status === 429 || res.status === 503) {
        const wait = backoffMs * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`fetch_failed ${res.status}: ${text.slice(0, 200)}`);
      }
      return await res.json();
    } catch (e) {
      lastErr = e;
      const wait = backoffMs * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

async function startOAuth(event: APIGatewayProxyEventV2) {
  if (!GITHUB_CLIENT_ID) {
    return json(500, { ok: false, error: 'GITHUB_CLIENT_ID not configured' });
  }
  const tenantId = event.queryStringParameters?.tenantId || 't-demo';
  const userId = event.queryStringParameters?.userId || 'u-demo';
  const state = Buffer.from(JSON.stringify({ tenantId, userId })).toString('base64url');
  const host = (event.headers?.host || event.requestContext.domainName || '').replace(/\/$/, '');
  const stage = event.requestContext.stage ? `/${event.requestContext.stage}` : '';
  const redirectUri = `https://${host}${stage}/oauth/github/callback`;
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', GITHUB_CLIENT_ID);
  if (GITHUB_CLIENT_SECRET && redirectUri) {
    url.searchParams.set('redirect_uri', redirectUri);
  }
  url.searchParams.set('scope', 'read:org,repo');
  url.searchParams.set('state', state);
  return { statusCode: 302, headers: { Location: url.toString() }, body: '' };
}

async function handleCallback(event: APIGatewayProxyEventV2) {
  const code = event.queryStringParameters?.code;
  const stateParam = event.queryStringParameters?.state;
  if (!code || !stateParam) {
    return json(400, { ok: false, error: 'missing_code_or_state' });
  }
  let tenantId = 't-demo';
  let userId = 'u-demo';
  try {
    const parsed = JSON.parse(Buffer.from(stateParam, 'base64url').toString());
    tenantId = parsed.tenantId || tenantId;
    userId = parsed.userId || userId;
  } catch {}

  // Exchange code for access token
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return json(500, { ok: false, error: 'github_oauth_not_configured' });
  }
  const params = new URLSearchParams();
  params.set('client_id', GITHUB_CLIENT_ID);
  params.set('client_secret', GITHUB_CLIENT_SECRET);
  params.set('code', code);
  const host = (event.headers?.host || event.requestContext.domainName || '').replace(/\/$/, '');
  const stage = event.requestContext.stage ? `/${event.requestContext.stage}` : '';
  const redirectUri = `https://${host}${stage}/oauth/github/callback`;
  if (redirectUri) params.set('redirect_uri', redirectUri);

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'accept': 'application/json' },
    body: params as any,
  });
  const tokenJson: any = await tokenRes.json();
  const accessToken: string | undefined = tokenJson.access_token;
  if (!accessToken) {
    return json(500, { ok: false, error: 'token_exchange_failed', detail: tokenJson });
  }

  // Store token reference (demo: plaintext; production: encrypt via KMS/Secrets Manager)
  const now = new Date().toISOString();
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: `TENANT#${tenantId}#USER#${userId}`,
        sk: 'CONN#github',
        provider: 'github',
        createdAt: now,
        updatedAt: now,
        scopes: tokenJson.scope,
        tokenType: tokenJson.token_type,
        accessToken,
      },
    }),
  );

  const message = 'GitHub connection saved. You can close this window.';
  return { statusCode: 200, headers: { 'content-type': 'text/html' }, body: `<html><body>${message}</body></html>` };
}

async function collectEvents(event: APIGatewayProxyEventV2) {
  const qs = event.queryStringParameters || {};
  const tenantId = qs.tenantId || 't-demo';
  const userId = qs.userId || 'u-demo';
  const org = qs.org || '';
  const repo = qs.repo || '';
  const sinceDays = Math.min(parseInt(qs.days || '7', 10) || 7, 30);

  // Resolve token
  let token: string | undefined;
  const res = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { pk: `TENANT#${tenantId}#USER#${userId}`, sk: 'CONN#github' } }),
  );
  const conn = res.Item as any;
  token = conn?.accessToken || DEMO_PAT;
  if (!token) {
    return json(400, { ok: false, error: 'no_token_available' });
  }

  const headers = { Authorization: `Bearer ${token}`, 'User-Agent': 'teamhr-demo' } as any;
  const sinceIso = new Date(Date.now() - sinceDays * 86400000).toISOString();

  const collected: any = { commits: [], pulls: [], reviews: [], reviewComments: [], issueComments: [], commitComments: [] };

  // Commits
  if (org && repo) {
    const commitsUrl = `https://api.github.com/repos/${org}/${repo}/commits?since=${encodeURIComponent(sinceIso)}`;
    const commits = await (await fetch(commitsUrl, { headers } as any)).json();
    collected.commits = Array.isArray(commits) ? commits.map((c: any) => ({ sha: c.sha, author: c.commit?.author?.name, date: c.commit?.author?.date, message: c.commit?.message })) : [];

    // Pull Requests (state all)
    const pullsUrl = `https://api.github.com/repos/${org}/${repo}/pulls?state=all&per_page=50`;
    const pulls = await fetchJsonWithRetry(pullsUrl, { headers } as any);
    const pullsFiltered = (Array.isArray(pulls) ? pulls : []).filter((p: any) => new Date(p.updated_at).toISOString() >= sinceIso);
    collected.pulls = pullsFiltered.map((p: any) => ({ number: p.number, title: p.title, user: p.user?.login, state: p.state, merged_at: p.merged_at, updated_at: p.updated_at }));

    // Reviews per PR (limited)
    const reviews: any[] = [];
    const reviewComments: any[] = [];
    for (const p of pullsFiltered.slice(0, 10)) {
      const reviewsUrl = `https://api.github.com/repos/${org}/${repo}/pulls/${p.number}/reviews`;
      const rev = await (await fetch(reviewsUrl, { headers } as any)).json();
      if (Array.isArray(rev)) {
        reviews.push(
          ...rev
            .filter((r: any) => new Date(r.submitted_at || r.created_at || r.updated_at || 0).toISOString() >= sinceIso)
            .map((r: any) => ({ id: r.id, user: r.user?.login, state: r.state, submitted_at: r.submitted_at || r.created_at })),
        );
      }
      const revcUrl = `https://api.github.com/repos/${org}/${repo}/pulls/${p.number}/comments`;
      const revc = await fetchJsonWithRetry(revcUrl, { headers } as any);
      if (Array.isArray(revc)) {
        reviewComments.push(
          ...revc
            .filter((r: any) => new Date(r.updated_at || r.created_at || 0).toISOString() >= sinceIso)
            .map((r: any) => ({ id: r.id, user: r.user?.login, body: r.body?.slice(0, 200), created_at: r.created_at })),
        );
      }
    }
    collected.reviews = reviews;
    collected.reviewComments = reviewComments;

    // Issue comments (repo-wide)
    const issuesCommentsUrl = `https://api.github.com/repos/${org}/${repo}/issues/comments?since=${encodeURIComponent(sinceIso)}`;
    const issueComments = await fetchJsonWithRetry(issuesCommentsUrl, { headers } as any);
    collected.issueComments = Array.isArray(issueComments)
      ? issueComments.map((c: any) => ({ id: c.id, user: c.user?.login, body: c.body?.slice(0, 200), created_at: c.created_at }))
      : [];

    // Commit comments
    const commitCommentsUrl = `https://api.github.com/repos/${org}/${repo}/comments?since=${encodeURIComponent(sinceIso)}`;
    const commitComments = await fetchJsonWithRetry(commitCommentsUrl, { headers } as any);
    collected.commitComments = Array.isArray(commitComments)
      ? commitComments.map((c: any) => ({ id: c.id, user: c.user?.login, body: c.body?.slice(0, 200), created_at: c.created_at }))
      : [];
  }

  // Persist a summary record for auditing/demo
  const nowIso = new Date().toISOString();
  const counts = Object.fromEntries(Object.entries(collected).map(([k, v]: any) => [k, Array.isArray(v) ? v.length : 0]));
  const contributions = (counts.commits || 0) + (counts.pulls || 0);
  const collaboration = (counts.reviews || 0) + (counts.reviewComments || 0) + (counts.issueComments || 0) + (counts.commitComments || 0);
  const complexity = (counts.pulls || 0) + Math.round((counts.reviewComments || 0) / 5);
  const narrative = `Past ${sinceDays} days: ${counts.commits || 0} commits, ${counts.pulls || 0} PRs, ${counts.reviews || 0} reviews, ${counts.reviewComments || 0} review comments, ${counts.issueComments || 0} issue comments.`;
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: `TENANT#${tenantId}#USER#${userId}`,
        sk: `GITHUB#SUMMARY#${nowIso}`,
        type: 'GITHUB_SUMMARY',
        tenantId,
        userId,
        since: sinceIso,
        counts,
        metrics: { contributions, collaboration, complexity },
        narrative,
        sample: {
          commits: collected.commits.slice(0, 3),
          pulls: collected.pulls.slice(0, 3),
          reviews: collected.reviews.slice(0, 3),
          reviewComments: collected.reviewComments.slice(0, 3),
          issueComments: collected.issueComments.slice(0, 3),
          commitComments: collected.commitComments.slice(0, 3),
        },
        createdAt: nowIso,
        ttl: Math.floor((Date.now() + 7 * 24 * 3600 * 1000) / 1000),
      },
    }),
  );

  return json(200, { ok: true, since: sinceIso, counts, metrics: { contributions, collaboration, complexity }, narrative });
}

async function getSummary(event: APIGatewayProxyEventV2) {
  const qs = event.queryStringParameters || {};
  const tenantId = qs.tenantId || 't-demo';
  const userId = qs.userId || 'u-demo';
  const limit = Math.min(parseInt(qs.limit || '5', 10) || 5, 20);

  // Query latest summaries by PK and begins_with SK
  const { QueryCommand } = await import('@aws-sdk/lib-dynamodb');
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
      ExpressionAttributeValues: {
        ':pk': `TENANT#${tenantId}#USER#${userId}`,
        ':sk': 'GITHUB#SUMMARY#',
      },
      ScanIndexForward: false, // latest first
      Limit: limit,
    }) as any,
  );
  const items = (res.Items || []) as any[];
  return json(200, { ok: true, items });
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const method = event.requestContext.http.method;
  const path = event.requestContext.http.path || '';

  if (method === 'GET' && path.endsWith('/oauth/github/start')) {
    return startOAuth(event);
  }
  if (method === 'GET' && path.endsWith('/oauth/github/callback')) {
    return handleCallback(event);
  }
  if (method === 'POST' && path.endsWith('/github/collect')) {
    return collectEvents(event);
  }
  // Convenience GET for quick checks
  if (method === 'GET' && path.endsWith('/github/collect')) {
    return collectEvents(event);
  }
  if (method === 'GET' && path.endsWith('/github/summary')) {
    return getSummary(event);
  }
  return json(404, { ok: false, error: 'not_found' });
};
