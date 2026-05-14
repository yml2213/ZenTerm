import type { Terminal } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'

interface TerminalGeometry {
  cols: number
  rows: number
}

export function measureTerminalGeometry(
  terminal: Terminal | null,
  container: HTMLElement,
  fitAddon: FitAddon | null
): TerminalGeometry | null {
  const bounds = container.getBoundingClientRect()
  if (bounds.width <= 0 || bounds.height <= 0) {
    return null
  }

  const proposed = fitAddon?.proposeDimensions?.()
  if (proposed?.cols && proposed.cols > 0 && proposed?.rows && proposed.rows > 0) {
    return {
      cols: Math.max(2, proposed.cols),
      rows: Math.max(1, proposed.rows),
    }
  }

  if (terminal?.cols && terminal.cols > 0 && terminal?.rows && terminal.rows > 0) {
    return {
      cols: terminal.cols,
      rows: terminal.rows,
    }
  }

  return null
}
