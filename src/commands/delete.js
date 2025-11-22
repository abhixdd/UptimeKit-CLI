import { getMonitors, initDB, getDB } from '../core/db.js';
import chalk from 'chalk';

export function registerDeleteCommand(program) {
  program
    .command('delete [index]')
    .alias('del')
    .description('Delete a monitor by number, name, or url')
    .option('-n, --name <name>', 'Delete by custom name')
    .option('-u, --url <url>', 'Delete by URL')
    .action(async (index, options) => {
      await initDB();
      let monitors = getMonitors();
      let target;

      if (!index && !options.name && !options.url) {
        console.log(chalk.yellow('Usage: upkit del <number> or --name <name> or --url <url>'));
        return;
      }

      if (options.name) {
        target = monitors.find(m => m.name === options.name);
      } else if (options.url) {
        target = monitors.find(m => m.url === options.url);
      } else if (index) {
        let idx = parseInt(index, 10) - 1;
        target = monitors[idx];
      }

      if (!target) {
        console.log(chalk.red('Monitor not found. Usage: upkit del <number> or --name <name> or --url <url>'));
        return;
      }

      try {
        const db = getDB();
        db.prepare('DELETE FROM heartbeats WHERE monitor_id = ?').run(target.id);
        const delStmt = db.prepare('DELETE FROM monitors WHERE id = ?');
        delStmt.run(target.id);
      } catch (err) {
        console.error(chalk.red('Failed to delete monitor:'), err.message);
        console.log('Delete command completed.');
        return;
      }

      console.log(chalk.green(`Deleted monitor: ${target.name || target.url}`));
    });
}
