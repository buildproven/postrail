'use client'
import { logger } from '@/lib/logger'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Loader2,
  Wand2,
  ArrowRightLeft,
  Check,
  Lock,
  Sparkles,
} from 'lucide-react'

interface Variant {
  id: string
  style: string
  styleName: string
  content: string
  characterCount: number
}

interface ABVariantsProps {
  postId: string
  originalContent: string
  characterCount: number
  platform: string
  onContentUpdate?: (newContent: string) => void
}

export function ABVariants({
  postId,
  originalContent,
  characterCount,
  platform,
  onContentUpdate,
}: ABVariantsProps) {
  const [variants, setVariants] = useState<Variant[]>([])
  const [generating, setGenerating] = useState(false)
  const [swapping, setSwapping] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPaidFeature, setIsPaidFeature] = useState(false)

  const fetchVariants = async () => {
    try {
      const res = await fetch(`/api/posts/${postId}/variants`)
      if (res.ok) {
        const data = await res.json()
        setVariants(data.variants || [])
      }
    } catch (e) {
      logger.error({ error: e }, 'Failed to fetch variants:')
    }
  }

  const generateVariants = async () => {
    setGenerating(true)
    setError(null)

    try {
      const res = await fetch(`/api/posts/${postId}/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variantCount: 2 }),
      })

      if (res.status === 403) {
        const data = await res.json()
        setIsPaidFeature(true)
        setError(data.message || 'A/B variants require a paid subscription')
        return
      }

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to generate variants')
      }

      const data = await res.json()
      setVariants(data.variants || [])
      setSuccess(
        `Generated ${data.variants.length} variant${data.variants.length > 1 ? 's' : ''}!`
      )
      setTimeout(() => setSuccess(null), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate variants')
    } finally {
      setGenerating(false)
    }
  }

  const swapVariant = async (variantId: string) => {
    setSwapping(variantId)
    setError(null)

    try {
      const res = await fetch(`/api/posts/${postId}/variants`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variantId }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to swap variant')
      }

      const data = await res.json()
      if (onContentUpdate) {
        onContentUpdate(data.newContent)
      }
      setSuccess('Variant is now your main post!')
      // Refresh variants to update the list
      await fetchVariants()
      setTimeout(() => setSuccess(null), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to swap variant')
    } finally {
      setSwapping(null)
    }
  }

  const getCharLimitColor = (count: number) => {
    const limits: Record<string, number> = {
      linkedin: 3000,
      threads: 500,
      facebook: 63206,
      x: 280,
    }
    const limit = limits[platform] || 500
    const ratio = count / limit
    if (ratio > 0.9) return 'text-red-600'
    if (ratio > 0.7) return 'text-yellow-600'
    return 'text-gray-500'
  }

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wand2 className="h-4 w-4 text-purple-600" />
          A/B Variants
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Error/Success Messages */}
        {error && (
          <Alert variant="destructive">
            {isPaidFeature && <Lock className="h-4 w-4" />}
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert className="bg-green-50 border-green-200">
            <Check className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              {success}
            </AlertDescription>
          </Alert>
        )}

        {/* Generate Button */}
        <Button
          onClick={generateVariants}
          disabled={generating || isPaidFeature}
          variant="outline"
          size="sm"
          className="w-full"
        >
          {generating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating variants...
            </>
          ) : isPaidFeature ? (
            <>
              <Lock className="mr-2 h-4 w-4" />
              Upgrade to Generate Variants
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate A/B Variants
            </>
          )}
        </Button>

        {/* Current Post */}
        <div className="p-3 bg-gray-50 rounded-lg border">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-medium text-gray-600">
              Current Post
            </span>
            <span className={`text-xs ${getCharLimitColor(characterCount)}`}>
              {characterCount} chars
            </span>
          </div>
          <p className="text-sm text-gray-800 line-clamp-3">
            {originalContent}
          </p>
        </div>

        {/* Variants List */}
        {variants.length > 0 && (
          <div className="space-y-3">
            <div className="text-sm font-medium text-gray-700">
              Generated Variants ({variants.length})
            </div>
            {variants.map(variant => (
              <div
                key={variant.id}
                className="p-3 border rounded-lg hover:border-purple-200 transition-colors"
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-medium text-purple-600 bg-purple-50 px-2 py-0.5 rounded">
                    {variant.styleName}
                  </span>
                  <span
                    className={`text-xs ${getCharLimitColor(variant.characterCount)}`}
                  >
                    {variant.characterCount} chars
                  </span>
                </div>
                <p className="text-sm text-gray-800 mb-3 line-clamp-3">
                  {variant.content}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => swapVariant(variant.id)}
                  disabled={swapping === variant.id}
                  className="w-full text-xs"
                >
                  {swapping === variant.id ? (
                    <>
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      Swapping...
                    </>
                  ) : (
                    <>
                      <ArrowRightLeft className="mr-1 h-3 w-3" />
                      Use This Variant
                    </>
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {variants.length === 0 && !generating && !isPaidFeature && (
          <p className="text-xs text-gray-500 text-center py-2">
            Generate variants to A/B test different hooks and angles
          </p>
        )}
      </CardContent>
    </Card>
  )
}
