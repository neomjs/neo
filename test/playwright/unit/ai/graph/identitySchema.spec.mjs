import {setup} from '../../../setup.mjs';

const appName = 'IdentitySchemaTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';

test.describe('identitySchema — node-types + the reflexive-landing acceptance fixture (ADR-0032 contract)', () => {
    let schema;

    // The fixture resident is STRUCTURALLY shaped like the live registry gap (flat model facts
    // still pre-swap; the swap inexpressible without eras) — exact capability values are
    // ILLUSTRATIVE, not registry-mirrored. The real-data reconciliation (fixture resident vs
    // the production registry entry) is a pinned AC on the registry-migration leaf, so the
    // reflexive landing gates REAL data downstream rather than overclaiming fidelity here.
    const REAL_ANCHOR = '@fixture-fable';

    const buildRealResident = () => {
        const identity = schema.createIdentityStateNode({
            identityKey: REAL_ANCHOR,
            socialLayer: {name: 'Mnemosyne', salute: null, disclosablePrior: 'bearer-chosen 2026-06-11'}
        });

        const seedEra = schema.createEmbodiedEpisodeNode({
            identityKey : REAL_ANCHOR,
            model       : 'claude-opus-4-8',
            family      : 'claude',
            tier        : 'opus',
            since       : '2026-06-01T00:00:00Z',
            capabilities: {contextWindowInput: 200000},
            harness     : 'claude-desktop'
        });

        return {identity: identity.node, episodes: [seedEra.node]}
    };

    test.beforeAll(async () => {
        schema = await import('../../../../../ai/graph/identitySchema.mjs');
    });

    test('node-type contracts: anchor immutability by construction, era-owned facts structurally excluded', () => {
        const identity = schema.createIdentityStateNode({identityKey: '@r1', socialLayer: {name: 'R'}});

        expect(identity.valid).toBe(true);
        expect(Object.isFrozen(identity.node)).toBe(true);
        expect(() => { identity.node.identityKey = '@hijack' }).toThrow(); // frozen in strict mode — the anchor cannot be renamed

        // the flat-facts gap is structurally rejected: model facts may never live on the identity
        const leaky = schema.createIdentityStateNode({identityKey: '@r2', socialLayer: {name: 'R2', modelFamily: 'claude'}});
        expect(leaky.valid).toBe(false);
        expect(leaky.reason).toContain('era-owned');

        // era validation: identity fields required, until must follow since
        expect(schema.createEmbodiedEpisodeNode({identityKey: '@r1', model: 'm', family: 'claude', since: '2026-06-01T00:00:00Z', until: '2026-05-01T00:00:00Z'}).valid).toBe(false);

        // the temporal gate is fail-CLOSED: unparseable timestamps refuse instead of sailing
        // through NaN comparisons (design-authority finding, reproduced pre-fix)
        expect(schema.createEmbodiedEpisodeNode({identityKey: '@r1', model: 'm', family: 'claude', since: 'not-a-timestamp'}).valid).toBe(false);
        expect(schema.createEmbodiedEpisodeNode({identityKey: '@r1', model: 'm', family: 'claude', since: '2026-06-01T00:00:00Z', until: 'garbage'}).valid).toBe(false);
    });

    test('THE REFLEXIVE LANDING (ADR-0032 §2.3.7): the real Opus→Fable swap is one resident, two eras, one unchanged anchor', () => {
        const {identity, episodes} = buildRealResident();

        const migrated = schema.migrateEra({
            identityNode: identity,
            episodes,
            newEra      : {
                model       : 'claude-fable-5',
                family      : 'claude',
                tier        : 'fable',
                since       : '2026-07-02T00:00:00Z',
                capabilities: {contextWindowInput: 1048576},
                harness     : 'claude-desktop-isolated'
            }
        });

        expect(migrated.valid).toBe(true);

        // (a) the operational anchor is UNCHANGED — same resident, by construction not by discipline
        expect(identity.identityKey).toBe(REAL_ANCHOR);
        expect(migrated.episodes.every(era => era.identityKey === REAL_ANCHOR)).toBe(true);

        // (b) two eras owning their facts respectively — the pre-swap truth is HISTORY, not overwritten
        expect(migrated.episodes).toHaveLength(2);
        const [opusEra, fableEra] = migrated.episodes;
        expect(opusEra.model).toBe('claude-opus-4-8');
        expect(opusEra.until).toBe('2026-07-02T00:00:00Z');            // closed AT the swap, never deleted
        expect(opusEra.capabilities.contextWindowInput).toBe(200000);  // the old capability fact preserved in its era
        expect(fableEra.model).toBe('claude-fable-5');
        expect(fableEra.until).toBeNull();                             // the open head
        expect(fableEra.capabilities.contextWindowInput).toBe(1048576);

        // (c) one continuous resident: the chain validates as a single identity's history
        expect(schema.validateEraChain(identity, migrated.episodes)).toEqual({valid: true, reason: null});

        // and the social layer survived untouched — the name is display state, not a key
        expect(identity.socialLayer.name).toBe('Mnemosyne');
    });

    test('the falsifier has teeth (§2.2.3): a snapshot-as-self model FAILS this fixture', () => {
        // The counter-model: identity-with-flat-mutable-facts (the live pre-schema shape).
        // Representing the swap in that model REQUIRES overwriting — which destroys the pre-swap
        // truth and cannot satisfy the two-era assertion. We prove both failure modes:

        // 1. the schema REFUSES to build the counter-model (flat facts on the identity)
        const flatModel = schema.createIdentityStateNode({
            identityKey: '@snapshot-self',
            socialLayer: {name: 'S', model: 'claude-opus-4-8', family: 'claude'}
        });
        expect(flatModel.valid).toBe(false);

        // 2. simulating the counter-model's ONLY available move (in-place overwrite) on a plain
        //    object shows why it fails the acceptance shape: after the overwrite there is ONE
        //    fact-set and the pre-swap truth is GONE — no two-era history can be asserted.
        const snapshotSelf = {identityKey: '@snapshot-self', model: 'claude-opus-4-8', family: 'claude'};
        snapshotSelf.model = 'claude-fable-5'; // the overwrite "migration"

        expect(snapshotSelf.model).toBe('claude-fable-5');
        // the fixture's core assertion is IMPOSSIBLE here: no second era exists, the old model fact
        // is unrecoverable — exactly the character-erosion the era model prevents
        expect(Object.keys(snapshotSelf)).not.toContain('eras');
    });

    test('era-chain integrity: overlaps, multiple heads, foreign anchors, and history rewrites all refuse', () => {
        const {identity, episodes} = buildRealResident();

        // two open eras
        const secondOpen = schema.createEmbodiedEpisodeNode({identityKey: REAL_ANCHOR, model: 'm2', family: 'claude', since: '2026-07-01T00:00:00Z'});
        expect(schema.validateEraChain(identity, [...episodes, secondOpen.node]).valid).toBe(false);

        // foreign anchor in the chain
        const foreign = schema.createEmbodiedEpisodeNode({identityKey: '@someone-else', model: 'm', family: 'gpt', since: '2026-07-01T00:00:00Z'});
        expect(schema.validateEraChain(identity, [...episodes, foreign.node]).reason).toContain('anchor');

        // migration cannot rewrite history: a new era opening BEFORE the head refuses
        const backdated = schema.migrateEra({
            identityNode: identity,
            episodes,
            newEra      : {model: 'claude-fable-5', family: 'claude', since: '2026-05-01T00:00:00Z'}
        });
        expect(backdated.valid).toBe(false);
        expect(backdated.reason).toContain('never rewritten');

        // migration is pure: the input chain is untouched
        schema.migrateEra({identityNode: identity, episodes, newEra: {model: 'claude-fable-5', family: 'claude', since: '2026-07-02T00:00:00Z'}});
        expect(episodes).toHaveLength(1);
        expect(episodes[0].until).toBeNull();

        // RAW nodes with unparseable timestamps refuse — NaN would make every ordering/overlap
        // comparison vacuously false, so the validator enforces parseability itself (reviewer falsifier)
        const rawBadSince = {id: 'raw-1', type: schema.IDENTITY_NODE_TYPES.EMBODIED_EPISODE, identityKey: REAL_ANCHOR, model: 'm', family: 'claude', since: 'not-a-date', until: null};
        expect(schema.validateEraChain(identity, [rawBadSince]).reason).toContain('unparseable since');

        const rawBadUntil = {id: 'raw-2', type: schema.IDENTITY_NODE_TYPES.EMBODIED_EPISODE, identityKey: REAL_ANCHOR, model: 'm', family: 'claude', since: '2026-06-01T00:00:00Z', until: 'garbage'};
        expect(schema.validateEraChain(identity, [rawBadUntil, ...episodes]).reason).toContain('unparseable until');
    });
});
