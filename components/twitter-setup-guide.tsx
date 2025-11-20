'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Loader2,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Eye,
  EyeOff,
} from 'lucide-react'

interface TwitterSetupGuideProps {
  onSuccess?: () => void
}

export function TwitterSetupGuide({ onSuccess }: TwitterSetupGuideProps) {
  const [step, setStep] = useState<'instructions' | 'credentials'>(
    'instructions'
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [showSecrets, setShowSecrets] = useState({
    apiSecret: false,
    accessTokenSecret: false,
  })

  const [credentials, setCredentials] = useState({
    apiKey: '',
    apiSecret: '',
    accessToken: '',
    accessTokenSecret: '',
  })

  const handleConnect = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/platforms/twitter/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.details || data.error || 'Failed to connect Twitter'
        )
      }

      setSuccess(true)

      // Clear credentials from state for security
      setCredentials({
        apiKey: '',
        apiSecret: '',
        accessToken: '',
        accessTokenSecret: '',
      })

      if (onSuccess) {
        setTimeout(() => {
          onSuccess()
        }, 2000)
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to connect Twitter account'
      )
    } finally {
      setLoading(false)
    }
  }

  const isFormValid =
    credentials.apiKey &&
    credentials.apiSecret &&
    credentials.accessToken &&
    credentials.accessTokenSecret

  if (success) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
            <CardTitle className="text-green-900">Twitter Connected!</CardTitle>
          </div>
          <CardDescription className="text-green-700">
            Your Twitter account is now connected and ready to use.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (step === 'instructions') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Connect Twitter (BYOK)</CardTitle>
          <CardDescription>
            To connect Twitter, you&apos;ll need to create your own Twitter
            Developer account and app. This gives you 500 posts/month on the
            free tier.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <h4 className="font-semibold flex items-center gap-2">
              📋 Setup Instructions (~10 minutes)
            </h4>

            <div className="space-y-3 text-sm">
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold">
                  1
                </div>
                <div>
                  <p className="font-medium">Create Developer Account</p>
                  <p className="text-gray-600">
                    Go to{' '}
                    <a
                      href="https://developer.twitter.com/en/portal/dashboard"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline inline-flex items-center gap-1"
                    >
                      Twitter Developer Portal
                      <ExternalLink className="h-3 w-3" />
                    </a>{' '}
                    and sign up (free tier is fine)
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold">
                  2
                </div>
                <div>
                  <p className="font-medium">Create a New App</p>
                  <p className="text-gray-600">
                    Click &quot;Create Project&quot; → Name it (e.g.,
                    &quot;LetterFlow Bot&quot;) → Create an app within the
                    project
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold">
                  3
                </div>
                <div>
                  <p className="font-medium">Set Permissions</p>
                  <p className="text-gray-600">
                    Go to your app → Settings → User authentication settings →
                    Enable OAuth 1.0a → Set permissions to{' '}
                    <strong>&quot;Read and Write&quot;</strong>
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold">
                  4
                </div>
                <div>
                  <p className="font-medium">Get Your Keys</p>
                  <p className="text-gray-600">
                    Go to &quot;Keys and tokens&quot; tab → Copy:
                  </p>
                  <ul className="list-disc list-inside text-gray-600 ml-4 mt-1">
                    <li>API Key (Consumer Key)</li>
                    <li>API Secret (Consumer Secret)</li>
                    <li>Access Token</li>
                    <li>Access Token Secret</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <Alert>
            <AlertDescription className="text-sm">
              <strong>Why BYOK?</strong> Twitter&apos;s free tier limits 500
              posts/month per app. By using your own keys, you get your own
              500/month quota instead of sharing with other users.
            </AlertDescription>
          </Alert>

          <div className="flex gap-3">
            <Button onClick={() => setStep('credentials')} className="w-full">
              I Have My Keys →
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enter Twitter API Credentials</CardTitle>
        <CardDescription>
          Paste the API keys from your Twitter Developer Portal
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div>
            <Label htmlFor="apiKey">API Key (Consumer Key)</Label>
            <Input
              id="apiKey"
              type="text"
              placeholder="xxxxxxxxxxxxxxxxxxxxx"
              value={credentials.apiKey}
              onChange={e =>
                setCredentials({ ...credentials, apiKey: e.target.value })
              }
              disabled={loading}
            />
          </div>

          <div>
            <Label htmlFor="apiSecret">API Secret (Consumer Secret)</Label>
            <div className="relative">
              <Input
                id="apiSecret"
                type={showSecrets.apiSecret ? 'text' : 'password'}
                placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                value={credentials.apiSecret}
                onChange={e =>
                  setCredentials({ ...credentials, apiSecret: e.target.value })
                }
                disabled={loading}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() =>
                  setShowSecrets({
                    ...showSecrets,
                    apiSecret: !showSecrets.apiSecret,
                  })
                }
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showSecrets.apiSecret ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div>
            <Label htmlFor="accessToken">Access Token</Label>
            <Input
              id="accessToken"
              type="text"
              placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={credentials.accessToken}
              onChange={e =>
                setCredentials({ ...credentials, accessToken: e.target.value })
              }
              disabled={loading}
            />
          </div>

          <div>
            <Label htmlFor="accessTokenSecret">Access Token Secret</Label>
            <div className="relative">
              <Input
                id="accessTokenSecret"
                type={showSecrets.accessTokenSecret ? 'text' : 'password'}
                placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                value={credentials.accessTokenSecret}
                onChange={e =>
                  setCredentials({
                    ...credentials,
                    accessTokenSecret: e.target.value,
                  })
                }
                disabled={loading}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() =>
                  setShowSecrets({
                    ...showSecrets,
                    accessTokenSecret: !showSecrets.accessTokenSecret,
                  })
                }
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showSecrets.accessTokenSecret ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>

        <Alert>
          <AlertDescription className="text-sm">
            🔒 Your credentials are encrypted before being stored and are never
            shared with anyone.
          </AlertDescription>
        </Alert>

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => setStep('instructions')}
            disabled={loading}
          >
            ← Back
          </Button>
          <Button
            onClick={handleConnect}
            disabled={!isFormValid || loading}
            className="flex-1"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              'Connect Twitter'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
