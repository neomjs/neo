import {test, expect} from '@playwright/test';
import path           from 'node:path';
import '../../../../src/Neo.mjs';
import '../../../../src/core/_export.mjs';
import {
    PLANE_DEFAULTS,
    PLANE_ENV,
    resolvePlaneDataRoot,
    resolvePlaneId
} from '../../../../ai/planeConfig.mjs';
import ConfigBase from '../../../../ai/configBase.mjs';

test.describe('ai/planeConfig — the plane-identity pure-defaults twin', () => {
    test('constant maps are frozen and carry env NAMES, never values', () => {
        expect(Object.isFrozen(PLANE_ENV)).toBe(true);
        expect(Object.isFrozen(PLANE_DEFAULTS)).toBe(true);
        expect(PLANE_ENV.planeId).toBe('NEO_PLANE_ID');
        expect(PLANE_ENV.dataRoot).toBe('NEO_PLANE_DATA_ROOT')
    });

    test('the default planeId is opaque — no path or checkout content', () => {
        expect(PLANE_DEFAULTS.planeId).not.toContain('/');
        expect(PLANE_DEFAULTS.planeId).not.toContain(path.sep);
        expect(PLANE_DEFAULTS.planeId).not.toContain('.neo-ai-data')
    });

    test('resolvePlaneId: default without override, env override wins', () => {
        expect(resolvePlaneId({env: {}})).toBe(PLANE_DEFAULTS.planeId);
        expect(resolvePlaneId({env: {[PLANE_ENV.planeId]: 'overlay-plane-a'}})).toBe('overlay-plane-a')
    });

    test('resolvePlaneDataRoot: env override needs no root; injected root anchors the default', () => {
        expect(resolvePlaneDataRoot({env: {[PLANE_ENV.dataRoot]: '/vol/plane'}})).toBe('/vol/plane');

        const resolved = resolvePlaneDataRoot({env: {}, rootDir: '/tmp/seat-x'});
        expect(resolved).toBe(path.resolve('/tmp/seat-x', PLANE_DEFAULTS.dataRootRelative))
    });

    test('resolvePlaneDataRoot fails loud without a root — ambient cwd is never trusted', () => {
        expect(() => resolvePlaneDataRoot({env: {}})).toThrow(PLANE_ENV.dataRoot)
    });

    test('pairing: the leaf subtree declares FROM the twin — same literals, same env names', () => {
        const {plane} = ConfigBase.config.data;

        expect(plane.id.default).toBe(PLANE_DEFAULTS.planeId);
        expect(plane.id.env).toBe(PLANE_ENV.planeId);
        expect(plane.dataRoot.env).toBe(PLANE_ENV.dataRoot);
        // The leaf's absolute default anchors the twin's relative literal on neoRootDir —
        // identity of the trailing segment proves one shared literal, not two copies.
        expect(plane.dataRoot.default.endsWith(PLANE_DEFAULTS.dataRootRelative)).toBe(true);
        expect(plane.dataRoot.default).toBe(
            path.resolve(ConfigBase.config.data.neoRootDir.default, PLANE_DEFAULTS.dataRootRelative)
        )
    });

    test('resolver semantics match the leaf contract under a controlled env', () => {
        // The half that CAN still drift: the twin's pure resolution vs the leaf's
        // env-override-with-default. Same inputs, same outputs, both branches.
        const env = {[PLANE_ENV.planeId]: 'cloud-tenant-plane', [PLANE_ENV.dataRoot]: '/app/.neo-ai-data'};

        expect(resolvePlaneId({env})).toBe('cloud-tenant-plane');
        expect(resolvePlaneDataRoot({env})).toBe('/app/.neo-ai-data');

        const bare = {};
        expect(resolvePlaneId({env: bare})).toBe(ConfigBase.config.data.plane.id.default);
        expect(resolvePlaneDataRoot({env: bare, rootDir: ConfigBase.config.data.neoRootDir.default}))
            .toBe(ConfigBase.config.data.plane.dataRoot.default)
    });
});
