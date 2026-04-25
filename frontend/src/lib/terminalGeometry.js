export function measureTerminalGeometry(terminal, container, fitAddon) {
  const bounds = container.getBoundingClientRect()
  if (bounds.width <= 0 || bounds.height <= 0) {
    return null
  }

  const proposed = fitAddon?.proposeDimensions?.()
  if (proposed?.cols > 0 && proposed?.rows > 0) {
    return {
      cols: Math.max(2, proposed.cols),
      rows: Math.max(1, proposed.rows),
    }
  }

  if (terminal?.cols > 0 && terminal?.rows > 0) {
    return {
      cols: terminal.cols,
      rows: terminal.rows,
    }
  }

  return null
}
