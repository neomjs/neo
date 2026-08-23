import fs                      from 'node:fs';
import path                    from 'node:path';
import {FLEET_COCKPIT_SOURCES} from '../../../apps/agentos/config/cockpitSources.mjs';
import {IDENTITIES}            from '../../graph/identityRoots.mjs';

/**
 * @summary Derives the AgentOS cockpit roster seed (`apps/agentos/resources/data/fleetRoster.json`)
 * from the authoritative identity registry — never hand-paint the sample again.
 *
 * **Authority chain (read before editing the output):**
 * - Identity, canonical names, family, `participationStatus`, bench reasons: `ai/graph/identityRoots.mjs`
 *   (imported, not parsed — the one durable registry; C1-clean plain-data module).
 * - Engine tags: `learn/agentos/ModelStats.md` — observation-owned engine facts the registry
 *   deliberately does NOT carry (era discipline). Mirrored below via a small explicit map whose
 *   every entry names its ModelStats § anchor; an unmapped identity emits `null` (honest absence,
 *   never a fabricated tag).
 * - Session `state`: registry participation is NOT live session truth. This snapshot maps
 *   `active → 'ok'` and any known non-active status → `'off'`, and stamps the provenance per row
 *   (`sources.roster`) plus the `_meta` block, so "this is a registry snapshot" is visible in the
 *   data itself. Live session state is the wired roster path's job (`FleetCockpit.loadRoster`).
 *   The per-row stamp is a DECLARED-CALM source fact in the cockpit's source-health contract
 *   (`apps/agentos/util/SourceHealth.mjs`): it names the live producer as expected-absent
 *   (`not-wired` / `none`) and carries the static provenance in `reason`. A bare provenance string
 *   is a present-but-malformed fact there — `invalid`, one red alarm per card on the offline
 *   first-run; declared absence is the one present shape allowed to be calm. The producer literal
 *   rides the Body-side vocabulary twin, which `lint-fleet-vocabulary-parity` binds to the Brain
 *   authority, so the emitted literal tracks the contract it must satisfy.
 *
 * **Honesty invariants (the model's own contract, `apps/agentos/model/FleetAgent.mjs`):**
 * - `openLaneCount` stays `null` — the model renders NO badge for null; a derived count would be
 *   a fabricated one ("never a fake 0").
 * - `laneLine` carries only the registry's `statusReason` (bench reason); no invented lane lines.
 * - `participationStatus` is stamped per row (the roster-DTO tri-state truth) — the fleet view's
 *   eligibility logic reads it, so the derived seed feeds the authoritative field, not just prose.
 *
 * Usage: `node ai/scripts/fleet/deriveFleetRoster.mjs [--check]` (with `--check`: verify the
 * committed file is STRUCTURALLY equal to a fresh derivation, comparing every field except
 * `_meta.generatedAt` — the CI guard against hand-painting. Not a byte comparison: the timestamp
 * changes on every run, so a byte check would fail on a clock tick rather than on data drift).
 */

const OUTPUT = path.resolve('apps/agentos/resources/data/fleetRoster.json');

/**
 * Observation-owned engine tags, mirrored from learn/agentos/ModelStats.md (§ anchor per entry).
 * An identity missing here emits `engineTag: null` — honest absence, never an invented tag.
 *
 * **`neo-opus-vega` is deliberately absent.** That seat runs an operator-managed weekly
 * Fable/Opus rotation, so no static literal stays true for more than a few days, and
 * `apps/agentos/CARD-CONTRACT.md` names exactly this failure: a durable identity literal
 * publishes baseline as current and goes stale on any unmanaged engine boost, with the
 * July-2026 Fable-week rotations as the reflexive falsifier. A tag that is wrong half the
 * week is worse than no tag — the model renders no badge for `null` by design. Restore a
 * literal for that seat only once an era record can carry a time span instead of a point value.
 *
 * Exported so `ai/scripts/lint/lint-identity-engine-coherence.mjs` can read the map directly
 * instead of re-parsing this file. The lint is the CI guard that these tags still agree with
 * `ModelStats.md` and the registry — the three places drifted once and nothing noticed. That
 * lint treats the absence above as VALID, never as drift: it fails only on contradiction, so a
 * rotating seat can stay honestly silent without being pressured back into a false literal.
 * @type {Object<String,String>}
 */
export const ENGINE_TAG_BY_ID = {
    'neo-opus-ada'   : 'opus-5',      // §neo_opus
    'neo-opus-grace' : 'opus-5',      // §neo_claude_opus
    'neo-fable'      : 'fable-5',     // §neo_fable
    'neo-fable-clio' : 'fable-5',     // §neo_fable_clio (mirrors §neo_fable)
    'neo-gemini-pro' : '3.1-pro',     // §neo_gemini_pro
    'neo-gpt'        : 'gpt-5.6-sol', // §neo_gpt
    'neo-gpt-emmy'   : 'gpt-5.6-sol', // §neo_gpt_emmy (mirrors §neo_gpt)
    'neo-kimi-phoebe': 'kimi-k3',     // §neo_kimi_phoebe
    'neo-kimi-iris'  : 'kimi-k3'      // §neo_kimi_iris
};

/**
 * Map one registry entry to a roster row, or null when the entry is not a roster resident
 * (system nodes, the broadcast sentinel, non-agent accounts).
 * @param {Object} entry one `IDENTITIES` element (`{id, type, properties}`)
 * @returns {Object|null}
 */
function toRosterRow(entry) {
    const props = entry?.properties || {};

    if (entry.type !== 'AgentIdentity' || props.accountType !== 'agent' || !props.participationStatus) {
        return null;
    }

    const
        agentId = entry.id.replace(/^@/, ''),
        status  = props.participationStatus;

    return {
        agentId,
        githubUsername     : (props.githubLogin || '').replace(/^@/, '') || null,
        displayName        : props.displayName || entry.name,
        engineTag          : ENGINE_TAG_BY_ID[agentId] ?? null,
        family             : props.family ?? props.modelFamily ?? null,
        state              : status === 'active' ? 'ok' : 'off',
        avatarUrl          : `https://github.com/${agentId}.png?size=80`,
        laneLine           : props.statusReason ?? null,
        participationStatus: status,
        openLaneCount      : null,
        // declared expected-absence: the live roster producer is not wired for a static seed row,
        // and the contract's one calm present shape keeps the provenance in `reason` (a bare
        // string here normalizes as `invalid` — rejected evidence, one alarm per card)
        sources            : {roster: {
            source    : FLEET_COCKPIT_SOURCES.roster,
            state     : 'not-wired',
            confidence: 'none',
            reason    : 'static roster (identityRoots snapshot) · unobserved'
        }}
    };
}

/**
 * Derive the full roster document (`{_meta, data}`) from the registry.
 * @returns {Object}
 */
export function deriveFleetRoster() {
    const
        generatedAt = new Date().toISOString(),
        data        = IDENTITIES.map(toRosterRow).filter(Boolean);

    return {
        _meta: {
            generatedAt,
            authority : 'ai/graph/identityRoots.mjs',
            engineTags: 'learn/agentos/ModelStats.md (observation-owned, mirrored per-entry in the generator)',
            generator : 'ai/scripts/fleet/deriveFleetRoster.mjs',
            note      : 'Registry snapshot — participation truth, not live session state. Regenerate, do not hand-edit.'
        },
        data
    };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL('', import.meta.url).pathname);

if (isMain) {
    const
        next      = JSON.stringify(deriveFleetRoster(), null, 4) + '\n',
        checkMode = process.argv.includes('--check');

    if (checkMode) {
        const current = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, 'utf8') : '';

        // --check compares structure, not the timestamp: hand-painting is any data drift, not a clock tick.
        const strip = doc => { const parsed = JSON.parse(doc); delete parsed._meta.generatedAt; return JSON.stringify(parsed); };

        if (current && strip(current) === strip(next)) {
            console.log('deriveFleetRoster: committed seed is in sync with the registry');
            process.exit(0);
        }

        console.error('deriveFleetRoster: committed seed is STALE — run `node ai/scripts/fleet/deriveFleetRoster.mjs`');
        process.exit(1);
    }

    fs.writeFileSync(OUTPUT, next);
    console.log(`deriveFleetRoster: wrote ${OUTPUT} (${deriveFleetRoster().data.length} residents, registry-derived)`);
}
