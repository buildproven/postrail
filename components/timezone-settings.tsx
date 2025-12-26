'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Globe, Loader2, CheckCircle2 } from 'lucide-react'

const COMMON_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)', offset: 'UTC-5/4' },
  { value: 'America/Chicago', label: 'Central Time (CT)', offset: 'UTC-6/5' },
  { value: 'America/Denver', label: 'Mountain Time (MT)', offset: 'UTC-7/6' },
  {
    value: 'America/Los_Angeles',
    label: 'Pacific Time (PT)',
    offset: 'UTC-8/7',
  },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)', offset: 'UTC-9/8' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HST)', offset: 'UTC-10' },
  { value: 'Europe/London', label: 'London (GMT/BST)', offset: 'UTC+0/1' },
  { value: 'Europe/Paris', label: 'Central European (CET)', offset: 'UTC+1/2' },
  { value: 'Europe/Berlin', label: 'Berlin (CET)', offset: 'UTC+1/2' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)', offset: 'UTC+4' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)', offset: 'UTC+8' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)', offset: 'UTC+9' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)', offset: 'UTC+10/11' },
]

export function TimezoneSettings() {
  const [timezone, setTimezone] = useState<string>('')
  const [detectedTimezone, setDetectedTimezone] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  useEffect(() => {
    // Detect browser timezone
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
    setDetectedTimezone(browserTz)

    // Fetch saved timezone
    const fetchTimezone = async () => {
      try {
        const res = await fetch('/api/user/timezone')
        if (res.ok) {
          const data = await res.json()
          setTimezone(data.timezone || browserTz)
        } else {
          setTimezone(browserTz)
        }
      } catch (error) {
        console.error('Failed to fetch timezone:', error)
        setTimezone(browserTz)
      } finally {
        setLoading(false)
      }
    }
    fetchTimezone()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)

    try {
      const res = await fetch('/api/user/timezone', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone }),
      })

      if (res.ok) {
        setMessage({ type: 'success', text: 'Timezone saved!' })
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || 'Failed to save' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to save timezone' })
    } finally {
      setSaving(false)
    }
  }

  const handleUseDetected = () => {
    setTimezone(detectedTimezone)
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  const currentTime = new Date().toLocaleTimeString('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-blue-600" />
          Timezone
        </CardTitle>
        <CardDescription>
          Set your timezone for accurate post scheduling
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current time preview */}
        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="text-sm text-gray-600">
            Current time in your timezone:
          </div>
          <div className="text-xl font-semibold">{currentTime}</div>
        </div>

        {/* Timezone selector */}
        <div className="space-y-2">
          <Label htmlFor="timezone">Select Timezone</Label>
          <select
            id="timezone"
            value={timezone}
            onChange={e => setTimezone(e.target.value)}
            className="w-full h-10 px-3 rounded-md border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {COMMON_TIMEZONES.map(tz => (
              <option key={tz.value} value={tz.value}>
                {tz.label} ({tz.offset})
              </option>
            ))}
            {/* Add detected timezone if not in common list */}
            {!COMMON_TIMEZONES.find(tz => tz.value === detectedTimezone) && (
              <option value={detectedTimezone}>
                {detectedTimezone} (Detected)
              </option>
            )}
          </select>
        </div>

        {/* Use detected button */}
        {timezone !== detectedTimezone && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleUseDetected}
            className="text-sm"
          >
            Use detected: {detectedTimezone}
          </Button>
        )}

        {/* Message */}
        {message && (
          <Alert
            variant={message.type === 'error' ? 'destructive' : 'default'}
            className={
              message.type === 'success' ? 'bg-green-50 border-green-200' : ''
            }
          >
            {message.type === 'success' && (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            )}
            <AlertDescription
              className={message.type === 'success' ? 'text-green-800' : ''}
            >
              {message.text}
            </AlertDescription>
          </Alert>
        )}

        {/* Save Button */}
        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Timezone'
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
