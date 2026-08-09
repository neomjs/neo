#!/usr/bin/env node
import * as acorn                  from 'acorn';
import {execFileSync}              from 'node:child_process';
import path                        from 'node:path';
import {fileURLToPath}             from 'node:url';
import {createFleetRegistryBridge} from '../../services/fleet/createFleetRegistryBridge.mjs';

import {LAUNCHABLE_HARNESS_TYPES, getHarnessAuthMode} from '../../services/fleet/deriveHarnessLaunchSpec.mjs';
import {normalizeAgentIdentityNodeId}                 from '../../graph/normalizeAgentIdentityNodeId.mjs';

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
 * **The operator gate (printed, never automated):** merge the roster PR, pull the owning Memory
 * Core runtime checkout, explicitly project the merged identity registry, and restart the server.
 * Ordinary boot only materializes missing roots; the explicit seed owns intentional status/fact
 * updates. The peer's FIRST boot then materializes the wake route itself via the wake-subscription
 * `bootstrap` action from the real boot envelope.
 *
 * **Phase B — after the gate (launch):**
 *   4. `preflight` — verify the roster entry exists on merged `origin/dev` AND the graph's full
 *      identity projection carries the same `participationStatus` (read-only probe). Refuse with
 *      the exact pull → seed → full-node/liveness verification sequence named.
 *   5. `launch`    — `FleetManager.startAgent(id)` (provision-then-start, supervised child in
 *      its isolated instance home via the curated per-family template).
 *   6. `auth`      — use the long-lived lifecycle owner's auth-mode/status projection to hand off
 *      the operator step: marker families receive the exact per-home login line; GUI families sign
 *      in inside the Fleet-launched window and return to Fleet for any restart. Secrets never touch
 *      this script.
 *
 * Idempotent per segment because every underlying contract already is (definition conflicts refuse,
 * repo drift reconciles through `setRepo`, repo ensure-or-reuse, start short-circuits when running,
 * boot seeding + wake bootstrap are idempotent at their owners). Dry-run renders the true
 * per-segment delta AND which phase the onboarding is currently in; `--commit` executes exactly
 * that delta.
 *
 * **Usage**:
 *   node ai/scripts/fleet/onboardPeer.mjs --resident-id <s> --github-username <s>
 *       --harness-type <antigravity|claude-code|claude-desktop|codex|codex-desktop> # dry-run;
 *           [--clone-url <s> --repo-slug <s>]          # pair required unless repo already exists
 *   node ai/scripts/fleet/onboardPeer.mjs ... --commit                          # execute phase delta
 *   node ai/scripts/fleet/onboardPeer.mjs --help
 */

const
    __filename       = fileURLToPath(import.meta.url),
    REPO_ROOT        = path.resolve(path.dirname(__filename), '../../..'),
    HARNESS_FAMILIES = Object.freeze({
        'antigravity'   : 'gemini',
        'claude-code'   : 'claude',
        'claude-desktop': 'claude',
        codex           : 'gpt',
        'codex-desktop' : 'gpt'
    });

/**
 * @summary The curated harness families the conductor accepts — the launch-templated subset of the
 * shared registry vocabulary, consumed from the launch seam itself (ONE derived truth: a family
 * becomes onboardable exactly when its launch template lands; the registry re-validates on define,
 * this list only gives the CLI an early, named refusal).
 * @type {ReadonlyArray<String>}
 */
export const CURATED_HARNESS_TYPES = LAUNCHABLE_HARNESS_TYPES;

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/**
 * @summary Return a named property from an object-expression node without executing source.
 * @param {Object} objectExpression Acorn ObjectExpression node.
 * @param {String} name Property name.
 * @returns {Object|undefined} Matching Acorn Property node.
 */
function getObjectProperty(objectExpression, name) {
    return objectExpression?.type === 'ObjectExpression'
        ? objectExpression.properties.find(property => property.type === 'Property'
            && !property.computed
            && (property.key?.name === name || property.key?.value === name))
        : undefined
}

/**
 * @summary Parse the merged roster source without executing it and return the literal identity
 * facts needed by the onboarding gate. AST parsing makes comments, spreads, computed properties,
 * and unrelated strings inert; a missing/non-literal authority shape fails closed rather than
 * guessing membership or lifecycle state.
 * @param {String} source The `origin/dev:ai/graph/identityRoots.mjs` source text.
 * @returns {Map<String, {id: String, participationStatus: String|null}>} Literal identity facts.
 */
function parseIdentityRoots(source) {
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

    const roots = new Map();

    for (const element of identities.elements) {
        if (element?.type !== 'ObjectExpression') continue;

        const
            idProperty         = getObjectProperty(element, 'id'),
            propertiesProperty = getObjectProperty(element, 'properties'),
            statusProperty     = getObjectProperty(propertiesProperty?.value, 'participationStatus'),
            id                 = idProperty?.value?.type === 'Literal' ? idProperty.value.value : null,
            statusValue        = statusProperty?.value?.type === 'Literal' ? statusProperty.value.value : null;

        if (typeof id === 'string') {
            roots.set(id, {
                id,
                participationStatus: typeof statusValue === 'string' ? statusValue : null
            });
        }
    }

    return roots
}

/**
 * @summary Read one resident's literal identity facts from the merged roster authority
 * (`origin/dev`), never the conductor's current feature-branch worktree. This keeps Phase B locked
 * until the ceremony/status PR actually merged and the operator refreshed the remote-tracking ref.
 * Git is invoked shell-free; failures refuse instead of silently treating stale or unavailable
 * authority as membership.
 * @param {Object} options
 * @param {String} options.residentId Normalized resident handle.
 * @param {String} [options.repoRoot] Repository working directory.
 * @param {Function} [options.execFileImpl] Injectable `execFileSync` seam.
 * @returns {{id: String, participationStatus: String|null}|null} Merged identity facts or null.
 */
export function originDevRosterIdentity({residentId, repoRoot = REPO_ROOT, execFileImpl = execFileSync} = {}) {
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

    let roots;

    try {
        roots = parseIdentityRoots(source)
    } catch (error) {
        throw new Error('onboardPeer: cannot parse the merged identity roster at origin/dev; refresh the ref and re-run', {cause: error});
    }

    return roots.get(normalizeAgentIdentityNodeId(normalized.token)) ?? null
}

/**
 * @summary Verify exact resident membership against the merged `origin/dev` roster authority.
 * @param {Object} options See {@link originDevRosterIdentity}.
 * @returns {Boolean} Whether the merged roster contains the exact resident id.
 */
export function originDevRosterHasResident(options = {}) {
    return Boolean(originDevRosterIdentity(options))
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
export function createOnboardingFleetBridge({url = 'http://127.0.0.1:8083/fleet', bearerToken = process.env.NEO_FLEET_BEARER ?? null, fetchImpl = globalThis.fetch} = {}) {
    if (typeof fetchImpl !== 'function') {
        throw new Error('createOnboardingFleetBridge: fetchImpl must be a function.');
    }

    // The Fleet ingress is authenticated: onboarding drives lifecycle + credential verbs, so an
    // unauthenticated CLI bridge would only ever collect 401s. The bearer arrives through the
    // launch contract's in-memory channel (the same NEO_FLEET_BEARER the owner process was pinned
    // with) — never a URL, never a file. Fail closed with the remedy, not on the first request.
    if (!bearerToken) {
        throw new Error(`onboardPeer: the Fleet owner at ${url} requires the process bearer — export NEO_FLEET_BEARER (the value the owner was started with) and re-run`);
    }

    const send = async request => {
        let response;

        try {
            response = await fetchImpl(url, {
                method : 'POST',
                headers: {'Content-Type': 'application/json', Authorization: `Bearer ${bearerToken}`},
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

    return createFleetRegistryBridge(send, {
        transportFailureMessage: "onboardPeer: long-lived Fleet owner is unreachable; start it with 'npm run ai:fleet-server' and re-run"
    })
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
 * `expectedParticipationStatus` (literal merged-roster status), `graphNodeSeeded` and
 * `graphParticipationStatus` (read-only graph probe; `null` reachability remains explicit), and
 * `running` / `authRequired` (lifecycle status).
 * @param {Object} options
 * @param {Object} options.intent A valid intent from {@link buildOnboardingIntent}
 * @param {Object} options.facts Observed facts as described above
 * @returns {{phase: String, segments: Object[], gateMessage: String|null}}
 */
export function planOnboarding({intent, facts = {}} = {}) {
    const
        segments            = [],
        push                = (key, action, detail) => segments.push({key, action, detail}),
        agent               = facts.agent ?? null,
        identityNodeId      = normalizeAgentIdentityNodeId(intent.residentId),
        statusGateRequested = Object.hasOwn(facts, 'expectedParticipationStatus');

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
            gateMessage: `'${intent.residentId}' is not in the merged origin/dev roster. Next: run the roster generator above on a feature branch, open the PR (the cross-family-reviewed membership ceremony), and merge it. In the owning Memory Core runtime checkout run 'git switch dev', 'git pull --ff-only origin dev', then 'node ai/scripts/setup/seedAgentIdentities.mjs', restart the Memory Core server, and re-run this command. The gate stays closed until get_node({id:'${identityNodeId}', projection:'full'}) and who_is_online({verbose:true}) both report the merged participationStatus.`
        }
    }

    // --- Phase B segments ----------------------------------------------------------------------
    if (segments.some(segment => segment.action === 'REFUSE')) {
        return {phase: 'B', segments, gateMessage: null}
    }

    if (facts.graphNodeSeeded !== true) {
        push('preflight', 'REFUSE',
            facts.graphNodeSeeded === false
                ? `roster entry present but the graph carries no '${identityNodeId}' AgentIdentity node — in the owning Memory Core runtime checkout run 'git switch dev', 'git pull --ff-only origin dev', then 'node ai/scripts/setup/seedAgentIdentities.mjs', restart Memory Core, and re-run; unverifiable identity state never reaches launch`
                : 'the configured Memory Core graph is not reachable read-only — start or reconnect the owning Memory Core server and re-run; unverifiable identity state never reaches launch');

        return {phase: 'B', segments, gateMessage: null}
    }

    if (statusGateRequested && typeof facts.expectedParticipationStatus !== 'string') {
        push('preflight', 'REFUSE', `merged origin/dev carries no literal participationStatus for '${identityNodeId}' — refresh/reconcile the roster authority; lifecycle state is never guessed`);

        return {phase: 'B', segments, gateMessage: null}
    }

    if (statusGateRequested && facts.graphParticipationStatus !== facts.expectedParticipationStatus) {
        push('preflight', 'REFUSE',
            `merged origin/dev expects '${identityNodeId}' participationStatus '${facts.expectedParticipationStatus}', but the graph projects '${facts.graphParticipationStatus ?? 'missing'}' — in the owning Memory Core runtime checkout run 'git switch dev', 'git pull --ff-only origin dev', then 'node ai/scripts/setup/seedAgentIdentities.mjs', restart Memory Core, and re-run. The gate stays closed until get_node({id:'${identityNodeId}', projection:'full'}) and who_is_online({verbose:true}) both report '${facts.expectedParticipationStatus}'`);

        return {phase: 'B', segments, gateMessage: null}
    }

    push('preflight', 'OK', statusGateRequested
        ? `merged roster + full '${identityNodeId}' graph projection agree on participationStatus '${facts.expectedParticipationStatus}'`
        : `roster entry + seeded '${identityNodeId}' AgentIdentity node verified`);

    push('launch', facts.running ? 'EXISTS' : 'CREATE',
        facts.running
            ? `'${intent.agentId}' is already running — start short-circuits to status`
            : `FleetManager.startAgent('${intent.agentId}') — provision-then-start via the curated '${intent.harnessType}' template`);

    // The auth segment names the FAMILY's auth mode, not just the marker heuristic: in-app
    // families carry a permanently-null `authRequired` (no marker exists), so their handoff is the
    // in-window sign-in — rendered from the launch contract's authMode, mirroring the exact
    // decision `deriveAuthHandoff` makes post-launch (dry-run and --commit cannot drift). env-key
    // families have no per-home step at all — the provider key rides the spawned env.
    push('auth', 'PRINT',
        getHarnessAuthMode(intent.harnessType) === 'in-app'
            ? 'in-app sign-in inside the Fleet-launched window (operator-owned; if closed, restart through this command --commit or Fleet cockpit Start)'
            : getHarnessAuthMode(intent.harnessType) === 'env-key'
                ? 'auth rides the spawned env (provider API key in the seat env) — no per-home login step; verify the key is provisioned before start'
                : facts.authRequired === false
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
 * @summary Build the exact operator-owned login command for marker-auth families from the typed
 * auth home + executable resolved by the lifecycle service. In-app GUI families never enter this
 * helper: authentication happens inside the already Fleet-launched window, and any restart stays
 * owned by Fleet. The split is load-bearing for Codex Desktop: its bundled CLI authenticates the
 * nested Codex home, while its GUI main is never invoked as a login command. Paths are never
 * guessed from resident id/PATH and are shell-quoted as data.
 * @param {Object} options
 * @param {String} options.harnessType Curated marker-auth family.
 * @param {String} options.authHome Absolute marker/auth home from lifecycle status.
 * @param {String} options.authCommand Absolute auth executable from lifecycle status.
 * @returns {String}
 */
export function buildLoginCommand({harnessType, authHome, authCommand} = {}) {
    if (!CURATED_HARNESS_TYPES.includes(harnessType)) {
        throw new Error(`buildLoginCommand: unsupported harnessType '${String(harnessType)}'.`);
    }
    if (getHarnessAuthMode(harnessType) !== 'marker') {
        throw new Error(`buildLoginCommand: harnessType '${harnessType}' has authMode '${getHarnessAuthMode(harnessType)}'; login commands are marker-family only.`);
    }
    if (typeof authHome !== 'string' || !path.isAbsolute(authHome) || CONTROL_CHARACTERS.test(authHome)) {
        throw new Error('buildLoginCommand: lifecycle status must provide a control-character-free absolute authHome.');
    }
    if (typeof authCommand !== 'string' || !path.isAbsolute(authCommand) || CONTROL_CHARACTERS.test(authCommand)) {
        throw new Error('buildLoginCommand: lifecycle status must provide a control-character-free absolute authCommand.');
    }

    const
        quote         = value => `'${value.replaceAll("'", "'\\''")}'`,
        quotedHome    = quote(authHome),
        quotedCommand = quote(authCommand);

    switch (harnessType) {
        case 'codex':
        case 'codex-desktop':
            return `CODEX_HOME=${quotedHome} ${quotedCommand} login`;
        case 'claude-code':
            return `CLAUDE_CONFIG_DIR=${quotedHome} ${quotedCommand}  # then /login inside the session`;
        default:
            throw new Error(`buildLoginCommand: marker-family '${harnessType}' has no login renderer.`);
    }
}

/**
 * @summary The post-launch auth handoff DECISION — the one branch `--commit` executes after
 * `startAgent` returns, extracted pure so tests enter where the real conductor does. Mode-first:
 * an `'in-app'` family (permanently-null `authRequired` — no marker exists) ALWAYS hands off the
 * in-window sign-in instruction and routes a closed-window recovery back through Fleet; an
 * `'env-key'` family has no per-home step at all (the provider key rides the spawned env), so the
 * handoff is `done` plus the provisioning reminder; a `'marker'` family branches on the live
 * heuristic (`true` → the login command, `false` → done, `null` → an honest WARN, never a
 * guessed command).
 * @param {Object} options
 * @param {String} options.harnessType Curated harness family.
 * @param {Object} options.status The long-lived owner's `startAgent`/`status` projection —
 *                                marker branches consume `{authRequired, authHome, authCommand}`;
 *                                in-app branches deliberately emit none of the launch details.
 * @returns {{kind: 'sign-in-app'|'login-required'|'done'|'unknown', lines: String[]}} printable
 * lines in conductor voice; `kind` is the decision itself, assertable without string-matching.
 */
export function deriveAuthHandoff({harnessType, status} = {}) {
    if (getHarnessAuthMode(harnessType) === 'in-app') {
        return {
            kind : 'sign-in-app',
            lines: [
                '',
                '  SIGN-IN REQUIRED (operator-owned, inside the already Fleet-launched app window):',
                '    Sign in inside that window.',
                '    If it was closed, restart through Fleet: re-run this onboardPeer command with --commit, or use Start in the Fleet cockpit.'
            ]
        };
    }

    if (getHarnessAuthMode(harnessType) === 'env-key') {
        return {
            kind : 'done',
            lines: ['  [DONE] auth — env-key family: the provider API key rides the spawned env; no per-home login step exists (verify the seat env carries it before start)']
        };
    }

    if (status.authRequired === true) {
        return {
            kind : 'login-required',
            lines: [
                '',
                '  LOGIN REQUIRED (operator-owned, exactly once for this home):',
                `    ${buildLoginCommand({harnessType, authHome: status.authHome, authCommand: status.authCommand})}`
            ]
        };
    }

    if (status.authRequired === false) {
        return {kind: 'done', lines: ['  [DONE] auth — per-home credentials already present']};
    }

    return {kind: 'unknown', lines: ['  [WARN] auth — the owner returned no curated auth state; no login command was guessed']};
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
    console.log(`           --harness-type <${CURATED_HARNESS_TYPES.join('|')}> [--clone-url <s> --repo-slug <s>] [--commit]`);
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

    const rosterIdentity = originDevRosterIdentity({residentId: intent.residentId});

    // Read-only full-node probe: absent file / absent node / malformed projection are DISTINCT
    // facts. The planner compares persisted lifecycle truth with the exact merged roster record.
    let
        graphNodeSeeded          = null,
        graphParticipationStatus = null;
    const graphPath = memoryCoreConfig.storagePaths.graph;

    if (typeof graphPath === 'string' && graphPath !== ':memory:' && existsSync(graphPath)) {
        const {default: Database} = await import('better-sqlite3');
        const sqlite              = new Database(graphPath, {readonly: true});

        try {
            const row = sqlite.prepare('SELECT data FROM Nodes WHERE id = ? LIMIT 1').get(normalizeAgentIdentityNodeId(intent.residentId));

            graphNodeSeeded = Boolean(row);

            if (row?.data) {
                try {
                    graphParticipationStatus = JSON.parse(row.data).properties?.participationStatus ?? null;
                } catch {
                    // Malformed persisted identity data is unverifiable, never launchable.
                    graphNodeSeeded = null;
                }
            }
        } finally {
            sqlite.close();
        }
    }

    const facts = {
        agent,
        rosterHasResident          : Boolean(rosterIdentity),
        expectedParticipationStatus: rosterIdentity?.participationStatus ?? null,
        graphNodeSeeded,
        graphParticipationStatus,
        running                    : Boolean(runtimeRows.find(row => row.agentId === intent.agentId)?.running),
        authRequired               : null
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

        // The auth handoff is the tested decision (`deriveAuthHandoff`): mode-first, so in-app
        // families reach their sign-in instruction despite a permanently-null authRequired.
        for (const line of deriveAuthHandoff({harnessType: intent.harnessType, status}).lines) {
            console.log(line);
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
