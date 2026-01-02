/**
 * Alert Integration
 *
 * Sends critical alerts to external monitoring systems (Slack, PagerDuty, etc.)
 * Used for production incidents that require immediate attention.
 *
 * Configuration via environment variables:
 * - SLACK_WEBHOOK_URL: Slack incoming webhook for critical alerts
 * - PAGERDUTY_INTEGRATION_KEY: PagerDuty Events API v2 integration key
 */

import { logger } from '@/lib/logger'

export interface AlertOptions {
  severity: 'critical' | 'warning' | 'info'
  title: string
  message: string
  metadata?: Record<string, unknown>
  timestamp?: string
}

class AlertManager {
  private readonly slackWebhookUrl: string | undefined
  private readonly pagerDutyKey: string | undefined

  constructor() {
    this.slackWebhookUrl = process.env.SLACK_WEBHOOK_URL
    this.pagerDutyKey = process.env.PAGERDUTY_INTEGRATION_KEY
  }

  /**
   * Send critical alert to all configured channels
   */
  async sendAlert(options: AlertOptions): Promise<void> {
    const timestamp = options.timestamp || new Date().toISOString()

    // Log locally first
    logger.error(
      {
        type: 'alert',
        severity: options.severity,
        message: options.message,
        metadata: options.metadata,
        timestamp,
      },
      `[ALERT] ${options.title}`
    )

    // Send to Slack if configured
    if (this.slackWebhookUrl) {
      await this.sendSlackAlert(options).catch(error => {
        logger.error({ error }, 'Failed to send Slack alert')
      })
    }

    // Send to PagerDuty if configured and severity is critical
    if (this.pagerDutyKey && options.severity === 'critical') {
      await this.sendPagerDutyAlert(options).catch(error => {
        logger.error({ error }, 'Failed to send PagerDuty alert')
      })
    }

    // If no alerting configured, log warning
    if (!this.slackWebhookUrl && !this.pagerDutyKey) {
      logger.warn(
        '⚠️  Alert sent but no external alerting configured (Slack/PagerDuty)'
      )
    }
  }

  /**
   * Send alert to Slack via incoming webhook
   */
  private async sendSlackAlert(options: AlertOptions): Promise<void> {
    if (!this.slackWebhookUrl) return

    const color = {
      critical: '#FF0000',
      warning: '#FFA500',
      info: '#0066CC',
    }[options.severity]

    const emoji = {
      critical: ':rotating_light:',
      warning: ':warning:',
      info: ':information_source:',
    }[options.severity]

    const payload = {
      attachments: [
        {
          color,
          title: `${emoji} ${options.title}`,
          text: options.message,
          fields: options.metadata
            ? Object.entries(options.metadata).map(([key, value]) => ({
                title: key,
                value: String(value),
                short: true,
              }))
            : undefined,
          footer: 'PostRail Alert System',
          ts: Math.floor(
            new Date(options.timestamp || Date.now()).getTime() / 1000
          ),
        },
      ],
    }

    const response = await fetch(this.slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(`Slack webhook failed: ${response.statusText}`)
    }
  }

  /**
   * Send alert to PagerDuty via Events API v2
   */
  private async sendPagerDutyAlert(options: AlertOptions): Promise<void> {
    if (!this.pagerDutyKey) return

    const payload = {
      routing_key: this.pagerDutyKey,
      event_action: 'trigger',
      dedup_key: `postrail-${options.title.toLowerCase().replace(/\s+/g, '-')}`,
      payload: {
        summary: options.title,
        severity: options.severity,
        source: 'PostRail',
        timestamp: options.timestamp || new Date().toISOString(),
        custom_details: {
          message: options.message,
          ...options.metadata,
        },
      },
    }

    const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/vnd.pagerduty+json;version=2',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(`PagerDuty alert failed: ${response.statusText}`)
    }
  }

  /**
   * Check if alerting is configured
   */
  isConfigured(): boolean {
    return !!(this.slackWebhookUrl || this.pagerDutyKey)
  }
}

// Singleton instance
export const alertManager = new AlertManager()

/**
 * Quick helper for critical production alerts
 */
export async function sendCriticalAlert(
  title: string,
  message: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  return alertManager.sendAlert({
    severity: 'critical',
    title,
    message,
    metadata,
  })
}
