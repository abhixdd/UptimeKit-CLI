import { getGroups, renameGroup, deleteGroup, getMonitorsByGroup, initDB, groupExists } from '../core/db.js';
import chalk from 'chalk';
import readline from 'readline';

export function registerGroupCommand(program) {
    program
        .command('group [action]')
        .alias('grp')
        .description('Manage monitor groups')
        .addHelpText('after', `
Actions:
  list              List all groups with monitor counts (default)
  rename <old> <new>  Rename a group
  delete <name>     Delete a group (monitors will be ungrouped)
  delete <name> --with-monitors  Delete a group and all its monitors

Examples:
  uptimekit group                    # List all groups
  uptimekit group list               # List all groups
  uptimekit group rename dev development
  uptimekit group delete staging
  uptimekit group delete test --with-monitors
`)
        .option('--with-monitors', 'When deleting a group, also delete all monitors in the group')
        .argument('[args...]', 'Additional arguments for the action')
        .action(async (action, args, options) => {
            try {
                await initDB();
                
                const actionName = action || 'list';
                
                switch (actionName.toLowerCase()) {
                    case 'list':
                    case 'ls':
                        await listGroups();
                        break;
                    
                    case 'rename':
                    case 'mv':
                        await handleRename(args, options);
                        break;
                    
                    case 'delete':
                    case 'del':
                    case 'rm':
                        await handleDelete(args, options);
                        break;
                    
                    default:                   
                        console.error(chalk.red(`Unknown action: ${actionName}`));
                        console.log(chalk.gray('Available actions: list, rename, delete'));
                        console.log(chalk.gray('Use "uptimekit group --help" for more information.'));
                }
            } catch (err) {
                console.error(chalk.red('Error:'), err.message);
            }
        });
}

async function listGroups() {
    const groups = getGroups();
    
    if (groups.length === 0) {
        console.log(chalk.yellow('No groups found. Add monitors with -g/--group flag to create groups.'));
        console.log(chalk.gray('Example: uptimekit add https://example.com -t http -i 30 -n mysite -g production'));
        return;
    }
    
    console.log(chalk.bold.cyan('\nMonitor Groups\n'));
    
    let totalMonitors = 0;
    
    groups.forEach(g => {
        const monitors = getMonitorsByGroup(g.group_name);
        totalMonitors += g.count;
        
        console.log(chalk.bold(`  ${g.group_name}`));
        console.log(chalk.gray(`    ${g.count} monitor${g.count !== 1 ? 's' : ''}`));
        
        // Show monitor names in the group
        if (monitors.length > 0) {
            const names = monitors.slice(0, 5).map(m => m.name || m.url).join(', ');
            const more = monitors.length > 5 ? ` (+${monitors.length - 5} more)` : '';
            console.log(chalk.gray(`    └─ ${names}${more}`));
        }
        console.log();
    });
    
    console.log(chalk.gray(`Total: ${groups.length} group${groups.length !== 1 ? 's' : ''}, ${totalMonitors} monitor${totalMonitors !== 1 ? 's' : ''}`));
    console.log(chalk.gray('\nTip: Use "uptimekit status -g <group>" to view monitors in a specific group.'));
}

async function handleRename(args, options) {
    if (args.length < 2) {
        console.error(chalk.red('Error: rename requires two arguments: <old-name> <new-name>'));
        console.log(chalk.gray('Example: uptimekit group rename dev development'));
        return;
    }
    
    const [oldName, newName] = args;
    
    if (oldName.toLowerCase() === newName.toLowerCase()) {
        console.log(chalk.yellow('Old name and new name are the same. No changes made.'));
        return;
    }

    if (!newName || newName.trim() === '') {
        console.error(chalk.red('Error: New group name cannot be empty.'));
        return;
    }
    
    // Check if old group exists
    if (!groupExists(oldName)) {
        console.error(chalk.red(`Error: Group '${oldName}' does not exist.`));
        console.log(chalk.gray('Use "uptimekit group list" to see available groups.'));
        return;
    }
    
    // Check if new name already exists
    if (groupExists(newName) && oldName.toLowerCase() !== newName.toLowerCase()) {
        console.error(chalk.red(`Error: Group '${newName}' already exists.`));
        return;
    }
    
    const result = renameGroup(oldName, newName);
    console.log(chalk.green(`✔ Renamed group '${oldName}' to '${newName}' (${result.changes} monitor${result.changes !== 1 ? 's' : ''} updated)`));
}

async function handleDelete(args, options) {
    if (args.length < 1) {
        console.error(chalk.red('Error: delete requires a group name.'));
        console.log(chalk.gray('Example: uptimekit group delete staging'));
        return;
    }
    
    const groupName = args[0];
    const deleteMonitors = options.withMonitors || false;
    
    // Check if group exists
    if (!groupExists(groupName)) {
        console.error(chalk.red(`Error: Group '${groupName}' does not exist.`));
        console.log(chalk.gray('Use "uptimekit group list" to see available groups.'));
        return;
    }

    const monitors = getMonitorsByGroup(groupName);
    
    if (monitors.length === 0) {
        console.log(chalk.yellow(`Group '${groupName}' has no monitors.`));
        return;
    }
    
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const question = (q) => new Promise(resolve => rl.question(q, ans => resolve(ans)));
    
    if (deleteMonitors) {
        console.log(chalk.red.bold(`\nWARNING: This will permanently delete ${monitors.length} monitor${monitors.length !== 1 ? 's' : ''} and their history!`));
        monitors.forEach(m => console.log(chalk.gray(`  - ${m.name || m.url}`)));
        
        const confirm = await question(chalk.yellow(`\nType the group name '${groupName}' to confirm deletion: `));
        rl.close();
        
        if (confirm.trim() !== groupName) {
            console.log(chalk.yellow('Deletion cancelled.'));
            return;
        }
        
        const result = deleteGroup(groupName, true);
        console.log(chalk.green(`✔ Deleted group '${groupName}' and ${result.changes} monitor${result.changes !== 1 ? 's' : ''}`));
    } else {
        console.log(chalk.yellow(`\nThis will ungroup ${monitors.length} monitor${monitors.length !== 1 ? 's' : ''} from '${groupName}'.`));
        console.log(chalk.gray('(Monitors will not be deleted, just removed from the group)'));
        
        const confirm = await question(chalk.yellow('Continue? (y/N): '));
        rl.close();
        
        if (!confirm.trim().toLowerCase().startsWith('y')) {
            console.log(chalk.yellow('Operation cancelled.'));
            return;
        }
        
        const result = deleteGroup(groupName, false);
        console.log(chalk.green(`✔ Ungrouped ${result.changes} monitor${result.changes !== 1 ? 's' : ''} from '${groupName}'`));
    }
}
