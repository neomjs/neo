#!/usr/bin/env node
import * as acorn                   from 'acorn';
import {execFileSync}              from 'node:child_process';
import path                        from 'node:path';
import {fileURLToPath}             from 'node:url';
import {createFleetRegistryBridge} from '../../../src/ai/fleet/createFleetRegistryBridge.mjs';

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
 *   4. `preflight` — verify the roster entry exists on merged `origin/dev` AND the graph node is
 *      seeded (read-only probe). Refuse with the exact missing operator step named.
 *   5. `launch`    — `FleetManager.startAgent(id)` (provision-then-start, supervised child in
 *      its isolated instance home via the curated per-family template).
 *   6. `auth`      — take `instanceHome` + `authRequired` from the long-lived lifecycle owner's
 *      `startAgent` status and print the exact per-home login line. Secrets never touch this script:
 *      authentication is the operator-owned step by design.
 *
 * Idempotent per segment because every underlying contract already is (definition conflicts refuse,
 * repo drift reconciles through `setRepo`, repo ensure-or-reuse, start short-circuits when running,
 * boot seeding + wake bootstrap are idempotent at their owners). Dry-run renders the true
 * per-segment delta AND which phase the onboarding is currently in; `--commit` executes exactly
 * that delta.
 *
 * **Usage**:
 *   node ai/scripts/fleet/onboardPeer.mjs --resident-id <s> --github-username <s>
 *       --harness-type <codex|claude-code> [--clone-url <s> --repo-slug <s>]   # dry-run;
 *                                                      # pair required unless repo already exists
 *   node ai/scripts/fleet/onboardPeer.mjs ... --commit                          # execute phase delta
 *   node ai/scripts/fleet/onboardPeer.mjs --help
 */

const
    __filename       = fileURLToPath(import.meta.url),
    REPO_ROOT        = path.resolve(path.dirname(__filename), '../../..'),
    HARNESS_FAMILIES = Object.freeze({
        'claude-code': 'claude',
        codex        : 'gpt'
    });

/**
 * @summary The curated harness families the conductor accepts — must stay a subset of the
 * registry's own `harnessTypes` vocabulary (the registry re-validates on define; this list only
 * gives the CLI an early, named refusal).
 * @type {ReadonlyArray<String>}
 */
export const CURATED_HARNESS_TYPES = Object.freeze(['claude-code', 'codex']);

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/**
 * @summary Parse the merged roster source without executing it and return only literal ids from
 * the canonical exported `IDENTITIES` array. AST parsing makes comments and unrelated strings
 * inert; a missing/non-literal authority shape fails closed rather than guessing membership.
 * @param {String} source The `origin/dev:ai/graph/identityRoots.mjs` source text.
 * @returns {Set<String>} Literal identity ids declared by the exported roster array.
 */
function parseIdentityRootIds(source) {
    const ast = acorn.parse(String(source), {ecmaVersion: 'latest', sourceType: 'module'});

    let identities;

    for (const statement of ast.body) {
        if (statement.type !== 'ExportNamedDeclaration' || statement.declaration?.type !== 'VariableDeclaration') continue;

        const declarator = statement.declaration.declarations.find(item => item.id?.type === 'Identifier' && item.id.name === 'IDENTITIES');

        if (declarator) {
            identities = declarator.init;
            break
        }
    }

    if (identities?.type !== 'ArrayExpression') {
        throw new Error('merged roster must export IDENTITIES as a literal array');
    }

    const ids = new Set();

    for (const element of identities.elements) {
        if (element?.type !== 'ObjectExpression') continue;

        const idProperty = element.properties.find(property => property.type === 'Property'
            && !property.computed
            && (property.key?.name === 'id' || property.key?.value === 'id'));

        if (idProperty?.value?.type === 'Literal' && typeof idProperty.value.value === 'string') {
            ids.add(idProperty.value.value);
        }
    }

    return ids
}

/**
 * @summary Verify membership against the merged roster authority (`origin/dev`), never the
 * conductor's current feature-branch worktree. This keeps Phase B locked until the ceremony PR
 * actually merged and the operator refreshed the remote-tracking ref. Git is invoked shell-free;
 * failures refuse instead of silently treating stale or unavailable authority as membership.
 * @param {Object} options
 * @param {String} options.residentId Normalized resident handle.
 * @param {String} [options.repoRoot] Repository working directory.
 * @param {Function} [options.execFileImpl] Injectable `execFileSync` seam.
 * @returns {Boolean} Whether the merged roster contains the exact resident id.
 */
export function originDevRosterHasResident({residentId, repoRoot = REPO_ROOT, execFileImpl = execFileSync} = {}) {
    const normalized = normalizeToken(residentId, 'residentId');

    if (!normalized.valid) {
        throw new Error(`originDevRosterHasResident: ${normalized.reason}`);
    }

    let source;

    try {
        source = execFileImpl('git', ['show', 'origin/dev:ai/graph/identityRoots.mjs'], {
            cwd     : repoRoot,
            encoding: 'utf8'
        });
    } catch (error) {
        throw new Error("onboardPeer: cannot verify the merged roster at origin/dev; run 'git fetch origin dev' and re-run", {cause: error});
    }

    let ids;

    try {
        ids = parseIdentityRootIds(source)
    } catch (error) {
        throw new Error('onboardPeer: cannot parse the merged identity roster at origin/dev; refresh the ref and re-run', {cause: error});
    }

    return ids.has(`@${normalized.token}`)
}

/**
 * @summary Build the CLI's client for the ONE long-lived Fleet lifecycle owner. Every independently
 * invoked conductor process talks to this HTTP seam rather than constructing a private in-process
 * `FleetLifecycleService`, so process state and idempotency survive across shells. The request seam
 * is injectable for exact ephemeral-server tests; transport/envelope unwrapping stays on the shared
 * {@link createFleetRegistryBridge} contract consumed by the cockpit.
 * @param {Object} [options]
 * @param {String} [options.url='http://127.0.0.1:8083/fleet'] Fleet owner endpoint.
 * @param {Function} [options.fetchImpl=globalThis.fetch] Injectable Fetch implementation.
 * @returns {Object} Async Fleet wire methods.
 */
export function createOnboardingFleetBridge({url = 'http://127.0.0.1:8083/fleet', fetchImpl = globalThis.fetch} = {}) {
    if (typeof fetchImpl !== 'function') {
        throw new Error('createOnboardingFleetBridge: fetchImpl must be a function.');
    }

    const send = async request => {
        let response;

        try {
            response = await fetchImpl(url, {
                method : 'POST',
                headers: {'Content-Type': 'application/json'},
                body   : JSON.stringify(request)
            });
        } catch (error) {
            throw new Error(`onboardPeer: long-lived Fleet owner is unreachable at ${url}; start it with 'npm run ai:fleet-server' and re-run`, {cause: error});
        }

        if (!response?.ok) {
            throw new Error(`onboardPeer: Fleet owner at ${url} returned HTTP ${response?.status ?? 'unknown'}`);
        }

        try {
            return await response.json()
        } catch (error) {
            throw new Error(`onboardPeer: Fleet owner at ${url} returned a non-JSON response`, {cause: error});
        }
    };

    return createFleetRegistryBridge(send)
}

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

    if (hasCloneUrl) {
        const
            cloneUrl = options.cloneUrl.trim(),
            repoSlug = options.repoSlug.trim();

        if (CONTROL_CHARACTERS.test(cloneUrl) || CONTROL_CHARACTERS.test(repoSlug)) {
            return {valid: false, reason: '--clone-url and --repo-slug may not contain control characters', intent: null};
        }

        try {
            const parsedUrl = new URL(cloneUrl);

            if (parsedUrl.password || (['http:', 'https:'].includes(parsedUrl.protocol) && parsedUrl.username)) {
                return {valid: false, reason: '--clone-url must not embed credentials; Fleet registry metadata is non-secret', intent: null};
            }
            if (['http:', 'https:'].includes(parsedUrl.protocol) && (parsedUrl.search || parsedUrl.hash)) {
                return {valid: false, reason: '--clone-url HTTP(S) URLs may not contain a query string or fragment; Fleet registry metadata is non-secret', intent: null};
            }
        } catch {
            // SCP-like Git URLs (`git@host:owner/repo.git`) are valid clone inputs but not WHATWG
            // URLs. The downstream provisioner uses `execFile('git', ['clone', '--', ...])`, so they
            // remain shell-free; only control characters are rejected above.
        }
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
 * tests inject them) so the planner stays side-effect-free: `agent` (the registry's public
 * definition, or null), `rosterHasResident` (the merged `origin/dev` roster),
 * `graphNodeSeeded` (read-only graph probe; `null` = no graph reachable), and `running` /
 * `authRequired` (lifecycle status).
 * @param {Object} options
 * @param {Object} options.intent A valid intent from {@link buildOnboardingIntent}
 * @param {Object} options.facts Observed facts as described above
 * @returns {{phase: String, segments: Object[], gateMessage: String|null}}
 */
export function planOnboarding({intent, facts = {}} = {}) {
    const
        segments = [],
        push     = (key, action, detail) => segments.push({key, action, detail}),
        agent    = facts.agent ?? null;

    // --- Phase A segments (always evaluated: re-runs report EXISTS honestly) -----------------
    if (!agent) {
        push('define', 'CREATE',
            `fleet agent '${intent.agentId}' (githubUsername '${intent.githubUsername}', harnessType '${intent.harnessType}')`);
    } else if (agent.githubUsername === intent.githubUsername && agent.harnessType === intent.harnessType) {
        push('define', 'EXISTS',
            `fleet agent '${intent.agentId}' matches githubUsername '${intent.githubUsername}' + harnessType '${intent.harnessType}'`);
    } else {
        push('define', 'REFUSE',
            `fleet agent '${intent.agentId}' exists with a different githubUsername or harnessType — reconcile the occupied definition through the Fleet registry owner before onboarding`);
    }

    const existingRepo = agent?.metadata?.repo ?? null;

    if (intent.repo) {
        if (!existingRepo) {
            push('repo', 'CREATE',
                `metadata.repo → ${intent.repo.repoSlug} (clone source configured; credentials forbidden)`);
        } else if (existingRepo.cloneUrl === intent.repo.cloneUrl && existingRepo.repoSlug === intent.repo.repoSlug) {
            push('repo', 'EXISTS', `metadata.repo → ${intent.repo.repoSlug}`);
        } else {
            push('repo', 'UPDATE',
                `existing metadata.repo differs — replace it through FleetManager.setRepo with ${intent.repo.repoSlug}`);
        }
    } else if (existingRepo) {
        push('repo', 'EXISTS', 'existing metadata.repo coordinates retained');
    } else {
        push('repo', 'REFUSE', 'no existing metadata.repo and no --clone-url/--repo-slug given — peer onboarding never launches in the Fleet process cwd');
    }

    // --- The gate: the roster ceremony decides which phase we are in --------------------------
    if (!facts.rosterHasResident) {
        push('roster', 'PRINT',
            `node ai/scripts/setup/generateRosterOnboarding.mjs --handle ${intent.residentId} --github-username ${intent.githubUsername} --family ${HARNESS_FAMILIES[intent.harnessType]}`);

        return {
            phase      : 'A',
            segments,
            gateMessage: `'${intent.residentId}' is not in the merged origin/dev roster. Next: run the roster generator above on a feature branch, open the PR (the cross-family-reviewed membership ceremony), merge it, pull/fetch origin/dev, restart the Memory Core server (boot seeding creates the identity node + wake template), then re-run this command.`
        }
    }

    // --- Phase B segments ----------------------------------------------------------------------
    if (segments.some(segment => segment.action === 'REFUSE')) {
        return {phase: 'B', segments, gateMessage: null}
    }

    if (facts.graphNodeSeeded !== true) {
        push('preflight', 'REFUSE',
            facts.graphNodeSeeded === false
                ? `roster entry present but the graph carries no '${intent.residentId}' AgentIdentity node — restart the Memory Core server so boot seeding materializes it, then re-run`
                : 'the configured Memory Core graph is not reachable read-only — start or reconnect the owning Memory Core server and re-run; unverifiable identity state never reaches launch');

        return {phase: 'B', segments, gateMessage: null}
    }

    push('preflight', 'OK', `roster entry + seeded '${intent.residentId}' AgentIdentity node verified`);

    push('launch', facts.running ? 'EXISTS' : 'CREATE',
        facts.running
            ? `'${intent.agentId}' is already running — start short-circuits to status`
            : `FleetManager.startAgent('${intent.agentId}') — provision-then-start via the curated '${intent.harnessType}' template`);

    push('auth', 'PRINT',
        facts.authRequired === false
            ? 'per-home credentials already present — no login step required'
            : facts.authRequired === true
                ? 'per-home login required once (surfaced via status().authRequired after launch)'
                : 'auth state UNKNOWN until the long-lived owner returns live launch status');

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
 * @summary Build the exact operator-owned login command from the instance home resolved by the
 * lifecycle service. The home and executable are owned launch-contract outputs — never guessed
 * from the resident id or PATH — and are single-quoted so shell metacharacters remain data.
 * @param {Object} options
 * @param {String} options.harnessType Curated harness family.
 * @param {String} options.instanceHome Absolute instance home from lifecycle status.
 * @param {String} options.launchCommand Absolute executable path from lifecycle status.
 * @returns {String}
 */
export function buildLoginCommand({harnessType, instanceHome, launchCommand} = {}) {
    if (!CURATED_HARNESS_TYPES.includes(harnessType)) {
        throw new Error(`buildLoginCommand: unsupported harnessType '${String(harnessType)}'.`);
    }
    if (typeof instanceHome !== 'string' || !path.isAbsolute(instanceHome) || CONTROL_CHARACTERS.test(instanceHome)) {
        throw new Error('buildLoginCommand: lifecycle status must provide a control-character-free absolute instanceHome.');
    }
    if (typeof launchCommand !== 'string' || !path.isAbsolute(launchCommand) || CONTROL_CHARACTERS.test(launchCommand)) {
        throw new Error('buildLoginCommand: lifecycle status must provide a control-character-free absolute launchCommand.');
    }

    const
        quote         = value => `'${value.replaceAll("'", "'\\''")}'`,
        quotedHome    = quote(instanceHome),
        quotedCommand = quote(launchCommand);

    return harnessType === 'codex'
        ? `CODEX_HOME=${quotedHome} ${quotedCommand} login`
        : `CLAUDE_CONFIG_DIR=${quotedHome} ${quotedCommand}  # then /login inside the session`;
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
    console.log('  repo pair   Required for a new resident; omission reuses an existing metadata.repo only.');
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

    // Fact gathering (the side-effect half; every Fleet read hits the ONE long-lived HTTP owner).
    // The Neo bootstrap + graph/config imports stay LAZY so `--help` and the module import remain
    // runnable in a bare fresh process.
    await import('../../../src/Neo.mjs');
    await import('../../../src/core/_export.mjs');

    const
        // the graph db path is OWNED by the memory-core server config (its useTestDatabase-derived
        // formula), not the root config — same layering the Day-0 lineage established
        {default: memoryCoreConfig} = await import('../../mcp/server/memory-core/config.mjs'),
        {existsSync}                = await import('node:fs'),
        fleet                       = createOnboardingFleetBridge();

    const [agent, runtimeRows] = await Promise.all([
        fleet.getAgent(intent.agentId),
        fleet.fleetRuntimeStatus()
    ]);

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
        agent,
        rosterHasResident: originDevRosterHasResident({residentId: intent.residentId}),
        graphNodeSeeded,
        running          : Boolean(runtimeRows.find(row => row.agentId === intent.agentId)?.running),
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
        if (!['CREATE', 'UPDATE'].includes(segment.action)) continue;

        if (segment.key === 'define' && segment.action === 'CREATE') {
            await fleet.defineAgent({
                id            : intent.agentId,
                githubUsername: intent.githubUsername,
                harnessType   : intent.harnessType
            });
            console.log(`  [DONE] define — '${intent.agentId}'`);
        }

        if (segment.key === 'repo') {
            await fleet.setRepo({id: intent.agentId, cloneUrl: intent.repo.cloneUrl, repoSlug: intent.repo.repoSlug});
            console.log(`  [DONE] repo — ${intent.repo.repoSlug}`);
        }
    }

    // `startAgent` is idempotent at the long-lived owner: call it for CREATE *or* EXISTS so a
    // cross-shell re-run returns the authoritative auth/home status without spawning a duplicate.
    if (plan.segments.some(segment => segment.key === 'launch')) {
        const status = await fleet.startAgent(intent.agentId);

        console.log(`  [DONE] launch — state '${status.state}' (pid ${status.pid ?? 'n/a'})`);

        if (status.authRequired === true) {
            const loginCommand = buildLoginCommand({
                harnessType  : intent.harnessType,
                instanceHome : status.instanceHome,
                launchCommand: status.launchCommand
            });

            console.log('');
            console.log('  LOGIN REQUIRED (operator-owned, exactly once for this home):');
            console.log(`    ${loginCommand}`);
        } else if (status.authRequired === false) {
            console.log('  [DONE] auth — per-home credentials already present');
        } else {
            console.log('  [WARN] auth — the owner returned no curated auth state; no login command was guessed');
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
