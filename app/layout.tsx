import type { Metadata, Viewport } from 'next';
import { Figtree, DM_Mono } from 'next/font/google';
import './globals.css';
import ServiceWorker from '@/components/ServiceWorker';

// Self-hosted at build time: no third-party request and no flash of fallback text.
const figtree = Figtree({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-figtree',
  display: 'swap',
});
const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-dm-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Ledger',
  description: 'A monthly budget you can keep in your head.',
  applicationName: 'Ledger',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Ledger', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#12303a',
  width: 'device-width',
  initialScale: 1,
  // No maximumScale: pinch zoom must stay available.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang='en' className={figtree.variable + ' ' + dmMono.variable}>
      <body className='font-sans'>
        {/* Next only emits mobile-web-app-capable; iOS before 16.4 needs this spelling
            to open from the home screen without Safari's chrome. */}
        <meta name='apple-mobile-web-app-capable' content='yes' />
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
