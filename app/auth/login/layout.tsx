import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Log In - Postrail',
  description:
    'Access your Postrail account to automate newsletter social media posts across LinkedIn, Twitter, and Facebook.',
}

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
