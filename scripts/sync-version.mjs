import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const versionPattern = /^\d+\.\d+\.\d+$/

function readJSON(rootDir, file) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, file), 'utf8'))
}

function writeJSON(rootDir, file, value) {
  fs.writeFileSync(path.join(rootDir, file), `${JSON.stringify(value, null, 2)}\n`)
}

function replaceRequired(content, pattern, replacement, label) {
  if (!pattern.test(content)) {
    throw new Error(`未找到需要同步的版本字段: ${label}`)
  }
  pattern.lastIndex = 0
  return content.replace(pattern, replacement)
}

export function validateVersion(version) {
  if (!versionPattern.test(version)) {
    throw new Error(`版本号必须使用 x.y.z 格式，当前为: ${version}`)
  }
  return version
}

export function syncVersion(rootDir, requestedVersion) {
  const version = validateVersion(requestedVersion)
  const wails = readJSON(rootDir, 'wails.json')
  wails.info ??= {}
  wails.info.productVersion = version
  writeJSON(rootDir, 'wails.json', wails)

  for (const file of ['frontend/package.json', 'frontend/package-lock.json']) {
    const pkg = readJSON(rootDir, file)
    pkg.version = version
    if (file.endsWith('package-lock.json') && pkg.packages?.['']) {
      pkg.packages[''].version = version
    }
    writeJSON(rootDir, file, pkg)
  }

  const readmePath = path.join(rootDir, 'README.md')
  let readme = fs.readFileSync(readmePath, 'utf8')
  readme = replaceRequired(readme, /当前版本为 `\d+\.\d+\.\d+`/, `当前版本为 \`${version}\``, 'README 当前版本')
  readme = replaceRequired(readme, /git tag v\d+\.\d+\.\d+/, `git tag v${version}`, 'README git tag')
  readme = replaceRequired(readme, /git push origin v\d+\.\d+\.\d+/, `git push origin v${version}`, 'README git push')
  readme = replaceRequired(readme, /填写版本号 `\d+\.\d+\.\d+`/, `填写版本号 \`${version}\``, 'README 手动发布版本')
  readme = replaceRequired(readme, /ZenTerm-\d+\.\d+\.\d+-/g, `ZenTerm-${version}-`, 'README 产物名称')
  fs.writeFileSync(readmePath, readme)

  const releasePath = path.join(rootDir, '.github/workflows/release.yml')
  let release = fs.readFileSync(releasePath, 'utf8')
  release = replaceRequired(release, /description: '发布版本，例如 \d+\.\d+\.\d+'/, `description: '发布版本，例如 ${version}'`, 'Release 版本示例')
  release = replaceRequired(release, /default: '\d+\.\d+\.\d+'/, `default: '${version}'`, 'Release 默认版本')
  fs.writeFileSync(releasePath, release)

  return version
}

export function checkVersion(rootDir) {
  const wailsVersion = validateVersion(readJSON(rootDir, 'wails.json').info?.productVersion ?? '')
  const packageLock = readJSON(rootDir, 'frontend/package-lock.json')
  const values = [
    ['frontend/package.json', readJSON(rootDir, 'frontend/package.json').version],
    ['frontend/package-lock.json', packageLock.version],
    ['frontend/package-lock.json packages[""]', packageLock.packages?.['']?.version],
  ]

  const readme = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8')
  values.push(['README.md', readme.match(/当前版本为 `(\d+\.\d+\.\d+)`/)?.[1]])
  const release = fs.readFileSync(path.join(rootDir, '.github/workflows/release.yml'), 'utf8')
  values.push(['.github/workflows/release.yml', release.match(/default: '(\d+\.\d+\.\d+)'/)?.[1]])

  const mismatches = values.filter(([, value]) => value !== wailsVersion)
  if (mismatches.length > 0) {
    const details = mismatches.map(([file, value]) => `${file}=${value ?? '缺失'}`).join(', ')
    throw new Error(`项目版本不一致，基准版本为 ${wailsVersion}: ${details}`)
  }
  return wailsVersion
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
if (isMain) {
  const rootDir = process.cwd()
  if (process.argv[2] === '--check') {
    console.log(`项目版本一致: ${checkVersion(rootDir)}`)
  } else {
    const version = process.argv[2] ?? readJSON(rootDir, 'wails.json').info.productVersion
    console.log(`项目版本已同步为 ${syncVersion(rootDir, version)}`)
  }
}
