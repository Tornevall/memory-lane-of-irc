import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

function runGit(command) {
  return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function resolveVersion() {
  try {
    const tag = runGit('git describe --tags --exact-match HEAD');
    if (tag) {
      return { label: tag, source: 'tag' };
    }
  } catch {
    // No exact tag on HEAD.
  }

  const commit = runGit('git rev-parse --short HEAD');
  return { label: `commit ${commit}`, source: 'commit' };
}

const currentDir = dirname(fileURLToPath(import.meta.url));
const targetPath = resolve(currentDir, '..', 'src', 'version.generated.js');
const version = resolveVersion();

writeFileSync(
  targetPath,
  `export const IRC_MEMORY_LANE_VERSION = ${JSON.stringify(version.label)};\n`
  + `export const IRC_MEMORY_LANE_VERSION_SOURCE = ${JSON.stringify(version.source)};\n`,
  'utf8'
);
