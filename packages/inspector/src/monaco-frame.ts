import jsonLang from '@shikijs/langs/json'
import jsoncLang from '@shikijs/langs/jsonc'
import jsonlLang from '@shikijs/langs/jsonl'
import yamlLang from '@shikijs/langs/yaml'
import vitesseDark from '@shikijs/themes/vitesse-dark'
import { init } from 'modern-monaco/core'
import { INSPECTOR_EDITOR_OPTIONS, INSPECTOR_EDITOR_THEME } from './editor-config'

const host = document.querySelector<HTMLElement>('#editor')
if (!host) {
  throw new Error('Monaco host element is missing')
}

let monaco: Awaited<ReturnType<typeof init>> | undefined
type Monaco = Awaited<ReturnType<typeof init>>
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

void init({
  defaultTheme: vitesseDark,
  themes: [vitesseDark],
  langs: [
    ...jsonLang,
    ...jsoncLang,
    ...jsonlLang,
    ...yamlLang,
  ],
}).then((instance) => {
  monaco = instance
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
}).catch((error: unknown) => {
  send({
    type: 'error',
    message: error instanceof Error
      ? error.message
      : String(error),
  })
})
