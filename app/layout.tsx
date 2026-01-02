import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'

const geistSans = localFont({
  src: '../node_modules/geist/dist/fonts/geist-sans/Geist-Regular.woff2',
  variable: '--font-geist-sans',
  weight: '100 900',
})

const geistMono = localFont({
  src: '../node_modules/geist/dist/fonts/geist-mono/GeistMono-Regular.woff2',
  variable: '--font-geist-mono',
  weight: '100 900',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://postrail.vibebuildlab.com'),
  title: 'Postrail - Automate Your Newsletter Social Posts',
  description:
    'AI-powered social media automation for newsletter creators. Generate and schedule posts to LinkedIn, Twitter, Threads, and Facebook automatically.',
  keywords: [
    'newsletter automation',
    'social media scheduling',
    'AI post generation',
    'content repurposing',
    'LinkedIn automation',
    'Twitter automation',
  ],
  authors: [{ name: 'Vibe Build Lab', url: 'https://vibebuildlab.com' }],
  creator: 'Vibe Build Lab',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://postrail.vibebuildlab.com',
    siteName: 'Postrail',
    title: 'Postrail - Turn Your Newsletter Into 8 Social Posts',
    description:
      'AI-powered social media automation for newsletter creators. Generate platform-perfect posts for LinkedIn, Twitter, Threads, and Facebook in seconds.',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Postrail - Newsletter to Social Media Automation',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Postrail - Automate Your Newsletter Social Posts',
    description:
      'AI-powered social media automation for newsletter creators. Generate and schedule posts automatically.',
    images: ['/og-image.jpg'],
    creator: '@vibebuildlab',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  )
}
