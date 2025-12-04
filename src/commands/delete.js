import { getMonitors, initDB, getDB } from '../core/db.js';
import chalk from 'chalk';

export function registerDeleteCommand(program) {
  program
    .command('delete <target>')
    .alias('del')
    .description('Delete a monitor by id or name')
    .action(async (target) => {
      await initDB();
      const monitors = getMonitors();
      let monitor = null;

      const id = parseInt(target, 10);
      if (!isNaN(id)) {
        monitor = monitors.find(m => m.id === id);
      } else {
        monitor = monitors.find(m => m.name === target);
      }

      if (!monitor) {
        console.log(chalk.red('Monitor not found.'));
        return;
      }

      try {
        const db = getDB();

        try {
          db.prepare('DELETE FROM heartbeats WHERE monitor_id = ?').run(monitor.id);
        } catch (err) {
          console.log(err);
        }
        try {
          db.prepare('DELETE FROM ssl_certificates WHERE monitor_id = ?').run(monitor.id);
        } catch (err) {
          console.log(err);
          console.log('If you are on verison  1.2.20 below, ignore this error')
        }

        db.prepare('DELETE FROM monitors WHERE id = ?').run(monitor.id);

        console.log(chalk.green(`Deleted monitor: ${monitor.name || monitor.url}`));
      } catch (err) {
        console.error(chalk.red('Failed to delete monitor:'), err.message);
      }
    });
}
