export default function IntegrationsPage() {
  return (
    <main style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      <h1>Integrations</h1>
      <ul>
        <li>GitHub (OAuth) – activity summary</li>
        <li>Google Calendar (read-only) – 1:1 detection (beta)</li>
      </ul>
    </main>
  );
}

export const metadata = { title: 'Integrations', description: 'Product integrations' };

