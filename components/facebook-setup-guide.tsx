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

interface FacebookSetupGuideProps {
  onSuccess?: () => void
}

export function FacebookSetupGuide({ onSuccess }: FacebookSetupGuideProps) {
  const [step, setStep] = useState<'instructions' | 'credentials'>(
    'instructions'
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [showToken, setShowToken] = useState(false)

  const [credentials, setCredentials] = useState({
    pageAccessToken: '',
    pageId: '',
  })

  const handleConnect = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/platforms/facebook/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.details || data.error || 'Failed to connect Facebook'
        )
      }

      setSuccess(true)

      // Clear credentials from state for security
      setCredentials({
        pageAccessToken: '',
        pageId: '',
      })

      if (onSuccess) {
        setTimeout(() => {
          onSuccess()
        }, 2000)
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to connect Facebook Page'
      )
    } finally {
      setLoading(false)
    }
  }

  const isFormValid = credentials.pageAccessToken && credentials.pageId

  if (success) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
            <CardTitle className="text-green-900">
              Facebook Connected!
            </CardTitle>
          </div>
          <CardDescription className="text-green-700">
            Your Facebook Page is now connected and ready to use.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (step === 'instructions') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Connect Facebook Page</CardTitle>
          <CardDescription>
            To connect Facebook, you&apos;ll need a Meta Developer App and a
            Facebook Page you manage.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <h4 className="font-semibold flex items-center gap-2">
              📋 Setup Instructions (~15 minutes)
            </h4>

            <div className="space-y-3 text-sm">
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold">
                  1
                </div>
                <div>
                  <p className="font-medium">Create Meta Developer App</p>
                  <p className="text-gray-600">
                    Go to{' '}
                    <a
                      href="https://developers.facebook.com/apps/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline inline-flex items-center gap-1"
                    >
                      Meta for Developers
                      <ExternalLink className="h-3 w-3" />
                    </a>{' '}
                    → Click &quot;Create App&quot; → Select &quot;Business&quot;
                    type
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold">
                  2
                </div>
                <div>
                  <p className="font-medium">Add Products</p>
                  <p className="text-gray-600">
                    In your app dashboard → Add Products → Add{' '}
                    <strong>Facebook Login for Business</strong>
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold">
                  3
                </div>
                <div>
                  <p className="font-medium">Get Page Access Token</p>
                  <p className="text-gray-600">
                    Go to{' '}
                    <a
                      href="https://developers.facebook.com/tools/explorer/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline inline-flex items-center gap-1"
                    >
                      Graph API Explorer
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    :
                  </p>
                  <ul className="list-disc list-inside text-gray-600 ml-4 mt-1">
                    <li>Select your App</li>
                    <li>
                      Click &quot;Get Token&quot; → &quot;Get Page Access
                      Token&quot;
                    </li>
                    <li>Select your Page and grant permissions</li>
                    <li>
                      Add permissions:{' '}
                      <code className="bg-gray-100 px-1 rounded text-xs">
                        pages_manage_posts
                      </code>
                      ,{' '}
                      <code className="bg-gray-100 px-1 rounded text-xs">
                        pages_read_engagement
                      </code>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold">
                  4
                </div>
                <div>
                  <p className="font-medium">
                    Convert to Long-Lived Token (Recommended)
                  </p>
                  <p className="text-gray-600">
                    In Graph API Explorer, exchange for a long-lived token:
                  </p>
                  <code className="block bg-gray-100 px-2 py-1 rounded text-xs mt-1 overflow-x-auto">
                    GET
                    /oauth/access_token?grant_type=fb_exchange_token&client_id=APP_ID&client_secret=APP_SECRET&fb_exchange_token=SHORT_TOKEN
                  </code>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold">
                  5
                </div>
                <div>
                  <p className="font-medium">Get Page ID</p>
                  <p className="text-gray-600">
                    Go to your Facebook Page → About → Page ID is listed at the
                    bottom. Or find it in the Page URL if you have a numeric
                    URL.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <Alert>
            <AlertDescription className="text-sm">
              <strong>Note:</strong> Short-lived tokens expire in ~1 hour.
              Long-lived tokens last ~60 days. We recommend converting to a
              long-lived token.
            </AlertDescription>
          </Alert>

          <div className="flex gap-3">
            <Button onClick={() => setStep('credentials')} className="w-full">
              I Have My Credentials →
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enter Facebook Credentials</CardTitle>
        <CardDescription>
          Paste your Page Access Token and Page ID from the Meta Developer
          Portal
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
            <Label htmlFor="pageAccessToken">Page Access Token</Label>
            <div className="relative">
              <Input
                id="pageAccessToken"
                type={showToken ? 'text' : 'password'}
                placeholder="EAABs..."
                value={credentials.pageAccessToken}
                onChange={e =>
                  setCredentials({
                    ...credentials,
                    pageAccessToken: e.target.value,
                  })
                }
                disabled={loading}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showToken ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div>
            <Label htmlFor="pageId">Page ID</Label>
            <Input
              id="pageId"
              type="text"
              placeholder="123456789012345"
              value={credentials.pageId}
              onChange={e =>
                setCredentials({ ...credentials, pageId: e.target.value })
              }
              disabled={loading}
            />
            <p className="text-xs text-gray-500 mt-1">
              Find this in Page Settings → About → Page ID
            </p>
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
              'Connect Facebook'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
