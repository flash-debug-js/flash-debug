export const INSPECTOR_EDITOR_THEME = 'vitesse-dark' as const

export const INSPECTOR_EDITOR_LANGUAGES = [
  'json',
  'jsonc',
  'jsonl',
  'yaml',
  'ansi',
  'text'
] as const

export const INSPECTOR_EDITOR_OPTIONS = {
  readOnly: true,
  domReadOnly: true,
  contextmenu: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  wordWrap: 'off' as const,
  renderWhitespace: 'selection' as const,
  padding: { top: 12, bottom: 12 },
  automaticLayout: true
}

export type InspectorEditorLanguage = typeof INSPECTOR_EDITOR_LANGUAGES[number]
