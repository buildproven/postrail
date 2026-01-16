import { createClient } from '@/lib/supabase/server'
import { SubscriptionCards } from '@/components/subscription-cards'
// L15 FIX: Dynamic imports for heavy components to reduce initial bundle size
import dynamic from 'next/dynamic'

const AiToneSettings = dynamic(
  () =>
    import('@/components/ai-tone-settings').then(mod => ({
      default: mod.AiToneSettings,
    })),
  {
    loading: () => (
      <div className="border rounded-lg p-6 bg-white animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
        <div className="h-20 bg-gray-100 rounded"></div>
      </div>
    ),
  }
)

const TimezoneSettings = dynamic(
  () =>
    import('@/components/timezone-settings').then(mod => ({
      default: mod.TimezoneSettings,
    })),
  {
    loading: () => (
      <div className="border rounded-lg p-6 bg-white animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
        <div className="h-16 bg-gray-100 rounded"></div>
      </div>
    ),
  }
)

// L5 fix: Convert to server component to avoid redundant client-side auth fetch
// Dashboard layout already handles auth and redirects
export default async function SettingsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Get user's subscription status
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('subscription_status')
    .eq('id', user?.id)
    .single()

  const currentPlan = profile?.subscription_status || 'trial'

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
              <p className="text-gray-900">{user?.email}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">
                User ID
              </label>
              <p className="text-gray-500 text-sm font-mono">{user?.id}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">
                Account Created
              </label>
              <p className="text-gray-900">
                {user?.created_at
                  ? new Date(user.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : 'Unknown'}
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
              <p className="font-medium capitalize">{currentPlan}</p>
              <p className="text-sm text-gray-600">
                {currentPlan === 'trial'
                  ? '10 generations total | 3 generations/day | 14 days'
                  : currentPlan === 'standard'
                    ? '50 generations/day | Scheduling | Basic analytics'
                    : '200 generations/day | Advanced analytics | API access'}
              </p>
            </div>

            {/* Upgrade Options */}
            <SubscriptionCards currentPlan={currentPlan} />
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
