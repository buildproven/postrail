'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckCircle2, Loader2, XCircle, ExternalLink, Key } from 'lucide-react'

interface PlatformConnection {
  platform: string
  connected: boolean
  username?: string
  connectedAt?: string
  isActive?: boolean
}

export default function PlatformsPage() {
  const searchParams = useSearchParams()
  const [connections, setConnections] = useState<
    Record<string, PlatformConnection>
  >({
    twitter: { platform: 'twitter', connected: false },
    linkedin: { platform: 'linkedin', connected: false },
    threads: { platform: 'threads', connected: false },
    facebook: { platform: 'facebook', connected: false },
  })
  const [loading, setLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [message, setMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)
  const [byokPlatform, setByokPlatform] = useState<string | null>(null)
  const [byokSaving, setByokSaving] = useState(false)
  const [byokCredentials, setByokCredentials] = useState<
    Record<string, string>
  >({})

  useEffect(() => {
    // Check for OAuth callback results
    const success = searchParams.get('success')
    const error = searchParams.get('error')

    if (success) {
      setMessage({
        type: 'success',
        text: `${success.charAt(0).toUpperCase() + success.slice(1)} connected successfully!`,
      })
      // Clear URL params
      window.history.replaceState({}, '', '/dashboard/platforms')
    } else if (error) {
      setMessage({ type: 'error', text: decodeURIComponent(error) })
      window.history.replaceState({}, '', '/dashboard/platforms')
    }

    checkConnections()
  }, [searchParams])

  const checkConnections = async () => {
    setLoading(true)
    try {
      // Check all platform connections in parallel
      const [twitterRes, linkedinRes, facebookRes] = await Promise.all([
        fetch('/api/platforms/twitter/connect'),
        fetch('/api/platforms/linkedin/connect'),
        fetch('/api/platforms/facebook/connect'),
      ])

      // Process Twitter
      if (twitterRes.ok) {
        const data = await twitterRes.json()
        if (data.connected) {
          setConnections(prev => ({
            ...prev,
            twitter: {
              platform: 'twitter',
              connected: true,
              username: data.username,
              connectedAt: data.connectedAt,
              isActive: data.isActive,
            },
          }))
        }
      }

      // Process LinkedIn
      if (linkedinRes.ok) {
        const data = await linkedinRes.json()
        if (data.connected) {
          setConnections(prev => ({
            ...prev,
            linkedin: {
              platform: 'linkedin',
              connected: true,
              username: data.organizationName || data.username,
              connectedAt: data.connectedAt,
              isActive: data.isActive,
            },
          }))
        }
      }

      // Process Facebook
      if (facebookRes.ok) {
        const data = await facebookRes.json()
        if (data.connected) {
          setConnections(prev => ({
            ...prev,
            facebook: {
              platform: 'facebook',
              connected: true,
              username: data.pageName,
              connectedAt: data.connectedAt,
              isActive: data.isActive,
            },
          }))
        }
      }
    } catch (error) {
      console.error('Error checking connections:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleConnect = async (platform: string) => {
    // All platforms use OAuth 1-click connect
    setConnecting(platform)
    window.location.href = `/api/platforms/${platform}/auth`
  }

  const handleDisconnect = async (platform: string) => {
    if (
      !confirm(
        `Are you sure you want to disconnect ${platform}? You'll need to reconnect to post.`
      )
    ) {
      return
    }

    setDisconnecting(platform)
    try {
      const response = await fetch(`/api/platforms/${platform}/connect`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setConnections(prev => ({
          ...prev,
          [platform]: { platform, connected: false },
        }))
        setMessage({
          type: 'success',
          text: `${platform.charAt(0).toUpperCase() + platform.slice(1)} disconnected`,
        })
      } else {
        const data = await response.json()
        setMessage({
          type: 'error',
          text: data.error || 'Failed to disconnect',
        })
      }
    } catch (error) {
      console.error('Error disconnecting:', error)
      setMessage({ type: 'error', text: 'Failed to disconnect platform' })
    } finally {
      setDisconnecting(null)
    }
  }

  interface ByokField {
    key: string
    label: string
    placeholder: string
    type?: string
    required?: boolean
  }

  const getByokFields = (platform: string): ByokField[] => {
    switch (platform) {
      case 'twitter':
        return [
          {
            key: 'apiKey',
            label: 'API Key',
            placeholder: 'Your Twitter API Key',
          },
          {
            key: 'apiSecret',
            label: 'API Secret',
            placeholder: 'Your Twitter API Secret',
            type: 'password',
          },
          {
            key: 'accessToken',
            label: 'Access Token',
            placeholder: 'Your Access Token',
          },
          {
            key: 'accessTokenSecret',
            label: 'Access Token Secret',
            placeholder: 'Your Access Token Secret',
            type: 'password',
          },
        ]
      case 'linkedin':
        return [
          {
            key: 'accessToken',
            label: 'Access Token',
            placeholder: 'Your LinkedIn Access Token',
            type: 'password',
          },
          {
            key: 'organizationId',
            label: 'Organization ID (optional)',
            placeholder: 'e.g., 12345678',
            required: false,
          },
        ]
      case 'facebook':
        return [
          {
            key: 'pageAccessToken',
            label: 'Page Access Token',
            placeholder: 'Your Facebook Page Access Token',
            type: 'password',
          },
          {
            key: 'pageId',
            label: 'Page ID',
            placeholder: 'Your Facebook Page ID',
          },
          {
            key: 'pageName',
            label: 'Page Name',
            placeholder: 'Your Page Name (for display)',
          },
        ]
      default:
        return []
    }
  }

  const handleByokOpen = (platform: string) => {
    setByokCredentials({})
    setByokPlatform(platform)
  }

  const handleByokSave = async () => {
    if (!byokPlatform) return

    const fields = getByokFields(byokPlatform)
    const requiredFields = fields.filter(f => f.required !== false)
    const missingFields = requiredFields.filter(
      f => !byokCredentials[f.key]?.trim()
    )

    if (missingFields.length > 0) {
      setMessage({
        type: 'error',
        text: `Please fill in: ${missingFields.map(f => f.label).join(', ')}`,
      })
      return
    }

    setByokSaving(true)
    try {
      // API expects credentials directly, not wrapped
      const response = await fetch(`/api/platforms/${byokPlatform}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(byokCredentials),
      })

      const data = await response.json()

      if (response.ok) {
        setConnections(prev => ({
          ...prev,
          [byokPlatform]: {
            platform: byokPlatform,
            connected: true,
            username:
              data.username ||
              data.pageName ||
              data.organizationName ||
              byokCredentials.pageName ||
              'Connected',
            connectedAt: new Date().toISOString(),
            isActive: true,
          },
        }))
        setMessage({
          type: 'success',
          text: `${byokPlatform.charAt(0).toUpperCase() + byokPlatform.slice(1)} connected with your API keys!`,
        })
        setByokPlatform(null)
      } else {
        setMessage({
          type: 'error',
          text: data.error || data.details || 'Failed to save credentials',
        })
      }
    } catch (error) {
      console.error('Error saving BYOK credentials:', error)
      setMessage({ type: 'error', text: 'Failed to save credentials' })
    } finally {
      setByokSaving(false)
    }
  }

  const platforms = [
    {
      name: 'Twitter/X',
      id: 'twitter',
      description: 'Share concise, engaging updates with your followers',
      icon: '𝕏',
      status: connections.twitter.connected ? 'Connected' : 'Available',
      available: true,
      comingSoon: false,
      note: '1-click OAuth - post tweets to your X account',
      oauthFlow: true,
    },
    {
      name: 'LinkedIn',
      id: 'linkedin',
      description:
        'Share professional content with your network or Company Page',
      icon: '💼',
      status: connections.linkedin.connected ? 'Connected' : 'Available',
      available: true,
      comingSoon: false,
      note: '1-click OAuth - posts to your profile or Company Page',
      oauthFlow: true,
    },
    {
      name: 'Threads',
      id: 'threads',
      description: 'Engage with your audience in conversations',
      icon: '🧵',
      status: 'Coming Soon',
      available: false,
      comingSoon: true,
      note: '',
      oauthFlow: false,
    },
    {
      name: 'Facebook',
      id: 'facebook',
      description: 'Reach your community with story-driven Page posts',
      icon: '👥',
      status: connections.facebook.connected ? 'Connected' : 'Available',
      available: true,
      comingSoon: false,
      note: '1-click OAuth - posts to your Facebook Page',
      oauthFlow: true,
    },
  ]

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Social Media Platforms</h1>
          <p className="text-gray-600 mt-1">
            Connect and manage your social media accounts
          </p>
        </div>
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Social Media Platforms</h1>
        <p className="text-gray-600 mt-1">
          Connect and manage your social media accounts
        </p>
      </div>

      {/* Status Message */}
      {message && (
        <Alert
          variant={message.type === 'error' ? 'destructive' : 'default'}
          className={
            message.type === 'success' ? 'bg-green-50 border-green-200' : ''
          }
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          <AlertDescription
            className={message.type === 'success' ? 'text-green-800' : ''}
          >
            {message.text}
          </AlertDescription>
        </Alert>
      )}

      {/* Platform Cards */}
      <div className="grid md:grid-cols-2 gap-6">
        {platforms.map(platform => {
          const connection = connections[platform.id]
          const isConnected = connection?.connected

          return (
            <Card
              key={platform.id}
              className={platform.comingSoon ? 'opacity-60' : ''}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-4xl">{platform.icon}</div>
                    <div>
                      <CardTitle className="text-xl">{platform.name}</CardTitle>
                      <CardDescription className="mt-1">
                        {platform.description}
                      </CardDescription>
                    </div>
                  </div>
                  {isConnected && (
                    <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {isConnected ? (
                  <div className="space-y-3">
                    <Alert className="bg-green-50 border-green-200">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-green-800">
                        Connected as{' '}
                        <strong>
                          {platform.id === 'twitter' ? '@' : ''}
                          {connection.username}
                        </strong>
                      </AlertDescription>
                    </Alert>
                    <Button
                      variant="outline"
                      onClick={() => handleDisconnect(platform.id)}
                      disabled={disconnecting === platform.id}
                      className="w-full"
                    >
                      {disconnecting === platform.id ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Disconnecting...
                        </>
                      ) : (
                        'Disconnect'
                      )}
                    </Button>
                  </div>
                ) : platform.available ? (
                  <div className="space-y-3">
                    {platform.note && (
                      <p className="text-sm text-gray-500">{platform.note}</p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleConnect(platform.id)}
                        disabled={connecting === platform.id}
                        className="flex-1"
                      >
                        {connecting === platform.id ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Connecting...
                          </>
                        ) : platform.oauthFlow ? (
                          <>
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Connect
                          </>
                        ) : (
                          `Connect`
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleByokOpen(platform.id)}
                        title="Use your own API keys"
                      >
                        <Key className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-gray-400 text-center">
                      Or{' '}
                      <button
                        onClick={() => handleByokOpen(platform.id)}
                        className="text-blue-500 hover:underline"
                      >
                        use your own API keys
                      </button>
                    </p>
                  </div>
                ) : (
                  <Button disabled variant="outline" className="w-full">
                    {platform.status}
                  </Button>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Info Section */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-900">
            Platform Integration Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-blue-800">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong>Twitter/X:</strong> 1-click OAuth or bring your own API
                keys
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong>LinkedIn:</strong> 1-click OAuth or bring your own
                access token
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong>Facebook:</strong> 1-click OAuth or bring your own page
                access token
              </div>
            </div>
            <div className="flex items-start gap-2">
              <XCircle className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <strong>Threads:</strong> Coming soon - waiting for Meta API
                availability
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* BYOK Dialog */}
      <Dialog
        open={byokPlatform !== null}
        onOpenChange={open => !open && setByokPlatform(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Use Your Own API Keys
            </DialogTitle>
            <DialogDescription>
              Enter your {byokPlatform?.charAt(0).toUpperCase()}
              {byokPlatform?.slice(1)} API credentials. Your keys are encrypted
              and stored securely.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {byokPlatform &&
              getByokFields(byokPlatform).map(field => (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={field.key}>
                    {field.label}
                    {field.required !== false && (
                      <span className="text-red-500 ml-1">*</span>
                    )}
                  </Label>
                  <Input
                    id={field.key}
                    type={field.type || 'text'}
                    placeholder={field.placeholder}
                    value={byokCredentials[field.key] || ''}
                    onChange={e =>
                      setByokCredentials(prev => ({
                        ...prev,
                        [field.key]: e.target.value,
                      }))
                    }
                  />
                </div>
              ))}
            {byokPlatform === 'twitter' && (
              <Alert className="bg-amber-50 border-amber-200">
                <AlertDescription className="text-amber-800 text-sm">
                  Get your API keys from the{' '}
                  <a
                    href="https://developer.twitter.com/en/portal/projects-and-apps"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Twitter Developer Portal
                  </a>
                </AlertDescription>
              </Alert>
            )}
            {byokPlatform === 'linkedin' && (
              <Alert className="bg-amber-50 border-amber-200">
                <AlertDescription className="text-amber-800 text-sm">
                  Get your access token from the{' '}
                  <a
                    href="https://www.linkedin.com/developers/apps"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    LinkedIn Developer Portal
                  </a>
                </AlertDescription>
              </Alert>
            )}
            {byokPlatform === 'facebook' && (
              <Alert className="bg-amber-50 border-amber-200">
                <AlertDescription className="text-amber-800 text-sm">
                  Get your Page Access Token from the{' '}
                  <a
                    href="https://developers.facebook.com/tools/explorer/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Graph API Explorer
                  </a>
                </AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setByokPlatform(null)}>
              Cancel
            </Button>
            <Button onClick={handleByokSave} disabled={byokSaving}>
              {byokSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Credentials'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
