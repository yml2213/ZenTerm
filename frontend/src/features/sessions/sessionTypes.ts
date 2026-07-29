export interface HostKeyPrompt {
  hostID: string
  remoteAddr: string
  key: string
  sha256: string
  md5: string
  reason: 'first_seen' | 'changed'
  previousSHA256?: string
  previousMD5?: string
}
