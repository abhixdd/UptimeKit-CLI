import { z } from 'zod';
import { updateMonitor, getMonitorByIdOrName, initDB } from '../core/db.js';
import chalk from 'chalk';
import readline from 'readline';

const MonitorSchema = z.object({
    url: z.string().min(1).optional(),
    type: z.enum(['http', 'icmp', 'dns']).optional(),
    interval: z.number().min(1).optional(),
    name: z.string().optional()
});

export function registerEditCommand(program) {
    program
        .command('edit <idOrName>')
        .description('Edit an existing monitor')
        .option('-u, --url <url>', 'New URL')
        .option('-t, --type <type>', 'New type (http, icmp, dns)')
        .option('-i, --interval <seconds>', 'New interval in seconds')
        .option('-n, --name <name>', 'New name')
        .action(async (idOrName, options) => {
            try {
                await initDB();
                const monitor = getMonitorByIdOrName(idOrName);

                if (!monitor) {
                    console.error(chalk.red(`Monitor '${idOrName}' not found.`));
                    return;
                }

                let updates = {};

                // If flags are provided, use them
                if (options.url) updates.url = options.url;
                if (options.type) updates.type = options.type;
                if (options.interval) updates.interval = parseInt(options.interval, 10);
                if (options.name) updates.name = options.name;

                // If no flags provided, go interactive
                if (Object.keys(updates).length === 0) {
                    console.log(chalk.blue(`Editing monitor: ${monitor.name} (${monitor.url})`));
                    console.log(chalk.gray('Press Enter to keep current value.'));

                    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
                    const question = (q) => new Promise(resolve => rl.question(q, ans => resolve(ans)));

                    const newName = await question(`Name [${monitor.name}]: `);
                    if (newName.trim()) updates.name = newName.trim();

                    const newUrl = await question(`URL [${monitor.url}]: `);
                    if (newUrl.trim()) updates.url = newUrl.trim();

                    const newType = await question(`Type [${monitor.type}]: `);
                    if (newType.trim()) updates.type = newType.trim();

                    const newInterval = await question(`Interval [${monitor.interval}]: `);
                    if (newInterval.trim()) updates.interval = parseInt(newInterval.trim(), 10);

                    rl.close();
                }

                if (Object.keys(updates).length === 0) {
                    console.log(chalk.yellow('No changes made.'));
                    return;
                }

                // Validate updates
                const data = MonitorSchema.parse(updates);

                // Enhanced Validation
                const finalType = data.type || monitor.type;
                const finalUrl = data.url || monitor.url;

                if (finalType === 'http') {
                    try {
                        const u = new URL(finalUrl);
                        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
                            console.error(chalk.red('Error: HTTP monitor requires http:// or https:// URL.'));
                            return;
                        }
                    } catch (err) {
                        console.error(chalk.red('Error: Invalid URL provided for HTTP monitor.'));
                        return;
                    }
                } else if (finalType === 'icmp' || finalType === 'dns') {
                    // Simple hostname validation
                    const host = finalUrl.replace(/^https?:\/\//, '').replace(/\/.+$/, '').trim();
                    const hostnameRegex = /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.[A-Za-z0-9-]{1,63})*$/;
                    if (!hostnameRegex.test(host) && !/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
                        console.error(chalk.red(`Error: Invalid hostname '${finalUrl}' for ${finalType} monitor.`));
                        return;
                    }
                }

                updateMonitor(monitor.id, data);
                console.log(chalk.green(`Monitor '${monitor.name}' updated successfully.`));

            } catch (err) {
                if (err instanceof z.ZodError) {
                    console.error(chalk.red('Validation Error:'));
                    err.errors.forEach(e => console.error(`- ${e.path.join('.')}: ${e.message}`));
                } else {
                    console.error(chalk.red('Error updating monitor:'), err.message);
                }
            }
        });
}
