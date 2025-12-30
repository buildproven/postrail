import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Reset Password - Postrail',
  description: 'Reset your Postrail account password.',
}

export default function ResetPasswordLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
