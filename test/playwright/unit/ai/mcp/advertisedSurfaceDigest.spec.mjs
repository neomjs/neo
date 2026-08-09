import {setup} from '../../../setup.mjs';

const appName = 'AdvertisedSurfaceDigestTest';

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

/**
 * Covers the advertised-surface digest — the carrier that lets a seat discover its cached tool schema
 * no longer matches what the server exposes.
 *
 * The properties asserted here are the ones a future refactor would silently break: that a reworded
 * description does NOT move the digest (otherwise the signal cries wolf and gets ignored), and that
 * key ordering does NOT move it (otherwise a seat is reported stale for a surface it actually holds).
 */
test.describe('ToolService advertised-surface digest', () => {
    let ToolService;

    /**
     * @summary Builds a ToolService stub exposing a fixed advertised surface.
     * @param {Object[]} tools Advertised tools.
     * @returns {Object}
     */
    function serviceWith(tools) {
        const instance = Object.create(ToolService.prototype);

        instance.initializeToolMapping   = () => {};
        instance.getToolsForProjection   = () => tools;

        return instance
    }

    test.beforeAll(async () => {
        ToolService = (await import('../../../../../ai/mcp/ToolService.mjs')).default
    });

    test('identical surfaces digest identically, and an added tool changes it', () => {
        const base = [
            {name: 'alpha', inputSchema: {type: 'object', properties: {a: {type: 'string'}}}},
            {name: 'beta',  inputSchema: {type: 'object', properties: {b: {type: 'number'}}}}
        ];

        const digestA = serviceWith(base).getAdvertisedSurfaceDigest(),
              digestB = serviceWith([...base]).getAdvertisedSurfaceDigest();

        expect(digestA).toBe(digestB);

        // The defect this exists to detect: a capability shipped after the client connected.
        const withNewTool = serviceWith([...base, {name: 'gamma', inputSchema: {type: 'object'}}]).getAdvertisedSurfaceDigest();

        expect(withNewTool).not.toBe(digestA)
    });

    test('a changed enum on an existing tool changes the digest', () => {
        // The measured defect was exactly this shape: `manage_wake_subscription` gained a `resume`
        // action, and a client holding the old enum rejected the call before it left.
        const before = serviceWith([{name: 'manage_wake_subscription', inputSchema: {
            type: 'object', properties: {action: {enum: ['bootstrap', 'list', 'resync']}}
        }}]).getAdvertisedSurfaceDigest();

        const after = serviceWith([{name: 'manage_wake_subscription', inputSchema: {
            type: 'object', properties: {action: {enum: ['bootstrap', 'list', 'resync', 'resume']}}
        }}]).getAdvertisedSurfaceDigest();

        expect(after).not.toBe(before)
    });

    test('a reworded description does NOT change the digest', () => {
        const withDescription = serviceWith([
            {name: 'alpha', description: 'original wording', inputSchema: {type: 'object'}}
        ]).getAdvertisedSurfaceDigest();

        const reworded = serviceWith([
            {name: 'alpha', description: 'completely different prose, and a published digest literal', inputSchema: {type: 'object'}}
        ]).getAdvertisedSurfaceDigest();

        // Load-bearing twice: it keeps the digest non-recursive (the value is published INSIDE a tool
        // description), and it keeps the axis capability-reachability rather than copy-freshness.
        expect(reworded).toBe(withDescription)
    });

    test('the digest covers the projected listing shape — prose leaking into a listed schema moves it (#16588)', () => {
        // With compactToolSchemas the listing is prose-free by construction, so schema descriptions
        // can no longer move this digest. The canary for the regression direction: if prose ever
        // reappears IN the list payload, the digest must shift — a silent reintroduction fails here.
        const stripped = serviceWith([
            {name: 'alpha', inputSchema: {type: 'object', properties: {a: {type: 'string'}}}}
        ]).getAdvertisedSurfaceDigest();

        const withProse = serviceWith([
            {name: 'alpha', inputSchema: {type: 'object', properties: {a: {type: 'string', description: 'prose that must never ride the listing'}}}}
        ]).getAdvertisedSurfaceDigest();

        expect(withProse).not.toBe(stripped)
    });

    test('tool order and object-key order do not change the digest', () => {
        const ordered = serviceWith([
            {name: 'alpha', inputSchema: {type: 'object', properties: {a: {type: 'string'}}}},
            {name: 'beta',  inputSchema: {type: 'object', properties: {b: {type: 'number'}}}}
        ]).getAdvertisedSurfaceDigest();

        // Same surface, reversed listing order and reversed key insertion order. A digest sensitive to
        // either would report a seat stale for a surface it demonstrably holds — a false positive on
        // the one axis this measures.
        const shuffled = serviceWith([
            {name: 'beta',  inputSchema: {properties: {b: {type: 'number'}}, type: 'object'}},
            {name: 'alpha', inputSchema: {properties: {a: {type: 'string'}}, type: 'object'}}
        ]).getAdvertisedSurfaceDigest();

        expect(shuffled).toBe(ordered)
    });

    test('a projected subset digests differently from the full surface', () => {
        const full = serviceWith([
            {name: 'alpha', inputSchema: {type: 'object'}},
            {name: 'beta',  inputSchema: {type: 'object'}}
        ]).getAdvertisedSurfaceDigest();

        // Computed over what the projection ADVERTISES, not the raw OpenAPI file — otherwise every
        // profiled seat reads permanently stale against a surface it was never offered.
        const projected = serviceWith([{name: 'alpha', inputSchema: {type: 'object'}}]).getAdvertisedSurfaceDigest();

        expect(projected).not.toBe(full)
    });

    test('an absent inputSchema is stable rather than throwing', () => {
        const first  = serviceWith([{name: 'alpha'}]).getAdvertisedSurfaceDigest(),
              second = serviceWith([{name: 'alpha', inputSchema: null}]).getAdvertisedSurfaceDigest();

        expect(first).toBe(second);
        expect(first).toMatch(/^[0-9a-f]{12}$/)
    })
});

/**
 * Covers the two halves a seat actually compares: the token frozen into its cached `healthcheck`
 * DESCRIPTOR at attach, and the token the live `healthcheck` RESULT reports back.
 *
 * The three cells are asserted through `readSurfaceVerdict`, which is this file's executable copy of
 * the documented procedure. Its `unknown` branch is the one worth guarding: a missing token means the
 * comparison could not be made, and reading that as `current` would turn the instrument into a source
 * of exactly the false confidence it exists to remove.
 */
test.describe('advertised-surface descriptor and result', () => {
    let ADVERTISED_SURFACE_DIGEST_LABEL, ToolService;

    /**
     * @summary Builds a ToolService stub advertising a fixed surface, with the real listing methods.
     * @param {Object[]} tools Advertised tools.
     * @returns {Object}
     */
    function serviceWith(tools) {
        const instance = Object.create(ToolService.prototype);

        instance.initializeToolMapping    = () => {};
        instance.getToolsForProjection    = () => tools;
        instance.surfaceDigestCarrierTool = 'healthcheck';

        return instance
    }

    /**
     * @summary The documented comparison, executed. Extracts the attach-time token from a cached
     * descriptor and compares it against a live result token.
     * @param {Object} options
     * @param {String|null} options.cachedDescription Description the client cached at attach.
     * @param {Object|null} options.liveResult `healthcheck` result the client just received.
     * @returns {'current'|'stale'|'unknown'}
     */
    function readSurfaceVerdict({cachedDescription, liveResult}) {
        const match = String(cachedDescription ?? '')
                  .match(new RegExp(`${ADVERTISED_SURFACE_DIGEST_LABEL}\\s*([0-9a-f]{12})`)),
              attached  = match?.[1] ?? null,
              live      = liveResult?.advertisedSurface?.digest ?? null;

        // Either side missing means the comparison did not happen. It is NOT evidence of freshness:
        // a server predating this instrument produces exactly this shape.
        if (!attached || !live) {
            return 'unknown';
        }

        return attached === live ? 'current' : 'stale'
    }

    const surface = [
        {name: 'alpha',       inputSchema: {type: 'object'}},
        {name: 'healthcheck', description: 'Health Check', inputSchema: {type: 'object'}}
    ];
    const grownSurface = [...surface, {name: 'resume', inputSchema: {type: 'object'}}];

    test.beforeAll(async () => {
        const module = await import('../../../../../ai/mcp/ToolService.mjs');

        ADVERTISED_SURFACE_DIGEST_LABEL = module.ADVERTISED_SURFACE_DIGEST_LABEL;
        ToolService                     = module.default
    });

    test('the carrier descriptor carries the live digest, and other tools are untouched', () => {
        const service = serviceWith(surface),
              {tools} = service.listTools({}),
              carrier = tools.find(tool => tool.name === 'healthcheck');

        expect(carrier.description)
            .toBe(`Health Check\n\n${ADVERTISED_SURFACE_DIGEST_LABEL} ${service.getAdvertisedSurfaceDigest()}`);
        // Control: without it, a stamp applied to every tool would satisfy the assertion above.
        expect(tools.find(tool => tool.name === 'alpha').description).toBeUndefined()
    });

    test('stamping the descriptor does not move the digest — the value is not an input to itself', () => {
        const service = serviceWith(surface),
              before  = service.getAdvertisedSurfaceDigest(),
              {tools} = service.listTools({});

        // Re-digest the surface as it is now ADVERTISED, stamp included. Descriptions are excluded
        // from the canonical form precisely so this holds; digesting them would make the published
        // value change the value being published.
        expect(serviceWith(tools).getAdvertisedSurfaceDigest()).toBe(before)
    });

    test('stamping does not mutate the shared listing cache', () => {
        const service = serviceWith(surface);

        service.listTools({});

        // The cache is shared across projections. Stamping in place would leak one projection's
        // digest into another projection's listing, which reads as staleness that is not there.
        expect(surface.find(tool => tool.name === 'healthcheck').description).toBe('Health Check')
    });

    test('the result reports the same digest the descriptor carries', () => {
        const service   = serviceWith(surface),
              {tools}   = service.listTools({}),
              described = service.describeAdvertisedSurface();

        expect(described).toMatchObject({carrierTool: 'healthcheck', toolCount: 2});
        expect(tools.find(tool => tool.name === 'healthcheck').description).toContain(described.digest)
    });

    test('CELL 1 — matching tokens read as current', () => {
        const service = serviceWith(surface),
              {tools} = service.listTools({});

        expect(readSurfaceVerdict({
            cachedDescription: tools.find(tool => tool.name === 'healthcheck').description,
            liveResult       : {advertisedSurface: service.describeAdvertisedSurface()}
        })).toBe('current')
    });

    test('CELL 2 — a descriptor cached before a tool shipped reads as stale', () => {
        // The observed defect this reproduces: a tool gained an action after the seat attached, the
        // seat's cached enum rejected the call client-side, and the seat had no way to notice.
        const attached = serviceWith(surface).listTools({}).tools
                  .find(tool => tool.name === 'healthcheck').description,
              liveAfter = serviceWith(grownSurface).describeAdvertisedSurface();

        expect(readSurfaceVerdict({cachedDescription: attached, liveResult: {advertisedSurface: liveAfter}}))
            .toBe('stale')
    });

    test('CELL 3 — either side missing reads as unknown, never current', () => {
        const service = serviceWith(surface),
              live    = {advertisedSurface: service.describeAdvertisedSurface()},
              stamped = service.listTools({}).tools.find(tool => tool.name === 'healthcheck').description;

        // A server that predates the instrument: descriptor has no token.
        expect(readSurfaceVerdict({cachedDescription: 'Health Check', liveResult: live})).toBe('unknown');
        // A result that could not compute one.
        expect(readSurfaceVerdict({cachedDescription: stamped, liveResult: {}})).toBe('unknown');
        expect(readSurfaceVerdict({cachedDescription: null, liveResult: null})).toBe('unknown')
    });

    test('the descriptor digest is scoped to the projection that was listed', () => {
        const full = serviceWith(surface).listTools({}).tools
                  .find(tool => tool.name === 'healthcheck').description,
              projected = serviceWith([surface[1]]).listTools({}).tools
                  .find(tool => tool.name === 'healthcheck').description;

        // A profiled seat must not read stale merely because it was offered fewer tools.
        expect(projected).not.toBe(full)
    });

    test('a page without the carrier carries no token, which is unknown rather than current', () => {
        const service = serviceWith(surface),
              {tools} = service.listTools({cursor: 0, limit: 1});

        expect(tools.map(tool => tool.name)).toEqual(['alpha']);
        expect(readSurfaceVerdict({
            cachedDescription: tools[0].description,
            liveResult       : {advertisedSurface: service.describeAdvertisedSurface()}
        })).toBe('unknown')
    })
});
