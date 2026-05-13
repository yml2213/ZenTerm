import { useHostActionHandlers } from './useHostActionHandlers'
import { useSessionActionHandlers } from './useSessionActionHandlers'
import { useVaultActionHandlers } from './useVaultActionHandlers'

interface AppActionHandlersProps {
  vaultState: any
  hostState: any
  sessionState: any
  setters: any
  refs: any
  helpers: any
}

export function useAppActionHandlers({
  vaultState,
  hostState,
  sessionState,
  setters,
  refs,
  helpers,
}: AppActionHandlersProps) {
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

  function handleSidebarPageChange(page: string) {
    setters.setActiveSidebarPage(page)
  }

  return {
    ...vaultActions,
    ...hostActions,
    ...sessionActions,
    handleSidebarPageChange,
  }
}
