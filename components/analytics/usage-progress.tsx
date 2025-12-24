'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface UsageProgressProps {
  generationsToday: number
  generationsTotal: number
  dailyLimit: number
  totalLimit: number | null
  isTrial: boolean
  trialDaysRemaining: number | null
  subscriptionStatus: string
}

export function UsageProgress({
  generationsToday,
  generationsTotal,
  dailyLimit,
  totalLimit,
  isTrial,
  trialDaysRemaining,
  subscriptionStatus,
}: UsageProgressProps) {
  const dailyPercentage = Math.min((generationsToday / dailyLimit) * 100, 100)
  const totalPercentage = totalLimit
    ? Math.min((generationsTotal / totalLimit) * 100, 100)
    : 0

  const isNearDailyLimit = dailyPercentage >= 80
  const isNearTotalLimit = totalLimit ? totalPercentage >= 80 : false

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Usage</CardTitle>
          {isTrial && trialDaysRemaining !== null && (
            <Badge
              variant={trialDaysRemaining <= 3 ? 'destructive' : 'secondary'}
            >
              {trialDaysRemaining} days left in trial
            </Badge>
          )}
          {!isTrial && (
            <Badge variant="default" className="capitalize">
              {subscriptionStatus}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-center justify-between text-sm mb-1">
            <span>Today</span>
            <span
              className={cn(isNearDailyLimit && 'text-orange-600 font-medium')}
            >
              {generationsToday} / {dailyLimit}
            </span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full transition-all duration-300 rounded-full',
                isNearDailyLimit ? 'bg-orange-500' : 'bg-primary'
              )}
              style={{ width: `${dailyPercentage}%` }}
            />
          </div>
        </div>

        {totalLimit && (
          <div>
            <div className="flex items-center justify-between text-sm mb-1">
              <span>Trial Total</span>
              <span
                className={cn(
                  isNearTotalLimit && 'text-orange-600 font-medium'
                )}
              >
                {generationsTotal} / {totalLimit}
              </span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full transition-all duration-300 rounded-full',
                  isNearTotalLimit ? 'bg-orange-500' : 'bg-primary'
                )}
                style={{ width: `${totalPercentage}%` }}
              />
            </div>
          </div>
        )}

        {!totalLimit && !isTrial && (
          <p className="text-xs text-muted-foreground">
            Unlimited generations on paid plan
          </p>
        )}
      </CardContent>
    </Card>
  )
}
