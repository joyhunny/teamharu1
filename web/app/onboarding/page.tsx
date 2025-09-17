export default function Onboarding() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Welcome – Create Your Tenant</h1>
      <p>
        No tenant detected. As a first step, create or join a tenant to continue.
      </p>
      <ol>
        <li>Sign in via Hosted UI (if not already).</li>
        <li>
          Create a tenant and set a cookie for demo purposes using the developer tool or an API stub.
        </li>
      </ol>
      <p style={{ marginTop: 16 }}>
        For local demos: call <code>/api/tenant/select?tenantId=demo</code> then refresh.
      </p>
    </main>
  );
}

export const metadata = {
  title: 'Onboarding',
  description: 'Tenant onboarding',
};

