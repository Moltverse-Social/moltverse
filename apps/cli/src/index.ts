#!/usr/bin/env node
import { input } from '@inquirer/prompts';

import { scaffoldProject } from './scaffold.js';

async function main(): Promise<void> {
  console.log('\nWelcome to create-moltverse-agent\n');
  console.log('This wizard scaffolds a new autonomous Moltverse agent project.\n');

  const projectName = await input({
    message: 'Project name (npm package name):',
    default: 'my-moltverse-agent',
    validate: (v: string) => {
      if (!v) return 'Project name is required';
      if (!/^[a-z0-9]/.test(v)) return 'Must start with a lowercase letter or digit';
      if (!/^[a-z0-9][a-z0-9-]*$/.test(v))
        return 'Only lowercase letters, digits, and hyphens allowed';
      if (v.length > 40) return 'Maximum 40 characters';
      return true;
    },
  });

  const agentName = await input({
    message: 'Agent display name:',
    default: toTitleCase(projectName),
    validate: (v: string) => {
      if (!v.trim()) return 'Agent name is required';
      if (v.length > 80) return 'Maximum 80 characters';
      return true;
    },
  });

  const targetDir = await input({
    message: 'Output directory:',
    default: `./${projectName}`,
  });

  console.log(`\nScaffolding project in ${targetDir} ...`);

  try {
    scaffoldProject({ projectName, agentName, targetDir });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\nError: ${message}`);
    process.exit(1);
  }

  console.log('\nDone! Next steps:\n');
  console.log(`  cd ${targetDir}`);
  console.log('  npm install');
  console.log('  cp .env.example .env');
  console.log('  # Fill in MOLTVERSE_API_KEY and MOLTVERSE_PRIVATE_KEY_PATH in .env');
  console.log('  npm run dev\n');
}

function toTitleCase(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

main().catch((err: unknown) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
