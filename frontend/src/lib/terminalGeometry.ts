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
  if (!terminal || !fitAddon) {
    return null
  }

  const bounds = container.getBoundingClientRect()
  if (bounds.width <= 0 || bounds.height <= 0) {
    return null
  }

  // 确保 terminal 已经渲染完成
  try {
    const proposed = fitAddon.proposeDimensions()
    if (proposed?.cols && proposed.cols > 0 && proposed?.rows && proposed.rows > 0) {
      return {
        cols: Math.max(2, proposed.cols),
        rows: Math.max(1, proposed.rows),
      }
    }
  } catch (error) {
    // fitAddon 可能还没准备好，回退到终端当前尺寸
    console.warn('FitAddon proposeDimensions failed:', error)
  }

  if (terminal.cols && terminal.cols > 0 && terminal.rows && terminal.rows > 0) {
    return {
      cols: terminal.cols,
      rows: terminal.rows,
    }
  }

  return null
}
