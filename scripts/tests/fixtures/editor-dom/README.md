# Tiptap DOM regression

Start the isolated fixture from the repository root:

    node_modules/.bin/vite --config scripts/tests/fixtures/editor-dom/vite.config.ts

Open http://127.0.0.1:4176/ and repeatedly replace the editor, add outline branches,
change layout, and toggle read mode. The document must remain mounted and editable.
No account or production data is used.

The `?unsafe=1` variant uses the original adjacent EditorContent/BubbleMenu layout.
Replacing the editor reproduces the original `insertBefore` / PureEditorContent
crash. The normal variant uses the production EditorSurface containers.
