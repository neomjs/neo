import {test, expect}     from '@playwright/test';
import fs                 from 'node:fs';
import os                 from 'node:os';
import path               from 'node:path';
import {fileURLToPath}    from 'node:url';
import {load as yamlLoad} from 'js-yaml';
import Neo                from '../../../../src/Neo.mjs';
import '../../../../src/core/_export.mjs';
import ConfigProvider, {createConfigProxy} from '../../../../ai/ConfigProvider.mjs';
import {
    CANONICAL_PLANE_ID,
    assertPlaneCoherence,
    assertPlaneMemberCoherence,
    collectPlaneMembers,
    derivePlaneMemberPaths,
    isOpaquePlaneId,
    parsePlaneIdEnv,
    resolvePlaneDataRoot
} from '../../../../ai/planeConfig.mjs';
import ConfigBase, {PLANE_MEMBER_PATHS} from '../../../../ai/configBase.mjs';
import McConfigBase                     from '../../../../ai/mcp/server/memory-core/configBase.mjs';
import NlConfigBase, {
    PLANE_MEMBER_PATHS as NL_MEMBER_PATHS
} from '../../../../ai/mcp/server/neural-link/configBase.mjs';

const specDir = path.dirname(fileURLToPath(import.meta.url));

test.describe('ai/planeConfig — the config layer\'s plane helpers', () => {
    test('the module reads NO environment — the leaf owns env binding, alone', () => {
        /*
         * The load-bearing property, asserted at source. This module used to carry a parallel
         * env-resolution path beside the leaf's own env layer — two resolvers for one value, able
         * to disagree. Every production caller had already opted out of it and the identity
         * resolver had no production caller at all, so the second path existed for its tests.
         *
         * `parsePlaneIdEnv` is the ONE permitted env reader here, and it is not a second path: it
         * is the `plane.id` leaf's own `parse` hook, invoked BY the leaf machinery.
         */
        const source     = fs.readFileSync(path.join(specDir, '../../../../ai/planeConfig.mjs'), 'utf8'),
              envReaders = source.split('\n')
                  .map((line, index) => ({line: index + 1, text: line}))
                  .filter(({text}) => /process\.env|env\[/.test(text) && !text.trim().startsWith('*'));

        // Only inside parsePlaneIdEnv — the leaf's parse hook.
        expect(envReaders.every(({line}) => line > source.split('\n').findIndex(l => l.includes('export function parsePlaneIdEnv')) &&
                                            line < source.split('\n').findIndex(l => l.includes('export function resolvePlaneDataRoot')))).toBe(true)
    });

    test('CANONICAL_PLANE_ID is the single exported literal, and it is opaque', () => {
        expect(CANONICAL_PLANE_ID).toBe('neo-local-canonical');
        expect(CANONICAL_PLANE_ID).not.toContain('/');
        expect(CANONICAL_PLANE_ID).not.toContain(path.sep);
        expect(CANONICAL_PLANE_ID).not.toContain('.neo-ai-data')
    });

    test('resolvePlaneDataRoot is a pure anchor computation — no env, root required', () => {
        expect(resolvePlaneDataRoot({rootDir: '/tmp/seat-x'})).toBe(path.join('/tmp/seat-x', '.neo-ai-data'));

        // Relocation belongs to the leaf's env binding, so an env var cannot move the ANCHOR.
        const previous = process.env.NEO_PLANE_DATA_ROOT;
        process.env.NEO_PLANE_DATA_ROOT = '/vol/should-not-be-read';
        try {
            expect(resolvePlaneDataRoot({rootDir: '/tmp/seat-x'})).toBe(path.join('/tmp/seat-x', '.neo-ai-data'))
        } finally {
            previous === undefined ? delete process.env.NEO_PLANE_DATA_ROOT : process.env.NEO_PLANE_DATA_ROOT = previous
        }
    });

    test('resolvePlaneDataRoot fails loud without a root — ambient cwd is never trusted', () => {
        expect(() => resolvePlaneDataRoot({})).toThrow('rootDir is required')
    });

    test('the leaf declares the env names, and this module no longer restates them', () => {
        const {plane} = ConfigBase.config.data;

        // Hard-coded: these two strings are the deployment contract every operator env file binds.
        expect(plane.id.env).toBe('NEO_PLANE_ID');
        expect(plane.dataRoot.env).toBe('NEO_PLANE_DATA_ROOT');

        // The one shared literal, consumed by BOTH the leaf default and the coherence assertion.
        expect(plane.id.default).toBe(CANONICAL_PLANE_ID);

        // The anchor derives from neoRootDir, not from anything ambient.
        expect(plane.dataRoot.default).toBe(
            path.resolve(ConfigBase.config.data.neoRootDir.default, '.neo-ai-data')
        )
    });
});

test.describe('resolved-value opacity — the invariant on the values that vary', () => {
    const pathShapedRows = ['/abs/path/checkout', '../worktrees/seat-a', 'C:\\checkout', '.neo-ai-data'];

    test('parsePlaneIdEnv: absent/empty defer to the default; valid passes; path-shaped throws', () => {
        expect(parsePlaneIdEnv('NEO_PLANE_ID', {env: {}})).toBeUndefined();
        expect(parsePlaneIdEnv('NEO_PLANE_ID', {env: {NEO_PLANE_ID: ''}})).toBeUndefined();
        expect(parsePlaneIdEnv('NEO_PLANE_ID', {env: {NEO_PLANE_ID: 'overlay-plane-a'}})).toBe('overlay-plane-a');

        for (const bad of pathShapedRows) {
            expect(() => parsePlaneIdEnv('NEO_PLANE_ID', {env: {NEO_PLANE_ID: bad}}), bad).toThrow('opaque')
        }
    });

    test('isOpaquePlaneId: one predicate behind the load guard and the leaf env layer', () => {
        expect(isOpaquePlaneId(CANONICAL_PLANE_ID)).toBe(true);
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

test.describe('derivePlaneMemberPaths — the completeness half (#15932)', () => {
    // ticket-ref-ok: the pinned census (`expect(TIER1_MEMBER_PATHS.length).toBe(10)`) guarded the
    // list against DELETIONS and against nothing else — a plane-anchored leaf added without a list
    // edit passed green forever, which is the omission direction that actually happens.
    // ticket-ref-ok: #15932 is the mechanism under test; #15872's graph-SQLite omission is its
    // first confirmed instance — named because the red control's target shape is the point.
    // the config tree it claims to describe: declaration and membership are ONE act.
    const anchor = ConfigBase.config.data.plane.dataRoot.default,
          leaf   = (defaultValue, extra = {}) => ({default: defaultValue, env: null, type: 'string', parse: null, ...extra});

    test('the derived set EQUALS each declared PLANE_MEMBER_PATHS — all four declaring configs', async () => {
        expect(new Set(derivePlaneMemberPaths({descriptorData: ConfigBase.config.data, anchor})))
            .toEqual(new Set(PLANE_MEMBER_PATHS));

        expect(new Set(derivePlaneMemberPaths({descriptorData: McConfigBase.config.data, anchor})))
            .toEqual(new Set(McConfigBase.PLANE_MEMBER_PATHS ?? (await import('../../../../ai/mcp/server/memory-core/configBase.mjs')).PLANE_MEMBER_PATHS));

        // The KB config base re-wraps the registered Tier-1 singleton at module scope — the
        // template must be fully evaluated FIRST (the same registration shape as the derivation
        // witnesses above: awaited dynamic import, re-bind from the cached export if this worker's
        // afterAll restore already unregistered it).
        const templateModule = await import('../../../../ai/config.template.mjs');

        if (!Neo.ai?.Config) {
            Neo.ai        = Neo.ai || {};
            Neo.ai.Config = templateModule.default;
        }

        const KbConfigBase                          = (await import('../../../../ai/mcp/server/knowledge-base/configBase.mjs')).default,
              {PLANE_MEMBER_PATHS: KB_MEMBER_PATHS} = await import('../../../../ai/mcp/server/knowledge-base/configBase.mjs');

        expect(new Set(derivePlaneMemberPaths({descriptorData: KbConfigBase.config.data, anchor})))
            .toEqual(new Set(KB_MEMBER_PATHS));

        expect(new Set(derivePlaneMemberPaths({descriptorData: NlConfigBase.config.data, anchor})))
            .toEqual(new Set(NL_MEMBER_PATHS));
    });

    test('green fixture: member included, reasoned exclusion honored, non-anchored undecided ignored', () => {
        const tree = {
            member     : leaf(path.resolve(anchor, 'backups'), {planeMember: true}),
            notAMember : leaf('/app/.neo-ai-data', {planeMember: false, planeMemberReason: 'cloud-profile-pinned — the election owns profile-pinned members'}),
            anchorLeaf : leaf(anchor, {planeMember: false, planeMemberReason: 'the anchor itself — not its own member'}),
            unrelated  : leaf('/etc/hostname'),
            aboveAnchor: leaf(path.dirname(anchor)),
            nested     : {inner: leaf(path.resolve(anchor, 'memory-wal'), {planeMember: true})}
        };

        expect(derivePlaneMemberPaths({descriptorData: tree, anchor})).toEqual(['member', 'nested.inner']);
    });

    test('RED control: an anchored leaf with NO planeMember decision fails closed — the #15872 class', () => {
        const tree = {forgotten: leaf(path.resolve(anchor, 'graph.sqlite'))};

        expect(() => derivePlaneMemberPaths({descriptorData: tree, anchor}))
            .toThrow(/forgotten.*NO planeMember decision|NO planeMember decision/);
    });

    test('RED control: planeMember: false without a reason fails closed — exclusion must not read as omission', () => {
        const tree = {silent: leaf('/app/.neo-ai-data', {planeMember: false})};

        expect(() => derivePlaneMemberPaths({descriptorData: tree, anchor}))
            .toThrow(/planeMemberReason/);
    });

    test('explicitly placed is unaffected: membership reads metadata + defaults, never resolved values', () => {
        // A member relocated by its own env binding (resolved ≠ default) stays a member — its
        // placement is the boot clause's question (assertPlaneMemberCoherence), not this one's.
        const tree = {placed: leaf(path.resolve(anchor, 'chroma/unified'), {planeMember: true, env: 'NEO_CHROMA_DATA_DIR'})};

        expect(derivePlaneMemberPaths({descriptorData: tree, anchor})).toEqual(['placed']);
    });

    test('guardrails on the inputs themselves fail loud', () => {
        expect(() => derivePlaneMemberPaths({descriptorData: null, anchor})).toThrow(/descriptorData must be/);
        expect(() => derivePlaneMemberPaths({descriptorData: {}, anchor: 'relative/path'})).toThrow(/must be an absolute path/);
    });
});

test.describe('assertPlaneCoherence — the F-invariant, both branches', () => {
    const canonical = '/durable/checkout/.neo-ai-data';

    test('standard boot: canonical identity passes and returns the frozen observed identity', () => {
        const observed = assertPlaneCoherence({planeId: CANONICAL_PLANE_ID, dataRoot: canonical, canonicalDataRoot: canonical});

        expect(observed).toEqual({planeId: CANONICAL_PLANE_ID, dataRoot: canonical});
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
            planeId          : CANONICAL_PLANE_ID,
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

test.describe('member coherence — a partially-moved plane fails closed', () => {
    const anchorRoot = '/anchor/.neo-ai-data';

    test('collectPlaneMembers walks resolved + descriptor trees; unresolvable claims throw', () => {
        const entries = collectPlaneMembers({
            memberPaths   : ['backupPath'],
            resolvedConfig: {backupPath: path.join(anchorRoot, 'backups')},
            descriptorData: {backupPath: {default: path.join(anchorRoot, 'backups')}}
        });

        expect(entries).toEqual([{path: 'backupPath', resolved: path.join(anchorRoot, 'backups'), default: path.join(anchorRoot, 'backups')}]);
        expect(() => collectPlaneMembers({memberPaths: ['missing.leaf'], resolvedConfig: {}, descriptorData: {}}))
            .toThrow('not resolvable')
    });

    test('a relocated root with members on their anchor defaults THROWS, naming the strays', () => {
        const members = [
            {path: 'backupPath', resolved: path.join(anchorRoot, 'backups'), default: path.join(anchorRoot, 'backups')},
            {path: 'logPath',    resolved: '/relocated/plane/logs',          default: path.join(anchorRoot, 'logs')}
        ];

        expect(() => assertPlaneMemberCoherence({dataRoot: '/relocated/plane', members, realpathFn: p => p}))
            .toThrow(/fails closed[\s\S]*backupPath|backupPath[\s\S]*fails closed/)
    });

    test('explicitly placed members and under-root members both pass', () => {
        const members = [
            // Explicitly placed: resolved differs from the declared default.
            {path: 'memoryWal.dirProd', resolved: '/vol/wal', default: path.join(anchorRoot, 'memory-wal')},
            // Under the resolved root.
            {path: 'logPath', resolved: '/relocated/plane/logs', default: '/relocated/plane/logs'}
        ];

        expect(() => assertPlaneMemberCoherence({dataRoot: '/relocated/plane', members, realpathFn: p => p})).not.toThrow()
    });

    test('INTEGRATION: a Provider with ONLY NEO_PLANE_DATA_ROOT changed fails member coherence', () => {
        process.env.NEO_PLANE_DATA_ROOT = path.join(os.tmpdir(), 'neo-relocated-plane-spec');

        try {
            const isolated = createConfigProxy(Neo.create(ConfigProvider, {
                data    : ConfigBase.config.data,
                formulas: ConfigBase.config.formulas
            }));

            try {
                const members = collectPlaneMembers({
                    memberPaths   : PLANE_MEMBER_PATHS,
                    resolvedConfig: isolated,
                    descriptorData: ConfigBase.config.data
                });

                // The relocation branch Emmy's falsifier disproved: root moved, every
                // non-overridden claimed member still on the build-time anchor → fail closed.
                expect(() => assertPlaneMemberCoherence({dataRoot: isolated.plane.dataRoot, members}))
                    .toThrow('fails closed')
            } finally {
                isolated.destroy()
            }
        } finally {
            delete process.env.NEO_PLANE_DATA_ROOT
        }
    });

    test('INTEGRATION: without the relocation env, the full claimed member set passes', () => {
        const isolated = createConfigProxy(Neo.create(ConfigProvider, {
            data    : ConfigBase.config.data,
            formulas: ConfigBase.config.formulas
        }));

        try {
            const members = collectPlaneMembers({
                memberPaths   : PLANE_MEMBER_PATHS,
                resolvedConfig: isolated,
                descriptorData: ConfigBase.config.data
            });

            expect(members.length).toBe(PLANE_MEMBER_PATHS.length);
            expect(() => assertPlaneMemberCoherence({dataRoot: isolated.plane.dataRoot, members})).not.toThrow()
        } finally {
            isolated.destroy()
        }
    });
});

test.describe('healthcheck contract — the observed plane is a DECLARED schema property', () => {
    for (const server of ['knowledge-base', 'memory-core']) {
        test(`${server} HealthCheckResponse declares plane {id, dataRoot}`, () => {
            const spec  = yamlLoad(fs.readFileSync(path.resolve(specDir, `../../../../ai/mcp/server/${server}/openapi.yaml`), 'utf8'));
            const plane = spec.components.schemas.HealthCheckResponse.properties.plane;

            expect(plane.type).toBe('object');
            expect(plane.properties.id.type).toBe('string');
            expect(plane.properties.dataRoot.type).toBe('string');
            expect(plane.required).toEqual(['id', 'dataRoot'])
        });
    }
});
