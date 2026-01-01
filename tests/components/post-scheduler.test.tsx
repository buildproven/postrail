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
})
