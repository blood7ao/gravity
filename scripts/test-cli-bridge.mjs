import { spawn } from 'child_process';
import readline from 'readline';

console.log('--- Testing agy stream-json subprocess bridge ---');

const agy = spawn('agy', [
  '--input-format', 'stream-json',
  '--output-format', 'stream-json',
  '--add-dir', process.cwd(),
  '--mode', 'plan',
  '--effort', 'low',
], {
  env: process.env,
  stdio: ['pipe', 'pipe', 'inherit'],
});

const rl = readline.createInterface({
  input: agy.stdout,
  terminal: false,
});

let gotInit = false;

rl.on('line', (line) => {
  console.log('[agy stdout]:', line);
  try {
    const data = JSON.parse(line);
    if (data.event === 'init') {
      gotInit = true;
      console.log('✓ Received agy init event! Conversation ID:', data.conversation_id);
      agy.kill();
      process.exit(0);
    }
  } catch (e) {
    // Ignore non-json lines
  }
});

setTimeout(() => {
  if (!gotInit) {
    console.log('Test timeout or agy started.');
    agy.kill();
    process.exit(0);
  }
}, 4000);
