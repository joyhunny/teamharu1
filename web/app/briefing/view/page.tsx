"use client";
import { useEffect, useState } from 'react';

export default function BriefingViewPage({ searchParams }: any) {
  const sk = typeof searchParams?.sk === 'string' ? searchParams.sk : '';
  const [data, setData] = useState<any | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        if (!sk) throw new Error('Missing sk');
        const res = await fetch(`/api/briefing/get?tenantId=t-demo&userId=u-demo&sk=${encodeURIComponent(sk)}`, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'failed');
        setData(json);
        const rn = await fetch(`/api/briefing/note?tenantId=t-demo&userId=u-demo&sk=${encodeURIComponent(sk)}`);
        const nj = await rn.json();
        setNote(nj.note || '');
      } catch (e: any) {
        setError(e?.message ?? String(e));
      }
    };
    load();
  }, [sk]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/briefing/note`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId: 't-demo', userId: 'u-demo', sk, note }),
      });
      if (!res.ok) throw new Error('save_failed');
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const briefing = data?.payload?.briefing;

  return (
    <main style={{ padding: 24 }}>
      <a href="/briefing">← Back</a>
      <h1>{briefing?.title || 'Briefing'}</h1>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {briefing ? (
        <div style={{ display: 'grid', gap: 16 }}>
          <section>
            <div style={{ fontSize: 12, color: '#666' }}>Generated</div>
            <div>{briefing.generatedAt}</div>
          </section>
          <section>
            <h3>Overview</h3>
            <p>{briefing.overview}</p>
          </section>
          <section>
            <h3>Metrics</h3>
            <ul>
              <li>Contributions: {briefing.metrics?.contributions ?? '-'}</li>
              <li>Collaboration: {briefing.metrics?.collaboration ?? '-'}</li>
              <li>Complexity: {briefing.metrics?.complexity ?? '-'}</li>
            </ul>
          </section>
          <section>
            <h3>Agenda</h3>
            <ul>
              {(briefing.agenda || []).map((a: string, i: number) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3>Suggested Questions</h3>
            <ul>
              {(briefing.suggestedQuestions || []).map((q: string, i: number) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3>Private Notes</h3>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={6} style={{ width: '100%', padding: 8 }} />
            <div style={{ marginTop: 8 }}>
              <button disabled={saving} onClick={save} style={{ padding: '8px 12px', background: '#111', color: '#fff', borderRadius: 6 }}>
                {saving ? 'Saving...' : 'Save Note'}
              </button>
            </div>
          </section>
        </div>
      ) : (
        <p>Loading...</p>
      )}
    </main>
  );
}

export const metadata = { title: 'Briefing', description: 'Briefing details and private notes' };

