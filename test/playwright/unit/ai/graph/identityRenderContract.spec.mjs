import {setup} from '../../../setup.mjs';

const appName = 'IdentityRenderContractTest';

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

test.describe('identityRenderContract — the render-model consumer read-contract (ADR-0032 §2.3)', () => {
    let schema, contract;

    const REAL_ANCHOR = '@render-fixture';

    // the reflexive-landing resident: an Opus era → a Fable era, one anchor
    const buildResident = () => {
        const identity = schema.createIdentityStateNode({
            identityKey: REAL_ANCHOR,
            socialLayer: {name: 'Grace', salute: '🖖'}
        }).node;

        const seedEra = schema.createEmbodiedEpisodeNode({
            identityKey : REAL_ANCHOR,
            model       : 'claude-opus-4-8',
            family      : 'claude',
            tier        : 'opus',
            since       : '2026-06-01T00:00:00Z',
            capabilities: {contextWindowInput: 1048576}
        }).node;

        const migrated = schema.migrateEra({
            identityNode: identity,
            episodes    : [seedEra],
            newEra      : {model: 'claude-fable-5', family: 'claude', tier: 'fable', since: '2026-07-02T00:00:00Z', capabilities: {contextWindowInput: 1048576}}
        });

        return {identity, episodes: migrated.episodes}
    };

    test.beforeAll(async () => {
        schema   = await import('../../../../../ai/graph/identitySchema.mjs');
        contract = await import('../../../../../ai/graph/identityRenderContract.mjs');
    });

    test('resolves a resident into the render-view: anchor selfKey + display + current era + timeline', () => {
        const {identity, episodes} = buildResident();
        const {valid, view}        = contract.readResidentForRender({identityNode: identity, episodes});

        expect(valid).toBe(true);
        expect(view.selfKey).toBe(REAL_ANCHOR);                  // the object-permanent key (the anchor)
        expect(view.display.name).toBe('Grace');
        expect(view.display.salute).toBe('🖖');                  // the opt-in display layer survives
        expect(view.current.model).toBe('claude-fable-5');       // the head era's facts, not the seed's
        expect(view.timeline).toHaveLength(2);
        expect(view.timeline[0].model).toBe('claude-opus-4-8');  // the object-permanent history, ordered
        expect(view.timeline[1].model).toBe('claude-fable-5');
        expect(view.eraCount).toBe(2);
    });

    test('THE PROPERTY: a family switch re-renders the SAME resident, never a new self', () => {
        const identity = schema.createIdentityStateNode({identityKey: REAL_ANCHOR, socialLayer: {name: 'Grace'}}).node;
        const opusEra  = schema.createEmbodiedEpisodeNode({identityKey: REAL_ANCHOR, model: 'claude-opus-4-8', family: 'claude', since: '2026-06-01T00:00:00Z'}).node;

        // BEFORE the swap: one Opus era
        const before = contract.readResidentForRender({identityNode: identity, episodes: [opusEra]});

        // AFTER the swap: Opus closed + Fable open — a family switch is a NEW era on the SAME anchor
        const migrated = schema.migrateEra({identityNode: identity, episodes: [opusEra], newEra: {model: 'claude-fable-5', family: 'claude', since: '2026-07-02T00:00:00Z'}});
        const after    = contract.readResidentForRender({identityNode: identity, episodes: migrated.episodes});

        // the current model changed (Opus → Fable) but the SELF did not — one continuous resident
        expect(before.view.current.model).toBe('claude-opus-4-8');
        expect(after.view.current.model).toBe('claude-fable-5');
        expect(before.view.selfKey).toBe(after.view.selfKey);
        expect(contract.sameResident(before.view, after.view)).toBe(true);
        expect(after.view.selfKey).toBe(REAL_ANCHOR);            // still the same self across the boundary
    });

    test('the view is a VIEW, not the self (Fork-8 / no snapshot-as-self, §2.2.3)', () => {
        const {identity, episodes} = buildResident();
        const view                 = contract.readResidentForRender({identityNode: identity, episodes}).view;

        expect(Object.isFrozen(view)).toBe(true);
        expect(view.regenerable).toBe(true);
        expect(() => { view.selfKey = '@hijack' }).toThrow();    // frozen — a consumer cannot rewrite the self
        expect(view.type).not.toBe(schema.IDENTITY_NODE_TYPES.IDENTITY_STATE);
        expect(schema.validateEraChain(view, episodes).valid).toBe(false); // the schema rejects the view as an anchor
    });

    test('selfKey is the identity, not the era: identical current facts on different anchors are NOT the same self', () => {
        const eraFor = key => [schema.createEmbodiedEpisodeNode({identityKey: key, model: 'claude-fable-5', family: 'claude', since: '2026-07-02T00:00:00Z'}).node];
        const viewA  = contract.readResidentForRender({identityNode: schema.createIdentityStateNode({identityKey: '@resident-a'}).node, episodes: eraFor('@resident-a')}).view;
        const viewB  = contract.readResidentForRender({identityNode: schema.createIdentityStateNode({identityKey: '@resident-b'}).node, episodes: eraFor('@resident-b')}).view;

        expect(viewA.current.model).toBe(viewB.current.model);   // identical current model/family…
        expect(contract.sameResident(viewA, viewB)).toBe(false); // …but different anchors = different selves
    });

    test('refuses a resident whose chain does not validate — the render-model renders only certified history', () => {
        const result = contract.readResidentForRender({identityNode: schema.createIdentityStateNode({identityKey: REAL_ANCHOR}).node, episodes: []});

        expect(result.valid).toBe(false);
        expect(result.view).toBeNull();
        expect(result.reason).toContain('validated resident');
    });

    test('sameResident FAILS CLOSED: anchorless / malformed render-view-shaped objects are NOT one resident', () => {
        const T = contract.RENDER_VIEW_TYPE;

        // two render-view-shaped objects with NO anchor must NOT collapse to true via `undefined === undefined`
        expect(contract.sameResident({type: T}, {type: T})).toBe(false);
        // blank or non-string anchors also fail closed
        expect(contract.sameResident({type: T, selfKey: '   '}, {type: T, selfKey: '   '})).toBe(false);
        expect(contract.sameResident({type: T, selfKey: null}, {type: T, selfKey: null})).toBe(false);
        // and a real resident still matches itself across an era boundary (regression guard)
        const {identity, episodes} = buildResident();
        const view                 = contract.readResidentForRender({identityNode: identity, episodes}).view;
        expect(contract.sameResident(view, view)).toBe(true);
    });
});
