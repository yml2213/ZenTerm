import { useHostActionHandlers } from './useHostActionHandlers.js'
import { useSessionActionHandlers } from './useSessionActionHandlers.js'
import { useVaultActionHandlers } from './useVaultActionHandlers.js'

export function useAppActionHandlers({
  vaultState,
  hostState,
  sessionState,
  setters,
  refs,
  helpers,
}) {
  const vaultActions = useVaultActionHandlers({
    state: vaultState,
    setters,
    refs,
  })

  const hostActions = useHostActionHandlers({
    state: hostState,
    setters,
    helpers,
  })

  const sessionActions = useSessionActionHandlers({
    state: sessionState,
    setters,
    refs,
    helpers,
  })

  function handleSidebarPageChange(page) {
    setters.setActiveSidebarPage(page)
  }

  return {
    ...vaultActions,
    ...hostActions,
    ...sessionActions,
    handleSidebarPageChange,
  }
}
