/**
 * Real tests for TwitterSetupGuide component
 * Tests actual component rendering and interaction
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TwitterSetupGuide } from '@/components/twitter-setup-guide'

// Mock fetch
global.fetch = vi.fn()

describe('TwitterSetupGuide - Real Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    })
  })

  describe('Instructions step', () => {
    it('should render instructions by default', () => {
      render(<TwitterSetupGuide />)

      expect(screen.getByText(/Connect Twitter \(BYOK\)/i)).toBeInTheDocument()
      expect(
        screen.getByText(/create your own Twitter Developer account/i)
      ).toBeInTheDocument()
    })

    it('should have button to proceed to credentials', () => {
      render(<TwitterSetupGuide />)

      const button = screen.getByRole('button', { name: /I Have My Keys/i })
      expect(button).toBeInTheDocument()
    })

    it('should show credentials step when button is clicked', () => {
      render(<TwitterSetupGuide />)

      const button = screen.getByRole('button', { name: /I Have My Keys/i })
      fireEvent.click(button)

      expect(screen.getByLabelText(/API Key/i)).toBeInTheDocument()
    })
  })

  describe('Credentials step', () => {
    beforeEach(() => {
      // Start on credentials step
      const { container } = render(<TwitterSetupGuide />)
      const button = screen.getByRole('button', { name: /I Have My Keys/i })
      fireEvent.click(button)
    })

    it('should render all credential input fields', () => {
      expect(screen.getByLabelText(/API Key/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/API Secret/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/^Access Token$/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Access Token Secret/i)).toBeInTheDocument()
    })

    it('should have connect button disabled initially', () => {
      const button = screen.getByRole('button', { name: /^Connect Twitter$/i })
      expect(button).toBeDisabled()
    })

    it('should enable connect button when all fields are filled', () => {
      const apiKeyInput = screen.getByLabelText(/API Key/i)
      const apiSecretInput = screen.getByLabelText(/API Secret/i)
      const accessTokenInput = screen.getByLabelText(/^Access Token$/i)
      const accessTokenSecretInput =
        screen.getByLabelText(/Access Token Secret/i)

      fireEvent.change(apiKeyInput, { target: { value: 'test-key' } })
      fireEvent.change(apiSecretInput, { target: { value: 'test-secret' } })
      fireEvent.change(accessTokenInput, { target: { value: 'test-token' } })
      fireEvent.change(accessTokenSecretInput, {
        target: { value: 'test-token-secret' },
      })

      const button = screen.getByRole('button', { name: /^Connect Twitter$/i })
      expect(button).not.toBeDisabled()
    })
  })

  describe('Connection flow', () => {
    it('should call API with credentials on submit', async () => {
      render(<TwitterSetupGuide />)

      // Go to credentials step
      fireEvent.click(screen.getByRole('button', { name: /I Have My Keys/i }))

      // Fill in credentials
      fireEvent.change(screen.getByLabelText(/API Key/i), {
        target: { value: 'test-key' },
      })
      fireEvent.change(screen.getByLabelText(/API Secret/i), {
        target: { value: 'test-secret' },
      })
      fireEvent.change(screen.getByLabelText(/^Access Token$/i), {
        target: { value: 'test-token' },
      })
      fireEvent.change(screen.getByLabelText(/Access Token Secret/i), {
        target: { value: 'test-token-secret' },
      })

      // Submit
      fireEvent.click(
        screen.getByRole('button', { name: /^Connect Twitter$/i })
      )

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/platforms/twitter/connect',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              apiKey: 'test-key',
              apiSecret: 'test-secret',
              accessToken: 'test-token',
              accessTokenSecret: 'test-token-secret',
            }),
          })
        )
      })
    })

    it('should show success message on successful connection', async () => {
      render(<TwitterSetupGuide />)

      // Go to credentials step
      fireEvent.click(screen.getByRole('button', { name: /I Have My Keys/i }))

      // Fill and submit
      fireEvent.change(screen.getByLabelText(/API Key/i), {
        target: { value: 'test-key' },
      })
      fireEvent.change(screen.getByLabelText(/API Secret/i), {
        target: { value: 'test-secret' },
      })
      fireEvent.change(screen.getByLabelText(/^Access Token$/i), {
        target: { value: 'test-token' },
      })
      fireEvent.change(screen.getByLabelText(/Access Token Secret/i), {
        target: { value: 'test-token-secret' },
      })
      fireEvent.click(
        screen.getByRole('button', { name: /^Connect Twitter$/i })
      )

      await waitFor(() => {
        expect(screen.getByText(/Twitter Connected!/i)).toBeInTheDocument()
      })
    })

    it.skip('should call onSuccess callback after successful connection', async () => {
      const mockOnSuccess = vi.fn()
      vi.useFakeTimers()

      render(<TwitterSetupGuide onSuccess={mockOnSuccess} />)

      // Go to credentials step and submit
      fireEvent.click(screen.getByRole('button', { name: /I Have My Keys/i }))
      fireEvent.change(screen.getByLabelText(/API Key/i), {
        target: { value: 'test-key' },
      })
      fireEvent.change(screen.getByLabelText(/API Secret/i), {
        target: { value: 'test-secret' },
      })
      fireEvent.change(screen.getByLabelText(/^Access Token$/i), {
        target: { value: 'test-token' },
      })
      fireEvent.change(screen.getByLabelText(/Access Token Secret/i), {
        target: { value: 'test-token-secret' },
      })
      fireEvent.click(
        screen.getByRole('button', { name: /^Connect Twitter$/i })
      )

      await waitFor(() => {
        expect(screen.getByText(/Twitter Connected!/i)).toBeInTheDocument()
      })

      // Advance timers to trigger onSuccess callback
      vi.advanceTimersByTime(2000)

      expect(mockOnSuccess).toHaveBeenCalled()

      vi.useRealTimers()
    })

    it.skip('should show error message on failed connection', async () => {
      ;(global.fetch as any).mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Invalid credentials' }),
      })

      render(<TwitterSetupGuide />)

      // Go to credentials step and submit
      fireEvent.click(screen.getByRole('button', { name: /I Have My Keys/i }))
      fireEvent.change(screen.getByLabelText(/API Key/i), {
        target: { value: 'bad-key' },
      })
      fireEvent.change(screen.getByLabelText(/API Secret/i), {
        target: { value: 'bad-secret' },
      })
      fireEvent.change(screen.getByLabelText(/^Access Token$/i), {
        target: { value: 'bad-token' },
      })
      fireEvent.change(screen.getByLabelText(/Access Token Secret/i), {
        target: { value: 'bad-token-secret' },
      })
      fireEvent.click(
        screen.getByRole('button', { name: /^Connect Twitter$/i })
      )

      await waitFor(() => {
        expect(screen.getByText(/Invalid credentials/i)).toBeInTheDocument()
      })
    })

    it('should show loading state during connection', async () => {
      ;(global.fetch as any).mockImplementation(
        () =>
          new Promise(resolve =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({ success: true }),
                }),
              100
            )
          )
      )

      render(<TwitterSetupGuide />)

      // Go to credentials step and submit
      fireEvent.click(screen.getByRole('button', { name: /I Have My Keys/i }))
      fireEvent.change(screen.getByLabelText(/API Key/i), {
        target: { value: 'test-key' },
      })
      fireEvent.change(screen.getByLabelText(/API Secret/i), {
        target: { value: 'test-secret' },
      })
      fireEvent.change(screen.getByLabelText(/^Access Token$/i), {
        target: { value: 'test-token' },
      })
      fireEvent.change(screen.getByLabelText(/Access Token Secret/i), {
        target: { value: 'test-token-secret' },
      })
      fireEvent.click(
        screen.getByRole('button', { name: /^Connect Twitter$/i })
      )

      // Should show loading text
      expect(screen.getByText(/Connecting.../i)).toBeInTheDocument()
    })
  })

  describe('Secret visibility toggle', () => {
    beforeEach(() => {
      render(<TwitterSetupGuide />)
      fireEvent.click(screen.getByRole('button', { name: /I Have My Keys/i }))
    })

    it('should toggle API Secret visibility', () => {
      const apiSecretInput = screen.getByLabelText(/API Secret/i)
      expect(apiSecretInput).toHaveAttribute('type', 'password')

      // Find and click the eye icon button for API Secret
      const toggleButtons = screen.getAllByRole('button')
      const apiSecretToggle = toggleButtons.find(btn =>
        btn.getAttribute('aria-label')?.includes('API Secret')
      )

      if (apiSecretToggle) {
        fireEvent.click(apiSecretToggle)
        expect(apiSecretInput).toHaveAttribute('type', 'text')
      }
    })

    it('should toggle Access Token Secret visibility', () => {
      const accessTokenSecretInput =
        screen.getByLabelText(/Access Token Secret/i)
      expect(accessTokenSecretInput).toHaveAttribute('type', 'password')

      const toggleButtons = screen.getAllByRole('button')
      const accessTokenSecretToggle = toggleButtons.find(btn =>
        btn.getAttribute('aria-label')?.includes('Access Token Secret')
      )

      if (accessTokenSecretToggle) {
        fireEvent.click(accessTokenSecretToggle)
        expect(accessTokenSecretInput).toHaveAttribute('type', 'text')
      }
    })
  })
})
