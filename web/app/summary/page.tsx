"use client";
import { useEffect, useState } from 'react';

type SummaryItem = {
  sk: string;
  counts?: Record<string, number>;
  metrics?: { contributions: number; collaboration: number; complexity: number };
  narrative?: string;
  createdAt?: string;
};

export default function SummaryPage() {
  const [data, setData] = useState<SummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/github/summary?tenantId=t-demo&userId=u-demo&limit=5`, { cache: 'no-store' });
        const json = await res.json();
        if (json.items) setData(json.items);
        if (!res.ok) throw new Error(json?.error || 'failed');
      } catch (e: any) {
        setError(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const latest = data[0];
  const metrics = latest?.metrics || { contributions: 0, collaboration: 0, complexity: 0 };
  const counts = latest?.counts || {};

  const bar = (value: number, color: string) => (
    <div style={{ background: '#eee', borderRadius: 6, height: 10, width: 240 }}>
      <div style={{ width: `${Math.min(100, value * 10)}%`, height: '100%', background: color, borderRadius: 6 }} />
    </div>
  );

  return (
    <main style={{ padding: 24 }}>
      <h1>Weekly Contribution Summary</h1>
      {loading && <p>Loading...</p>}
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {!loading && !error && (
        <div style={{ display: 'grid', gap: 24 }}>
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 12, color: '#666' }}>Contribution</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{metrics.contributions}</div>
              {bar(metrics.contributions, '#111')}
            </div>
            <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 12, color: '#666' }}>Collaboration</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{metrics.collaboration}</div>
              {bar(metrics.collaboration, '#555')}
            </div>
            <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 12, color: '#666' }}>Complexity</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{metrics.complexity}</div>
              {bar(metrics.complexity, '#999')}
            </div>
          </section>

          <section>
            <h3 style={{ margin: '8px 0' }}>Breakdown (7 days)</h3>
            <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {[
                ['commits', counts['commits'] || 0],
                ['pulls', counts['pulls'] || 0],
                ['reviews', counts['reviews'] || 0],
                ['reviewComments', counts['reviewComments'] || 0],
                ['issueComments', counts['issueComments'] || 0],
                ['commitComments', counts['commitComments'] || 0],
              ].map(([k, v]) => (
                <li key={String(k)} style={{ border: '1px solid #eee', borderRadius: 6, padding: 12 }}>
                  <div style={{ fontSize: 12, color: '#666' }}>{k}</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{v as number}</div>
                </li>
              ))}
            </ul>
          </section>

          {latest?.narrative && (
            <section style={{ borderTop: '1px solid #eee', paddingTop: 12 }}>
              <h3 style={{ margin: '8px 0' }}>Summary</h3>
              <p style={{ margin: 0 }}>{latest.narrative}</p>
            </section>
          )}

          <section>
            <h3 style={{ margin: '8px 0' }}>History</h3>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>When</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Contrib</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Collab</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Complexity</th>
                </tr>
              </thead>
              <tbody>
                {data.map((it) => (
                  <tr key={it.sk}>
                    <td style={{ borderBottom: '1px solid #f0f0f0', padding: 8 }}>{it.createdAt || it.sk.replace('GITHUB#SUMMARY#', '')}</td>
                    <td style={{ borderBottom: '1px solid #f0f0f0', padding: 8 }}>{it.metrics?.contributions ?? '-'}</td>
                    <td style={{ borderBottom: '1px solid #f0f0f0', padding: 8 }}>{it.metrics?.collaboration ?? '-'}</td>
                    <td style={{ borderBottom: '1px solid #f0f0f0', padding: 8 }}>{it.metrics?.complexity ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </main>
  );
}

export const metadata = {
  title: 'Weekly Summary',
  description: 'Contribution/Complexity/Collaboration dashboard',
};

