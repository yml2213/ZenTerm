function readPixelValue(style, property) {
  const value = Number.parseFloat(style.getPropertyValue(property))
  return Number.isFinite(value) ? value : 0
}

export function measureTerminalGeometry(terminal, container, fitAddon) {
  const bounds = container.getBoundingClientRect()
  if (bounds.width <= 0 || bounds.height <= 0) {
    return null
  }

  const core = terminal._core
  const cell = core?._renderService?.dimensions?.css?.cell
  if (!cell || cell.width <= 0 || cell.height <= 0) {
    return fitAddon.proposeDimensions() || null
  }

  const style = window.getComputedStyle(container)
  const availableWidth = bounds.width
    - readPixelValue(style, 'padding-left')
    - readPixelValue(style, 'padding-right')
    - (terminal.options.scrollback === 0 ? 0 : (core?.viewport?.scrollBarWidth || 0))
  const availableHeight = bounds.height
    - readPixelValue(style, 'padding-top')
    - readPixelValue(style, 'padding-bottom')

  return {
    cols: Math.max(2, Math.floor(availableWidth / cell.width)),
    rows: Math.max(1, Math.floor(availableHeight / cell.height)),
  }
}
