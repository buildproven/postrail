'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'

interface ActivityItem {
  id: string
  platform: string
  postType: string
  status: string
  content: string
  scheduledTime: string | null
  publishedAt: string | null
  createdAt: string
}

interface ActivityTimelineProps {
  items: ActivityItem[]
}

const platformIcons: Record<string, string> = {
  linkedin: 'in',
  twitter: 'X',
  x: 'X',
  facebook: 'f',
  threads: '@',
}

const platformColors: Record<string, string> = {
  linkedin: 'bg-blue-600',
  twitter: 'bg-black',
  x: 'bg-black',
  facebook: 'bg-blue-500',
  threads: 'bg-gray-900',
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  scheduled: 'bg-blue-100 text-blue-800',
  published: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  publishing: 'bg-yellow-100 text-yellow-800',
}

export function ActivityTimeline({ items }: ActivityTimelineProps) {
  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            No activity yet. Create your first post to see it here.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {items.map(item => (
            <div key={item.id} className="flex items-start gap-3">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0',
                  platformColors[item.platform] || 'bg-gray-600'
                )}
              >
                {platformIcons[item.platform] || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium capitalize">
                    {item.platform === 'x' ? 'Twitter/X' : item.platform}
                  </span>
                  <Badge
                    variant="secondary"
                    className={cn('text-xs', statusColors[item.status])}
                  >
                    {item.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {item.postType === 'pre_cta' ? 'Pre-CTA' : 'Post-CTA'}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground truncate mt-1">
                  {item.content}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {item.publishedAt ? (
                    <>
                      Published{' '}
                      {formatDistanceToNow(new Date(item.publishedAt), {
                        addSuffix: true,
                      })}
                    </>
                  ) : item.scheduledTime ? (
                    <>
                      Scheduled for{' '}
                      {new Date(item.scheduledTime).toLocaleDateString()}
                    </>
                  ) : (
                    <>
                      Created{' '}
                      {formatDistanceToNow(new Date(item.createdAt), {
                        addSuffix: true,
                      })}
                    </>
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
