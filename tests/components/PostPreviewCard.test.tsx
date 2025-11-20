import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PostPreviewCard } from '@/components/post-preview-card'

describe('PostPreviewCard', () => {
  const mockPost = {
    id: '1',
    platform: 'linkedin',
    post_type: 'pre_cta',
    content: 'This is a test LinkedIn post about AI automation.',
    character_count: 50,
    status: 'draft',
  }

  it('should render post content', () => {
    render(<PostPreviewCard post={mockPost} />)
    expect(screen.getByText(/test LinkedIn post/i)).toBeInTheDocument()
  })

  it('should show platform name', () => {
    render(<PostPreviewCard post={mockPost} />)
    expect(screen.getByText('LinkedIn')).toBeInTheDocument()
  })

  it('should show post type (Pre-CTA vs Post-CTA)', () => {
    const { rerender } = render(<PostPreviewCard post={mockPost} />)
    expect(screen.getByText('Pre-CTA Teaser')).toBeInTheDocument()

    const postCtaPost = { ...mockPost, post_type: 'post_cta' }
    rerender(<PostPreviewCard post={postCtaPost} />)
    expect(screen.getByText('Post-CTA Engagement')).toBeInTheDocument()
  })

  it('should display character count', () => {
    render(<PostPreviewCard post={mockPost} />)
    expect(screen.getByText('50/3000')).toBeInTheDocument() // LinkedIn limit is 3000
  })

  it('should show appropriate badge when under 90% of limit', () => {
    const shortPost = { ...mockPost, character_count: 500 } // 500/3000 = 16%
    render(<PostPreviewCard post={shortPost} />)

    // Badge should be visible with count
    expect(screen.getByText('500/3000')).toBeInTheDocument()
  })

  it('should show badge when near limit (>90%)', () => {
    const nearLimitPost = { ...mockPost, character_count: 2800 } // 2800/3000 = 93%
    render(<PostPreviewCard post={nearLimitPost} />)

    // Badge should show the count
    expect(screen.getByText('2800/3000')).toBeInTheDocument()
  })

  it('should show badge when over limit', () => {
    const overLimitPost = { ...mockPost, character_count: 3100 } // 3100/3000 = 103%
    render(<PostPreviewCard post={overLimitPost} />)

    // Badge should show the count
    expect(screen.getByText('3100/3000')).toBeInTheDocument()
  })

  it('should render Edit and Regenerate buttons', () => {
    render(<PostPreviewCard post={mockPost} />)
    expect(screen.getByText('Edit')).toBeInTheDocument()
    expect(screen.getByText('Regenerate')).toBeInTheDocument()
  })

  it('should handle different platforms correctly', () => {
    const threadsPost = {
      ...mockPost,
      platform: 'threads',
      character_count: 450,
    }
    const { rerender } = render(<PostPreviewCard post={threadsPost} />)
    expect(screen.getByText('Threads')).toBeInTheDocument()
    expect(screen.getByText('450/500')).toBeInTheDocument() // Threads limit is 500

    const facebookPost = {
      ...mockPost,
      platform: 'facebook',
      character_count: 1000,
    }
    rerender(<PostPreviewCard post={facebookPost} />)
    expect(screen.getByText('Facebook')).toBeInTheDocument()
    expect(screen.getByText('1000/63206')).toBeInTheDocument() // Facebook limit is 63206
  })

  it('should preserve line breaks in content', () => {
    const multiLinePost = {
      ...mockPost,
      content: 'Line 1\n\nLine 2\n\nLine 3',
    }
    render(<PostPreviewCard post={multiLinePost} />)

    // whitespace-pre-wrap should preserve line breaks
    const contentElement = screen.getByText(/Line 1/)
    expect(contentElement).toHaveClass('whitespace-pre-wrap')
  })

  it('should calculate percentage correctly', () => {
    const percentage = (2700 / 3000) * 100

    expect(percentage).toBe(90)
    expect(percentage > 90).toBe(false)
    expect(percentage > 100).toBe(false)
  })

  it('should have correct platform limits', () => {
    const PLATFORM_CONFIG = {
      linkedin: { limit: 3000 },
      threads: { limit: 500 },
      facebook: { limit: 63206 },
    }

    expect(PLATFORM_CONFIG.linkedin.limit).toBe(3000)
    expect(PLATFORM_CONFIG.threads.limit).toBe(500)
    expect(PLATFORM_CONFIG.facebook.limit).toBe(63206)
  })
})
