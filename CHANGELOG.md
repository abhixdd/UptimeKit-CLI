# uptimekit

## 1.2.27

### Patch Changes

- 71d8bcf: \## Bug Fixes

  \### Critical

  \- Fixed type comparison bug in add.js causing incorrect interval validation

  \- Fixed data loss from missing SSL certificate cleanup on monitor deletion

  \- Fixed process hanging in reset/clear commands due to improper stdin handling

  \### Validation

  \- Added interval validation to reject negative/zero values in add and edit commands

  \- Added database-level interval validation in addMonitor and updateMonitor

  \- Improved whitespace handling in getMonitorByIdOrName

  \### Improvements

  \- Fixed SSL notification spam
