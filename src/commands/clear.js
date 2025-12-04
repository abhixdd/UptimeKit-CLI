import { initDB, getDB } from '../core/db.js';
import chalk from 'chalk';
import readline from 'readline';

export function registerClearCommand(program) {
  program
    .command('clear')
    .alias('clr')
    .description('Clear all monitor and heartbeat data (requires confirmation)')
    .action(async () => {
      await initDB();

      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

      const answer = await new Promise(resolve => {
        rl.question('This will delete all monitors and heartbeats. Are you sure? (y/n): ', (ans) => {
          rl.close();
          resolve(ans.trim().toLowerCase());
        });
      });

      if (answer === 'y' || answer === 'yes') {
        try {
          const db = getDB();
          db.prepare('DELETE FROM ssl_certificates').run();
          db.prepare('DELETE FROM heartbeats').run();
          db.prepare('DELETE FROM monitors').run();
          console.log(chalk.green('All monitor and heartbeat data cleared.'));
        } catch (err) {
          console.error(chalk.red('Error while clearing DB:'), err.message);
        }
      } else {
        console.log(chalk.yellow('Clear operation aborted.'));
      }

      process.exit(0);
    });
}
