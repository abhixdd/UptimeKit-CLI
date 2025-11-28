#!/usr/bin/env node
import { Command } from 'commander';
import { registerStartCommand } from './commands/start.js';
import { registerStopCommand } from './commands/stop.js';
import { registerAddCommand } from './commands/add.js';
import { registerStatusCommand } from './commands/status.js';
import { registerDeleteCommand } from './commands/delete.js';
import { registerClearCommand } from './commands/clear.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { registerResetCommand } from './commands/reset.js';
import { registerEditCommand } from './commands/edit.js';
import { registerNotificationsCommand } from './commands/notifications.js';

function isDaemonRunning() {
  const pidPath = path.join(os.homedir(), '.uptimekit', 'daemon.pid');
  if (!fs.existsSync(pidPath)) return false;
  try {
    const pid = parseInt(fs.readFileSync(pidPath, 'utf-8'));
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const program = new Command();

program.configureOutput({
  writeErr: (str) => {
    if (str.includes("option '-t, --type") && str.includes('argument missing')) {
      process.stderr.write(str + '\nAvailable types: http, icmp, dns\n');
      return;
    }
    if (str.toLowerCase().includes("missing required argument 'url'") || str.toLowerCase().includes("missing required argument \"url\"")) {
      process.stderr.write(str + '\nExample: uptimekit add https://example2.com -t http -i 30 -n newsite\n');
      return;
    }
    process.stderr.write(str);
  }
});

program
  .name('uptimekit')
  .description('UptimeKit CLI - Monitor your services from the terminal')
  .version('1.2.20', '-v, --version');

registerStartCommand(program);  // alias
registerStopCommand(program);   // alias
registerAddCommand(program);    // alias
registerStatusCommand(program); // alias
registerDeleteCommand(program); // alias
registerClearCommand(program);  // alias
registerResetCommand(program);
registerEditCommand(program);
registerNotificationsCommand(program);

// gotta make sure the daemon is actually running
const allowedIfNotRunning = ['help', 'start', '-v', '--version', '-h', '--help', 'reset', 'clear', 'notifications', 'notif'];
const userCmd = process.argv[2];
if (!isDaemonRunning() && userCmd && !allowedIfNotRunning.includes(userCmd)) {
  console.log('UptimeKit is not running. Please start it first using "upkit start".');
  process.exit(1);
}

program.parse(process.argv);
