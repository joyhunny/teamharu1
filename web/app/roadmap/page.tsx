"use client";
import { useEffect, useState } from 'react';

export default function RoadmapListPage() {
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch('/api/roadmap/list?tenantId=t-demo&userId=u-demo', { cache: 'no-store' });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || 'failed');
        setItems(j.items || []);
      } catch (e: any) { setError(e?.message ?? String(e)); }
    };
    load();
  }, []);

  return (
    <main style={{ padding: 24 }}>
      <h1>Personal Roadmaps</h1>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      <div style={{ marginBottom: 12 }}>
        <a href="/roadmap/edit" style={{ padding: '8px 12px', background: '#111', color: '#fff', borderRadius: 6 }}>New Roadmap</a>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
        {(items || []).map((it) => (
          <li key={it.sk} style={{ border: '1px solid #eee', borderRadius: 6, padding: 12, display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 600 }}>{it.title || it.sk}</div>
              <div style={{ color: '#666' }}>{it.status || 'DRAFT'}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <a href={`/roadmap/edit?rid=${encodeURIComponent(it.rid)}`} style={{ padding: '6px 10px', background: '#111', color: '#fff', borderRadius: 6 }}>Edit</a>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}

export const metadata = { title: 'Roadmaps', description: 'Create and manage your personal roadmap' };

