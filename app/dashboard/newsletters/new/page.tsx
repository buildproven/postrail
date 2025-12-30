'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

// Lazy load TipTap editor to reduce initial bundle size (~150KB savings)
const NewsletterEditor = dynamic(
  () =>
    import('@/components/newsletter-editor').then(mod => ({
      default: mod.NewsletterEditor,
    })),
  {
    loading: () => (
      <div className="min-h-[300px] p-4 border rounded-md bg-muted/50 animate-pulse flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    ),
    ssr: false,
  }
)

export default function NewNewsletterPage() {
  const [loading, setLoading] = useState(false)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  // Default to tomorrow at 9am
  const [newsletterDate, setNewsletterDate] = useState(() => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(9, 0, 0, 0)
    return tomorrow.toISOString().slice(0, 16) // Format for datetime-local
  })
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleUrlImport = async () => {
    if (!url) {
      setError('Please enter a URL')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })

      if (!response.ok) {
        const data = await response.json()
        // Show actual server error message instead of generic error
        throw new Error(
          data.error || `Failed to scrape URL (${response.status})`
        )
      }

      const data = await response.json()
      setTitle(data.title)
      setContent(data.content)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import from URL')
    } finally {
      setLoading(false)
    }
  }

  const pollJobStatus = async (jobId: string) => {
    const startTime = Date.now()
    const timeoutMs = 2 * 60 * 1000

    while (true) {
      const statusResponse = await fetch(
        `/api/generate-posts/status?jobId=${encodeURIComponent(jobId)}`
      )

      if (!statusResponse.ok) {
        const data = await statusResponse.json()
        throw new Error(data.error || 'Failed to check job status')
      }

      const job = await statusResponse.json()

      if (job.status === 'completed') {
        return job
      }

      if (job.status === 'failed') {
        throw new Error(job.error || 'Post generation failed')
      }

      if (Date.now() - startTime > timeoutMs) {
        throw new Error(
          'Generation is taking longer than expected. Please try again in a minute.'
        )
      }

      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }

  const handleGenerate = async () => {
    if (!content) {
      setError('Please enter newsletter content')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/generate-posts/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content,
          newsletterDate: new Date(newsletterDate).toISOString(),
        }),
      })

      if (!response.ok) {
        const data = await response.json()

        // Better error messages
        if (response.status === 401) {
          throw new Error(
            'Authentication required. Please refresh the page and try again.'
          )
        } else if (response.status === 500) {
          throw new Error(data.error || 'Server error during post generation')
        } else {
          throw new Error(data.error || 'Failed to generate posts')
        }
      }

      const data = await response.json()
      const job = await pollJobStatus(data.jobId)
      const newsletterId =
        job.result?.newsletterId || job.newsletterId || data.newsletterId

      if (!newsletterId) {
        throw new Error('Generation completed without a newsletter ID')
      }

      // Redirect to preview page with generated posts
      router.push(`/dashboard/newsletters/${newsletterId}/preview`)
    } catch (err) {
      console.error('❌ Post generation failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to generate posts')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Create Newsletter Posts</h1>
        <p className="text-muted-foreground">
          Import your newsletter and generate AI-powered social media posts
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Newsletter Details</CardTitle>
          <CardDescription>
            When will this newsletter be published?
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="newsletter-date">Publication Date & Time</Label>
            <Input
              id="newsletter-date"
              type="datetime-local"
              value={newsletterDate}
              onChange={e => setNewsletterDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              We'll schedule "Pre-CTA" posts 24h before this, and "Post-CTA"
              posts 48h after.
            </p>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="url" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="url">Import from URL</TabsTrigger>
          <TabsTrigger value="manual">Paste Content</TabsTrigger>
        </TabsList>

        <TabsContent value="url" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Import from URL</CardTitle>
              <CardDescription>
                Paste your newsletter URL from beehiiv, Substack, or any other
                platform
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="url">Newsletter URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="url"
                    type="url"
                    placeholder="https://yoursite.beehiiv.com/p/your-newsletter"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    disabled={loading}
                  />
                  <Button onClick={handleUrlImport} disabled={loading || !url}>
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      'Import'
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Supported: beehiiv, Substack, and most newsletter platforms
                </p>
              </div>

              {(title || content) && (
                <div className="space-y-4 pt-4 border-t">
                  <div className="space-y-2">
                    <Label htmlFor="imported-title">Newsletter Title</Label>
                    <Input
                      id="imported-title"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder="Enter newsletter title"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="imported-content">Content Preview</Label>
                    <Textarea
                      id="imported-content"
                      value={
                        content.slice(0, 500) +
                        (content.length > 500 ? '...' : '')
                      }
                      readOnly
                      rows={10}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      {content.split(' ').length} words imported
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manual" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Paste Newsletter Content</CardTitle>
              <CardDescription>
                Manually paste your newsletter title and content
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="manual-title">Newsletter Title</Label>
                <Input
                  id="manual-title"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="The 1k challenge: How to get your first 1,000 subscribers"
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual-content">Newsletter Content</Label>
                <NewsletterEditor
                  content={content}
                  onChange={setContent}
                  disabled={loading}
                />
                <p className="text-xs text-muted-foreground">
                  Paste your full newsletter content here
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-4">
        <Button variant="outline" onClick={() => router.push('/dashboard')}>
          Cancel
        </Button>
        <Button
          onClick={handleGenerate}
          disabled={loading || !content}
          size="lg"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating Posts...
            </>
          ) : (
            'Generate Social Posts'
          )}
        </Button>
      </div>
    </div>
  )
}
