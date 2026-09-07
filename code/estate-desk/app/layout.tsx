import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Estate Desk — Your next move',
  description:
    'Property conversations, buyer requirements and your next follow-up.',
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
