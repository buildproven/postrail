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
        <CardContent>
          <p className="text-sm text-muted-foreground line-clamp-3">
            {newsletter.content.slice(0, 300)}...
          </p>
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
