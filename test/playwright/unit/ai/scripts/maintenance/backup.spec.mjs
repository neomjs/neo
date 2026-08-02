import {setup} from '../../../../setup.mjs';

const appName = 'BackupOrchestratorTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: false,
        unitTestMode           : true,
        useDomApiRenderer      : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../src/manager/Instance.mjs';
import fs              from 'fs';
import path            from 'path';
// The COMMITTED templates, never `config.mjs` — that path resolves a repo-local ignored overlay, so
// a test reading it asserts against whatever this machine happens to carry, and the same spec can
// pass here while failing on a peer's box for reasons the diff cannot show. `lint-config-template-ssot`
// refuses it. Read at each use site below rather than snapshotted: the proxies are reactive, and a
// captured leaf is a second, stale config authority.
import KB_Config from '../../../../../../ai/mcp/server/knowledge-base/config.template.mjs';
import MC_Config from '../../../../../../ai/mcp/server/memory-core/config.template.mjs';

// Serial mode: this file mutates KB + MC singleton collection accessors across
// beforeAll/afterAll. Serial ordering within this file prevents local multi-worker
// races. CI runs workers:1 (see playwright.config.unit.mjs) so this is local-DX only.
test.describe.configure({mode: 'serial'});

test.describe('backup.mjs orchestrator — atomic bundle assembly (#10129 Phase 2)', () => {
    let SDK, runBackup;
    let KB_ChromaManager, Memory_StorageRouter;
    let originalKbCollection, originalMcGetMemory, originalMcGetSummary;
    let originalKbListNames, originalMcGetActiveManagers;
    let workRoot, bundleRoot, conceptsSourceDir, trajectoriesSourceFile;

    // Which logical collections the pre-existence probe should report as ABSENT. Stubbing the
    // collection GETTER is not enough: the exporter asks whether a collection existed BEFORE it
    // resolved anything, and a fixture that only conjures a handle answers "no" — truthfully — which
    // classifies every zero-row export as `unavailable`. Populated fixtures are unaffected either way
    // (rows prove pre-existence), so this exists for the zero-row cases, where `empty` and
    // `unavailable` are the whole distinction.
    //
    // Keyed by LOGICAL name, not by collection name, so the stubs can resolve the reactive config
    // proxy at call time instead of snapshotting it into a mutable array.
    let hiddenCollections;

    const fakeCollection = (rows, name) => ({
        name,
        count: async () => rows.length,
        get  : async ({include = [], limit, offset = 0} = {}) => {
            if (include.length === 0) return {ids: rows.map(r => r.id)};
            const sliced = rows.slice(offset, offset + (limit ?? rows.length));
            return {
                ids       : sliced.map(r => r.id),
                documents : sliced.map(r => r.document),
                metadatas : sliced.map(r => r.metadata),
                embeddings: sliced.map(r => r.embedding)
            };
        }
    });

    let verifyBundleIntegrity;
    let countNonEmptyJsonlLines;
    let noticeLegacyBackupRoot;

    test.beforeAll(async () => {
        SDK                   = await import('../../../../../../ai/services.mjs');
        ({runBackup, verifyBundleIntegrity, countNonEmptyJsonlLines, noticeLegacyBackupRoot} = await import('../../../../../../ai/scripts/maintenance/backup.mjs'));
        KB_ChromaManager      = SDK.KB_ChromaManager;
        Memory_StorageRouter  = SDK.Memory_StorageRouter;

        workRoot = path.resolve(process.cwd(), 'tmp', `backup-orch-${process.pid}-${Date.now()}`);
        fs.mkdirSync(workRoot, {recursive: true});

        bundleRoot             = path.join(workRoot, 'bundle');
        conceptsSourceDir      = path.join(workRoot, 'concepts-source');
        trajectoriesSourceFile = path.join(workRoot, 'trajectories-source', 'trajectories.jsonl');

        fs.mkdirSync(conceptsSourceDir, {recursive: true});
        fs.mkdirSync(path.dirname(trajectoriesSourceFile), {recursive: true});

        fs.writeFileSync(path.join(conceptsSourceDir, 'nodes.jsonl'), '{"id":"n1"}\n');
        fs.writeFileSync(path.join(conceptsSourceDir, 'edges.jsonl'), '{"source":"n1","target":"n2"}\n');
        fs.writeFileSync(trajectoriesSourceFile, '{"turn":1}\n{"turn":2}\n');

        originalKbCollection = KB_ChromaManager.getKnowledgeBaseCollection.bind(KB_ChromaManager);
        originalMcGetMemory  = Memory_StorageRouter.getMemoryCollection.bind(Memory_StorageRouter);
        originalMcGetSummary = Memory_StorageRouter.getSummaryCollection.bind(Memory_StorageRouter);

        KB_ChromaManager.getKnowledgeBaseCollection = async () => fakeCollection(
            [{id: 'kb-1', embedding: [0.1], metadata: {k: 'class'},  document: 'kb-doc'}],
            'fake-kb'
        );
        Memory_StorageRouter.getMemoryCollection = async () => fakeCollection(
            [{id: 'm-1', embedding: [0.3], metadata: {t: 'prompt'}, document: 'mem-doc'}],
            'fake-mem'
        );
        Memory_StorageRouter.getSummaryCollection = async () => fakeCollection(
            [{id: 's-1', embedding: [0.4], metadata: {cat: 'feat'}, document: 'sum-doc'}],
            'fake-sum'
        );

        // Default posture: every canonical collection pre-existed, which is what every populated test
        // here means. The probe compares against the CONFIG names, not the fake handle's `.name`.
        hiddenCollections = new Set();

        originalKbListNames         = KB_ChromaManager.listCollectionNames.bind(KB_ChromaManager);
        originalMcGetActiveManagers = Memory_StorageRouter.getActiveManagers.bind(Memory_StorageRouter);

        KB_ChromaManager.listCollectionNames = async () =>
            hiddenCollections.has('kb') ? [] : [KB_Config.collectionName];

        Memory_StorageRouter.getActiveManagers = async () => [{
            listCollectionNames: async () => [
                ['memory',          MC_Config.collections.memory],
                ['summary',         MC_Config.collections.session],
                ['temporalSummary', MC_Config.collections.temporalSummary],
                ['graph',           MC_Config.collections.graph]
            ].filter(([key]) => !hiddenCollections.has(key)).map(([, name]) => name)
        }];
    });

    test.afterAll(() => {
        KB_ChromaManager.getKnowledgeBaseCollection = originalKbCollection;
        KB_ChromaManager.listCollectionNames        = originalKbListNames;
        Memory_StorageRouter.getMemoryCollection    = originalMcGetMemory;
        Memory_StorageRouter.getSummaryCollection   = originalMcGetSummary;
        Memory_StorageRouter.getActiveManagers      = originalMcGetActiveManagers;

        if (workRoot && fs.existsSync(workRoot)) {
            fs.rmSync(workRoot, {recursive: true, force: true});
        }
    });

    test('produces a bundle with all 5 subfolders and routes populated subsystems into their JSONL slots', async () => {
        const silentLogger = {log: () => {}, error: () => {}};

        const result = await runBackup({
            bundleRoot,
            conceptsSourceDir,
            trajectoriesSourceFile,
            logger: silentLogger
        });

        expect(result.bundleRoot).toBe(bundleRoot);

        for (const sub of ['kb', 'mc', 'graph', 'concepts', 'trajectories']) {
            expect(fs.existsSync(path.join(bundleRoot, sub))).toBe(true);
        }

        const kbFiles = fs.readdirSync(path.join(bundleRoot, 'kb')).filter(f => f.endsWith('.jsonl'));
        expect(kbFiles.length).toBe(1);
        expect(kbFiles[0].startsWith('knowledge-base-backup-')).toBe(true);

        const mcFiles = fs.readdirSync(path.join(bundleRoot, 'mc')).filter(f => f.endsWith('.jsonl')).sort();
        expect(mcFiles.length).toBe(2);
        expect(mcFiles.some(f => f.startsWith('memory-backup-'))).toBe(true);
        expect(mcFiles.some(f => f.startsWith('summaries-backup-'))).toBe(true);

        const conceptFiles = fs.readdirSync(path.join(bundleRoot, 'concepts')).sort();
        expect(conceptFiles).toEqual(['edges.jsonl', 'nodes.jsonl']);

        const trajFiles = fs.readdirSync(path.join(bundleRoot, 'trajectories'));
        expect(trajFiles).toEqual(['trajectories.jsonl']);

        expect(result.subsystems.concepts).toEqual({copied: 2});
        expect(result.subsystems.trajectories).toEqual({copied: 1});
        expect(result.subsystems.mc.count).toBe(2);

        const mcIntegrity = result.meta.integrity.find(check => check.subsystem === 'mc');
        expect(mcIntegrity.status).toBe('pass');
        expect(mcIntegrity.sourceCount).toBe(2);
        expect(mcIntegrity.bundleCount).toBe(2);

        // graph subfolder exists but GraphService.db is not wired in unit-test mode,
        // so no graph-backup file is emitted. This is the documented "source has no data"
        // branch per ticket AC ("non-empty content when the source subsystems have data").
    });

    test('reports missing concept/trajectory sources as non-fatal notes', async () => {
        const silentLogger  = {log: () => {}, error: () => {}};
        const altBundleRoot = path.join(workRoot, 'bundle-no-optional-sources');

        const result = await runBackup({
            bundleRoot            : altBundleRoot,
            conceptsSourceDir     : path.join(workRoot, 'does-not-exist-concepts'),
            trajectoriesSourceFile: path.join(workRoot, 'does-not-exist-trajectories.jsonl'),
            logger                : silentLogger
        });

        expect(result.subsystems.concepts.copied).toBe(0);
        expect(result.subsystems.concepts.note).toMatch(/source not present/);
        expect(result.subsystems.trajectories.copied).toBe(0);
        expect(result.subsystems.trajectories.note).toMatch(/source not present/);

        // KB + MC still run — bundle is valid even without optional sources.
        expect(fs.existsSync(path.join(altBundleRoot, 'kb'))).toBe(true);
        expect(fs.existsSync(path.join(altBundleRoot, 'mc'))).toBe(true);
    });

    test('mailbox: copies sent-to-cull.jsonl when source exists (#10871)', async () => {
        const silentLogger     = {log: () => {}, error: () => {}};
        const altBundleRoot    = path.join(workRoot, 'bundle-mailbox-present');
        const sentToCullSource = path.join(workRoot, 'mailbox-source', 'sent-to-cull.jsonl');

        fs.mkdirSync(path.dirname(sentToCullSource), {recursive: true});
        fs.writeFileSync(sentToCullSource, '{"culled":"msg-1"}\n{"culled":"msg-2"}\n');

        const result = await runBackup({
            bundleRoot          : altBundleRoot,
            conceptsSourceDir,
            trajectoriesSourceFile,
            sentToCullSourceFile: sentToCullSource,
            logger              : silentLogger
        });

        expect(fs.existsSync(path.join(altBundleRoot, 'mailbox'))).toBe(true);
        expect(fs.readdirSync(path.join(altBundleRoot, 'mailbox'))).toEqual(['sent-to-cull.jsonl']);
        expect(result.subsystems.mailbox.copied).toBe(1);
    });

    test('writes bundle-meta.json with bundleVersion/timestamp/completedAt/topology/integrity/version (#10871)', async () => {
        const silentLogger  = {log: () => {}, error: () => {}};
        const altBundleRoot = path.join(workRoot, 'bundle-meta-schema');

        await runBackup({
            bundleRoot          : altBundleRoot,
            conceptsSourceDir,
            trajectoriesSourceFile,
            sentToCullSourceFile: path.join(workRoot, 'does-not-exist-cull.jsonl'),
            logger              : silentLogger
        });

        const metaPath = path.join(altBundleRoot, 'bundle-meta.json');
        expect(fs.existsSync(metaPath)).toBe(true);

        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

        expect(meta.bundleVersion).toBe(1);
        expect(meta.timestamp).toBeTruthy();
        expect(meta.completedAt).toBeTruthy();
        expect(meta.subsystems).toBeDefined();
        expect(meta.integrity).toBeInstanceOf(Array);

        expect(meta.topology).toBeDefined();
        expect(typeof meta.topology.shared_topology).toBe('boolean');
        expect(meta.topology.kbChromaCoords).toBeDefined();
        expect(meta.topology.mcChromaCoords).toBeDefined();
        expect('host' in meta.topology.kbChromaCoords).toBe(true);
        expect('port' in meta.topology.kbChromaCoords).toBe(true);
        expect('path' in meta.topology.kbChromaCoords).toBe(true);
        expect('host' in meta.topology.mcChromaCoords).toBe(true);
        expect('port' in meta.topology.mcChromaCoords).toBe(true);
        expect('dataDir' in meta.topology.mcChromaCoords).toBe(true);

        expect('neoVersion' in meta).toBe(true);
        expect('gitSha' in meta).toBe(true);
    });

    test('verifyBundleIntegrity: pass when bundle row count matches source count (#10871)', async () => {
        const tempRoot = path.join(workRoot, 'integrity-pass');
        const kbDir    = path.join(tempRoot, 'kb');

        fs.mkdirSync(kbDir, {recursive: true});
        fs.writeFileSync(path.join(kbDir, 'kb-data.jsonl'), '{"id":"1"}\n{"id":"2"}\n{"id":"3"}\n');

        const checks = await verifyBundleIntegrity(
            {kb: kbDir, mc: path.join(tempRoot, 'mc-missing'), graph: path.join(tempRoot, 'graph-missing')},
            {kb: 3}
        );

        const kb = checks.find(c => c.subsystem === 'kb');
        expect(kb.status).toBe('pass');
        expect(kb.sourceCount).toBe(3);
        expect(kb.bundleCount).toBe(3);
    });

    test('verifyBundleIntegrity: fail when bundle row count diverges from source count (#10871)', async () => {
        const tempRoot = path.join(workRoot, 'integrity-fail');
        const kbDir    = path.join(tempRoot, 'kb');

        fs.mkdirSync(kbDir, {recursive: true});
        fs.writeFileSync(path.join(kbDir, 'kb-data.jsonl'), '{"id":"1"}\n');

        const checks = await verifyBundleIntegrity(
            {kb: kbDir, mc: path.join(tempRoot, 'mc-missing'), graph: path.join(tempRoot, 'graph-missing')},
            {kb: 5}
        );

        const kb = checks.find(c => c.subsystem === 'kb');
        expect(kb.status).toBe('fail');
        expect(kb.sourceCount).toBe(5);
        expect(kb.bundleCount).toBe(1);
        expect(kb.reason).toMatch(/row-count mismatch/);
    });

    test('verifyBundleIntegrity: skipped when source count is non-numeric (#10871)', async () => {
        const tempRoot = path.join(workRoot, 'integrity-skipped');
        const mcDir    = path.join(tempRoot, 'mc');

        fs.mkdirSync(mcDir, {recursive: true});

        const checks = await verifyBundleIntegrity(
            {kb: path.join(tempRoot, 'kb-missing'), mc: mcDir, graph: path.join(tempRoot, 'graph-missing')},
            {mc: {memories: 1, summaries: 1}}
        );

        const mc = checks.find(c => c.subsystem === 'mc');
        expect(mc.status).toBe('skipped');
        expect(mc.reason).toMatch(/no numeric source count/);
    });

    test('verifyBundleIntegrity: empty (not a silent pass) when source and bundle are both zero (#14030)', async () => {
        const tempRoot = path.join(workRoot, 'integrity-empty');
        const kbDir    = path.join(tempRoot, 'kb');

        fs.mkdirSync(kbDir, {recursive: true});
        // The gutted-store signature: a populated deployment whose export came back empty. Both
        // sides agree at zero, so the old `bundleCount === sourceCount` branch reported 'pass' —
        // a false recovery source. It must surface as 'empty', never 'pass'.
        fs.writeFileSync(path.join(kbDir, 'kb-data.jsonl'), '');

        const checks = await verifyBundleIntegrity(
            {kb: kbDir, mc: path.join(tempRoot, 'mc-missing'), graph: path.join(tempRoot, 'graph-missing')},
            {kb: 0}
        );

        const kb = checks.find(c => c.subsystem === 'kb');
        expect(kb.status).toBe('empty');
        expect(kb.status).not.toBe('pass');
        expect(kb.sourceCount).toBe(0);
        expect(kb.bundleCount).toBe(0);
        expect(kb.reason).toMatch(/not a usable recovery source/);
    });

    test('runBackup propagates an empty subsystem to bundle-meta.integrity "empty" + a non-fatal warning (#14048)', async () => {
        // Close-target proof: the helper status alone is not enough — runBackup must keep an empty
        // subsystem non-fatal, WARN, and persist `empty` into bundle-meta.integrity (the canary/alert
        // handoff). Force MC (memories + summaries) to export zero rows.
        const warnings      = [];
        const captureLogger = {log: () => {}, error: () => {}, warn: msg => warnings.push(msg)};
        const savedMem      = Memory_StorageRouter.getMemoryCollection;
        const savedSum      = Memory_StorageRouter.getSummaryCollection;

        try {
            Memory_StorageRouter.getMemoryCollection  = async () => fakeCollection([], 'empty-mem');
            Memory_StorageRouter.getSummaryCollection = async () => fakeCollection([], 'empty-sum');

            const result = await runBackup({
                bundleRoot: path.join(workRoot, 'bundle-empty-subsystem'),
                conceptsSourceDir,
                trajectoriesSourceFile,
                logger    : captureLogger
            });

            const mcIntegrity = result.meta.integrity.find(check => check.subsystem === 'mc');
            expect(mcIntegrity.status).toBe('empty');           // persisted into bundle-meta.integrity
            expect(mcIntegrity.sourceCount).toBe(0);
            expect(mcIntegrity.bundleCount).toBe(0);
            expect(warnings.some(w => /ZERO rows|empty backup/i.test(w))).toBe(true);  // runBackup warned, non-fatally

            // The control that makes the assertion above mean something: this bundle reports `empty`
            // BECAUSE the probe positively established both collections pre-existed. Without it, `empty`
            // could be the default for any zero-row export and the next test would prove nothing.
            expect(result.meta.subsystems.mc.memories.sourceExisted) .toBe(true);
            expect(result.meta.subsystems.mc.summaries.sourceExisted).toBe(true);
            expect(result.meta.subsystems.mc.captureOutcome).toBe('empty');
        } finally {
            Memory_StorageRouter.getMemoryCollection  = savedMem;
            Memory_StorageRouter.getSummaryCollection = savedSum;
        }
    });

    test('a collection that did NOT pre-exist reports `unavailable`, never `empty` (#16348)', async () => {
        // The live specimen: a re-embed cutover left the canonical collection transiently absent, the
        // resolver re-created it empty, `count()` returned 0 honestly, and the receipt said
        // "Export complete." — byte-identical to a deployment that legitimately holds nothing. 4 of 36
        // bundles in one store carry that signature across four separate dates.
        const warnings      = [];
        const captureLogger = {log: () => {}, error: () => {}, warn: msg => warnings.push(msg)};
        const savedMem      = Memory_StorageRouter.getMemoryCollection;
        const savedSum      = Memory_StorageRouter.getSummaryCollection;

        try {
            // Zero rows AND no pre-existing collection — the resolver's create-on-missing is what the
            // production path does here, and the fixture reproduces its observable result rather than
            // hand-setting a flag: nothing below tells the exporter what verdict to reach.
            Memory_StorageRouter.getMemoryCollection  = async () => fakeCollection([], 'conjured-mem');
            Memory_StorageRouter.getSummaryCollection = async () => fakeCollection([], 'conjured-sum');
            hiddenCollections.add('memory').add('summary');

            const result = await runBackup({
                bundleRoot: path.join(workRoot, 'bundle-unavailable'),
                conceptsSourceDir,
                trajectoriesSourceFile,
                logger    : captureLogger
            });

            const mcIntegrity = result.meta.integrity.find(check => check.subsystem === 'mc');

            expect(mcIntegrity.status).toBe('unavailable');
            expect(mcIntegrity.status).not.toBe('empty');
            expect(mcIntegrity.reason).toMatch(/did not pre-exist/);
            expect(result.meta.subsystems.mc.memories.sourceExisted).toBe(false);
            expect(result.meta.subsystems.mc.memories.captureOutcome).toBe('unavailable');
            expect(warnings.some(w => /did NOT pre-exist/i.test(w))).toBe(true);

            // Non-fatal by design. `fail` throws before bundle-meta.json is written, so routing this
            // through it would leave a bundle-shaped directory with no receipt — manufacturing the very
            // aborted-run specimen this work exists to eliminate. The receipt must survive to say so.
            expect(fs.existsSync(path.join(workRoot, 'bundle-unavailable', 'bundle-meta.json'))).toBe(true);

            // The other side of the ticket's falsifier, in the same bundle: KB is populated and its
            // collection pre-existed, so it must still read `captured` / `pass`. Without this, a probe
            // that simply reported `unavailable` for everything would satisfy the assertions above.
            expect(result.meta.subsystems.kb.captureOutcome).toBe('captured');
            expect(result.meta.integrity.find(check => check.subsystem === 'kb').status).toBe('pass');
        } finally {
            Memory_StorageRouter.getMemoryCollection  = savedMem;
            Memory_StorageRouter.getSummaryCollection = savedSum;
            hiddenCollections.clear();
        }
    });

    test('a subsystem with rows AND an absent collection is `unavailable` despite positive parity (#16348)', async () => {
        // The May-2026 recovery specimen: a bundle with memories and NO summaries file at all. The
        // subsystem's row count is positive, parity holds, and half of what it claims to hold is
        // missing — so the verdict cannot be gated on `sourceCount === 0`.
        const silentLogger = {log: () => {}, error: () => {}, warn: () => {}};
        const savedSum     = Memory_StorageRouter.getSummaryCollection;

        try {
            Memory_StorageRouter.getSummaryCollection = async () => fakeCollection([], 'conjured-sum');
            // Memories still pre-exist; only the summaries collection is gone.
            hiddenCollections.add('summary');

            const result = await runBackup({
                bundleRoot: path.join(workRoot, 'bundle-partial'),
                conceptsSourceDir,
                trajectoriesSourceFile,
                logger    : silentLogger
            });

            const mcIntegrity = result.meta.integrity.find(check => check.subsystem === 'mc');

            expect(mcIntegrity.sourceCount).toBeGreaterThan(0);        // positive parity...
            expect(mcIntegrity.bundleCount).toBe(mcIntegrity.sourceCount);
            expect(mcIntegrity.status).toBe('unavailable');            // ...and still not trustworthy
            expect(mcIntegrity.status).not.toBe('pass');

            // Per-collection granularity is the point: a consumer must be able to tell WHICH half.
            expect(result.meta.subsystems.mc.memories.captureOutcome) .toBe('captured');
            expect(result.meta.subsystems.mc.summaries.captureOutcome).toBe('unavailable');
        } finally {
            Memory_StorageRouter.getSummaryCollection = savedSum;
            hiddenCollections.clear();
        }
    });

    test('verifyBundleIntegrity is unchanged for a receipt carrying no capture verdict (#16348)', async () => {
        // Backward compatibility, asserted rather than assumed: every bundle already on disk predates
        // the verdict, and a reader that treated a missing `captureOutcome` as "unavailable" would
        // retroactively condemn the entire archive. Absent verdict means the old two-way answer.
        const tempRoot = path.join(workRoot, 'legacy-receipt');
        const layout   = {kb: path.join(tempRoot, 'kb'), mc: path.join(tempRoot, 'mc'), graph: path.join(tempRoot, 'graph')};

        Object.values(layout).forEach(dir => fs.mkdirSync(dir, {recursive: true}));
        fs.writeFileSync(path.join(layout.kb, 'kb.jsonl'), '{"id":"a"}\n{"id":"b"}\n');

        const checks = await verifyBundleIntegrity(layout, {kb: {count: 2}, mc: {count: 0}, graph: {count: 0}});

        expect(checks.find(c => c.subsystem === 'kb').status).toBe('pass');
        expect(checks.find(c => c.subsystem === 'mc').status).toBe('empty');
        expect(checks.find(c => c.subsystem === 'graph').status).toBe('empty');
        expect(checks.some(c => c.status === 'unavailable')).toBe(false);
    });

    test('countNonEmptyJsonlLines: streams a JSONL file, counting non-empty lines (#14082)', async () => {
        // Regression: verifyBundleIntegrity used to read each bundle file fully into a string
        // (fs.readFile + split('\n')), which threw ERR_STRING_TOO_LONG on the 1+ GB Memory Core /
        // Knowledge Base exports (past V8's ~512 MB max string length). The streaming counter has no
        // such ceiling. This locks the exact non-empty-line semantics the parity check depends on:
        // blank lines and a missing trailing newline must not change the row count. The >512 MB
        // no-throw property is proven manually against the real ~1.2 GB MC export (PR evidence) —
        // materializing a 512 MB+ file in CI is prohibitively heavy.
        const tempRoot = path.join(workRoot, 'count-nonempty');
        const file     = path.join(tempRoot, 'rows.jsonl');

        fs.mkdirSync(tempRoot, {recursive: true});
        // 3 records — with a blank line, a whitespace-only line, and NO trailing newline on the last.
        fs.writeFileSync(file, '{"id":"1"}\n\n{"id":"2"}\n   \n{"id":"3"}');

        expect(await countNonEmptyJsonlLines(file)).toBe(3);
    });

    test('the bundle captures all three incident ledgers, reporting WHICH one was empty', async () => {
        // The other half of ledger survival. Before this, `orchestrator-state` was excluded from the
        // bundle — a fact the runbook already admitted as a standing caveat — so a volume replacement
        // destroyed the self-heal and recovery record with no copy anywhere.
        const silentLogger  = {error: () => {}, log: () => {}, warn: () => {}},
              ledgerRoot    = path.join(workRoot, 'ledger-src', 'orchestrator-daemon'),
              altBundleRoot = path.join(workRoot, 'bundle-with-ledgers'),
              ledgerSources = {
                  healAttemptsFile: path.join(ledgerRoot, 'heal-attempts.json'),
                  healEventsDir   : path.join(ledgerRoot, 'data-heal-events'),
                  recoveryRunsDir : path.join(ledgerRoot, 'recovery-runs')
              };

        fs.mkdirSync(ledgerSources.healEventsDir, {recursive: true});
        fs.mkdirSync(ledgerSources.recoveryRunsDir, {recursive: true});
        fs.writeFileSync(ledgerSources.healAttemptsFile, JSON.stringify({'kb:chunks': {attempts: 2}}));
        fs.writeFileSync(path.join(ledgerSources.healEventsDir, 'heal-events.jsonl'), '{"type":"freeze"}\n');
        // recovery-runs deliberately left EMPTY, so the per-ledger breakdown has something to
        // discriminate: a single aggregate count could not say which ledger had nothing in it.

        const result = await runBackup({
            bundleRoot: altBundleRoot,
            conceptsSourceDir,
            ledgerSources,
            logger    : silentLogger,
            trajectoriesSourceFile
        });

        const ledgersDir = path.join(altBundleRoot, 'ledgers');

        expect(fs.existsSync(path.join(ledgersDir, 'heal-attempts.json'))).toBe(true);
        expect(fs.existsSync(path.join(ledgersDir, 'heal-events.jsonl'))).toBe(true);
        expect(JSON.parse(fs.readFileSync(path.join(ledgersDir, 'heal-attempts.json'), 'utf8'))['kb:chunks'].attempts).toBe(2);

        // `recovery-runs` keeps its own subfolder — flattening per-run files beside the two singletons
        // would let a run id collide with a ledger filename.
        expect(fs.existsSync(path.join(ledgersDir, 'recovery-runs'))).toBe(true);

        // The per-ledger breakdown is the point: an aggregate of 2 would not tell an operator that the
        // recovery-run ledger specifically had nothing to bundle.
        expect(result.subsystems.ledgers.healAttempts.copied).toBe(1);
        expect(result.subsystems.ledgers.healEvents.copied).toBe(1);
        expect(result.subsystems.ledgers.recoveryRuns.copied).toBe(0);
        expect(result.subsystems.ledgers.copied).toBe(2);
    });

    test('an absent ledger is a note, not a backup failure', async () => {
        // A deployment that has never healed has no ledger. That is not a defect and must not fail a
        // backup — the same non-fatal contract concepts and trajectories already have.
        const silentLogger  = {error: () => {}, log: () => {}, warn: () => {}},
              altBundleRoot = path.join(workRoot, 'bundle-no-ledgers'),
              missingRoot   = path.join(workRoot, 'never-existed', 'orchestrator-daemon');

        const result = await runBackup({
            bundleRoot   : altBundleRoot,
            conceptsSourceDir,
            ledgerSources: {
                healAttemptsFile: path.join(missingRoot, 'heal-attempts.json'),
                healEventsDir   : path.join(missingRoot, 'data-heal-events'),
                recoveryRunsDir : path.join(missingRoot, 'recovery-runs')
            },
            logger       : silentLogger,
            trajectoriesSourceFile
        });

        expect(result.subsystems.ledgers.copied).toBe(0);
        expect(result.subsystems.ledgers.healAttempts.note).toMatch(/source not present/);
        expect(result.subsystems.ledgers.healEvents.note).toMatch(/source not present/);
        // The subfolder still exists, so a consumer never has to distinguish "no ledgers" from
        // "this bundle predates ledger capture" by the absence of a directory.
        expect(fs.existsSync(path.join(altBundleRoot, 'ledgers'))).toBe(true);
    });

    test.describe('noticeLegacyBackupRoot — the relocation notice', () => {
        // Injected fs: the point of these cases is the DECISION, not the filesystem. A real
        // temp-dir fixture would exercise fs-extra rather than the branch under test.
        const makeFs = ({legacyEntries = null, markerExists = false} = {}) => {
            const writes = [];

            return {
                writes,
                pathExists: async () => markerExists,
                ensureDir : async () => {},
                writeFile : async (file, body) => { writes.push({file, body}) },
                readdir   : async () => {
                    if (legacyEntries === null) {
                        const error = new Error('ENOENT');
                        error.code  = 'ENOENT';
                        throw error
                    }

                    return legacyEntries
                }
            }
        };

        test('fires and names BOTH roots when bundles remain at the legacy path', async () => {
            const
                logged = [],
                fsImpl = makeFs({legacyEntries: ['backup-2026-07-01T00-00-00.000Z', 'last-backup-receipt.json']}),
                fired  = await noticeLegacyBackupRoot({
                    currentRoot: '/new/backups',
                    legacyRoot : '/repo/.neo-ai-data/backups',
                    logger     : {warn: message => logged.push(message)},
                    fsImpl
                });

            expect(fired).toBe(true);
            expect(logged.join('\n')).toContain('/repo/.neo-ai-data/backups');
            expect(logged.join('\n')).toContain('/new/backups');

            // Nothing is moved or deleted: the ONLY write is the marker. This is the assertion
            // that would catch someone later "helpfully" migrating the bundles.
            expect(fsImpl.writes).toHaveLength(1);
            expect(fsImpl.writes[0].file).toContain('/new/backups')
        });

        test('does NOT repeat once the marker is present', async () => {
            const fired = await noticeLegacyBackupRoot({
                currentRoot: '/new/backups',
                legacyRoot : '/repo/.neo-ai-data/backups',
                logger     : {warn: () => {}},
                fsImpl     : makeFs({legacyEntries: ['backup-x'], markerExists: true})
            });

            expect(fired).toBe(false)
        });

        test('stays silent for a legacy root holding no bundles, and for one that does not exist', async () => {
            const base = {
                currentRoot: '/new/backups',
                legacyRoot : '/repo/.neo-ai-data/backups',
                logger     : {warn: () => {}}
            };

            expect(await noticeLegacyBackupRoot({...base, fsImpl: makeFs({legacyEntries: ['README.md']})})).toBe(false);

            // Absence is the healthy fresh-deployment case and must never surface as an error.
            expect(await noticeLegacyBackupRoot({...base, fsImpl: makeFs()})).toBe(false)
        });

        test('stays silent when both roots resolve alike — profiles that keep bundles in-plane on purpose', async () => {
            const fired = await noticeLegacyBackupRoot({
                currentRoot: '/plane/backups',
                legacyRoot : '/plane/backups',
                logger     : {warn: () => {}},
                fsImpl     : makeFs({legacyEntries: ['backup-x']})
            });

            expect(fired).toBe(false)
        });
    });
});

/**
 * @summary The corruption canary must be reachable by name, not only by knowing the file path.
 *
 * `backupCorruptionTimeline.mjs` is the artifact-verified diagnostic that classifies each retained
 * bundle by comparing its manifest claim against actual artifact bytes. Its own module summary says
 * it exists for "the empty-artifact false-green this incident produced" — it was written AFTER a
 * previous occurrence of that class. It then sat with no npm script, no scheduler entry, and no
 * caller anywhere in the repo.
 *
 * **A tool nothing invokes is not a control.** During a live incident the only way to learn the
 * answer was to know the file existed and run it by hand, which is precisely the knowledge an
 * operator in the middle of a suspected data loss does not have.
 *
 * These probes are static on purpose: they read `package.json` and the committed runbook, so no
 * ambient state can satisfy them.
 */
test.describe('backup corruption canary — reachable by name', () => {
    const repoRoot = process.cwd();

    test('a named npm script invokes the timeline tool', () => {
        const {scripts} = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

        expect(scripts['ai:check-backup-integrity']).toBeDefined();
        expect(scripts['ai:check-backup-integrity']).toContain('backupCorruptionTimeline.mjs');
        // Cross-platform, same rule as every other `ai:` entry — no shell env prefix.
        expect(scripts['ai:check-backup-integrity']).not.toMatch(/^\s*[A-Z_][A-Z0-9_]*=/);
    });

    test('the restoration runbook names the script and when to run it', () => {
        const runbook = fs.readFileSync(path.join(repoRoot, 'learn/agentos/tooling/RestorationRunbook.md'), 'utf8');

        expect(runbook).toContain('ai:check-backup-integrity');
        // Naming the command without naming the trigger leaves the operator exactly where they were:
        // holding a tool and no reason to reach for it.
        expect(runbook).toContain('lastSuccessful');
    });
});
