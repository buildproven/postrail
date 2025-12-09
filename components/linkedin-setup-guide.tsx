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

interface LinkedInSetupGuideProps {
  onSuccess?: () => void
}

export function LinkedInSetupGuide({ onSuccess }: LinkedInSetupGuideProps) {
  const [step, setStep] = useState<'instructions' | 'credentials'>(
    'instructions'
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [showToken, setShowToken] = useState(false)

  const [credentials, setCredentials] = useState({
    accessToken: '',
    organizationId: '',
  })

  const handleConnect = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/platforms/linkedin/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.details || data.error || 'Failed to connect LinkedIn'
        )
      }

      setSuccess(true)

      // Clear credentials from state for security
      setCredentials({
        accessToken: '',
        organizationId: '',
      })

      if (onSuccess) {
        setTimeout(() => {
          onSuccess()
        }, 2000)
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to connect LinkedIn account'
      )
    } finally {
      setLoading(false)
    }
  }

  const isFormValid = credentials.accessToken && credentials.organizationId

  if (success) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
            <CardTitle className="text-green-900">
              LinkedIn Connected!
            </CardTitle>
          </div>
          <CardDescription className="text-green-700">
            Your LinkedIn Company Page is now connected and ready to use.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (step === 'instructions') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Connect LinkedIn Company Page</CardTitle>
          <CardDescription>
            To connect LinkedIn, you&apos;ll need a LinkedIn Developer App and a
            Company Page you&apos;re an admin of.
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
                  <p className="font-medium">Create LinkedIn Developer App</p>
                  <p className="text-gray-600">
                    Go to{' '}
                    <a
                      href="https://www.linkedin.com/developers/apps"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline inline-flex items-center gap-1"
                    >
                      LinkedIn Developer Portal
                      <ExternalLink className="h-3 w-3" />
                    </a>{' '}
                    → Click &quot;Create app&quot; → Link it to your Company
                    Page
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold">
                  2
                </div>
                <div>
                  <p className="font-medium">Verify Your App</p>
                  <p className="text-gray-600">
                    Go to Settings tab → Click &quot;Verify&quot; → Follow the
                    verification process with your Company Page
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold">
                  3
                </div>
                <div>
                  <p className="font-medium">Add Required Products</p>
                  <p className="text-gray-600">
                    Go to Products tab → Request access to:
                  </p>
                  <ul className="list-disc list-inside text-gray-600 ml-4 mt-1">
                    <li>
                      <strong>Share on LinkedIn</strong> (required for posting)
                    </li>
                    <li>
                      <strong>
                        Sign In with LinkedIn using OpenID Connect
                      </strong>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold">
                  4
                </div>
                <div>
                  <p className="font-medium">Generate Access Token</p>
                  <p className="text-gray-600">
                    Go to{' '}
                    <a
                      href="https://www.linkedin.com/developers/tools/oauth/token-generator"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline inline-flex items-center gap-1"
                    >
                      OAuth Token Generator
                      <ExternalLink className="h-3 w-3" />
                    </a>{' '}
                    → Select your app → Check all scopes → Generate token
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold">
                  5
                </div>
                <div>
                  <p className="font-medium">Get Organization ID</p>
                  <p className="text-gray-600">
                    Go to your Company Page → Look at the URL:
                    <code className="bg-gray-100 px-1 rounded text-xs ml-1">
                      linkedin.com/company/12345678
                    </code>
                    → The number is your Organization ID
                  </p>
                </div>
              </div>
            </div>
          </div>

          <Alert>
            <AlertDescription className="text-sm">
              <strong>Note:</strong> LinkedIn access tokens expire in 60 days.
              You&apos;ll need to regenerate and reconnect when expired.
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
        <CardTitle>Enter LinkedIn Credentials</CardTitle>
        <CardDescription>
          Paste your access token and Organization ID from the LinkedIn
          Developer Portal
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
            <Label htmlFor="accessToken">Access Token</Label>
            <div className="relative">
              <Input
                id="accessToken"
                type={showToken ? 'text' : 'password'}
                placeholder="AQV..."
                value={credentials.accessToken}
                onChange={e =>
                  setCredentials({
                    ...credentials,
                    accessToken: e.target.value,
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
            <Label htmlFor="organizationId">
              Organization ID (Company Page ID)
            </Label>
            <Input
              id="organizationId"
              type="text"
              placeholder="12345678"
              value={credentials.organizationId}
              onChange={e =>
                setCredentials({
                  ...credentials,
                  organizationId: e.target.value,
                })
              }
              disabled={loading}
            />
            <p className="text-xs text-gray-500 mt-1">
              Find this in your Company Page URL: linkedin.com/company/
              <strong>12345678</strong>
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
              'Connect LinkedIn'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
