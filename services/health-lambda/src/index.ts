export const handler = async () => {
  const start = Date.now();
  // Simple health response. Extend with DB ping if needed.
  const body = {
    status: 'ok',
    uptime_ms: process.uptime() * 1000,
    version: 'D1-initial',
    now: new Date().toISOString(),
  };
  const latency = Date.now() - start;
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, latency_ms: latency }),
  };
};

