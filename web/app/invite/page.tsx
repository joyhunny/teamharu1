"use client";
import { useState } from 'react';

export default function InvitePage() {
  const [email, setEmail] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, tenantId: tenantId || undefined }),
      });
      const json = await res.json();
      if (json.acceptUrl) {
        setResult(`Sent! Magic link: ${json.acceptUrl}`);
      } else {
        setResult(JSON.stringify(json));
      }
    } catch (e: any) {
      setResult(`Error: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ padding: 24 }}>
      <h1>Request Invite</h1>
      <form onSubmit={submit} style={{ display: 'grid', gap: 12, maxWidth: 420 }}>
        <label>
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%', padding: 8 }} />
        </label>
        <label>
          Tenant ID (optional)
          <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} style={{ width: '100%', padding: 8 }} />
        </label>
        <button type="submit" disabled={loading} style={{ background: '#111', color: 'white', padding: '10px 16px', borderRadius: 6 }}>
          {loading ? 'Sending…' : 'Send Magic Link'}
        </button>
      </form>
      {result && <p style={{ marginTop: 16 }}>{result}</p>}
    </main>
  );
}

export const metadata = {
  title: 'Invite',
  description: 'Request a magic link to start',
};

