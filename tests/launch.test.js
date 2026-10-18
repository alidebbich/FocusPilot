const { spawn } = require('child_process');
const path = require('path');

console.log('Testing Electron app startup...');

// Run electron pointing to current dir
const electronPath = require('electron');
const child = spawn(electronPath, ['.'], {
  cwd: path.resolve(__dirname, '..'),
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' },
  stdio: 'pipe'
});

let output = '';
child.stdout.on('data', data => {
  const str = data.toString();
  output += str;
  process.stdout.write(str);
});

child.stderr.on('data', data => {
  const str = data.toString();
  output += str;
  process.stderr.write(str);
});

// Give it 4 seconds to initialize window, SQLite, and IPC handlers
setTimeout(() => {
  console.log('\nFocusPilot launched and stayed alive successfully without crashing!');
  child.kill();
  process.exit(0);
}, 4000);

child.on('exit', (code, signal) => {
  if (signal === 'SIGTERM') {
    // Expected from child.kill()
    process.exit(0);
  }
  if (code !== 0 && code !== null) {
    console.error(`\nElectron app crashed unexpectedly with exit code ${code}`);
    process.exit(code);
  }
});
