/**
 * @summary Copies gitignored `ai/config.mjs` plus per-server config overlays from
 * the main git checkout into the current git worktree, and optionally symlinks the
 * gitignored substrate-data subdirs of `.neo-ai-data/` (sqlite, chroma, wake-daemon, etc.) so
 * Memory Core, knowledge-base, and bridge-daemon state is unified across worktree
 * MCP server processes — while leaving the git-tracked `concepts/` subdir untouched.
 *
 * It also materializes the worktree's `.claude/settings.json` (the no-hold Stop hook) from the
 * tracked `.claude/settings.template.json` via `initClaudeSettings` — the Claude analog of the
 * config-overlay hydration, so the hook is wired in worktrees deterministically rather than
 * relying on the `npm prepare` that `installDependencies` skips when `node_modules` already exists.
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
 * The fix: symlink every gitignored child of `.neo-ai-data/`, EXCEPT the
 * {@link DATA_SUBDIRS_BLOCKLIST} entries (`concepts/` + the per-process daemon-pid dirs) → never touched. Excluding a blocklist
 * (vs. an allowlist of names) unifies any new substrate child automatically.
 * This unifies the Memory Core substrate ({@link symlinkDataDir}) so AgentIdentity
 * nodes seeded once are visible to every worktree's MCP server, A2A mailbox handoffs span
 * harnesses, AND the wake daemon's PID-lock singleton plus persistent log
 * span worktrees too — without the tracked `concepts/` clobber risk that
 * empirically broke most active worktrees during cross-process coherence diagnosis.
 * Blocklisted process-control dirs that still need operator diagnostics expose
 * a separate canonical read alias via {@link symlinkCanonicalDataReadAliases};
 * the daemon-owned live path stays clone-local.
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
 *                                                    # remove clean non-current .claude/worktrees
 *                                                    # checkouts via git, then hydrate current
 * node ai/scripts/migrations/bootstrapWorktree.mjs --prune-stale --dry-run
 * node ai/scripts/migrations/bootstrapWorktree.mjs --reconcile [--json]  # read-only plane + port report for THIS seat
 * node ai/scripts/migrations/bootstrapWorktree.mjs --reconcile --seat <path> --seat <path>  # ...for named seats
 * node ai/scripts/migrations/bootstrapWorktree.mjs --link-data --dry-run  # same read-only path, obvious spelling
 *                                                    # report the same keep/remove plan
 *                                                    # without mutating disk
 * node ai/scripts/migrations/bootstrapWorktree.mjs --prune-stale --include-dirty
 *                                                    # also remove dirty non-current checkouts
 * node ai/scripts/migrations/bootstrapWorktree.mjs --prune-stale --schedule-local --include-dirty --interval-ms 21600000
 *                                                    # local operator scheduler (6h example);
 *                                                    # force-removes all non-current worktrees
 *                                                    # on every tick; intentionally not an
 *                                                    # orchestrator/cloud lane
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
 * @plane host
 */
import {execFile}      from 'child_process';
import fs              from 'fs/promises';
import path            from 'path';
import {fileURLToPath} from 'url';
import {promisify}     from 'util';

import {IDENTITIES}                                                                    from '../../graph/identityRoots.mjs';
import {initClaudeSettings, listServersWithTemplates, materializeServerConfigTemplate} from '../setup/initServerConfigs.mjs';

const execFileAsync = promisify(execFile);

/**
 * The set of gitignored config overlays a fresh worktree must hydrate from the main
 * checkout: the Tier-1 `ai/config.mjs` plus each per-server `ai/mcp/server/<name>/config.mjs`.
 *
 * **Auto-derived from one shared predicate.** The per-server list comes from
 * {@link listServersWithTemplates} — the single enumeration owned by `initServerConfigs`, the
 * same predicate `initConfigs` applies. A hand-maintained allow-list silently drifted whenever a
 * new MCP server was added (its gitignored `config.mjs` went un-hydrated → a worktree importing
 * that server's chain crashed with `ERR_MODULE_NOT_FOUND`). Deriving from one shared predicate
 * means a new template-shipping server is hydrated automatically AND the two call-sites cannot
 * disagree; dirs without a template (e.g. `file-system`, `shared`) are excluded.
 */
export const BOOTSTRAP_CONFIGS = [
    'ai/config.mjs',
    ...listServersWithTemplates().map(name => `ai/mcp/server/${name}/config.mjs`)
];

/**
 * Blocklist of live `.neo-ai-data/` children that must NEVER be symlinked to canonical.
 *
 * **Blocklist, not allowlist.** The retired `DATA_SUBDIRS_TO_LINK` allowlist enumerated exactly
 * which subdirs to link — and silently drifted: `memory-wal` was never added, so every
 * non-canonical clone wrote its `add_memory` WAL to its own un-drained dir, orphaning thousands
 * of records across clones for ~8 days. {@link symlinkDataDir} now links EVERY child of
 * canonical's `.neo-ai-data/` EXCEPT the live entries here and the separately-owned canonical
 * read-alias names, so a newly-introduced substrate child is unified automatically without two
 * hydration primitives fighting over one alias path.
 *
 * Two kinds of entry:
 * 1. **`concepts/`** — the ONLY git-tracked item inside `.neo-ai-data/` (`.gitignore`:
 *    `.neo-ai-data` then `!.neo-ai-data/concepts/`). Symlinking it would hide the worktree's own
 *    tracked files behind canonical's view; `--force` would clobber them.
 * 2. **Per-process daemon-pid dirs** (`orchestrator-daemon/`, `embed-daemon/`) — they hold the
 *    orchestrator parent-pid (the SIGTERM-singleton) + the embed-daemon pid, so a shared pid dir
 *    would let the orchestrator-singleton race / cross-signal across clones. Contrast
 *    `wake-daemon/` (a DESIGNED cross-clone singleton that DOES share) and `memory-wal/` (shares
 *    its records + markers + `.drain-lock` for cross-clone sole-drainer enforcement).
 *
 * @see {@link symlinkDataDir} for the per-item symlink-or-skip-or-clobber logic.
 */
export const DATA_SUBDIRS_BLOCKLIST = ['concepts', 'orchestrator-daemon', 'embed-daemon'];

/**
 * Read aliases for blocklisted data subdirs whose canonical state is useful to
 * operators and diagnostics, but whose live path must stay clone-local.
 *
 * `orchestrator-daemon/` contains the daemon PID file plus task-state/log
 * outputs. Symlinking that exact child name across clones would let a secondary
 * checkout participate in the canonical singleton's process-control directory.
 * The alias gives humans and read-only tools a stable canonical inspection path
 * without changing the daemon's default write target.
 */
export const CANONICAL_DATA_READ_ALIASES = [
    {source: 'orchestrator-daemon', alias: 'orchestrator-daemon-canonical'}
];

// A read alias is safe only when the live source name stays clone-local. Keep that cross-registry
// invariant executable: adding an alias without blocklisting its source would let symlinkDataDir()
// mount the canonical live path first, then expose the same state again under the read alias.
for (const {source, alias} of CANONICAL_DATA_READ_ALIASES) {
    if (!DATA_SUBDIRS_BLOCKLIST.includes(source)) {
        throw new Error(
            `bootstrapWorktree: canonical data read alias '${alias}' requires source '${source}' ` +
            'to remain in DATA_SUBDIRS_BLOCKLIST.'
        );
    }
}

/**
 * Allowlist of gitignored single files (outside `.neo-ai-data/`) to symlink to canonical
 * when `--link-data` is set. Initial member is the Sandman strategic-priming handoff,
 * which `runSandman.mjs` writes only inside the canonical clone. Without symlink mediation,
 * Antigravity-Gemini and Codex-GPT clones don't see the handoff at boot per
 * `AGENTS_STARTUP.md §6` step 4.
 *
 * **Allowlist discipline (curated — `.neo-ai-data/` uses the inverse {@link DATA_SUBDIRS_BLOCKLIST}):**
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

/**
 * @summary Reports whether a freshly bootstrapped worktree would author commits as the operator.
 *
 * A worktree that sets no local `user.email` resolves git's global one — the operator's. Every commit
 * it produces is then attributed to the human, and nothing says so: `git log --oneline` omits the
 * author, the commit succeeds, and the PR renders normally. One agent shift reached 38 such commits
 * across 7 branches before a peer noticed while reading a PR's commit metadata.
 *
 * The standard CLI bootstrap first binds the authenticated resident through
 * `configureAgentGitIdentity()`, then calls this inspector after the build as an independent
 * effective-config verification. The exported inspector remains side-effect-free so migration
 * diagnostics and the pre-push backstop can reason about legacy or partially bootstrapped seats
 * without changing them.
 *
 * @param {Object} options
 * @param {String} options.projectRoot The bootstrapped worktree.
 * @param {Function} [options.readConfig] `(args) => String` — injected for tests; reads a git config value.
 * @returns {Promise<{inherited: Boolean, local: String, global: String}>}
 */
export async function inspectGitIdentity({projectRoot, readConfig}) {
    const read = readConfig || (async args => {
        try {
            const {stdout} = await execFileAsync('git', args, {cwd: projectRoot});
            return stdout.trim()
        } catch {
            return ''
        }
    });

    const
        globalEmail   = (await read(['config', '--global', 'user.email'])).toLowerCase(),
        worktreeEmail = (await read(['config', '--worktree', 'user.email'])).toLowerCase(),
        localEmail    = worktreeEmail || (await read(['config', '--local', 'user.email'])).toLowerCase(),
        effective     = (await read(['config', 'user.email'])).toLowerCase();

    return {
        // The leak is precisely "no local identity, so the global one answers". A worktree that set
        // its own identity is fine even if it happens to equal the global one — that was a choice.
        inherited: Boolean(globalEmail) && !localEmail && effective === globalEmail,
        local    : localEmail,
        global   : globalEmail
    }
}

/**
 * @summary Reads the active GitHub CLI account plus its email records without exposing credentials.
 *
 * `gh` owns the seat-auth resolution chain (`GH_TOKEN`, `GITHUB_TOKEN`, or its credential store).
 * Re-implementing that chain here would let bootstrap authenticate differently from every subsequent
 * GitHub operation in the same seat.
 *
 * @returns {Promise<{login: String, emails: Object[]}>} Authenticated account projection.
 * @private
 */
async function getAuthenticatedGitHubAccount() {
    try {
        const
            options              = {maxBuffer: 2 * 1024 * 1024},
            {stdout: userJson}   = await execFileAsync('gh', ['api', 'user'], options),
            {stdout: emailsJson} = await execFileAsync('gh', ['api', 'user/emails?per_page=100'], options);

        return {
            login : JSON.parse(userJson).login,
            emails: JSON.parse(emailsJson)
        }
    } catch (error) {
        throw new Error(
            `bootstrapWorktree: failed to resolve the active GitHub account (${error.message}).`,
            {cause: error}
        )
    }
}

/**
 * @summary Resolves one canonical Git author identity from roster intent plus authenticated account
 * truth.
 *
 * The roster owns the expected login and display name, but deliberately carries no email. The active
 * GitHub account owns the actual login plus verified primary email. Both authorities must agree
 * before Git config is touched; a guessed `<handle>@neomjs.com` address would misattribute residents
 * whose established commit email differs from their current handle.
 *
 * @param {Object}   options
 * @param {String}   options.agentIdentity          Canonical resident id from `NEO_AGENT_IDENTITY`.
 * @param {Function} options.getAuthenticatedAccount Async active-account reader.
 * @returns {Promise<{displayName: String, email: String, login: String}>} Verified author identity.
 * @private
 */
async function resolveAgentGitIdentity({agentIdentity, getAuthenticatedAccount}) {
    const rawIdentity = typeof agentIdentity === 'string' ? agentIdentity.trim() : '';

    if (!rawIdentity) {
        throw new Error('bootstrapWorktree: NEO_AGENT_IDENTITY is required outside the main checkout.')
    }

    const
        normalizedIdentity = `@${rawIdentity.replace(/^@/, '')}`.toLowerCase(),
        root               = IDENTITIES.find(candidate => {
            const
                id    = typeof candidate.id === 'string' ? candidate.id.toLowerCase() : '',
                login = typeof candidate.properties?.githubLogin === 'string'
                    ? candidate.properties.githubLogin.toLowerCase()
                    : '',
                isAgent = candidate.type === 'AgentIdentity' &&
                    candidate.properties?.accountType === 'agent';

            return isAgent && (id === normalizedIdentity || login === normalizedIdentity)
        });

    if (!root) {
        throw new Error(`bootstrapWorktree: agent identity '${normalizedIdentity}' is not a mapped agent resident.`)
    }

    const
        expectedLogin = typeof root.properties.githubLogin === 'string'
            ? root.properties.githubLogin.replace(/^@/, '')
            : '',
        displayName   = root.properties.displayName?.trim();

    if (!expectedLogin || !displayName) {
        throw new Error(`bootstrapWorktree: agent identity '${normalizedIdentity}' lacks login/display authority.`)
    }

    const account     = await getAuthenticatedAccount();
    const actualLogin = typeof account?.login === 'string' ? account.login.trim() : '';

    if (actualLogin.toLowerCase() !== expectedLogin.toLowerCase()) {
        throw new Error(
            `bootstrapWorktree: authenticated GitHub login '${actualLogin || '(missing)'}' does not match ` +
            `expected agent '${expectedLogin}'.`
        )
    }

    const verifiedPrimary = Array.isArray(account.emails)
        ? account.emails.filter(entry =>
            entry?.primary === true &&
            entry?.verified === true &&
            typeof entry.email === 'string' &&
            entry.email.trim()
        )
        : [];

    if (verifiedPrimary.length !== 1) {
        throw new Error(
            `bootstrapWorktree: GitHub account '${expectedLogin}' must expose exactly one verified primary email.`
        )
    }

    const email = verifiedPrimary[0].email.trim();

    if (/noreply/iu.test(email)) {
        throw new Error(`bootstrapWorktree: refusing noreply Git author email for '${expectedLogin}'.`)
    }

    return {displayName, email, login: expectedLogin}
}

/**
 * @summary Binds the authenticated resident's Git author identity at the checkout topology's
 * narrowest safe scope.
 *
 * Main-checkout invocation is a no-op: operator authorship is correct there. Linked worktrees enable
 * Git's worktree-config extension and write both values with `--worktree`, so sibling agents cannot
 * overwrite one another through the shared repository config. An explicit independent clone has no
 * shared worktree config and therefore receives clone-local values.
 *
 * All identity validation completes before the first Git call. Missing identity, account mismatch,
 * missing email scope, or a `noreply` address therefore cannot leave partial config behind.
 *
 * @param {Object}   options
 * @param {String}   options.projectRoot             Checkout being bootstrapped.
 * @param {String}   options.mainCheckout             Canonical checkout resolved by the CLI.
 * @param {String}  [options.agentIdentity]           Defaults to `NEO_AGENT_IDENTITY`.
 * @param {Function}[options.getAuthenticatedAccount] Injectable active-account reader.
 * @param {Function}[options.execGit]                 Injectable `(args) => {stdout}` Git seam.
 * @returns {Promise<Object>} Observable action plus configured scope and verified identity fields.
 */
export async function configureAgentGitIdentity({
    projectRoot,
    mainCheckout,
    agentIdentity = process.env.NEO_AGENT_IDENTITY,
    getAuthenticatedAccount: readAccount = getAuthenticatedGitHubAccount,
    execGit
} = {}) {
    if (!projectRoot || !mainCheckout) {
        throw new Error("bootstrapWorktree: 'projectRoot' and 'mainCheckout' are required for Git identity binding.")
    }

    if (path.resolve(projectRoot) === path.resolve(mainCheckout)) {
        return {action: 'skipped-main-checkout'}
    }

    const identity = await resolveAgentGitIdentity({
        agentIdentity,
        getAuthenticatedAccount: readAccount
    });
    const runGit = execGit || (args => execFileAsync('git', args, {cwd: projectRoot}));

    const
        {stdout: gitDirOutput}    = await runGit(['rev-parse', '--absolute-git-dir']),
        {stdout: commonDirOutput} = await runGit(['rev-parse', '--git-common-dir']);
    const [gitDir, commonDir] = await Promise.all([
        fs.realpath(path.resolve(projectRoot, gitDirOutput.trim())),
        fs.realpath(path.resolve(projectRoot, commonDirOutput.trim()))
    ]);
    const
        linkedWorktree = gitDir !== commonDir,
        scope          = linkedWorktree ? 'worktree' : 'local';

    if (linkedWorktree) {
        await runGit(['config', 'extensions.worktreeConfig', 'true']);
    }

    const scopeFlag = linkedWorktree ? '--worktree' : '--local';

    await runGit(['config', scopeFlag, 'user.name', identity.displayName]);
    await runGit(['config', scopeFlag, 'user.email', identity.email]);

    return {
        action: 'configured',
        scope,
        login : identity.login,
        name  : identity.displayName,
        email : identity.email
    }
}

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
 * This function symlinks every gitignored child of canonical's `.neo-ai-data/` EXCEPT the
 * `blocklist` (default: {@link DATA_SUBDIRS_BLOCKLIST}). `concepts/` is always blocklisted
 * → never touched, regardless of `--force`. The data-loss guard (refuse-clobber-without-
 * force) is preserved per-item, so a corrupted `sqlite/` can be reset without nuking
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
 * the persistent `.neo-ai-data/wake-daemon/bridge.log` substrate.
 *
 * Idempotent per-subdir by design: an existing symlink to the canonical source reports
 * `'already-linked'`; a symlink to any other checkout refuses rather than silently adopting
 * cross-resident state; a
 * missing canonical source reports `'skip-no-source'` (graceful for fresh repos that
 * haven't created the subdir yet); a non-symlink directory throws unless `force=true`.
 *
 * @param {object}   options
 * @param {string}   options.mainCheckout Absolute path to the primary git checkout.
 * @param {string}   options.projectRoot  Absolute path to the worktree root to link from.
 * @param {string[]} [options.blocklist]  Live child names to NEVER symlink; defaults to {@link DATA_SUBDIRS_BLOCKLIST}.
 *                                        Sources + names owned by {@link CANONICAL_DATA_READ_ALIASES}
 *                                        are always excluded from this generic pass and materialized
 *                                        separately, even when callers inject a narrower blocklist.
 * @param {boolean}  [options.force=false] If true, clobber an existing non-symlink dir/file at a non-blocklisted child (never touches blocklisted children).
 * @param {boolean}  [options.dryRun=false] Reconcile mode: classify every child WITHOUT mutating —
 *                                        no `mkdir`, no `rm`, no `symlink`. Divergences that would `throw` in the
 *                                        mutating path are recorded in `divergent` instead, so one deviant seat
 *                                        cannot abort a multi-seat sweep before the rest are classified.
 *                                        **Classification under `dryRun` is force-invariant**: `force` describes what
 *                                        a later hydration may destroy, not what the seat holds now, so it cannot move
 *                                        a leaf out of `divergent` and cannot change the residue count.
 * @param {Function} [options.log=console.log] Logger fn for action diagnostics.
 * @returns {Promise<{linked: string[], alreadyLinked: string[], clobbered: string[], skippedNoSource: string[], blocklisted: string[], divergent: Array<{name: string, reason: string, found: string}>, seatOnly: string[], resolved: Object<string,string>, mainCheckout: boolean, observed: {canonical: {ok: boolean, reason: string|null}, seat: {ok: boolean, reason: string|null}}}>}
 *          Per-item action map. Under `dryRun` it is **exhaustive over the union of canonical and seat children**:
 *          every name lands in exactly one bucket — including `seatOnly` leaves canonical does not know about — which
 *          is what lets a reconcile assert a seat carries no unexplained residue rather than merely describe it.
 *          `clobbered` is a mutating-path-only bucket and is always empty under `dryRun`, so the one-bucket property
 *          holds there without exception. On the mutating path a force-clobbered leaf appears in both `clobbered` and
 *          `linked`, because displacing local data and linking are two actions that both happened.
 *          `resolved[name]` carries each observed leaf's realpath — canonical's for a link, the seat's for a
 *          blocklisted or seat-only leaf — and is `null` only when the path could not be resolved at all.
 *          `observed` reports whether each side was enumerable at all. **Zero residue is only meaningful when
 *          both sides are `ok`**; an absent canonical or an unreadable seat produces empty buckets that mean
 *          "could not compare", never "nothing to report". Callers must gate any clean verdict on it.
 * @throws {Error} When a non-blocklisted child's dst is a non-symlink dir/file and `force` is false, or when an
 *                 existing symlink points outside the canonical checkout. **Never throws under `dryRun`** — both
 *                 conditions are recorded in `divergent` instead. The error message names the offending child.
 */
export async function symlinkDataDir({
    mainCheckout,
    projectRoot,
    blocklist = DATA_SUBDIRS_BLOCKLIST,
    force     = false,
    dryRun    = false,
    log       = console.log
}) {
    const result = {
        linked         : [],
        alreadyLinked  : [],
        clobbered      : [],
        skippedNoSource: [],
        blocklisted    : [],
        divergent      : [],
        seatOnly       : [],
        resolved       : {},
        mainCheckout   : false,
        // Whether each side was actually enumerable. A reconcile that cannot read a side has not
        // found zero residue there — it has found nothing, and the consumer must be able to tell
        // those apart without inferring it from empty arrays.
        observed       : {canonical: {ok: true, reason: null}, seat: {ok: true, reason: null}}
    };

    if (path.resolve(projectRoot) === path.resolve(mainCheckout)) {
        log(`symlink skip (main checkout): no per-item action`);
        result.mainCheckout = true;
        return result;
    }

    const canonicalDataDir = path.join(mainCheckout, '.neo-ai-data');

    // Ensure the parent .neo-ai-data/ exists as a regular dir; we never symlink the parent.
    // This preserves the git-tracked concepts/ subdir already present in the worktree.
    const parentDst = path.join(projectRoot, '.neo-ai-data');
    if (!dryRun) await fs.mkdir(parentDst, {recursive: true});

    // Blocklist, not allowlist: enumerate EVERY child of canonical's .neo-ai-data and link all
    // except the blocklist. A new substrate child is unified automatically, removing the
    // allowlist-drift class that silently orphaned memory-wal across non-canonical clones.
    const
        blocklistSet       = new Set(blocklist),
        readAliasSet       = new Set(CANONICAL_DATA_READ_ALIASES.map(entry => entry.alias)),
        readAliasSourceSet = new Set(CANONICAL_DATA_READ_ALIASES.map(entry => entry.source));
    let entries = [];
    try {
        entries = await fs.readdir(canonicalDataDir, {withFileTypes: true});
    } catch (e) {
        if (e?.code !== 'ENOENT') throw e;

        // A canonical with no `.neo-ai-data` is "nothing to link" for hydration and "could not
        // compare" for a reconcile — the same filesystem fact, two different verdicts. Returning
        // the empty result to both made a seat full of residue report zero: clean by absence of
        // evidence. The reconcile therefore records the unavailability and keeps enumerating the
        // seat, which does not depend on canonical to be readable.
        result.observed.canonical = {ok: false, reason: 'canonical-data-dir-absent'};
        log(`reconcile canonical unavailable: ${canonicalDataDir} does not exist`);
        if (!dryRun) return result;
    }

    // Reconcile enumerates the UNION of canonical and seat children. Iterating canonical alone
    // cannot see a leaf that exists only on the seat, so "no unexplained residue" would be
    // unprovable rather than merely unproven — the residue the falsifier looks for is exactly
    // the kind canonical does not know about.
    if (dryRun) {
        const canonicalNames = new Set(entries.map(entry => entry.name));

        let seatNames = [];
        try {
            seatNames = await fs.readdir(parentDst);
        } catch (e) {
            // An ABSENT seat dir is a real observation: an unhydrated seat holds nothing, so zero
            // residue is the truth. An UNREADABLE one is not — permissions hide exactly the leaves
            // the falsifier exists to find, so it must not be allowed to look like emptiness.
            if (e?.code === 'ENOENT') {
                result.observed.seat = {ok: true, reason: 'seat-data-dir-absent'};
            } else {
                result.observed.seat = {ok: false, reason: `seat-data-dir-unreadable: ${e?.code ?? 'unknown'}`};
                log(`reconcile seat unreadable: ${parentDst} (${e?.code ?? 'unknown'})`);
            }
        }

        for (const name of seatNames) {
            if (canonicalNames.has(name)) continue; // the canonical loop below owns every shared name

            // A declared-local leaf is classified here too, not skipped. Skipping it meant only
            // canonical's children could ever populate `blocklisted` — and a blocklisted child
            // existing ONLY on the seat is not an edge case, it is the whole point of the blocklist.
            // Such a leaf vanished from an "exhaustive" report while both sides read as observed,
            // which is the worst version of this: nothing looked wrong.
            const declaredLocal = blocklistSet.has(name) || readAliasSet.has(name) || readAliasSourceSet.has(name);

            if (declaredLocal) {
                log(`reconcile seat-local (declared, absent from canonical): ${name}`);
                result.blocklisted.push(name);
            } else {
                log(`reconcile seat-only (absent from canonical): ${name}`);
                result.seatOnly.push(name);
            }

            result.resolved[name] = await fs.realpath(path.join(parentDst, name)).catch(() => null);
        }
    }

    for (const entry of entries) {
        const name = entry.name;

        // Dot-entries are OS/tool artifacts, not managed shared substrate.
        if (name.startsWith('.')) continue;

        if (blocklistSet.has(name) || readAliasSet.has(name) || readAliasSourceSet.has(name)) {
            log(`symlink skip (blocklisted): ${name}`);
            result.blocklisted.push(name);
            // A blocklisted child is deliberately seat-local, which makes WHERE it lives the one
            // fact a reconcile actually needs about it — "we skipped it" is not an observation.
            // The seat path is the subject here, not canonical's: the whole point of the blocklist
            // is that these two are supposed to differ.
            result.resolved[name] = await fs.realpath(path.join(parentDst, name)).catch(() => null);
            continue;
        }

        const src   = path.join(canonicalDataDir, name);
        const dst   = path.join(parentDst, name);
        const lstat = await fs.lstat(dst).catch(() => null);

        if (lstat?.isSymbolicLink()) {
            const
                existingTarget = await fs.readlink(dst),
                resolvedTarget = path.resolve(path.dirname(dst), existingTarget),
                canonicalReal  = await fs.realpath(src),
                existingReal   = await fs.realpath(resolvedTarget).catch(() => resolvedTarget);

            if (existingReal !== canonicalReal) {
                // Reconcile mode records the divergence and keeps classifying; the mutating path still
                // refuses, because adopting another checkout's state is exactly what must never happen
                // silently. Recording beats throwing here ONLY because nothing is being written.
                if (dryRun) {
                    log(`reconcile divergent (foreign symlink target): ${name} → ${existingReal}`);
                    result.divergent.push({name, reason: 'foreign-symlink-target', found: existingReal});
                    result.resolved[name] = existingReal;
                    continue;
                }
                throw new Error(
                    `Refusing unexpected symlink target at ${dst}: expected ${src}, found ${resolvedTarget}. ` +
                    `Managed hydration never adopts another checkout's state implicitly.`
                );
            }
            log(`symlink skip (already linked): ${name}`);
            result.alreadyLinked.push(name);
            result.resolved[name] = existingReal;
            continue;
        }

        // src came from readdir, so it exists barring a concurrent-removal race — guard anyway.
        const srcExists = await exists(src);
        if (!srcExists) {
            log(`symlink skip (no source in main checkout): ${name}`);
            result.skippedNoSource.push(name);
            continue;
        }

        if (lstat) {
            // A real (non-symlink) dir or file already at dst would be shadowed by the link.

            // Reconcile classification is FORCE-INVARIANT, and that is the load-bearing property.
            // `force` states what a later hydration would be permitted to destroy; it says nothing
            // about what is on the seat right now. Letting it move this leaf out of `divergent`
            // made `--force --reconcile` report residue: 0 on the exact seat where `--reconcile`
            // alone reported residue: 1 — same filesystem, same untouched file, opposite verdict.
            // A diagnostic whose falsifier can be silenced by a mutation-intent flag is not one.
            if (dryRun) {
                log(`reconcile divergent (clone-local data, would need --force): ${name}`);
                result.divergent.push({name, reason: 'clone-local-non-symlink', found: dst});
                result.resolved[name] = await fs.realpath(dst).catch(() => dst);
                continue;
            }

            if (!force) {
                throw new Error(
                    `Refusing to replace non-symlink ${dst}; pass force=true (CLI --force) to opt in. ` +
                    `This path contains local data that would be lost.`
                );
            }
            log(`symlink clobber (force=true): removing ${name}`);
            await fs.rm(dst, {recursive: true, force: true}); // dryRun already returned above
            result.clobbered.push(name);
        }

        if (!dryRun) await fs.symlink(src, dst, entry.isDirectory() ? 'dir' : 'file');
        log(`${dryRun ? 'would symlink' : 'symlinked'}: ${name} → ${src}`);
        result.linked.push(name);
        result.resolved[name] = await fs.realpath(src).catch(() => src);
    }

    return result;
}

/**
 * @summary Symlinks canonical read-path aliases for blocklisted `.neo-ai-data/` children.
 *
 * This is intentionally separate from {@link symlinkDataDir}. Some canonical
 * state directories are useful to inspect from every checkout, but unsafe to
 * mount at their live child name because daemon entry points write PID files,
 * state files, and logs there. The alias path is explicit (`*-canonical`) so
 * code must opt into diagnostic reads and cannot accidentally join the shared
 * singleton by using the normal daemon data-dir default.
 *
 * @param {object}   options
 * @param {string}   options.mainCheckout Canonical checkout path.
 * @param {string}   options.projectRoot  Current checkout path to link from.
 * @param {Array<{source: string, alias: string}>} [options.aliases] Read-path alias map.
 * @param {Function} [options.log=console.log] Logger fn for action diagnostics.
 * @returns {Promise<{linked: string[], relinked: string[], alreadyLinked: string[], skippedNoSource: string[], skippedRealPath: string[], mainCheckout: boolean}>}
 */
export async function symlinkCanonicalDataReadAliases({
    mainCheckout,
    projectRoot,
    aliases = CANONICAL_DATA_READ_ALIASES,
    log     = console.log
}) {
    const result = {
        linked         : [],
        relinked       : [],
        alreadyLinked  : [],
        skippedNoSource: [],
        skippedRealPath: [],
        mainCheckout   : false
    };

    if (path.resolve(projectRoot) === path.resolve(mainCheckout)) {
        log(`read-alias skip (main checkout): no alias action`);
        result.mainCheckout = true;
        return result;
    }

    const parentDst = path.join(projectRoot, '.neo-ai-data');
    await fs.mkdir(parentDst, {recursive: true});

    for (const entry of aliases) {
        const {source, alias} = entry;

        if (!source || !alias || source === alias || path.isAbsolute(source) || path.isAbsolute(alias) ||
            source.includes('..') || alias.includes('..')) {
            throw new Error(`Invalid canonical data read alias: ${JSON.stringify(entry)}`);
        }

        const src = path.join(mainCheckout, '.neo-ai-data', source),
              dst = path.join(parentDst, alias);

        if (!await exists(src)) {
            log(`read-alias skip (no source in main checkout): ${alias}`);
            result.skippedNoSource.push(alias);
            continue;
        }

        const lstat = await fs.lstat(dst).catch(() => null);

        if (lstat?.isSymbolicLink()) {
            const existingTarget = await fs.readlink(dst),
                  resolvedTarget = path.resolve(path.dirname(dst), existingTarget);

            if (resolvedTarget === path.resolve(src)) {
                log(`read-alias skip (already linked): ${alias}`);
                result.alreadyLinked.push(alias);
                continue;
            }

            await fs.unlink(dst);
            await fs.symlink(src, dst, 'dir');
            log(`read-alias relinked: ${alias} → ${src}`);
            result.relinked.push(alias);
            continue;
        }

        if (lstat) {
            log(`read-alias skip (real path present, preserving local state): ${alias}`);
            result.skippedRealPath.push(alias);
            continue;
        }

        await fs.symlink(src, dst, 'dir');
        log(`read-alias linked: ${alias} → ${src}`);
        result.linked.push(alias);
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
 * Idempotent per-file by design: an existing symlink to the canonical source reports
 * `'already-linked'`; a symlink to any other checkout refuses rather than silently adopting
 * cross-resident state; a
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
            const
                existingTarget = await fs.readlink(dst),
                resolvedTarget = path.resolve(path.dirname(dst), existingTarget),
                canonicalReal  = await fs.realpath(src),
                existingReal   = await fs.realpath(resolvedTarget).catch(() => resolvedTarget);

            if (existingReal !== canonicalReal) {
                throw new Error(
                    `Refusing unexpected symlink target at ${dst}: expected ${src}, found ${resolvedTarget}. ` +
                    `Managed hydration never adopts another checkout's state implicitly.`
                );
            }
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
 * @returns {Array<{path: string, head: (string|null), branchRef: (string|null), branch: (string|null), detached: boolean}>}
 */
export function parseWorktreePorcelain(output) {
    const records = [];
    let   current = null;

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
 * @summary Classifies one Claude Code worktree for keep-current/delete-rest pruning.
 *
 * Worktrees are disposable checkouts; committed work lives in branches/remotes. The only
 * local filesystem state protected by default is the current active checkout plus dirty
 * sibling worktrees. Clean non-current Claude worktrees remain removable via
 * `git worktree remove --force`; dirty or indeterminate sibling state is skipped unless
 * the operator passes the explicit `includeDirty` override.
 *
 * @param {object}   options
 * @param {object}   options.worktree Parsed worktree record.
 * @param {string}   options.currentPath Absolute current checkout path that must be preserved.
 * @param {string}   options.mainCheckout Absolute primary checkout path that must be preserved.
 * @param {boolean}  [options.includeDirty=false] True removes dirty non-current worktrees.
 * @param {Function} [options.getSize] Optional size resolver.
 * @returns {Promise<object>}
 */
export async function classifyWorktree({
    worktree,
    currentPath,
    mainCheckout,
    includeDirty = false,
    exec         = execFileAsync,
    getSize      = getPathSizeBytes
}) {
    const sizeBytes             = await getSize(worktree.path, {exec});
    const current               = isSamePath(worktree.path, currentPath);
    const primaryMainCheckout   = isSamePath(worktree.path, mainCheckout);
    const protectedCheckoutPath = current || primaryMainCheckout;
    const classification        = {
        remove: !protectedCheckoutPath,
        status: current ? 'current' : (primaryMainCheckout ? 'main-checkout' : 'remove'),
        reason: current
            ? 'current active worktree'
            : (primaryMainCheckout ? 'primary checkout' : 'clean non-current Claude worktree')
    };

    if (classification.remove && !includeDirty) {
        const dirtyState = await getWorktreeDirtyState({worktreePath: worktree.path, exec});

        if (dirtyState.error) {
            classification.remove = false;
            classification.status = 'skipped-status-error';
            classification.reason = `dirty status could not be determined: ${dirtyState.error.message}`;
        } else if (dirtyState.dirty) {
            classification.remove = false;
            classification.status = 'skipped-dirty';
            classification.reason = 'dirty non-current Claude worktree';
        }

        classification.dirtyStatus = dirtyState;
    }

    return {
        ...worktree,
        sizeBytes,
        current,
        mainCheckout: primaryMainCheckout,
        remove      : classification.remove,
        removeArgs  : ['worktree', 'remove', '--force', worktree.path],
        status      : classification.status,
        reason      : classification.reason,
        dirtyStatus : classification.dirtyStatus || null
    };
}

/**
 * @summary Deletes non-current Claude Code worktrees and hydrates the current checkout.
 *
 * Default mode mutates. Pass `dryRun=true` for the non-mutating plan. This cleaner is
 * deliberately local-operator scoped; do not wire it into cloud-deployable orchestrator
 * lanes where tenant deployments have no business running git worktree deletion.
 *
 * @param {object}   options
 * @param {string}   options.projectRoot Primary checkout path.
 * @param {string}   [options.currentPath=projectRoot] Active checkout path that must not be removed.
 * @param {boolean}  [options.dryRun=false] Whether to only report the keep/remove plan.
 * @param {boolean}  [options.includeDirty=false] True removes dirty non-current worktrees.
 * @param {string}   [options.worktreesRoot] Worktree parent path.
 * @param {Function} [options.exec] Dependency-injected execFile wrapper.
 * @param {Function} [options.getSize] Optional size resolver.
 * @param {Function} [options.log] Logger fn for action diagnostics.
 * @param {Function} [options.hydrate] Current-worktree hydration hook.
 * @returns {Promise<{worktrees: object[], removed: object[], skipped: object[], totalBytes: number, reclaimableBytes: number, reclaimedBytes: number, hydrated: object|null}>}
 */
export async function pruneStaleWorktrees({
    projectRoot,
    currentPath   = projectRoot,
    dryRun        = false,
    includeDirty  = false,
    worktreesRoot = DEFAULT_CLAUDE_WORKTREES_ROOT,
    exec          = execFileAsync,
    getSize       = getPathSizeBytes,
    log           = console.log,
    hydrate       = hydrateCurrentWorktree
}) {
    const worktrees  = await listClaudeWorktrees({projectRoot, worktreesRoot, exec});
    const classified = [];

    for (const worktree of worktrees) {
        classified.push(await classifyWorktree({worktree, currentPath, mainCheckout: projectRoot, includeDirty, exec, getSize}));
    }

    const removable = classified.filter(item => item.remove);
    const skipped   = classified.filter(item => !item.remove);
    const removed   = [];

    const totalBytes       = classified.reduce((sum, item) => sum + item.sizeBytes, 0);
    const reclaimableBytes = removable.reduce((sum, item) => sum + item.sizeBytes, 0);

    log(`Claude worktree prune ${dryRun ? 'dry-run' : 'apply'} (keep current: ${path.resolve(currentPath)})`);
    log(`Found ${classified.length} worktree(s), ${formatBytes(totalBytes)} total, ${formatBytes(reclaimableBytes)} reclaimable.`);

    for (const item of classified) {
        const marker = item.remove
            ? (dryRun ? 'would-remove' : 'remove')
            : (item.status.startsWith('skipped') ? 'skip' : 'keep');
        log(`${marker}: ${item.status} ${formatBytes(item.sizeBytes)} ${item.path}`);
        log(`  ${item.reason}`);
    }

    let hydrated = null;

    if (!dryRun) {
        for (const item of removable) {
            await exec('git', item.removeArgs, {cwd: projectRoot});
            removed.push(item);
        }
        log(`Removed ${removed.length} worktree(s), reclaimed up to ${formatBytes(reclaimableBytes)}.`);
        hydrated = await hydrate({mainCheckout: projectRoot, projectRoot: currentPath, log});
        log(`Hydrated current worktree: ${path.resolve(currentPath)}`);
    } else {
        log(`Dry-run only. Re-run without --dry-run to remove non-current worktrees.`);
    }

    return {
        worktrees     : classified,
        removed,
        skipped,
        totalBytes,
        reclaimableBytes,
        reclaimedBytes: dryRun ? 0 : reclaimableBytes,
        hydrated
    };
}

/**
 * @summary Reuses the existing bootstrap + `--link-data` hydration path for one checkout, and
 * wires the Claude no-hold Stop hook into the worktree's `.claude/settings.json`.
 *
 * The Claude-settings wiring (`initClaudeSettings`) materializes the gitignored
 * `.claude/settings.json` from the worktree's own tracked `.claude/settings.template.json` — the
 * Claude analog of the `ai/config.mjs` / per-server overlay hydration `bootstrapWorktree` performs.
 * Without it the Stop hook is only wired by the `npm prepare` that `installDependencies` skips when
 * `node_modules` already exists, leaving the no-hold enforcement silently inert in worktrees.
 *
 * @param {object}   options
 * @param {string}   options.mainCheckout Canonical checkout path.
 * @param {string}   options.projectRoot Current checkout path to hydrate.
 * @param {Function} [options.log] Logger fn.
 * @param {Function} [options.wireClaudeSettings=initClaudeSettings] Claude-settings materializer; injectable for tests.
 * @returns {Promise<object>} Hydration sub-results (`bootstrap`, `data`, `files`, `claudeSettings`).
 */
export async function hydrateCurrentWorktree({mainCheckout, projectRoot, log = console.log, wireClaudeSettings = initClaudeSettings}) {
    const bootstrap       = await bootstrapWorktree({mainCheckout, projectRoot, log});
    const data            = await symlinkDataDir({mainCheckout, projectRoot, log});
    const dataReadAliases = await symlinkCanonicalDataReadAliases({mainCheckout, projectRoot, log});
    const files           = await symlinkGitignoredFiles({mainCheckout, projectRoot, log});
    const claudeSettings  = await wireClaudeSettings({claudeDir: path.join(projectRoot, '.claude'), logger: {log, warn: log}});

    return {bootstrap, data, dataReadAliases, files, claudeSettings};
}

/**
 * @summary Runs the local-only prune loop on an interval for operator-managed hosts.
 *
 * This is intentionally a CLI/local scheduler, not an Orchestrator task. The Orchestrator
 * has cloud-deployable lanes; worktree deletion is a desktop-harness hygiene action.
 * Warning: with `includeDirty`, each tick force-removes all non-current worktrees, including
 * concurrently-active sibling sessions. Use only on operator-managed hosts where that
 * disposable-worktree policy is acceptable.
 *
 * @param {object}   options
 * @param {number}   options.intervalMs Interval between runs.
 * @returns {Promise<{intervalMs: number, stop: Function}>}
 */
export async function runLocalPruneWorktreeSchedule({intervalMs, log = console.log, ...pruneOptions}) {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
        throw new Error(`--interval-ms must be a positive number`);
    }

    const dirtyPolicy = pruneOptions.includeDirty
        ? 'including dirty sibling state'
        : 'skipping dirty or indeterminate sibling state';

    log(`WARNING: --schedule-local repeatedly prunes non-current worktrees on every tick, ${dirtyPolicy}.`);

    let   running = false;
    const runOnce = async () => {
        if (running) {
            log(`Skipping prune tick: prior run still active.`);
            return null;
        }

        running = true;
        try {
            return await pruneStaleWorktrees({...pruneOptions, log});
        } catch (e) {
            log(`Prune tick failed: ${e.message}`);
            return null;
        } finally {
            running = false;
        }
    };

    await runOnce();
    const timer = setInterval(runOnce, intervalMs);
    log(`Local worktree prune scheduler active: interval ${intervalMs}ms.`);

    return {
        intervalMs,
        stop: () => clearInterval(timer)
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

/**
 * @summary Detects uncommitted worktree state for destructive prune decisions.
 *
 * Fails closed: if `git status --porcelain` cannot be read, the caller receives a dirty
 * result with the captured error so the worktree can be skipped instead of force-removed.
 *
 * @param {object}   options
 * @param {string}   options.worktreePath Absolute path to the candidate worktree.
 * @param {Function} [options.exec] Dependency-injected execFile wrapper.
 * @returns {Promise<{dirty: boolean, stdout: string, error: Error|null}>}
 */
async function getWorktreeDirtyState({worktreePath, exec = execFileAsync}) {
    try {
        const {stdout} = await exec('git', ['-C', worktreePath, 'status', '--porcelain']);

        return {
            dirty: stdout.trim().length > 0,
            stdout,
            error: null
        };
    } catch (error) {
        return {
            dirty : true,
            stdout: '',
            error
        };
    }
}

function isSamePath(a, b) {
    return path.resolve(a) === path.resolve(b);
}

function getNumberFlag(argv, flagName, defaultValue) {
    const index = argv.indexOf(flagName);
    if (index === -1) return defaultValue;

    const value = Number(argv[index + 1]);
    if (!Number.isFinite(value)) {
        throw new Error(`${flagName} requires a numeric value`);
    }
    return value;
}

function isPathInside(rootPath, candidatePath) {
    const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
    return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function formatBytes(bytes) {
    const units   = ['B', 'KB', 'MB', 'GB', 'TB'];
    let   value   = bytes;
    let   unitIdx = 0;

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

    const argv       = process.argv.slice(2);
    const args       = new Set(argv);
    const linkData   = args.has('--link-data');
    const force      = args.has('--force');
    const pruneStale = args.has('--prune-stale') || argv.includes('--mode=prune-stale') ||
        (argv.includes('--mode') && argv[argv.indexOf('--mode') + 1] === 'prune-stale');
    const dryRun  = args.has('--dry-run');
    const jsonOut = args.has('--json');

    // `--link-data --dry-run` is the spelling an operator reaches for first, so it MUST be the
    // read-only path rather than a flag the link stage quietly ignores while it writes.
    const reconcile = args.has('--reconcile') || (linkData && dryRun);

    // Repeatable `--seat <path>`: classify seats other than the one this script lives in.
    // Without it the reconcile can only ever describe its own checkout, which makes the
    // multi-seat question — do two seats resolve the same plane? — unaskable from one process.
    const seats = argv.reduce((acc, arg, i) => (
        arg === '--seat' && argv[i + 1] ? [...acc, path.resolve(argv[i + 1])] : acc
    ), []);
    const includeDirty  = args.has('--include-dirty');
    const scheduleLocal = args.has('--schedule-local');
    const intervalMs    = getNumberFlag(argv, '--interval-ms', 6 * 60 * 60 * 1000);

    // `--canonical-root <path>` flag wins; `NEO_AI_CANONICAL_ROOT` env var is the fallback.
    // Both are no-ops when running in an actual git worktree (the existing
    // git-worktree-list resolution path is the natural primary). They activate the
    // independent-clone topology where canonical lives in a sibling
    // checkout that `git worktree list` doesn't surface.
    const flagIdx      = argv.indexOf('--canonical-root');
    const explicitRoot = (flagIdx !== -1 && argv[flagIdx + 1])
        ? argv[flagIdx + 1]
        : (process.env.NEO_AI_CANONICAL_ROOT || null);

    try {
        const mainCheckout = await resolveMainCheckout(projectRoot, {explicitRoot});
        if (!mainCheckout) {
            console.error('Failed to resolve main checkout. Provide --canonical-root <path> (or NEO_AI_CANONICAL_ROOT env var) when running outside a git worktree, or ensure this is a git repository.');
            process.exit(1);
        }
        // stderr, not stdout: this is a progress banner, and `--json` makes stdout a payload stream.
        // Printed to stdout it lands AHEAD of the JSON and `JSON.parse` dies at line 1 column 1 —
        // a failure that reads like a bad file rather than a polluted stream.
        if (explicitRoot) console.error(`✓ Canonical checkout (explicit): ${mainCheckout}`);

        // --reconcile: the read-only per-seat report. Combines both axes in one artifact — the
        // symlink/root classification derived from the hydration declaration, and the host port
        // claims observed by the sibling probe — because a caller that has to run two commands and
        // staple the output together is not a report, it is a suggestion.
        if (reconcile) {
            const {probePortClaims, groupByCwd, servedCwds} =
                await import('../diagnostics/probePortClaims.mjs');

            const
                targets = seats.length ? seats : [projectRoot],
                ports   = probePortClaims(),
                grouped = groupByCwd(ports.rows),
                report  = {
                    canonical: mainCheckout,
                    // Port claims are a property of the HOST, not of any one seat, so they sit
                    // once at the top. Repeating them per seat would imply each seat owns the
                    // listeners it happens to be reported next to.
                    portClaims: {
                        observed: ports.observed,
                        reason  : ports.reason,
                        rows    : ports.rows,
                        byCwd   : grouped,
                        cwds    : servedCwds(grouped)
                    },
                    seats: []
                };

            for (const seat of targets) {
                report.seats.push({
                    seat,
                    plane: await symlinkDataDir({mainCheckout, projectRoot: seat, dryRun: true, log: () => {}})
                });
            }

            if (jsonOut) {
                console.log(JSON.stringify(report, null, 4));
            } else {
                console.log(`Canonical: ${report.canonical}\n`);

                for (const {seat, plane} of report.seats) {
                    console.log(`Seat: ${seat}`);
                    for (const bucket of ['linked', 'alreadyLinked', 'blocklisted', 'skippedNoSource', 'seatOnly']) {
                        console.log(`  ${bucket.padEnd(16)} ${plane[bucket].length}`);
                    }
                    console.log(`  ${'divergent'.padEnd(16)} ${plane.divergent.length}`);
                    for (const {name, reason} of plane.divergent) console.log(`      ! ${name} — ${reason}`);

                    // Residue is the falsifier's input, not its verdict. Non-zero residue has at least
                    // two readings — the blocklist is incomplete, or this seat was never hydrated with
                    // --link-data — and the report must not pick one. Naming the observation and
                    // leaving the interpretation to the reader is the whole point of a ground-truth
                    // artifact; a diagnostic that concludes is a diagnostic you have to re-derive.
                    //
                    // `(clean)` is spoken ONLY when both sides were enumerable. Zero residue off an
                    // unreadable side is the absence of evidence wearing the words of evidence.
                    const
                        residue    = plane.divergent.length + plane.seatOnly.length,
                        unobserved = Object.entries(plane.observed).filter(([, state]) => !state.ok);

                    // A THIRD reading of residue 0, and it is not cleanliness: a seat that was never
                    // hydrated has nothing conflicting AT those paths, so there is no divergence to
                    // record. `wouldLink 11 · alreadyLinked 0 · divergent 0 · residue 0` is a seat
                    // sharing NOTHING, and calling it `(clean)` invites a placement election to read
                    // it as "already sharing" — the exact inversion this artifact exists to prevent.
                    // Residue 0 means "no conflicting local data", never "hydrated".
                    const unhydrated = plane.alreadyLinked.length === 0 && plane.linked.length > 0;

                    console.log(`  residue: ${residue}${
                        residue     ? ' — unreconciled against the declaration (incomplete blocklist OR unhydrated seat)' :
                        unobserved.length
                            ? ` — NOT CLEAN, NOT COMPARED (${unobserved.map(([side, state]) => `${side}: ${state.reason}`).join('; ')})`
                            : unhydrated
                                ? ` — no conflicting local data, but this seat shares NOTHING (${plane.linked.length} leaf/leaves would link, 0 already linked). NOT "clean", NOT hydrated.`
                                : ' (clean — hydrated and consistent)'
                    }\n`);
                }

                console.log(report.portClaims.observed
                    ? `Ports: ${report.portClaims.rows.length} listener(s) across ${report.portClaims.cwds.length} serving cwd(s)`
                    : `Ports: NOT OBSERVED (${report.portClaims.reason}) — this is not "no listeners"`);
            }
            process.exit(0);
        }

        if (pruneStale) {
            if (scheduleLocal) {
                await runLocalPruneWorktreeSchedule({
                    projectRoot: mainCheckout,
                    currentPath: projectRoot,
                    dryRun,
                    includeDirty,
                    intervalMs
                });
                await new Promise(() => {});
            } else {
                await pruneStaleWorktrees({projectRoot: mainCheckout, currentPath: projectRoot, dryRun, includeDirty});
                process.exit(0);
            }
        }

        // Identity is the first mutating standard-bootstrap stage. Every source-of-authority check
        // completes before this call writes Git config, and the read-only reconcile/dry-run paths
        // already exited above.
        const gitIdentity = await configureAgentGitIdentity({mainCheckout, projectRoot});
        if (gitIdentity.action === 'configured') {
            console.log(`✓ Git identity: ${gitIdentity.name} <${gitIdentity.email}> (${gitIdentity.scope})`);
        }

        const result = await bootstrapWorktree({mainCheckout, projectRoot});
        const total  = result.copied.length + result.skipped.length + result.missing.length;
        console.log(`\n✓ Bootstrap complete: ${result.copied.length} copied, ${result.skipped.length} skipped, ${result.missing.length} missing (${total} total)`);

        // Materialize the worktree's .claude/settings.json (the no-hold Stop hook) from its tracked
        // settings.template.json — the Claude-settings parallel to the config hydration above, wired
        // deterministically rather than via the npm prepare that runBuildAll's installDependencies
        // skips when node_modules already exists.
        const claudeSettings = await initClaudeSettings({claudeDir: path.join(projectRoot, '.claude')});
        console.log(`✓ Claude settings: ${claudeSettings.action}`);

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

            const readAliasResult = await symlinkCanonicalDataReadAliases({mainCheckout, projectRoot});
            if (readAliasResult.mainCheckout) {
                console.log(`✓ Data read aliases: skipped (running in main checkout)`);
            } else {
                const raLinkedN          = readAliasResult.linked.length;
                const raRelinkedN        = readAliasResult.relinked.length;
                const raAlreadyLinkedN   = readAliasResult.alreadyLinked.length;
                const raSkippedNoSourceN = readAliasResult.skippedNoSource.length;
                const raSkippedRealPathN = readAliasResult.skippedRealPath.length;
                console.log(
                    `✓ Data read aliases: ${raLinkedN} linked, ${raRelinkedN} relinked, ` +
                    `${raAlreadyLinkedN} already-linked, ${raSkippedNoSourceN} skipped-no-source, ` +
                    `${raSkippedRealPathN} skipped-real-path`
                );
                if (raLinkedN          > 0) console.log(`  linked:           ${readAliasResult.linked.join(', ')}`);
                if (raRelinkedN        > 0) console.log(`  relinked:         ${readAliasResult.relinked.join(', ')}`);
                if (raAlreadyLinkedN   > 0) console.log(`  already-linked:   ${readAliasResult.alreadyLinked.join(', ')}`);
                if (raSkippedNoSourceN > 0) console.log(`  skipped-no-src:   ${readAliasResult.skippedNoSource.join(', ')}`);
                if (raSkippedRealPathN > 0) console.log(`  skipped-real-path: ${readAliasResult.skippedRealPath.join(', ')}`);
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

        // Said LAST, deliberately: verify the effective worktree-owned value after every other
        // bootstrap stage. The main checkout is operator-owned and was intentionally skipped above.
        if (gitIdentity.action === 'configured') {
            const identity = await inspectGitIdentity({projectRoot});

            if (identity.inherited || identity.local !== gitIdentity.email.toLowerCase()) {
                throw new Error(
                    `Git identity verification failed: expected worktree-owned '${gitIdentity.email}', ` +
                    `observed '${identity.local || '(missing)'}'.`
                )
            }

            console.log(`✓ Git identity verified: ${identity.local}`);
        }
    } catch (e) {
        console.error('Bootstrap failed:', e.message);
        process.exit(1);
    }
}
