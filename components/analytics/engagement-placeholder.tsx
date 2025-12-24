'use client'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

interface EngagementPlaceholderProps {
  hasConnectedPlatforms: boolean
  impressions: number
  engagements: number
  clicks: number
  engagementRate: number
}

export function EngagementPlaceholder({
  hasConnectedPlatforms,
  impressions,
  engagements,
  clicks,
  engagementRate,
}: EngagementPlaceholderProps) {
  const hasData = impressions > 0 || engagements > 0 || clicks > 0

  if (!hasConnectedPlatforms) {
    return (
      <Card className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Engagement Metrics
          </CardTitle>
          <CardDescription>
            Connect your social platforms to track engagement
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 opacity-50">
            <div>
              <div className="text-2xl font-bold">--</div>
              <p className="text-xs text-muted-foreground">Impressions</p>
            </div>
            <div>
              <div className="text-2xl font-bold">--</div>
              <p className="text-xs text-muted-foreground">Engagements</p>
            </div>
            <div>
              <div className="text-2xl font-bold">--</div>
              <p className="text-xs text-muted-foreground">Clicks</p>
            </div>
            <div>
              <div className="text-2xl font-bold">--</div>
              <p className="text-xs text-muted-foreground">Engagement Rate</p>
            </div>
          </div>
          <Button asChild className="mt-4 w-full" variant="outline">
            <Link href="/dashboard/platforms">Connect Platforms</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!hasData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Engagement Metrics
          </CardTitle>
          <CardDescription>
            Metrics will appear once posts are published and data syncs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-2xl font-bold">0</div>
              <p className="text-xs text-muted-foreground">Impressions</p>
            </div>
            <div>
              <div className="text-2xl font-bold">0</div>
              <p className="text-xs text-muted-foreground">Engagements</p>
            </div>
            <div>
              <div className="text-2xl font-bold">0</div>
              <p className="text-xs text-muted-foreground">Clicks</p>
            </div>
            <div>
              <div className="text-2xl font-bold">0%</div>
              <p className="text-xs text-muted-foreground">Engagement Rate</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4 text-center">
            Engagement data requires OAuth integration (coming soon)
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          Engagement Metrics
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-2xl font-bold">
              {impressions.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">Impressions</p>
          </div>
          <div>
            <div className="text-2xl font-bold">
              {engagements.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">Engagements</p>
          </div>
          <div>
            <div className="text-2xl font-bold">{clicks.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Clicks</p>
          </div>
          <div>
            <div className="text-2xl font-bold">{engagementRate}%</div>
            <p className="text-xs text-muted-foreground">Engagement Rate</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
