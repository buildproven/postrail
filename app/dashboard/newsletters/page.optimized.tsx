import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export default async function NewslettersPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // OPTIMIZED QUERY: Single query with join to get newsletters + post counts
  // Instead of: SELECT * FROM newsletters, then N queries for posts
  // Now: Single query with aggregation using Supabase's built-in join syntax
  const { data: newsletters } = await supabase
    .from('newsletters')
    .select(
      `
      *,
      social_posts (
        id,
        status,
        platform,
        post_type
      )
    `
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  // Process data: calculate post counts and status summaries
  const newslettersWithStats = newsletters?.map(newsletter => {
    const posts = newsletter.social_posts || []

    return {
      ...newsletter,
      stats: {
        totalPosts: posts.length,
        draftPosts: posts.filter(
          (p: { status: string }) => p.status === 'draft'
        ).length,
        scheduledPosts: posts.filter(
          (p: { status: string }) => p.status === 'scheduled'
        ).length,
        publishedPosts: posts.filter(
          (p: { status: string }) => p.status === 'published'
        ).length,
        platforms: [
          ...new Set(posts.map((p: { platform: string }) => p.platform)),
        ],
      },
    }
  })

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

      {!newslettersWithStats || newslettersWithStats.length === 0 ? (
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
          {newslettersWithStats.map(newsletter => (
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

                  {/* Post Stats - NEW: No additional queries needed */}
                  <div className="flex gap-2 mb-2">
                    <Badge variant="outline">
                      {newsletter.stats.totalPosts} posts
                    </Badge>
                    {newsletter.stats.publishedPosts > 0 && (
                      <Badge variant="default">
                        {newsletter.stats.publishedPosts} published
                      </Badge>
                    )}
                    {newsletter.stats.scheduledPosts > 0 && (
                      <Badge variant="secondary">
                        {newsletter.stats.scheduledPosts} scheduled
                      </Badge>
                    )}
                    {newsletter.stats.draftPosts > 0 && (
                      <Badge variant="outline">
                        {newsletter.stats.draftPosts} draft
                      </Badge>
                    )}
                  </div>

                  {/* Platforms - NEW: Show which platforms have posts */}
                  {newsletter.stats.platforms.length > 0 && (
                    <div className="flex gap-1 mb-2">
                      {newsletter.stats.platforms.map((platform: string) => (
                        <span
                          key={platform}
                          className="text-xs px-2 py-1 bg-gray-100 rounded capitalize"
                        >
                          {platform}
                        </span>
                      ))}
                    </div>
                  )}

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
