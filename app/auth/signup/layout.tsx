import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Start Free Trial - Postrail Newsletter Automation',
  description:
    '14-day free trial. Turn your newsletters into AI-generated social posts for LinkedIn, Twitter, and Facebook. No credit card required.',
}

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
