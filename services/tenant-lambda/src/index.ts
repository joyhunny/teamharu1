import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);
const TABLE_NAME = process.env.TABLE_NAME as string;

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    if (event.requestContext.http.method !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const tenantId: string = body.tenantId || 't-demo';
    const userId: string | undefined = body.userId; // Optional for demo
    const now = new Date().toISOString();

    // Create tenant profile if not exists
    const tenantPut = ddb
      .send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            pk: `TENANT#${tenantId}`,
            sk: 'PROFILE',
            tenantId,
            createdAt: now,
            updatedAt: now,
          },
          ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)',
        }),
      )
      .catch((err: any) => {
        // If already exists, ignore conflict in demo flow
        if (err && err.code === 'ConditionalCheckFailedException') {
          return;
        }
        throw err;
      });

    await tenantPut;

    // Optionally create membership for user
    if (userId) {
      await ddb.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            pk: `TENANT#${tenantId}#USER#${userId}`,
            sk: 'PROFILE',
            tenantId,
            userId,
            role: 'owner',
            createdAt: now,
            updatedAt: now,
          },
        }),
      );
    }

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true, tenantId, userId }),
    };
  } catch (e: any) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: false, error: e?.message || 'internal_error' }),
    };
  }
};
