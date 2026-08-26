import { spawn } from 'child_process';
import readline from 'readline';

console.log('--- Testing agy interactive stream turn ---');

const agy = spawn('agy', [
  '--input-format', 'stream-json',
  '--output-format', 'stream-json',
  '--add-dir', process.cwd(),
  '--mode', 'plan',
  '--effort', 'low',
], {
  env: process.env,
  stdio: ['pipe', 'pipe', 'pipe'],
});

const rl = readline.createInterface({
  input: agy.stdout,
  terminal: false,
});

let eventsReceived = [];

rl.on('line', (line) => {
  console.log('RX:', line.substring(0, 120));
  try {
    const data = JSON.parse(line);
    eventsReceived.push(data.event);
    if (data.event === 'result') {
      console.log('✓ Successfully received turn result event!');
      agy.kill();
      process.exit(0);
    }
  } catch (e) {}
});

agy.stderr.on('data', (d) => {
  console.log('STDERR:', d.toString());
});

// Wait 1s and send a test prompt
setTimeout(() => {
  console.log('TX: Sending test prompt JSON');
  const userMsg = JSON.stringify({
    event: 'user',
    message: { content: 'Echo back the word ANTIGRAVITY_OK' },
  }) + '\n';
  agy.stdin.write(userMsg);
}, 1000);

setTimeout(() => {
  console.log('Timeout. Events received:', eventsReceived);
  agy.kill();
  process.exit(0);
}, 8000);
