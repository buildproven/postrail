'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { TwitterSetupGuide } from '@/components/twitter-setup-guide'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'

interface PlatformConnection {
  platform: string
  connected: boolean
  username?: string
  connectedAt?: string
  isActive?: boolean
}

export default function PlatformsPage() {
  const [connections, setConnections] = useState<Record<string, PlatformConnection>>({
    twitter: { platform: 'twitter', connected: false },
    linkedin: { platform: 'linkedin', connected: false },
    threads: { platform: 'threads', connected: false },
    facebook: { platform: 'facebook', connected: false },
  })
  const [loading, setLoading] = useState(true)
  const [showTwitterSetup, setShowTwitterSetup] = useState(false)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)

  useEffect(() => {
    checkConnections()
  }, [])

  const checkConnections = async () => {
    setLoading(true)
    try {
      // Check Twitter connection
      const twitterRes = await fetch('/api/platforms/twitter/connect')
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
    } catch (error) {
      console.error('Error checking connections:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnect = async (platform: string) => {
    if (!confirm(`Are you sure you want to disconnect ${platform}? You'll need to reconnect to post.`)) {
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
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to disconnect')
      }
    } catch (error) {
      console.error('Error disconnecting:', error)
      alert('Failed to disconnect platform')
    } finally {
      setDisconnecting(null)
    }
  }

  const platforms = [
    {
      name: 'Twitter',
      id: 'twitter',
      description: 'Share concise, engaging updates with your followers',
      icon: '𝕏',
      status: connections.twitter.connected ? 'Connected' : 'Available',
      available: true,
      comingSoon: false,
    },
    {
      name: 'LinkedIn',
      id: 'linkedin',
      description: 'Share professional content with your network',
      icon: '💼',
      status: 'Coming Soon',
      available: false,
      comingSoon: true,
    },
    {
      name: 'Threads',
      id: 'threads',
      description: 'Engage with your audience in conversations',
      icon: '🧵',
      status: 'Coming Soon',
      available: false,
      comingSoon: true,
    },
    {
      name: 'Facebook',
      id: 'facebook',
      description: 'Reach your community with story-driven posts',
      icon: '👥',
      status: 'Coming Soon',
      available: false,
      comingSoon: true,
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

      {/* Twitter Setup Modal */}
      {showTwitterSetup && (
        <div className="mb-6">
          <TwitterSetupGuide
            onSuccess={() => {
              setShowTwitterSetup(false)
              checkConnections()
            }}
          />
        </div>
      )}

      {/* Platform Cards */}
      <div className="grid md:grid-cols-2 gap-6">
        {platforms.map((platform) => {
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
                        Connected as <strong>@{connection.username}</strong>
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
                    <Alert>
                      <AlertDescription className="text-sm">
                        <strong>BYOK (Bring Your Own Keys):</strong> You&apos;ll use your own Twitter
                        API credentials for 500 posts/month on the free tier.
                      </AlertDescription>
                    </Alert>
                    <Button
                      onClick={() => setShowTwitterSetup(true)}
                      className="w-full"
                    >
                      Connect {platform.name}
                    </Button>
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
          <CardTitle className="text-blue-900">Platform Integration Roadmap</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-blue-800">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong>Twitter (Available Now):</strong> BYOK integration - use your own API keys
                for 500 posts/month on free tier
              </div>
            </div>
            <div className="flex items-start gap-2">
              <XCircle className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <strong>LinkedIn (Coming Soon):</strong> OAuth integration for seamless posting to
                your professional network
              </div>
            </div>
            <div className="flex items-start gap-2">
              <XCircle className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <strong>Threads & Facebook (Coming Soon):</strong> Meta platform integration for
                community engagement
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
