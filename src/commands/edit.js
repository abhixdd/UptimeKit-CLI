import { z } from 'zod';
import { updateMonitor, getMonitorByIdOrName, initDB } from '../core/db.js';
import chalk from 'chalk';
import readline from 'readline';

const MonitorSchema = z.object({
    url: z.string().min(1).optional(),
    type: z.enum(['http', 'icmp', 'dns', 'ssl']).optional(),
    interval: z.number().int().min(1).positive().optional(),
    name: z.string().optional(),
    webhook_url: z.string().nullable().optional(),
    group_name: z.string().nullable().optional()
});

export function registerEditCommand(program) {
    program
        .command('edit <idOrName>')
        .description('Edit an existing monitor')
        .option('-u, --url <url>', 'New URL')
        .option('-t, --type <type>', 'New type (http, icmp, dns, ssl)')
        .option('-i, --interval <seconds>', 'New interval in seconds')
        .option('-n, --name <name>', 'New name')
        .option('-w, --webhook <url>', 'New webhook URL')
        .option('-g, --group <group>', 'New group name (use "none" to remove from group)')
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
                if (options.webhook) updates.webhook_url = options.webhook;
                if (options.group !== undefined) {
                    updates.group_name = options.group.toLowerCase() === 'none' ? null : options.group;
                }

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

                    const currentWebhook = monitor.webhook_url || 'none';
                    const newWebhook = await question(`Webhook URL [${currentWebhook}]: `);
                    if (newWebhook.trim()) {
                        updates.webhook_url = newWebhook.trim() === 'none' ? null : newWebhook.trim();
                    }

                    const currentGroup = monitor.group_name || 'none';
                    const newGroup = await question(`Group [${currentGroup}]: `);
                    if (newGroup.trim()) {
                        updates.group_name = newGroup.trim().toLowerCase() === 'none' ? null : newGroup.trim();
                    }

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
                    // Validate hostname or IP address
                    const host = finalUrl.replace(/^https?:\/\//, '').replace(/\/.+$/, '').trim();

                    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
                    const isIPv4Format = ipv4Regex.test(host);

                    let isValid = false;
                    if (isIPv4Format) {
                        const octets = host.split('.').map(Number);
                        isValid = octets.every(octet => octet >= 0 && octet <= 255);
                    } else {
                        const hostnameRegex = /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.[A-Za-z0-9-]{1,63})*$/;
                        isValid = hostnameRegex.test(host);
                    }

                    if (!isValid) {
                        console.error(chalk.red(`Error: Invalid hostname or IP '${finalUrl}' for ${finalType} monitor.`));
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
