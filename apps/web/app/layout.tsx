import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Incremental IQ',
  description: 'Campaign-level incremental lift analysis',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
