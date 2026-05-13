import { History, KeyRound, LayoutGrid, Shield } from 'lucide-react'

export const navigationItems = [
  { id: 'hosts', label: '主机', icon: LayoutGrid },
  { id: 'keychain', label: '钥匙串', icon: KeyRound },
  { id: 'knownHosts', label: '已知主机', icon: Shield },
  { id: 'logs', label: '日志', icon: History },
]

export const sidebarPages = {
  hosts: {
    label: '主机',
    icon: LayoutGrid,
    title: '全部主机',
    kicker: 'Vaults',
    description: '集中管理保险箱中的 SSH 主机与连接入口，后续的终端、SFTP 和身份能力都会从这里展开。',
  },
  keychain: {
    label: '钥匙串',
    icon: KeyRound,
    title: '钥匙串',
    kicker: 'Keychain',
    description: '集中管理密码、私钥与凭据来源，让主机配置、SFTP 与未来扩展模块共享同一套安全入口。',
    highlights: [
      { title: '凭据条目', description: '后续会把已保存密码、私钥引用和凭据来源整理成独立列表。' },
      { title: '来源标记', description: '区分系统钥匙串、本地导入、临时输入等不同凭据来源。' },
      { title: '安全操作', description: '为替换、清除、重新同步系统钥匙串预留清晰操作入口。' },
    ],
  },
  knownHosts: {
    label: '已知主机',
    icon: Shield,
    title: '已知主机',
    kicker: 'Known Hosts',
    description: '把当前保存的可信指纹集中展示，后续可在这里审查、比对和清理主机信任关系。',
    highlights: [
      { title: '指纹审查', description: '展示 SHA256、来源主机和最近使用时间，方便排查变更。' },
      { title: '信任同步', description: '为未来的导入、导出和批量清理 known_hosts 预留位置。' },
      { title: '风险提醒', description: '后续可补主机指纹变化、冲突记录和人工确认轨迹。' },
    ],
  },
  logs: {
    label: '日志',
    icon: History,
    title: '连接日志',
    kicker: 'Logs',
    description: '记录 SSH 连接历史，默认只保存元数据。',
  },
}
