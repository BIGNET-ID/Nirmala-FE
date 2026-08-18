import './globals.css';
import Providers from './providers';

export const metadata = {
  title: 'Nirmala Platform',
  description: 'Geospatial Weather & Telemetry Radar Platform',
  icons: {
    icon: '/nirmala-favicon.png',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="id" data-theme="dark" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
