import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';

const PID_FILE = path.join(os.homedir(), '.uptimekit', 'daemon.pid');

export function stopDaemon() {
  if (!fs.existsSync(PID_FILE)) {
    console.log(chalk.yellow('UptimeKit background service is not running.'));
    return;
  }

  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8'));
    process.kill(pid);
    console.log(chalk.green('UptimeKit background service stopped successfully.'));
    fs.unlinkSync(PID_FILE);
  } catch (e) {
    console.error(chalk.red('Error stopping UptimeKit service:'), e.message);

    if (e.code === 'ESRCH') {
      console.log(chalk.yellow('Stale PID file found. Cleaning up...'));
      fs.unlinkSync(PID_FILE);
    }
  }
}

export function registerStopCommand(program) {
  program
    .command('stop')
    .description('Stop the background monitoring daemon')
    .action(() => {
      stopDaemon();
    });
}
