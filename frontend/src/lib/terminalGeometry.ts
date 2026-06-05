import type { Terminal } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'

interface TerminalGeometry {
  cols: number
  rows: number
}

interface TerminalRenderDimensions {
  css?: {
    cell?: {
      width?: number
      height?: number
    }
  }
}

interface TerminalWithCore extends Terminal {
  _core?: {
    _renderService?: {
      dimensions?: TerminalRenderDimensions
    }
  }
}

function readPixelVariable(container: HTMLElement, name: string): number {
  const value = window.getComputedStyle(container).getPropertyValue(name).trim()
  const pixels = Number.parseFloat(value)

  return Number.isFinite(pixels) && pixels > 0 ? pixels : 0
}

function applyReservedSpace(terminal: Terminal, container: HTMLElement, geometry: TerminalGeometry): TerminalGeometry {
  const dimensions = (terminal as TerminalWithCore)._core?._renderService?.dimensions
  const cellWidth = dimensions?.css?.cell?.width
  const cellHeight = dimensions?.css?.cell?.height

  if (!cellWidth || !cellHeight) {
    return geometry
  }

  const reservedWidth = readPixelVariable(container, '--terminal-scrollbar-safe-width')
  const reservedHeight = readPixelVariable(container, '--terminal-bottom-safe-height')
  const reservedCols = Math.ceil(reservedWidth / cellWidth)
  const reservedRows = Math.ceil(reservedHeight / cellHeight)

  return {
    cols: Math.max(2, geometry.cols - reservedCols),
    rows: Math.max(1, geometry.rows - reservedRows),
  }
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
      return applyReservedSpace(terminal, container, {
        cols: Math.max(2, proposed.cols),
        rows: Math.max(1, proposed.rows),
      })
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
