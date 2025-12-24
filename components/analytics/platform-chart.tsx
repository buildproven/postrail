'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface PlatformChartProps {
  data: Record<string, number>
}

const platformColors: Record<string, string> = {
  linkedin: 'bg-blue-600',
  twitter: 'bg-gray-900',
  x: 'bg-gray-900',
  facebook: 'bg-blue-500',
  threads: 'bg-gray-700',
}

const platformLabels: Record<string, string> = {
  linkedin: 'LinkedIn',
  twitter: 'Twitter/X',
  x: 'Twitter/X',
  facebook: 'Facebook',
  threads: 'Threads',
}

export function PlatformChart({ data }: PlatformChartProps) {
  const total = Object.values(data).reduce((sum, count) => sum + count, 0)

  if (total === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Posts by Platform
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            No posts yet. Generate some posts to see platform breakdown.
          </p>
        </CardContent>
      </Card>
    )
  }

  // Sort platforms by count descending
  const sortedPlatforms = Object.entries(data)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Posts by Platform</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {sortedPlatforms.map(([platform, count]) => {
          const percentage = Math.round((count / total) * 100)
          return (
            <div key={platform}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span>{platformLabels[platform] || platform}</span>
                <span className="text-muted-foreground">
                  {count} ({percentage}%)
                </span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full transition-all duration-300 rounded-full',
                    platformColors[platform] || 'bg-primary'
                  )}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          )
        })}
        <div className="pt-2 border-t">
          <div className="flex items-center justify-between text-sm font-medium">
            <span>Total</span>
            <span>{total} posts</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
