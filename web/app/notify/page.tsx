"use client";
import { useEffect, useState } from 'react';

export default function NotifySettingsPage() {
  const [settings, setSettings] = useState<any>({ sesEnabled: false, slackEnabled: false, slackWebhook: '', email: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/notify/settings?tenantId=t-demo&userId=u-demo');
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'failed');
        setSettings(json.settings || {});
      } catch (e: any) {
        setError(e?.message ?? String(e));
      }
    };
    load();
  }, []);

  const save = async () => {
    setMsg(''); setError('');
    try {
      const res = await fetch('/api/notify/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tenantId: 't-demo', userId: 'u-demo', ...settings }) });
      if (!res.ok) throw new Error('save_failed');
      setMsg('Saved');
    } catch (e: any) { setError(e?.message ?? String(e)); }
  };

  return (
    <main style={{ padding: 24 }}>
      <h1>Notifications</h1>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {msg && <p style={{ color: 'green' }}>{msg}</p>}
      <div style={{ display: 'grid', gap: 12, maxWidth: 540 }}>
        <label>
          <input type="checkbox" checked={!!settings.sesEnabled} onChange={(e) => setSettings((s: any) => ({ ...s, sesEnabled: e.target.checked }))} /> Email via SES
        </label>
        <label>
          Email Address
          <input value={settings.email || ''} onChange={(e) => setSettings((s: any) => ({ ...s, email: e.target.value }))} style={{ width: '100%', padding: 8 }} />
        </label>
        <label>
          <input type="checkbox" checked={!!settings.slackEnabled} onChange={(e) => setSettings((s: any) => ({ ...s, slackEnabled: e.target.checked }))} /> Slack Webhook
        </label>
        <label>
          Slack Webhook URL
          <input value={settings.slackWebhook || ''} onChange={(e) => setSettings((s: any) => ({ ...s, slackWebhook: e.target.value }))} style={{ width: '100%', padding: 8 }} />
        </label>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={save} style={{ padding: '8px 12px', background: '#111', color: '#fff', borderRadius: 6 }}>Save</button>
          <a href="/api/notify/preview" style={{ padding: '8px 12px' }}>Preview Now</a>
        </div>
      </div>
    </main>
  );
}

export const metadata = { title: 'Notifications', description: 'Configure SES/Slack alerts' };

