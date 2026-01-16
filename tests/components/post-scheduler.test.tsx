import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PostScheduler } from '@/components/post-scheduler'

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('PostScheduler', () => {
  const defaultProps = {
    newsletterId: 'newsletter-123',
    posts: [
      {
        id: 'post-1',
        platform: 'linkedin',
        post_type: 'pre_cta',
        content: 'Test pre-CTA post',
        character_count: 50,
        status: 'draft',
        scheduled_time: null,
      },
      {
        id: 'post-2',
        platform: 'twitter',
        post_type: 'post_cta',
        content: 'Test post-CTA post',
        character_count: 100,
        status: 'draft',
        scheduled_time: null,
      },
    ],
    connections: [
      { platform: 'linkedin', connected: true },
      { platform: 'twitter', connected: true },
      { platform: 'facebook', connected: false },
    ],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock timezone API
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/user/timezone')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ timezone: 'America/New_York' }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      })
    })
  })

  it('renders posts grouped by type', async () => {
    render(<PostScheduler {...defaultProps} />)

    expect(screen.getByText('Pre-CTA Teaser Posts')).toBeInTheDocument()
    expect(screen.getByText('Post-CTA Engagement Posts')).toBeInTheDocument()
  })

  it('shows connected/disconnected platform status', async () => {
    const props = {
      ...defaultProps,
      posts: [
        {
          id: 'post-3',
          platform: 'facebook',
          post_type: 'pre_cta',
          content: 'Facebook post',
          character_count: 60,
          status: 'draft',
          scheduled_time: null,
        },
      ],
    }

    render(<PostScheduler {...props} />)

    await waitFor(() => {
      expect(screen.getByText('Not connected')).toBeInTheDocument()
    })
  })

  it('disables schedule button when no date selected', () => {
    render(<PostScheduler {...defaultProps} />)

    const scheduleButton = screen.getByRole('button', {
      name: /schedule all posts/i,
    })
    expect(scheduleButton).toBeDisabled()
  })

  it('enables schedule button when date is selected', async () => {
    const user = userEvent.setup()
    render(<PostScheduler {...defaultProps} />)

    // Set future date
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const dateInput = screen.getByLabelText('Date')

    await user.clear(dateInput)
    await user.type(dateInput, tomorrow.toISOString().split('T')[0])

    const scheduleButton = screen.getByRole('button', {
      name: /schedule all posts/i,
    })
    expect(scheduleButton).not.toBeDisabled()
  })

  it('shows error for past dates', async () => {
    const user = userEvent.setup()
    render(<PostScheduler {...defaultProps} />)

    // Set past date
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const dateInput = screen.getByLabelText('Date')
    await user.clear(dateInput)
    await user.type(dateInput, yesterday.toISOString().split('T')[0])

    const scheduleButton = screen.getByRole('button', {
      name: /schedule all posts/i,
    })
    await user.click(scheduleButton)

    await waitFor(() => {
      expect(
        screen.getByText('Publish date must be in the future')
      ).toBeInTheDocument()
    })
  })

  it('toggles smart timing', async () => {
    const user = userEvent.setup()
    render(<PostScheduler {...defaultProps} />)

    const smartTimingSwitch = screen.getByRole('switch')
    expect(smartTimingSwitch).toBeChecked()

    await user.click(smartTimingSwitch)

    expect(smartTimingSwitch).not.toBeChecked()
  })

  it('shows optimal times when smart timing enabled', () => {
    render(<PostScheduler {...defaultProps} />)

    expect(screen.getByText(/platform optimal times/i)).toBeInTheDocument()
    // Check for time slots displayed
    expect(screen.getByText(/9 AM, 12 PM/)).toBeInTheDocument()
  })

  it('calls schedule API on submit', async () => {
    const user = userEvent.setup()
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/user/timezone')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ timezone: 'America/New_York' }),
        })
      }
      if (url.includes('/api/posts/schedule')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              results: [
                {
                  postId: 'post-1',
                  platform: 'linkedin',
                  status: 'scheduled',
                  scheduledTime: new Date().toISOString(),
                  isOptimal: true,
                },
              ],
            }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    render(<PostScheduler {...defaultProps} />)

    // Set future date
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const dateInput = screen.getByLabelText('Date')
    await user.clear(dateInput)
    await user.type(dateInput, tomorrow.toISOString().split('T')[0])

    const scheduleButton = screen.getByRole('button', {
      name: /schedule all posts/i,
    })
    await user.click(scheduleButton)

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/posts/schedule',
        expect.objectContaining({
          method: 'POST',
        })
      )
    })
  })

  it('renders failed posts section with retry button', async () => {
    const user = userEvent.setup()
    const props = {
      ...defaultProps,
      posts: [
        {
          id: 'post-failed',
          platform: 'twitter',
          post_type: 'pre_cta',
          content: 'Failed post',
          character_count: 40,
          status: 'failed',
          scheduled_time: null,
          retry_count: 2,
        },
      ],
    }

    render(<PostScheduler {...props} />)

    expect(screen.getByText('Failed Posts')).toBeInTheDocument()
    expect(screen.getByText('(2 retries)')).toBeInTheDocument()

    const retryButton = screen.getByRole('button', { name: /retry/i })
    expect(retryButton).toBeInTheDocument()

    // Mock retry API
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/posts/post-failed/retry')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'scheduled' }),
        })
      }
      if (url.includes('/api/user/timezone')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ timezone: 'UTC' }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    await user.click(retryButton)

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/posts/post-failed/retry',
        expect.objectContaining({
          method: 'POST',
        })
      )
    })
  })

  it('calls onPostUpdate callback after successful retry', async () => {
    const user = userEvent.setup()
    const onPostUpdate = vi.fn()

    const props = {
      ...defaultProps,
      posts: [
        {
          id: 'post-failed',
          platform: 'twitter',
          post_type: 'pre_cta',
          content: 'Failed post',
          character_count: 40,
          status: 'failed',
          scheduled_time: null,
        },
      ],
      onPostUpdate,
    }

    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/posts/post-failed/retry')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'scheduled' }),
        })
      }
      if (url.includes('/api/user/timezone')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ timezone: 'UTC' }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    render(<PostScheduler {...props} />)

    const retryButton = screen.getByRole('button', { name: /retry/i })
    await user.click(retryButton)

    await waitFor(() => {
      expect(onPostUpdate).toHaveBeenCalledWith('post-failed', {
        status: 'scheduled',
      })
    })
  })

  it('displays timezone from API', async () => {
    render(<PostScheduler {...defaultProps} />)

    await waitFor(() => {
      expect(
        screen.getByText(/times shown in america\/new york/i)
      ).toBeInTheDocument()
    })
  })

  it('shows connection warning when platforms disconnected', () => {
    render(<PostScheduler {...defaultProps} />)

    expect(
      screen.getByText(/some platforms are not connected/i)
    ).toBeInTheDocument()
  })

  describe('Smart Timing Logic', () => {
    it('schedules posts at optimal times when smart timing enabled', async () => {
      const user = userEvent.setup()
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/user/timezone')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ timezone: 'America/New_York' }),
          })
        }
        if (url.includes('/api/posts/schedule')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                results: [
                  {
                    postId: 'post-1',
                    platform: 'linkedin',
                    status: 'scheduled',
                    scheduledTime: new Date().toISOString(),
                    isOptimal: true,
                    reason: 'Optimal engagement time for LinkedIn',
                  },
                ],
              }),
          })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      })

      render(<PostScheduler {...defaultProps} />)

      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const dateInput = screen.getByLabelText('Date')
      await user.clear(dateInput)
      await user.type(dateInput, tomorrow.toISOString().split('T')[0])

      const scheduleButton = screen.getByRole('button', {
        name: /schedule all posts/i,
      })
      await user.click(scheduleButton)

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/posts/schedule',
          expect.objectContaining({
            body: expect.stringContaining('"useSmartTiming":true'),
          })
        )
      })
    })

    it('disables smart timing and uses fixed times', async () => {
      const user = userEvent.setup()
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/user/timezone')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ timezone: 'America/New_York' }),
          })
        }
        if (url.includes('/api/posts/schedule')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                results: [
                  {
                    postId: 'post-1',
                    platform: 'linkedin',
                    status: 'scheduled',
                    scheduledTime: new Date().toISOString(),
                    isOptimal: false,
                  },
                ],
              }),
          })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      })

      render(<PostScheduler {...defaultProps} />)

      // Toggle smart timing off
      const smartTimingSwitch = screen.getByRole('switch')
      await user.click(smartTimingSwitch)

      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const dateInput = screen.getByLabelText('Date')
      await user.clear(dateInput)
      await user.type(dateInput, tomorrow.toISOString().split('T')[0])

      const scheduleButton = screen.getByRole('button', {
        name: /schedule all posts/i,
      })
      await user.click(scheduleButton)

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/posts/schedule',
          expect.objectContaining({
            body: expect.stringContaining('"useSmartTiming":false'),
          })
        )
      })
    })

    it('shows schedule preview when smart timing disabled', async () => {
      const user = userEvent.setup()
      render(<PostScheduler {...defaultProps} />)

      // Toggle smart timing off
      const smartTimingSwitch = screen.getByRole('switch')
      await user.click(smartTimingSwitch)

      // Set date
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const dateInput = screen.getByLabelText('Date')
      await user.clear(dateInput)
      await user.type(dateInput, tomorrow.toISOString().split('T')[0])

      await waitFor(() => {
        expect(screen.getByText('Schedule Preview:')).toBeInTheDocument()
        expect(screen.getByText(/Pre-CTA:/)).toBeInTheDocument()
        expect(screen.getByText(/Post-CTA:/)).toBeInTheDocument()
      })
    })

    it('displays optimal time indicator for scheduled posts', async () => {
      const user = userEvent.setup()
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/user/timezone')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ timezone: 'America/New_York' }),
          })
        }
        if (url.includes('/api/posts/schedule')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                results: [
                  {
                    postId: 'post-1',
                    platform: 'linkedin',
                    status: 'scheduled',
                    scheduledTime: new Date().toISOString(),
                    isOptimal: true,
                    reason: 'Peak engagement time',
                  },
                ],
              }),
          })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      })

      render(<PostScheduler {...defaultProps} />)

      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const dateInput = screen.getByLabelText('Date')
      await user.clear(dateInput)
      await user.type(dateInput, tomorrow.toISOString().split('T')[0])

      const scheduleButton = screen.getByRole('button', {
        name: /schedule all posts/i,
      })
      await user.click(scheduleButton)

      await waitFor(() => {
        expect(screen.getByText('Peak engagement time')).toBeInTheDocument()
      })
    })
  })

  describe('Error Handling and Edge Cases', () => {
    it('handles network errors during scheduling', async () => {
      const user = userEvent.setup()
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/user/timezone')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ timezone: 'America/New_York' }),
          })
        }
        if (url.includes('/api/posts/schedule')) {
          return Promise.reject(new Error('Network error'))
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      })

      render(<PostScheduler {...defaultProps} />)

      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const dateInput = screen.getByLabelText('Date')
      await user.clear(dateInput)
      await user.type(dateInput, tomorrow.toISOString().split('T')[0])

      const scheduleButton = screen.getByRole('button', {
        name: /schedule all posts/i,
      })
      await user.click(scheduleButton)

      await waitFor(() => {
        expect(screen.getByText('Failed to schedule posts')).toBeInTheDocument()
      })
    })

    it('handles API error responses', async () => {
      const user = userEvent.setup()
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/user/timezone')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ timezone: 'America/New_York' }),
          })
        }
        if (url.includes('/api/posts/schedule')) {
          return Promise.resolve({
            ok: false,
            json: () =>
              Promise.resolve({
                error: 'Subscription tier limit reached',
              }),
          })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      })

      render(<PostScheduler {...defaultProps} />)

      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const dateInput = screen.getByLabelText('Date')
      await user.clear(dateInput)
      await user.type(dateInput, tomorrow.toISOString().split('T')[0])

      const scheduleButton = screen.getByRole('button', {
        name: /schedule all posts/i,
      })
      await user.click(scheduleButton)

      await waitFor(() => {
        expect(
          screen.getByText('Subscription tier limit reached')
        ).toBeInTheDocument()
      })
    })

    it('handles empty posts array', () => {
      const props = {
        ...defaultProps,
        posts: [],
      }

      render(<PostScheduler {...props} />)

      expect(screen.getByText('Pre-CTA Teaser Posts')).toBeInTheDocument()
      expect(screen.getByText('Post-CTA Engagement Posts')).toBeInTheDocument()
    })

    it('handles timezone API failure with fallback', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/user/timezone')) {
          return Promise.reject(new Error('Timezone API unavailable'))
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      })

      render(<PostScheduler {...defaultProps} />)

      // Component should still render and use browser timezone as fallback
      await waitFor(() => {
        expect(screen.getByText('Pre-CTA Teaser Posts')).toBeInTheDocument()
      })
    })

    it('handles retry failure', async () => {
      const user = userEvent.setup()
      const props = {
        ...defaultProps,
        posts: [
          {
            id: 'post-failed',
            platform: 'twitter',
            post_type: 'pre_cta',
            content: 'Failed post',
            character_count: 40,
            status: 'failed',
            scheduled_time: null,
          },
        ],
      }

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/posts/post-failed/retry')) {
          return Promise.resolve({
            ok: false,
            json: () =>
              Promise.resolve({
                error: 'Rate limit exceeded',
              }),
          })
        }
        if (url.includes('/api/user/timezone')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ timezone: 'UTC' }),
          })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      })

      render(<PostScheduler {...props} />)

      const retryButton = screen.getByRole('button', { name: /retry/i })
      await user.click(retryButton)

      await waitFor(() => {
        expect(screen.getByText('Rate limit exceeded')).toBeInTheDocument()
      })
    })

    it('prevents scheduling without required date', () => {
      render(<PostScheduler {...defaultProps} />)

      const scheduleButton = screen.getByRole('button', {
        name: /schedule all posts/i,
      })

      // Button should be disabled without date
      expect(scheduleButton).toBeDisabled()
    })

    it('shows loading state during scheduling', async () => {
      const user = userEvent.setup()
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/user/timezone')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ timezone: 'America/New_York' }),
          })
        }
        if (url.includes('/api/posts/schedule')) {
          // Delay to ensure loading state is visible
          return new Promise(resolve =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: () => Promise.resolve({ results: [] }),
                }),
              100
            )
          )
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      })

      render(<PostScheduler {...defaultProps} />)

      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const dateInput = screen.getByLabelText('Date')
      await user.clear(dateInput)
      await user.type(dateInput, tomorrow.toISOString().split('T')[0])

      const scheduleButton = screen.getByRole('button', {
        name: /schedule all posts/i,
      })
      await user.click(scheduleButton)

      // Check for loading state
      expect(screen.getByText('Scheduling...')).toBeInTheDocument()
      expect(scheduleButton).toBeDisabled()
    })

    it('handles skipped posts in results', async () => {
      const user = userEvent.setup()
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/user/timezone')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ timezone: 'America/New_York' }),
          })
        }
        if (url.includes('/api/posts/schedule')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                results: [
                  {
                    postId: 'post-1',
                    platform: 'linkedin',
                    status: 'skipped',
                    error: 'Platform not connected',
                  },
                ],
              }),
          })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      })

      render(<PostScheduler {...defaultProps} />)

      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const dateInput = screen.getByLabelText('Date')
      await user.clear(dateInput)
      await user.type(dateInput, tomorrow.toISOString().split('T')[0])

      const scheduleButton = screen.getByRole('button', {
        name: /schedule all posts/i,
      })
      await user.click(scheduleButton)

      await waitFor(() => {
        expect(screen.getByText('Platform not connected')).toBeInTheDocument()
      })
    })
  })

  describe('Accessibility', () => {
    it('has proper ARIA labels on interactive elements', () => {
      render(<PostScheduler {...defaultProps} />)

      expect(screen.getByLabelText('Date')).toBeInTheDocument()
      expect(screen.getByLabelText('Time')).toBeInTheDocument()
      expect(screen.getByLabelText('Smart Timing')).toBeInTheDocument()
    })

    it('provides semantic HTML structure', () => {
      render(<PostScheduler {...defaultProps} />)

      // Check for fieldset with legend
      const dateInput = screen.getByLabelText('Date')
      const fieldset = dateInput.closest('fieldset')
      expect(fieldset).toBeInTheDocument()
    })

    it('has accessible retry button labels', () => {
      const props = {
        ...defaultProps,
        posts: [
          {
            id: 'post-failed',
            platform: 'twitter',
            post_type: 'pre_cta',
            content: 'Failed post',
            character_count: 40,
            status: 'failed',
            scheduled_time: null,
          },
        ],
      }

      render(<PostScheduler {...props} />)

      const retryButton = screen.getByRole('button', {
        name: /retry failed twitter post/i,
      })
      expect(retryButton).toBeInTheDocument()
    })

    it('uses time elements for datetime display', async () => {
      const user = userEvent.setup()
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/user/timezone')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ timezone: 'America/New_York' }),
          })
        }
        if (url.includes('/api/posts/schedule')) {
          const scheduledTime = new Date().toISOString()
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                results: [
                  {
                    postId: 'post-1',
                    platform: 'linkedin',
                    status: 'scheduled',
                    scheduledTime,
                  },
                ],
              }),
          })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      })

      render(<PostScheduler {...defaultProps} />)

      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const dateInput = screen.getByLabelText('Date')
      await user.clear(dateInput)
      await user.type(dateInput, tomorrow.toISOString().split('T')[0])

      const scheduleButton = screen.getByRole('button', {
        name: /schedule all posts/i,
      })
      await user.click(scheduleButton)

      await waitFor(() => {
        const timeElements = document.querySelectorAll('time[datetime]')
        expect(timeElements.length).toBeGreaterThan(0)
      })
    })

    it('provides screen reader text for loading states', async () => {
      const user = userEvent.setup()
      const props = {
        ...defaultProps,
        posts: [
          {
            id: 'post-failed',
            platform: 'twitter',
            post_type: 'pre_cta',
            content: 'Failed post',
            character_count: 40,
            status: 'failed',
            scheduled_time: null,
          },
        ],
      }

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/posts/post-failed/retry')) {
          return new Promise(resolve =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: () => Promise.resolve({ status: 'scheduled' }),
                }),
              100
            )
          )
        }
        if (url.includes('/api/user/timezone')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ timezone: 'UTC' }),
          })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      })

      render(<PostScheduler {...props} />)

      const retryButton = screen.getByRole('button', { name: /retry/i })
      await user.click(retryButton)

      // Check for screen reader text during loading
      expect(
        screen.getByText('Retrying...', { selector: '.sr-only' })
      ).toBeInTheDocument()
    })

    it('includes aria-hidden on decorative icons', () => {
      render(<PostScheduler {...defaultProps} />)

      // All lucide icons should have aria-hidden="true"
      const decorativeIcons = document.querySelectorAll('[aria-hidden="true"]')
      expect(decorativeIcons.length).toBeGreaterThan(0)
    })

    it('keyboard navigation works for interactive elements', async () => {
      const user = userEvent.setup()
      render(<PostScheduler {...defaultProps} />)

      // Test that inputs can receive focus
      const dateInput = screen.getByLabelText('Date')
      const timeInput = screen.getByLabelText('Time')
      const smartTimingSwitch = screen.getByRole('switch')

      // Test date input can be focused
      dateInput.focus()
      expect(dateInput).toHaveFocus()

      // Test time input can be focused
      timeInput.focus()
      expect(timeInput).toHaveFocus()

      // Test switch can be focused and activated
      smartTimingSwitch.focus()
      expect(smartTimingSwitch).toHaveFocus()
      expect(smartTimingSwitch).toBeChecked()

      // Toggle switch with click (simulates keyboard activation)
      await user.click(smartTimingSwitch)
      expect(smartTimingSwitch).not.toBeChecked()
    })
  })
})
