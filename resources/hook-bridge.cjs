#!/usr/bin/env node
/*
 * PreToolUse command-hook bridge. It never falls back to allow:
 * no GUI / expired token / malformed input / timeout / network error = deny.
 */
const http = require('node:http')

function deny(reason) { process.stdout.write(JSON.stringify({ decision: 'deny', reason }) + '\n') }
let raw = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => { raw += chunk })
process.stdin.on('end', () => {
  const endpoint = process.env.AGRAVITY_APPROVAL_BRIDGE_URL
  const token = process.env.AGRAVITY_APPROVAL_BRIDGE_TOKEN
  const timeout = Math.min(Math.max(Number(process.env.AGRAVITY_APPROVAL_TIMEOUT_MS) || 30000, 1000), 30000)
  if (!endpoint || !token) return deny('approval GUI is not connected')
  let body
  try { body = JSON.parse(raw || '{}') } catch { return deny('invalid hook input') }
  const url = new URL('/approve', endpoint)
  const request = http.request({ hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, timeout }, (response) => {
    let output = ''
    response.on('data', (chunk) => { output += chunk })
    response.on('end', () => {
      if (response.statusCode !== 200) return deny('approval bridge rejected request')
      try {
        const decision = JSON.parse(output).decision
        process.stdout.write(JSON.stringify({ decision: decision === 'allow' ? 'allow' : 'deny' }) + '\n')
      } catch { deny('invalid approval bridge response') }
    })
  })
  request.on('timeout', () => { request.destroy(); deny('approval timed out') })
  request.on('error', () => deny('approval bridge unavailable'))
  request.end(JSON.stringify(body))
})
