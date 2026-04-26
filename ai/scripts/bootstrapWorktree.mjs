/**
 * @summary Copies gitignored `ai/mcp/server/<name>/config.mjs` files from the main git
 * checkout into the current git worktree, and optionally symlinks the `.neo-ai-data/`
 * data directory so Memory Core substrate is unified across worktree MCP server processes.
 *
 * **Background (config copy):** `ai/mcp/server/{github-workflow,knowledge-base,memory-core,neural-link}/config.mjs`
 * are gitignored (they are copy-from-template files for local overrides). Fresh git worktrees
 * under `.claude/worktrees/<name>/` therefore cannot run any script that imports
 * `ai/services.mjs`:
 *
 * ```
 * Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../ai/mcp/server/github-workflow/config.mjs'
 * ```
 *
 * **Symlinks: code vs data (critical distinction).**
 *
 * **Do NOT symlink SOURCE CODE** (`src/core/Base.mjs`, `config.mjs`, any ESM-imported
 * module) — Node's ESM resolver walks to the canonical (real) path of a symlinked module.
 * When the worktree-local `src/core/Base.mjs` ALSO gets imported (e.g. by a Playwright
 * spec), `Neo.setupClass` sees the same namespace registered from two different file
 * paths and throws `Namespace collision in unitTestMode`. For code, config files MUST be
 * real copies with their own canonical path inside the worktree.
 *
 * **Symlinking DATA DIRECTORIES is safe and recommended.** `.neo-ai-data/` contains SQLite
 * DB files (Memory Core graph), Chroma vectors, JSONL backups, concept CSVs — pure data
 * with zero ESM import chains. `better-sqlite3` opens files by path, and `path.resolve`
 * traverses symlinks transparently without canonical-path side effects. Symlinking
 * `.neo-ai-data/` unifies the Memory Core substrate so AgentIdentity nodes seeded once
 * are visible to every worktree's MCP server, and A2A mailbox handoffs span harnesses.
 * This automates the tactical convention codified in ticket #10176 and closes #10224.
 * See {@link symlinkDataDir} for the implementation.
 *
 * **Usage:**
 * ```
 * node ai/scripts/bootstrapWorktree.mjs              # copy configs only
 * node ai/scripts/bootstrapWorktree.mjs --link-data  # copy configs + symlink .neo-ai-data/
 * node ai/scripts/bootstrapWorktree.mjs --link-data --force
 *                                                    # clobber existing worktree-local
 *                                                    # .neo-ai-data/ (data-loss guard
 *                                                    # opt-in; gitignored + session-scoped)
 * ```
 *
 * Idempotent: files that already exist are skipped; an existing symlink at `.neo-ai-data/`
 * short-circuits to `'already-linked'`. Refuses to run from the main checkout (no-op).
 * Resolves the main checkout via `git worktree list --porcelain` — its first entry is
 * always the primary working tree.
 *
 * @see https://github.com/neomjs/neo/issues/10095
 * @see https://github.com/neomjs/neo/issues/10224
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

/**
 * @summary Creates a worktree→main-checkout symlink for a data directory (default:
 * `.neo-ai-data/`), unifying the Memory Core substrate across concurrent worktree MCP
 * server processes.
 *
 * Distinct from the "do NOT symlink source code" caveat at the file head — that warning
 * applies exclusively to ESM-imported modules, where Node's resolver walks to the
 * canonical path and causes `Namespace collision in unitTestMode`. Data directories
 * carry no such semantic: `better-sqlite3` opens by path, Chroma dumps read/write through
 * `fs`, and `path.resolve` transparently traverses symlinks without canonical-path side
 * effects. Symlinking `.neo-ai-data/` closes the #10224 data-isolation split by unifying
 * the substrate ADR 0001 §1 assumes exists (one SQLite file shared across N processes).
 *
 * Idempotent by design: `'already-linked'` short-circuits on re-invocation over an
 * existing symlink. Refuses to clobber a real directory without `force: true` — a
 * data-loss guard protecting against cases where a worktree accumulated unique writes
 * before unification was opted-in.
 *
 * @param {object}  options
 * @param {string}  options.mainCheckout Absolute path to the primary git checkout.
 * @param {string}  options.projectRoot  Absolute path to the worktree root to link from.
 * @param {string}  [options.dir='.neo-ai-data'] Directory name to link; relative to both roots.
 * @param {boolean} [options.force=false] If true, overwrite an existing non-symlink dir at dst.
 * @param {Function} [options.log=console.log] Logger fn for action diagnostics.
 * @returns {Promise<'main-checkout'|'already-linked'|'linked'>} Action taken.
 * @throws {Error} When dst is a non-symlink directory and `force` is false.
 */
export async function symlinkDataDir({mainCheckout, projectRoot, dir = '.neo-ai-data', force = false, log = console.log}) {
    if (path.resolve(projectRoot) === path.resolve(mainCheckout)) {
        log(`symlink skip (main checkout): ${dir}`);
        return 'main-checkout';
    }

    const src   = path.join(mainCheckout, dir);
    const dst   = path.join(projectRoot, dir);
    const lstat = await fs.lstat(dst).catch(() => null);

    if (lstat?.isSymbolicLink()) {
        log(`symlink skip (already linked): ${dir}`);
        return 'already-linked';
    }

    if (lstat?.isDirectory()) {
        if (!force) {
            throw new Error(
                `Refusing to replace non-symlink ${dst}; pass force=true (CLI --force) to opt in. ` +
                `This directory contains local data that would be lost.`
            );
        }
        log(`symlink clobber (force=true): removing ${dir}`);
        await fs.rm(dst, {recursive: true, force: true});
    }

    await fs.mkdir(path.dirname(dst), {recursive: true});
    await fs.symlink(src, dst, 'dir');
    log(`symlinked: ${dir} → ${src}`);
    return 'linked';
}

/**
 * @summary Installs the worktree's `node_modules` and bundles the parse5 test prerequisite.
 *
 * Worktrees off `origin/dev` start without `node_modules` (gitignored) AND without
 * `dist/parse5.mjs` (gitignored test-runner prerequisite). Both are needed to run the
 * Playwright unit-test suite or any SDK-consuming script. Adding these as opt-in flags
 * here closes the manual-multi-step bootstrap gap surfaced empirically during #10339
 * implementation (per #10351).
 *
 * Idempotent: skips `npm install` when `node_modules/` is already present (e.g.,
 * symlinked from main, prior `--install` invocation, or manual `npm i`). Always runs
 * `npm run bundle-parse5` because the bundle output lives under `dist/` (gitignored)
 * and is cheap to rebuild — surfacing it explicitly under `--install` closes the
 * "test runner fails with `Cannot find module '.../dist/parse5.mjs'`" friction.
 *
 * Cost anchor: ~17s for `npm install` on a populated local cache (808 packages,
 * empirically observed during #10339 implementation, 2026-04-26). `bundle-parse5`
 * adds ~1-2s. Friction-free when `node_modules` already exists (skip path is sub-millisecond).
 *
 * @param {object}   options
 * @param {string}   options.projectRoot      Absolute path to the worktree root.
 * @param {Function} [options.log]            Logger fn for action diagnostics.
 * @param {Function} [options.exec]           execFile wrapper for dependency injection (testing).
 * @returns {Promise<'already-installed'|'installed'>} Action taken.
 */
export async function installDependencies({projectRoot, log = console.log, exec = execFileAsync}) {
    const nodeModulesPath = path.join(projectRoot, 'node_modules');

    if (await exists(nodeModulesPath)) {
        log(`install skip (exists): node_modules`);
    } else {
        log(`installing dependencies (npm install)...`);
        const start = Date.now();
        await exec('npm', ['install'], {cwd: projectRoot});
        log(`installed dependencies in ${Math.round((Date.now() - start) / 1000)}s`);
    }

    log(`bundling parse5 (test-runner prerequisite)...`);
    const start = Date.now();
    await exec('npm', ['run', 'bundle-parse5'], {cwd: projectRoot});
    log(`bundled parse5 in ${Math.round((Date.now() - start) / 1000)}s`);

    return await exists(path.join(projectRoot, 'node_modules')) ? 'installed' : 'already-installed';
}

/**
 * @summary Runs the full `npm run build-all` after ensuring dependencies are installed.
 *
 * Implies {@link installDependencies}. Required for tickets that touch the frontend
 * Webpack distributions or themes — backend-only / MCP-only tickets do not need this.
 *
 * NOT idempotent in the same idempotent-skip sense as the other bootstrap helpers —
 * `npm run build-all` re-runs every invocation. Webpack itself caches incremental builds,
 * so re-runs against an already-built tree are still considerably faster than cold builds.
 *
 * @param {object}   options
 * @param {string}   options.projectRoot      Absolute path to the worktree root.
 * @param {Function} [options.log]            Logger fn for action diagnostics.
 * @param {Function} [options.exec]           execFile wrapper for dependency injection (testing).
 * @returns {Promise<'built'>} Action taken.
 */
export async function runBuildAll({projectRoot, log = console.log, exec = execFileAsync}) {
    await installDependencies({projectRoot, log, exec});

    log(`running full build (npm run build-all)...`);
    const start = Date.now();
    await exec('npm', ['run', 'build-all'], {cwd: projectRoot});
    log(`build-all completed in ${Math.round((Date.now() - start) / 1000)}s`);

    return 'built';
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

    const args     = new Set(process.argv.slice(2));
    const linkData = args.has('--link-data');
    const force    = args.has('--force');
    const install  = args.has('--install');
    const buildAll = args.has('--build-all');

    try {
        const mainCheckout = await resolveMainCheckout(projectRoot);
        if (!mainCheckout) {
            console.error('Failed to resolve main checkout via git worktree list. Is this a git repository?');
            process.exit(1);
        }

        const result = await bootstrapWorktree({mainCheckout, projectRoot});
        const total  = result.copied.length + result.skipped.length + result.missing.length;
        console.log(`\n✓ Bootstrap complete: ${result.copied.length} copied, ${result.skipped.length} skipped, ${result.missing.length} missing (${total} total)`);

        if (linkData) {
            const symlinkResult = await symlinkDataDir({mainCheckout, projectRoot, force});
            console.log(`✓ Data symlink: ${symlinkResult}`);
        }

        if (buildAll) {
            const buildResult = await runBuildAll({projectRoot});
            console.log(`✓ Build: ${buildResult}`);
        } else if (install) {
            const installResult = await installDependencies({projectRoot});
            console.log(`✓ Install: ${installResult}`);
        }
    } catch (e) {
        console.error('Bootstrap failed:', e.message);
        process.exit(1);
    }
}
