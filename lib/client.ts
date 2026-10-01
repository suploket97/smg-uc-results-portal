'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppState } from './types';

export interface ApiResult {
  ok: boolean;
  error?: string;
  state?: AppState;
  result?: any;
  needsConfirm?: boolean;
  affected?: string[];
  needsLogin?: boolean;
  [k: string]: unknown;
}

/** ?c=<id> in the page address shows an earlier competition (screens and print only). */
export function viewingCompetition(): string | null {
  if (typeof window === 'undefined') return null;
  const c = new URLSearchParams(window.location.search).get('c');
  return c && /^\d+$/.test(c) ? c : null;
}

function toLogin() {
  if (typeof window !== 'undefined') {
    window.location.href = `/admin/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  }
}

/** Loads the app state and (optionally) polls it. */
export function useAppState({ admin = false, poll = 0 }: { admin?: boolean; poll?: number } = {}) {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const busy = useRef(false);

  const reload = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const c = viewingCompetition();
      const res = await fetch((admin ? '/api/admin/state' : '/api/state') + (c && !admin ? `?c=${c}` : ''), { cache: 'no-store' });
      if (res.status === 401 && admin) return toLogin();
      const j = await res.json();
      if (!res.ok) setError(j.error || `Error ${res.status}`);
      else { setState(j); setError(null); }
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      busy.current = false;
    }
  }, [admin]);

  useEffect(() => {
    reload();
    if (!poll) return;
    const t = setInterval(reload, poll);
    const onVis = () => { if (document.visibilityState === 'visible') reload(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [reload, poll]);

  return { state, setState, error, offline, reload };
}

export async function post(url: string, body: unknown): Promise<ApiResult> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = (await res.json().catch(() => ({ ok: false, error: `Error ${res.status}` }))) as ApiResult;
    if (res.status === 401 && j.needsLogin) toLogin();
    return j;
  } catch {
    return { ok: false, error: 'Network error — check the connection and try again' };
  }
}

export async function postForm(url: string, form: FormData): Promise<ApiResult> {
  try {
    const res = await fetch(url, { method: 'POST', body: form });
    const j = (await res.json().catch(() => ({ ok: false, error: `Error ${res.status}` }))) as ApiResult;
    if (res.status === 401 && j.needsLogin) toLogin();
    return j;
  } catch {
    return { ok: false, error: 'Network error' };
  }
}

export function teamName(state: AppState | null, id: number | null | undefined): string {
  if (id == null || !state) return '';
  return state.teamNames[id] ?? `#${id}`;
}

export function teamNo(state: AppState | null, id: number | null | undefined): string {
  if (id == null || !state) return '';
  return state.teamNos?.[id] ?? '';
}

/** "7 · Oxford Siam" when the Team No. is known, otherwise just the name. */
export function teamLabel(state: AppState | null, id: number | null | undefined): string {
  const no = teamNo(state, id);
  const name = teamName(state, id);
  return no ? `${no} · ${name}` : name;
}
