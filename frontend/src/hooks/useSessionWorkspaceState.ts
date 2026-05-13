import { useState } from 'react'
import { useWorkspaceState } from './useWorkspaceState'
import { HostKeyPrompt } from '../types'

export function useSessionWorkspaceState() {
  const workspace = useWorkspaceState()
  const [hostKeyPrompt, setHostKeyPrompt] = useState<HostKeyPrompt | null>(null)
  const [isAcceptingKey, setIsAcceptingKey] = useState(false)
  const [connectingHostIds, setConnectingHostIds] = useState<string[]>([])

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

export type SessionWorkspaceState = ReturnType<typeof useSessionWorkspaceState>
