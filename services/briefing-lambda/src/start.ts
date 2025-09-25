import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

const sfn = new SFNClient({});
const MACHINE = process.env.STATE_MACHINE_ARN as string;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'OPTIONS,POST',
  'content-type': 'application/json',
};

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const method = (event as any)?.requestContext?.http?.method || (event as any).httpMethod || '';
  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }
  if (method !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ ok: false, error: 'method_not_allowed' }) };
  }
  let json: Record<string, any> = {};
  if (event.body) {
    try {
      json = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body as any);
    } catch {
      try {
        const params = new URLSearchParams(event.body as string);
        json = Object.fromEntries(params.entries());
      } catch {
        json = {};
      }
    }
  }
  const tenantId = json.tenantId || 't-demo';
  const userId = json.userId || 'u-demo';
  const meeting = json.meeting || { id: 'evt-demo', title: '1:1 Meeting' };

  const input = JSON.stringify({ tenantId, userId, meeting });
  const name = `${tenantId}-${userId}-${Date.now()}`;
  const res = await sfn.send(new StartExecutionCommand({ stateMachineArn: MACHINE, input, name }));
  return { statusCode: 202, headers: CORS_HEADERS, body: JSON.stringify({ ok: true, executionArn: res.executionArn }) };
};

