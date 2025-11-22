import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PID_FILE = path.join(os.homedir(), '.uptimekit', 'daemon.pid');
const LOG_FILE = path.join(os.homedir(), '.uptimekit', 'daemon.log');

export function startDaemon() {
  if (fs.existsSync(PID_FILE)) {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8'));
    try {
      process.kill(pid, 0);
      console.log(chalk.yellow('UptimeKit background service is already active.'));
      return;
    } catch (e) {
      fs.unlinkSync(PID_FILE);
    }
  }

  const uptimekitDir = path.join(os.homedir(), '.uptimekit');
  if (!fs.existsSync(uptimekitDir)) {
    fs.mkdirSync(uptimekitDir, { recursive: true });
  }

  const workerPath = path.resolve(__dirname, '../daemon/worker.js');
  const logStream = fs.openSync(LOG_FILE, 'a');

  const child = spawn(process.execPath, [workerPath], {
    detached: true,
    stdio: ['ignore', logStream, logStream],
    windowsHide: true
  });

  child.unref();
  fs.closeSync(logStream);

  fs.writeFileSync(PID_FILE, child.pid.toString());
  console.log(chalk.green(`UptimeKit background service started successfully. (PID: ${child.pid})`));
}

export function registerStartCommand(program) {
  program
    .command('start')
    .description('Start the background monitoring daemon')
    .action(() => {
      startDaemon();
    });
}
