// Force dynamic rendering for all auth pages
// These pages require runtime Supabase client initialization
export const dynamic = 'force-dynamic'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
