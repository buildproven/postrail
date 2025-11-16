import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'

export default async function PlatformsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Social Media Platforms</h1>
        <p className="text-gray-600 mt-1">
          Connect and manage your social media accounts
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="font-semibold text-blue-900 mb-2">Coming Soon</h3>
        <p className="text-blue-800 text-sm">
          Platform connections will be available in a future update. You'll be able to:
        </p>
        <ul className="mt-3 space-y-1 text-sm text-blue-700 list-disc list-inside">
          <li>Connect your LinkedIn, Facebook, and Threads accounts</li>
          <li>Authorize LetterFlow to post on your behalf</li>
          <li>Schedule posts directly to your platforms</li>
          <li>Track post performance and engagement</li>
        </ul>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {[
          {
            name: 'LinkedIn',
            description: 'Share professional content with your network',
            icon: '💼',
            status: 'Coming Soon'
          },
          {
            name: 'Threads',
            description: 'Engage with your audience in conversations',
            icon: '🧵',
            status: 'Coming Soon'
          },
          {
            name: 'Facebook',
            description: 'Reach your community with story-driven posts',
            icon: '👥',
            status: 'Coming Soon'
          }
        ].map((platform) => (
          <div
            key={platform.name}
            className="border rounded-lg p-6 bg-white opacity-60"
          >
            <div className="text-4xl mb-3">{platform.icon}</div>
            <h3 className="font-semibold text-lg mb-2">{platform.name}</h3>
            <p className="text-sm text-gray-600 mb-4">{platform.description}</p>
            <Button disabled variant="outline" className="w-full">
              {platform.status}
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
