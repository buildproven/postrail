import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LogoutButton } from '@/components/logout-button'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md"
      >
        Skip to main content
      </a>
      <nav className="border-b" aria-label="Main navigation">
        <div className="flex h-16 items-center px-4 container mx-auto">
          <Link href="/dashboard" className="text-xl font-bold">
            Postrail
          </Link>
          <div className="ml-auto flex items-center space-x-4">
            <Link
              href="/dashboard"
              className="text-sm font-medium transition-colors hover:text-primary"
            >
              Dashboard
            </Link>
            <Link
              href="/dashboard/newsletters"
              className="text-sm font-medium transition-colors hover:text-primary"
            >
              Newsletters
            </Link>
            <Link
              href="/dashboard/platforms"
              className="text-sm font-medium transition-colors hover:text-primary"
            >
              Platforms
            </Link>
            <Link
              href="/dashboard/settings"
              className="text-sm font-medium transition-colors hover:text-primary"
            >
              Settings
            </Link>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-muted-foreground">
                {user.email}
              </span>
              <LogoutButton />
            </div>
          </div>
        </div>
      </nav>
      <main id="main-content" className="container mx-auto py-6 px-4">
        {children}
      </main>
    </div>
  )
}
