'use client';
import { useEffect, useRef, useState } from 'react';
import { fmtDate } from '@/lib/labels';
import type { AppState } from '@/lib/types';
import { Wordmark } from './Wordmark';

/**
 * A fixed 1920×1080 canvas scaled to fit any window (letterboxed).
 * Double-click anywhere to go full screen.
 */
export function Stage({
  state, title, right, offline, children,
}: {
  state: AppState | null;
  title: string;
  right?: React.ReactNode;
  offline?: boolean;
  children: React.ReactNode;
}) {
  const [box, setBox] = useState({ s: 0, x: 0, y: 0 });
  const outer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const s = Math.min(w / 1920, h / 1080);
      setBox({ s, x: (w - 1920 * s) / 2, y: (h - 1080 * s) / 2 });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={outer}
      className="stage-outer"
      onDoubleClick={() => {
        if (document.fullscreenElement) document.exitFullscreen?.();
        else document.documentElement.requestFullscreen?.().catch(() => {});
      }}
    >
      <div className="stage" style={{ transform: `translate(${box.x}px, ${box.y}px) scale(${box.s})`, visibility: box.s ? 'visible' : 'hidden' }}>
        <div className="stage-head">
          <div>
            <div className="ev"><Wordmark name={state?.event.name} /></div>
            <div className="title">{title}</div>
          </div>
          <div className="right">{right ?? fmtDate(state?.event.date)}</div>
        </div>
        <div className="stage-rule" />
        <div className="stage-body">{children}</div>
        <div className="stage-foot">
          <span>{offline ? <span className="offline">● Connection lost, retrying…</span> : null}</span>
        </div>
      </div>
    </div>
  );
}

export const POLL_MS = 3000;
