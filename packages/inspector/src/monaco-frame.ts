import { INSPECTOR_EDITOR_OPTIONS, INSPECTOR_EDITOR_THEME } from './editor-config'

const MODERN_MONACO_CORE_URL = 'https://esm.sh/modern-monaco@0.4.2/core'

type ModernMonacoModule = typeof import('modern-monaco/core')
type Monaco = Awaited<ReturnType<ModernMonacoModule['init']>>

const editorHost = document.querySelector<HTMLElement>('#editor')
if (!editorHost) {
  throw new Error('Monaco host element is missing')
}
const host: HTMLElement = editorHost

let monaco: Monaco | undefined
type MonacoEditor = ReturnType<Monaco['editor']['create']>
type MonacoModel = ReturnType<Monaco['editor']['createModel']>
let editor: MonacoEditor | undefined
let model: MonacoModel | undefined
let pending: { content: string, language: string } | undefined

function send(message: Record<string, unknown>): void {
  window.parent.postMessage({ source: 'flash-debug-monaco', ...message }, window.location.origin)
}

function applyContent(content: string, language: string): void {
  if (!monaco || !editor) {
    pending = { content, language }
    return
  }

  if (!model) {
    model = monaco.editor.createModel(content, language)
    editor.setModel(model)
    return
  }

  model.setValue(content)
  monaco.editor.setModelLanguage(model as never, language)
}

window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin || event.data?.source !== 'flash-debug-inspector') {
    return
  }
  if (event.data.type === 'set-content' && typeof event.data.content === 'string' && typeof event.data.language === 'string') {
    applyContent(event.data.content, event.data.language)
  }
})

async function startEditor(): Promise<void> {
  const { init } = await import(/* @vite-ignore */ MODERN_MONACO_CORE_URL) as ModernMonacoModule
  monaco = await init({
    defaultTheme: INSPECTOR_EDITOR_THEME,
    themes: [INSPECTOR_EDITOR_THEME],
    langs: ['json', 'jsonc', 'jsonl', 'yaml'],
  })
  editor = monaco.editor.create(host, {
    ...INSPECTOR_EDITOR_OPTIONS,
    theme: INSPECTOR_EDITOR_THEME,
    language: 'text',
    value: '',
  })
  send({ type: 'ready' })
  if (pending) {
    applyContent(pending.content, pending.language)
    pending = undefined
  }
}

void startEditor().catch((error: unknown) => {
  send({
    type: 'error',
    message: error instanceof Error
      ? error.message
      : String(error),
  })
})
