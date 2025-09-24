import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

const sfn = new SFNClient({});
const MACHINE = process.env.STATE_MACHINE_ARN as string;

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  if (event.requestContext.http.method !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  const json = event.body ? JSON.parse(event.body) : {};
  const tenantId = json.tenantId || 't-demo';
  const userId = json.userId || 'u-demo';
  const meeting = json.meeting || { id: 'evt-demo', title: '1:1 Meeting' };

  const input = JSON.stringify({ tenantId, userId, meeting });
  const name = `${tenantId}-${userId}-${Date.now()}`;
  const res = await sfn.send(new StartExecutionCommand({ stateMachineArn: MACHINE, input, name }));
  return { statusCode: 202, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, executionArn: res.executionArn }) };
};

