#!/usr/bin/env node
import fs                             from 'node:fs';
import path                           from 'node:path';
import {execFileSync}                 from 'node:child_process';
import {fileURLToPath}                from 'node:url';
import {normalizeAgentIdentityNodeId} from '../../graph/normalizeAgentIdentityNodeId.mjs';

/**
 * @module ai/scripts/setup/generateRosterOnboarding
 * @summary Roster-onboarding artifact generator (R3b of the peer-onboarding rail): derives the
 * FOUR committed-file surfaces a new resident's onboarding PR must touch, as a reviewable
 * payload. After merge, Memory Core seeds the committed root; the real first-boot envelope owns
 * wake self-registration and the observation-driven first embodiment era.
 *
 * The four surfaces (derived from the live files, never from memory):
 *
 * 1. `ai/graph/identityRoots.mjs` — the resident's `IDENTITIES` roster entry (Layer-1
 *    operational fields only; pending-first-boot lifecycle state)
 * 2. `README.md` — the maintainer roster row (Name / Maintainer / Role / Identity table)
 * 3. `learn/agentos/ModelStats.md` — the capability section skeleton under the pending
 *    identities heading, with source-citation placeholders
 * 4. `test/playwright/unit/ai/graph/identityRoots.spec.mjs` — the roster pin
 *
 * **Why the input surface has NO model/engine parameter (load-bearing):** engine facts
 * (designation, context window, pricing, thought budget, release date, tier) are
 * OBSERVATION-OWNED — they are recorded from the live harness at first boot and land through
 * the source-cited ModelStats.md discipline. An operator prediction at onboarding time would
 * fabricate them; the roster deliberately carries no current-engine field, so every
 * engine-class input (flag or option key) is rejected loudly instead of ignored.
 *
 * **Why there is NO socialName-class parameter either (mirrors the Day-0 sibling):** Social
 * Names are the post-boot peer-naming ritual — peer-sketched, bearer-assented, peer-vetoable,
 * operator-confirmed — never seed data. The resident gets the handle-derived display form
 * only; socialName-class inputs are rejected loudly.
 *
 * **Dry-run by default; `--write` is branch-guarded:** the default run PRINTS the four
 * proposed modifications (proposed snippet + insertion anchor per surface) and applies
 * nothing. `--write` applies them via normal file APIs ONLY on a non-`dev`/non-`main` git
 * branch — the payload always travels as a reviewable branch + PR, never as a live edit to an
 * integration branch. The generator never pushes and never opens the PR itself.
 *
 * **Idempotency:** a resident already present in a surface reports EXISTS and emits no
 * duplicate; `--write` skips EXISTS surfaces, so a partially-applied payload completes on
 * re-run and a second run changes nothing.
 *
 * Everything decision-shaped is pure and fail-closed: planners return
 * `{valid, reason, ...}` / per-surface `{status, reason, ...}` and never throw; a missing
 * insertion anchor refuses loudly and writes nothing.
 *
 * **Usage**:
 *   node ai/scripts/setup/generateRosterOnboarding.mjs --handle <s> --family <s>
 *       [--github-username <s>]                        # dry-run (default): print the payload
 *   node ai/scripts/setup/generateRosterOnboarding.mjs ... --write   # apply on a work branch
 *   node ai/scripts/setup/generateRosterOnboarding.mjs --help        # print usage
 */

const __filename = fileURLToPath(import.meta.url);

/**
 * @summary The socialName-class option keys the input surface REJECTS. Social Names are the
 * post-boot peer-naming ritual (bearer-assented), never seed data — rejecting instead of
 * ignoring keeps the guard visible to callers.
 * @type {ReadonlyArray<String>}
 */
export const SOCIAL_NAME_CLASS_KEYS = Object.freeze([
    'disclosablePrior', 'name', 'salute', 'socialLayer', 'socialName'
]);

/**
 * @summary The socialName-class CLI flags rejected with the ritual pointer (the flag-shaped
 * mirror of {@link SOCIAL_NAME_CLASS_KEYS}).
 * @type {ReadonlyArray<String>}
 */
export const SOCIAL_NAME_CLASS_FLAGS = Object.freeze([
    '--disclosable-prior', '--name', '--salute', '--social-layer', '--social-name'
]);

/**
 * @summary The engine-class option keys the input surface REJECTS. Engine facts are
 * observation-owned: they are recorded from the live harness at first boot and land through
 * the source-cited ModelStats.md discipline — an onboarding-time prediction would fabricate
 * them.
 * @type {ReadonlyArray<String>}
 */
export const ENGINE_CLASS_KEYS = Object.freeze([
    'contextWindowInput', 'designation', 'engine', 'model', 'modelDesignation',
    'pricingInput', 'pricingOutput', 'releaseDate', 'thoughtBudget', 'tier'
]);

/**
 * @summary The engine-class CLI flags rejected with the observation pointer (the flag-shaped
 * mirror of {@link ENGINE_CLASS_KEYS}).
 * @type {ReadonlyArray<String>}
 */
export const ENGINE_CLASS_FLAGS = Object.freeze([
    '--context-window', '--designation', '--engine', '--model', '--model-designation',
    '--pricing-input', '--pricing-output', '--release-date', '--thought-budget', '--tier'
]);

/**
 * @summary Vendor + display token per known model family, for README/ModelStats prose.
 * Unknown families render with the bare family token — never a guessed vendor.
 * @type {Object}
 */
export const FAMILY_DISPLAY = Object.freeze({
    claude: Object.freeze({vendor: 'Anthropic',           display: 'Claude'}),
    gemini: Object.freeze({vendor: 'Google DeepMind',     display: 'Gemini'}),
    gemma : Object.freeze({vendor: 'Google open-weights', display: 'Gemma'}),
    gpt   : Object.freeze({vendor: 'OpenAI',              display: 'GPT'})
});

/**
 * @summary Handle-token display overrides for operational acronyms that must not be title-cased.
 * @type {Object}
 */
export const DISPLAY_TOKEN_OVERRIDES = Object.freeze({
    gpt: 'GPT'
});

/**
 * @summary Repo-root-relative paths of the four onboarding surfaces.
 * @type {Object}
 */
export const SURFACE_PATHS = Object.freeze({
    identityRoots: 'ai/graph/identityRoots.mjs',
    modelStats   : 'learn/agentos/ModelStats.md',
    readme       : 'README.md',
    spec         : 'test/playwright/unit/ai/graph/identityRoots.spec.mjs'
});

/**
 * @summary Escapes a literal value for safe embedding inside a RegExp source.
 * @param {String} value The literal to escape
 * @returns {String}
 */
export function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @summary Normalizes a handle-shaped input to its canonical `@`-prefixed form; fail-closed on
 * empty or malformed values.
 * @param {String} value Raw handle input (with or without the `@` prefix)
 * @param {String} label Field name for the refusal message
 * @returns {{valid: Boolean, reason: String|null, handle: String|null}}
 */
export function normalizeHandle(value, label) {
    if (typeof value !== 'string' || value.trim() === '') {
        return {valid: false, reason: `${label} requires a non-empty string`, handle: null};
    }

    const body = value.trim().replace(/^@/, '');

    if (!/^[a-z0-9][a-z0-9-]*$/.test(body)) {
        return {valid: false, reason: `${label} must be a lowercase handle ([a-z0-9-], e.g. '@neo-fable-clio') — received '${value}'`, handle: null};
    }

    return {valid: true, reason: null, handle: normalizeAgentIdentityNodeId(body)}
}

/**
 * @summary Derives the handle-derived DISPLAY form from a resident handle — the operational
 * default a resident keeps until (and unless) the naming ritual grants a Social Name.
 * E.g. '@neo-fable-clio' → 'Neo Fable Clio'.
 * @param {String} handle The `@`-prefixed resident handle
 * @returns {String}
 */
export function deriveDisplayForm(handle) {
    return handle
        .replace(/^@/, '')
        .split('-')
        .map(part => DISPLAY_TOKEN_OVERRIDES[part] || part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

/**
 * @summary Derives the ModelStats section anchor from a resident handle.
 * E.g. '@neo-fable-clio' → 'neo_fable_clio' (rendered as `§neo_fable_clio`).
 * @param {String} handle The `@`-prefixed resident handle
 * @returns {String}
 */
export function deriveSectionAnchor(handle) {
    return handle.replace(/^@/, '').replace(/-/g, '_');
}

/**
 * @summary Builds the frozen onboarding plan (the PURE input half): normalized handles, the
 * handle-derived display form, the ModelStats section anchor, and the generation timestamp.
 * The input surface has NO engine-class and NO socialName-class parameter (module JSDoc);
 * both classes are rejected loudly.
 * @param {Object} options
 * @param {String} options.handle The resident handle — the roster id and A2A address
 * @param {String} options.family Model family (e.g. 'claude' | 'gpt' | 'gemini')
 * @param {String} [options.githubUsername] GitHub login (defaults to the handle)
 * @param {Date|String} [options.now] Clock override for deterministic tests; defaults to the real now
 * @returns {{valid: Boolean, reason: String|null, plan: Object|null}}
 */
export function buildOnboardingPlan(options = {}) {
    const socialLeaks = SOCIAL_NAME_CLASS_KEYS.filter(key => key in options);

    if (socialLeaks.length > 0) {
        return {valid: false, reason: `socialName-class inputs are rejected by design: ${socialLeaks.join(', ')} — Social Names are the post-boot peer-naming ritual (bearer-assented), never seed data`, plan: null};
    }

    const engineLeaks = ENGINE_CLASS_KEYS.filter(key => key in options);

    if (engineLeaks.length > 0) {
        return {valid: false, reason: `engine-class inputs are rejected by design: ${engineLeaks.join(', ')} — engine facts are observation-owned and land through the source-cited ModelStats.md discipline at first boot, never as onboarding predictions`, plan: null};
    }

    const resident = normalizeHandle(options.handle, '--handle');

    if (!resident.valid) {
        return {valid: false, reason: resident.reason, plan: null};
    }

    if (typeof options.family !== 'string' || !/^[a-z][a-z0-9-]*$/.test(options.family)) {
        return {valid: false, reason: `--family must be a lowercase family token (e.g. 'claude') — received '${String(options.family)}'`, plan: null};
    }

    const github = normalizeHandle(options.githubUsername === undefined ? resident.handle : options.githubUsername, '--github-username');

    if (!github.valid) {
        return {valid: false, reason: github.reason, plan: null};
    }

    const nowMs = Date.parse(options.now === undefined ? new Date().toISOString() : options.now);

    if (!Number.isFinite(nowMs)) {
        return {valid: false, reason: `the generation timestamp must be parseable — received '${String(options.now)}' (the pending-state 'since' records the ACTUAL onboarding time; no backfill)`, plan: null};
    }

    const handle = resident.handle,
          family = FAMILY_DISPLAY[options.family] || null;

    return {
        valid : true,
        reason: null,
        plan  : Object.freeze({
            handle,
            handleBody    : handle.slice(1),
            family        : options.family,
            familyVendor  : family && family.vendor,
            familyDisplay : family ? family.display : options.family,
            githubUsername: github.handle,
            githubBody    : github.handle.slice(1),
            displayForm   : deriveDisplayForm(handle),
            sectionAnchor : deriveSectionAnchor(handle),
            since         : new Date(nowMs).toISOString()
        })
    }
}

/**
 * @summary Renders the resident's `IDENTITIES` roster entry for `ai/graph/identityRoots.mjs`:
 * Schema-backed identity fields only, pending-first-boot lifecycle state, and deliberately NO
 * capability fields (engine facts are observation-owned), workflow contracts, or static
 * subscriptionTemplate (committing harness metadata at onboarding would fabricate boot facts).
 * @param {Object} plan A valid plan from {@link buildOnboardingPlan}
 * @returns {String} The entry block, indented for the `IDENTITIES` array, ending with `},`
 */
export function renderRosterEntry(plan) {
    const familyLabel = plan.familyVendor ? `${plan.familyVendor} ${plan.familyDisplay}` : plan.familyDisplay;

    return `    {
        id         : '${plan.handle}',
        type       : 'AgentIdentity',
        name       : '${plan.displayForm}', // Handle-derived display form — the Social Name is the post-boot peer-naming ritual (bearer-assented), never onboarding seed data
        description: '${familyLabel} Agent Identity with version-free handle; engine designation pending first-boot observation.',
        properties : {
            githubLogin     : '${plan.githubUsername}',
            displayName     : '${plan.displayForm}',
            modelFamily     : '${plan.family}',
            accountType     : 'agent',
            trustTier       : TRUST_TIERS.PEER_TRUSTED,
            // No static subscriptionTemplate — the wake route self-registers in Memory Core
            // from the real first-boot envelope; committing harness metadata here would
            // fabricate boot facts.
            // No capability fields — engine facts are observation-owned and land through the
            // source-cited ModelStats.md discipline once the first boot is observed.
            family: '${plan.family}',
            // Pending first boot: excluded from active routing, quorum, and review-approval
            // semantics until the first-boot ritual completes and this flips to 'active'.
            participationStatus: 'temporarily_unreachable',
            statusReason       : 'First boot pending',
            authority          : '@tobiu',
            since              : '${plan.since}',
            reactivationTrigger: 'Operator confirms participation activation after first boot',
            createdAt          : '${plan.since}'
        }
    },`;
}

/**
 * @summary Renders the resident's README maintainer roster row. The Name cell stays `-` (no
 * Social Name at onboarding); the Role cell carries the family only — the engine designation
 * is observation-owned and lands post-boot.
 * @param {Object} plan A valid plan from {@link buildOnboardingPlan}
 * @returns {String} The single table row
 */
export function renderReadmeRow(plan) {
    const familyPhrase = plan.familyVendor ? `${plan.familyVendor} ${plan.familyDisplay}` : plan.familyDisplay;

    return `| - | [@${plan.githubBody}](https://github.com/${plan.githubBody}) | AI maintainer (${familyPhrase} family — engine designation pending first boot) | Machine Account |`;
}

/**
 * @summary Renders the resident's ModelStats.md capability section skeleton: every
 * observation-owned value is an explicit source-citation placeholder — never an invented
 * capability fact. Lands under the pending identities heading; the activation flip moves the
 * section and fills the values source-cited.
 * @param {Object} plan A valid plan from {@link buildOnboardingPlan}
 * @returns {String} The markdown section (no trailing newline)
 */
export function renderModelStatsSection(plan) {
    const familyCell = plan.familyVendor ? '`' + plan.family + '` (' + plan.familyVendor + ')' : '`' + plan.family + '`';

    return [
        '### §' + plan.sectionAnchor,
        '',
        '| Field | Value |',
        '|---|---|',
        '| `id` / `githubLogin` | `' + plan.handle + '` |',
        '| `name` | (engine designation: V-B-A pending — observation-owned; recorded from the live harness at first boot) |',
        '| `family` | ' + familyCell + ' |',
        '| `participationStatus` | `temporarily_unreachable` (provisioned ahead of first boot — onboarding in progress; flips to `active` when the first-boot ritual completes) |',
        '| `hosting` | (V-B-A pending — recorded at first boot) |',
        '| `tier` | (V-B-A pending — recorded at first boot) |',
        '| `contextWindowInput` | (V-B-A pending — model card / official docs cite needed) |',
        '| `parallelToolCalls` | (V-B-A pending — model card / official docs cite needed) |',
        '| `thoughtBudget` | (V-B-A pending — record the harness setting in use at first boot) |',
        '| `releaseDate` | (V-B-A pending — model card cite needed) |',
        '| `pricingInput` | (V-B-A pending — model card cite needed) |',
        '| `pricingOutput` | (V-B-A pending — model card cite needed) |',
        '| `sunsetTriggers` | (V-B-A pending — defined against the observed engine at the activation flip) |',
        '',
        '**Sources** (primary first):',
        '- **Primary**: (pending — cite the model card / release notes / official docs for the observed engine at first boot; capability values are never guessed at onboarding)',
        '- **Primary**: GitHub account `' + plan.githubBody + '` (verify profile name + AI-disclosure bio at account creation)'
    ].join('\n');
}

/**
 * @summary Renders the resident's roster pin for `identityRoots.spec.mjs`: Layer-1 identity
 * invariants only. Lifecycle state stays unpinned (status flips are their own PRs); the
 * engine-fact absence assertions hold until the activation flip lands source-cited capability
 * fields and updates the pin alongside the roster entry.
 * @param {Object} plan A valid plan from {@link buildOnboardingPlan}
 * @returns {String} The spec block (no trailing newline)
 */
export function renderSpecPin(plan) {
    return `/**
 * @summary Roster pin for the onboarded resident ${plan.handle}: Layer-1 identity invariants only.
 *
 * Lifecycle state (participationStatus) is deliberately unpinned — status flips are their own
 * PRs. The engine-fact absence assertions hold until the activation flip lands source-cited
 * capability fields; that PR updates this pin alongside the roster entry.
 */
test.describe('ai/graph/identityRoots — ${plan.handle} roster pin', () => {
    const findIdentity = id => IDENTITIES.find(node => node.type === 'AgentIdentity' && node.id === id);

    test('${plan.handle} is a registered AgentIdentity root with Layer-1 operational fields', () => {
        const entry = findIdentity('${plan.handle}');

        expect(entry, '${plan.handle} must be a registered AgentIdentity root').toBeTruthy();
        expect(entry).toMatchObject({
            id        : '${plan.handle}',
            type      : 'AgentIdentity',
            properties: {
                githubLogin: '${plan.githubUsername}',
                displayName: '${plan.displayForm}',
                modelFamily: '${plan.family}',
                accountType: 'agent',
                trustTier  : 'peer-trusted'
            }
        });
    });

    test('${plan.handle} commits no static wake template and no engine facts (observation-owned)', () => {
        const entry = findIdentity('${plan.handle}');

        expect(entry.properties).not.toHaveProperty('subscriptionTemplate');
        expect(entry.properties).not.toHaveProperty('modelAssignment');
        expect(entry.properties).not.toHaveProperty('contextWindowInput');
        expect(entry.properties).not.toHaveProperty('pricingInput');
        expect(entry.properties).not.toHaveProperty('pricingOutput');
    });
});`;
}

/**
 * @summary Plans the `identityRoots.mjs` surface: EXISTS when the roster already carries the
 * resident's id; otherwise inserts the entry immediately before the `AGENT:*`
 * BroadcastSentinel entry (the roster's stable tail). Fail-closed when the anchor is missing.
 * @param {String} source Current file content
 * @param {Object} plan A valid plan from {@link buildOnboardingPlan}
 * @returns {{surface: String, path: String, status: String, reason: String|null, anchor: String, snippet: String, updated: String|null}}
 */
export function planRosterSurface(source, plan) {
    const base = {surface: 'identityRoots', path: SURFACE_PATHS.identityRoots, anchor: `immediately before the 'AGENT:*' BroadcastSentinel entry`, snippet: renderRosterEntry(plan)};

    if (typeof source !== 'string' || source === '') {
        return {...base, status: 'invalid', reason: 'identityRoots source must be a non-empty string', updated: null};
    }

    if (new RegExp(`id\\s*:\\s*'${escapeRegExp(plan.handle)}'`).test(source)) {
        return {...base, status: 'exists', reason: `${plan.handle} already has an IDENTITIES roster entry`, updated: null};
    }

    const sentinel = source.match(/\n    \{\n\s+id\s*:\s*'AGENT:\*'/);

    if (!sentinel) {
        return {...base, status: 'invalid', reason: `insertion anchor not found: the 'AGENT:*' BroadcastSentinel entry is missing from ${SURFACE_PATHS.identityRoots}`, updated: null};
    }

    const insertAt = sentinel.index + 1;

    return {
        ...base,
        status : 'insert',
        reason : null,
        updated: source.slice(0, insertAt) + base.snippet + '\n' + source.slice(insertAt)
    };
}

/**
 * @summary Plans the README surface: EXISTS when the roster table already links the resident's
 * GitHub account; otherwise appends the row after the last row of the maintainer roster table.
 * Fail-closed when the table header is missing.
 * @param {String} source Current file content
 * @param {Object} plan A valid plan from {@link buildOnboardingPlan}
 * @returns {{surface: String, path: String, status: String, reason: String|null, anchor: String, snippet: String, updated: String|null}}
 */
export function planReadmeSurface(source, plan) {
    const base = {surface: 'readme', path: SURFACE_PATHS.readme, anchor: 'appended after the last row of the maintainer roster table', snippet: renderReadmeRow(plan)};

    if (typeof source !== 'string' || source === '') {
        return {...base, status: 'invalid', reason: 'README source must be a non-empty string', updated: null};
    }

    if (source.includes(`](https://github.com/${plan.githubBody})`)) {
        return {...base, status: 'exists', reason: `@${plan.githubBody} already has a maintainer roster row`, updated: null};
    }

    const lines     = source.split('\n'),
          headerIdx = lines.indexOf('| Name | Maintainer | Role | Identity |');

    if (headerIdx === -1) {
        return {...base, status: 'invalid', reason: `insertion anchor not found: the '| Name | Maintainer | Role | Identity |' table header is missing from ${SURFACE_PATHS.readme}`, updated: null};
    }

    let end = headerIdx + 1;

    while (end < lines.length && lines[end].startsWith('|')) {
        end++;
    }

    lines.splice(end, 0, base.snippet);

    return {...base, status: 'insert', reason: null, updated: lines.join('\n')};
}

/**
 * @summary Plans the ModelStats.md surface: EXISTS when the section anchor or the resident's
 * id/githubLogin cell is already present; otherwise inserts the skeleton inside the pending
 * identities section, before the divider that closes it. Fail-closed when the heading or
 * divider is missing.
 * @param {String} source Current file content
 * @param {Object} plan A valid plan from {@link buildOnboardingPlan}
 * @returns {{surface: String, path: String, status: String, reason: String|null, anchor: String, snippet: String, updated: String|null}}
 */
export function planModelStatsSurface(source, plan) {
    const base = {surface: 'modelStats', path: SURFACE_PATHS.modelStats, anchor: 'inside §pending_swarm_identities, before the closing divider', snippet: renderModelStatsSection(plan)};

    if (typeof source !== 'string' || source === '') {
        return {...base, status: 'invalid', reason: 'ModelStats source must be a non-empty string', updated: null};
    }

    if (source.includes(`### §${plan.sectionAnchor}\n`) || source.includes('| `id` / `githubLogin` | `' + plan.handle + '` |')) {
        return {...base, status: 'exists', reason: `${plan.handle} already has a ModelStats section`, updated: null};
    }

    const headingIdx = source.indexOf('\n## §pending_swarm_identities');

    if (headingIdx === -1) {
        return {...base, status: 'invalid', reason: `insertion anchor not found: the '## §pending_swarm_identities' heading is missing from ${SURFACE_PATHS.modelStats}`, updated: null};
    }

    const dividerIdx = source.indexOf('\n---\n', headingIdx);

    if (dividerIdx === -1) {
        return {...base, status: 'invalid', reason: `insertion anchor not found: no '---' divider closes §pending_swarm_identities in ${SURFACE_PATHS.modelStats}`, updated: null};
    }

    return {
        ...base,
        status : 'insert',
        reason : null,
        updated: source.slice(0, dividerIdx) + '\n' + base.snippet + '\n' + source.slice(dividerIdx)
    };
}

/**
 * @summary Plans the roster-pin spec surface: EXISTS when the spec already references the
 * resident's handle as a quoted literal (any existing reference means a pin or invariant
 * already covers the identity — emitting another block would duplicate coverage); otherwise
 * appends the pin block at the end of the spec.
 * @param {String} source Current file content
 * @param {Object} plan A valid plan from {@link buildOnboardingPlan}
 * @returns {{surface: String, path: String, status: String, reason: String|null, anchor: String, snippet: String, updated: String|null}}
 */
export function planSpecSurface(source, plan) {
    const base = {surface: 'spec', path: SURFACE_PATHS.spec, anchor: 'appended at the end of the spec file', snippet: renderSpecPin(plan)};

    if (typeof source !== 'string' || source === '') {
        return {...base, status: 'invalid', reason: 'spec source must be a non-empty string', updated: null};
    }

    if (source.includes(`'${plan.handle}'`)) {
        return {...base, status: 'exists', reason: `${plan.handle} is already referenced by the roster spec`, updated: null};
    }

    return {
        ...base,
        status : 'insert',
        reason : null,
        updated: source.replace(/\s*$/, '\n') + '\n' + base.snippet + '\n'
    };
}

/**
 * @summary Plans all four onboarding surfaces from live file contents — the single source both
 * the dry-run rendering and the `--write` path consume, so "what dry-run prints" and "what
 * `--write` applies" cannot drift. Fail-closed: any invalid surface invalidates the whole
 * payload and nothing is applicable.
 * @param {Object} plan A valid plan from {@link buildOnboardingPlan}
 * @param {Object} files Current file contents keyed `{identityRoots, readme, modelStats, spec}`
 * @returns {{valid: Boolean, reason: String|null, surfaces: Object[]}}
 */
export function planOnboardingSurfaces(plan, files = {}) {
    if (!plan || typeof plan.handle !== 'string') {
        return {valid: false, reason: 'planOnboardingSurfaces requires a valid plan from buildOnboardingPlan', surfaces: []};
    }

    for (const key of ['identityRoots', 'modelStats', 'readme', 'spec']) {
        if (typeof files[key] !== 'string') {
            return {valid: false, reason: `missing file content for surface '${key}'`, surfaces: []};
        }
    }

    const surfaces = [
        planRosterSurface(files.identityRoots, plan),
        planReadmeSurface(files.readme, plan),
        planModelStatsSurface(files.modelStats, plan),
        planSpecSurface(files.spec, plan)
    ];

    const invalid = surfaces.find(surface => surface.status === 'invalid');

    return {
        valid : !invalid,
        reason: invalid ? invalid.reason : null,
        surfaces
    };
}

/**
 * @summary Advisory notes printed with every payload — adjacent concerns the generator
 * deliberately does NOT write (they are either untouchable by rule or editorial).
 * @param {Object} plan A valid plan from {@link buildOnboardingPlan}
 * @returns {String[]}
 */
export function renderAdvisoryNotes(plan) {
    return [
        '[generateRosterOnboarding] advisory (printed, never written):',
        '  - ModelStats §update_history: add a row citing the onboarding PR number once the PR exists.',
        '  - README credits: the co-developed-by sentence near the end of the README lists maintainer handles; extending it is an editorial call at review time.',
        '  - Activation flip: participationStatus \'active\' and source-cited capability facts land after first boot; never infer a peer role from model family or staffing utility.'
    ];
}

/**
 * @summary Renders the payload report: per-surface status, target path, insertion anchor, and
 * the exact proposed snippet — the dry-run output IS the write set.
 * @param {Object} plan A valid plan from {@link buildOnboardingPlan}
 * @param {Object} planned The result of {@link planOnboardingSurfaces}
 * @returns {String[]}
 */
export function renderOnboardingReport(plan, planned) {
    const lines = [
        `[generateRosterOnboarding] four-surface onboarding payload for ${plan.handle} (family: ${plan.family})`,
        ''
    ];

    for (const surface of planned.surfaces) {
        lines.push(`  [${surface.status.toUpperCase()}] ${surface.path}`);

        if (surface.status === 'insert') {
            lines.push(`      anchor: ${surface.anchor}`);
            lines.push(...surface.snippet.split('\n').map(line => `      ${line}`.replace(/\s+$/, '')));
        } else {
            lines.push(`      ${surface.reason}`);
        }

        lines.push('');
    }

    lines.push(...renderAdvisoryNotes(plan));

    return lines;
}

/**
 * @summary The pure `--write` branch guard: committed-file application is allowed ONLY on a
 * resolvable git work branch that is neither `dev` nor `main` — the payload always travels as
 * a reviewable branch + PR, never as a live edit to an integration branch.
 * @param {Object} options
 * @param {String|null} options.branch Current branch name from `git rev-parse --abbrev-ref HEAD`, or null when unresolvable
 * @returns {{valid: Boolean, reason: String|null}}
 */
export function checkWriteGuard({branch} = {}) {
    if (typeof branch !== 'string' || branch.trim() === '') {
        return {valid: false, reason: '--write requires a git work tree with a resolvable branch — refusing to apply'};
    }

    const name = branch.trim();

    if (name === 'HEAD') {
        return {valid: false, reason: '--write refuses a detached HEAD — check out a work branch first'};
    }

    if (name === 'dev' || name === 'main') {
        return {valid: false, reason: `--write refuses to apply on '${name}' — onboarding payloads travel as a reviewable branch + PR, never as a live edit to an integration branch`};
    }

    return {valid: true, reason: null}
}

/**
 * @summary Parses the CLI argv (pure, hand-rolled by design: unknown flags refuse instead of
 * being silently ignored; socialName-class flags refuse with the ritual pointer and
 * engine-class flags with the observation pointer — all three are part of the tested input
 * contract). Required-field enforcement lives in {@link buildOnboardingPlan}; this layer owns
 * flag SYNTAX only.
 * @param {String[]} argv Arguments after the script path (`process.argv.slice(2)`)
 * @returns {{valid: Boolean, reason: String|null, options: Object|null}}
 */
export function parseGenerateArgs(argv = []) {
    const valueFlags = {
        '--family'         : 'family',
        '--github-username': 'githubUsername',
        '--handle'         : 'handle'
    };

    const booleanFlags = {
        '--help' : 'help',
        '--write': 'write'
    };

    const options = {help: false, write: false};

    for (let i = 0; i < argv.length; i++) {
        const flag = argv[i];

        if (SOCIAL_NAME_CLASS_FLAGS.includes(flag)) {
            return {valid: false, reason: `${flag} is rejected by design — Social Names are the post-boot peer-naming ritual (bearer-assented), never seed data`, options: null};
        }

        if (ENGINE_CLASS_FLAGS.includes(flag)) {
            return {valid: false, reason: `${flag} is rejected by design — engine facts are observation-owned and land through the source-cited ModelStats.md discipline at first boot, never as onboarding predictions`, options: null};
        }

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

        return {valid: false, reason: `unknown option '${flag}' — the generator accepts only: ${[...Object.keys(valueFlags), ...Object.keys(booleanFlags)].join(', ')}`, options: null};
    }

    return {valid: true, reason: null, options}
}

/**
 * @summary Reads the four surface files from the repo root — the side-effect half's only read
 * surface.
 * @param {String} repoRoot Absolute repo root path
 * @returns {Object} File contents keyed `{identityRoots, modelStats, readme, spec}`
 */
export function readSurfaceFiles(repoRoot) {
    const contents = {};

    for (const [key, relative] of Object.entries(SURFACE_PATHS)) {
        contents[key] = fs.readFileSync(path.join(repoRoot, relative), 'utf8');
    }

    return contents;
}

/**
 * @summary Resolves the current git branch name, or null when unresolvable — feeds the pure
 * {@link checkWriteGuard}.
 * @param {String} repoRoot Absolute repo root path
 * @returns {String|null}
 */
export function currentGitBranch(repoRoot) {
    try {
        return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {cwd: repoRoot, encoding: 'utf8'}).trim();
    } catch {
        return null;
    }
}

/**
 * @summary Prints the CLI usage block.
 * @returns {void}
 */
function printUsage() {
    console.log('Usage: node ai/scripts/setup/generateRosterOnboarding.mjs --handle <s> --family <s>');
    console.log('           [--github-username <s>] [--write]');
    console.log('');
    console.log('  (no flags)  Dry-run — print the four proposed file modifications without applying them.');
    console.log('  --write     Apply the insertions (branch-guarded: refuses on dev/main; EXISTS surfaces skipped).');
    console.log('');
    console.log('  There is deliberately NO model/engine flag (engine facts are observation-owned; they land');
    console.log('  source-cited in ModelStats.md at first boot) and NO social-name flag (Social Names are the');
    console.log('  post-boot peer-naming ritual, never seed data).');
}

/**
 * @summary CLI entry: parse → plan → print; `--write` applies the insertions behind the branch
 * guard. Dry-run touches nothing.
 * @returns {Promise<void>}
 */
async function main() {
    const parsed = parseGenerateArgs(process.argv.slice(2));

    if (!parsed.valid) {
        console.error(`[generateRosterOnboarding] FATAL: ${parsed.reason}`);
        printUsage();
        process.exit(1);
    }

    if (parsed.options.help) {
        printUsage();
        return;
    }

    const built = buildOnboardingPlan(parsed.options);

    if (!built.valid) {
        console.error(`[generateRosterOnboarding] FATAL: ${built.reason}`);
        printUsage();
        process.exit(1);
    }

    const {plan}   = built,
          repoRoot = path.resolve(path.dirname(__filename), '../../..'),
          planned  = planOnboardingSurfaces(plan, readSurfaceFiles(repoRoot));

    console.log(renderOnboardingReport(plan, planned).join('\n'));
    console.log('');

    if (!planned.valid) {
        console.error(`[generateRosterOnboarding] FATAL: ${planned.reason}`);
        process.exit(1);
    }

    if (!parsed.options.write) {
        console.log('[generateRosterOnboarding] DRY-RUN complete. No files touched. Re-run with --write on a work branch to apply.');
        return;
    }

    const guard = checkWriteGuard({branch: currentGitBranch(repoRoot)});

    if (!guard.valid) {
        console.error(`[generateRosterOnboarding] FATAL: ${guard.reason}`);
        process.exit(1);
    }

    let written = 0;

    for (const surface of planned.surfaces) {
        if (surface.status === 'insert') {
            fs.writeFileSync(path.join(repoRoot, surface.path), surface.updated);
            console.log(`  [WROTE] ${surface.path}`);
            written++;
        } else {
            console.log(`  [SKIPPED] ${surface.path} — ${surface.reason}`);
        }
    }

    console.log('');
    console.log(`[generateRosterOnboarding] applied ${written} of ${planned.surfaces.length} surfaces for ${plan.handle}. Review the diff, commit on this branch, and open the PR through the normal pull-request protocol.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    main().catch(err => {
        console.error('[generateRosterOnboarding] FATAL:', err);
        process.exit(1);
    });
}
