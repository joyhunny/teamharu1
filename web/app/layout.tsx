export const metadata = {
  title: 'TeamHR – AI Copilot for Better 1:1s',
  description: 'TeamHR helps engineering leaders prep 1:1s in minutes with briefings from calendar and GitHub activity. Secure, per-tenant, serverless.',
  openGraph: {
    title: 'TeamHR – AI Copilot for Better 1:1s',
    description: 'Prep 1:1s in minutes. Briefings from your calendar and GitHub, with privacy-by-design.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TeamHR – AI Copilot for Better 1:1s',
    description: 'Prep 1:1s in minutes with secure AI briefings.',
  },
  icons: {
    icon: '/favicon.svg',
  },
};

import BetaBanner from './components/BetaBanner';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial' }}>
        <BetaBanner />
        {children}
      </body>
    </html>
  );
}
