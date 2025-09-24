import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { EventBridgeEvent } from 'aws-lambda';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESv2Client({});

const TABLE_NAME = process.env.TABLE_NAME as string;
const FRONTEND_URL = process.env.FRONTEND_URL as string | undefined;
const SES_SENDER = process.env.SES_SENDER as string | undefined;
const DEFAULT_TENANT = process.env.DEFAULT_TENANT || 't-demo';
const DEFAULT_USER = process.env.DEFAULT_USER || 'u-demo';
const GOOGLE_ACCESS_TOKEN = process.env.GOOGLE_ACCESS_TOKEN as string | undefined;
const DEFAULT_SLACK_WEBHOOK = process.env.SLACK_WEBHOOK as string | undefined;

type Settings = { sesEnabled?: boolean; slackEnabled?: boolean; slackWebhook?: string; email?: string };

function json(status: number, body: any): APIGatewayProxyResultV2 {
  return { statusCode: status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

async function getSettings(tenantId: string, userId: string): Promise<Settings> {
  const res = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { pk: `TENANT#${tenantId}#USER#${userId}`, sk: 'NOTIFY#SETTINGS' } }),
  );
  const item = (res.Item as any) || {};
  return {
    sesEnabled: !!item.sesEnabled,
    slackEnabled: !!item.slackEnabled,
    slackWebhook: item.slackWebhook || DEFAULT_SLACK_WEBHOOK,
    email: item.email || '',
  };
}

async function saveSettings(tenantId: string, userId: string, s: Settings) {
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: `TENANT#${tenantId}#USER#${userId}`,
        sk: 'NOTIFY#SETTINGS',
        ...s,
        updatedAt: new Date().toISOString(),
      },
    }),
  );
}

function toIso(d: Date) { return d.toISOString(); }
function parseDate(s: string | undefined): Date | null { if (!s) return null; const d = new Date(s); return isNaN(d.getTime()) ? null : d; }
function isOneOnOne(ev: any): boolean {
  const summary: string = (ev.summary || '').toString().toLowerCase();
  const attendees = Array.isArray(ev.attendees) ? ev.attendees.filter((a: any) => a?.email && a.responseStatus !== 'declined') : [];
  const keywords = ['1:1', '1-1', 'one-on-one', '1on1', '원온원'];
  const hasKeyword = keywords.some((k) => summary.includes(k));
  const exactlyTwo = attendees.length === 2;
  return hasKeyword || exactlyTwo;
}

async function scanUpcoming(accessToken: string) {
  const now = new Date();
  const timeMin = toIso(now);
  const timeMax = toIso(new Date(now.getTime() + 60 * 60 * 1000));
  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('timeMin', timeMin);
  url.searchParams.set('timeMax', timeMax);
  url.searchParams.set('maxResults', '50');
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } as any });
  const data: any = await res.json().catch(() => ({}));
  const items: any[] = Array.isArray(data?.items) ? data.items : [];
  const filtered = items
    .map((ev) => ({ ...ev, __start: parseDate(ev.start?.dateTime || ev.start?.date) }))
    .filter((ev) => ev.__start)
    .filter((ev) => isOneOnOne(ev))
    .filter((ev) => {
      const diffMin = ((ev.__start as Date).getTime() - now.getTime()) / 60000;
      return diffMin >= 0 && diffMin <= 60;
    });
  return filtered.map((ev) => ({ id: ev.id, summary: ev.summary, start: ev.start, end: ev.end, htmlLink: ev.htmlLink }));
}

async function sendSlack(webhook: string, text: string) {
  await fetch(webhook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
}

async function sendEmail(to: string, subject: string, textBody: string, htmlBody?: string) {
  if (!SES_SENDER) return;
  await ses.send(new SendEmailCommand({
    FromEmailAddress: SES_SENDER,
    Destination: { ToAddresses: [to] },
    Content: { Simple: { Subject: { Data: subject }, Body: { Text: { Data: textBody }, Html: { Data: htmlBody || `<pre>${textBody}</pre>` } } } },
  }));
}

async function doNotify(tenantId: string, userId: string, token: string) {
  const settings = await getSettings(tenantId, userId);
  const upcoming = await scanUpcoming(token);
  const links: string[] = [];
  const frontend = FRONTEND_URL ? FRONTEND_URL.replace(/\/$/, '') : undefined;
  if (frontend) links.push(`${frontend}/briefing`);
  const subject = upcoming.length > 0 ? `Your 1:1 is within 60 min (${upcoming.length})` : 'No 1:1 within 60 min';
  const body = [
    subject,
    ...upcoming.map((e) => `- ${e.summary || '1:1'} @ ${e.start?.dateTime || e.start?.date} ${e.htmlLink ? `\n  ${e.htmlLink}` : ''}`),
    links.length ? `\nOpen briefing: ${links[0]}` : '',
  ].join('\n');

  if (upcoming.length > 0) {
    if (settings.slackEnabled && (settings.slackWebhook || DEFAULT_SLACK_WEBHOOK)) {
      await sendSlack(settings.slackWebhook || DEFAULT_SLACK_WEBHOOK!, body);
    }
    if (settings.sesEnabled && settings.email && SES_SENDER) {
      await sendEmail(settings.email, subject, body);
    }
  }
  return { count: upcoming.length };
}

// API Handlers
async function handleGetSettings(event: APIGatewayProxyEventV2) {
  const qs = event.queryStringParameters || {};
  const tenantId = qs.tenantId || DEFAULT_TENANT;
  const userId = qs.userId || DEFAULT_USER;
  const s = await getSettings(tenantId, userId);
  return json(200, { ok: true, settings: s });
}

async function handlePostSettings(event: APIGatewayProxyEventV2) {
  const body = event.body ? JSON.parse(event.body) : {};
  const tenantId = body.tenantId || DEFAULT_TENANT;
  const userId = body.userId || DEFAULT_USER;
  const s: Settings = {
    sesEnabled: !!body.sesEnabled,
    slackEnabled: !!body.slackEnabled,
    slackWebhook: body.slackWebhook || DEFAULT_SLACK_WEBHOOK,
    email: body.email || '',
  };
  await saveSettings(tenantId, userId, s);
  return json(200, { ok: true });
}

async function handlePreview(event: APIGatewayProxyEventV2) {
  const qs = event.queryStringParameters || {};
  const tenantId = qs.tenantId || DEFAULT_TENANT;
  const userId = qs.userId || DEFAULT_USER;
  const token = qs.access_token || GOOGLE_ACCESS_TOKEN;
  if (!token) return json(400, { ok: false, error: 'missing_access_token' });
  const res = await doNotify(tenantId, userId, token);
  return json(200, { ok: true, ...res });
}

export const handler = async (
  event: APIGatewayProxyEventV2 | EventBridgeEvent<string, any>,
): Promise<APIGatewayProxyResultV2 | void> => {
  // EventBridge schedule
  if ((event as any).source === 'aws.events') {
    const token = GOOGLE_ACCESS_TOKEN;
    if (!token) return; // nothing to do
    await doNotify(DEFAULT_TENANT, DEFAULT_USER, token);
    return;
  }
  const http = (event as APIGatewayProxyEventV2).requestContext?.http;
  const method = http?.method;
  const path = http?.path || '';
  if (method === 'GET' && path.endsWith('/notify/settings')) return handleGetSettings(event as APIGatewayProxyEventV2);
  if (method === 'POST' && path.endsWith('/notify/settings')) return handlePostSettings(event as APIGatewayProxyEventV2);
  if (method === 'GET' && path.endsWith('/notify/preview')) return handlePreview(event as APIGatewayProxyEventV2);
  return json(404, { ok: false, error: 'not_found' });
};

