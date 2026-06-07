import type { MouseEvent } from 'react'
import type { TerminalPreferences } from '../../contexts/TerminalPreferencesProvider'
import type { TerminalPlugin, TerminalPluginContext } from './plugins/builtin'

export interface TerminalPluginRuntime {
  handleInput: (data: string) => Promise<string | false>
  handleOutput: (sessionId: string, chunk: string) => void
  handleContextMenu: (event: MouseEvent<HTMLDivElement>) => Promise<boolean>
  handleSessionChange: (sessionId: string | null) => void
  handlePreferencesChange: (preferences: TerminalPreferences) => void
  dispose: () => void
}

export function createTerminalPluginRuntime(
  plugins: TerminalPlugin[],
  context: TerminalPluginContext,
): TerminalPluginRuntime {
  const disposers = plugins
    .map((plugin) => {
      try {
        return plugin.activate?.(context)
      } catch (error) {
        context.reportError(error)
        return undefined
      }
    })
    .filter((dispose): dispose is () => void => typeof dispose === 'function')

  return {
    async handleInput(data) {
      let nextData: string | false = data
      for (const plugin of plugins) {
        if (!plugin.onInput || nextData === false) {
          continue
        }

        try {
          const result = await plugin.onInput(nextData, context)
          if (result === false) {
            nextData = false
          } else if (typeof result === 'string') {
            nextData = result
          }
        } catch (error) {
          context.reportError(error)
        }
      }

      return nextData
    },

    handleOutput(sessionId, chunk) {
      for (const plugin of plugins) {
        try {
          plugin.onOutput?.(sessionId, chunk, context)
        } catch (error) {
          context.reportError(error)
        }
      }
    },

    async handleContextMenu(event) {
      for (const plugin of plugins) {
        if (!plugin.onContextMenu) {
          continue
        }

        try {
          const consumed = await plugin.onContextMenu(event, context)
          if (consumed || event.defaultPrevented) {
            return true
          }
        } catch (error) {
          context.reportError(error)
        }
      }

      return false
    },

    handleSessionChange(sessionId) {
      for (const plugin of plugins) {
        try {
          plugin.onSessionChange?.(sessionId, context)
        } catch (error) {
          context.reportError(error)
        }
      }
    },

    handlePreferencesChange(preferences) {
      for (const plugin of plugins) {
        try {
          plugin.onPreferencesChange?.(preferences, context)
        } catch (error) {
          context.reportError(error)
        }
      }
    },

    dispose() {
      for (const dispose of [...disposers].reverse()) {
        try {
          dispose()
        } catch (error) {
          context.reportError(error)
        }
      }
      disposers.length = 0
    },
  }
}
