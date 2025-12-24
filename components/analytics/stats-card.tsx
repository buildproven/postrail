'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface StatsCardProps {
  title: string
  value: string | number
  description?: string
  icon?: React.ReactNode
  trend?: {
    value: number
    label: string
  }
  comingSoon?: boolean
  className?: string
}

export function StatsCard({
  title,
  value,
  description,
  icon,
  trend,
  comingSoon,
  className,
}: StatsCardProps) {
  return (
    <Card className={cn('relative', className)}>
      {comingSoon && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-[1px] flex items-center justify-center rounded-lg z-10">
          <span className="text-sm text-muted-foreground font-medium">
            Connect platforms to see
          </span>
        </div>
      )}
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
        {trend && (
          <p
            className={cn(
              'text-xs mt-1',
              trend.value >= 0 ? 'text-green-600' : 'text-red-600'
            )}
          >
            {trend.value >= 0 ? '+' : ''}
            {trend.value}% {trend.label}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
