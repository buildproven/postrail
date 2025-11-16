'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { NewsletterEditor } from '@/components/newsletter-editor'
import { Loader2 } from 'lucide-react'

export default function NewNewsletterPage() {
  const [loading, setLoading] = useState(false)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
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
        throw new Error('Failed to scrape URL')
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

  const handleGenerate = async () => {
    if (!content) {
      setError('Please enter newsletter content')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/generate-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate posts')
      }

      const data = await response.json()

      // Redirect to preview page with generated posts
      router.push(`/dashboard/newsletters/${data.newsletterId}/preview`)
    } catch (err) {
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
                Paste your newsletter URL from beehiiv, Substack, or any other platform
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
                    onChange={(e) => setUrl(e.target.value)}
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
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Enter newsletter title"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="imported-content">Content Preview</Label>
                    <Textarea
                      id="imported-content"
                      value={content.slice(0, 500) + (content.length > 500 ? '...' : '')}
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
                  onChange={(e) => setTitle(e.target.value)}
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
