'use client'
import { logger } from '@/lib/logger'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  MessageSquare,
  Smile,
  Hash,
  PenTool,
} from 'lucide-react'

interface ToneOption {
  value: string
  label: string
  description: string
}

interface ToneSettings {
  voice: string
  formality: string
  emoji_level: string
  hashtag_style: string
  custom_instructions: string | null
}

interface ToneOptions {
  voice: ToneOption[]
  formality: ToneOption[]
  emoji_level: ToneOption[]
  hashtag_style: ToneOption[]
}

export function AiToneSettings() {
  const [tone, setTone] = useState<ToneSettings | null>(null)
  const [options, setOptions] = useState<ToneOptions | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)
  const [customInstructions, setCustomInstructions] = useState('')

  useEffect(() => {
    const fetchTone = async () => {
      try {
        const res = await fetch('/api/user/ai-tone')
        if (res.ok) {
          const data = await res.json()
          setTone(data.tone)
          setOptions(data.options)
          setCustomInstructions(data.tone.custom_instructions || '')
        }
      } catch (error) {
        logger.error(
          { error },
          'Failed to fetch AI tone settings from server - network or API error'
        )
        setMessage({
          type: 'error',
          text: 'Unable to load AI tone settings. Using defaults. Please refresh the page to try again.',
        })
      } finally {
        setLoading(false)
      }
    }
    fetchTone()
  }, [])

  const handleSave = async () => {
    if (!tone) return

    setSaving(true)
    setMessage(null)

    try {
      const res = await fetch('/api/user/ai-tone', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...tone,
          custom_instructions: customInstructions || null,
        }),
      })

      if (res.ok) {
        setMessage({ type: 'success', text: 'AI tone preferences saved!' })
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || 'Failed to save' })
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      logger.error(
        { error, tone },
        'Failed to save AI tone settings - API request failed'
      )
      setMessage({
        type: 'error',
        text: `Failed to save settings: ${errorMessage}. Please try again.`,
      })
    } finally {
      setSaving(false)
    }
  }

  const updateTone = (key: keyof ToneSettings, value: string) => {
    if (tone) {
      setTone({ ...tone, [key]: value })
    }
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

  if (!tone || !options) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-600" />
          AI Writing Style
        </CardTitle>
        <CardDescription>
          Customize how Claude generates your social media posts
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Voice */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-gray-500" />
            <Label className="font-medium">Voice</Label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {options.voice.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => updateTone('voice', opt.value)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  tone.voice === opt.value
                    ? 'border-purple-500 bg-purple-50 ring-1 ring-purple-500'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-medium text-sm">{opt.label}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {opt.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Formality */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <PenTool className="h-4 w-4 text-gray-500" />
            <Label className="font-medium">Formality</Label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {options.formality.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => updateTone('formality', opt.value)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  tone.formality === opt.value
                    ? 'border-purple-500 bg-purple-50 ring-1 ring-purple-500'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-medium text-sm">{opt.label}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {opt.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Emoji Level */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Smile className="h-4 w-4 text-gray-500" />
            <Label className="font-medium">Emoji Usage</Label>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {options.emoji_level.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => updateTone('emoji_level', opt.value)}
                className={`p-3 rounded-lg border text-center transition-all ${
                  tone.emoji_level === opt.value
                    ? 'border-purple-500 bg-purple-50 ring-1 ring-purple-500'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-medium text-sm">{opt.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Hashtag Style */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-gray-500" />
            <Label className="font-medium">Hashtag Style</Label>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {options.hashtag_style.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => updateTone('hashtag_style', opt.value)}
                className={`p-3 rounded-lg border text-center transition-all ${
                  tone.hashtag_style === opt.value
                    ? 'border-purple-500 bg-purple-50 ring-1 ring-purple-500'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-medium text-sm">{opt.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Custom Instructions */}
        <div className="space-y-3">
          <Label htmlFor="customInstructions" className="font-medium">
            Custom Instructions (Optional)
          </Label>
          <Textarea
            id="customInstructions"
            value={customInstructions}
            onChange={e => setCustomInstructions(e.target.value)}
            placeholder="Add any specific style notes, industry jargon to use, or topics to avoid..."
            className="resize-none"
            rows={3}
            maxLength={500}
          />
          <p className="text-xs text-gray-500 text-right">
            {customInstructions.length}/500 characters
          </p>
        </div>

        {/* Preview */}
        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="text-sm font-medium text-gray-700 mb-2">
            Preview Style:
          </div>
          <p className="text-sm text-gray-600">
            {tone.voice === 'professional' && '📊 '}
            {tone.voice === 'casual' && '👋 '}
            {tone.voice === 'witty' && '😏 '}
            {tone.voice === 'inspirational' && '✨ '}
            <span className="capitalize">{tone.voice}</span> voice,{' '}
            <span>{tone.formality}</span> formality,{' '}
            <span>{tone.emoji_level}</span> emojis,{' '}
            <span>{tone.hashtag_style}</span> hashtags
          </p>
        </div>

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
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Save AI Preferences
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
