import { useState } from 'react'
import { useWorkspaceState } from '../workspace/useWorkspaceState'
import type { HostKeyPrompt, KeyboardInteractivePrompt } from './sessionTypes'

export function useSessionWorkspaceState() {
  const workspace = useWorkspaceState()
  const [hostKeyPrompt, setHostKeyPrompt] = useState<HostKeyPrompt | null>(null)
  const [isAcceptingKey, setIsAcceptingKey] = useState(false)
  const [keyboardInteractivePrompt, setKeyboardInteractivePrompt] = useState<KeyboardInteractivePrompt | null>(null)
  const [isAnsweringKeyboardInteractive, setIsAnsweringKeyboardInteractive] = useState(false)
  const [connectingHostIds, setConnectingHostIds] = useState<string[]>([])

  return {
    ...workspace,
    hostKeyPrompt,
    setHostKeyPrompt,
    isAcceptingKey,
    setIsAcceptingKey,
    keyboardInteractivePrompt,
    setKeyboardInteractivePrompt,
    isAnsweringKeyboardInteractive,
    setIsAnsweringKeyboardInteractive,
    connectingHostIds,
    setConnectingHostIds,
  }
}

export type SessionWorkspaceState = ReturnType<typeof useSessionWorkspaceState>
