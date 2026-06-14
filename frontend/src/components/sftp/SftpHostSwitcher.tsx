import { Server, X } from 'lucide-react'
import { cmd } from '../../wailsjs/wailsjs/go/models'

type Host = cmd.Host

interface SftpHostSwitcherProps {
  hosts: Host[]
  selectedHost: Host | null
  onChooseHost: (hostId?: string | null) => void
}

export default function SftpHostSwitcher({
  hosts,
  selectedHost,
  onChooseHost,
}: SftpHostSwitcherProps) {
  if (!selectedHost) {
    return null
  }

  return (
    <div
      className="sftp-host-switcher-group"
      title={`${selectedHost.name || selectedHost.id} · ${selectedHost.username}@${selectedHost.address}:${selectedHost.port || 22}`}
    >
      <Server size={14} />
      {hosts.length > 1 ? (
        <label className="sftp-host-switcher">
          <select
            aria-label="切换 SFTP 主机"
            value={selectedHost.id}
            onChange={(event) => onChooseHost(event.target.value)}
          >
            {hosts.map((host) => (
              <option key={host.id} value={host.id}>
                {host.name || host.id}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <span className="sftp-current-host-label">{selectedHost.name || selectedHost.id}</span>
      )}
      <button
        type="button"
        className="icon-button sftp-tab-close"
        aria-label="关闭远端"
        title="关闭远端"
        onClick={() => onChooseHost(null)}
      >
        <X size={14} />
      </button>
    </div>
  )
}
