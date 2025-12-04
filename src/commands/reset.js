import { resetDB } from '../core/db.js';
import chalk from 'chalk';
import readline from 'readline';

export function registerResetCommand(program) {
    program
        .command('reset')
        .description('Delete the local SQLite database and start fresh')
        .action(async () => {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            const answer = await new Promise(resolve => {
                rl.question('This will delete all monitors and heartbeat data. Continue? (y/N): ', (ans) => {
                    rl.close();
                    resolve(ans.trim().toLowerCase());
                });
            });

            if (answer !== 'y' && answer !== 'yes') {
                console.log(chalk.yellow('Reset aborted.'));
                process.exit(0);
            }

            try {
                resetDB();
                console.log(chalk.green('Database has been reset.'));
                process.exit(0);
            } catch (err) {
                console.error(chalk.red('Failed to reset database:'), err.message);
                process.exit(1);
            }
        });
}
