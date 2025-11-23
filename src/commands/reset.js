import { resetDB } from '../core/db.js';
import chalk from 'chalk';

export function registerResetCommand(program) {
    program
        .command('reset')
        .description('Delete the local SQLite database and start fresh')
        .action(async () => {
            const answer = await new Promise(resolve => {
                process.stdout.write('This will delete all monitors and heartbeat data. Continue? (y/N): ');
                process.stdin.once('data', data => resolve(data.toString().trim().toLowerCase()));
            });

            if (answer !== 'y' && answer !== 'yes') {
                console.log(chalk.yellow('Reset aborted.'));
                return;
            }

            try {
                resetDB();
                console.log(chalk.green('Database has been reset.'));
            } catch (err) {
                console.error(chalk.red('Failed to reset database:'), err.message);
            }
        });
}
