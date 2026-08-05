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
