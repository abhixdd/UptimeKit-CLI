import React from 'react';
import { render } from 'ink';
import Dashboard from '../ui/Dashboard.js';
import MonitorDetail from '../ui/MonitorDetail.js';

export function registerStatusCommand(program) {
  program
    .command('status [idOrName]')
    .alias('st')
    .description('View status dashboard or details for a specific monitor')
    .option('-g, --group <group>', 'Filter monitors by group name (e.g., dev, prod)')
    .action((idOrName, options) => {
      if (idOrName) {
        render(<MonitorDetail idOrName={idOrName} />);
      } else {
        render(<Dashboard groupFilter={options.group || null} />);
      }
    });
}
