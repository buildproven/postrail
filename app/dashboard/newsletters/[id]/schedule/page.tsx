import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { PostScheduler } from '@/components/post-scheduler'

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

  // Fetch newsletter
  const { data: newsletter } = await supabase
    .from('newsletters')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!newsletter) {
    redirect('/dashboard/newsletters')
  }

  // Fetch posts
  const { data: posts } = await supabase
    .from('social_posts')
    .select('*')
    .eq('newsletter_id', id)
    .order('platform')

  // Check platform connections
  const { data: connections } = await supabase
    .from('platform_connections')
    .select('platform, is_active')
    .eq('user_id', user.id)

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

      {posts && posts.length > 0 ? (
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
