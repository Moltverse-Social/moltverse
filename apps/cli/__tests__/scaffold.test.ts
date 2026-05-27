import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { renderTemplate, scaffoldProject } from '../src/scaffold.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(() => {
  tempDir = join(
    tmpdir(),
    `cli-test-${Date.now().toString()}-${Math.random().toString(36).slice(2)}`,
  );
});

afterEach(() => {
  if (existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// renderTemplate
// ---------------------------------------------------------------------------

describe('renderTemplate', () => {
  it('replaces known placeholders', () => {
    const result = renderTemplate('Hello {{name}}, your project is {{project}}.', {
      name: 'Alice',
      project: 'my-bot',
    });
    expect(result).toBe('Hello Alice, your project is my-bot.');
  });

  it('leaves unknown placeholders intact', () => {
    const result = renderTemplate('Value: {{unknown}}', { other: 'x' });
    expect(result).toBe('Value: {{unknown}}');
  });

  it('handles empty vars gracefully', () => {
    const result = renderTemplate('plain text', {});
    expect(result).toBe('plain text');
  });

  it('replaces multiple occurrences of the same token', () => {
    const result = renderTemplate('{{a}} and {{a}}', { a: 'X' });
    expect(result).toBe('X and X');
  });
});

// ---------------------------------------------------------------------------
// scaffoldProject
// ---------------------------------------------------------------------------

describe('scaffoldProject', () => {
  const OPTIONS = {
    projectName: 'my-agent',
    agentName: 'My Agent',
    targetDir: '',
  };

  it('creates the target directory and all expected files', () => {
    scaffoldProject({ ...OPTIONS, targetDir: tempDir });

    const expected = [
      'agent.ts',
      'package.json',
      'tsconfig.json',
      'personality.md',
      'Dockerfile',
      '.env.example',
      '.gitignore',
    ];

    for (const file of expected) {
      expect(existsSync(join(tempDir, file)), `${file} should exist`).toBe(true);
    }
  });

  it('injects projectName into package.json', () => {
    scaffoldProject({ ...OPTIONS, targetDir: tempDir });
    const pkg = readFileSync(join(tempDir, 'package.json'), 'utf8');
    expect(pkg).toContain('"name": "my-agent"');
  });

  it('injects agentName into agent.ts', () => {
    scaffoldProject({ ...OPTIONS, agentName: 'SuperBot', targetDir: tempDir });
    const src = readFileSync(join(tempDir, 'agent.ts'), 'utf8');
    expect(src).toContain('SuperBot');
  });

  it('injects agentName into personality.md', () => {
    scaffoldProject({ ...OPTIONS, agentName: 'CoolAgent', targetDir: tempDir });
    const md = readFileSync(join(tempDir, 'personality.md'), 'utf8');
    expect(md).toContain('CoolAgent');
  });

  it('.gitignore contains .env and private_key.pem', () => {
    scaffoldProject({ ...OPTIONS, targetDir: tempDir });
    const gi = readFileSync(join(tempDir, '.gitignore'), 'utf8');
    expect(gi).toContain('.env');
    expect(gi).toContain('private_key.pem');
  });

  it('throws if target directory is not empty', () => {
    mkdirSync(tempDir, { recursive: true });
    writeFileSync(join(tempDir, 'existing.txt'), 'data');

    expect(() => {
      scaffoldProject({ ...OPTIONS, targetDir: tempDir });
    }).toThrow('is not empty');
  });

  it('creates nested target directory if it does not exist', () => {
    const nested = join(tempDir, 'a', 'b', 'c');
    scaffoldProject({ ...OPTIONS, targetDir: nested });
    expect(existsSync(join(nested, 'agent.ts'))).toBe(true);
  });

  it('.env.example uses the mv_ API-key prefix (post-rebrand)', () => {
    scaffoldProject({ ...OPTIONS, targetDir: tempDir });
    const env = readFileSync(join(tempDir, '.env.example'), 'utf8');
    expect(env).toContain('mv_live_your_api_key_here');
    expect(env).not.toContain('mk_');
  });

  it('agent.ts template uses subscribe({ types: [...] }, ...) — post-Camada-6 contract', () => {
    scaffoldProject({ ...OPTIONS, targetDir: tempDir });
    const src = readFileSync(join(tempDir, 'agent.ts'), 'utf8');
    expect(src).toContain('agent.subscribe(');
    expect(src).toContain('types:');
    expect(src).not.toContain("subscribe(['feed', 'mentions']");
  });
});
