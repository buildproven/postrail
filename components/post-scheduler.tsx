'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Sparkles,
  Globe,
  RefreshCw,
  Info,
} from 'lucide-react'

interface Post {
  id: string
  platform: string
  post_type: string
  content: string
  character_count: number
  status: string
  scheduled_time: string | null
  retry_count?: number
}

interface Connection {
  platform: string
  connected: boolean
}

interface ScheduleResult {
  postId: string
  platform: string
  status: string
  scheduledTime?: string
  localTime?: string
  reason?: string
  isOptimal?: boolean
  error?: string
}

interface PostSchedulerProps {
  newsletterId: string
  posts: Post[]
  connections: Connection[]
  // M12 fix: Add callback for post updates instead of page reload
  onPostUpdate?: (postId: string, updates: Partial<Post>) => void
}

const PLATFORM_OPTIMAL_TIMES: Record<
  string,
  { weekday: string[]; weekend: string[] }
> = {
  linkedin: { weekday: ['9 AM', '12 PM'], weekend: ['10 AM'] },
  twitter: { weekday: ['8 AM', '12 PM', '5 PM'], weekend: ['9 AM', '12 PM'] },
  facebook: { weekday: ['9 AM', '1 PM'], weekend: ['12 PM', '1 PM'] },
  threads: { weekday: ['7 AM', '8 AM', '12 PM'], weekend: ['10 AM', '11 AM'] },
}

export function PostScheduler({
  newsletterId,
  posts,
  connections,
  onPostUpdate,
}: PostSchedulerProps) {
  // M12 fix: Track local post state to avoid page reload
  const [localPosts, setLocalPosts] = useState<Post[]>(posts)
  const [publishDate, setPublishDate] = useState('')
  const [publishTime, setPublishTime] = useState('09:00')
  const [useSmartTiming, setUseSmartTiming] = useState(true)
  const [timezone, setTimezone] = useState<string | null>(null)
  const [scheduling, setScheduling] = useState(false)
  const [retrying, setRetrying] = useState<string | null>(null)
  const [message, setMessage] = useState<{
    type: 'success' | 'error' | 'info'
    text: string
  } | null>(null)
  const [results, setResults] = useState<ScheduleResult[] | null>(null)

  // Fetch user timezone on mount
  useEffect(() => {
    const fetchTimezone = async () => {
      try {
        const res = await fetch('/api/user/timezone')
        if (res.ok) {
          const data = await res.json()
          setTimezone(data.timezone)
        }
      } catch {
        // Fallback to browser timezone
        setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)
      }
    }
    fetchTimezone()
  }, [])

  const connectedPlatforms = new Set(
    connections.filter(c => c.connected).map(c => c.platform)
  )

  // M12 fix: Use local state for derived values
  const preCTAPosts = localPosts.filter(p => p.post_type === 'pre_cta')
  const postCTAPosts = localPosts.filter(p => p.post_type === 'post_cta')
  const failedPosts = localPosts.filter(p => p.status === 'failed')

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
          useSmartTiming,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setResults(data.results)
        const scheduled = data.results.filter(
          (r: ScheduleResult) => r.status === 'scheduled'
        ).length
        const optimal = data.results.filter(
          (r: ScheduleResult) => r.isOptimal
        ).length

        setMessage({
          type: 'success',
          text: useSmartTiming
            ? `Scheduled ${scheduled} posts at optimal times (${optimal} at peak engagement hours)`
            : `Scheduled ${scheduled} posts`,
        })
      } else {
        setMessage({
          type: 'error',
          text: data.error || 'Failed to schedule posts',
        })
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to schedule posts' })
    } finally {
      setScheduling(false)
    }
  }

  const handleRetry = async (postId: string) => {
    setRetrying(postId)
    try {
      const response = await fetch(`/api/posts/${postId}/retry`, {
        method: 'POST',
      })

      if (response.ok) {
        setMessage({
          type: 'success',
          text: 'Post queued for retry',
        })
        // M12 fix: Update local state instead of page reload
        setLocalPosts(prev =>
          prev.map(p => (p.id === postId ? { ...p, status: 'scheduled' } : p))
        )
        onPostUpdate?.(postId, { status: 'scheduled' })
      } else {
        const data = await response.json()
        setMessage({
          type: 'error',
          text: data.error || 'Failed to retry post',
        })
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to retry post' })
    } finally {
      setRetrying(null)
    }
  }

  const formatDateTime = (isoString: string) => {
    return new Date(isoString).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    })
  }

  const formatShortTime = (isoString: string) => {
    return new Date(isoString).toLocaleString('en-US', {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const TimeDisplay = ({
    isoString,
    format,
  }: {
    isoString: string
    format: 'full' | 'short'
  }) => (
    <time dateTime={isoString}>
      {format === 'full'
        ? formatDateTime(isoString)
        : formatShortTime(isoString)}
    </time>
  )

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
      {/* Timezone Display */}
      {timezone && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Globe className="h-4 w-4" />
          <span>Times shown in {timezone.replace(/_/g, ' ')}</span>
          <a
            href="/dashboard/settings"
            className="text-blue-600 hover:underline"
          >
            Change
          </a>
        </div>
      )}

      {/* Date Picker with Smart Timing Toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Newsletter Publish Date
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Smart Timing Toggle */}
          <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-100">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-blue-600" />
              <div>
                <Label
                  htmlFor="smartTiming"
                  className="font-medium cursor-pointer"
                >
                  Smart Timing
                </Label>
                <p className="text-sm text-gray-600">
                  Automatically post at optimal engagement times for each
                  platform
                </p>
              </div>
            </div>
            <Switch
              id="smartTiming"
              checked={useSmartTiming}
              onCheckedChange={setUseSmartTiming}
            />
          </div>

          {/* Optimal Times Info */}
          {useSmartTiming && (
            <div className="p-4 bg-gray-50 rounded-lg text-sm">
              <div className="flex items-center gap-2 mb-2 text-gray-700">
                <Info className="h-4 w-4" />
                <span className="font-medium">Platform optimal times:</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-gray-600">
                {Object.entries(PLATFORM_OPTIMAL_TIMES).map(
                  ([platform, times]) => (
                    <div key={platform} className="flex items-center gap-2">
                      <span>{getPlatformIcon(platform)}</span>
                      <span className="capitalize">{platform}:</span>
                      <span className="text-gray-500">
                        {times.weekday.join(', ')}
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          <p className="text-sm text-gray-600">
            When will your newsletter be published? We&apos;ll automatically
            schedule:
          </p>
          <ul className="text-sm text-gray-600 list-disc list-inside ml-2">
            <li>
              <strong>Pre-CTA posts:</strong> 8-24 hours before publish
              {useSmartTiming && ' (at optimal times)'}
            </li>
            <li>
              <strong>Post-CTA posts:</strong> 48-72 hours after publish
              {useSmartTiming && ' (at optimal times)'}
            </li>
          </ul>

          <fieldset className="flex gap-4 border-0 p-0 m-0">
            <legend className="sr-only">
              Newsletter Publish Date and Time
            </legend>
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
          </fieldset>

          {publishDate && !useSmartTiming && (
            <div className="bg-gray-50 p-4 rounded-lg text-sm">
              <p className="font-medium mb-2">Schedule Preview:</p>
              <div className="flex gap-8">
                <div>
                  <span className="text-gray-500">Pre-CTA:</span>{' '}
                  <TimeDisplay
                    isoString={new Date(
                      new Date(`${publishDate}T${publishTime}`).getTime() -
                        24 * 60 * 60 * 1000
                    ).toISOString()}
                    format="short"
                  />
                </div>
                <div>
                  <span className="text-gray-500">Post-CTA:</span>{' '}
                  <TimeDisplay
                    isoString={new Date(
                      new Date(`${publishDate}T${publishTime}`).getTime() +
                        48 * 60 * 60 * 1000
                    ).toISOString()}
                    format="short"
                  />
                </div>
              </div>
            </div>
          )}

          {publishDate && useSmartTiming && (
            <div className="bg-blue-50 p-4 rounded-lg text-sm border border-blue-100">
              <p className="font-medium mb-2 text-blue-800">
                <Sparkles className="h-4 w-4 inline mr-1" />
                Smart Timing will find the best times for each platform
              </p>
              <p className="text-blue-700">
                Posts will be scheduled at peak engagement hours within the
                pre-CTA and post-CTA windows.
              </p>
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
                {useSmartTiming ? (
                  <Sparkles className="mr-2 h-4 w-4" />
                ) : (
                  <Clock className="mr-2 h-4 w-4" />
                )}
                Schedule All Posts
                {useSmartTiming && ' (Smart Timing)'}
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
            message.type === 'success'
              ? 'bg-green-50 border-green-200'
              : message.type === 'info'
                ? 'bg-blue-50 border-blue-200'
                : ''
          }
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          ) : message.type === 'info' ? (
            <Info className="h-4 w-4 text-blue-600" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          <AlertDescription
            className={
              message.type === 'success'
                ? 'text-green-800'
                : message.type === 'info'
                  ? 'text-blue-800'
                  : ''
            }
          >
            {message.text}
          </AlertDescription>
        </Alert>
      )}

      {/* Failed Posts with Retry */}
      {failedPosts.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-800 flex items-center gap-2">
              <XCircle className="h-5 w-5" />
              Failed Posts
            </CardTitle>
            <p className="text-sm text-red-600">
              These posts failed to publish. You can retry them.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {failedPosts.map(post => (
                <div
                  key={post.id}
                  className="p-4 border border-red-200 rounded-lg bg-white flex justify-between items-center"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">
                      {getPlatformIcon(post.platform)}
                    </span>
                    <div>
                      <span className="font-medium capitalize">
                        {post.platform}
                      </span>
                      <span className="ml-2 text-xs text-gray-500">
                        {post.post_type.replace('_', '-')}
                      </span>
                      {post.retry_count !== undefined &&
                        post.retry_count > 0 && (
                          <span className="ml-2 text-xs text-red-600">
                            ({post.retry_count} retries)
                          </span>
                        )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRetry(post.id)}
                    disabled={retrying === post.id}
                  >
                    {retrying === post.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Retry
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pre-CTA Posts */}
      <Card>
        <CardHeader>
          <CardTitle>Pre-CTA Teaser Posts</CardTitle>
          <p className="text-sm text-gray-600">
            Published 8-24 hours before your newsletter
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
                          {result.isOptimal && <Sparkles className="h-3 w-3" />}
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
                    <div className="mt-2">
                      <p className="text-xs text-gray-500">
                        {result.localTime || (
                          <TimeDisplay
                            isoString={result.scheduledTime}
                            format="full"
                          />
                        )}
                      </p>
                      {result.reason && result.isOptimal && (
                        <p className="text-xs text-blue-600 flex items-center gap-1 mt-1">
                          <Sparkles className="h-3 w-3" />
                          {result.reason}
                        </p>
                      )}
                    </div>
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
            Published 48-72 hours after your newsletter
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
                          {result.isOptimal && <Sparkles className="h-3 w-3" />}
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
                    <div className="mt-2">
                      <p className="text-xs text-gray-500">
                        {result.localTime || (
                          <TimeDisplay
                            isoString={result.scheduledTime}
                            format="full"
                          />
                        )}
                      </p>
                      {result.reason && result.isOptimal && (
                        <p className="text-xs text-blue-600 flex items-center gap-1 mt-1">
                          <Sparkles className="h-3 w-3" />
                          {result.reason}
                        </p>
                      )}
                    </div>
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
