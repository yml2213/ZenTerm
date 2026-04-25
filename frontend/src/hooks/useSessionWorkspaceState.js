import { useState } from 'react'
import { useWorkspaceState } from './useWorkspaceState.js'

export function useSessionWorkspaceState() {
  const workspace = useWorkspaceState()
  const [hostKeyPrompt, setHostKeyPrompt] = useState(null)
  const [isAcceptingKey, setIsAcceptingKey] = useState(false)
  const [connectingHostIds, setConnectingHostIds] = useState([])

  return {
    ...workspace,
    hostKeyPrompt,
    setHostKeyPrompt,
    isAcceptingKey,
    setIsAcceptingKey,
    connectingHostIds,
    setConnectingHostIds,
  }
}
