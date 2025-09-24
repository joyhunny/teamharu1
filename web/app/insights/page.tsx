"use client";
import { useEffect, useState } from 'react';

type Item = { id: string; title: string; done: boolean };
type TrendCard = { id: string; title: string; value: number; deltaPct: number; insight: string };

export default function InsightsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [trends, setTrends] = useState<TrendCard[] | null>(null);
  const [day, setDay] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    const load = async () => {
      try {
        const [rChecklist, rTrends] = await Promise.all([
          fetch(`/api/insights/checklist?tenantId=t-demo&userId=u-demo&day=${today}`, { cache: 'no-store' }),
          fetch(`/api/insights/trends?tenantId=t-demo&userId=u-demo`, { cache: 'no-store' }),
        ]);
        const j = await rChecklist.json();
        if (!rChecklist.ok) throw new Error(j?.error || 'failed');
        setItems(j.checklist || []);
        setDay(j.day || today);
        if (rTrends.ok) {
          const tj = await rTrends.json();
          setTrends(tj.cards || []);
        }
      } catch (e: any) {
        setError(e?.message ?? String(e));
      }
    };
    load();
  }, [today]);

  const toggle = (id: string) => setItems((arr) => arr.map((it) => (it.id === id ? { ...it, done: !it.done } : it)));

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/insights/checklist', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tenantId: 't-demo', userId: 'u-demo', day, items }) });
      if (!res.ok) throw new Error('save_failed');
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setSaving(false); }
  };

  const allDone = items.length > 0 && items.every((i) => i.done);

  return (
    <main style={{ padding: 24 }}>
      <h1>Today’s Checklist</h1>
      {trends && (
        <section style={{ margin: '12px 0 20px 0' }}>
          <h3 style={{ margin: '8px 0' }}>Weekly Tech Trends</h3>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            {trends.map((c) => (
              <div key={c.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
                <div style={{ fontWeight: 600 }}>{c.title}</div>
                <div style={{ marginTop: 6, fontSize: 24 }}>
                  {c.value}
                  <span style={{ fontSize: 12, marginLeft: 8, color: c.deltaPct >= 0 ? 'green' : 'crimson' }}>
                    {c.deltaPct >= 0 ? '▲' : '▼'} {Math.abs(c.deltaPct)}%
                  </span>
                </div>
                <div style={{ marginTop: 6, fontSize: 13, color: '#555' }}>{c.insight}</div>
              </div>
            ))}
          </div>
        </section>
      )}
      <p style={{ color: '#666' }}>{day}</p>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8, maxWidth: 520 }}>
        {items.map((it) => (
          <li key={it.id} style={{ border: '1px solid #eee', borderRadius: 6, padding: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={it.done} onChange={() => toggle(it.id)} />
            <span>{it.title}</span>
          </li>
        ))}
      </ul>
      <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
        <button onClick={save} disabled={saving} style={{ padding: '8px 12px', background: '#111', color: '#fff', borderRadius: 6 }}>{saving ? 'Saving...' : 'Save'}</button>
        {allDone && <span style={{ color: 'green' }}>오늘 체크리스트 완료</span>}
      </div>
      <div style={{ marginTop: 24 }}>
        <a href="/calendar" style={{ marginRight: 12 }}>캘린더 보기</a>
        <a href="/briefing">브리핑 보기</a>
      </div>
    </main>
  );
}

export const metadata = { title: 'Insights', description: 'Today checklist and links' };

