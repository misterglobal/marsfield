import { spawnSync } from 'node:child_process';
import path from 'node:path';

const baseSha = process.env.LINT_BASE_SHA;
const headSha = process.env.LINT_HEAD_SHA || 'HEAD';

if (!baseSha) {
  throw new Error('LINT_BASE_SHA is required');
}

const diff = spawnSync(
  'git',
  ['diff', '--name-only', '--diff-filter=ACMR', baseSha, headSha, '--', 'frontend'],
  { encoding: 'utf8' },
);

if (diff.status !== 0) {
  process.stderr.write(diff.stderr);
  process.exit(diff.status ?? 1);
}

const files = diff.stdout
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((file) => /\.[cm]?[jt]sx?$/.test(file))
  .map((file) => path.relative('frontend', file));

const lintConfigurationFiles = new Set([
  'frontend/eslint.config.mjs',
  'frontend/package.json',
  'frontend/tsconfig.json',
]);
const changedFiles = diff.stdout.split(/\r?\n/).filter(Boolean);
const changedLintConfiguration = changedFiles.filter((file) => lintConfigurationFiles.has(file));

if (changedLintConfiguration.length > 0) {
  console.error(
    `Lint configuration changes require resolving the full frontend lint baseline first: ${changedLintConfiguration.join(', ')}`,
  );
  process.exit(1);
}

if (files.length === 0) {
  console.log('No changed frontend JavaScript or TypeScript files to lint.');
  process.exit(0);
}

const eslintBin = path.resolve('node_modules', 'eslint', 'bin', 'eslint.js');
const lint = spawnSync(process.execPath, [eslintBin, ...files], {
  cwd: path.resolve('frontend'),
  stdio: 'inherit',
});

process.exit(lint.status ?? 1);
