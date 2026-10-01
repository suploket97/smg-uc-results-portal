'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { post } from '@/lib/client';
import type { AppState } from '@/lib/types';
import { Wordmark } from './Wordmark';

const NAV = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/setup', label: 'Setup' },
  { href: '/admin/import', label: 'Import' },
  { href: '/admin/teams', label: 'Teams' },
  { href: '/admin/draw', label: 'Draw' },
  { href: '/admin/matches', label: 'Matches' },
];

export function AdminShell({ state, children }: { state: AppState | null; children: React.ReactNode }) {
  const path = usePathname();
  return (
    <>
      <header className="admin-top">
        <div className="bar">
          <div className="brand"><Wordmark name={state?.event.name} /></div>
          <div className="spacer" />
          <Link className="btn btn-sm btn-ghost" href="/screen" target="_blank">Screens ↗</Link>
          <button
            className="btn-sm btn-ghost"
            onClick={async () => { await post('/api/admin/logout', {}); window.location.href = '/admin/login'; }}
          >Log out</button>
        </div>
        <nav className="admin-nav" ref={(el: HTMLElement | null) => { el?.querySelector('a.on')?.scrollIntoView({ inline: 'center', block: 'nearest' }); }}>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={path === n.href ? 'on' : ''}>{n.label}</Link>
          ))}
        </nav>
      </header>
      <main className="admin-main">{children}</main>
    </>
  );
}

/** Small message box that disappears after a few seconds. */
export function useToast() {
  const [msg, setMsg] = useState<{ text: string; kind: 'ok' | 'err' | 'warn' } | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), msg.kind === 'err' ? 7000 : 3500);
    return () => clearTimeout(t);
  }, [msg]);
  const node = msg ? <div className={`toast notice ${msg.kind}`} role="status" onClick={() => setMsg(null)}>{msg.text}</div> : null;
  return { show: (text: string, kind: 'ok' | 'err' | 'warn' = 'ok') => setMsg({ text, kind }), node };
}

export function Loading({ error }: { error?: string | null }) {
  return <div className="card">{error ? <div className="notice err">{error}</div> : <span className="muted">Loading…</span>}</div>;
}
