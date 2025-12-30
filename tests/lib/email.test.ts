/**
 * Email Service Unit Tests
 *
 * Tests email functions with Resend mocked:
 * - Welcome email
 * - Trial expiry warning
 * - Trial expired
 * - Renewal reminder
 * - Payment failed
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Resend before importing email module
const mockSend = vi.fn()
vi.mock('resend', () => ({
  Resend: class MockResend {
    emails = { send: mockSend }
  },
}))

// Mock logger to avoid pino initialization issues
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
  logError: vi.fn(),
}))

// Set RESEND_API_KEY before importing
vi.hoisted(() => {
  process.env.RESEND_API_KEY = 're_test_123'
})

import {
  sendWelcomeEmail,
  sendTrialExpiryWarning,
  sendTrialExpired,
  sendRenewalReminder,
  sendPaymentFailed,
} from '@/lib/email'

describe('Email Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSend.mockResolvedValue({ data: { id: 'email-123' }, error: null })
  })

  describe('sendWelcomeEmail', () => {
    it('should send welcome email with user name', async () => {
      const result = await sendWelcomeEmail('user@example.com', 'John')

      expect(result.success).toBe(true)
      expect(result.id).toBe('email-123')
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: expect.stringContaining('Welcome'),
        })
      )
    })

    it('should handle null name gracefully', async () => {
      await sendWelcomeEmail('user@example.com', null)

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('Hi there'),
        })
      )
    })

    it('should return error on send failure', async () => {
      mockSend.mockResolvedValue({
        data: null,
        error: { message: 'Rate limited' },
      })

      const result = await sendWelcomeEmail('user@example.com', 'John')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Rate limited')
    })
  })

  describe('sendTrialExpiryWarning', () => {
    it('should send warning with days remaining', async () => {
      const result = await sendTrialExpiryWarning('user@example.com', 'Jane', 3)

      expect(result.success).toBe(true)
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('3 days'),
          html: expect.stringContaining('3 days'),
        })
      )
    })

    it('should include upgrade CTA', async () => {
      await sendTrialExpiryWarning('user@example.com', 'Jane', 3)

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('$29/mo'),
        })
      )
    })
  })

  describe('sendTrialExpired', () => {
    it('should send expired notification', async () => {
      const result = await sendTrialExpired('user@example.com', 'Bob')

      expect(result.success).toBe(true)
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('ended'),
        })
      )
    })

    it('should include growth plan benefits', async () => {
      await sendTrialExpired('user@example.com', null)

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('$59/mo'),
        })
      )
    })
  })

  describe('sendRenewalReminder', () => {
    it('should send renewal reminder with plan details', async () => {
      const result = await sendRenewalReminder(
        'user@example.com',
        'Alice',
        7,
        'Standard',
        2900
      )

      expect(result.success).toBe(true)
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('7 days'),
        })
      )
    })

    it('should format amount correctly', async () => {
      await sendRenewalReminder('user@example.com', 'Alice', 7, 'Growth', 5900)

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('$59.00'),
        })
      )
    })

    it('should include manage subscription link', async () => {
      await sendRenewalReminder('user@example.com', null, 3, 'Standard', 2900)

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('Manage Subscription'),
        })
      )
    })
  })

  describe('sendPaymentFailed', () => {
    it('should send payment failed notification', async () => {
      const result = await sendPaymentFailed(
        'user@example.com',
        'Charlie',
        'Standard',
        null
      )

      expect(result.success).toBe(true)
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('payment failed'),
        })
      )
    })

    it('should include retry date when provided', async () => {
      const retryDate = new Date('2025-01-15T12:00:00Z')
      await sendPaymentFailed(
        'user@example.com',
        'Charlie',
        'Growth',
        retryDate
      )

      // Verify date is included (format may vary by locale)
      expect(mockSend).toHaveBeenCalled()
      const callArg = mockSend.mock.calls[0][0]
      expect(callArg.html).toMatch(/January\s+15|15.*January/)
    })

    it('should show generic retry message when no date', async () => {
      await sendPaymentFailed('user@example.com', null, 'Standard', null)

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining("We'll retry the payment soon"),
        })
      )
    })

    it('should include update payment CTA', async () => {
      await sendPaymentFailed('user@example.com', 'Dana', 'Standard', null)

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('Update Payment Method'),
        })
      )
    })

    it('should explain consequences of failed payment', async () => {
      await sendPaymentFailed('user@example.com', 'Dana', 'Growth', null)

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('paused after 3 failed attempts'),
        })
      )
    })
  })

  describe('Error handling', () => {
    it('should catch and return thrown errors', async () => {
      mockSend.mockRejectedValue(new Error('Network error'))

      const result = await sendWelcomeEmail('user@example.com', 'Test')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Network error')
    })
  })
})
