#!/usr/bin/env node
/**
 * @summary Fails when a resident's engine fact disagrees across the three places that hand-maintain
 * it: the identity registry (`ai/graph/identityRoots.mjs`), the model registry
 * (`learn/agentos/ModelStats.md`), and the cockpit engine-tag map (`deriveFleetRoster.mjs`).
 *
 * ## The rule
 *
 * One resident's engine is written in three independent files with no propagation between them.
 * They are allowed to be STALE together — currency is a human judgement this lint deliberately does
 * not make. They are not allowed to DISAGREE, because a disagreement means at least one published
 * surface is stating a fact that another published surface contradicts, and today nothing notices.
 *
 * ## Why this shape, and not a release-watcher
 *
 * The motivating incident is instructive: when Claude Opus 5 shipped, the swarm knew within minutes
 * — a peer broadcast the release before any row was touched. Detection was never the gap. What did
 * not exist was anything CONNECTING that knowledge to the rows, so two of the three places sat
 * stale until a human noticed. A provider-catalog poller would be a large, network-dependent,
 * multi-provider system solving a problem we do not have; this guard needs no network at all and
 * catches the failure that actually happened.
 *
 * ## What this catches
 *
 * For every ACTIVE agent resident that has a `ModelStats.md` section:
 *
 * 1. `releaseDate` present in both the registry and the row, and different.
 * 2. A version token in the registry `description` (e.g. `4.8`) absent from the row's `name`.
 * 3. An `ENGINE_TAG_BY_ID` tag whose parts (e.g. `opus-5` → `opus`, `5`) are not all present in the
 *    row's `name`.
 *
 * ## What is explicitly NOT a violation
 *
 * **Declared absence passes.** A resident with no engine-tag entry, no `releaseDate`, or no version
 * token is silent, not wrong. This matters concretely: a seat on an operator-managed weekly engine
 * rotation has no true flat value, so its tag is deliberately `null`. A lint that treated absence as
 * drift would pressure an author into re-adding a literal that is false half the week — it would
 * manufacture the exact fiction it exists to catch. Silence is a valid answer here; only
 * contradiction is not.
 *
 * There is deliberately no `--fix`. A flag that silently reconciled the three places would rubber-
 * stamp whichever one happened to be wrong, which is the drift, not the cure (same reasoning as
 * `lint-config-template-ssot.mjs`). This reports and exits non-zero; a human picks the true value.
 *
 * ## Scope — what a GREEN run does not mean
 *
 * The name says `identity-engine-coherence`, which is broader than what this checks. Green means
 * **these three FILES agree with each other**, and nothing more. Three known engine-fact surfaces
 * sit outside it, and a reader must not read a pass as covering them:
 *
 * 1. **The seeded graph node (runtime).** This is file↔file by construction. The live
 *    `AgentIdentity` node is seeded separately and does not track the file: at the time of writing,
 *    `@neo-opus-grace`'s node serves `"Anthropic Claude Opus 4.8 generalist maintainer identity."`
 *    while the file says `'Anthropic Claude Opus 4.8 Agent Identity'` — same version, different
 *    sentence, so no re-seed has run across at least one edit. Its `createdAt` also diverges from
 *    the file's hardcoded value, which is the import-time-clock corruption this registry's own
 *    header warns about. Consequence worth stating plainly: when a rotation merges, the files agree
 *    and this lint goes green **while the runtime still serves the old engine** until a re-seed
 *    runs. The green light and the onset of runtime drift are simultaneous. That is a mechanism gap
 *    in the seed→graph path, not something a file comparison can ever see.
 * 2. **First-person prose.** Maintainer-authored lived-voice sections name their own engine in
 *    sentences, not fields. Prose is unparseable by this shape and is also authorship-owned — only
 *    the bearer may edit their own account.
 * 3. **Thin rows.** The absence-passes rule is backstopped by the other two dimensions: a forgotten
 *    tag normally still trips the `description` or `releaseDate` check. That backstop needs
 *    something to bite on — for a resident whose row carries no `releaseDate` and no dotted version
 *    in its description, a forgotten tag is genuinely invisible here. Bounded, not fixed.
 *
 * Honestly narrow beats falsely total: the failure this whole guard exists to prevent is a surface
 * asserting more confidence than it earned.
 *
 * ## Sunset condition
 *
 * This guard exists because the engine is a session-scoped fact stored in identity-scoped records.
 * When the era layer makes engine facts span-carrying and single-sourced, these three places
 * collapse into one and this lint should be RETIRED with them rather than kept for its own sake.
 */

import fs                 from 'node:fs';
import path               from 'node:path';
import {fileURLToPath}    from 'node:url';
import {IDENTITIES}       from '../../graph/identityRoots.mjs';
import {ENGINE_TAG_BY_ID} from '../fleet/deriveFleetRoster.mjs';

/** Version-ish tokens: `4.8`, `5`, `3.1`, `k3`. Bare years are excluded — a date is not a version. */
const VERSION_TOKEN = /\b(?:v?\d+\.\d+(?:\.\d+)?|k\d+)\b/gi;

const
    __filename  = fileURLToPath(import.meta.url),
    ROOT_DIR    = path.resolve(path.dirname(__filename), '../../..'),
    MODEL_STATS = path.join(ROOT_DIR, 'learn/agentos/ModelStats.md');

/**
 * @summary Parse `ModelStats.md` into `{githubLogin: {section, name, releaseDate, line}}`.
 *
 * Sections are `### §anchor` headings; the owning handle comes from the section's own
 * `id / githubLogin` row rather than a hardcoded anchor→handle map, so adding a resident needs no
 * edit here.
 * @param {String} markdown
 * @returns {Object<String,Object>}
 */
export function parseModelStats(markdown) {
    const
        lines    = markdown.split('\n'),
        sections = {};

    let current = null;

    lines.forEach((line, index) => {
        const heading = line.match(/^###\s+(§\S+)/);

        if (heading) {
            current = {section: heading[1], githubLogin: null, name: null, releaseDate: null, line: index + 1};
            return
        }

        if (!current) {
            return
        }

        // `| `id` / `githubLogin` | `@neo-opus-ada` |`
        const idRow = line.match(/^\|\s*`id`\s*\/\s*`githubLogin`\s*\|\s*`?@?([\w-]+)`?\s*\|/);

        if (idRow) {
            current.githubLogin = idRow[1];
            sections[idRow[1]]  = current;
            return
        }

        const nameRow = line.match(/^\|\s*`name`\s*\|\s*(.+?)\s*\|\s*$/);

        if (nameRow && current.name === null) {
            current.name = nameRow[1];
            return
        }

        const releaseRow = line.match(/^\|\s*`releaseDate`\s*\|\s*([\d-]+)\s*\|\s*$/);

        if (releaseRow && current.releaseDate === null) {
            current.releaseDate = releaseRow[1]
        }
    });

    return sections
}

/**
 * @summary Distinct version-ish tokens in a string, lowercased.
 * @param {String} [text]
 * @returns {String[]}
 */
function versionTokens(text) {
    return [...new Set((text || '').match(VERSION_TOKEN)?.map(token => token.toLowerCase().replace(/^v/, '')) || [])]
}

/**
 * @summary Compare the three places for every active agent resident.
 * @param {Object} [options]
 * @param {Object[]} [options.identities] Registry entries; defaults to the live registry.
 * @param {Object<String,String>} [options.engineTags] Cockpit tag map; defaults to the live map.
 * @param {String} [options.modelStats] `ModelStats.md` contents; defaults to the file on disk.
 * @returns {{violations: Object[], checked: Number}}
 */
export function checkEngineCoherence({identities = IDENTITIES, engineTags = ENGINE_TAG_BY_ID, modelStats} = {}) {
    const
        sections   = parseModelStats(modelStats ?? fs.readFileSync(MODEL_STATS, 'utf8')),
        violations = [];

    let checked = 0;

    identities.forEach(entry => {
        const props = entry?.properties || {};

        if (entry.type !== 'AgentIdentity' || props.accountType !== 'agent' || props.participationStatus !== 'active') {
            return
        }

        const
            handle  = entry.id.replace(/^@/, ''),
            section = sections[handle];

        // No section is not a violation here: roster completeness is generateRosterOnboarding's job,
        // and duplicating it would make two lints fail for one cause.
        if (!section) {
            return
        }

        checked++;

        if (props.releaseDate && section.releaseDate && props.releaseDate !== section.releaseDate) {
            violations.push({
                handle,
                kind   : 'releaseDate',
                detail : `registry \`${props.releaseDate}\` vs ModelStats ${section.section} \`${section.releaseDate}\``,
                sources: ['ai/graph/identityRoots.mjs', `learn/agentos/ModelStats.md:${section.line}`]
            })
        }

        const
            rowName      = (section.name || '').toLowerCase(),
            descTokens   = versionTokens(props.description ?? entry.description),
            missingInRow = descTokens.filter(token => !rowName.includes(token));

        // Only fires when the registry names a version the row does not mention at all. A registry
        // that names no version is silent, not wrong.
        if (descTokens.length > 0 && missingInRow.length === descTokens.length) {
            violations.push({
                handle,
                kind   : 'description',
                detail : `registry description names version ${descTokens.map(t => `\`${t}\``).join('/')}, absent from ModelStats ${section.section} \`name\`: "${section.name}"`,
                sources: ['ai/graph/identityRoots.mjs', `learn/agentos/ModelStats.md:${section.line}`]
            })
        }

        const tag = engineTags[handle];

        // An absent tag is the honest-absence contract (rotating seats), never a violation.
        if (tag) {
            const missingParts = tag.toLowerCase().split(/[-\s]+/).filter(part => part && !rowName.includes(part));

            if (missingParts.length > 0) {
                violations.push({
                    handle,
                    kind   : 'engineTag',
                    detail : `engine tag \`${tag}\` has part(s) ${missingParts.map(p => `\`${p}\``).join(', ')} absent from ModelStats ${section.section} \`name\`: "${section.name}"`,
                    sources: ['ai/scripts/fleet/deriveFleetRoster.mjs', `learn/agentos/ModelStats.md:${section.line}`]
                })
            }
        }
    });

    return {violations, checked}
}

/**
 * @summary Run the lint and report.
 * @returns {{exitCode: Number}}
 */
export function runLint() {
    const {violations, checked} = checkEngineCoherence();

    if (violations.length === 0) {
        console.log(`[lint-identity-engine-coherence] ${checked} active resident(s) coherent across registry, ModelStats, and the cockpit engine-tag map.`);
        return {exitCode: 0}
    }

    console.error(`\x1b[31mlint-identity-engine-coherence: ${violations.length} engine-fact disagreement(s):\x1b[0m`);

    violations.forEach(({handle, kind, detail, sources}) => {
        console.error(`  @${handle} [${kind}] ${detail}`);
        sources.forEach(source => console.error(`      ${source}`))
    });

    console.error(`
The engine fact is hand-maintained in three places with no propagation between them, so they drift
silently. Fix the one that is WRONG — this lint deliberately has no --fix, because reconciling
automatically would rubber-stamp whichever place happened to be stale.

A resident with no engine tag, no releaseDate, or no version in its description is NOT flagged:
declared absence is the honest answer for a seat whose engine rotates, and forcing a literal there
would publish a value that is false half the time.`);

    return {exitCode: 1}
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    process.exit(runLint().exitCode)
}
