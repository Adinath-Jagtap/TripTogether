import './globals.css';
import PWARegister from '@/components/PWARegister';

export const metadata = {
  title: 'TripTogether — Intelligent Travel Resilience & Group Settlement',
  description: 'Smart disruption recovery, connected itinerary management, and transparent group expense settlement for modern travelers.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.png', type: 'image/png' },
      { url: '/favicon.ico', type: 'image/x-icon' },
    ],
    shortcut: '/favicon.png',
    apple: '/favicon.png',
  },
};

export const viewport = {
  themeColor: '#D97706',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.png" type="image/png" sizes="any" />
        <link rel="shortcut icon" href="/favicon.png" type="image/png" />
        <link rel="apple-touch-icon" href="/favicon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body>
        <PWARegister />
        {children}
      </body>
    </html>
  );
}
