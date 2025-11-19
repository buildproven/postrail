import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

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

  // Fetch newsletter and posts
  const { data: newsletter } = await supabase
    .from('newsletters')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!newsletter) {
    redirect('/dashboard/newsletters')
  }

  const { data: posts } = await supabase
    .from('social_posts')
    .select('*')
    .eq('newsletter_id', id)
    .order('platform')

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

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="font-semibold text-blue-900 mb-2">Coming Soon</h3>
        <p className="text-blue-800 text-sm mb-3">
          Post scheduling will be available in a future update. You&apos;ll be
          able to:
        </p>
        <ul className="space-y-1 text-sm text-blue-700 list-disc list-inside">
          <li>
            Schedule pre-CTA posts 24-8 hours before newsletter publication
          </li>
          <li>
            Schedule post-CTA engagement posts 48-72 hours after publication
          </li>
          <li>Set custom posting times for each platform</li>
          <li>View a calendar of all scheduled posts</li>
          <li>Automatically publish to connected social media accounts</li>
        </ul>
      </div>

      {posts && posts.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">
            Generated Posts Ready to Schedule
          </h2>

          {/* Pre-CTA Posts */}
          <div className="border rounded-lg p-6 bg-white">
            <h3 className="font-semibold mb-3">Pre-CTA Teaser Posts</h3>
            <p className="text-sm text-gray-600 mb-4">
              Publish 24-8 hours before your newsletter
            </p>
            <div className="grid gap-3">
              {posts
                .filter(p => p.post_type === 'pre_cta')
                .map(post => (
                  <div key={post.id} className="p-4 border rounded bg-gray-50">
                    <div className="flex justify-between items-center">
                      <span className="font-medium capitalize">
                        {post.platform}
                      </span>
                      <span className="text-sm text-gray-500">
                        {post.character_count} characters
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Post-CTA Posts */}
          <div className="border rounded-lg p-6 bg-white">
            <h3 className="font-semibold mb-3">Post-CTA Engagement Posts</h3>
            <p className="text-sm text-gray-600 mb-4">
              Publish 48-72 hours after your newsletter
            </p>
            <div className="grid gap-3">
              {posts
                .filter(p => p.post_type === 'post_cta')
                .map(post => (
                  <div key={post.id} className="p-4 border rounded bg-gray-50">
                    <div className="flex justify-between items-center">
                      <span className="font-medium capitalize">
                        {post.platform}
                      </span>
                      <span className="text-sm text-gray-500">
                        {post.character_count} characters
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
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
