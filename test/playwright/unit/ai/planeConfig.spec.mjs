import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';
import Neo            from '../../../../src/Neo.mjs';
import '../../../../src/core/_export.mjs';
import {
    PLANE_DEFAULTS,
    PLANE_ENV,
    assertPlaneCoherence,
    isOpaquePlaneId,
    parsePlaneIdEnv,
    resolvePlaneDataRoot,
    resolvePlaneId
} from '../../../../ai/planeConfig.mjs';
import ConfigBase   from '../../../../ai/configBase.mjs';
import McConfigBase from '../../../../ai/mcp/server/memory-core/configBase.mjs';
import NlConfigBase from '../../../../ai/mcp/server/neural-link/configBase.mjs';

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
        // Equivalence pin, not a drift guard: for strings, the twin's truthiness check and the
        // provider's emptiness partition are identical ('' is the only falsy string), so this
        // pins a constructed equivalence on both branches rather than guarding a live channel.
        const env = {[PLANE_ENV.planeId]: 'cloud-tenant-plane', [PLANE_ENV.dataRoot]: '/app/.neo-ai-data'};

        expect(resolvePlaneId({env})).toBe('cloud-tenant-plane');
        expect(resolvePlaneDataRoot({env})).toBe('/app/.neo-ai-data');

        const bare = {};
        expect(resolvePlaneId({env: bare})).toBe(ConfigBase.config.data.plane.id.default);
        expect(resolvePlaneDataRoot({env: bare, rootDir: ConfigBase.config.data.neoRootDir.default}))
            .toBe(ConfigBase.config.data.plane.dataRoot.default)
    });
});

test.describe('resolved-value opacity — the invariant on the values that vary', () => {
    const pathShapedRows = ['/abs/path/checkout', '../worktrees/seat-a', 'C:\\checkout', '.neo-ai-data'];

    test('resolvePlaneId fails loud on every path-shaped override', () => {
        for (const bad of pathShapedRows) {
            expect(() => resolvePlaneId({env: {[PLANE_ENV.planeId]: bad}}), bad).toThrow('opaque')
        }
    });

    test('parsePlaneIdEnv: absent/empty defer to the default; valid passes; path-shaped throws', () => {
        expect(parsePlaneIdEnv(PLANE_ENV.planeId, {env: {}})).toBeUndefined();
        expect(parsePlaneIdEnv(PLANE_ENV.planeId, {env: {[PLANE_ENV.planeId]: ''}})).toBeUndefined();
        expect(parsePlaneIdEnv(PLANE_ENV.planeId, {env: {[PLANE_ENV.planeId]: 'overlay-plane-a'}})).toBe('overlay-plane-a');

        for (const bad of pathShapedRows) {
            expect(() => parsePlaneIdEnv(PLANE_ENV.planeId, {env: {[PLANE_ENV.planeId]: bad}}), bad).toThrow('opaque')
        }
    });

    test('isOpaquePlaneId: one predicate behind the load guard, the resolver, and the env layer', () => {
        expect(isOpaquePlaneId(PLANE_DEFAULTS.planeId)).toBe(true);
        expect(isOpaquePlaneId('cloud-tenant-plane')).toBe(true);
        expect(isOpaquePlaneId('')).toBe(false);
        expect(isOpaquePlaneId(null)).toBe(false);

        for (const bad of pathShapedRows) {
            expect(isOpaquePlaneId(bad), bad).toBe(false)
        }
    });

    test('the leaf reaches the same predicate: plane.id declares the twin parser', () => {
        expect(ConfigBase.config.data.plane.id.parse).toBe(parsePlaneIdEnv)
    });
});

test.describe('plane-member derivation witnesses — #15791 seat-variance ground truth', () => {
    // ticket-ref-ok: the #15799 AC binds these witnesses to the #15791 reconcile probe as their
    // ground truth. The probe's finding class: per-seat plane divergence arises where members
    // re-derive their own root (ambient cwd, homedir, ad-hoc module consts). These witnesses pin
    // every migrated member default to the ONE declared anchor — cwd-independent by construction,
    // so the probe's divergence class cannot re-enter through defaults.
    const anchor = ConfigBase.config.data.plane.dataRoot.default;

    test('the anchor itself is the twin resolution over neoRootDir', () => {
        expect(anchor).toBe(resolvePlaneDataRoot({env: {}, rootDir: ConfigBase.config.data.neoRootDir.default}))
    });

    test('root config members derive from the anchor', () => {
        const {data} = ConfigBase.config;

        expect(data.backupPath.default).toBe(path.resolve(anchor, 'backups'));
        expect(data.wakeDaemonHeartbeatAlivePath.default).toBe(path.resolve(anchor, 'wake-daemon/heartbeat.alive'));
        expect(data.fleet.instanceRoot.default).toBe(path.resolve(anchor, 'fleet/instances'));
        expect(data.engines.chroma.dataDirProd.default).toBe(path.resolve(anchor, 'chroma/unified'));
        expect(data.orchestrator.deploymentStateBridge.snapshotPath.default).toBe(path.resolve(anchor, 'deployment-state/snapshot.json'));
        expect(data.orchestrator.recoveryActuator.healAttemptsPath.default).toBe(path.resolve(anchor, 'orchestrator-daemon/heal-attempts.json'));
        expect(data.orchestrator.recoveryActuator.recoveryRunStateDir.default).toBe(path.resolve(anchor, 'orchestrator-daemon/recovery-runs'))
    });

    test('orchestrator dataDir + dbPath are anchored ABSOLUTE — ambient-cwd resolution retired', () => {
        const {orchestrator} = ConfigBase.config.data;

        expect(path.isAbsolute(orchestrator.dataDir.default)).toBe(true);
        expect(orchestrator.dataDir.default).toBe(path.resolve(anchor, 'orchestrator-daemon'));
        expect(path.isAbsolute(orchestrator.dbPath.default)).toBe(true);
        expect(orchestrator.dbPath.default).toBe(path.resolve(anchor, 'sqlite/memory-core-graph.sqlite'))
    });

    test('memory-core server members derive from the same anchor', () => {
        const {data} = McConfigBase.config;

        expect(data.memoryWal.dirProd.default).toBe(path.resolve(anchor, 'memory-wal'));
        expect(data.memoryWal.daemonDataDir.default).toBe(path.resolve(anchor, 'embed-daemon'));
        expect(data.messageWal.daemonDataDir.default).toBe(path.resolve(anchor, 'message-daemon'));
        expect(data.wakeDaemon.dataDir.default).toBe(path.resolve(anchor, 'wake-daemon'));
        expect(data.hookProjectionRoot.default).toBe(path.resolve(anchor, 'hook-projections'));
        expect(data.remRunStateDir.default).toBe(path.resolve(anchor, 'rem-runs'));
        expect(data.datasets.rlaif.trajectories.default).toBe(path.resolve(anchor, 'datasets/rlaif/trajectories.jsonl'));
        expect(data.goldenPathRouteAttributionLedgerDirProd.default).toBe(path.resolve(anchor, 'orchestrator-daemon/route-attribution'));
        expect(data.logPath.default).toBe(path.resolve(anchor, 'logs'));
        expect(data.lazyEdgesQueuePath.default).toBe(path.resolve(anchor, 'memory-core/lazy-edges.jsonl'))
    });

    test('knowledge-base + neural-link log members derive from the same anchor', async () => {
        // The KB config base re-wraps the registered Tier-1 singleton at module scope, so the
        // template must be fully evaluated FIRST — awaited dynamic imports serialize that order
        // (static import order races under worker sharding and fails file-load with "Cannot
        // create proxy" on Neo.ai.Config undefined). The module cache makes the template's
        // registration a ONE-SHOT side effect, and config.template.spec.mjs's afterAll restore
        // may have unregistered it in this worker — re-bind from the cached export, the same
        // registration-restore shape that spec uses.
        const templateModule = await import('../../../../ai/config.template.mjs');

        if (!Neo.ai?.Config) {
            Neo.ai        = Neo.ai || {};
            Neo.ai.Config = templateModule.default;
        }
        const KbConfigBase = (await import('../../../../ai/mcp/server/knowledge-base/configBase.mjs')).default;

        expect(KbConfigBase.config.data.logPath.default).toBe(path.resolve(anchor, 'logs'));
        expect(NlConfigBase.config.data.logPath.default).toBe(path.resolve(anchor, 'logs'))
    });
});

test.describe('assertPlaneCoherence — the F-invariant, both branches', () => {
    const canonical = '/durable/checkout/.neo-ai-data';

    test('standard boot: canonical identity passes and returns the frozen observed identity', () => {
        const observed = assertPlaneCoherence({planeId: PLANE_DEFAULTS.planeId, dataRoot: canonical, canonicalDataRoot: canonical});

        expect(observed).toEqual({planeId: PLANE_DEFAULTS.planeId, dataRoot: canonical});
        expect(Object.isFrozen(observed)).toBe(true)
    });

    test('isolated overlay with its OWN root boots', () => {
        expect(assertPlaneCoherence({
            planeId          : 'overlay-plane-a',
            dataRoot         : '/tmp/overlay-a/.neo-ai-data',
            canonicalDataRoot: canonical
        }).planeId).toBe('overlay-plane-a')
    });

    test('overlay that resolves the durable root fails closed', () => {
        expect(() => assertPlaneCoherence({
            planeId          : 'overlay-plane-a',
            dataRoot         : canonical,
            canonicalDataRoot: canonical
        })).toThrow('durable root')
    });

    test('overlay reaching the durable root THROUGH A SYMLINK fails closed — the symlink-escape class', () => {
        const base    = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-plane-f-'));
        const durable = path.join(base, 'durable-root');
        const link    = path.join(base, 'overlay-link');

        fs.mkdirSync(durable);
        fs.symlinkSync(durable, link);

        try {
            expect(() => assertPlaneCoherence({
                planeId          : 'overlay-plane-a',
                dataRoot         : link,
                canonicalDataRoot: durable
            })).toThrow('durable root')
        } finally {
            fs.rmSync(base, {recursive: true, force: true})
        }
    });

    test('a relative dataRoot fails the internal-consistency clause', () => {
        expect(() => assertPlaneCoherence({
            planeId          : PLANE_DEFAULTS.planeId,
            dataRoot         : '.neo-ai-data',
            canonicalDataRoot: canonical
        })).toThrow('absolute')
    });

    test('a path-shaped planeId fails at boot — closes the custom-config route the env parser cannot see', () => {
        expect(() => assertPlaneCoherence({
            planeId          : '../worktrees/seat-a',
            dataRoot         : canonical,
            canonicalDataRoot: canonical
        })).toThrow('opaque')
    });
});

test.describe('wakeDaemon watermark formulas — reactive derivation from the resolved dataDir', () => {
    // Pure-function tests: formulas are static config, callable with a constructed `data`
    // snapshot — no provider instance, no singleton mutation (the B4 discipline by construction).
    const syncIdFormula = McConfigBase.config.formulas['wakeDaemon.bridgeLastSyncIdPath'];
    const cursorFormula = McConfigBase.config.formulas['wakeDaemon.wakeSubscriptionLiveCursorPath'];

    test('derive from the RESOLVED dataDir when no override is set — relocation moves the watermarks', () => {
        const data = {wakeDaemon: {bridgeLastSyncIdPathOverride: null, wakeSubscriptionLiveCursorPathOverride: null, dataDir: '/relocated/wake-daemon'}};

        expect(syncIdFormula(data)).toBe(path.join('/relocated/wake-daemon', 'lastSyncId'));
        expect(cursorFormula(data)).toBe(path.join('/relocated/wake-daemon', 'wakeSubscriptionLiveCursor'))
    });

    test('explicit override leaves win over the derivation', () => {
        const data = {wakeDaemon: {bridgeLastSyncIdPathOverride: '/pins/lastSyncId', wakeSubscriptionLiveCursorPathOverride: '/pins/cursor', dataDir: '/relocated/wake-daemon'}};

        expect(syncIdFormula(data)).toBe('/pins/lastSyncId');
        expect(cursorFormula(data)).toBe('/pins/cursor')
    });
});
