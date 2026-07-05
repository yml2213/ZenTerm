import { Database, HardDrive, Monitor, Server, TerminalSquare } from 'lucide-react'
import type { ComponentType } from 'react'

// 系统类型图标与 profile：从 HostList 拆出，便于独立维护与复用 / system-type icons and profiles, extracted from HostList for independent maintenance and reuse.

function UbuntuMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <circle cx="19" cy="7" r="2.2" fill="currentColor" />
      <circle cx="5.4" cy="7.8" r="2.2" fill="currentColor" />
      <circle cx="10.2" cy="20" r="2.2" fill="currentColor" />
      <path d="M15.3 9.1 17.5 7.8M8.7 9.4 6.9 8.4M11.3 16.2l-.7 1.7" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  )
}

function DebianMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M15.8 7.1c-1.8-1.8-5.8-1.2-7.7 1.1-2.2 2.6-.8 6.4 2.8 6.9 3.4.5 5.4-2.5 3.3-4.5-1.5-1.4-4.1-.7-4.4 1.1-.2 1.3.8 2.1 2.1 1.8"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.1"
      />
      <path d="M7.2 18.2c2.1 1.4 5.2 1.5 7.7.2 2.7-1.4 4.2-4 3.8-6.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.1" />
    </svg>
  )
}

function WindowsMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 5.5 10.5 4v7H4V5.5Zm8-1.8L20 2v9h-8V3.7ZM4 13h6.5v7L4 18.6V13Zm8 0h8v9l-8-1.7V13Z" fill="currentColor" />
    </svg>
  )
}

type SystemIconComponent = ComponentType<{ size?: number }>

const systemProfiles: Array<{ id: string; label: string; icon: SystemIconComponent }> = [
  { id: 'ubuntu', label: 'Ubuntu', icon: UbuntuMark },
  { id: 'debian', label: 'Debian', icon: DebianMark },
  { id: 'centos', label: 'CentOS', icon: TerminalSquare },
  { id: 'rhel', label: 'Red Hat', icon: TerminalSquare },
  { id: 'fedora', label: 'Fedora', icon: TerminalSquare },
  { id: 'alpine', label: 'Alpine', icon: TerminalSquare },
  { id: 'arch', label: 'Arch Linux', icon: TerminalSquare },
  { id: 'linux', label: 'Linux', icon: TerminalSquare },
  { id: 'macos', label: 'macOS', icon: Monitor },
  { id: 'windows', label: 'Windows', icon: WindowsMark },
  { id: 'database', label: 'Database', icon: Database },
  { id: 'cache', label: 'Cache', icon: Database },
  { id: 'gateway', label: 'Gateway', icon: HardDrive },
]

export function getHostSystemProfile(systemType?: string) {
  return systemProfiles.find((profile) => profile.id === systemType) || {
    id: 'server',
    label: 'Server',
    icon: Server,
  }
}
