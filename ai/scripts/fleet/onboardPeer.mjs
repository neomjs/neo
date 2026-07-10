#!/usr/bin/env node
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

/**
 * @module ai/scripts/fleet/onboardPeer
 * @summary The peer-onboarding conductor: one dry-run-first command that walks an operator from
 * "I want a new resident" to "a supervised harness is running in its own home, awaiting exactly
 * one login" — as a THIN two-phase composition over owned contracts. It re-implements NOTHING:
 * every write goes through the owning registry/manager surface, and the identity + wake substrate
 * come from the roster ceremony, never from this script.
 *
 * **Phase A — before the roster merge (addressability intent):**
 *   1. `define`  — the Fleet registry agent definition (curated intent: githubUsername +
 *      harnessType + id; the raw-launch stop-line stays untouched).
 *   2. `repo`    — `metadata.repo` coordinates on the definition (`setRepo`), so the launch
 *      provisions the agent's own checkout.
 *   3. `roster`  — PRINT the roster-generator invocation. The roster PR + its cross-family
 *      review IS the membership ceremony; this script never writes committed files.
 *
 * **The operator gate (printed, never automated):** merge the roster PR, pull, and restart the
 * Memory Core server — boot seeding materializes the resident's `AgentIdentity` node (with its
 * `subscriptionTemplate`) from the committed roster; the peer's FIRST boot then materializes the
 * wake route itself via the wake-subscription `bootstrap` action from the real boot envelope.
 *
 * **Phase B — after the gate (launch):**
 *   4. `preflight` — verify the roster entry exists in THIS checkout AND the graph node is
 *      seeded (read-only probe). Refuse with the exact missing operator step named.
 *   5. `launch`    — `FleetManager.startAgent(id)` (provision-then-start, supervised child in
 *      its isolated instance home via the curated per-family template).
 *   6. `auth`      — read `status(id)`, print the per-home login line. Secrets never touch
 *      this script: authentication is the operator-owned step by design.
 *
 * Idempotent per segment because every underlying contract already is (define/setRepo upsert,
 * repo ensure-or-reuse, start short-circuits when running, boot seeding + wake bootstrap are
 * idempotent at their owners). Dry-run renders the true per-segment delta AND which phase the
 * onboarding is currently in; `--commit` executes exactly that delta.
 *
 * **Usage**:
 *   node ai/scripts/fleet/onboardPeer.mjs --resident-id <s> --github-username <s>
 *       --harness-type <codex|claude-code> [--clone-url <s> --repo-slug <s>]   # dry-run
 *   node ai/scripts/fleet/onboardPeer.mjs ... --commit                          # execute phase delta
 *   node ai/scripts/fleet/onboardPeer.mjs --help
 */

const __filename = fileURLToPath(import.meta.url);

/**
 * @summary The curated harness families the conductor accepts — must stay a subset of the
 * registry's own `harnessTypes` vocabulary (the registry re-validates on define; this list only
 * gives the CLI an early, named refusal).
 * @type {ReadonlyArray<String>}
 */
export const CURATED_HARNESS_TYPES = Object.freeze(['claude-code', 'codex']);

/**
 * @summary Normalizes a lowercase token input; fail-closed on empty or malformed values.
 * @param {String} value Raw input
 * @param {String} label Flag name for the refusal message
 * @returns {{valid: Boolean, reason: String|null, token: String|null}}
 */
export function normalizeToken(value, label) {
    if (typeof value !== 'string' || value.trim() === '') {
        return {valid: false, reason: `${label} requires a non-empty string`, token: null};
    }

    const token = value.trim().replace(/^@/, '');

    if (!/^[a-z0-9][a-z0-9-]*$/.test(token)) {
        return {valid: false, reason: `${label} must be a lowercase token ([a-z0-9-]) — received '${value}'`, token: null};
    }

    return {valid: true, reason: null, token}
}

/**
 * @summary Builds the frozen onboarding intent (the PURE input half): validated identifiers plus
 * optional repo coordinates. Engine/model and social-name inputs have NO surface here at all —
 * engine truth is observation-owned and names are the post-boot peer ritual; both arrive via the
 * roster ceremony and later layers, never via onboarding flags.
 * @param {Object} options
 * @param {String} options.residentId Durable resident handle (also the Fleet agent id)
 * @param {String} options.githubUsername GitHub login the agent operates as
 * @param {String} options.harnessType One of {@link CURATED_HARNESS_TYPES}
 * @param {String} [options.cloneUrl] Working-repo clone URL (with repoSlug ⇒ the repo segment)
 * @param {String} [options.repoSlug] Working-repo slug (e.g. 'neomjs/neo')
 * @returns {{valid: Boolean, reason: String|null, intent: Object|null}}
 */
export function buildOnboardingIntent(options = {}) {
    const resident = normalizeToken(options.residentId, '--resident-id');
    if (!resident.valid) return {valid: false, reason: resident.reason, intent: null};

    const github = normalizeToken(options.githubUsername, '--github-username');
    if (!github.valid) return {valid: false, reason: github.reason, intent: null};

    if (!CURATED_HARNESS_TYPES.includes(options.harnessType)) {
        return {valid: false, reason: `--harness-type must be one of: ${CURATED_HARNESS_TYPES.join(', ')} — received '${String(options.harnessType)}'`, intent: null};
    }

    const hasCloneUrl = typeof options.cloneUrl === 'string' && options.cloneUrl.trim() !== '',
          hasRepoSlug = typeof options.repoSlug === 'string' && options.repoSlug.trim() !== '';

    if (hasCloneUrl !== hasRepoSlug) {
        return {valid: false, reason: '--clone-url and --repo-slug come together or not at all (one without the other cannot provision a checkout)', intent: null};
    }

    return {
        valid : true,
        reason: null,
        intent: Object.freeze({
            residentId    : resident.token,
            agentId       : resident.token,
            githubUsername: github.token,
            harnessType   : options.harnessType,
            repo          : hasCloneUrl
                ? Object.freeze({cloneUrl: options.cloneUrl.trim(), repoSlug: options.repoSlug.trim()})
                : null
        })
    }
}

/**
 * @summary The pure two-phase decision: given the intent and the OBSERVED facts, decide the
 * current phase and the exact per-segment delta. Facts arrive observed (the CLI gathers them;
 * tests inject them) so the planner stays side-effect-free:
 * `agentDefined` / `repoConfigured` (registry reads), `rosterHasResident` (this checkout's
 * committed roster), `graphNodeSeeded` (read-only graph probe; `null` = no graph reachable),
 * `running` / `authRequired` (lifecycle status).
 * @param {Object} options
 * @param {Object} options.intent A valid intent from {@link buildOnboardingIntent}
 * @param {Object} options.facts Observed facts as described above
 * @returns {{phase: String, segments: Object[], gateMessage: String|null}}
 */
export function planOnboarding({intent, facts = {}} = {}) {
    const
        segments = [],
        push     = (key, action, detail) => segments.push({key, action, detail});

    // --- Phase A segments (always evaluated: re-runs report EXISTS honestly) -----------------
    push('define', facts.agentDefined ? 'EXISTS' : 'CREATE',
        `fleet agent '${intent.agentId}' (githubUsername '${intent.githubUsername}', harnessType '${intent.harnessType}')`);

    if (intent.repo) {
        push('repo', facts.repoConfigured ? 'EXISTS' : 'CREATE',
            `metadata.repo → ${intent.repo.repoSlug} (${intent.repo.cloneUrl})`);
    } else {
        push('repo', 'SKIP', 'no --clone-url/--repo-slug given — the harness will start in the inherited cwd');
    }

    // --- The gate: the roster ceremony decides which phase we are in --------------------------
    if (!facts.rosterHasResident) {
        push('roster', 'PRINT',
            `node ai/scripts/setup/generateRosterOnboarding.mjs --resident-id ${intent.residentId} --github-username ${intent.githubUsername} --family <family>`);

        return {
            phase      : 'A',
            segments,
            gateMessage: `'${intent.residentId}' is not in this checkout's committed roster. Next: run the roster generator above on a feature branch, open the PR (the cross-family-reviewed membership ceremony), merge it, pull, restart the Memory Core server (boot seeding creates the identity node + wake template), then re-run this command.`
        }
    }

    // --- Phase B segments ----------------------------------------------------------------------
    if (facts.graphNodeSeeded === false) {
        push('preflight', 'REFUSE',
            `roster entry present but the graph carries no '${intent.residentId}' AgentIdentity node — restart the Memory Core server so boot seeding materializes it, then re-run`);

        return {phase: 'B', segments, gateMessage: null}
    }

    push('preflight', facts.graphNodeSeeded === null ? 'WARN' : 'OK',
        facts.graphNodeSeeded === null
            ? 'no live graph reachable read-only — cannot verify seeding; the launch will still be attempted on --commit'
            : `roster entry + seeded '${intent.residentId}' AgentIdentity node verified`);

    push('launch', facts.running ? 'EXISTS' : 'CREATE',
        facts.running
            ? `'${intent.agentId}' is already running — start short-circuits to status`
            : `FleetManager.startAgent('${intent.agentId}') — provision-then-start via the curated '${intent.harnessType}' template`);

    push('auth', 'PRINT',
        facts.authRequired === false
            ? 'per-home credentials already present — no login step required'
            : `per-home login required once (surfaced via status().authRequired after launch)`);

    return {phase: 'B', segments, gateMessage: null}
}

/**
 * @summary Renders a plan as printable lines — dry-run output and `--commit` behavior derive
 * from the SAME plan, so they cannot drift.
 * @param {Object} intent A valid intent
 * @param {Object} plan A plan from {@link planOnboarding}
 * @returns {String[]}
 */
export function renderPlan(intent, plan) {
    const lines = [`[onboardPeer] resident: ${intent.residentId} (phase ${plan.phase})`, ''];

    for (const segment of plan.segments) {
        lines.push(`  [${segment.action}] ${segment.key}: ${segment.detail}`);
    }

    if (plan.gateMessage) {
        lines.push('', `  OPERATOR GATE — ${plan.gateMessage}`);
    }

    lines.push('');
    return lines;
}

/**
 * @summary Parses the CLI argv (pure; unknown flags refuse instead of being silently ignored).
 * @param {String[]} argv Arguments after the script path (`process.argv.slice(2)`)
 * @returns {{valid: Boolean, reason: String|null, options: Object|null}}
 */
export function parseOnboardArgs(argv = []) {
    const valueFlags = {
        '--clone-url'      : 'cloneUrl',
        '--github-username': 'githubUsername',
        '--harness-type'   : 'harnessType',
        '--repo-slug'      : 'repoSlug',
        '--resident-id'    : 'residentId'
    };

    const booleanFlags = {
        '--commit': 'commit',
        '--help'  : 'help'
    };

    const options = {commit: false, help: false};

    for (let i = 0; i < argv.length; i++) {
        const flag = argv[i];

        if (booleanFlags[flag]) {
            options[booleanFlags[flag]] = true;
            continue;
        }

        if (valueFlags[flag]) {
            const value = argv[i + 1];

            if (value === undefined || value.startsWith('--')) {
                return {valid: false, reason: `${flag} requires a value`, options: null};
            }

            options[valueFlags[flag]] = value;
            i++;
            continue;
        }

        return {valid: false, reason: `unknown option '${flag}' — onboarding accepts only: ${[...Object.keys(valueFlags), ...Object.keys(booleanFlags)].join(', ')}`, options: null};
    }

    return {valid: true, reason: null, options}
}

/**
 * @summary Prints the CLI usage block.
 * @returns {void}
 */
function printUsage() {
    console.log('Usage: node ai/scripts/fleet/onboardPeer.mjs --resident-id <s> --github-username <s>');
    console.log('           --harness-type <codex|claude-code> [--clone-url <s> --repo-slug <s>] [--commit]');
    console.log('');
    console.log('  (no flags)  Dry-run — print the two-phase segment delta without touching anything.');
    console.log('  --commit    Execute the CURRENT phase\'s delta through the owning fleet services.');
    console.log('');
    console.log('  There is deliberately NO --model flag (engine truth is observation-owned) and NO');
    console.log('  name flag (Social Names are the post-boot peer ritual). Identity + wake substrate');
    console.log('  arrive via the roster ceremony: generator → PR → merge → Memory Core restart.');
}

async function main() {
    const parsed = parseOnboardArgs(process.argv.slice(2));

    if (!parsed.valid) {
        console.error(`[onboardPeer] FATAL: ${parsed.reason}`);
        printUsage();
        process.exit(1);
    }

    if (parsed.options.help) {
        printUsage();
        return;
    }

    const built = buildOnboardingIntent(parsed.options);

    if (!built.valid) {
        console.error(`[onboardPeer] FATAL: ${built.reason}`);
        printUsage();
        process.exit(1);
    }

    const {intent} = built;

    // Fact gathering (the side-effect half; every read is an owned surface). The Neo bootstrap +
    // service imports are LAZY and sequenced so `--help` and the module import stay runnable in a
    // bare fresh process.
    await import('../../../src/Neo.mjs');
    await import('../../../src/core/_export.mjs');

    const
        {default: FleetRegistryService}  = await import('../../services/fleet/FleetRegistryService.mjs'),
        {default: FleetLifecycleService} = await import('../../services/fleet/FleetLifecycleService.mjs'),
        {default: FleetManager}          = await import('../../services/fleet/FleetManager.mjs'),
        {IDENTITIES}                     = await import('../../graph/identityRoots.mjs'),
        // the graph db path is OWNED by the memory-core server config (its useTestDatabase-derived
        // formula), not the root config — same layering the Day-0 lineage established
        {default: memoryCoreConfig}      = await import('../../mcp/server/memory-core/config.mjs'),
        {existsSync}                     = await import('node:fs');

    const agent = FleetRegistryService.getAgent(intent.agentId);

    // Read-only graph probe: absent file / absent node are DISTINCT facts (null = unverifiable).
    let   graphNodeSeeded = null;
    const graphPath       = memoryCoreConfig.storagePaths.graph;

    if (typeof graphPath === 'string' && graphPath !== ':memory:' && existsSync(graphPath)) {
        const {default: Database} = await import('better-sqlite3');
        const sqlite              = new Database(graphPath, {readonly: true});

        try {
            graphNodeSeeded = Boolean(sqlite.prepare('SELECT id FROM Nodes WHERE id = ? LIMIT 1').get(`@${intent.residentId}`));
        } finally {
            sqlite.close();
        }
    }

    const facts = {
        agentDefined     : Boolean(agent),
        repoConfigured   : Boolean(agent?.metadata?.repo),
        rosterHasResident: IDENTITIES.some(identity => identity.id === `@${intent.residentId}`),
        graphNodeSeeded,
        running          : FleetLifecycleService.isRunning(intent.agentId),
        authRequired     : null
    };

    const plan = planOnboarding({intent, facts});

    console.log(renderPlan(intent, plan).join('\n'));

    if (!parsed.options.commit) {
        console.log('[onboardPeer] DRY-RUN complete. No changes applied. Re-run with --commit to execute this phase.');
        return;
    }

    // --commit: execute exactly the rendered delta, refusing where the plan refuses.
    if (plan.segments.some(segment => segment.action === 'REFUSE')) {
        console.error('[onboardPeer] FATAL: the plan contains a REFUSE segment — resolve the named operator step first.');
        process.exit(1);
    }

    for (const segment of plan.segments) {
        if (segment.action !== 'CREATE') continue;

        if (segment.key === 'define') {
            FleetRegistryService.defineAgent({
                id            : intent.agentId,
                githubUsername: intent.githubUsername,
                harnessType   : intent.harnessType
            });
            console.log(`  [DONE] define — '${intent.agentId}'`);
        }

        if (segment.key === 'repo') {
            FleetManager.setRepo({id: intent.agentId, cloneUrl: intent.repo.cloneUrl, repoSlug: intent.repo.repoSlug});
            console.log(`  [DONE] repo — ${intent.repo.repoSlug}`);
        }

        if (segment.key === 'launch') {
            const status = await FleetManager.startAgent(intent.agentId);
            console.log(`  [DONE] launch — state '${status.state}' (pid ${status.pid ?? 'n/a'})`);

            if (status.authRequired) {
                const home = status.instanceHome ?? '<instance home>';
                console.log('');
                console.log('  LOGIN REQUIRED (operator-owned, exactly once for this home):');
                console.log(intent.harnessType === 'codex'
                    ? `    CODEX_HOME=${home} codex login`
                    : `    CLAUDE_CONFIG_DIR=${home} claude  # then /login inside the session`);
            }
        }
    }

    console.log('');
    console.log(`[onboardPeer] COMMIT complete for phase ${plan.phase}.`);

    if (plan.gateMessage) {
        console.log('');
        console.log(`OPERATOR GATE — ${plan.gateMessage}`);
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    main().catch(err => {
        console.error('[onboardPeer] FATAL:', err);
        process.exit(1);
    });
}
