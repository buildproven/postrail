import { Client, Receiver } from '@upstash/qstash'
import { observability } from '@/lib/observability'
import { logger } from '@/lib/logger'

// Skip validation during Next.js build phase
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build'

let client: Client | null = null
let receiver: Receiver | null = null
let configValidated = false

function validateAndInitialize() {
  if (configValidated) return
  configValidated = true

  const missing: string[] = []
  if (!process.env.QSTASH_TOKEN) missing.push('QSTASH_TOKEN')
  if (!process.env.QSTASH_CURRENT_SIGNING_KEY)
    missing.push('QSTASH_CURRENT_SIGNING_KEY')
  if (!process.env.QSTASH_PROCESS_URL) missing.push('QSTASH_PROCESS_URL')

  if (missing.length > 0) {
    const errorMsg = `QStash configuration incomplete: missing ${missing.join(', ')}`

    if (process.env.NODE_ENV === 'production' && !isBuildPhase) {
      // FAIL FAST at runtime in production - post scheduling is a critical feature
      observability.fatal(errorMsg, {
        metadata: {
          missingVars: missing,
          feature: 'post_scheduling',
          impact: 'Scheduled posts will fail silently',
        },
      })
      throw new Error(
        `${errorMsg}. Post scheduling unavailable. Set these environment variables.`
      )
    } else {
      // Warn in development/build but allow startup
      logger.warn(`⚠️  ${errorMsg}`)
      logger.warn('⚠️  Post scheduling features will be disabled')
    }
    return
  }

  client = new Client({ token: process.env.QSTASH_TOKEN! })
  receiver = new Receiver({
    currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
    nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY ?? '',
  })
}

export function isQStashConfigured(): boolean {
  validateAndInitialize()
  return client !== null
}

export async function publishGenerationJob(jobId: string) {
  validateAndInitialize()
  if (!client) throw new Error('QStash client not configured')
  const url = process.env.QSTASH_PROCESS_URL!

  return client.publishJSON({
    url,
    body: { jobId },
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

export async function schedulePost(socialPostId: string, scheduledTime: Date) {
  validateAndInitialize()
  if (!client) throw new Error('QStash client not configured')

  const publishUrl = process.env.QSTASH_PROCESS_URL!.replace(
    '/process',
    '/publish'
  )
  const delaySeconds = Math.max(
    0,
    Math.floor((scheduledTime.getTime() - Date.now()) / 1000)
  )

  if (delaySeconds <= 0) {
    return client.publishJSON({
      url: publishUrl,
      body: { jobId: socialPostId },
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return client.publishJSON({
    url: publishUrl,
    body: { jobId: socialPostId },
    headers: { 'Content-Type': 'application/json' },
    delay: delaySeconds,
  })
}

export async function cancelScheduledPost(messageId: string) {
  validateAndInitialize()
  if (!client) throw new Error('QStash client not configured')
  return client.messages.delete(messageId)
}

export function verifyQStashSignature(
  signature: string | null,
  body: string,
  url: string
) {
  validateAndInitialize()
  if (!receiver) throw new Error('QStash receiver not configured')
  if (!signature) return false
  return receiver.verify({ signature, body, url })
}
