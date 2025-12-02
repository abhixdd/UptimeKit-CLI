import { z } from 'zod';
import { addMonitor, initDB } from '../core/db.js';
import chalk from 'chalk';
import readline from 'readline';

const MonitorSchema = z.object({
  url: z.string().min(1),
  type: z.enum(['http', 'icmp', 'dns', 'ssl']),
  interval: z.number().min(1)
});

export function registerAddCommand(program) {
  program
    .command('add <url>')
    .description('Add a new monitor')
    .addHelpText('after', '\n\nExamples:\n  uptimekit add https://example2.com -t http -i 30 -n newsite\n  uptimekit add google.com -t dns -i 60 -n googledns\n  uptimekit add example.com -t ssl -i 3600 -n myssl\n  uptimekit add https://api.dev.com -t http -i 30 -n "dev-api" -g dev\n')
    .option('-t, --type <type>', 'Type of monitor (http, icmp, dns, ssl)')
    .option('-i, --interval <seconds>', 'Check interval in seconds', '60')
    .option('-n, --name <name>', 'Custom name for monitor')
    .option('-w, --webhook <url>', 'Webhook URL for notifications')
    .option('-g, --group <group>', 'Group name for organizing monitors (e.g., dev, prod, staging)')
    .action(async (url, options, cmd) => {
      try {
        const allowedTypes = ['http', 'icmp', 'dns', 'ssl'];
        if (!options.type) {
          console.error(chalk.red('Error: Missing required flag -t/--type.'));
          console.log('Available types:', allowedTypes.join(', '));
          return;
        }
        if (!allowedTypes.includes(options.type)) {
          console.error(chalk.red(`Invalid type: ${options.type}`));
          console.log('Available types:', allowedTypes.join(', '));
          return;
        }

        let finalUrl = url;
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const question = (q) => new Promise(resolve => rl.question(q, ans => resolve(ans)));

        // sometimes people type 'add add google.com' by mistake, let's catch that
        if (cmd && cmd.args && cmd.args.length > 1) {
          const extraArg = cmd.args[1];
          const looksLikeHost = /\w+\.[A-Za-z]{2,}|^\d+\.\d+\.\d+\.\d+$/.test(extraArg);
          if (!url.includes('.') && looksLikeHost) {
            const answer = await question(`Detected extra argument '${extraArg}'. Use that as the URL instead of '${url}'? (y/n): `);
            if ((answer || '').trim().toLowerCase().startsWith('y')) {
              finalUrl = extraArg;
            }
          }
        }

        if (options.type === 'http') {
          try {
            new URL(finalUrl);
          } catch (err) {
            const answer = await question(`URL appears missing protocol/scheme (http/https). Prepend https:// to ${finalUrl}? (y/n): `);
            const n = (answer || '').trim().toLowerCase();
            if (n === 'y' || n === 'yes' || n === '') {
              finalUrl = `https://${finalUrl}`;
            } else {
              const entered = await question('Please type the full URL (including http/https): ');
              finalUrl = entered.trim();
            }
          }

          try {
            const u = new URL(finalUrl);
            if (u.protocol !== 'http:' && u.protocol !== 'https:') {
              console.error(chalk.red('HTTP monitor requires http:// or https:// URL.'));
              rl.close();
              return;
            }

            const host = u.hostname;
            const isIPv4 = /^\d+\.\d+\.\d+\.\d+$/.test(host);
            if (!(host.includes('.') || host === 'localhost' || isIPv4)) {
              const confirm = await question(`Detected hostname '${host}' without top-level domain. Are you sure you want to add it? (y/n): `);
              if (!confirm || !confirm.trim().toLowerCase().startsWith('y')) {
                console.log(chalk.yellow('Add command aborted.'));
                rl.close();
                return;
              }
            }
          } catch (err) {
            console.error(chalk.red('Invalid URL provided.'));
            rl.close();
            return;
          }
        } else if (options.type === 'icmp' || options.type === 'dns') {
          const host = finalUrl.replace(/^https?:\/\//, '').replace(/\/.+$/, '').trim();

          const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
          const isIPv4Format = ipv4Regex.test(host);

          let isValid = false;
          if (isIPv4Format) {
            const octets = host.split('.').map(Number);
            isValid = octets.every(octet => octet >= 0 && octet <= 255);
          } else {
            const hostnameRegex = /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)$/;
            const parts = host.split('.');
            isValid = parts.every(p => hostnameRegex.test(p));
          }

          if (!isValid) {
            const answer = await question(`The host '${host}' looks suspicious. Type a valid hostname or IP (or press enter to abort): `);
            if (!answer || !answer.trim()) {
              console.log(chalk.yellow('Add command aborted.'));
              rl.close();
              return;
            }
            finalUrl = answer.trim();
          }
        } else if (options.type === 'ssl') {
          let host = finalUrl.replace(/^https?:\/\//, '').replace(/\/.+$/, '').split(':')[0].trim();

          const hostnameRegex = /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)$/;
          const parts = host.split('.');
          const isValidHostname = parts.length >= 2 && parts.every(p => hostnameRegex.test(p));

          if (!isValidHostname) {
            const answer = await question(`The hostname '${host}' looks invalid for SSL check. Type a valid hostname (or press enter to abort): `);
            if (!answer || !answer.trim()) {
              console.log(chalk.yellow('Add command aborted.'));
              rl.close();
              return;
            }
            finalUrl = answer.trim();
          } else {
            finalUrl = host;
          }
          if (options.interval < '200') {
            console.log(chalk.gray('Note: SSL checks typically don\'t need frequent intervals. Consider using -i 3600 (1 hour) or higher.'));
          }
        }

        rl.close();
        await initDB();
        const interval = parseInt(options.interval, 10);
        const data = MonitorSchema.parse({
          url: finalUrl,
          type: options.type,
          interval
        });

        let name = options.name;
        if (!name) {
          try {
            let domain = finalUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
            name = domain.slice(0, 6);
          } catch {
            name = finalUrl.slice(0, 6);
          }
        }

        const groupName = options.group || null;
        addMonitor(data.type, data.url, data.interval, name, options.webhook, groupName);
        
        let successMsg = `Monitor added: ${name} (${data.url}, ${data.type})`;
        if (groupName) {
          successMsg += ` [Group: ${groupName}]`;
        }
        console.log(chalk.green(successMsg));
      } catch (err) {
        if (err instanceof z.ZodError) {
          console.error(chalk.red('Validation Error:'));
          err.errors.forEach(e => console.error(`- ${e.path.join('.')}: ${e.message}`));
        } else {
          console.error(chalk.red('Error adding monitor:'), err.message);
        }
      }
    });
}
