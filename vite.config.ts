import { execSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';

/**
 * A short label for this build, shown in the corner of the screen. Merges to main are
 * squash commits ending in "(#N)", so a build of main says which PR it came from.
 */
function buildLabel(): string {
  if (process.env.BUILD_LABEL) return process.env.BUILD_LABEL;
  try {
    const git = (cmd: string) => execSync(`git ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const sha = git('rev-parse --short HEAD');
    const pr = /\(#(\d+)\)\s*$/.exec(git('log -1 --format=%s'));
    return pr ? `PR #${pr[1]} · ${sha}` : `dev · ${sha}`;
  } catch {
    return 'dev';
  }
}

// `base: './'` keeps asset paths relative so the build can be dropped onto
// itch.io or GitHub Pages without changes.
export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(buildLabel()) },
  build: { target: 'es2022', chunkSizeWarningLimit: 1600 },
  test: { include: ['tests/**/*.test.ts'] },
});
