import './globals.css';

export const metadata = {
  title: 'TripTogether — Intelligent Travel Resilience & Group Settlement',
  description: 'Smart disruption recovery, connected itinerary management, and transparent group expense settlement for modern travelers.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
