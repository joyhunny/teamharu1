export default function SecurityPage() {
  return (
    <main style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      <h1>Security</h1>
      <ul>
        <li>OAuth 2.0 minimal scopes</li>
        <li>Per-tenant data partitioning</li>
        <li>Encryption in transit and at rest</li>
        <li>AWS serverless with CloudWatch SLOs</li>
      </ul>
    </main>
  );
}

export const metadata = { title: 'Security', description: 'Security overview' };

