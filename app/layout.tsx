import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  display: 'swap',
  preload: true,
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
  preload: true,
})

export const metadata: Metadata = {
  metadataBase: new URL('https://postrail.buildproven.ai'),
  title: 'Postrail - Automate Your Newsletter Social Posts',
  description:
    'AI-powered social media automation for newsletter creators. Generate and schedule posts to LinkedIn, Twitter, and Facebook automatically.',
  keywords: [
    'newsletter automation',
    'social media scheduling',
    'AI post generation',
    'content repurposing',
    'LinkedIn automation',
    'Twitter automation',
  ],
  authors: [{ name: 'BuildProven', url: 'https://buildproven.ai' }],
  creator: 'BuildProven',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://postrail.buildproven.ai',
    siteName: 'Postrail',
    title: 'Postrail - Turn Your Newsletter Into 8 Social Posts',
    description:
      'AI-powered social media automation for newsletter creators. Generate platform-perfect posts for LinkedIn, Twitter, and Facebook in seconds.',
    images: [
      {
        url: '/og-image.webp',
        width: 1200,
        height: 630,
        alt: 'Postrail - Newsletter to Social Media Automation',
        type: 'image/webp',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Postrail - Automate Your Newsletter Social Posts',
    description:
      'AI-powered social media automation for newsletter creators. Generate and schedule posts automatically.',
    images: ['/og-image.webp'],
    creator: '@buildproven',
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
      <head>
        <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  )
}
