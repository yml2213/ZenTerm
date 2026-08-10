import { cmd } from '@/lib/backendModels'

type Host = cmd.Host

export interface HostFormModel {
  id: string
  name: string
  address: string
  port: string
  username: string
  group: string
  tags: string
  favorite: boolean
  systemType: string
  systemTypeSource: 'auto' | 'manual'
  authType: 'password' | 'key' | 'credential'
  password?: string
  privateKey?: string
  credentialId?: string
}

const initialState: HostFormModel = {
  id: '',
  name: '',
  address: '',
  port: '22',
  username: '',
  group: '',
  tags: '',
  favorite: false,
  systemType: '',
  systemTypeSource: 'auto',
  authType: 'password',
  password: '',
  privateKey: '',
  credentialId: '',
}

export function createInitialHostForm(): HostFormModel {
  return { ...initialState }
}

export function createHostFormFromHost(host: Host | null | undefined): HostFormModel {
  const systemTypeSource = host?.system_type_source
  return {
    id: host?.id || '',
    name: host?.name || '',
    address: host?.address || '',
    port: String(host?.port || 22),
    username: host?.username || '',
    group: host?.group || '',
    tags: host?.tags || '',
    favorite: Boolean(host?.favorite),
    systemType: host?.system_type || '',
    systemTypeSource: (systemTypeSource === 'manual' ? 'manual' : 'auto') as 'auto' | 'manual',
    authType: host?.credential_id ? 'credential' : 'password',
    password: '',
    privateKey: '',
    credentialId: host?.credential_id || '',
  }
}
