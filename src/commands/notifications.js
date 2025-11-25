import chalk from 'chalk';
import { getNotificationSettings, setNotificationSettings } from '../core/db.js';

export function registerNotificationsCommand(program) {
    const notificationsCmd = program
        .command('notifications')
        .alias('notif')
        .description('Manage desktop notifications');

    notificationsCmd
        .command('enable')
        .description('Enable desktop notifications')
        .action(() => {
            const success = setNotificationSettings(true);
            if (success) {
                console.log(chalk.green('✓ Desktop notifications enabled'));
            } else {
                console.log(chalk.red('✗ Failed to enable notifications'));
                process.exit(1);
            }
        });

    notificationsCmd
        .command('disable')
        .description('Disable desktop notifications')
        .action(() => {
            const success = setNotificationSettings(false);
            if (success) {
                console.log(chalk.yellow('✓ Desktop notifications disabled'));
            } else {
                console.log(chalk.red('✗ Failed to disable notifications'));
                process.exit(1);
            }
        });

    notificationsCmd
        .command('status')
        .description('Show notification status')
        .action(() => {
            const enabled = getNotificationSettings();
            if (enabled) {
                console.log(chalk.green('✓ Desktop notifications are enabled'));
            } else {
                console.log(chalk.yellow('○ Desktop notifications are disabled'));
            }
        });
}
