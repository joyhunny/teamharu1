"use client";
import { useEffect, useState } from 'react';

export default function BriefingListPage() {
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/briefing/list?tenantId=t-demo&userId=u-demo&limit=10`, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'failed');
        setItems(json.items || []);
      } catch (e: any) {
        setError(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <main style={{ padding: 24 }}>
      <h1>Briefings</h1>
      {loading && <p>Loading...</p>}
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {!loading && !error && (
        <ul style={{ padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
          {items.map((it) => (
            <li key={it.sk} style={{ border: '1px solid #eee', borderRadius: 6, padding: 12 }}>
              <div style={{ fontSize: 14, color: '#666' }}>{it.sk}</div>
              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <a href={`/briefing/view?sk=${encodeURIComponent(it.sk)}`} style={{ padding: '6px 10px', background: '#111', color: '#fff', borderRadius: 6 }}>View</a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export const metadata = { title: 'Briefings', description: 'Recent briefing artifacts' };

