'use client'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Linkedin, Facebook, Twitter } from 'lucide-react'

interface SocialPost {
  id: string
  platform: string
  post_type: string
  content: string
  character_count: number
  status: string
}

interface PostPreviewCardProps {
  post: SocialPost
}

const PLATFORM_CONFIG = {
  linkedin: {
    name: 'LinkedIn',
    icon: Linkedin,
    color: 'bg-blue-600',
    limit: 3000,
  },
  threads: {
    name: 'Threads',
    icon: () => (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 14.582c-.085 2.275-1.251 3.647-3.326 3.936-2.075.289-4.138-.479-5.527-2.051l1.502-1.104c1.021 1.155 2.433 1.713 4.028 1.476 1.595-.237 2.389-1.106 2.439-2.617.05-1.511-.67-2.48-2.164-2.917-1.494-.437-2.839.022-4.042 1.348l-1.318-1.206c1.636-1.804 3.591-2.479 5.862-2.028 2.271.451 3.633 2.042 3.546 4.163z" />
      </svg>
    ),
    color: 'bg-black',
    limit: 500,
  },
  facebook: {
    name: 'Facebook',
    icon: Facebook,
    color: 'bg-blue-500',
    limit: 63206,
  },
  x: {
    name: 'X',
    icon: Twitter,
    color: 'bg-black',
    limit: 280,
  },
}

export function PostPreviewCard({ post }: PostPreviewCardProps) {
  const config = PLATFORM_CONFIG[post.platform as keyof typeof PLATFORM_CONFIG]
  const Icon = config.icon
  const percentage = (post.character_count / config.limit) * 100
  const isNearLimit = percentage > 90
  const isOverLimit = percentage > 100

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className={`${config.color} p-1.5 rounded text-white`}>
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base">{config.name}</CardTitle>
              <CardDescription className="text-xs">
                {post.post_type === 'pre_cta'
                  ? 'Pre-CTA Teaser'
                  : 'Post-CTA Engagement'}
              </CardDescription>
            </div>
          </div>
          <Badge
            variant={
              isOverLimit
                ? 'destructive'
                : isNearLimit
                  ? 'outline'
                  : 'secondary'
            }
          >
            {post.character_count}/{config.limit}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        <div className="flex-1">
          <p className="text-sm whitespace-pre-wrap leading-relaxed">
            {post.content}
          </p>
        </div>
        <div className="flex gap-2 mt-4 pt-4 border-t">
          <Button variant="outline" size="sm" className="flex-1">
            Edit
          </Button>
          <Button variant="ghost" size="sm">
            Regenerate
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
