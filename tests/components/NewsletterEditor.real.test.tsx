/**
 * Real tests for NewsletterEditor component
 * Tests Tiptap integration with actual editor behavior
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock Tiptap using factory functions
vi.mock('@tiptap/react', () => ({
  useEditor: vi.fn(),
  EditorContent: ({ editor }: any) => (
    <div data-testid="editor-content">
      {editor ? 'Editor loaded' : 'Loading...'}
    </div>
  ),
}))

vi.mock('@tiptap/starter-kit', () => ({
  default: { name: 'starterKit' },
}))

vi.mock('@tiptap/extension-placeholder', () => ({
  default: {
    configure: vi.fn(() => ({ name: 'placeholder' })),
  },
}))

import { NewsletterEditor } from '@/components/newsletter-editor'
import { useEditor, Editor } from '@tiptap/react'

const mockUseEditor = vi.mocked(useEditor)

// Mock editor instance - cast to Editor to satisfy type checker
const mockEditor = {
  commands: {
    setContent: vi.fn(),
  },
  setEditable: vi.fn(),
  getText: vi.fn(() => 'Test newsletter content'),
  on: vi.fn(),
  destroy: vi.fn(),
} as unknown as Editor & {
  commands: { setContent: ReturnType<typeof vi.fn> }
  setEditable: ReturnType<typeof vi.fn>
  getText: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
}

describe('NewsletterEditor - Real Tests', () => {
  const mockOnChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseEditor.mockReturnValue(mockEditor)
    mockEditor.getText.mockReturnValue('Test newsletter content')
  })

  describe('Rendering', () => {
    it('should render editor content', () => {
      render(<NewsletterEditor content="" onChange={mockOnChange} />)

      expect(screen.getByTestId('editor-content')).toBeInTheDocument()
    })

    it('should show loading skeleton when editor is not ready', () => {
      mockUseEditor.mockReturnValue(null as unknown as Editor)

      const { container } = render(
        <NewsletterEditor content="" onChange={mockOnChange} />
      )

      const skeleton = container.querySelector('.animate-pulse')
      expect(skeleton).toBeInTheDocument()
      expect(skeleton).toHaveClass('min-h-[300px]')
    })

    it('should render word count', () => {
      mockEditor.getText.mockReturnValue('Hello world test')

      render(<NewsletterEditor content="" onChange={mockOnChange} />)

      expect(screen.getByText('3 words')).toBeInTheDocument()
    })

    it('should calculate word count correctly with multiple spaces', () => {
      mockEditor.getText.mockReturnValue('Hello    world   test    ')

      render(<NewsletterEditor content="" onChange={mockOnChange} />)

      expect(screen.getByText('3 words')).toBeInTheDocument()
    })

    it('should show 0 words for empty content', () => {
      mockEditor.getText.mockReturnValue('')

      render(<NewsletterEditor content="" onChange={mockOnChange} />)

      expect(screen.getByText('0 words')).toBeInTheDocument()
    })
  })

  describe('Editor initialization', () => {
    it('should initialize editor with StarterKit', () => {
      render(
        <NewsletterEditor content="Initial content" onChange={mockOnChange} />
      )

      expect(mockUseEditor).toHaveBeenCalledWith(
        expect.objectContaining({
          extensions: expect.arrayContaining([
            expect.anything(), // StarterKit
            expect.anything(), // Placeholder
          ]),
        })
      )
    })

    it('should set placeholder text', () => {
      render(<NewsletterEditor content="" onChange={mockOnChange} />)

      const call = mockUseEditor.mock.calls[0][0] as any
      const placeholderExt = call.extensions?.find(
        (ext: any) => ext.name === 'placeholder'
      )

      expect(placeholderExt).toBeDefined()
    })

    it('should initialize with provided content', () => {
      render(
        <NewsletterEditor content="Initial content" onChange={mockOnChange} />
      )

      const config = mockUseEditor.mock.calls[0][0]
      expect(config.content).toBe('Initial content')
    })

    it('should set editable to true by default', () => {
      render(<NewsletterEditor content="" onChange={mockOnChange} />)

      const config = mockUseEditor.mock.calls[0][0]
      expect(config.editable).toBe(true)
    })

    it('should set editable to false when disabled', () => {
      render(<NewsletterEditor content="" onChange={mockOnChange} disabled />)

      const config = mockUseEditor.mock.calls[0][0]
      expect(config.editable).toBe(false)
    })
  })

  describe('Content updates', () => {
    it('should call onChange when editor content updates', () => {
      render(<NewsletterEditor content="" onChange={mockOnChange} />)

      const config = mockUseEditor.mock.calls[0][0] as any
      const mockEditorForUpdate = {
        getText: vi.fn(() => 'Updated content'),
      }
      config.onUpdate?.({ editor: mockEditorForUpdate })

      expect(mockOnChange).toHaveBeenCalledWith('Updated content')
    })

    it('should update editor content when prop changes', () => {
      const { rerender } = render(
        <NewsletterEditor content="Initial" onChange={mockOnChange} />
      )

      mockEditor.getText.mockReturnValue('Initial')
      rerender(<NewsletterEditor content="Updated" onChange={mockOnChange} />)

      expect(mockEditor.commands.setContent).toHaveBeenCalledWith('Updated')
    })

    it('should not update editor if content matches current text', () => {
      const { rerender } = render(
        <NewsletterEditor content="Same" onChange={mockOnChange} />
      )

      mockEditor.getText.mockReturnValue('Same')
      mockEditor.commands.setContent.mockClear()

      rerender(<NewsletterEditor content="Same" onChange={mockOnChange} />)

      expect(mockEditor.commands.setContent).not.toHaveBeenCalled()
    })
  })

  describe('Disabled state', () => {
    it('should update editor editable state when disabled changes', () => {
      const { rerender } = render(
        <NewsletterEditor content="" onChange={mockOnChange} />
      )

      rerender(<NewsletterEditor content="" onChange={mockOnChange} disabled />)

      expect(mockEditor.setEditable).toHaveBeenCalledWith(false)
    })

    it('should enable editor when disabled becomes false', () => {
      const { rerender } = render(
        <NewsletterEditor content="" onChange={mockOnChange} disabled />
      )

      mockEditor.setEditable.mockClear()
      rerender(
        <NewsletterEditor content="" onChange={mockOnChange} disabled={false} />
      )

      expect(mockEditor.setEditable).toHaveBeenCalledWith(true)
    })
  })

  describe('Editor props', () => {
    it('should configure editor with proper CSS classes', () => {
      render(<NewsletterEditor content="" onChange={mockOnChange} />)

      const config = mockUseEditor.mock.calls[0][0] as any
      const classes = config.editorProps?.attributes?.class as string

      expect(classes).toContain('prose')
      expect(classes).toContain('min-h-[300px]')
      expect(classes).toContain('focus:outline-none')
    })
  })

  describe('Word count formatting', () => {
    it('should show singular "word" for 1 word', () => {
      mockEditor.getText.mockReturnValue('Hello')

      render(<NewsletterEditor content="" onChange={mockOnChange} />)

      expect(screen.getByText(/1 word/)).toBeInTheDocument()
    })

    it('should show plural "words" for multiple words', () => {
      mockEditor.getText.mockReturnValue('Hello world')

      render(<NewsletterEditor content="" onChange={mockOnChange} />)

      expect(screen.getByText(/2 words/)).toBeInTheDocument()
    })

    it('should handle newlines in word count', () => {
      mockEditor.getText.mockReturnValue('Hello\nworld\ntest')

      render(<NewsletterEditor content="" onChange={mockOnChange} />)

      expect(screen.getByText('3 words')).toBeInTheDocument()
    })
  })
})
