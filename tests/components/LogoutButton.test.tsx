/**
 * Tests for LogoutButton component
 * Tests logout functionality and navigation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LogoutButton } from '@/components/logout-button'

// Mock next/navigation
const mockPush = vi.fn()
const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}))

// Mock Supabase client
const mockSignOut = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signOut: mockSignOut,
    },
  }),
}))

describe('LogoutButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSignOut.mockResolvedValue({ error: null })
  })

  describe('Rendering', () => {
    it('should render logout button', () => {
      render(<LogoutButton />)

      const button = screen.getByRole('button', { name: /log out/i })
      expect(button).toBeInTheDocument()
    })

    it('should render button with correct text', () => {
      render(<LogoutButton />)

      const button = screen.getByRole('button', { name: /log out/i })
      expect(button).toHaveTextContent('Log out')
    })

    it('should render as a button element', () => {
      render(<LogoutButton />)

      const button = screen.getByRole('button', { name: /log out/i })
      expect(button.tagName).toBe('BUTTON')
    })
  })

  describe('Logout functionality', () => {
    it('should call signOut when clicked', async () => {
      render(<LogoutButton />)

      const button = screen.getByRole('button', { name: /log out/i })
      fireEvent.click(button)

      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalledTimes(1)
      })
    })

    it('should navigate to home page after signOut', async () => {
      render(<LogoutButton />)

      const button = screen.getByRole('button', { name: /log out/i })
      fireEvent.click(button)

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/')
      })
    })

    it('should refresh router after signOut', async () => {
      render(<LogoutButton />)

      const button = screen.getByRole('button', { name: /log out/i })
      fireEvent.click(button)

      await waitFor(() => {
        expect(mockRefresh).toHaveBeenCalledTimes(1)
      })
    })

    it('should call actions in correct order: signOut, push, refresh', async () => {
      const callOrder: string[] = []

      mockSignOut.mockImplementation(async () => {
        callOrder.push('signOut')
        return { error: null }
      })

      mockPush.mockImplementation(() => {
        callOrder.push('push')
      })

      mockRefresh.mockImplementation(() => {
        callOrder.push('refresh')
      })

      render(<LogoutButton />)

      const button = screen.getByRole('button', { name: /log out/i })
      fireEvent.click(button)

      await waitFor(() => {
        expect(callOrder).toEqual(['signOut', 'push', 'refresh'])
      })
    })
  })

  describe('Successful logout flow', () => {
    it('should complete full logout flow when signOut succeeds', async () => {
      mockSignOut.mockResolvedValue({ error: null })

      render(<LogoutButton />)

      const button = screen.getByRole('button', { name: /log out/i })
      fireEvent.click(button)

      // All steps should complete
      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalled()
        expect(mockPush).toHaveBeenCalledWith('/')
        expect(mockRefresh).toHaveBeenCalled()
      })
    })
  })

  describe('Multiple clicks', () => {
    it('should handle multiple rapid clicks', async () => {
      render(<LogoutButton />)

      const button = screen.getByRole('button', { name: /log out/i })

      // Click multiple times rapidly
      fireEvent.click(button)
      fireEvent.click(button)
      fireEvent.click(button)

      // All clicks should trigger signOut (no debouncing)
      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalledTimes(3)
      })
    })
  })
})
