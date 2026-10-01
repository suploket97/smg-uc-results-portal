import Link from 'next/link';
import { Wordmark } from '@/components/Wordmark';

export default function Home() {
  return (
    <main className="admin-main" style={{ paddingTop: 40 }}>
      <h1 style={{ fontSize: '3rem' }}><Wordmark /></h1>
      <p className="muted">Results Portal</p>
      <div className="screens" style={{ marginTop: 24 }}>
        <Link href="/screen"><b>Big screens</b><span className="muted small">Draw, bracket, next match, results</span></Link>
        <Link href="/admin"><b>Admin</b><span className="muted small">Import, draw, scores, export</span></Link>
        <Link href="/print"><b>Printable results</b><span className="muted small">For printing or saving as PDF</span></Link>
      </div>
    </main>
  );
}
