#!/usr/bin/env node

/**
 * @plane host
 */
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
 * **Convergence:** every owned surface reports `MISSING`, `MATCH`, or `DIVERGENT` against the
 * exact generated structure. A corrected rerun repairs only a structurally-recognizable
 * generated block; ambiguous legacy prose refuses the whole payload before any file is
 * written. Rotation mode updates the public roster + ModelStats mirrors only — durable roots
 * and the migration epoch snapshot are verified boundaries and remain byte-stable.
 *
 * Everything decision-shaped is pure and fail-closed: planners return
 * `{valid, reason, ...}` / per-surface `{status, reason, ...}` and never throw; a missing
 * insertion anchor refuses loudly and writes nothing.
 *
 * **Usage**:
 *   node ai/scripts/setup/generateRosterOnboarding.mjs --handle <s> --family <s>
 *       [--github-username <s>]                        # dry-run (default): print the payload
 *   node ai/scripts/setup/generateRosterOnboarding.mjs ... --write   # apply on a work branch
 *   node ai/scripts/setup/generateRosterOnboarding.mjs --mode rotation
 *       --handle <s> --family <s> --designation <s> [--github-username <s>]
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
 * @summary Canonical surface convergence states. These are artifact states, not write verbs:
 * `DIVERGENT` may be safely repairable or may fail closed as ambiguous.
 * @type {Object}
 */
export const SURFACE_STATES = Object.freeze({
    DIVERGENT: 'DIVERGENT',
    MATCH    : 'MATCH',
    MISSING  : 'MISSING'
});

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
    migration    : 'ai/graph/identityRootsMigration.mjs',
    modelStats   : 'learn/agentos/ModelStats.md',
    readme       : 'README.md',
    spec         : 'test/playwright/unit/ai/graph/identityRoots.spec.mjs'
});

/** @type {ReadonlyArray<String>} */
export const ONBOARDING_SURFACE_KEYS = Object.freeze(['identityRoots', 'readme', 'modelStats', 'spec']);

/** @type {ReadonlyArray<String>} */
export const ROTATION_SURFACE_KEYS = Object.freeze(['identityRoots', 'readme', 'modelStats', 'spec', 'migration']);

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
 * @summary Normalizes a GitHub login using GitHub's strict username grammar: 1-39 characters,
 * alphanumeric endpoints, and only single hyphens between segments. The returned value keeps
 * the identity substrate's canonical `@` prefix.
 * @param {String} value Raw GitHub login (with or without `@`)
 * @returns {{valid: Boolean, reason: String|null, handle: String|null}}
 */
export function normalizeGithubUsername(value) {
    if (typeof value !== 'string' || value.trim() === '') {
        return {valid: false, reason: '--github-username requires a non-empty string', handle: null};
    }

    const body = value.trim().replace(/^@/, '');

    if (body.length > 39 || !/^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9]))*$/.test(body)) {
        return {valid: false, reason: `--github-username must be a lowercase GitHub login (1-39 chars, alphanumeric endpoints, no consecutive hyphens) — received '${value}'`, handle: null};
    }

    return {valid: true, reason: null, handle: `@${body}`}
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
 * @param {'onboarding'|'rotation'} [options.mode='onboarding'] Ceremony mode
 * @param {String} [options.designation] Exact ModelStats engine designation; rotation only
 * @param {String} [options.githubUsername] GitHub login (defaults to the handle)
 * @param {Date|String} [options.now] Clock override for deterministic tests; defaults to the real now
 * @returns {{valid: Boolean, reason: String|null, plan: Object|null}}
 */
export function buildOnboardingPlan(options = {}) {
    const mode = options.mode || 'onboarding';

    if (!['onboarding', 'rotation'].includes(mode)) {
        return {valid: false, reason: `--mode must be 'onboarding' or 'rotation' — received '${String(mode)}'`, plan: null};
    }

    const socialLeaks = SOCIAL_NAME_CLASS_KEYS.filter(key => key in options);

    if (socialLeaks.length > 0) {
        return {valid: false, reason: `socialName-class inputs are rejected by design: ${socialLeaks.join(', ')} — Social Names are the post-boot peer-naming ritual (bearer-assented), never seed data`, plan: null};
    }

    const engineLeaks = ENGINE_CLASS_KEYS.filter(key => key in options && !(mode === 'rotation' && key === 'designation'));

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

    if (mode === 'onboarding' && 'designation' in options) {
        return {valid: false, reason: 'engine-class inputs are rejected by onboarding: designation — engine facts are observation-owned and land through the source-cited ModelStats.md discipline at first boot', plan: null};
    }

    if (mode === 'rotation' && (typeof options.designation !== 'string' || options.designation.trim() === '' || /[\r\n|]/.test(options.designation))) {
        return {valid: false, reason: '--designation requires one non-empty line without Markdown table delimiters in rotation mode', plan: null};
    }

    const github = normalizeGithubUsername(options.githubUsername === undefined ? resident.handle : options.githubUsername);

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
            mode,
            handle,
            handleBody    : handle.slice(1),
            family        : options.family,
            familyVendor  : family && family.vendor,
            familyDisplay : family ? family.display : options.family,
            githubUsername: github.handle,
            githubBody    : github.handle.slice(1),
            displayForm   : deriveDisplayForm(handle),
            sectionAnchor : deriveSectionAnchor(handle),
            designation   : mode === 'rotation' ? options.designation.trim() : null,
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
            githubLogin: '${plan.githubUsername}',
            displayName: '${plan.displayForm}',
            modelFamily: '${plan.family}',
            accountType: 'agent',
            trustTier  : TRUST_TIERS.PEER_TRUSTED,
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
 * @summary Replaces one exact source range without broad substring rewriting.
 * @param {String} source Complete source
 * @param {{start: Number, end: Number}} range Half-open byte range
 * @param {String} replacement Exact replacement
 * @returns {String}
 */
export function replaceExactRange(source, range, replacement) {
    return source.slice(0, range.start) + replacement + source.slice(range.end);
}

/**
 * @summary Locates the one roster object whose structural `id` field equals the resident.
 * @param {String} source identityRoots source
 * @param {String} handle Canonical resident handle
 * @returns {{valid: Boolean, reason: String|null, range: Object|null, block: String|null}}
 */
export function locateRosterEntry(source, handle) {
    const lines   = source.split('\n'),
          idLine  = new RegExp(`^\\s{8}id\\s*:\\s*'${escapeRegExp(handle)}',?$`),
          matches = [];

    for (let i = 0; i < lines.length; i++) {
        if (idLine.test(lines[i])) {
            matches.push(i);
        }
    }

    if (matches.length === 0) {
        return {valid: true, reason: null, range: null, block: null};
    }

    if (matches.length !== 1) {
        return {valid: false, reason: `${handle} has ${matches.length} structural roster entries; refusing an ambiguous repair`, range: null, block: null};
    }

    const idIndex   = matches[0];
    let   startLine = idIndex - 1,
        endLine   = idIndex + 1;

    while (startLine >= 0 && lines[startLine] !== '    {') {
        startLine--;
    }

    while (endLine < lines.length && lines[endLine] !== '    },') {
        endLine++;
    }

    if (startLine < 0 || endLine >= lines.length) {
        return {valid: false, reason: `${handle} roster entry boundaries are not structurally recognizable; refusing a broad rewrite`, range: null, block: null};
    }

    const offsets = [];
    let   offset  = 0;

    for (const line of lines) {
        offsets.push(offset);
        offset += line.length + 1;
    }

    const start = offsets[startLine],
          end   = offsets[endLine] + lines[endLine].length;

    return {valid: true, reason: null, range: {start, end}, block: source.slice(start, end)};
}

/**
 * @summary True only for the pending Layer-1 block emitted by this generator lineage.
 * @param {String} block Candidate roster block
 * @returns {Boolean}
 */
export function isGeneratedRosterEntry(block) {
    return block.includes("statusReason       : 'First boot pending'") &&
        block.includes("reactivationTrigger: 'Operator confirms participation activation after first boot'") &&
        block.includes('// No capability fields — engine facts are observation-owned');
}

/**
 * @summary Locates one exact maintainer table row by the desired GitHub login or the generator's
 * original default (the resident handle). This lets a corrected login repair the original row
 * without guessing across unrelated prose.
 * @param {String} source README source
 * @param {Object} plan Ceremony plan
 * @param {String[]} [aliases=[]] Prior generated GitHub-login bodies that still own the row
 * @returns {{valid: Boolean, reason: String|null, range: Object|null, row: String|null}}
 */
export function locateReadmeRow(source, plan, aliases = []) {
    const candidates = new Set([plan.githubBody, plan.handleBody, ...aliases]),
          matches    = [];
    let offset = 0;

    for (const line of source.split('\n')) {
        if (line.startsWith('|') && [...candidates].some(login => line.includes(`](https://github.com/${login})`))) {
            matches.push({start: offset, end: offset + line.length, row: line});
        }

        offset += line.length + 1;
    }

    if (matches.length === 0) {
        return {valid: true, reason: null, range: null, row: null};
    }

    if (matches.length !== 1) {
        return {valid: false, reason: `${plan.handle} resolves to ${matches.length} maintainer rows (desired/default login); refusing a duplicate or ambiguous rewrite`, range: null, row: null};
    }

    return {valid: true, reason: null, range: {start: matches[0].start, end: matches[0].end}, row: matches[0].row};
}

/**
 * @summary Locates one exact ModelStats resident section by semantic anchor.
 * @param {String} source ModelStats source
 * @param {String} sectionAnchor Resident semantic anchor (without `§`)
 * @returns {{valid: Boolean, reason: String|null, range: Object|null, section: String|null}}
 */
export function locateModelStatsSection(source, sectionAnchor) {
    const heading = `### §${sectionAnchor}`,
          starts  = [];
    let cursor = 0;

    while ((cursor = source.indexOf(heading, cursor)) !== -1) {
        const atLineStart = cursor === 0 || source[cursor - 1] === '\n',
              atLineEnd   = cursor + heading.length === source.length || source[cursor + heading.length] === '\n';

        if (atLineStart && atLineEnd) {
            starts.push(cursor);
        }

        cursor += heading.length;
    }

    if (starts.length === 0) {
        return {valid: true, reason: null, range: null, section: null};
    }

    if (starts.length !== 1) {
        return {valid: false, reason: `§${sectionAnchor} appears ${starts.length} times; refusing an ambiguous ModelStats repair`, range: null, section: null};
    }

    const start       = starts[0],
          nextSection = source.indexOf('\n### §', start + heading.length),
          nextDivider = source.indexOf('\n---\n', start + heading.length),
          ends        = [nextSection, nextDivider].filter(index => index !== -1),
          end         = ends.length > 0 ? Math.min(...ends) : source.length;

    return {valid: true, reason: null, range: {start, end}, section: source.slice(start, end).trimEnd()};
}

/**
 * @summary True only for the pending ModelStats skeleton emitted by this generator lineage.
 * @param {String} section Candidate section
 * @returns {Boolean}
 */
export function isGeneratedModelStatsSection(section) {
    return section.includes('| `participationStatus` | `temporarily_unreachable`') &&
        section.includes('V-B-A pending — observation-owned') &&
        section.includes('capability values are never guessed at onboarding');
}

/**
 * @summary Locates the dedicated generated roster pin structurally. Incidental quoted-handle
 * mentions are deliberately ignored.
 * @param {String} source identityRoots spec source
 * @param {String} handle Canonical resident handle
 * @returns {{valid: Boolean, reason: String|null, range: Object|null, block: String|null}}
 */
export function locateSpecPin(source, handle) {
    const describe = `test.describe('ai/graph/identityRoots — ${handle} roster pin', () => {`,
          starts   = [];
    let cursor = 0;

    while ((cursor = source.indexOf(describe, cursor)) !== -1) {
        starts.push(cursor);
        cursor += describe.length;
    }

    if (starts.length === 0) {
        return {valid: true, reason: null, range: null, block: null};
    }

    if (starts.length !== 1) {
        return {valid: false, reason: `${handle} has ${starts.length} dedicated roster-pin describes; refusing an ambiguous repair`, range: null, block: null};
    }

    const describeStart = starts[0],
          docStart      = source.lastIndexOf('/**', describeStart),
          secondTest    = source.indexOf(`test('${handle} commits no static wake template and no engine facts (observation-owned)'`, describeStart),
          blockEnd      = secondTest === -1 ? -1 : source.indexOf('\n});', secondTest);

    if (docStart === -1 || blockEnd === -1) {
        return {valid: false, reason: `${handle} roster pin exists but its generated block boundaries are not recognizable`, range: null, block: null};
    }

    const end = blockEnd + '\n});'.length;

    return {valid: true, reason: null, range: {start: docStart, end}, block: source.slice(docStart, end)};
}

/**
 * @summary Constructs one normalized surface result.
 * @param {Object} base Stable surface metadata
 * @param {String} status One of {@link SURFACE_STATES}
 * @param {String|null} reason Human-readable classification/diff
 * @param {String|null} updated Complete updated source when writable
 * @returns {Object}
 */
export function surfaceResult(base, status, reason, updated = null) {
    return {...base, status, reason, updated, repairable: updated !== null};
}

/**
 * @summary Classifies the `identityRoots.mjs` surface: MISSING inserts before the broadcast
 * sentinel, MATCH requires the exact generated block, and DIVERGENT repairs only the
 * recognizable pending generator shape. Activated/non-generated entries fail closed.
 * @param {String} source Current file content
 * @param {Object} plan A valid plan from {@link buildOnboardingPlan}
 * @returns {{surface: String, path: String, status: String, reason: String|null, anchor: String, snippet: String, updated: String|null}}
 */
export function planRosterSurface(source, plan) {
    const base = {surface: 'identityRoots', path: SURFACE_PATHS.identityRoots, anchor: `immediately before the 'AGENT:*' BroadcastSentinel entry`, snippet: renderRosterEntry(plan)};

    if (typeof source !== 'string' || source === '') {
        return surfaceResult(base, SURFACE_STATES.DIVERGENT, 'identityRoots source must be a non-empty string');
    }

    const located = locateRosterEntry(source, plan.handle);

    if (!located.valid) {
        return surfaceResult(base, SURFACE_STATES.DIVERGENT, located.reason);
    }

    if (located.block) {
        if (isGeneratedRosterEntry(located.block)) {
            const sinceMatch   = located.block.match(/^\s*since\s*:\s*'([^']+)'/m),
                  createdMatch = located.block.match(/^\s*createdAt\s*:\s*'([^']+)'/m),
                  githubMatch  = located.block.match(/^\s*githubLogin\s*:\s*'@([^']+)'/m);

            if (!sinceMatch || !createdMatch || sinceMatch[1] !== createdMatch[1] || !Number.isFinite(Date.parse(sinceMatch[1])) || !githubMatch) {
                return surfaceResult(base, SURFACE_STATES.DIVERGENT, `${plan.handle} generated roster block has inconsistent immutable identity anchors (birth timestamp or githubLogin); refusing repair`);
            }

            // A rerun occurs later by definition. Preserve the actual first-generation time;
            // corrected family/login input must not rewrite identity birth history.
            base.snippet = renderRosterEntry({...plan, since: sinceMatch[1]});
            base.previousGithubBody = githubMatch[1];
        }

        if (located.block === base.snippet) {
            return surfaceResult(base, SURFACE_STATES.MATCH, `${plan.handle} roster entry exactly matches the generated Layer-1 block`);
        }

        if (!isGeneratedRosterEntry(located.block)) {
            return surfaceResult(base, SURFACE_STATES.DIVERGENT, `${plan.handle} has an existing non-generated or activated roster entry; refusing to overwrite durable identity truth`);
        }

        return surfaceResult(
            base,
            SURFACE_STATES.DIVERGENT,
            `${plan.handle} generated roster block differs from corrected input; exact block repair planned`,
            replaceExactRange(source, located.range, base.snippet)
        );
    }

    const sentinel = source.match(/\n    \{\n\s+id\s*:\s*'AGENT:\*'/);

    if (!sentinel) {
        return surfaceResult(base, SURFACE_STATES.DIVERGENT, `insertion anchor not found: the 'AGENT:*' BroadcastSentinel entry is missing from ${SURFACE_PATHS.identityRoots}`);
    }

    const insertAt = sentinel.index + 1;

    return {
        ...base,
        status    : SURFACE_STATES.MISSING,
        reason    : `${plan.handle} has no structural roster entry`,
        repairable: true,
        updated   : source.slice(0, insertAt) + base.snippet + '\n' + source.slice(insertAt)
    };
}

/**
 * @summary Classifies the README surface by the exact resident/default-login row. MISSING
 * appends, MATCH is byte-equal, and DIVERGENT repairs only the generated pending row; activated
 * or duplicate rows fail closed.
 * @param {String} source Current file content
 * @param {Object} plan A valid plan from {@link buildOnboardingPlan}
 * @param {String[]} [aliases=[]] Prior generated GitHub-login bodies that still own the row
 * @returns {{surface: String, path: String, status: String, reason: String|null, anchor: String, snippet: String, updated: String|null}}
 */
export function planReadmeSurface(source, plan, aliases = []) {
    const base = {surface: 'readme', path: SURFACE_PATHS.readme, anchor: 'appended after the last row of the maintainer roster table', snippet: renderReadmeRow(plan)};

    if (typeof source !== 'string' || source === '') {
        return surfaceResult(base, SURFACE_STATES.DIVERGENT, 'README source must be a non-empty string');
    }

    const located = locateReadmeRow(source, plan, aliases);

    if (!located.valid) {
        return surfaceResult(base, SURFACE_STATES.DIVERGENT, located.reason);
    }

    if (located.row) {
        if (located.row === base.snippet) {
            return surfaceResult(base, SURFACE_STATES.MATCH, `${plan.handle} maintainer row exactly matches generated content`);
        }

        if (!located.row.includes('engine designation pending first boot') || !located.row.endsWith('| Machine Account |')) {
            return surfaceResult(base, SURFACE_STATES.DIVERGENT, `${plan.handle} maintainer row is human-edited or activated; refusing to replace it as generated onboarding content`);
        }

        return surfaceResult(
            base,
            SURFACE_STATES.DIVERGENT,
            `${plan.handle} generated maintainer row differs from corrected family/login input; exact row repair planned`,
            replaceExactRange(source, located.range, base.snippet)
        );
    }

    const lines     = source.split('\n'),
          headerIdx = lines.indexOf('| Name | Maintainer | Role | Identity |');

    if (headerIdx === -1) {
        return surfaceResult(base, SURFACE_STATES.DIVERGENT, `insertion anchor not found: the '| Name | Maintainer | Role | Identity |' table header is missing from ${SURFACE_PATHS.readme}`);
    }

    let end = headerIdx + 1;

    while (end < lines.length && lines[end].startsWith('|')) {
        end++;
    }

    lines.splice(end, 0, base.snippet);

    return surfaceResult(base, SURFACE_STATES.MISSING, `${plan.handle} has no maintainer row`, lines.join('\n'));
}

/**
 * @summary Classifies the exact ModelStats semantic section. MISSING inserts the skeleton,
 * MATCH is byte-equal, and DIVERGENT repairs only the recognizable pending generator section;
 * human-edited/activated sections fail closed.
 * @param {String} source Current file content
 * @param {Object} plan A valid plan from {@link buildOnboardingPlan}
 * @returns {{surface: String, path: String, status: String, reason: String|null, anchor: String, snippet: String, updated: String|null}}
 */
export function planModelStatsSurface(source, plan) {
    const base = {surface: 'modelStats', path: SURFACE_PATHS.modelStats, anchor: 'inside §pending_swarm_identities, before the closing divider', snippet: renderModelStatsSection(plan)};

    if (typeof source !== 'string' || source === '') {
        return surfaceResult(base, SURFACE_STATES.DIVERGENT, 'ModelStats source must be a non-empty string');
    }

    const located = locateModelStatsSection(source, plan.sectionAnchor);

    if (!located.valid) {
        return surfaceResult(base, SURFACE_STATES.DIVERGENT, located.reason);
    }

    if (located.section) {
        if (located.section === base.snippet) {
            return surfaceResult(base, SURFACE_STATES.MATCH, `${plan.handle} ModelStats section exactly matches generated content`);
        }

        if (!isGeneratedModelStatsSection(located.section)) {
            return surfaceResult(base, SURFACE_STATES.DIVERGENT, `${plan.handle} ModelStats section is human-edited or activated; refusing to replace it as generated onboarding content`);
        }

        return surfaceResult(
            base,
            SURFACE_STATES.DIVERGENT,
            `${plan.handle} generated ModelStats section differs from corrected family/login input; exact section repair planned`,
            replaceExactRange(source, located.range, base.snippet)
        );
    }

    const headingIdx = source.indexOf('\n## §pending_swarm_identities');

    if (headingIdx === -1) {
        return surfaceResult(base, SURFACE_STATES.DIVERGENT, `insertion anchor not found: the '## §pending_swarm_identities' heading is missing from ${SURFACE_PATHS.modelStats}`);
    }

    const dividerIdx = source.indexOf('\n---\n', headingIdx);

    if (dividerIdx === -1) {
        return surfaceResult(base, SURFACE_STATES.DIVERGENT, `insertion anchor not found: no '---' divider closes §pending_swarm_identities in ${SURFACE_PATHS.modelStats}`);
    }

    return {
        ...base,
        status    : SURFACE_STATES.MISSING,
        reason    : `${plan.handle} has no ModelStats section`,
        repairable: true,
        updated   : source.slice(0, dividerIdx) + '\n' + base.snippet + '\n' + source.slice(dividerIdx)
    };
}

/**
 * @summary Classifies the dedicated structural roster-pin describe. Incidental quoted-handle
 * references are ignored; MISSING appends the pin, MATCH is byte-equal, and a uniquely-bounded
 * DIVERGENT generated pin is repaired exactly.
 * @param {String} source Current file content
 * @param {Object} plan A valid plan from {@link buildOnboardingPlan}
 * @returns {{surface: String, path: String, status: String, reason: String|null, anchor: String, snippet: String, updated: String|null}}
 */
export function planSpecSurface(source, plan) {
    const base = {surface: 'spec', path: SURFACE_PATHS.spec, anchor: 'appended at the end of the spec file', snippet: renderSpecPin(plan)};

    if (typeof source !== 'string' || source === '') {
        return surfaceResult(base, SURFACE_STATES.DIVERGENT, 'spec source must be a non-empty string');
    }

    const located = locateSpecPin(source, plan.handle);

    if (!located.valid) {
        return surfaceResult(base, SURFACE_STATES.DIVERGENT, located.reason);
    }

    if (located.block) {
        if (located.block === base.snippet) {
            return surfaceResult(base, SURFACE_STATES.MATCH, `${plan.handle} dedicated roster pin exactly matches generated content`);
        }

        return surfaceResult(
            base,
            SURFACE_STATES.DIVERGENT,
            `${plan.handle} dedicated generated roster pin differs from corrected identity input; exact block repair planned`,
            replaceExactRange(source, located.range, base.snippet)
        );
    }

    return {
        ...base,
        status    : SURFACE_STATES.MISSING,
        reason    : `${plan.handle} has no dedicated structural roster pin`,
        repairable: true,
        updated   : source.replace(/\s*$/, '\n') + '\n' + base.snippet + '\n'
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

    for (const key of ONBOARDING_SURFACE_KEYS) {
        if (typeof files[key] !== 'string') {
            return {valid: false, reason: `missing file content for surface '${key}'`, surfaces: []};
        }
    }

    const roster  = planRosterSurface(files.identityRoots, plan),
          aliases = roster.previousGithubBody ? [roster.previousGithubBody] : [];
    const surfaces = [
        roster,
        planReadmeSurface(files.readme, plan, aliases),
        planModelStatsSurface(files.modelStats, plan),
        planSpecSurface(files.spec, plan)
    ];

    const invalid = surfaces.find(surface => surface.status === SURFACE_STATES.DIVERGENT && !surface.repairable);

    return {
        valid : !invalid,
        reason: invalid ? invalid.reason : null,
        surfaces
    };
}

/**
 * @summary Extracts the current engine designation from one ModelStats `name` row while
 * preserving any identity/social annotation suffix for an exact row-only rotation.
 * @param {String} section Resident ModelStats section
 * @returns {{valid: Boolean, reason: String|null, designation: String|null, suffix: String, row: String|null}}
 */
export function extractModelStatsDesignation(section) {
    const row = section.split('\n').find(line => line.startsWith('| `name` | '));

    if (!row || !row.endsWith(' |')) {
        return {valid: false, reason: 'the resident ModelStats section has no exact `name` row', designation: null, suffix: '', row: null};
    }

    const value   = row.slice('| `name` | '.length, -2).trim(),
          markers = [' (GitHub profile', ' (Social Name', ' (engine designation'],
          indexes = markers.map(marker => value.indexOf(marker)).filter(index => index !== -1),
          cut     = indexes.length > 0 ? Math.min(...indexes) : value.length;

    return {valid: true, reason: null, designation: value.slice(0, cut).trim(), suffix: value.slice(cut), row};
}

/**
 * @summary Rotation boundary for durable roots: the resident must exist and must not carry a
 * flat `modelDesignation`. The source is never rewritten by this mode.
 * @param {String} source identityRoots source
 * @param {Object} plan Rotation plan
 * @returns {Object}
 */
export function planRotationIdentityBoundary(source, plan) {
    const base = {surface: 'identityRoots', path: SURFACE_PATHS.identityRoots, anchor: 'durable resident boundary (verified, never written by rotation)', snippet: ''};

    if (typeof source !== 'string' || source === '') {
        return surfaceResult(base, SURFACE_STATES.DIVERGENT, 'identityRoots source must be a non-empty string');
    }

    const located = locateRosterEntry(source, plan.handle);

    if (!located.valid || !located.block) {
        return surfaceResult(base, SURFACE_STATES.DIVERGENT, located.reason || `${plan.handle} is missing from durable identity roots; rotation cannot onboard a resident`);
    }

    if (/^\s*modelDesignation\s*:/m.test(located.block)) {
        return surfaceResult(base, SURFACE_STATES.DIVERGENT, `${plan.handle} still carries flat modelDesignation in durable roots; rotation refuses to perpetuate the ADR-0032 violation`);
    }

    return surfaceResult(base, SURFACE_STATES.MATCH, `${plan.handle} durable root exists without flat modelDesignation; byte-stable by construction`);
}

/**
 * @summary Plans the ModelStats half of a rotation by changing only the exact `name` row and
 * retaining identity/social annotations byte-for-byte.
 * @param {String} source ModelStats source
 * @param {Object} plan Rotation plan
 * @returns {Object}
 */
export function planRotationModelStatsSurface(source, plan) {
    const base = {surface: 'modelStats', path: SURFACE_PATHS.modelStats, anchor: `§${plan.sectionAnchor} exact name row`, snippet: `| \`name\` | ${plan.designation} |`};

    if (typeof source !== 'string' || source === '') {
        return surfaceResult(base, SURFACE_STATES.DIVERGENT, 'ModelStats source must be a non-empty string');
    }

    const located = locateModelStatsSection(source, plan.sectionAnchor);

    if (!located.valid || !located.section) {
        return surfaceResult(base, SURFACE_STATES.DIVERGENT, located.reason || `${plan.handle} has no ModelStats section; rotation cannot invent capability history`);
    }

    const extracted = extractModelStatsDesignation(located.section);

    if (!extracted.valid) {
        return surfaceResult(base, SURFACE_STATES.DIVERGENT, extracted.reason);
    }

    base.previousDesignation = extracted.designation;

    if (extracted.designation === plan.designation) {
        return surfaceResult(base, SURFACE_STATES.MATCH, `${plan.handle} ModelStats name already records '${plan.designation}'`);
    }

    const desiredRow = `| \`name\` | ${plan.designation}${extracted.suffix} |`,
          rowStart   = source.indexOf(extracted.row, located.range.start);

    if (rowStart === -1 || rowStart >= located.range.end) {
        return surfaceResult(base, SURFACE_STATES.DIVERGENT, `${plan.handle} ModelStats name row could not be bounded inside its section`);
    }

    base.snippet = desiredRow;

    return surfaceResult(
        base,
        SURFACE_STATES.DIVERGENT,
        `${plan.handle} ModelStats designation '${extracted.designation}' differs from '${plan.designation}'; exact name-row rotation planned`,
        replaceExactRange(source, {start: rowStart, end: rowStart + extracted.row.length}, desiredRow)
    );
}

/**
 * @summary Plans the README half of a rotation by replacing the exact prior ModelStats
 * designation inside the one resident row. Vendor/harness suffixes remain byte-stable.
 * @param {String} source README source
 * @param {Object} plan Rotation plan
 * @param {String} previousDesignation Exact current ModelStats designation
 * @returns {Object}
 */
export function planRotationReadmeSurface(source, plan, previousDesignation) {
    const base = {surface: 'readme', path: SURFACE_PATHS.readme, anchor: `${plan.handle} exact maintainer row`, snippet: plan.designation};

    if (typeof source !== 'string' || source === '') {
        return surfaceResult(base, SURFACE_STATES.DIVERGENT, 'README source must be a non-empty string');
    }

    const located = locateReadmeRow(source, plan);

    if (!located.valid || !located.row) {
        return surfaceResult(base, SURFACE_STATES.DIVERGENT, located.reason || `${plan.handle} has no unique maintainer row; rotation refuses to create one`);
    }

    const occurrences = previousDesignation ? located.row.split(previousDesignation).length - 1 : 0;

    if (occurrences !== 1) {
        return surfaceResult(base, SURFACE_STATES.DIVERGENT, `${plan.handle} README row does not contain the prior ModelStats designation '${previousDesignation}' exactly once; refusing a broad prose rewrite`);
    }

    if (previousDesignation === plan.designation) {
        return surfaceResult(base, SURFACE_STATES.MATCH, `${plan.handle} README row exactly records '${plan.designation}'`);
    }

    const desiredRow = located.row.replace(previousDesignation, plan.designation);

    base.snippet = desiredRow;

    return surfaceResult(
        base,
        SURFACE_STATES.DIVERGENT,
        `${plan.handle} README designation '${previousDesignation}' differs from '${plan.designation}'; exact row rotation planned`,
        replaceExactRange(source, located.range, desiredRow)
    );
}

/**
 * @summary Rotation boundary for the focused identity spec: evidence must already mention the
 * resident, but engine text is never generated into the durable-root pin.
 * @param {String} source identityRoots spec source
 * @param {Object} plan Rotation plan
 * @returns {Object}
 */
export function planRotationSpecBoundary(source, plan) {
    const base = {surface: 'spec', path: SURFACE_PATHS.spec, anchor: 'durable identity continuity evidence (verified, never engine-rewritten)', snippet: ''};

    if (typeof source !== 'string' || !source.includes(`'${plan.handle}'`)) {
        return surfaceResult(base, SURFACE_STATES.DIVERGENT, `${plan.handle} has no exact quoted identity reference in the focused roots spec; rotation evidence is incomplete`);
    }

    return surfaceResult(base, SURFACE_STATES.MATCH, `${plan.handle} has focused durable-identity evidence; rotation leaves it byte-stable`);
}

/**
 * @summary Rotation boundary for the migration snapshot: require the epoch/map authority and
 * leave it byte-stable even when the desired live designation differs from the seed.
 * @param {String} source identityRootsMigration source
 * @returns {Object}
 */
export function planRotationMigrationBoundary(source) {
    const base = {surface: 'migration', path: SURFACE_PATHS.migration, anchor: 'MIGRATION_EPOCH + REGISTRY_MODEL_DESIGNATIONS snapshot (verified, never written)', snippet: ''};

    if (typeof source !== 'string' || !source.includes('export const MIGRATION_EPOCH') || !source.includes('export const REGISTRY_MODEL_DESIGNATIONS')) {
        return surfaceResult(base, SURFACE_STATES.DIVERGENT, 'migration epoch/designation snapshot authority is missing; refusing a rotation that could retroject history');
    }

    return surfaceResult(base, SURFACE_STATES.MATCH, 'migration epoch snapshot preserved byte-for-byte; the new embodiment belongs to the era layer');
}

/**
 * @summary Plans the corrected rotation ceremony. Only README + ModelStats can be writable;
 * roots, focused spec, and migration snapshot are explicit byte-stable boundaries.
 * @param {Object} plan Valid rotation plan
 * @param {Object} files Current five surface contents
 * @returns {{valid: Boolean, reason: String|null, surfaces: Object[]}}
 */
export function planRotationSurfaces(plan, files = {}) {
    if (!plan || plan.mode !== 'rotation') {
        return {valid: false, reason: 'planRotationSurfaces requires a rotation plan', surfaces: []};
    }

    for (const key of ROTATION_SURFACE_KEYS) {
        if (typeof files[key] !== 'string') {
            return {valid: false, reason: `missing file content for rotation surface '${key}'`, surfaces: []};
        }
    }

    const modelStats = planRotationModelStatsSurface(files.modelStats, plan),
          previous   = modelStats.previousDesignation;
    const surfaces = [
        planRotationIdentityBoundary(files.identityRoots, plan),
        planRotationReadmeSurface(files.readme, plan, previous),
        modelStats,
        planRotationSpecBoundary(files.spec, plan),
        planRotationMigrationBoundary(files.migration)
    ];
    const invalid = surfaces.find(surface => surface.status === SURFACE_STATES.DIVERGENT && !surface.repairable);

    return {valid: !invalid, reason: invalid ? invalid.reason : null, surfaces};
}

/**
 * @summary Renders the review-gated PR-body draft from the actual writable surface set.
 * Evidence remains checkbox placeholders because ticket/PR ids and live receipts do not exist
 * at generation time.
 * @param {Object} plan Ceremony plan
 * @param {Object} planned Surface plan
 * @returns {String[]}
 */
export function renderPrBodyDraft(plan, planned) {
    const changed = planned.surfaces.filter(surface => surface.updated !== null),
          lines   = [
              '## Generated PR-body draft',
              '',
              'Resolves #TICKET',
              '',
              `Completes the ${plan.mode} identity ceremony for ${plan.handle}.`,
              '',
              '## Changed Surfaces'
          ];

    if (changed.length === 0) {
        lines.push('- None — exact generated/current content already matches.');
    } else {
        for (const surface of changed) {
            lines.push(`- \`${surface.path}\` — ${surface.status}: ${surface.reason}`);
        }
    }

    lines.push('', '## Evidence',
        '- [ ] focused generator unit spec',
        '- [ ] fresh-process CLI: initial / zero-op / corrected divergence / ambiguous refusal / rotation',
        '- [ ] generated identity-roots spec (when onboarding writes a pin)',
        '- [ ] `node --check ai/scripts/setup/generateRosterOnboarding.mjs`',
        '- [ ] `git diff --check`');

    if (plan.mode === 'rotation') {
        lines.push('- [ ] durable identity root unchanged (no model designation write)',
            '- [ ] migration epoch/designation snapshot unchanged (no retrojection)',
            '- [ ] ModelStats update-history row completed after PR number exists',
            '- [ ] deployed graph mutation/reseed: out of scope');
    }

    return lines;
}

/**
 * @summary Advisory notes printed with every payload — adjacent concerns the generator
 * deliberately does NOT write (they are either untouchable by rule or editorial).
 * @param {Object} plan A valid plan from {@link buildOnboardingPlan}
 * @returns {String[]}
 */
export function renderAdvisoryNotes(plan) {
    if (plan.mode === 'rotation') {
        return [
            '[generateRosterOnboarding] rotation boundaries (printed, never written):',
            '  - Durable identityRoots stay byte-stable: model/family/capability truth belongs to the EmbodiedEpisode era chain (ADR-0032).',
            '  - identityRootsMigration stays byte-stable: MIGRATION_EPOCH seed facts are history, never retrojected to the new designation.',
            '  - ModelStats §update_history: add the designation transition with ticket + PR ids once they exist.',
            '  - Opening/persisting the new era is observation-owned and outside this generator; deployed graph mutation is out of scope.'
        ];
    }

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
        `[generateRosterOnboarding] ${plan.mode} ceremony for ${plan.handle} (family: ${plan.family})`,
        ''
    ];

    for (const surface of planned.surfaces) {
        lines.push(`  [${surface.status.toUpperCase()}] ${surface.path}`);

        if (surface.updated !== null) {
            lines.push(`      anchor: ${surface.anchor}`);
            lines.push(`      ${surface.reason}`);
            lines.push(...surface.snippet.split('\n').map(line => `      ${line}`.replace(/\s+$/, '')));
        } else {
            lines.push(`      ${surface.reason}`);
        }

        lines.push('');
    }

    lines.push(...renderAdvisoryNotes(plan));
    lines.push('', ...renderPrBodyDraft(plan, planned));

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
        '--designation'    : 'designation',
        '--family'         : 'family',
        '--github-username': 'githubUsername',
        '--handle'         : 'handle',
        '--mode'           : 'mode',
        '--repo-root'      : 'repoRoot'
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

        if (ENGINE_CLASS_FLAGS.includes(flag) && flag !== '--designation') {
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
 * @summary Reads the fixed ceremony authority files from the repo root — four writable
 * onboarding surfaces plus the rotation-only migration snapshot boundary.
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
        try {
            // A freshly-created work branch can be unborn (no commit yet): rev-parse rejects
            // it, while symbolic-ref still proves HEAD is bound to a named branch.
            return execFileSync('git', ['symbolic-ref', '--short', 'HEAD'], {cwd: repoRoot, encoding: 'utf8'}).trim();
        } catch {
            return null;
        }
    }
}

/**
 * @summary Prints the CLI usage block.
 * @returns {void}
 */
function printUsage() {
    console.log('Usage: node ai/scripts/setup/generateRosterOnboarding.mjs [--mode onboarding] --handle <s> --family <s>');
    console.log('           [--github-username <s>] [--repo-root <path>] [--write]');
    console.log('       node ai/scripts/setup/generateRosterOnboarding.mjs --mode rotation --handle <s> --family <s>');
    console.log('           --designation <s> [--github-username <s>] [--repo-root <path>] [--write]');
    console.log('');
    console.log('  (no flags)  Dry-run — classify and print the exact onboarding/rotation plan without applying it.');
    console.log('  --write     Apply every planned MISSING/repairable-DIVERGENT surface (branch-guarded).');
    console.log('  --repo-root Override the fixed-surface repository root (used by fresh-process contract tests).');
    console.log('');
    console.log('  There is deliberately NO model/engine flag (engine facts are observation-owned; they land');
    console.log('  source-cited in ModelStats.md at first boot) and NO social-name flag (Social Names are the');
    console.log('  post-boot peer-naming ritual, never seed data).');
}

/**
 * @summary CLI entry: parse → classify/plan → print; `--write` applies the complete validated
 * write set behind the branch guard. Dry-run touches nothing.
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

    const {repoRoot: requestedRoot, ...ceremonyOptions} = parsed.options,
          built                                         = buildOnboardingPlan(ceremonyOptions);

    if (!built.valid) {
        console.error(`[generateRosterOnboarding] FATAL: ${built.reason}`);
        printUsage();
        process.exit(1);
    }

    const {plan}   = built,
          repoRoot = requestedRoot ? path.resolve(requestedRoot) : path.resolve(path.dirname(__filename), '../../..'),
          files    = readSurfaceFiles(repoRoot),
          planned  = plan.mode === 'rotation' ? planRotationSurfaces(plan, files) : planOnboardingSurfaces(plan, files);

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
        if (surface.updated !== null) {
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
