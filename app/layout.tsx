import type { Metadata, Viewport } from 'next';
import { Bebas_Neue, Inter, Noto_Sans_Thai } from 'next/font/google';
import './globals.css';

// Same three faces as the record forms F1–F4. next/font downloads them at build time and
// serves them from this site, so the venue's network never has to reach Google Fonts.
const bebas = Bebas_Neue({ weight: '400', subsets: ['latin'], variable: '--font-bebas', display: 'swap' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const thai = Noto_Sans_Thai({ subsets: ['thai', 'latin'], weight: ['400', '600', '700', '800'], variable: '--font-thai', display: 'swap' });

export const metadata: Metadata = {
  title: 'Samaggi University Challenge — Results',
  description: 'Draw, bracket and results for the Samaggi University Challenge',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#141419' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bebas.variable} ${inter.variable} ${thai.variable}`}>
      <body>{children}</body>
    </html>
  );
}
