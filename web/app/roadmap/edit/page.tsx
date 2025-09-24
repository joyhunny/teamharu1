"use client";
import { useEffect, useMemo, useState } from 'react';

type Goal = { id: string; title: string; target?: string; status?: string };

export default function RoadmapEditPage({ searchParams }: any) {
  const rid = typeof searchParams?.rid === 'string' ? searchParams.rid : '';
  const [title, setTitle] = useState('Personal Roadmap');
  const [goals, setGoals] = useState<Goal[]>([]);
  const [status, setStatus] = useState('DRAFT');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setMsg(''); setError('');
      if (!rid) return;
      const r = await fetch(`/api/roadmap/get?tenantId=t-demo&userId=u-demo&rid=${encodeURIComponent(rid)}`);
      const j = await r.json();
      if (j?.item) {
        setTitle(j.item.title || 'Personal Roadmap');
        setGoals(j.item.goals || []);
        setStatus(j.item.status || 'DRAFT');
      }
    };
    load();
  }, [rid]);

  const addGoal = () => setGoals((gs) => [...gs, { id: `g-${Date.now()}`, title: 'New Goal' }]);
  const removeGoal = (id: string) => setGoals((gs) => gs.filter((g) => g.id !== id));

  const generateDraft = async () => {
    setMsg(''); setError('');
    try {
      // Pull latest summary to seed goals
      const res = await fetch('/api/github/summary?tenantId=t-demo&userId=u-demo&limit=1', { cache: 'no-store' });
      const json = await res.json();
      const latest = (json.items || [])[0] || {};
      const metrics = latest.metrics || {};
      const seed: Goal[] = [
        { id: `g-${Date.now()}-1`, title: `Increase PR throughput (baseline ${metrics.contributions || 0})`, target: 'Weekly +20%', status: 'PLANNED' },
        { id: `g-${Date.now()}-2`, title: `Improve collaboration (baseline ${metrics.collaboration || 0})`, target: 'Weekly +15%', status: 'PLANNED' },
        { id: `g-${Date.now()}-3`, title: 'Focus area: reduce review cycle time', target: 'P95 review < 24h', status: 'PLANNED' },
      ];
      setGoals(seed);
      setMsg('Draft generated from recent activity.');
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  };

  const save = async () => {
    setMsg(''); setError('');
    const body = { tenantId: 't-demo', userId: 'u-demo', rid, title, goals, status };
    const r = await fetch('/api/roadmap/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) setMsg('Saved'); else setError('save_failed');
  };

  const approve = async () => {
    setMsg(''); setError('');
    const r = await fetch('/api/roadmap/approve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tenantId: 't-demo', userId: 'u-demo', rid }) });
    if (r.ok) { setStatus('APPROVED'); setMsg('Approved'); } else setError('approve_failed');
  };

  const share = async () => {
    setMsg(''); setError('');
    const r = await fetch('/api/roadmap/share', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rid }) });
    const j = await r.json();
    if (r.ok && j?.link) setMsg(`Share link: ${j.link}`); else setError('share_failed');
  };

  return (
    <main style={{ padding: 24 }}>
      <a href="/roadmap">← Back</a>
      <h1>Roadmap</h1>
      {msg && <p style={{ color: 'green' }}>{msg}</p>}
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      <div style={{ display: 'grid', gap: 12, maxWidth: 680 }}>
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: '100%', padding: 8 }} />
        </label>
        <div>
          <div style={{ fontSize: 12, color: '#666' }}>Status: {status}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={generateDraft} style={{ padding: '8px 12px', background: '#333', color: '#fff', borderRadius: 6 }}>Generate Draft</button>
          <button onClick={addGoal} style={{ padding: '8px 12px' }}>Add Goal</button>
          <button onClick={save} style={{ padding: '8px 12px', background: '#111', color: '#fff', borderRadius: 6 }}>Save</button>
          <button onClick={approve} disabled={!rid || status === 'APPROVED'} style={{ padding: '8px 12px' }}>Approve</button>
          <button onClick={share} style={{ padding: '8px 12px' }}>Share</button>
        </div>
        <div>
          <h3>Goals</h3>
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
            {goals.map((g, idx) => (
              <li key={g.id} style={{ border: '1px solid #eee', borderRadius: 6, padding: 12, display: 'grid', gap: 8 }}>
                <input value={g.title} onChange={(e) => setGoals((arr) => arr.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x)))} style={{ width: '100%', padding: 8 }} />
                <input placeholder="Target" value={g.target || ''} onChange={(e) => setGoals((arr) => arr.map((x, i) => (i === idx ? { ...x, target: e.target.value } : x)))} style={{ width: '100%', padding: 8 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <select value={g.status || 'PLANNED'} onChange={(e) => setGoals((arr) => arr.map((x, i) => (i === idx ? { ...x, status: e.target.value } : x)))}>
                    <option>PLANNED</option>
                    <option>IN_PROGRESS</option>
                    <option>DONE</option>
                  </select>
                  <button onClick={() => removeGoal(g.id)} style={{ padding: '6px 10px' }}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}

export const metadata = { title: 'Edit Roadmap', description: 'Draft, approve, share your roadmap' };

