import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { checkVersion, syncVersion, validateVersion } from './sync-version.mjs'

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zenterm-version-'))
  fs.mkdirSync(path.join(root, 'frontend'), { recursive: true })
  fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true })
  fs.writeFileSync(path.join(root, 'wails.json'), '{"info":{"productVersion":"0.1.0"}}\n')
  fs.writeFileSync(path.join(root, 'frontend/package.json'), '{"version":"0.1.0"}\n')
  fs.writeFileSync(path.join(root, 'frontend/package-lock.json'), '{"version":"0.1.0","packages":{"":{"version":"0.1.0"}}}\n')
  fs.writeFileSync(path.join(root, 'README.md'), [
    '当前版本为 `0.1.0`。',
    'git tag v0.1.0',
    'git push origin v0.1.0',
    '填写版本号 `0.1.0`。',
    '`ZenTerm-0.1.0-linux-amd64.tar.gz`',
  ].join('\n'))
  fs.writeFileSync(path.join(root, '.github/workflows/release.yml'), [
    "description: '发布版本，例如 0.1.0'",
    "default: '0.1.0'",
  ].join('\n'))
  return root
}

test('syncVersion updates every public version reference', () => {
  const root = createFixture()
  try {
    assert.equal(syncVersion(root, '1.2.3'), '1.2.3')
    assert.equal(checkVersion(root), '1.2.3')
    assert.match(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), /ZenTerm-1\.2\.3-linux-amd64/)
    assert.match(fs.readFileSync(path.join(root, '.github/workflows/release.yml'), 'utf8'), /default: '1\.2\.3'/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('checkVersion reports drift and invalid versions are rejected', () => {
  const root = createFixture()
  try {
    const pkgPath = path.join(root, 'frontend/package.json')
    fs.writeFileSync(pkgPath, '{"version":"9.9.9"}\n')
    assert.throws(() => checkVersion(root), /frontend\/package\.json=9\.9\.9/)
    assert.throws(() => validateVersion('v1.2.3'), /x\.y\.z/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
