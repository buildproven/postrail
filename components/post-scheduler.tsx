'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react'

interface Post {
  id: string
  platform: string
  post_type: string
  content: string
  character_count: number
  status: string
  scheduled_time: string | null
}

interface Connection {
  platform: string
  connected: boolean
}

interface PostSchedulerProps {
  newsletterId: string
  posts: Post[]
  connections: Connection[]
}

export function PostScheduler({
  newsletterId,
  posts,
  connections,
}: PostSchedulerProps) {
  const [publishDate, setPublishDate] = useState('')
  const [publishTime, setPublishTime] = useState('09:00')
  const [scheduling, setScheduling] = useState(false)
  const [message, setMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)
  const [results, setResults] = useState<Array<{
    postId: string
    platform: string
    status: string
    scheduledTime?: string
    error?: string
  }> | null>(null)

  const connectedPlatforms = new Set(
    connections.filter(c => c.connected).map(c => c.platform)
  )

  const preCTAPosts = posts.filter(p => p.post_type === 'pre_cta')
  const postCTAPosts = posts.filter(p => p.post_type === 'post_cta')

  const handleScheduleAll = async () => {
    if (!publishDate) {
      setMessage({
        type: 'error',
        text: 'Please select a newsletter publish date',
      })
      return
    }

    const publishDateTime = new Date(`${publishDate}T${publishTime}`)
    if (publishDateTime <= new Date()) {
      setMessage({ type: 'error', text: 'Publish date must be in the future' })
      return
    }

    setScheduling(true)
    setMessage(null)
    setResults(null)

    try {
      const response = await fetch('/api/posts/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newsletterId,
          newsletterPublishDate: publishDateTime.toISOString(),
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setResults(data.results)
        setMessage({
          type: 'success',
          text: `Scheduled ${data.summary.scheduled} posts. Pre-CTA: ${formatDateTime(data.preCTATime)}, Post-CTA: ${formatDateTime(data.postCTATime)}`,
        })
      } else {
        setMessage({
          type: 'error',
          text: data.error || 'Failed to schedule posts',
        })
      }
    } catch (error) {
      console.error('Scheduling error:', error)
      setMessage({ type: 'error', text: 'Failed to schedule posts' })
    } finally {
      setScheduling(false)
    }
  }

  const formatDateTime = (isoString: string) => {
    return new Date(isoString).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const getPostStatus = (post: Post) => {
    const result = results?.find(r => r.postId === post.id)
    if (result) return result
    return null
  }

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'twitter':
      case 'x':
        return '𝕏'
      case 'linkedin':
        return '💼'
      case 'facebook':
        return '👥'
      case 'threads':
        return '🧵'
      default:
        return '📱'
    }
  }

  const isConnected = (platform: string) => {
    const normalized = platform === 'x' ? 'twitter' : platform
    return connectedPlatforms.has(normalized)
  }

  return (
    <div className="space-y-6">
      {/* Date Picker */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Newsletter Publish Date
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">
            When will your newsletter be published? We&apos;ll automatically
            schedule:
          </p>
          <ul className="text-sm text-gray-600 list-disc list-inside ml-2">
            <li>
              <strong>Pre-CTA posts:</strong> 24 hours before publish
            </li>
            <li>
              <strong>Post-CTA posts:</strong> 48 hours after publish
            </li>
          </ul>

          <div className="flex gap-4">
            <div className="flex-1">
              <Label htmlFor="publishDate">Date</Label>
              <Input
                id="publishDate"
                type="date"
                value={publishDate}
                onChange={e => setPublishDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div className="w-32">
              <Label htmlFor="publishTime">Time</Label>
              <Input
                id="publishTime"
                type="time"
                value={publishTime}
                onChange={e => setPublishTime(e.target.value)}
              />
            </div>
          </div>

          {publishDate && (
            <div className="bg-gray-50 p-4 rounded-lg text-sm">
              <p className="font-medium mb-2">Schedule Preview:</p>
              <div className="flex gap-8">
                <div>
                  <span className="text-gray-500">Pre-CTA:</span>{' '}
                  {formatDateTime(
                    new Date(
                      new Date(`${publishDate}T${publishTime}`).getTime() -
                        24 * 60 * 60 * 1000
                    ).toISOString()
                  )}
                </div>
                <div>
                  <span className="text-gray-500">Post-CTA:</span>{' '}
                  {formatDateTime(
                    new Date(
                      new Date(`${publishDate}T${publishTime}`).getTime() +
                        48 * 60 * 60 * 1000
                    ).toISOString()
                  )}
                </div>
              </div>
            </div>
          )}

          <Button
            onClick={handleScheduleAll}
            disabled={scheduling || !publishDate}
            className="w-full"
          >
            {scheduling ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Scheduling...
              </>
            ) : (
              <>
                <Clock className="mr-2 h-4 w-4" />
                Schedule All Posts
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Status Message */}
      {message && (
        <Alert
          variant={message.type === 'error' ? 'destructive' : 'default'}
          className={
            message.type === 'success' ? 'bg-green-50 border-green-200' : ''
          }
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          <AlertDescription
            className={message.type === 'success' ? 'text-green-800' : ''}
          >
            {message.text}
          </AlertDescription>
        </Alert>
      )}

      {/* Pre-CTA Posts */}
      <Card>
        <CardHeader>
          <CardTitle>Pre-CTA Teaser Posts</CardTitle>
          <p className="text-sm text-gray-600">
            Published 24 hours before your newsletter
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {preCTAPosts.map(post => {
              const result = getPostStatus(post)
              const connected = isConnected(post.platform)

              return (
                <div
                  key={post.id}
                  className={`p-4 border rounded-lg ${
                    result?.status === 'scheduled'
                      ? 'bg-green-50 border-green-200'
                      : result?.status === 'skipped' ||
                          result?.status === 'failed'
                        ? 'bg-red-50 border-red-200'
                        : !connected
                          ? 'bg-gray-100 border-gray-300'
                          : 'bg-white'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">
                        {getPlatformIcon(post.platform)}
                      </span>
                      <div>
                        <span className="font-medium capitalize">
                          {post.platform}
                        </span>
                        {!connected && (
                          <span className="ml-2 text-xs text-red-600">
                            Not connected
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      {result?.status === 'scheduled' && (
                        <div className="flex items-center gap-1 text-green-600 text-sm">
                          <CheckCircle2 className="h-4 w-4" />
                          Scheduled
                        </div>
                      )}
                      {result?.status === 'skipped' && (
                        <div className="text-red-600 text-sm">
                          {result.error}
                        </div>
                      )}
                      {!result && (
                        <span className="text-sm text-gray-500">
                          {post.character_count} chars
                        </span>
                      )}
                    </div>
                  </div>
                  {result?.scheduledTime && (
                    <p className="text-xs text-gray-500 mt-2">
                      {formatDateTime(result.scheduledTime)}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Post-CTA Posts */}
      <Card>
        <CardHeader>
          <CardTitle>Post-CTA Engagement Posts</CardTitle>
          <p className="text-sm text-gray-600">
            Published 48 hours after your newsletter
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {postCTAPosts.map(post => {
              const result = getPostStatus(post)
              const connected = isConnected(post.platform)

              return (
                <div
                  key={post.id}
                  className={`p-4 border rounded-lg ${
                    result?.status === 'scheduled'
                      ? 'bg-green-50 border-green-200'
                      : result?.status === 'skipped' ||
                          result?.status === 'failed'
                        ? 'bg-red-50 border-red-200'
                        : !connected
                          ? 'bg-gray-100 border-gray-300'
                          : 'bg-white'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">
                        {getPlatformIcon(post.platform)}
                      </span>
                      <div>
                        <span className="font-medium capitalize">
                          {post.platform}
                        </span>
                        {!connected && (
                          <span className="ml-2 text-xs text-red-600">
                            Not connected
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      {result?.status === 'scheduled' && (
                        <div className="flex items-center gap-1 text-green-600 text-sm">
                          <CheckCircle2 className="h-4 w-4" />
                          Scheduled
                        </div>
                      )}
                      {result?.status === 'skipped' && (
                        <div className="text-red-600 text-sm">
                          {result.error}
                        </div>
                      )}
                      {!result && (
                        <span className="text-sm text-gray-500">
                          {post.character_count} chars
                        </span>
                      )}
                    </div>
                  </div>
                  {result?.scheduledTime && (
                    <p className="text-xs text-gray-500 mt-2">
                      {formatDateTime(result.scheduledTime)}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Connection Warning */}
      {connections.some(c => !c.connected) && (
        <Alert>
          <AlertDescription>
            Some platforms are not connected. Visit{' '}
            <a href="/dashboard/platforms" className="text-blue-600 underline">
              Platforms
            </a>{' '}
            to connect your accounts before scheduling.
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
