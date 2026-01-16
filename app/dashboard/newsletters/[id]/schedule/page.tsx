import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { logger } from '@/lib/logger'
// L15 FIX: Dynamic import for PostScheduler (740 lines) to reduce initial bundle size
import dynamic from 'next/dynamic'

const PostScheduler = dynamic(
  () =>
    import('@/components/post-scheduler').then(mod => ({
      default: mod.PostScheduler,
    })),
  {
    loading: () => (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    ),
  }
)

export default async function SchedulePage({
  params,
}: {
  params: { id: string }
}) {
  const { id } = params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // L9 FIX: Parallelize independent database queries for better performance
  const [
    { data: newsletter, error: newsletterError },
    { data: posts, error: postsError },
    { data: connections, error: connectionsError },
  ] = await Promise.all([
    supabase
      .from('newsletters')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('social_posts')
      .select('*')
      .eq('newsletter_id', id)
      .order('platform'),
    supabase
      .from('platform_connections')
      .select('platform, is_active')
      .eq('user_id', user.id),
  ])

  if (!newsletter) {
    if (newsletterError) {
      logger.error(
        { error: newsletterError, newsletterId: id, userId: user.id },
        'Failed to fetch newsletter for schedule page'
      )
    }
    redirect('/dashboard/newsletters')
  }

  // CRITICAL FIX: Show error state for database failures instead of treating as empty
  const hasDatabaseError = postsError || connectionsError

  if (postsError) {
    logger.error(
      { error: postsError, newsletterId: id, userId: user.id },
      'Failed to fetch posts for schedule page'
    )
  }

  if (connectionsError) {
    logger.error(
      { error: connectionsError, userId: user.id },
      'Failed to fetch platform connections for schedule page'
    )
  }

  const connectionMap = [
    {
      platform: 'twitter',
      connected:
        connections?.some(c => c.platform === 'twitter' && c.is_active) ||
        false,
    },
    {
      platform: 'linkedin',
      connected:
        connections?.some(c => c.platform === 'linkedin' && c.is_active) ||
        false,
    },
    {
      platform: 'facebook',
      connected:
        connections?.some(c => c.platform === 'facebook' && c.is_active) ||
        false,
    },
    { platform: 'threads', connected: false }, // Not yet supported
  ]

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Link href={`/dashboard/newsletters/${id}/preview`}>
          <Button variant="outline" size="sm" className="mb-4">
            ← Back to Preview
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">Schedule Posts</h1>
        <p className="text-gray-600 mt-1">
          {newsletter.title || 'Untitled Newsletter'}
        </p>
      </div>

      {hasDatabaseError ? (
        <div className="text-center py-12 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 font-medium mb-2">
            Unable to load scheduling data
          </p>
          <p className="text-red-600 text-sm mb-4">
            {postsError
              ? 'Failed to fetch posts from database. '
              : 'Failed to fetch platform connections. '}
            Please try refreshing the page.
          </p>
          <div className="flex gap-2 justify-center">
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
              className="border-red-300 text-red-700 hover:bg-red-100"
            >
              Refresh Page
            </Button>
            <Link href={`/dashboard/newsletters/${id}/preview`}>
              <Button variant="outline">Back to Preview</Button>
            </Link>
          </div>
        </div>
      ) : posts && posts.length > 0 ? (
        <PostScheduler
          newsletterId={id}
          posts={posts}
          connections={connectionMap}
        />
      ) : (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-600">No posts generated yet</p>
          <Link href={`/dashboard/newsletters/${id}/preview`}>
            <Button className="mt-4">Go to Preview</Button>
          </Link>
        </div>
      )}
    </div>
  )
}
