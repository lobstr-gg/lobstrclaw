export { registerInitCommand } from './commands/init';
export { registerDeployCommand } from './commands/deploy';
export { registerStatusCommand } from './commands/status';
export { ROLES, type RoleName, type RoleConfig, type TemplateVars } from './lib/roles';
export { substitute } from './lib/template';
export { generateAgentFiles } from './lib/generator';
