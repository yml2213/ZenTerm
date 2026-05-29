import { KeyRound, ShieldCheck, ShieldQuestion } from 'lucide-react'

export interface CredentialType {
  id: string
  label: string
  icon: typeof KeyRound
}

export interface KeyAlgorithm {
  id: string
  label: string
  bits: number[] | null
}

export interface KeySize {
  value: number
  label: string
}

export interface GenerateKeyForm {
  label: string
  algorithm: string
  keyBits: number | null
  passphrase: string
}

export interface ImportKeyForm {
  label: string
  privateKeyPEM: string
  passphrase: string
}

export interface UploadKeyForm {
  hostId: string
  bindAfterUpload: boolean
}

export interface ImportLocalKeyForm {
  label: string
  passphrase: string
}

export const credentialTypes: CredentialType[] = [
  { id: 'ssh_key', label: 'SSH 密钥', icon: KeyRound },
  { id: 'password', label: '密码', icon: ShieldCheck },
  { id: 'certificate', label: '证书', icon: ShieldQuestion },
]

export const keyAlgorithms: KeyAlgorithm[] = [
  { id: 'ed25519', label: 'ED25519', bits: null },
  { id: 'rsa', label: 'RSA', bits: [2048, 4096] },
  { id: 'ecdsa', label: 'ECDSA', bits: [256, 384, 521] },
]

export const rsaKeySizes: KeySize[] = [
  { value: 2048, label: '2048 位 (推荐)' },
  { value: 4096, label: '4096 位 (高安全)' },
]

export const ecdsaCurves: KeySize[] = [
  { value: 256, label: 'P-256 (快速)' },
  { value: 384, label: 'P-384 (推荐)' },
  { value: 521, label: 'P-521 (高安全)' },
]

export function createGenerateKeyForm(): GenerateKeyForm {
  return {
    label: '',
    algorithm: 'ed25519',
    keyBits: 2048,
    passphrase: '',
  }
}

export function createImportKeyForm(): ImportKeyForm {
  return {
    label: '',
    privateKeyPEM: '',
    passphrase: '',
  }
}

export function formatKeychainDate(dateString: string | undefined): string {
  if (!dateString) return '从未使用'
  const date = new Date(dateString)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
