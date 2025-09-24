import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

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

function isOneOnOne(ev: any): boolean {
  const summary: string = (ev.summary || '').toString().toLowerCase();
  const attendees = Array.isArray(ev.attendees) ? ev.attendees.filter((a: any) => a?.email && a.responseStatus !== 'declined') : [];
  const keywords = ['1:1', '1-1', 'one-on-one', '1on1', '원온원'];
  const hasKeyword = keywords.some((k) => summary.includes(k));
  const exactlyTwo = attendees.length === 2;
  return hasKeyword || exactlyTwo;
}

async function listMeetings(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const qs = event.queryStringParameters || {};
  const token = qs.access_token || process.env.GOOGLE_ACCESS_TOKEN;
  if (!token) {
    return json(400, { ok: false, error: 'missing_access_token' });
  }

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

  const within90m = meetings.filter((ev) => {
    const start = ev.__start as Date;
    const diffMin = (start.getTime() - now.getTime()) / 60000;
    return diffMin >= 0 && diffMin <= 90;
  });

  const durMs = Date.now() - t0;
  const out = {
    ok: true,
    window: { timeMin, timeMax: timeMax24h },
    counts: { fetched: items.length, candidates: meetings.length, next90m: within90m.length },
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

