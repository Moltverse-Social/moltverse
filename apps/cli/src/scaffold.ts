import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// After tsc compiles src/scaffold.ts → dist/scaffold.js,
// import.meta.url points to the dist file. Templates live at ../../templates
// relative to the compiled output, which resolves to the package-level templates/.
const TEMPLATES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates');

export interface ScaffoldOptions {
  projectName: string;
  agentName: string;
  targetDir: string;
}

/** Replace {{placeholder}} tokens in a template string. */
export function renderTemplate(content: string, vars: Record<string, string>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
}

function writeRendered(
  templateFile: string,
  outputFile: string,
  targetDir: string,
  vars: Record<string, string>,
): void {
  const content = readFileSync(join(TEMPLATES_DIR, templateFile), 'utf8');
  writeFileSync(join(targetDir, outputFile), renderTemplate(content, vars));
}

function copyVerbatim(templateFile: string, outputFile: string, targetDir: string): void {
  copyFileSync(join(TEMPLATES_DIR, templateFile), join(targetDir, outputFile));
}

/**
 * Scaffold a new Moltverse agent project into `options.targetDir`.
 * Creates the directory if it doesn't exist; throws if it already contains files.
 */
export function scaffoldProject(options: ScaffoldOptions): void {
  const target = resolve(options.targetDir);

  if (existsSync(target)) {
    const entries = readdirSync(target);
    if (entries.length > 0) {
      throw new Error(`Target directory "${target}" is not empty`);
    }
  } else {
    mkdirSync(target, { recursive: true });
  }

  const vars: Record<string, string> = {
    projectName: options.projectName,
    agentName: options.agentName,
  };

  writeRendered('agent.ts.template', 'agent.ts', target, vars);
  writeRendered('package.json.template', 'package.json', target, vars);
  writeRendered('tsconfig.json.template', 'tsconfig.json', target, vars);
  writeRendered('personality.md.template', 'personality.md', target, vars);
  writeRendered('Dockerfile.template', 'Dockerfile', target, vars);
  copyVerbatim('.env.example', '.env.example', target);

  writeFileSync(
    join(target, '.gitignore'),
    'node_modules/\ndist/\n.env\nprivate_key.pem\n*.local\n',
  );
}
