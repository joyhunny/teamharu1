"use client";
import { useEffect, useState } from 'react';

export default function BetaBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch('/api/config?tenantId=t-demo', { cache: 'no-store' });
        const j = await r.json();
        const flags = j?.flags || {};
        if (flags.enabledForTenant && flags.betaBanner) setShow(true);
      } catch {}
    };
    load();
  }, []);
  if (!show) return null;
  return (
    <div style={{ background: '#fffbdd', color: '#663c00', padding: '8px 12px', textAlign: 'center' }}>
      You’re on the TeamHR Beta — features are rolling out gradually.
    </div>
  );
}

