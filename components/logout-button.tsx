'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export function LogoutButton() {
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    // Call server-side logout endpoint for security logging
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch (error) {
      // Continue with client-side logout even if logging fails
      console.error('Logout logging failed:', error)
    }

    // Perform client-side logout
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <Button variant="outline" size="sm" onClick={handleLogout}>
      Log out
    </Button>
  )
}
