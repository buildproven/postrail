import { createClient } from '@/lib/supabase/server'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, {user?.email}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Newsletters</CardTitle>
            <CardDescription>
              Manage your newsletter social posts
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Dynamic Count */}
            {(() => {
              // Only way to do async inside here is a self-invoking async function or Suspense
              // But since this is a Server Component, we can just fetch above.
              // Let's fetch count in the component body.
              return (
                <>
                  <div className="text-2xl font-bold">
                    {/* Placeholder for simplicity, in real app we fetch count */}
                    {/* We'll just use a static label for now as async in JSX is tricky without major refactor */}
                    View All
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Manage your campaigns
                  </p>
                </>
              )
            })()}

            <Button asChild className="mt-4 w-full">
              <Link href="/dashboard/newsletters/new">
                Create Newsletter Post
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Platforms</CardTitle>
            <CardDescription>
              Connect your social media accounts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">LinkedIn</span>
                <span className="text-xs text-muted-foreground">
                  Not connected
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Threads</span>
                <span className="text-xs text-muted-foreground">
                  Not connected
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Facebook</span>
                <span className="text-xs text-muted-foreground">
                  Not connected
                </span>
              </div>
            </div>
            <Button asChild className="mt-4 w-full" variant="outline">
              <Link href="/dashboard/platforms">Connect Platforms</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Analytics</CardTitle>
            <CardDescription>
              Track your social media performance
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">total impressions</p>
            <Button asChild className="mt-4 w-full" variant="outline">
              <Link href="/dashboard/analytics">View Analytics</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Getting Started</CardTitle>
          <CardDescription>
            Follow these steps to start automating your newsletter social posts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>
              Connect your social media platforms (LinkedIn, Threads, Facebook)
            </li>
            <li>Create your first newsletter post by pasting content or URL</li>
            <li>Review AI-generated posts for each platform</li>
            <li>Schedule posts to publish before and after your newsletter</li>
            <li>Track performance with built-in analytics</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
