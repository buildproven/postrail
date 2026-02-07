/**
 * Alert Integration with Escalation Policies
 *
 * L13: Enhanced alert system with configurable escalation policies
 *
 * Sends critical alerts to external monitoring systems (Slack, PagerDuty, etc.)
 * Used for production incidents that require immediate attention.
 *
 * Configuration via environment variables:
 * - SLACK_WEBHOOK_URL: Slack incoming webhook for critical alerts
 * - PAGERDUTY_INTEGRATION_KEY: PagerDuty Events API v2 integration key
 * - ALERT_ESCALATION_POLICY: JSON config for escalation rules (optional)
 *
 * Escalation Policy Example:
 * {
 *   "critical": {
 *     "immediate": ["slack", "pagerduty"],
 *     "after_5min": ["email"],
 *     "after_15min": ["sms"]
 *   },
 *   "warning": {
 *     "immediate": ["slack"],
 *     "after_30min": ["email"]
 *   }
 * }
 */

import { logger } from '@/lib/logger'

export interface AlertOptions {
  severity: 'critical' | 'warning' | 'info'
  title: string
  message: string
  metadata?: Record<string, unknown>
  timestamp?: string
  tags?: string[] // For categorizing alerts (e.g., ['redis', 'rate-limit'])
}

export interface EscalationRule {
  immediate?: string[] // Channels to notify immediately
  after_5min?: string[] // Channels to notify after 5 minutes
  after_15min?: string[] // Channels to notify after 15 minutes
  after_30min?: string[] // Channels to notify after 30 minutes
}

export interface EscalationPolicy {
  critical?: EscalationRule
  warning?: EscalationRule
  info?: EscalationRule
}

export interface FailedAlert {
  options: AlertOptions
  failedChannels: string[]
  error: string
  timestamp: string
  retryCount: number
}

class AlertManager {
  private readonly slackWebhookUrl: string | undefined
  private readonly pagerDutyKey: string | undefined
  private readonly escalationPolicy: EscalationPolicy
  private pendingEscalations: Map<
    string,
    { options: AlertOptions; timers: ReturnType<typeof setTimeout>[] }
  >
  // L13: Track failed alerts for manual review and escalation
  private failedAlerts: FailedAlert[] = []
  private readonly MAX_FAILED_ALERTS = 100 // Prevent memory leak

  constructor() {
    this.slackWebhookUrl = process.env.SLACK_WEBHOOK_URL
    this.pagerDutyKey = process.env.PAGERDUTY_INTEGRATION_KEY
    this.escalationPolicy = this.loadEscalationPolicy()
    this.pendingEscalations = new Map()
  }

  /**
   * L13: Load escalation policy from environment or use defaults
   */
  private loadEscalationPolicy(): EscalationPolicy {
    const policyEnv = process.env.ALERT_ESCALATION_POLICY

    if (policyEnv) {
      try {
        return JSON.parse(policyEnv) as EscalationPolicy
      } catch (error) {
        logger.warn(
          { error },
          'Failed to parse ALERT_ESCALATION_POLICY, using defaults'
        )
      }
    }

    // Default escalation policy
    return {
      critical: {
        immediate: ['slack', 'pagerduty'],
        after_15min: ['slack'], // Reminder after 15 minutes
      },
      warning: {
        immediate: ['slack'],
        after_30min: ['slack'], // Reminder after 30 minutes if not resolved
      },
      info: {
        immediate: ['slack'],
      },
    }
  }

  /**
   * Send critical alert to all configured channels with escalation
   * L13: Now supports escalation policies
   */
  async sendAlert(options: AlertOptions): Promise<void> {
    const timestamp = options.timestamp || new Date().toISOString()
    const alertKey = `${options.severity}-${options.title}-${timestamp}`

    // Log locally first
    logger.error(
      {
        type: 'alert',
        severity: options.severity,
        message: options.message,
        metadata: options.metadata,
        tags: options.tags,
        timestamp,
      },
      `[ALERT] ${options.title}`
    )

    // Get escalation rule for this severity
    const rule = this.escalationPolicy[options.severity]

    if (!rule) {
      // Fallback to legacy behavior
      await this.sendImmediateAlerts(options)
      return
    }

    // Send immediate alerts
    if (rule.immediate && rule.immediate.length > 0) {
      await this.sendToChannels(rule.immediate, options)
    }

    // Skip escalation timers when no alerting channels are configured —
    // no point scheduling reminders with nowhere to send them
    if (!this.slackWebhookUrl && !this.pagerDutyKey) {
      logger.warn(
        '⚠️  Alert sent but no external alerting configured (Slack/PagerDuty)'
      )
      return
    }

    // Schedule escalated alerts
    const timers: ReturnType<typeof setTimeout>[] = []

    if (rule.after_5min && rule.after_5min.length > 0) {
      const timer = setTimeout(
        () => {
          this.sendToChannels(rule.after_5min!, {
            ...options,
            title: `[ESCALATION] ${options.title}`,
            message: `Alert not acknowledged after 5 minutes. ${options.message}`,
          })
        },
        5 * 60 * 1000
      )
      timer.unref()
      timers.push(timer)
    }

    if (rule.after_15min && rule.after_15min.length > 0) {
      const timer = setTimeout(
        () => {
          this.sendToChannels(rule.after_15min!, {
            ...options,
            title: `[ESCALATION] ${options.title}`,
            message: `Alert not acknowledged after 15 minutes. ${options.message}`,
          })
        },
        15 * 60 * 1000
      )
      timer.unref()
      timers.push(timer)
    }

    if (rule.after_30min && rule.after_30min.length > 0) {
      const timer = setTimeout(
        () => {
          this.sendToChannels(rule.after_30min!, {
            ...options,
            title: `[ESCALATION] ${options.title}`,
            message: `Alert not acknowledged after 30 minutes. ${options.message}`,
          })
        },
        30 * 60 * 1000
      )
      timer.unref()
      timers.push(timer)
    }

    // Store timers for potential cancellation
    if (timers.length > 0) {
      this.pendingEscalations.set(alertKey, { options, timers })
    }

    // Note: "no alerting configured" case handled by early return above
  }

  /**
   * L13: Send alerts to specified channels with failure tracking
   */
  private async sendToChannels(
    channels: string[],
    options: AlertOptions
  ): Promise<void> {
    const failedChannels: string[] = []
    const errors: string[] = []

    for (const channel of channels) {
      switch (channel.toLowerCase()) {
        case 'slack':
          if (this.slackWebhookUrl) {
            await this.sendSlackAlert(options).catch(error => {
              const errorMsg =
                error instanceof Error ? error.message : String(error)
              failedChannels.push(channel)
              errors.push(errorMsg)
              logger.error({ error, channel }, 'Failed to send alert')
            })
          }
          break
        case 'pagerduty':
          if (this.pagerDutyKey) {
            await this.sendPagerDutyAlert(options).catch(error => {
              const errorMsg =
                error instanceof Error ? error.message : String(error)
              failedChannels.push(channel)
              errors.push(errorMsg)
              logger.error({ error, channel }, 'Failed to send alert')
            })
          }
          break
        default:
          logger.warn({ channel }, 'Unsupported alert channel')
      }
    }

    // L13: Escalate when ALL channels fail for critical alerts
    if (
      failedChannels.length > 0 &&
      failedChannels.length === channels.length
    ) {
      this.recordFailedAlert(options, failedChannels, errors.join('; '))
    }
  }

  /**
   * Legacy immediate alert behavior
   */
  private async sendImmediateAlerts(options: AlertOptions): Promise<void> {
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
  }

  /**
   * L13: Acknowledge an alert and cancel pending escalations
   */
  acknowledgeAlert(alertKey: string): void {
    const pending = this.pendingEscalations.get(alertKey)
    if (pending) {
      pending.timers.forEach(timer => clearTimeout(timer))
      this.pendingEscalations.delete(alertKey)
      logger.info({ alertKey }, 'Alert acknowledged, escalations cancelled')
    }
  }

  /**
   * L13: Get current escalation policy
   */
  getEscalationPolicy(): EscalationPolicy {
    return this.escalationPolicy
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

  /**
   * L13: Record failed alert for manual review and escalation
   */
  private recordFailedAlert(
    options: AlertOptions,
    failedChannels: string[],
    error: string
  ): void {
    const failedAlert: FailedAlert = {
      options,
      failedChannels,
      error,
      timestamp: new Date().toISOString(),
      retryCount: 0,
    }

    // Add to failed alerts list (with limit to prevent memory leak)
    this.failedAlerts.push(failedAlert)
    if (this.failedAlerts.length > this.MAX_FAILED_ALERTS) {
      this.failedAlerts.shift() // Remove oldest
    }

    // Critical escalation: Log as fatal for manual review
    logger.fatal(
      {
        type: 'alert.system.failure',
        severity: options.severity,
        title: options.title,
        failedChannels,
        error,
        alertCount: this.failedAlerts.length,
      },
      'ALERT SYSTEM FAILURE: Unable to send alert through configured channels'
    )

    // If this is a critical alert failure, log extra warning
    if (options.severity === 'critical') {
      logger.fatal(
        {
          type: 'alert.system.critical_failure',
          title: options.title,
          message: options.message,
          metadata: options.metadata,
        },
        'CRITICAL ALERT COULD NOT BE SENT - MANUAL INTERVENTION REQUIRED'
      )
    }
  }

  /**
   * L13: Get all failed alerts for manual review
   */
  getFailedAlerts(): FailedAlert[] {
    return [...this.failedAlerts] // Return copy to prevent mutation
  }

  /**
   * L13: Clear failed alerts (after manual review)
   */
  clearFailedAlerts(): void {
    const count = this.failedAlerts.length
    this.failedAlerts = []
    logger.info({ count }, 'Failed alerts cleared')
  }

  /**
   * L13: Health check for alert system
   */
  async healthCheck(): Promise<{
    healthy: boolean
    configured: boolean
    failedAlertsCount: number
    channels: { slack: boolean; pagerduty: boolean }
  }> {
    return {
      healthy: this.failedAlerts.length < 10, // Unhealthy if >10 failed alerts
      configured: this.isConfigured(),
      failedAlertsCount: this.failedAlerts.length,
      channels: {
        slack: !!this.slackWebhookUrl,
        pagerduty: !!this.pagerDutyKey,
      },
    }
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
