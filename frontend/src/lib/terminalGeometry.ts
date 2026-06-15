import type { Terminal } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'

// ⚠️ xterm.js 私有 API 依赖：下面的 TerminalWithCore 类型访问 _core._renderService.dimensions，
// 这是 xterm.js 未公开的内部结构。任何 @xterm/xterm 小版本升级都可能让读取静默失败
// （函数会回退到未裁剪的 geometry，不会崩，但终端预留空间布局会错）。
// 升级 @xterm/xterm 或 @xterm/addon-fit 时必须人工验证：
//   1. 终端右下角仍为终端内容留出 --terminal-bottom-safe-height 和滚动条安全宽度
//   2. applyReservedSpace 在 dimensions 不可用时优雅回退
//
// Private-API dependency: TerminalWithCore below reaches into _core._renderService.dimensions,
// an undocumented xterm.js internal. Any minor bump of @xterm/xterm can silently break this read
// (applyReservedSpace falls back to the untrimmed geometry — it won't crash, but the reserved
// space layout will be off). When bumping @xterm/xterm / @xterm/addon-fit, manually verify the
// reserved space still renders and the fallback path still works.

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
