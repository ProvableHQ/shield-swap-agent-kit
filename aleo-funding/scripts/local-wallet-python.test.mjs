import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('Python wallets run independently and preserve credentials through failures', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'aleo-python-wallet-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  for (const file of ['local_wallet.py', 'test_local_wallet.py']) {
    await cp(new URL(file, import.meta.url), join(directory, file))
  }
  execFileSync('python3', ['-B', '-m', 'unittest', 'discover', '-s', directory, '-p', 'test_local_wallet.py'], {
    cwd: directory, stdio: 'pipe', timeout: 15000,
  })
})
