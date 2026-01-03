import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { logger } from '@/lib/logger'

export default async function NewslettersPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Fetch user's newsletters (limit to 100 most recent)
  // M16 FIX: Add error logging for DB query failures
  const { data: newsletters, error: newslettersError } = await supabase
    .from('newsletters')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (newslettersError) {
    logger.error(
      { error: newslettersError, userId: user.id },
      'Failed to fetch newsletters'
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">My Newsletters</h1>
          <p className="text-gray-600 mt-1">
            View and manage all your newsletters
          </p>
        </div>
        <Link href="/dashboard/newsletters/new">
          <Button>Create New</Button>
        </Link>
      </div>

      {!newsletters || newsletters.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No newsletters yet
          </h3>
          <p className="text-gray-600 mb-4">
            Get started by creating your first newsletter
          </p>
          <Link href="/dashboard/newsletters/new">
            <Button>Create Newsletter</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {newsletters.map(newsletter => (
            <div
              key={newsletter.id}
              className="p-6 border rounded-lg hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg mb-1">
                    {newsletter.title || 'Untitled Newsletter'}
                  </h3>
                  <p className="text-sm text-gray-600 line-clamp-2 mb-2">
                    {newsletter.content?.slice(0, 150)}...
                  </p>
                  <div className="flex gap-4 text-sm text-gray-500">
                    <span>
                      Status:{' '}
                      <span className="capitalize">{newsletter.status}</span>
                    </span>
                    <span>
                      Created:{' '}
                      {new Date(newsletter.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/dashboard/newsletters/${newsletter.id}/preview`}
                  >
                    <Button variant="outline" size="sm">
                      View Posts
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
