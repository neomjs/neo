/**
 * @summary Copies gitignored `ai/config.mjs` plus per-server config overlays from
 * the main git checkout into the current git worktree, and optionally symlinks the
 * gitignored substrate-data subdirs of `.neo-ai-data/` (sqlite, chroma, wake-daemon, etc.) so
 * Memory Core, knowledge-base, and bridge-daemon state is unified across worktree
 * MCP server processes — while leaving the git-tracked `concepts/` subdir untouched.
 *
 * **Background (config copy):** `ai/config.mjs` is the Tier-1 operator overlay.
 * `ai/mcp/server/{github-workflow,knowledge-base,memory-core,neural-link}/config.mjs`
 * are gitignored per-server overlays. Fresh git worktrees under
 * `.claude/worktrees/<name>/` therefore cannot run any script that imports
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
 * **Symlinking gitignored SINGLE FILES:** Some cross-clone substrates live
 * outside `.neo-ai-data/` — most notably `resources/content/sandman_handoff.md`, the
 * Sandman strategic-priming handoff that `runSandman.mjs` writes only inside the
 * canonical clone. Without symlink mediation, the other trio members' clones can't read
 * the handoff at boot. The granular per-file primitive ({@link symlinkGitignoredFiles}
 * + {@link GITIGNORED_FILES_TO_LINK}) extends Cross-clone substrate unification to
 * single artifacts without exposing their tracked parent directories. Distinct from the
 * data-dir path because `resources/content/` is heavily git-tracked (issue files, PRs,
 * discussions) — only single gitignored files inside it qualify.
 *
 * **The gitignore boundary inside `.neo-ai-data/` is load-bearing:**
 *
 * ```
 * .neo-ai-data
 * !.neo-ai-data/concepts/
 * ```
 *
 * Everything inside `.neo-ai-data/` is gitignored EXCEPT `concepts/` which IS git-tracked.
 * Symlinking the parent `.neo-ai-data/` directory atomically (the retired parent-level behavior)
 * hides the worktree's tracked `concepts/` files behind canonical's view; using `--force`
 * clobbers them entirely. Both outcomes break the worktree-local concepts substrate.
 *
 * The granular fix: symlink each gitignored substrate-data subdir individually
 * via the `DATA_SUBDIRS_TO_LINK` allowlist. `concepts/` is never in the allowlist → never
 * touched. This unifies the Memory Core substrate ({@link symlinkDataDir}) so AgentIdentity
 * nodes seeded once are visible to every worktree's MCP server, A2A mailbox handoffs span
 * harnesses, AND the wake daemon's PID-lock singleton plus persistent log
 * span worktrees too — without the tracked `concepts/` clobber risk that
 * empirically broke most active worktrees during cross-process coherence diagnosis.
 *
 * **Usage:**
 * ```
 * node ai/scripts/migrations/bootstrapWorktree.mjs              # copy configs + run build-all
 * node ai/scripts/migrations/bootstrapWorktree.mjs --link-data  # copy configs + symlink data subdirs + gitignored handoff files + run build-all
 * node ai/scripts/migrations/bootstrapWorktree.mjs --link-data --force
 *                                                    # clobber any existing real
 *                                                    # gitignored subdir (data-loss guard
 *                                                    # opt-in; never touches concepts/)
 * node ai/scripts/migrations/bootstrapWorktree.mjs --link-data --canonical-root /path/to/canonical
 *                                                    # independent-clone topology: explicit
 *                                                    # canonical-root override
 * node ai/scripts/migrations/bootstrapWorktree.mjs --prune-stale
 *                                                    # dry-run stale .claude/worktrees cleanup
 * node ai/scripts/migrations/bootstrapWorktree.mjs --prune-stale --apply
 *                                                    # remove prunable worktrees via git
 * node ai/scripts/migrations/bootstrapWorktree.mjs --prune-stale --apply --force-dirty
 *                                                    # also force-remove dirty-but-stale worktrees
 * ```
 *
 * Also supports the `NEO_AI_CANONICAL_ROOT` env var as a fallback for the `--canonical-root`
 * flag, useful for CI / shell aliases.
 *
 * **Topology support:**
 * - **Git worktrees:** canonical is resolved automatically
 *   via `git worktree list --porcelain`.
 * - **Independent clones:** a separate clone (e.g., an Antigravity-side clone
 *   that mirrors the canonical github-side clone) is NOT a git worktree, so `git worktree
 *   list` returns the clone itself. Pass `--canonical-root <path>` (or set
 *   `NEO_AI_CANONICAL_ROOT`) to point at the canonical sibling explicitly. Same per-subdir
 *   symlink semantics + `concepts/` protection apply.
 *
 * Idempotent: files that already exist are skipped; subdirs already symlinked report
 * `'already-linked'`. Refuses to run from the main checkout itself (no-op when worktree
 * root === resolved canonical root). Copied per-server configs are materialized through
 * {@link materializeServerConfigTemplate}, so stale canonical overlays that still import
 * `../../../config.template.mjs` point at the worktree-local `../../../config.mjs` instead.
 *
 * @see AGENTS_STARTUP.md
 * @see .gitignore
 * @see {@link materializeServerConfigTemplate}
 */
import {execFile}       from 'child_process';
import fs               from 'fs/promises';
import path             from 'path';
import {fileURLToPath}  from 'url';
import {promisify}      from 'util';

import {materializeServerConfigTemplate} from '../setup/initServerConfigs.mjs';

const execFileAsync = promisify(execFile);

export const BOOTSTRAP_CONFIGS = [
    'ai/config.mjs',
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
    'wake-daemon',  // PID-lock + bridge.log + lastSyncId shared across worktrees
    'backups',      // JSONL backups (Memory Core message + node history)
    'datasets',     // Canonical CSVs ingested by knowledge-base sync
    'neo-sqlite'    // Legacy DB (still referenced by older code paths)
];

/**
 * Allowlist of gitignored single files (outside `.neo-ai-data/`) to symlink to canonical
 * when `--link-data` is set. Initial member is the Sandman strategic-priming handoff,
 * which `runSandman.mjs` writes only inside the canonical clone. Without symlink mediation,
 * Antigravity-Gemini and Codex-GPT clones don't see the handoff at boot per
 * `AGENTS_STARTUP.md §6` step 4.
 *
 * **Allowlist discipline (parallel to `DATA_SUBDIRS_TO_LINK`):**
 *
 * Each entry MUST be:
 * 1. **Gitignored** — single file with its own `.gitignore` line. Symlinking a tracked file
 *    would create cross-clone divergence between git's view and the symlink target.
 * 2. **Canonical-only-write** — produced exclusively in the canonical clone (e.g., by an
 *    operator-side script like `runSandman.mjs`). Files written by all clones simultaneously
 *    would race on the symlink target.
 * 3. **Cross-clone-readable** — consumed at boot or runtime by all trio members; the entire
 *    rationale for the symlink is removing the cross-clone visibility asymmetry.
 *
 * Entries that fail any of those conditions belong elsewhere: tracked files need no symlink,
 * locally-written files would corrupt canonical, and clone-private files have no consumer.
 *
 * @see https://github.com/neomjs/neo/issues/10591 (this allowlist's introduction)
 * @see {@link symlinkGitignoredFiles} for the per-file symlink-or-skip-or-warn logic.
 */
export const GITIGNORED_FILES_TO_LINK = [
    'resources/content/sandman_handoff.md'  // Sandman strategic-priming handoff
];

export const DEFAULT_CLAUDE_WORKTREES_ROOT = path.join('.claude', 'worktrees');

export const PRUNABLE_WORKTREE_STATUSES = new Set([
    'prunable-merged',
    'prunable-deleted'
]);

/**
 * @summary Resolves the canonical "main checkout" path for a given project root.
 *
 * Two resolution paths, in priority order:
 *
 * 1. **Explicit override** — when an `explicitRoot` is supplied (typically
 *    via the `--canonical-root` CLI flag or `NEO_AI_CANONICAL_ROOT` env var), use it
 *    directly. Required for **independent clone** topologies (e.g., a separate
 *    `antigravity/neomjs/neo` clone that mirrors the canonical `github/neomjs/neo`
 *    clone — not a git worktree, so `git worktree list` returns the clone itself
 *    rather than the canonical sibling).
 *
 * 2. **Git worktree resolution** — `git worktree list
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
 * @summary Resolves the repo root from this CLI module's directory.
 *
 * The script lives at `ai/scripts/migrations/bootstrapWorktree.mjs` — three levels below the
 * repo root (`migrations/` → `scripts/` → `ai/` → root). Extracted + exported so the CLI
 * `projectRoot` computation is unit-testable: the `isMain` block itself is not exercised by
 * the spec, which is how the prior 2-level `'..', '..'` miss (→ `<root>/ai`, copying configs
 * into `<root>/ai/ai/`) escaped coverage.
 *
 * @param {string} moduleDir Absolute directory of this module (the CLI `__dirname`).
 * @returns {string} Absolute repo root.
 */
export function resolveCliProjectRoot(moduleDir) {
    return path.resolve(moduleDir, '..', '..', '..');
}

/**
 * @summary Copies missing config.mjs files from the main checkout into the target project root.
 * Per-server configs are materialized after copy so their Tier-1 import points at the
 * copied operator overlay (`ai/config.mjs`) instead of `ai/config.template.mjs`.
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
        if (isPerServerConfig(rel)) {
            const copiedSrc = await fs.readFile(dst, 'utf-8');
            await fs.writeFile(dst, materializeServerConfigTemplate(copiedSrc), 'utf-8');
        }
        result.copied.push(rel);
        log(`copied: ${rel}`);
    }

    return result;
}

function isPerServerConfig(rel) {
    return rel.startsWith('ai/mcp/server/') && rel.endsWith('/config.mjs');
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
 * **Why granular per-subdir, not parent-level:**
 *
 * The `.gitignore` boundary inside `.neo-ai-data/` is `.neo-ai-data` (gitignored) plus
 * `!.neo-ai-data/concepts/` (tracked exception). Symlinking the parent atomically (the
 * retired parent-level behavior) hides the worktree's tracked `concepts/` files behind canonical's
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
 * The `wake-daemon/` subdir is critical for PID-lock singleton enforcement to
 * span worktrees — without symlinking, each worktree has its own `bridge-daemon.pid` and
 * daemons spawned from different worktrees can't see each other's locks. Same logic for
 * the persistent `bridge.log` substrate.
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
 * @summary Granularly symlinks gitignored single files (outside `.neo-ai-data/`) to
 * canonical, unifying cross-clone-readable handoff substrates without exposing the entire
 * tracked parent directory.
 *
 * **Why per-file, not per-parent (Cross-clone substrate unification):**
 *
 * The handoff substrate (initial member: `resources/content/sandman_handoff.md`) lives
 * inside a heavily git-tracked parent — `resources/content/` holds issue files, PR
 * conversations, discussion threads, and release notes that all three trio members
 * generate independently. Symlinking the parent atomically would hide every clone's
 * locally-tracked contributions behind canonical's view (the same parent-symlink anti-pattern
 * fixed for `.neo-ai-data/` parent symlinks before the per-subdir refinement). The
 * gitignore boundary is single-file granular, so the symlink primitive must be too.
 *
 * **Why this is the right substrate (Anchor & Echo on Cross-clone substrate unification):**
 *
 * The companion `symlinkDataDir` function unifies gitignored substrate-data subdirs of
 * `.neo-ai-data/` (Memory Core SQLite, Chroma vectors, wake-daemon PID-lock, etc.) so
 * cross-process state coheres across worktree-spawned MCP server instances. This
 * function extends the same Cross-clone substrate unification pattern to single
 * gitignored artifacts that live outside `.neo-ai-data/` — same canonical-only-write
 * + cross-clone-read semantic, narrower data shape (one file per allowlist entry rather
 * than a tree of state).
 *
 * The `sandman_handoff.md` artifact is the canonical example: `runSandman.mjs` writes
 * it inside the canonical clone only, but every trio member must read it at boot
 * (`AGENTS_STARTUP.md §6` step 4). Without this symlink, only the operator running
 * `runSandman.mjs` sees the strategic priming; Antigravity-Gemini and Codex-GPT clones
 * read empty / nonexistent state — cross-clone strategic divergence.
 *
 * **No `force` clobber semantic on single files:**
 *
 * For data dirs, `--force` is justified for corruption recovery (the dir's contents are
 * fungible substrate that can be regenerated). For a single artifact file, the user's
 * local state may be intentional (e.g., a saved prior handoff worth preserving across
 * canonical's overwrite). Conservative skip-with-warning is the safer default. Users
 * who want the symlink can manually `rm` the local file before re-running.
 *
 * Idempotent per-file by design: an existing symlink reports `'already-linked'`; a
 * missing canonical source reports `'skipped-no-source'` (graceful for fresh repos that
 * haven't run Sandman yet); a real file at the destination reports `'skipped-real-file'`
 * with a warning pointing at the manual remediation path.
 *
 * @param {object}   options
 * @param {string}   options.mainCheckout     Absolute path to the primary git checkout.
 * @param {string}   options.projectRoot      Absolute path to the worktree root to link from.
 * @param {string[]} [options.files]          Allowlist of files to symlink; defaults to {@link GITIGNORED_FILES_TO_LINK}.
 * @param {Function} [options.log=console.log] Logger fn for action diagnostics.
 * @returns {Promise<{linked: string[], alreadyLinked: string[], skippedNoSource: string[], skippedRealFile: string[], mainCheckout: boolean}>} Per-file action map.
 */
export async function symlinkGitignoredFiles({
    mainCheckout,
    projectRoot,
    files = GITIGNORED_FILES_TO_LINK,
    log   = console.log
}) {
    const result = {linked: [], alreadyLinked: [], skippedNoSource: [], skippedRealFile: [], mainCheckout: false};

    if (path.resolve(projectRoot) === path.resolve(mainCheckout)) {
        log(`file-symlink skip (main checkout): no per-file action`);
        result.mainCheckout = true;
        return result;
    }

    for (const rel of files) {
        const src   = path.join(mainCheckout, rel);
        const dst   = path.join(projectRoot, rel);
        const lstat = await fs.lstat(dst).catch(() => null);

        if (lstat?.isSymbolicLink()) {
            log(`file-symlink skip (already linked): ${rel}`);
            result.alreadyLinked.push(rel);
            continue;
        }

        // Skip if canonical lacks the file — graceful for the pre-Sandman-run state.
        const srcExists = await exists(src);
        if (!srcExists) {
            log(`file-symlink skip (no source in main checkout): ${rel}`);
            result.skippedNoSource.push(rel);
            continue;
        }

        if (lstat) {
            // Real file present — preserve local state, surface warning.
            log(`file-symlink skip (real file present, preserving local state): ${rel}`);
            log(`  → manually remove the local file and re-run --link-data to override`);
            result.skippedRealFile.push(rel);
            continue;
        }

        // Ensure parent dir exists; resources/content/ is normally tracked + present, but
        // belt-and-suspenders for fresh repos or future allowlist entries in absent dirs.
        await fs.mkdir(path.dirname(dst), {recursive: true});

        await fs.symlink(src, dst, 'file');
        log(`file-symlinked: ${rel} → ${src}`);
        result.linked.push(rel);
    }

    return result;
}

/**
 * @summary Installs the worktree's `node_modules` and bundles the parse5 test prerequisite.
 *
 * Worktrees off `origin/dev` start without `node_modules` (gitignored) AND without
 * `dist/parse5.mjs` (gitignored test-runner prerequisite). Both are needed to run the
 * Playwright unit-test suite or any SDK-consuming script.
 *
 * Idempotent: skips `npm install` when `node_modules/` is already present (e.g.,
 * symlinked from main, or manual `npm i`). Always runs `npm run bundle-parse5`
 * because the bundle output lives under `dist/` (gitignored) and is cheap to rebuild.
 *
 * Cost anchor: ~17s for `npm install` on a populated local cache (808 packages). `bundle-parse5`
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
 * Implies {@link installDependencies}. Default behavior for fresh worktrees.
 *
 * **Scope Decision:** Rather than generating only `parse5` minimally, the default bootstrap
 * runs full `build-all` to ensure *all*
 * distributions (ESM, themes, workers, highlight, parse5) are ready. It resolves "Cannot find
 * module dist/parse5.mjs" friction for test suites in <30s on M-series hardware.
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

/**
 * @summary Parses `git worktree list --porcelain` into stable worktree records.
 *
 * @param {string} output Raw porcelain output from git.
 * @returns {{path: string, head: string|null, branchRef: string|null, branch: string|null, detached: boolean}[]}
 */
export function parseWorktreePorcelain(output) {
    const records = [];
    let current   = null;

    for (const line of output.split(/\r?\n/)) {
        if (!line.trim()) {
            if (current) {
                records.push(current);
                current = null;
            }
            continue;
        }

        const [key, ...rest] = line.split(' ');
        const value          = rest.join(' ');

        if (key === 'worktree') {
            if (current) records.push(current);
            current = {
                path     : value,
                head     : null,
                branchRef: null,
                branch   : null,
                detached : false
            };
            continue;
        }

        if (!current) continue;

        if (key === 'HEAD') {
            current.head = value;
        } else if (key === 'branch') {
            current.branchRef = value;
            current.branch    = value.startsWith('refs/heads/') ? value.slice('refs/heads/'.length) : value;
        } else if (key === 'detached') {
            current.detached = true;
        }
    }

    if (current) records.push(current);

    return records;
}

/**
 * @summary Lists git worktrees below the Claude Code worktree root.
 *
 * The cleanup mode is scoped deliberately to `.claude/worktrees/`; shared-checkout
 * harnesses such as Codex and Antigravity do not create this disk-growth pattern.
 *
 * @param {object}   options
 * @param {string}   options.projectRoot Absolute primary checkout path.
 * @param {string}   [options.worktreesRoot] Relative or absolute worktree parent.
 * @param {Function} [options.exec] Dependency-injected execFile wrapper.
 * @returns {Promise<object[]>}
 */
export async function listClaudeWorktrees({
    projectRoot,
    worktreesRoot = DEFAULT_CLAUDE_WORKTREES_ROOT,
    exec          = execFileAsync
}) {
    const {stdout} = await exec('git', ['worktree', 'list', '--porcelain'], {cwd: projectRoot});
    const rootPath = path.isAbsolute(worktreesRoot)
        ? path.resolve(worktreesRoot)
        : path.resolve(projectRoot, worktreesRoot);

    return parseWorktreePorcelain(stdout).filter(record => isPathInside(rootPath, record.path));
}

/**
 * @summary Classifies one Claude Code worktree for dry-run or removal.
 *
 * Safety is biased toward preservation: dirty worktrees, branches with open PRs,
 * branches with unmerged commits, and branches whose PR status cannot be verified
 * are classified as non-prunable.
 *
 * @param {object}   options
 * @param {object}   options.worktree Parsed worktree record.
 * @param {string}   options.projectRoot Primary checkout path used for repo-wide git queries.
 * @param {string}   [options.baseRef='dev'] Base branch to compare against.
 * @param {Function} [options.exec] Dependency-injected execFile wrapper.
 * @param {Function} [options.getSize] Optional size resolver.
 * @returns {Promise<object>}
 */
export async function classifyWorktree({
    worktree,
    projectRoot,
    baseRef = 'dev',
    exec    = execFileAsync,
    getSize = getPathSizeBytes
}) {
    const sizeBytes = await getSize(worktree.path, {exec});
    const dirty     = await isWorktreeDirty(worktree.path, exec);
    const base      = {
        ...worktree,
        sizeBytes,
        dirty,
        prunable       : false,
        forcePrunable  : false,
        removeArgs     : ['worktree', 'remove', worktree.path],
        status         : 'active',
        reason         : ''
    };

    const branchExists = worktree.branch
        ? await refExists(projectRoot, `refs/heads/${worktree.branch}`, exec)
        : false;

    const prState = worktree.branch ? await getPullRequestState(projectRoot, worktree.branch, exec) : null;
    const merged = await isMergedToBase({projectRoot, worktree, baseRef, branchExists, exec});
    const prStateBlocksRemoval = prState === 'OPEN' || prState === 'unknown';

    if (dirty) {
        return {
            ...base,
            status       : 'dirty',
            reason       : merged || !branchExists ? 'dirty-but-otherwise-prunable' : 'dirty-active-or-unmerged',
            forcePrunable: !prStateBlocksRemoval && (merged || !branchExists),
            removeArgs   : ['worktree', 'remove', '--force', worktree.path]
        };
    }

    if (prState === 'OPEN') {
        return {
            ...base,
            status: 'active',
            reason: `branch ${worktree.branch} has an open PR`
        };
    }

    if (prState === 'unknown') {
        return {
            ...base,
            status: 'active',
            reason: `branch ${worktree.branch} PR status could not be verified`
        };
    }

    if (worktree.branch && !branchExists) {
        return {
            ...base,
            prunable: true,
            status  : 'prunable-deleted',
            reason  : `branch ${worktree.branch} no longer exists`
        };
    }

    if (merged) {
        return {
            ...base,
            prunable: true,
            status  : 'prunable-merged',
            reason  : worktree.branch
                ? `branch ${worktree.branch} is merged or patch-equivalent to ${baseRef}`
                : `detached HEAD ${worktree.head} is an ancestor of ${baseRef}`
        };
    }

    return {
        ...base,
        status: 'active',
        reason: worktree.branch
            ? `branch ${worktree.branch} has commits not merged into ${baseRef}`
            : `detached HEAD ${worktree.head || 'unknown'} is not known merged into ${baseRef}`
    };
}

/**
 * @summary Dry-runs or applies stale Claude Code worktree pruning.
 *
 * Default mode never mutates. `apply=true` removes only clean worktrees classified
 * as prunable. Dirty worktrees remain preserved unless `forceDirty=true` is also
 * provided and the dirty worktree is otherwise prunable.
 *
 * @param {object}   options
 * @param {string}   options.projectRoot Primary checkout path.
 * @param {boolean}  [options.apply=false] Whether to remove prunable worktrees.
 * @param {boolean}  [options.forceDirty=false] Whether dirty-but-prunable worktrees may be force-removed.
 * @param {string}   [options.baseRef='dev'] Base branch to compare against.
 * @param {string}   [options.worktreesRoot] Worktree parent path.
 * @param {Function} [options.exec] Dependency-injected execFile wrapper.
 * @param {Function} [options.getSize] Optional size resolver.
 * @param {Function} [options.log] Logger fn for action diagnostics.
 * @returns {Promise<{worktrees: object[], removed: object[], skipped: object[], totalBytes: number, reclaimableBytes: number, reclaimedBytes: number}>}
 */
export async function pruneStaleWorktrees({
    projectRoot,
    apply         = false,
    forceDirty    = false,
    baseRef       = 'dev',
    worktreesRoot = DEFAULT_CLAUDE_WORKTREES_ROOT,
    exec          = execFileAsync,
    getSize       = getPathSizeBytes,
    log           = console.log
}) {
    const worktrees = await listClaudeWorktrees({projectRoot, worktreesRoot, exec});
    const classified = [];

    for (const worktree of worktrees) {
        classified.push(await classifyWorktree({worktree, projectRoot, baseRef, exec, getSize}));
    }

    const removable = classified.filter(item => item.prunable || (forceDirty && item.forcePrunable));
    const skipped   = classified.filter(item => !removable.includes(item));
    const removed   = [];

    const totalBytes       = classified.reduce((sum, item) => sum + item.sizeBytes, 0);
    const reclaimableBytes = removable.reduce((sum, item) => sum + item.sizeBytes, 0);

    log(`Claude worktree prune ${apply ? 'apply' : 'dry-run'} against ${baseRef}`);
    log(`Found ${classified.length} worktree(s), ${formatBytes(totalBytes)} total, ${formatBytes(reclaimableBytes)} reclaimable.`);

    for (const item of classified) {
        const marker = removable.includes(item) ? (apply ? 'remove' : 'would-remove') : 'keep';
        log(`${marker}: ${item.status} ${formatBytes(item.sizeBytes)} ${item.path}`);
        log(`  ${item.reason}`);
    }

    if (apply) {
        for (const item of removable) {
            await exec('git', item.removeArgs, {cwd: projectRoot});
            removed.push(item);
        }
        log(`Removed ${removed.length} worktree(s), reclaimed up to ${formatBytes(reclaimableBytes)}.`);
    } else {
        log(`Dry-run only. Re-run with --apply to remove prunable worktrees.`);
    }

    return {
        worktrees      : classified,
        removed,
        skipped,
        totalBytes,
        reclaimableBytes,
        reclaimedBytes: apply ? reclaimableBytes : 0
    };
}

async function getPathSizeBytes(targetPath, {exec = execFileAsync} = {}) {
    try {
        const {stdout} = await exec('du', ['-sk', targetPath]);
        const kb       = Number.parseInt(stdout.trim().split(/\s+/)[0], 10);
        return Number.isFinite(kb) ? kb * 1024 : 0;
    } catch {
        return 0;
    }
}

async function isWorktreeDirty(worktreePath, exec) {
    const {stdout} = await exec('git', ['status', '--porcelain'], {cwd: worktreePath});
    return stdout.trim().length > 0;
}

async function refExists(projectRoot, ref, exec) {
    try {
        await exec('git', ['show-ref', '--verify', '--quiet', ref], {cwd: projectRoot});
        return true;
    } catch {
        return false;
    }
}

async function isMergedToBase({projectRoot, worktree, baseRef, branchExists, exec}) {
    if (worktree.head) {
        try {
            await exec('git', ['merge-base', '--is-ancestor', worktree.head, baseRef], {cwd: projectRoot});
            return true;
        } catch {}
    }

    if (!worktree.branch || !branchExists) {
        return false;
    }

    const {stdout: mergedBranches} = await exec('git', ['branch', '--merged', baseRef, '--format=%(refname:short)'], {cwd: projectRoot});
    if (mergedBranches.split(/\r?\n/).map(line => line.trim()).includes(worktree.branch)) {
        return true;
    }

    try {
        const {stdout: cherry} = await exec('git', ['cherry', baseRef, worktree.branch], {cwd: projectRoot});
        const lines = cherry.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        return lines.length > 0 && lines.every(line => line.startsWith('-'));
    } catch {
        return false;
    }
}

async function getPullRequestState(projectRoot, branch, exec) {
    try {
        const {stdout} = await exec('gh', ['pr', 'view', branch, '--json', 'state', '--jq', '.state'], {cwd: projectRoot});
        const state    = stdout.trim();
        return state || null;
    } catch (e) {
        const stderr = String(e.stderr || e.message || '');
        if (/no pull requests found|not found|could not resolve to a PullRequest/i.test(stderr)) {
            return null;
        }
        return 'unknown';
    }
}

function isPathInside(rootPath, candidatePath) {
    const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
    return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value   = bytes;
    let unitIdx = 0;

    while (value >= 1024 && unitIdx < units.length - 1) {
        value /= 1024;
        unitIdx++;
    }

    return `${value.toFixed(unitIdx === 0 ? 0 : 1)}${units[unitIdx]}`;
}

// -------------------------------------------------------------------------------------
// CLI entry point. Runs only when invoked directly (node ai/scripts/migrations/bootstrapWorktree.mjs)
// and not when imported by a test spec.
// -------------------------------------------------------------------------------------

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
    const __filename  = fileURLToPath(import.meta.url);
    const __dirname   = path.dirname(__filename);
    const projectRoot = resolveCliProjectRoot(__dirname); // ai/scripts/migrations/ → scripts/ → ai/ → root

    const argv     = process.argv.slice(2);
    const args     = new Set(argv);
    const linkData = args.has('--link-data');
    const force    = args.has('--force');
    const pruneStale = args.has('--prune-stale') || argv.includes('--mode=prune-stale') ||
        (argv.includes('--mode') && argv[argv.indexOf('--mode') + 1] === 'prune-stale');
    const apply      = args.has('--apply');
    const forceDirty = args.has('--force-dirty');

    // `--canonical-root <path>` flag wins; `NEO_AI_CANONICAL_ROOT` env var is the fallback.
    // Both are no-ops when running in an actual git worktree (the existing
    // git-worktree-list resolution path is the natural primary). They activate the
    // independent-clone topology where canonical lives in a sibling
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

        if (pruneStale) {
            await pruneStaleWorktrees({projectRoot: mainCheckout, apply, forceDirty});
            process.exit(0);
        }

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

            // Cross-clone single-file symlinks. Same --link-data flag, narrower
            // shape: each entry in GITIGNORED_FILES_TO_LINK is a single artifact rather
            // than a tree of state. Currently sandman_handoff.md only.
            const fileResult = await symlinkGitignoredFiles({mainCheckout, projectRoot});
            if (fileResult.mainCheckout) {
                console.log(`✓ File symlink: skipped (running in main checkout)`);
            } else {
                const fLinkedN          = fileResult.linked.length;
                const fAlreadyLinkedN   = fileResult.alreadyLinked.length;
                const fSkippedNoSourceN = fileResult.skippedNoSource.length;
                const fSkippedRealFileN = fileResult.skippedRealFile.length;
                console.log(
                    `✓ File symlink: ${fLinkedN} linked, ${fAlreadyLinkedN} already-linked, ` +
                    `${fSkippedNoSourceN} skipped-no-source, ${fSkippedRealFileN} skipped-real-file`
                );
                if (fLinkedN          > 0) console.log(`  linked:           ${fileResult.linked.join(', ')}`);
                if (fAlreadyLinkedN   > 0) console.log(`  already-linked:   ${fileResult.alreadyLinked.join(', ')}`);
                if (fSkippedNoSourceN > 0) console.log(`  skipped-no-src:   ${fileResult.skippedNoSource.join(', ')}`);
                if (fSkippedRealFileN > 0) console.log(`  skipped-real-file: ${fileResult.skippedRealFile.join(', ')}`);
            }
        }

        // Default behavior: run build-all after config/data linking
        const buildResult = await runBuildAll({projectRoot});
        console.log(`✓ Build: ${buildResult}`);
    } catch (e) {
        console.error('Bootstrap failed:', e.message);
        process.exit(1);
    }
}
