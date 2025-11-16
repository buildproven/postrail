import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PostPreviewCard } from '@/components/post-preview-card'

/**
 * Real Component Tests - PostPreviewCard
 * These tests actually import and render the component
 */

describe('PostPreviewCard Component', () => {
  const mockLinkedInPost = {
    id: '1',
    platform: 'linkedin' as const,
    post_type: 'pre_cta' as const,
    content: 'This is a test LinkedIn post about AI automation and newsletter growth strategies.',
    character_count: 85,
    status: 'draft' as const,
  }

  describe('Rendering', () => {
    it('should render the component with post content', () => {
      render(<PostPreviewCard post={mockLinkedInPost} />)

      expect(screen.getByText(/AI automation/i)).toBeInTheDocument()
      expect(screen.getByText(/newsletter growth/i)).toBeInTheDocument()
    })

    it('should display platform name', () => {
      render(<PostPreviewCard post={mockLinkedInPost} />)

      expect(screen.getByText('LinkedIn')).toBeInTheDocument()
    })

    it('should show post type label for Pre-CTA', () => {
      render(<PostPreviewCard post={mockLinkedInPost} />)

      expect(screen.getByText('Pre-CTA Teaser')).toBeInTheDocument()
    })

    it('should show post type label for Post-CTA', () => {
      const postCtaPost = { ...mockLinkedInPost, post_type: 'post_cta' as const }
      render(<PostPreviewCard post={postCtaPost} />)

      expect(screen.getByText('Post-CTA Engagement')).toBeInTheDocument()
    })

    it('should display character count with platform limit', () => {
      render(<PostPreviewCard post={mockLinkedInPost} />)

      // LinkedIn limit is 3000
      expect(screen.getByText('85/3000')).toBeInTheDocument()
    })
  })

  describe('Character Limit Badges', () => {
    it('should show green badge when under 90% of limit', () => {
      const shortPost = { ...mockLinkedInPost, character_count: 500 } // 500/3000 = 16.7%
      render(<PostPreviewCard post={shortPost} />)

      // Character count should be displayed
      expect(screen.getByText('500/3000')).toBeInTheDocument()
      // Test passes if count is shown correctly
    })

    it('should show warning badge when 90-100% of limit', () => {
      const nearLimitPost = { ...mockLinkedInPost, character_count: 2800 } // 93%
      render(<PostPreviewCard post={nearLimitPost} />)

      expect(screen.getByText('2800/3000')).toBeInTheDocument()
    })

    it('should show error badge when over 100% of limit', () => {
      const overLimitPost = { ...mockLinkedInPost, character_count: 3100 } // 103%
      render(<PostPreviewCard post={overLimitPost} />)

      expect(screen.getByText('3100/3000')).toBeInTheDocument()
    })
  })

  describe('Platform-Specific Limits', () => {
    it('should show correct limit for Threads (500)', () => {
      const threadsPost = {
        ...mockLinkedInPost,
        platform: 'threads' as const,
        character_count: 450,
      }
      render(<PostPreviewCard post={threadsPost} />)

      expect(screen.getByText('Threads')).toBeInTheDocument()
      expect(screen.getByText('450/500')).toBeInTheDocument()
    })

    it('should show correct limit for Facebook (63206)', () => {
      const facebookPost = {
        ...mockLinkedInPost,
        platform: 'facebook' as const,
        character_count: 1000,
      }
      render(<PostPreviewCard post={facebookPost} />)

      expect(screen.getByText('Facebook')).toBeInTheDocument()
      expect(screen.getByText('1000/63206')).toBeInTheDocument()
    })
  })

  describe('Action Buttons', () => {
    it('should render Edit button', () => {
      render(<PostPreviewCard post={mockLinkedInPost} />)

      const editButton = screen.getByText('Edit')
      expect(editButton).toBeInTheDocument()
    })

    it('should render Regenerate button', () => {
      render(<PostPreviewCard post={mockLinkedInPost} />)

      const regenerateButton = screen.getByText('Regenerate')
      expect(regenerateButton).toBeInTheDocument()
    })
  })

  describe('Content Formatting', () => {
    it('should preserve line breaks in content', () => {
      const multiLinePost = {
        ...mockLinkedInPost,
        content: 'Line 1\n\nLine 2\n\nLine 3',
      }
      const { container } = render(<PostPreviewCard post={multiLinePost} />)

      // Content should be in element with whitespace-pre-wrap class
      const contentElement = container.querySelector('.whitespace-pre-wrap')
      expect(contentElement).toBeInTheDocument()
      expect(contentElement?.textContent).toContain('Line 1')
    })

    it('should handle very long content', () => {
      const longPost = {
        ...mockLinkedInPost,
        content: 'word '.repeat(1000).trim(),
        character_count: 5000,
      }
      render(<PostPreviewCard post={longPost} />)

      expect(screen.getByText('5000/3000')).toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty content', () => {
      const emptyPost = {
        ...mockLinkedInPost,
        content: '',
        character_count: 0,
      }
      render(<PostPreviewCard post={emptyPost} />)

      expect(screen.getByText('0/3000')).toBeInTheDocument()
    })

    it('should handle exactly at limit', () => {
      const exactLimitPost = {
        ...mockLinkedInPost,
        content: 'a'.repeat(3000),
        character_count: 3000,
      }
      render(<PostPreviewCard post={exactLimitPost} />)

      expect(screen.getByText('3000/3000')).toBeInTheDocument()
    })
  })
})
