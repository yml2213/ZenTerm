import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  compressLocalEntry,
  compressRemoteEntry,
  extractLocalArchive,
  extractRemoteArchive,
  getCredentialSecret,
  getHostSecret,
  uploadDirectory,
} from './backend'

afterEach(() => {
  delete window.go
})

describe('backend facade', () => {
  it('forwards secret requests through the stable facade', async () => {
    const getHostSecretBinding = vi.fn(async () => ({ host_id: 'host-1', password: 'secret' }))
    const getCredentialSecretBinding = vi.fn(async () => ({ credential_id: 'credential-1', private_key: 'key' }))
    window.go = { cmd: { App: {
      GetHostSecret: getHostSecretBinding,
      GetCredentialSecret: getCredentialSecretBinding,
    } } }

    await expect(getHostSecret('host-1')).resolves.toMatchObject({ password: 'secret' })
    await expect(getCredentialSecret('credential-1')).resolves.toMatchObject({ private_key: 'key' })
    expect(getHostSecretBinding).toHaveBeenCalledWith('host-1')
    expect(getCredentialSecretBinding).toHaveBeenCalledWith('credential-1')
  })

  it('forwards archive and directory transfer arguments unchanged', async () => {
    const bindings = {
      UploadDirectory: vi.fn(async () => ({ bytesCopied: 10 })),
      ExtractLocalArchive: vi.fn(async () => undefined),
      ExtractRemoteArchive: vi.fn(async () => undefined),
      CompressLocalEntry: vi.fn(async () => undefined),
      CompressRemoteEntry: vi.fn(async () => undefined),
    }
    window.go = { cmd: { App: bindings } }

    await uploadDirectory('host-1', '/local/dir', '/remote', true, true, 'transfer-123')
    await extractLocalArchive('/local/a.tar.gz', '/local/out')
    await extractRemoteArchive('host-1', '/remote/a.tar.gz', '/remote/out')
    await compressLocalEntry('/local/source', '/local/source.tar.gz')
    await compressRemoteEntry('host-1', '/remote/source', '/remote/source.tar.gz')

    expect(bindings.UploadDirectory).toHaveBeenCalledWith('host-1', '/local/dir', '/remote', true, true, 'transfer-123')
    expect(bindings.ExtractLocalArchive).toHaveBeenCalledWith('/local/a.tar.gz', '/local/out')
    expect(bindings.ExtractRemoteArchive).toHaveBeenCalledWith('host-1', '/remote/a.tar.gz', '/remote/out')
    expect(bindings.CompressLocalEntry).toHaveBeenCalledWith('/local/source', '/local/source.tar.gz')
    expect(bindings.CompressRemoteEntry).toHaveBeenCalledWith('host-1', '/remote/source', '/remote/source.tar.gz')
  })
})
