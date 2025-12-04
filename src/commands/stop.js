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

    try {
      process.kill(pid, 0);
    } catch (checkError) {
      if (checkError.code === 'ESRCH') {
        console.log(chalk.yellow('Process not running. Cleaning up stale PID file...'));
        fs.unlinkSync(PID_FILE);
        return;
      }
    }

    process.kill(pid);
    console.log(chalk.green('UptimeKit background service stopped successfully.'));
    fs.unlinkSync(PID_FILE);
  } catch (e) {
    if (e.code === 'ESRCH') {
      console.log(chalk.yellow('Process not found. Cleaning up stale PID file...'));
      fs.unlinkSync(PID_FILE);
    } else if (e.code === 'EPERM') {
      console.error(chalk.red('Permission denied. Try running with administrator/sudo privileges.'));
    } else {
      console.error(chalk.red('Error stopping UptimeKit service:'), e.message);
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
