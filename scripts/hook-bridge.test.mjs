import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import test from 'node:test'

const bridge = new URL('../resources/hook-bridge.cjs', import.meta.url)

function invoke(input, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bridge.pathname], { env: { PATH: process.env.PATH, ...env } })
    let stdout = ''; let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stdout, stderr }))
    child.stdin.end(input)
  })
}

test('hook bridge fails closed with no connected GUI', async () => {
  const result = await invoke(JSON.stringify({ toolCall: { name: 'run_command' } }))
  assert.equal(result.code, 0)
  assert.deepEqual(JSON.parse(result.stdout), { decision: 'deny', reason: 'approval GUI is not connected' })
})

test('hook bridge fails closed for malformed hook input', async () => {
  const result = await invoke('{not json}', { AGRAVITY_APPROVAL_BRIDGE_URL: 'http://127.0.0.1:9', AGRAVITY_APPROVAL_BRIDGE_TOKEN: 'test' })
  assert.equal(result.code, 0)
  assert.deepEqual(JSON.parse(result.stdout), { decision: 'deny', reason: 'invalid hook input' })
})
