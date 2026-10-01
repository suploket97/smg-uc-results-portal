import Link from 'next/link';

const SCREENS = [
  { href: '/screen/draw', en: 'Draw', note: 'Reveals each placement live' },
  { href: '/screen/bracket', en: 'Bracket', note: 'Whole bracket with scores and the next match' },
  { href: '/screen/next', en: 'Next match', note: 'Big card between matches' },
  { href: '/screen/results', en: 'Results', note: 'Top three and qualifying standings' },
];

export default function ScreenIndex() {
  return (
    <main className="admin-main" style={{ paddingTop: 32 }}>
      <h1>Big screens</h1>
      <p className="muted small">
                Open on the projector laptop and double-click for full screen. Pages refresh themselves every few seconds.
      </p>
      <div className="screens">
        {SCREENS.map((s) => (
          <Link key={s.href} href={s.href}><b>{s.en}</b><span className="muted small">{s.note}</span></Link>
        ))}
        <Link href="/screen/draw?controls=1">
          <b>Draw + controls</b>
          <span className="muted small">Random mode: adds a &quot;Draw next team&quot; button (or Space). Needs the admin login in this browser.</span>
        </Link>
      </div>
    </main>
  );
}
