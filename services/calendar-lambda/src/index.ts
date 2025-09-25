import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

function json(status: number, body: any): APIGatewayProxyResultV2 {
  return { statusCode: status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

function toIso(d: Date) {
  return d.toISOString();
}

function parseDate(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

const DEFAULT_TENANT = (process.env.DEFAULT_TENANT || 't-demo').toLowerCase();
const TABLE_NAME = process.env.TABLE_NAME;
const ddb = TABLE_NAME ? DynamoDBDocumentClient.from(new DynamoDBClient({})) : undefined;

function normalizeTenantId(value: string | undefined): string {
  const base = (value || '').toString().trim().toLowerCase();
  if (!base) return DEFAULT_TENANT;
  const normalized = base
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || DEFAULT_TENANT;
}

function isOneOnOne(ev: any): boolean {
  const summary: string = (ev.summary || '').toString().toLowerCase();
  const attendees = Array.isArray(ev.attendees) ? ev.attendees.filter((a: any) => a?.email && a.responseStatus !== 'declined') : [];
  const keywords = ['1:1', '1-1', 'one-on-one', '1on1', '원온원'];
  const hasKeyword = keywords.some((k) => summary.includes(k));
  const exactlyTwo = attendees.length === 2;
  return hasKeyword || exactlyTwo;
}

async function persistMeetings(tenantId: string, meetings: any[]): Promise<number> {
  if (!ddb || !TABLE_NAME) {
    return 0;
  }
  const limited = meetings.slice(0, 20);
  let stored = 0;
  for (const ev of limited) {
    const idCandidate = ev.id || ev.iCalUID || ev.htmlLink;
    if (!idCandidate) {
      continue;
    }
    const start: Date | null = ev.__start instanceof Date ? ev.__start : parseDate(ev.start?.dateTime || ev.start?.date);
    const end: Date | null = ev.__end instanceof Date ? ev.__end : parseDate(ev.end?.dateTime || ev.end?.date);
    const ttlBase = end || start || new Date();
    const ttlSeconds = Math.floor((ttlBase.getTime() + 2 * 3600 * 1000) / 1000);
    const attendees = Array.isArray(ev.attendees)
      ? ev.attendees.map((a: any) => ({ email: a.email, responseStatus: a.responseStatus }))
      : [];
    const nowIso = new Date().toISOString();
    try {
      await ddb.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            pk: `TENANT#${tenantId}#MEETING`,
            sk: `MEETING#${idCandidate}`,
            tenantId,
            eventId: idCandidate,
            summary: ev.summary || '',
            description: ev.description || null,
            start: start ? start.toISOString() : null,
            end: end ? end.toISOString() : null,
            attendees,
            hangoutLink: ev.hangoutLink || null,
            htmlLink: ev.htmlLink || null,
            status: ev.status || 'confirmed',
            location: ev.location || null,
            source: 'google-calendar',
            createdAt: nowIso,
            updatedAt: nowIso,
            ttl: ttlSeconds,
            visibility: ev.visibility || null,
          },
        }),
      );
      stored += 1;
    } catch (err) {
      console.error('persist-meeting-error', err);
    }
  }
  return stored;
}

async function listMeetings(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const qs = event.queryStringParameters || {};
  const token = qs.access_token || process.env.GOOGLE_ACCESS_TOKEN;
  if (!token) {
    return json(400, { ok: false, error: 'missing_access_token' });
  }
  const tenantId = normalizeTenantId(qs.tenantId);

  const now = new Date();
  const timeMin = toIso(now);
  const timeMax24h = toIso(new Date(now.getTime() + 24 * 3600 * 1000));

  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('timeMin', timeMin);
  url.searchParams.set('timeMax', timeMax24h);
  url.searchParams.set('maxResults', '50');

  const t0 = Date.now();
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } as any });
  const text = await res.text();
  if (!res.ok) {
    return json(res.status, { ok: false, error: 'google_api_error', detail: safeJson(text) });
  }
  const data = safeJson(text);
  const items: any[] = Array.isArray((data as any)?.items) ? (data as any).items : [];

  const meetings = items
    .map((ev) => {
      const start = parseDate(ev.start?.dateTime || ev.start?.date);
      const end = parseDate(ev.end?.dateTime || ev.end?.date);
      return { ...ev, __start: start, __end: end };
    })
    .filter((ev) => ev.__start && ev.__end)
    .filter((ev) => isOneOnOne(ev));

  const persisted = await persistMeetings(tenantId, meetings);

  const within90m = meetings.filter((ev) => {
    const start = ev.__start as Date;
    const diffMin = (start.getTime() - now.getTime()) / 60000;
    return diffMin >= 0 && diffMin <= 90;
  });

  const durMs = Date.now() - t0;
  const out = {
    ok: true,
    tenantId,
    window: { timeMin, timeMax: timeMax24h },
    counts: { fetched: items.length, candidates: meetings.length, next90m: within90m.length, persisted },
    next90m: within90m.slice(0, 10).map(minifyEvent),
    upcoming24h: meetings.slice(0, 20).map(minifyEvent),
    latency_ms: durMs,
  };
  return json(200, out);
}

function minifyEvent(ev: any) {
  return {
    id: ev.id,
    summary: ev.summary,
    start: ev.start,
    end: ev.end,
    attendees: Array.isArray(ev.attendees)
      ? ev.attendees.map((a: any) => ({ email: a.email, responseStatus: a.responseStatus }))
      : [],
    hangoutLink: ev.hangoutLink,
    htmlLink: ev.htmlLink,
  };
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const method = event.requestContext.http.method;
  const path = event.requestContext.http.path || '';
  if (method === 'GET' && path.endsWith('/calendar/meetings')) {
    return listMeetings(event);
  }
  return json(404, { ok: false, error: 'not_found' });
};
