import assert from 'node:assert/strict'
import test from 'node:test'
import { spawn } from 'node:child_process'

const run = (file, args, timeoutMs = 12000) => new Promise((resolve) => {
  const child = spawn(file, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''; let stderr = ''
  const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs)
  child.stdout.on('data', (chunk) => { stdout += String(chunk) })
  child.stderr.on('data', (chunk) => { stderr += String(chunk) })
  child.on('close', (code) => { clearTimeout(timer); resolve({ stdout, stderr, code }) })
  child.on('error', () => { clearTimeout(timer); resolve({ stdout, stderr: 'process could not start', code: -1 }) })
})

test('agy CLI detection completes synchronously without hanging on stdin', async () => {
  const [version, help, agents] = await Promise.all([
    run('agy', ['--version']),
    run('agy', ['--help']),
    run('agy', ['agent'])
  ])

  assert.equal(version.code, 0, 'agy --version should succeed')
  assert.ok(version.stdout.trim().length > 0, 'version string should not be empty')

  const helpOutput = `${help.stdout}\n${help.stderr}`
  assert.ok(/--output-format/.test(helpOutput), 'should support output-format in help')
  assert.ok(/stream-json/.test(helpOutput), 'should support stream-json in help')

  assert.equal(agents.code, 0, 'agy agent should exit with 0 without hanging')
  assert.ok(agents.stdout.trim().length > 0, 'agent list should be populated')
})
