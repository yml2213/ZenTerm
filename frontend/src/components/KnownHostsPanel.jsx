import { Fingerprint, Server, ShieldCheck, ShieldQuestion } from 'lucide-react'

function parseKnownHostLine(line, index) {
  const [algorithm = 'unknown', encoded = '', ...commentParts] = line.trim().split(/\s+/)
  const comment = commentParts.join(' ').trim()

  return {
    id: `${algorithm}-${index}-${encoded.slice(0, 12)}`,
    algorithm,
    preview: encoded ? `${encoded.slice(0, 12)}...${encoded.slice(-10)}` : '未识别内容',
    comment,
  }
}

function buildKnownHostGroups(hosts) {
  return hosts
    .map((host) => {
      const entries = String(host.known_hosts || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map(parseKnownHostLine)

      return {
        host,
        entries,
      }
    })
    .filter((group) => group.entries.length > 0)
}

export default function KnownHostsPanel({ hosts }) {
  const groups = buildKnownHostGroups(hosts)
  const trustedHostCount = groups.length
  const trustedKeyCount = groups.reduce((sum, group) => sum + group.entries.length, 0)

  if (groups.length === 0) {
    return (
      <section className="known-hosts-stage panel">
        <div className="known-hosts-hero">
          <div className="known-hosts-hero-copy">
            <span className="panel-kicker">Known Hosts</span>
            <h1>已知主机</h1>
            <p>这里会集中展示每台主机已确认保存的可信公钥。当前还没有任何已保存的可信记录。</p>
          </div>
          <span className="pill subtle">
            <ShieldQuestion size={14} />
            暂无记录
          </span>
        </div>

        <div className="empty-card panel">
          <div className="empty-card-icon">
            <ShieldQuestion size={20} />
          </div>
          <div>
            <strong>首次连接后会自动累积可信记录</strong>
            <p>当你接受某台主机的指纹后，对应的公钥会写入这里，后续再次连接时就能直接校验。</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="known-hosts-stage panel">
      <div className="known-hosts-hero">
        <div className="known-hosts-hero-copy">
          <span className="panel-kicker">Known Hosts</span>
          <h1>已知主机</h1>
          <p>当前按主机保存已确认的 SSH 公钥，方便快速检查哪些连接已经建立过可信关系。</p>
        </div>

        <div className="known-hosts-stats" aria-label="已知主机统计">
          <div className="known-hosts-stat">
            <strong>{trustedKeyCount}</strong>
            <span>可信记录</span>
          </div>
          <div className="known-hosts-stat">
            <strong>{trustedHostCount}</strong>
            <span>关联主机</span>
          </div>
        </div>
      </div>

      <div className="known-hosts-grid">
        {groups.map(({ host, entries }) => (
          <article key={host.id} className="known-host-card">
            <div className="known-host-card-head">
              <div className="known-host-card-identity">
                <div className="known-host-card-icon">
                  <Server size={16} />
                </div>
                <div>
                  <h2>{host.name || host.id}</h2>
                  <p>{host.username}@{host.address}:{host.port || 22}</p>
                  <small>{host.id}</small>
                </div>
              </div>

              <span className="pill success">
                <ShieldCheck size={14} />
                {entries.length} 条已保存
              </span>
            </div>

            <div className="known-host-entry-list">
              {entries.map((entry) => (
                <div key={entry.id} className="known-host-entry">
                  <div className="known-host-entry-main">
                    <span className="known-host-entry-type">{entry.algorithm}</span>
                    <span className="known-host-entry-preview">{entry.preview}</span>
                  </div>
                  <div className="known-host-entry-meta">
                    <Fingerprint size={13} />
                    <span>{entry.comment || '已接受的主机公钥'}</span>
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
