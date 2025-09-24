import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

const TABLE_NAME = process.env.TABLE_NAME as string;
const BRIEFINGS_BUCKET = process.env.BRIEFINGS_BUCKET as string;

type Input = {
  action: 'load_summary' | 'build_briefing' | 'write_output';
  tenantId: string;
  userId: string;
  meeting?: { id: string; title?: string; start?: string; end?: string };
  summaryItems?: any[];
  briefing?: any;
};

export const handler = async (event: Input): Promise<any> => {
  if (event.action === 'load_summary') {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)'
        ,ExpressionAttributeValues: {
          ':pk': `TENANT#${event.tenantId}#USER#${event.userId}`,
          ':sk': 'GITHUB#SUMMARY#',
        },
        ScanIndexForward: false,
        Limit: 3,
      }) as any,
    );
    return { summaryItems: res.Items || [] };
  }

  if (event.action === 'build_briefing') {
    const last = (event.summaryItems || [])[0] || {};
    const counts = last.counts || {};
    const metrics = last.metrics || {};
    const narrative = last.narrative || 'No recent GitHub activity available.';
    const title = event.meeting?.title || '1:1 Meeting';

    const briefing = {
      title,
      generatedAt: new Date().toISOString(),
      horizonDays: 7,
      overview: narrative,
      metrics,
      counts,
      agenda: [
        'Progress since last week',
        'PRs and reviews to highlight',
        'Roadblocks and next steps',
      ],
      suggestedQuestions: [
        'What went well this week?',
        'Any PRs you want feedback on?',
        'Any blockers I can help remove?',
      ],
    };
    return { briefing };
  }

  if (event.action === 'write_output') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const tenantId = event.tenantId;
    const userId = event.userId;
    const meetingId = event.meeting?.id || 'no-meeting';
    const key = `${tenantId}/${userId}/${meetingId}/${timestamp}.json`;
    const body = JSON.stringify({ tenantId, userId, meeting: event.meeting, briefing: event.briefing });
    await s3.send(new PutObjectCommand({ Bucket: BRIEFINGS_BUCKET, Key: key, Body: body, ContentType: 'application/json' }));

    // Index in DynamoDB for quick lookup
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          pk: `TENANT#${tenantId}#USER#${userId}`,
          sk: `BRIEFING#${meetingId}#${timestamp}`,
          s3key: key,
          bucket: BRIEFINGS_BUCKET,
          createdAt: new Date().toISOString(),
        },
      }),
    );

    return { s3Key: key, s3Bucket: BRIEFINGS_BUCKET };
  }

  throw new Error(`unsupported action: ${event.action}`);
};

