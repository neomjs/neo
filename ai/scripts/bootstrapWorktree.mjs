/**
 * @summary Copies gitignored `ai/mcp/server/<name>/config.mjs` files from the main git
 * checkout into the current git worktree so SDK-consuming scripts (`ai/services.mjs`)
 * can run.
 *
 * **Background:** `ai/mcp/server/{github-workflow,knowledge-base,memory-core,neural-link}/config.mjs`
 * are gitignored (they are copy-from-template files for local overrides). Fresh git worktrees
 * under `.claude/worktrees/<name>/` therefore cannot run any script that imports
 * `ai/services.mjs`:
 *
 * ```
 * Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../ai/mcp/server/github-workflow/config.mjs'
 * ```
 *
 * **Do NOT use symlinks** as a workaround — Node resolves relative imports inside a
 * symlinked module against the real (canonical) path of the target, which points at the
 * main checkout's `src/core/Base.mjs`. When the worktree-local `src/core/Base.mjs` ALSO
 * gets imported (e.g. by a Playwright spec), `Neo.setupClass` sees the same namespace
 * registered from two different file paths and throws `Namespace collision in unitTestMode`.
 * Copies have their own canonical path inside the worktree and resolve correctly.
 *
 * **Usage:**
 * ```
 * node ai/scripts/bootstrapWorktree.mjs
 * ```
 *
 * Idempotent: files that already exist are skipped. Refuses to run from the main checkout
 * (no-op). Resolves the main checkout via `git worktree list --porcelain` — its first
 * entry is always the primary working tree.
 *
 * @see https://github.com/neomjs/neo/issues/10095
 */
import {execFile}       from 'child_process';
import fs               from 'fs/promises';
import path             from 'path';
import {fileURLToPath}  from 'url';
import {promisify}      from 'util';

const execFileAsync = promisify(execFile);

export const BOOTSTRAP_CONFIGS = [
    'ai/mcp/server/github-workflow/config.mjs',
    'ai/mcp/server/knowledge-base/config.mjs',
    'ai/mcp/server/memory-core/config.mjs',
    'ai/mcp/server/neural-link/config.mjs'
];

/**
 * @summary Resolves the main git checkout path for a given project root by parsing
 * `git worktree list --porcelain`. The first `worktree <path>` line is always the primary
 * working tree regardless of where the command is invoked from.
 *
 * @param {string} cwd The directory to run git from.
 * @returns {Promise<string|null>} Absolute path to the main checkout, or null on failure.
 */
export async function resolveMainCheckout(cwd) {
    const {stdout} = await execFileAsync('git', ['worktree', 'list', '--porcelain'], {cwd});
    const match    = stdout.match(/^worktree (.+)$/m);
    return match ? match[1] : null;
}

/**
 * @summary Copies missing config.mjs files from the main checkout into the target project root.
 *
 * Pure function form for testability — accepts explicit `mainCheckout`, `projectRoot`, and
 * `configs` arguments. CLI mode (bottom of file) resolves these via git.
 *
 * @param {object}   options
 * @param {string}   options.mainCheckout Absolute path to the primary git checkout.
 * @param {string}   options.projectRoot  Absolute path to the worktree root to populate.
 * @param {string[]} [options.configs]    Relative paths to copy; defaults to BOOTSTRAP_CONFIGS.
 * @param {Function} [options.log]        Optional logger fn; defaults to console.log.
 * @returns {Promise<{copied: string[], skipped: string[], missing: string[]}>}
 */
export async function bootstrapWorktree({mainCheckout, projectRoot, configs = BOOTSTRAP_CONFIGS, log = console.log}) {
    if (path.resolve(projectRoot) === path.resolve(mainCheckout)) {
        log('Running inside the main checkout — nothing to bootstrap.');
        return {copied: [], skipped: [], missing: []};
    }

    const result = {copied: [], skipped: [], missing: []};

    for (const rel of configs) {
        const src = path.join(mainCheckout, rel);
        const dst = path.join(projectRoot, rel);

        const dstExists = await exists(dst);
        if (dstExists) {
            result.skipped.push(rel);
            log(`skip (exists): ${rel}`);
            continue;
        }

        const srcExists = await exists(src);
        if (!srcExists) {
            result.missing.push(rel);
            log(`skip (source missing in main checkout): ${rel}`);
            continue;
        }

        await fs.mkdir(path.dirname(dst), {recursive: true});
        await fs.copyFile(src, dst);
        result.copied.push(rel);
        log(`copied: ${rel}`);
    }

    return result;
}

async function exists(p) {
    try {
        await fs.access(p);
        return true;
    } catch {
        return false;
    }
}

// -------------------------------------------------------------------------------------
// CLI entry point. Runs only when invoked directly (node ai/scripts/bootstrapWorktree.mjs)
// and not when imported by a test spec.
// -------------------------------------------------------------------------------------

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
    const __filename  = fileURLToPath(import.meta.url);
    const __dirname   = path.dirname(__filename);
    const projectRoot = path.resolve(__dirname, '..', '..'); // ai/scripts/ → ai/ → root

    try {
        const mainCheckout = await resolveMainCheckout(projectRoot);
        if (!mainCheckout) {
            console.error('Failed to resolve main checkout via git worktree list. Is this a git repository?');
            process.exit(1);
        }

        const result = await bootstrapWorktree({mainCheckout, projectRoot});
        const total  = result.copied.length + result.skipped.length + result.missing.length;
        console.log(`\n✓ Bootstrap complete: ${result.copied.length} copied, ${result.skipped.length} skipped, ${result.missing.length} missing (${total} total)`);
    } catch (e) {
        console.error('Bootstrap failed:', e.message);
        process.exit(1);
    }
}
