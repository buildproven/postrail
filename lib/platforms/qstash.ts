import { Client, Receiver } from '@upstash/qstash'

const missing: string[] = []
if (!process.env.QSTASH_TOKEN) missing.push('QSTASH_TOKEN')
if (!process.env.QSTASH_CURRENT_SIGNING_KEY) missing.push('QSTASH_CURRENT_SIGNING_KEY')
if (!process.env.QSTASH_PROCESS_URL) missing.push('QSTASH_PROCESS_URL')
if (missing.length) {
  console.warn(`QStash: missing ${missing.join(', ')}; queueing will be disabled until set`)
}

const client = process.env.QSTASH_TOKEN
  ? new Client({ token: process.env.QSTASH_TOKEN })
  : null

const receiver = process.env.QSTASH_CURRENT_SIGNING_KEY
  ? new Receiver({
      currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
      nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
    })
  : null

export async function publishGenerationJob(jobId: string) {
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

export function verifyQStashSignature(signature: string | null, body: string, url: string) {
  if (!receiver) throw new Error('QStash receiver not configured')
  if (!signature) return false
  return receiver.verify({ signature, body, url })
}
