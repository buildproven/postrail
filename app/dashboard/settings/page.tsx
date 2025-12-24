'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { AiToneSettings } from '@/components/ai-tone-settings'
import { TimezoneSettings } from '@/components/timezone-settings'
import type { User } from '@supabase/supabase-js'

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
      } else {
        setUser(user)
      }
      setLoading(false)
    }
    getUser()
  }, [supabase, router])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-gray-600 mt-1">
          Manage your account and preferences
        </p>
      </div>

      <div className="space-y-6 max-w-2xl">
        {/* Account Information */}
        <div className="border rounded-lg p-6 bg-white">
          <h2 className="text-lg font-semibold mb-4">Account Information</h2>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Email</label>
              <p className="text-gray-900">{user.email}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">
                User ID
              </label>
              <p className="text-gray-500 text-sm font-mono">{user.id}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">
                Account Created
              </label>
              <p className="text-gray-900">
                {new Date(user.created_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          </div>
        </div>

        {/* AI Writing Style */}
        <AiToneSettings />

        {/* Timezone Settings */}
        <TimezoneSettings />

        {/* Subscription */}
        <div className="border rounded-lg p-6 bg-white">
          <h2 className="text-lg font-semibold mb-4">Subscription</h2>
          <div className="space-y-4">
            {/* Current Plan */}
            <div className="p-4 border rounded bg-gray-50">
              <p className="font-medium">Free Trial</p>
              <p className="text-sm text-gray-600">
                10 generations total | 3 generations/day | 14 days
              </p>
            </div>

            {/* Upgrade Options */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-4 border rounded hover:border-blue-300 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-medium">Standard</p>
                    <p className="text-2xl font-bold">
                      $29<span className="text-sm font-normal">/mo</span>
                    </p>
                  </div>
                </div>
                <ul className="text-sm text-gray-600 space-y-1 mb-3">
                  <li>50 generations/day</li>
                  <li>Scheduling</li>
                  <li>Basic analytics</li>
                </ul>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/billing/checkout', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ tier: 'standard' }),
                      })
                      const data = await res.json()
                      if (data.url) window.location.href = data.url
                      else alert('Failed to start checkout')
                    } catch (e) {
                      console.error(e)
                      alert('Error starting checkout')
                    }
                  }}
                >
                  Upgrade to Standard
                </Button>
              </div>

              <div className="p-4 border-2 border-blue-500 rounded">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-medium">Growth</p>
                    <p className="text-2xl font-bold">
                      $59<span className="text-sm font-normal">/mo</span>
                    </p>
                  </div>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                    BEST VALUE
                  </span>
                </div>
                <ul className="text-sm text-gray-600 space-y-1 mb-3">
                  <li>200 generations/day</li>
                  <li>Advanced analytics</li>
                  <li>API access + priority support</li>
                </ul>
                <Button
                  className="w-full"
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/billing/checkout', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ tier: 'growth' }),
                      })
                      const data = await res.json()
                      if (data.url) window.location.href = data.url
                      else alert('Failed to start checkout')
                    } catch (e) {
                      console.error(e)
                      alert('Error starting checkout')
                    }
                  }}
                >
                  Upgrade to Growth
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* API Keys */}
        <div className="border rounded-lg p-6 bg-white">
          <h2 className="text-lg font-semibold mb-4">API Configuration</h2>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-700">
                Anthropic API
              </label>
              <p className="text-sm text-gray-600">
                AI post generation is configured via environment variables
              </p>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
              <p className="text-xs text-yellow-800">
                <strong>Note:</strong> API keys are managed by the application
                administrator for security. Contact support if you need custom
                API access.
              </p>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="border border-red-200 rounded-lg p-6 bg-red-50">
          <h2 className="text-lg font-semibold text-red-900 mb-4">
            Danger Zone
          </h2>
          <p className="text-sm text-red-700 mb-3">
            Account deletion and data export features coming soon.
          </p>
        </div>
      </div>
    </div>
  )
}
