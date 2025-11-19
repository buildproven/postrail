import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PostPreviewCard } from '@/components/post-preview-card'
import Link from 'next/link'

interface PageProps {
  params: {
    id: string
  }
}

export default async function PreviewPage({ params }: PageProps) {
  const { id } = params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Fetch newsletter
  const { data: newsletter, error: newsletterError } = await supabase
    .from('newsletters')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (newsletterError || !newsletter) {
    redirect('/dashboard')
  }

  // Fetch generated posts
  const { data: posts, error: postsError } = await supabase
    .from('social_posts')
    .select('*')
    .eq('newsletter_id', id)
    .order('platform')
    .order('post_type')

  if (postsError) {
    console.error('Posts fetch error:', postsError)
  }

  // DEBUG: Log what we got
  console.log('DEBUG - Newsletter ID:', id)
  console.log('DEBUG - Posts:', posts)
  console.log('DEBUG - Posts error:', postsError)
  console.log('DEBUG - Posts count:', posts?.length || 0)

  // Group posts by type
  const preCTAPosts = posts?.filter(p => p.post_type === 'pre_cta') || []
  const postCTAPosts = posts?.filter(p => p.post_type === 'post_cta') || []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Generated Social Posts</h1>
        <p className="text-muted-foreground">
          Review and edit your AI-generated posts before scheduling
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{newsletter.title}</CardTitle>
          <CardDescription>
            {newsletter.content.split(' ').length} words • {posts?.length || 0}{' '}
            posts generated
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground line-clamp-3">
            {newsletter.content.slice(0, 300)}...
          </p>
          {/* DEBUG: Show what's happening */}
          {postsError && (
            <div className="p-4 border border-red-500 bg-red-50 dark:bg-red-950 rounded-lg">
              <p className="font-semibold text-red-700 dark:text-red-300">
                ❌ Error fetching posts:
              </p>
              <p className="text-sm text-red-600 dark:text-red-400 font-mono mt-2">
                {JSON.stringify(postsError, null, 2)}
              </p>
            </div>
          )}
          {!postsError && (!posts || posts.length === 0) && (
            <div className="p-4 border border-yellow-500 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
              <p className="font-semibold text-yellow-700 dark:text-yellow-300">
                ⚠️ No posts found for this newsletter
              </p>
              <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-2">
                Newsletter ID: <code className="font-mono">{id}</code>
              </p>
              <p className="text-sm text-yellow-600 dark:text-yellow-400">
                This might mean:
              </p>
              <ul className="text-sm text-yellow-600 dark:text-yellow-400 list-disc list-inside mt-1">
                <li>Post generation failed during creation</li>
                <li>Row Level Security is blocking access</li>
                <li>Posts were saved under a different newsletter ID</li>
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold mb-2">Pre-CTA Posts</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Teaser posts to publish 24-8 hours before your newsletter
          </p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {preCTAPosts.map(post => (
              <PostPreviewCard key={post.id} post={post} />
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-semibold mb-2">Post-CTA Posts</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Engagement posts to publish 48-72 hours after your newsletter
          </p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {postCTAPosts.map(post => (
              <PostPreviewCard key={post.id} post={post} />
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-between gap-4 pt-4 border-t">
        <Button variant="outline" asChild>
          <Link href="/dashboard">Back to Dashboard</Link>
        </Button>
        <div className="flex gap-2">
          <Button variant="outline">Save as Draft</Button>
          <Button asChild>
            <Link href={`/dashboard/newsletters/${id}/schedule`}>
              Schedule Posts
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
