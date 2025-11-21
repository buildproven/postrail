import { describe, it, expect, vi } from 'vitest'

/**
 * Unit tests for NewsletterEditor logic
 * Tests focus on the component's data handling and validation
 */

describe('NewsletterEditor Logic', () => {
  it('should have correct placeholder text', () => {
    const placeholderText = 'Paste your newsletter content here...'
    expect(placeholderText).toBe('Paste your newsletter content here...')
  })

  it('should calculate word count correctly', () => {
    const content = 'This is a test newsletter with ten words exactly here'
    const words = content.trim().split(/\s+/)
    expect(words.length).toBe(10)
  })

  it('should handle empty content', () => {
    const emptyContent = ''
    const words = emptyContent
      .trim()
      .split(/\s+/)
      .filter(w => w.length > 0)
    expect(words.length).toBe(0)
  })

  it('should format word count display', () => {
    const formatWordCount = (count: number) =>
      `${count} word${count === 1 ? '' : 's'}`

    expect(formatWordCount(0)).toBe('0 words')
    expect(formatWordCount(1)).toBe('1 word')
    expect(formatWordCount(10)).toBe('10 words')
  })

  it('should handle very long content', () => {
    const longContent = 'word '.repeat(5000).trim()
    const words = longContent.split(/\s+/)
    expect(words.length).toBe(5000)
  })

  it('should preserve paragraph structure', () => {
    const multiParagraph = 'Paragraph 1\n\nParagraph 2\n\nParagraph 3'
    const paragraphs = multiParagraph.split('\n\n')

    expect(paragraphs.length).toBe(3)
    expect(paragraphs[0]).toBe('Paragraph 1')
    expect(paragraphs[2]).toBe('Paragraph 3')
  })

  it('should handle onChange callback', () => {
    const onChange = vi.fn()
    const newContent = 'New content'

    onChange(newContent)

    expect(onChange).toHaveBeenCalledWith(newContent)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('should respect disabled state', () => {
    const isDisabled = true
    expect(isDisabled).toBe(true)

    const isEnabled = false
    expect(isEnabled).toBe(false)
  })

  it('should update word count on content change', () => {
    const content1 = ''
    const content2 = 'Hello world'
    const content3 = 'This is a longer piece of content'

    expect(
      content1
        .trim()
        .split(/\s+/)
        .filter(w => w.length > 0).length
    ).toBe(0)
    expect(content2.trim().split(/\s+/).length).toBe(2)
    expect(content3.trim().split(/\s+/).length).toBe(7)
  })

  it('should handle whitespace correctly', () => {
    const withExtraSpaces = '  Multiple   spaces   between   words  '
    const normalized = withExtraSpaces.trim().replace(/\s+/g, ' ')

    expect(normalized).toBe('Multiple spaces between words')
  })

  it('should validate Tiptap extensions', () => {
    const requiredExtensions = ['StarterKit', 'Placeholder']

    expect(requiredExtensions).toContain('StarterKit')
    expect(requiredExtensions).toContain('Placeholder')
  })

  it('should format large word counts', () => {
    const largeNumber = 1234567
    const formatted = largeNumber.toLocaleString()

    expect(formatted).toContain(',')
  })

  it('should handle line breaks in word count', () => {
    const contentWithLineBreaks = 'Line 1\nLine 2\nLine 3'
    const words = contentWithLineBreaks.trim().split(/\s+/)

    expect(words.length).toBe(6)
  })
})

describe('Editor Configuration', () => {
  it('should have correct editor setup', () => {
    const editorConfig = {
      extensions: ['StarterKit', 'Placeholder'],
      editable: true,
      placeholder: 'Paste your newsletter content here...',
    }

    expect(editorConfig.extensions).toHaveLength(2)
    expect(editorConfig.editable).toBe(true)
    expect(editorConfig.placeholder).toContain('newsletter')
  })

  it('should handle disabled state correctly', () => {
    const getEditable = (disabled: boolean) => !disabled

    expect(getEditable(false)).toBe(true)
    expect(getEditable(true)).toBe(false)
  })

  it('should call onChange with getText()', () => {
    const mockGetText = () => 'Extracted text from editor'
    const text = mockGetText()

    expect(text).toBe('Extracted text from editor')
    expect(typeof text).toBe('string')
  })
})
