import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ledger',
  description: 'A monthly budget you can keep in your head.',
};

export const viewport: Viewport = {
  themeColor: '#12303a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang='en'>
      <head>
        <link rel='preconnect' href='https://fonts.gstatic.com' crossOrigin='' />
        <link
          rel='stylesheet'
          href='https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap'
        />
      </head>
      <body className='font-sans'>{children}</body>
    </html>
  );
}
