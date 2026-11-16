export interface HelpShortcut {
  label: string
  keys: readonly string[]
  alternatives?: readonly (readonly string[])[]
}

export const HELP_SHORTCUTS: readonly HelpShortcut[] = [
  {
    label: 'Select one log',
    keys: ['Click'],
  },
  {
    label: 'Add or remove a log',
    keys: ['Ctrl', 'Click'],
  },
  {
    label: 'Select a range',
    keys: ['Shift', 'Click'],
  },
  {
    label: 'Open log details',
    keys: ['Double click'],
    alternatives: [
      ['Middle click'],
    ],
  },
  {
    label: 'Copy selected raw JSON',
    keys: ['Ctrl', 'C'],
  },
  {
    label: 'Paste JSON logs',
    keys: ['Ctrl', 'V'],
  },
  {
    label: 'Switch log view',
    keys: ['X'],
  },
  {
    label: 'Open QR code',
    keys: ['Q'],
  },
  {
    label: 'Focus search',
    keys: ['/'],
  },
  {
    label: 'Close a dialog',
    keys: ['Esc'],
  },
]
