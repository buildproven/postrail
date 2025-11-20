'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { useEffect } from 'react'

interface NewsletterEditorProps {
  content: string
  onChange: (content: string) => void
  disabled?: boolean
}

export function NewsletterEditor({
  content,
  onChange,
  disabled,
}: NewsletterEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Paste your newsletter content here...',
      }),
    ],
    content,
    editorProps: {
      attributes: {
        class:
          'prose prose-sm sm:prose lg:prose-lg max-w-none focus:outline-none min-h-[300px] p-4 border rounded-md',
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getText())
    },
    editable: !disabled,
  })

  // Update editor content when prop changes
  useEffect(() => {
    if (editor && content !== editor.getText()) {
      editor.commands.setContent(content)
    }
  }, [content, editor])

  // Update editable state when disabled prop changes
  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled)
    }
  }, [disabled, editor])

  if (!editor) {
    return (
      <div className="min-h-[300px] p-4 border rounded-md bg-muted/50 animate-pulse" />
    )
  }

  return (
    <div className="space-y-2">
      <EditorContent editor={editor} />
      <p className="text-xs text-muted-foreground">
        {editor.getText().split(/\s+/).filter(Boolean).length} words
      </p>
    </div>
  )
}
