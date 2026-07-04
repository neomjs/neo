import {setup} from '../../../setup.mjs';

const appName = 'IdentityHydrationTest';

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

test.describe('identityHydration — the regenerable index, never a snapshot-as-self (ADR-0032 contract)', () => {
    let schema, hydration;

    const buildResident = () => {
        const identity = schema.createIdentityStateNode({identityKey: '@hydra-1', socialLayer: {name: 'Hydra'}}).node;
        const era1     = schema.createEmbodiedEpisodeNode({identityKey: '@hydra-1', model: 'claude-opus-4-8', family: 'claude', since: '2026-06-01T00:00:00Z', capabilities: {contextWindowInput: 200000}}).node;
        const migrated = schema.migrateEra({identityNode: identity, episodes: [era1], newEra: {model: 'claude-fable-5', family: 'claude', since: '2026-07-02T00:00:00Z', capabilities: {contextWindowInput: 1048576}}});

        return {identity, episodes: migrated.episodes}
    };

    test.beforeAll(async () => {
        schema    = await import('../../../../../ai/graph/identitySchema.mjs');
        hydration = await import('../../../../../ai/graph/identityHydration.mjs');
    });

    test('projects the anchor + social layer + CURRENT-era facts over a validated chain', () => {
        const {identity, episodes} = buildResident();
        const built                = hydration.buildHydrationIndex({identityNode: identity, episodes});

        expect(built.valid).toBe(true);
        expect(built.index.identityKey).toBe('@hydra-1');
        expect(built.index.socialLayer.name).toBe('Hydra');
        expect(built.index.currentEra.model).toBe('claude-fable-5');          // the head, not the seed
        expect(built.index.currentEra.capabilities.contextWindowInput).toBe(1048576);
        expect(built.index.eraCount).toBe(2);
        expect(built.index.firstSince).toBe('2026-06-01T00:00:00Z');

        // an invalid chain never hydrates — the index only ever projects certified history
        const broken = hydration.buildHydrationIndex({identityNode: identity, episodes: []});
        expect(broken.valid).toBe(false);
    });

    test('THE PROPERTY: losing the index loses nothing — delete → rebuild → diff = ∅', () => {
        const {identity, episodes} = buildResident();

        let   index  = hydration.buildHydrationIndex({identityNode: identity, episodes}).index;
        const before = JSON.parse(JSON.stringify(index));

        index = null; // "lose" the index — the trail is the truth

        const rebuilt = hydration.buildHydrationIndex({identityNode: identity, episodes}).index;

        expect(JSON.parse(JSON.stringify(rebuilt))).toEqual(before); // deterministic regeneration, no clock, no drift
    });

    test('the index cannot masquerade as a self (the Fork-8 refusal, structural)', () => {
        const {identity, episodes} = buildResident();
        const index                = hydration.buildHydrationIndex({identityNode: identity, episodes}).index;

        // frozen: writing "the self" onto the view throws
        expect(Object.isFrozen(index)).toBe(true);
        expect(() => { index.identityKey = '@hijack' }).toThrow();

        // wrong node type by construction: the schema's chain validator rejects an index as an anchor
        expect(index.type).not.toBe(schema.IDENTITY_NODE_TYPES.IDENTITY_STATE);
        expect(schema.validateEraChain(index, episodes).valid).toBe(false);
        expect(index.regenerable).toBe(true);
    });

    test('staleness is detected, never trusted: the index goes stale the instant the trail grows', () => {
        const {identity, episodes} = buildResident();
        const index                = hydration.buildHydrationIndex({identityNode: identity, episodes}).index;

        expect(hydration.isIndexCurrent(index, episodes)).toBe(true);

        // the resident's trail grows (another era migration) — the OLD index must read stale
        const grown = schema.migrateEra({identityNode: identity, episodes, newEra: {model: 'claude-opus-4-8', family: 'claude', since: '2026-07-04T00:00:00Z'}});

        expect(hydration.isIndexCurrent(index, grown.episodes)).toBe(false);

        // and the rebuild over the grown trail is current again — rebuild, never patch
        const fresh = hydration.buildHydrationIndex({identityNode: identity, episodes: grown.episodes}).index;
        expect(hydration.isIndexCurrent(fresh, grown.episodes)).toBe(true);
        expect(fresh.currentEra.since).toBe('2026-07-04T00:00:00Z');
        expect(fresh.eraCount).toBe(3);
    });

    test('staleness compares the FULL projected era shape — same since/model with changed facts reads stale (reviewer falsifier)', () => {
        const {identity, episodes} = buildResident();
        const index                = hydration.buildHydrationIndex({identityNode: identity, episodes}).index;

        // same since + same model, but the head era's projected FACTS changed (capabilities bump):
        // a partial-key check would serve the outdated index as current — the full-shape compare must not
        const head    = episodes[episodes.length - 1];
        const changed = [...episodes.slice(0, -1), Object.freeze({...head, capabilities: {...head.capabilities, contextWindowInput: 999}})];

        expect(hydration.isIndexCurrent(index, changed)).toBe(false);

        // tier drift with identical since/model reads stale too
        const retiered = [...episodes.slice(0, -1), Object.freeze({...head, tier: 'mythos'})];
        expect(hydration.isIndexCurrent(index, retiered)).toBe(false);
    });

    test('malformed RAW episodes do not hydrate — the chain gate refuses before any projection (reviewer falsifier)', () => {
        const {identity, episodes} = buildResident();

        const rawBad = {id: 'raw-x', type: schema.IDENTITY_NODE_TYPES.EMBODIED_EPISODE, identityKey: identity.identityKey, model: 'm', family: 'claude', since: 'not-a-date', until: null};
        const result = hydration.buildHydrationIndex({identityNode: identity, episodes: [rawBad]});

        expect(result.valid).toBe(false);
        expect(result.index).toBeNull();
        expect(result.reason).toContain('unparseable since');

        // and a malformed row hiding inside an otherwise-valid chain refuses the same way
        const mixed = hydration.buildHydrationIndex({identityNode: identity, episodes: [...episodes, {...rawBad, until: '2026-07-01T00:00:00Z', since: 'garbage'}]});
        expect(mixed.valid).toBe(false);
    });
});
