/**
 * @summary Copies gitignored `ai/mcp/server/<name>/config.mjs` files from the main git
 * checkout into the current git worktree, and optionally symlinks the gitignored
 * substrate-data subdirs of `.neo-ai-data/` (sqlite, chroma, wake-daemon, etc.) so
 * Memory Core, knowledge-base, and bridge-daemon state is unified across worktree
 * MCP server processes — while leaving the git-tracked `concepts/` subdir untouched.
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
 * **Symlinking DATA DIRECTORIES is safe and recommended — but only the gitignored ones.**
 * `.neo-ai-data/` contains SQLite DB files (Memory Core graph), Chroma vectors, JSONL
 * backups, concept CSVs — pure data with zero ESM import chains. `better-sqlite3` opens
 * files by path, and `path.resolve` traverses symlinks transparently without canonical-path
 * side effects.
 *
 * **The gitignore boundary inside `.neo-ai-data/` is load-bearing:**
 *
 * ```
 * .neo-ai-data
 * !.neo-ai-data/concepts/
 * ```
 *
 * Everything inside `.neo-ai-data/` is gitignored EXCEPT `concepts/` which IS git-tracked.
 * Symlinking the parent `.neo-ai-data/` directory atomically (the pre-#10432 behavior)
 * hides the worktree's tracked `concepts/` files behind canonical's view; using `--force`
 * clobbers them entirely. Both outcomes break the worktree-local concepts substrate.
 *
 * The granular fix (per #10432): symlink each gitignored substrate-data subdir individually
 * via the `DATA_SUBDIRS_TO_LINK` allowlist. `concepts/` is never in the allowlist → never
 * touched. This unifies the Memory Core substrate ({@link symlinkDataDir}) so AgentIdentity
 * nodes seeded once are visible to every worktree's MCP server, A2A mailbox handoffs span
 * harnesses, AND the bridge daemon's PID-lock singleton (#10423) plus persistent log
 * (#10425) span worktrees too — without the tracked `concepts/` clobber risk that
 * empirically broke 10 of 11 worktrees in the 2026-04-27 cross-process coherence gap
 * diagnosis.
 *
 * **Usage:**
 * ```
 * node ai/scripts/bootstrapWorktree.mjs              # copy configs only
 * node ai/scripts/bootstrapWorktree.mjs --link-data  # copy configs + symlink data subdirs
 * node ai/scripts/bootstrapWorktree.mjs --link-data --force
 *                                                    # clobber any existing real
 *                                                    # gitignored subdir (data-loss guard
 *                                                    # opt-in; never touches concepts/)
 * node ai/scripts/bootstrapWorktree.mjs --link-data --canonical-root /path/to/canonical
 *                                                    # independent-clone topology: explicit
 *                                                    # canonical-root override (per #10435)
 * ```
 *
 * Also supports the `NEO_AI_CANONICAL_ROOT` env var as a fallback for the `--canonical-root`
 * flag, useful for CI / shell aliases.
 *
 * **Topology support:**
 * - **Git worktrees** (the original #10095 use case): canonical is resolved automatically
 *   via `git worktree list --porcelain`.
 * - **Independent clones** (per #10435): a separate clone (e.g., an Antigravity-side clone
 *   that mirrors the canonical github-side clone) is NOT a git worktree, so `git worktree
 *   list` returns the clone itself. Pass `--canonical-root <path>` (or set
 *   `NEO_AI_CANONICAL_ROOT`) to point at the canonical sibling explicitly. Same per-subdir
 *   symlink semantics + `concepts/` protection apply.
 *
 * Idempotent: files that already exist are skipped; subdirs already symlinked report
 * `'already-linked'`. Refuses to run from the main checkout itself (no-op when worktree
 * root === resolved canonical root).
 *
 * @see https://github.com/neomjs/neo/issues/10095
 * @see https://github.com/neomjs/neo/issues/10224 (closed predecessor — coarse-grained symlink)
 * @see https://github.com/neomjs/neo/issues/10424 (cross-process coherence gap empirically anchored)
 * @see https://github.com/neomjs/neo/issues/10432 / #10433 (granular per-subdir refinement)
 * @see https://github.com/neomjs/neo/issues/10435 (this independent-clone extension)
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
 * Allowlist of `.neo-ai-data/` subdirs to symlink to canonical when `--link-data` is set.
 * All entries are gitignored substrate-data subdirs that benefit from cross-worktree
 * unification. The git-tracked `concepts/` subdir is deliberately NOT in this list —
 * symlinking it would hide the worktree's own tracked files; `--force` would clobber them.
 *
 * The order is informational (no semantic dependency between subdirs); each is symlinked
 * independently and per-subdir results are reported separately.
 *
 * @see {@link symlinkDataDir} for the per-subdir symlink-or-skip-or-clobber logic.
 */
export const DATA_SUBDIRS_TO_LINK = [
    'sqlite',       // Memory Core graph DB (memory-core-graph.sqlite + WAL/SHM)
    'chroma',       // Vector DBs (knowledge-base + memory-core)
    'wake-daemon',  // PID-lock + bridge.log + lastSyncId — unifies #10423 singleton across worktrees
    'backups',      // JSONL backups (Memory Core message + node history)
    'datasets',     // Canonical CSVs ingested by knowledge-base sync
    'neo-sqlite'    // Legacy DB (still referenced by older code paths)
];

/**
 * @summary Resolves the canonical "main checkout" path for a given project root.
 *
 * Two resolution paths, in priority order:
 *
 * 1. **Explicit override** (per #10435) — when an `explicitRoot` is supplied (typically
 *    via the `--canonical-root` CLI flag or `NEO_AI_CANONICAL_ROOT` env var), use it
 *    directly. Required for **independent clone** topologies (e.g., a separate
 *    `antigravity/neomjs/neo` clone that mirrors the canonical `github/neomjs/neo`
 *    clone — not a git worktree, so `git worktree list` returns the clone itself
 *    rather than the canonical sibling).
 *
 * 2. **Git worktree resolution** (the original #10095 path) — `git worktree list
 *    --porcelain` returns the primary working tree as its first entry, which is the
 *    canonical-shared-checkout for any worktree spawned off it. For independent clones
 *    this returns the clone's own root, which signals "main checkout mode" downstream
 *    (no symlinking) — exactly the right behavior when no explicit override exists.
 *
 * @param {string}  cwd             The directory to run git from.
 * @param {object}  [options]
 * @param {string}  [options.explicitRoot] Absolute path to the canonical checkout, when
 *                                        known via CLI flag / env var. Skips git resolution.
 * @returns {Promise<string|null>} Absolute path to the main checkout, or null on failure.
 */
export async function resolveMainCheckout(cwd, {explicitRoot} = {}) {
    if (explicitRoot) return path.resolve(explicitRoot);

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
 * @summary Granularly symlinks gitignored substrate-data subdirs of `.neo-ai-data/` to
 * canonical, unifying the Memory Core substrate across concurrent worktree MCP server
 * processes while leaving the git-tracked `concepts/` subdir untouched.
 *
 * **Why granular per-subdir, not parent-level (per #10432):**
 *
 * The `.gitignore` boundary inside `.neo-ai-data/` is `.neo-ai-data` (gitignored) plus
 * `!.neo-ai-data/concepts/` (tracked exception). Symlinking the parent atomically (the
 * pre-#10432 behavior) hides the worktree's tracked `concepts/` files behind canonical's
 * view; `--force` clobbers them entirely. Both outcomes break the worktree-local
 * concepts substrate.
 *
 * This function symlinks each gitignored subdir individually via the `subdirs` allowlist
 * (default: {@link DATA_SUBDIRS_TO_LINK}). `concepts/` is never in the default allowlist
 * → never touched, regardless of `--force`. The data-loss guard (refuse-clobber-without-
 * force) is preserved per-subdir, so a corrupted `sqlite/` can be reset without nuking
 * everything else.
 *
 * **Why this is the right substrate (Anchor & Echo):**
 *
 * Distinct from the "do NOT symlink source code" caveat at the file head — that warning
 * applies exclusively to ESM-imported modules where Node's resolver walks to the canonical
 * path and causes `Namespace collision in unitTestMode`. Data directories carry no such
 * semantic: `better-sqlite3` opens by path, Chroma dumps read/write through `fs`, and
 * `path.resolve` transparently traverses symlinks without canonical-path side effects.
 *
 * The `wake-daemon/` subdir is critical for PID-lock singleton enforcement (#10423) to
 * span worktrees — without symlinking, each worktree has its own `bridge-daemon.pid` and
 * daemons spawned from different worktrees can't see each other's locks. Same logic for
 * the persistent `bridge.log` substrate (#10425).
 *
 * Idempotent per-subdir by design: an existing symlink reports `'already-linked'`; a
 * missing canonical source reports `'skip-no-source'` (graceful for fresh repos that
 * haven't created the subdir yet); a non-symlink directory throws unless `force=true`.
 *
 * @param {object}   options
 * @param {string}   options.mainCheckout Absolute path to the primary git checkout.
 * @param {string}   options.projectRoot  Absolute path to the worktree root to link from.
 * @param {string[]} [options.subdirs]    Allowlist of subdirs to symlink; defaults to {@link DATA_SUBDIRS_TO_LINK}.
 * @param {boolean}  [options.force=false] If true, clobber existing non-symlink dirs in the allowlist (never touches subdirs not in the allowlist).
 * @param {Function} [options.log=console.log] Logger fn for action diagnostics.
 * @returns {Promise<{linked: string[], alreadyLinked: string[], clobbered: string[], skippedNoSource: string[], mainCheckout: boolean}>} Per-subdir action map.
 * @throws {Error} When any subdir's dst is a non-symlink directory and `force` is false. The error message names the offending subdir.
 */
export async function symlinkDataDir({
    mainCheckout,
    projectRoot,
    subdirs = DATA_SUBDIRS_TO_LINK,
    force   = false,
    log     = console.log
}) {
    const result = {linked: [], alreadyLinked: [], clobbered: [], skippedNoSource: [], mainCheckout: false};

    if (path.resolve(projectRoot) === path.resolve(mainCheckout)) {
        log(`symlink skip (main checkout): no per-subdir action`);
        result.mainCheckout = true;
        return result;
    }

    // Ensure the parent .neo-ai-data/ exists as a regular dir; we never symlink the parent.
    // This preserves the git-tracked concepts/ subdir already present in the worktree.
    const parentDst = path.join(projectRoot, '.neo-ai-data');
    await fs.mkdir(parentDst, {recursive: true});

    for (const subdir of subdirs) {
        const src   = path.join(mainCheckout, '.neo-ai-data', subdir);
        const dst   = path.join(parentDst, subdir);
        const lstat = await fs.lstat(dst).catch(() => null);

        if (lstat?.isSymbolicLink()) {
            log(`symlink skip (already linked): ${subdir}`);
            result.alreadyLinked.push(subdir);
            continue;
        }

        // Skip if canonical lacks the subdir — graceful for fresh repos.
        const srcExists = await exists(src);
        if (!srcExists) {
            log(`symlink skip (no source in main checkout): ${subdir}`);
            result.skippedNoSource.push(subdir);
            continue;
        }

        if (lstat?.isDirectory()) {
            if (!force) {
                throw new Error(
                    `Refusing to replace non-symlink ${dst}; pass force=true (CLI --force) to opt in. ` +
                    `This directory contains local data that would be lost.`
                );
            }
            log(`symlink clobber (force=true): removing ${subdir}`);
            await fs.rm(dst, {recursive: true, force: true});
            result.clobbered.push(subdir);
        }

        await fs.symlink(src, dst, 'dir');
        log(`symlinked: ${subdir} → ${src}`);
        result.linked.push(subdir);
    }

    return result;
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
    let action;

    if (await exists(nodeModulesPath)) {
        log(`install skip (exists): node_modules`);
        action = 'already-installed';
    } else {
        log(`installing dependencies (npm install)...`);
        const start = Date.now();
        await exec('npm', ['install'], {cwd: projectRoot});
        log(`installed dependencies in ${Math.round((Date.now() - start) / 1000)}s`);
        action = 'installed';
    }

    log(`bundling parse5 (test-runner prerequisite)...`);
    const bundleStart = Date.now();
    await exec('npm', ['run', 'bundle-parse5'], {cwd: projectRoot});
    log(`bundled parse5 in ${Math.round((Date.now() - bundleStart) / 1000)}s`);

    return action;
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

    const argv     = process.argv.slice(2);
    const args     = new Set(argv);
    const linkData = args.has('--link-data');
    const force    = args.has('--force');
    const install  = args.has('--install');
    const buildAll = args.has('--build-all');

    // `--canonical-root <path>` flag wins; `NEO_AI_CANONICAL_ROOT` env var is the fallback.
    // Both are no-ops when running in an actual git worktree (the existing
    // git-worktree-list resolution path is the natural primary). They activate the
    // independent-clone topology (per #10435) where canonical lives in a sibling
    // checkout that `git worktree list` doesn't surface.
    const flagIdx       = argv.indexOf('--canonical-root');
    const explicitRoot  = (flagIdx !== -1 && argv[flagIdx + 1])
        ? argv[flagIdx + 1]
        : (process.env.NEO_AI_CANONICAL_ROOT || null);

    try {
        const mainCheckout = await resolveMainCheckout(projectRoot, {explicitRoot});
        if (!mainCheckout) {
            console.error('Failed to resolve main checkout. Provide --canonical-root <path> (or NEO_AI_CANONICAL_ROOT env var) when running outside a git worktree, or ensure this is a git repository.');
            process.exit(1);
        }
        if (explicitRoot) console.log(`✓ Canonical checkout (explicit): ${mainCheckout}`);

        const result = await bootstrapWorktree({mainCheckout, projectRoot});
        const total  = result.copied.length + result.skipped.length + result.missing.length;
        console.log(`\n✓ Bootstrap complete: ${result.copied.length} copied, ${result.skipped.length} skipped, ${result.missing.length} missing (${total} total)`);

        if (linkData) {
            const symlinkResult = await symlinkDataDir({mainCheckout, projectRoot, force});
            if (symlinkResult.mainCheckout) {
                console.log(`✓ Data symlink: skipped (running in main checkout)`);
            } else {
                const linkedN          = symlinkResult.linked.length;
                const alreadyLinkedN   = symlinkResult.alreadyLinked.length;
                const clobberedN       = symlinkResult.clobbered.length;
                const skippedNoSourceN = symlinkResult.skippedNoSource.length;
                console.log(
                    `✓ Data symlink: ${linkedN} linked, ${alreadyLinkedN} already-linked, ` +
                    `${clobberedN} clobbered, ${skippedNoSourceN} skipped-no-source`
                );
                if (linkedN          > 0) console.log(`  linked:           ${symlinkResult.linked.join(', ')}`);
                if (alreadyLinkedN   > 0) console.log(`  already-linked:   ${symlinkResult.alreadyLinked.join(', ')}`);
                if (clobberedN       > 0) console.log(`  clobbered:        ${symlinkResult.clobbered.join(', ')}`);
                if (skippedNoSourceN > 0) console.log(`  skipped-no-src:   ${symlinkResult.skippedNoSource.join(', ')}`);
            }
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
