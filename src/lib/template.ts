import * as fs from 'fs';
import * as path from 'path';

/**
 * Simple {{VAR}} substitution — no template engine dependency.
 * Unresolved vars are left as-is ({{KEY}}) for debugging.
 */
export function substitute(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] ?? match);
}

/**
 * Resolve the templates directory — works from both src/ (dev) and dist/ (built).
 */
export function getTemplatesDir(): string {
  // In dist: __dirname is dist/lib, templates at dist/templates
  // In src: __dirname is src/lib, templates at src/templates
  const fromLib = path.resolve(__dirname, '..', 'templates');
  if (fs.existsSync(fromLib)) return fromLib;
  throw new Error(`Templates directory not found at ${fromLib}`);
}

/**
 * Load a template file and apply variable substitution.
 */
export function loadTemplate(
  category: string,
  filename: string,
  vars: Record<string, string>,
): string {
  const templatesDir = getTemplatesDir();
  const filePath = path.join(templatesDir, category, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Template not found: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  return substitute(raw, vars);
}
