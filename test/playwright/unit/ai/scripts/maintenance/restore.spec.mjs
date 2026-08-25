import {setup} from '../../../../setup.mjs';

const appName = 'RestoreOrchestratorTest';

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
import fsExtra         from 'fs-extra';
import os              from 'os';
import path            from 'path';

// Serial mode: this file mutates SDK service methods and StorageRouter accessors across
// beforeAll/beforeEach. Running in serial protects against intra-file races during
// local multi-worker runs. CI uses workers:1 (see playwright.config.unit.mjs).
test.describe.configure({mode: 'serial'});

test.describe('restore.mjs orchestrator — bundle-aware substrate restore (#10871 AC-B)', () => {
    let SDK, runRestore, validateBundle, parseArgs;
    let KB_DatabaseService, Memory_DatabaseService, Memory_StorageRouter, Shared_DestructiveOperationGuard;
    let originalKbManageBackup, originalMcManageBackup;
    let originalMemColl, originalSumColl;
    let originalGuardAssert;
    let workRoot;
    const calls = {kb: [], mc: [], guard: []};

    const silentLogger = {log: () => {}, warn: () => {}, error: () => {}};

    /**
     * Builds a synthetic well-formed bundle directory under workRoot.
     */
    function buildSyntheticBundle({
        bundleName,
        chromaUnified,
        shared_topology,
        includeMailbox = true,
        omitSubdirs = []
    }) {
        const bundleRoot = path.join(workRoot, bundleName);
        fs.mkdirSync(bundleRoot, {recursive: true});

        const subdirs = ['kb', 'mc', 'graph', 'concepts', 'trajectories'];
        if (includeMailbox) subdirs.push('mailbox');

        for (const sub of subdirs) {
            if (omitSubdirs.includes(sub)) continue;
            fs.mkdirSync(path.join(bundleRoot, sub), {recursive: true});
        }

        if (!omitSubdirs.includes('kb')) {
            fs.writeFileSync(
                path.join(bundleRoot, 'kb', 'knowledge-base-backup-2026.jsonl'),
                '{"id":"kb-1","embedding":[0.1],"metadata":{"k":"class"},"document":"kb-doc"}\n'
            );
        }
        if (!omitSubdirs.includes('mc')) {
            fs.writeFileSync(
                path.join(bundleRoot, 'mc', 'memory-backup-2026.jsonl'),
                '{"id":"m-1","embedding":[0.2],"metadata":{"t":"prompt"},"document":"mem-doc"}\n'
            );
            fs.writeFileSync(
                path.join(bundleRoot, 'mc', 'summaries-backup-2026.jsonl'),
                '{"id":"s-1","embedding":[0.3],"metadata":{"cat":"feat"},"document":"sum-doc"}\n'
            );
        }
        if (!omitSubdirs.includes('graph')) {
            fs.writeFileSync(
                path.join(bundleRoot, 'graph', 'graph-backup-2026.jsonl'),
                '{"type":"node","data":{"id":"n-1"}}\n'
            );
        }
        if (!omitSubdirs.includes('concepts')) {
            fs.writeFileSync(path.join(bundleRoot, 'concepts', 'nodes.jsonl'),
                '{"id":"concept-n1"}\n');
        }
        if (!omitSubdirs.includes('trajectories')) {
            fs.writeFileSync(path.join(bundleRoot, 'trajectories', 'trajectories.jsonl'),
                '{"turn":1}\n');
        }
        if (includeMailbox && !omitSubdirs.includes('mailbox')) {
            fs.writeFileSync(path.join(bundleRoot, 'mailbox', 'sent-to-cull.jsonl'),
                '{"culled":"msg-1"}\n');
        }

        const meta = {
            bundleVersion: 1,
            timestamp    : '2026-05-07T00-00-00.000Z',
            completedAt  : '2026-05-07T00:00:01.000Z',
            subsystems   : {kb: 1, mc: 2, graph: 1, concepts: {copied: 1}, trajectories: {copied: 1}, mailbox: {copied: 1}},
            integrity    : [{subsystem: 'kb', status: 'pass'}],
            topology     : {
                chromaUnified,
                shared_topology,
                kbChromaCoords: {host: 'localhost', port: 8000, path: '/path/to/kb'},
                mcChromaCoords: {host: 'localhost', port: 8000, dataDir: '/path/to/mc'}
            },
            neoVersion: '12.2.0',
            gitSha    : 'abcdef'
        };
        fs.writeFileSync(path.join(bundleRoot, 'bundle-meta.json'), JSON.stringify(meta, null, 2));

        return bundleRoot;
    }

    test.beforeAll(async () => {
        SDK = await import('../../../../../../ai/services.mjs');
        ({runRestore, validateBundle, parseArgs} = await import('../../../../../../ai/scripts/maintenance/restore.mjs'));

        KB_DatabaseService              = SDK.KB_DatabaseService;
        Memory_DatabaseService          = SDK.Memory_DatabaseService;
        Memory_StorageRouter            = SDK.Memory_StorageRouter;
        Shared_DestructiveOperationGuard = SDK.Shared_DestructiveOperationGuard;

        workRoot = path.resolve(process.cwd(), 'tmp', `restore-orch-${process.pid}-${Date.now()}`);
        fs.mkdirSync(workRoot, {recursive: true});

        originalKbManageBackup = KB_DatabaseService.manageDatabaseBackup.bind(KB_DatabaseService);
        originalMcManageBackup = Memory_DatabaseService.manageDatabaseBackup.bind(Memory_DatabaseService);
        originalMemColl        = Memory_StorageRouter.getMemoryCollection?.bind(Memory_StorageRouter);
        originalSumColl        = Memory_StorageRouter.getSummaryCollection?.bind(Memory_StorageRouter);
        originalGuardAssert    = Shared_DestructiveOperationGuard.assertDestructiveTargetAllowed.bind(Shared_DestructiveOperationGuard);
    });

    test.afterAll(() => {
        KB_DatabaseService.manageDatabaseBackup     = originalKbManageBackup;
        Memory_DatabaseService.manageDatabaseBackup = originalMcManageBackup;
        if (originalMemColl) Memory_StorageRouter.getMemoryCollection  = originalMemColl;
        if (originalSumColl) Memory_StorageRouter.getSummaryCollection = originalSumColl;
        Shared_DestructiveOperationGuard.assertDestructiveTargetAllowed = originalGuardAssert;

        if (workRoot && fs.existsSync(workRoot)) {
            fs.rmSync(workRoot, {recursive: true, force: true});
        }
    });

    test.beforeEach(() => {
        calls.kb.length    = 0;
        calls.mc.length    = 0;
        calls.guard.length = 0;

        KB_DatabaseService.manageDatabaseBackup = async (args) => {
            calls.kb.push(args);
            return {action: args.action, mode: args.mode, imported: 1};
        };
        Memory_DatabaseService.manageDatabaseBackup = async (args) => {
            calls.mc.push(args);
            return {action: args.action, mode: args.mode, imported: 2};
        };
        Memory_StorageRouter.getMemoryCollection  = async () => ({count: async () => 0});
        Memory_StorageRouter.getSummaryCollection = async () => ({count: async () => 0});
        Shared_DestructiveOperationGuard.assertDestructiveTargetAllowed = async (args) => {
            calls.guard.push(args);
            return {allowed: true, classification: 'disposable'};
        };
    });

    test('happy-path merge: routes embedded substrates through SDK and copies flat files', async () => {
        const bundleRoot  = buildSyntheticBundle({bundleName: 'happy-merge', shared_topology: true});
        const conceptsTgt = path.join(workRoot, 'happy-merge-targets', 'concepts');
        const trajTgt     = path.join(workRoot, 'happy-merge-targets', 'trajectories.jsonl');
        const mailboxTgt  = path.join(workRoot, 'happy-merge-targets', 'sent-to-cull.jsonl');

        const result = await runRestore({ expectedDimension: 1,
            bundleRoot,
            mode                  : 'merge',
            conceptsTargetDir     : conceptsTgt,
            trajectoriesTargetFile: trajTgt,
            sentToCullTargetFile  : mailboxTgt,
            logger                : silentLogger
        });

        expect(result.bundleRoot).toBe(bundleRoot);
        expect(result.mode).toBe('merge');
        expect(result.meta).toBeDefined();
        expect(result.meta.bundleVersion).toBe(1);
        expect(result.topology.match).toBe(true);

        // KB called once
        expect(calls.kb).toHaveLength(1);
        expect(calls.kb[0].action).toBe('import');
        expect(calls.kb[0].mode).toBe('merge');
        expect(calls.kb[0].file).toBe(path.join(bundleRoot, 'kb'));

        // MC called twice (once for mc/, once for graph/)
        expect(calls.mc).toHaveLength(2);
        expect(calls.mc.map(c => c.file)).toEqual(
            expect.arrayContaining([path.join(bundleRoot, 'mc'), path.join(bundleRoot, 'graph')])
        );

        // Flat files copied
        expect(fs.existsSync(path.join(conceptsTgt, 'nodes.jsonl'))).toBe(true);
        expect(fs.existsSync(trajTgt)).toBe(true);
        expect(fs.existsSync(mailboxTgt)).toBe(true);

        // Guard not invoked in merge mode for flat files
        expect(calls.guard).toHaveLength(0);
    });

    test('integrity-failure refusal: missing required subdir throws BEFORE any service call', async () => {
        const bundleRoot = buildSyntheticBundle({bundleName: 'corrupt-missing-mc', omitSubdirs: ['mc']});

        await expect(
            runRestore({ expectedDimension: 1, bundleRoot, logger: silentLogger})
        ).rejects.toThrow(/Required bundle subdirectory missing: mc/);

        // No SDK writes attempted
        expect(calls.kb).toHaveLength(0);
        expect(calls.mc).toHaveLength(0);
        expect(calls.guard).toHaveLength(0);
    });

    test('topology mismatch: refused without --force-topology-mismatch, allowed with', async () => {
        // Bundle declares chromaUnified=false; current deployment is permanently unified
        const bundleRoot = buildSyntheticBundle({bundleName: 'topo-mismatch', chromaUnified: false});

        await expect(
            runRestore({ expectedDimension: 1, bundleRoot, logger: silentLogger})
        ).rejects.toThrow(/Topology mismatch: bundle was taken under legacy federated mode, but current deployment is permanently unified\./);

        expect(calls.kb).toHaveLength(0);
        expect(calls.mc).toHaveLength(0);

        const result = await runRestore({ expectedDimension: 1,
            bundleRoot,
            forceTopologyMismatch : true,
            conceptsTargetDir     : path.join(workRoot, 'topo-targets', 'concepts'),
            trajectoriesTargetFile: path.join(workRoot, 'topo-targets', 'trajectories.jsonl'),
            sentToCullTargetFile  : path.join(workRoot, 'topo-targets', 'sent-to-cull.jsonl'),
            logger                : silentLogger
        });
        expect(result.topology.match).toBe(false);
        expect(result.topology.forced).toBe(true);
        expect(calls.kb).toHaveLength(1);
    });

    test('replace mode without --force refuses non-empty target', async () => {
        const bundleRoot = buildSyntheticBundle({bundleName: 'replace-no-force', shared_topology: true});

        // Stub MC collections as non-empty
        Memory_StorageRouter.getMemoryCollection = async () => ({count: async () => 42});

        await expect(
            runRestore({ expectedDimension: 1, bundleRoot, mode: 'replace', force: false, logger: silentLogger})
        ).rejects.toThrow(/Refusing replace mode without --force.*mc\.memories=42/);

        expect(calls.kb).toHaveLength(0);
        expect(calls.mc).toHaveLength(0);
    });

    test('replace mode with --force fires guard for flat substrates and forwards mode through SDK', async () => {
        const bundleRoot  = buildSyntheticBundle({bundleName: 'replace-force', shared_topology: true});
        const conceptsTgt = path.join(workRoot, 'replace-targets', 'concepts');
        const trajTgt     = path.join(workRoot, 'replace-targets', 'trajectories.jsonl');
        const mailboxTgt  = path.join(workRoot, 'replace-targets', 'sent-to-cull.jsonl');

        // Targets empty so --force-not-needed-due-to-empty-targets passes the pre-flight occupancy check.
        // Goal of this test: assert guard fires for flat substrates AND mode=replace forwards through SDK.

        const result = await runRestore({ expectedDimension: 1,
            bundleRoot,
            mode                  : 'replace',
            confirmation          : 'CONFIRM_PRODUCTION_DESTRUCTIVE_AI_SUBSTRATE',
            conceptsTargetDir     : conceptsTgt,
            trajectoriesTargetFile: trajTgt,
            sentToCullTargetFile  : mailboxTgt,
            logger                : silentLogger
        });

        expect(result.mode).toBe('replace');
        expect(calls.kb[0].mode).toBe('replace');
        expect(calls.kb[0].confirmation).toBe('CONFIRM_PRODUCTION_DESTRUCTIVE_AI_SUBSTRATE');
        expect(calls.mc[0].mode).toBe('replace');
        expect(calls.mc[1].mode).toBe('replace');

        // Guard fired for each flat substrate (concepts, trajectories, mailbox = 3 invocations)
        expect(calls.guard).toHaveLength(3);
        const operations = calls.guard.map(c => c.operation).sort();
        expect(operations).toEqual([
            'restore.concepts.replace',
            'restore.mailbox.replace',
            'restore.trajectories.replace'
        ]);

        // Each guard call carries source + target path descriptors + confirmation
        for (const c of calls.guard) {
            expect(c.target.path).toBeTruthy();
            expect(c.source.path).toBeTruthy();
            expect(c.confirmation).toBe('CONFIRM_PRODUCTION_DESTRUCTIVE_AI_SUBSTRATE');
            expect(c.mode).toBe('replace');
        }
    });

    test('merge mode skips existing flat-file targets to preserve operator additions', async () => {
        const bundleRoot  = buildSyntheticBundle({bundleName: 'merge-preserve', chromaUnified: true});
        const conceptsTgt = path.join(workRoot, 'preserve-targets', 'concepts');
        const trajTgt     = path.join(workRoot, 'preserve-targets', 'trajectories.jsonl');
        const mailboxTgt  = path.join(workRoot, 'preserve-targets', 'sent-to-cull.jsonl');

        // Pre-populate targets with operator data
        fs.mkdirSync(conceptsTgt, {recursive: true});
        fs.writeFileSync(path.join(conceptsTgt, 'nodes.jsonl'), '{"id":"existing-operator-data"}\n');
        fs.mkdirSync(path.dirname(trajTgt), {recursive: true});
        fs.writeFileSync(trajTgt, '{"existing":"operator-trajectory"}\n');
        fs.writeFileSync(mailboxTgt, '{"existing":"operator-mailbox"}\n');

        const result = await runRestore({ expectedDimension: 1,
            bundleRoot,
            mode                  : 'merge',
            conceptsTargetDir     : conceptsTgt,
            trajectoriesTargetFile: trajTgt,
            sentToCullTargetFile  : mailboxTgt,
            logger                : silentLogger
        });

        expect(result.subsystems.concepts.skipped).toBe(1);
        expect(result.subsystems.trajectories.skipped).toBe(true);
        expect(result.subsystems.mailbox.skipped).toBe(true);

        // Targets preserved
        expect(fs.readFileSync(path.join(conceptsTgt, 'nodes.jsonl'), 'utf8'))
            .toMatch(/existing-operator-data/);
        expect(fs.readFileSync(trajTgt, 'utf8'))
            .toMatch(/operator-trajectory/);
        expect(fs.readFileSync(mailboxTgt, 'utf8'))
            .toMatch(/operator-mailbox/);
    });

    test('legacy bundle without bundle-meta.json proceeds with topology check skipped', async () => {
        const bundleRoot = buildSyntheticBundle({bundleName: 'legacy-no-meta', chromaUnified: true});
        fs.unlinkSync(path.join(bundleRoot, 'bundle-meta.json'));

        const result = await runRestore({ expectedDimension: 1,
            bundleRoot,
            conceptsTargetDir     : path.join(workRoot, 'legacy-targets', 'concepts'),
            trajectoriesTargetFile: path.join(workRoot, 'legacy-targets', 'trajectories.jsonl'),
            sentToCullTargetFile  : path.join(workRoot, 'legacy-targets', 'sent-to-cull.jsonl'),
            logger                : silentLogger
        });

        // A legacy bundle carries no meta file; the orchestrator still receives the structured
        // unknown-provenance receipt rather than a bare null.
        expect(result.meta.legacy).toBe(true);
        expect(result.meta.embeddingAdvisories[0].reason).toBe('semantic-provenance-unverified');
        expect(result.topology.bundleChromaUnified).toBeUndefined();
        expect(result.topology.match).toBe(true);
        expect(calls.kb).toHaveLength(1);
    });

    test('rejects unknown mode at orchestrator entry', async () => {
        const bundleRoot = buildSyntheticBundle({bundleName: 'unknown-mode', chromaUnified: true});
        await expect(
            runRestore({ expectedDimension: 1, bundleRoot, mode: 'wipe', logger: silentLogger})
        ).rejects.toThrow(/Unknown mode: wipe/);
    });

    test('rejects malformed JSONL during pre-flight integrity check', async () => {
        const bundleRoot = buildSyntheticBundle({bundleName: 'malformed-jsonl', chromaUnified: true});
        fs.writeFileSync(path.join(bundleRoot, 'kb', 'broken.jsonl'), 'this-is-not-json\n');

        await expect(
            runRestore({ expectedDimension: 1, bundleRoot, logger: silentLogger})
        ).rejects.toThrow(/Bundle JSONL parse error at kb\/broken\.jsonl/);

        expect(calls.kb).toHaveLength(0);
    });

    test('parseArgs: positional bundle path + --mode + --force + --force-topology-mismatch', () => {
        // parseArgs return shape grew over time: filterLabels/filterEdgeTypes/onlySubstrate/postRestoreHook,
        // and targetCollection. Defaults preserved when those flags are absent (covered separately in
        // restore-filters.spec.mjs and restoreDisposableTarget.spec.mjs).
        //
        // Kept as exhaustive `toEqual` rather than relaxed to `toMatchObject` when targetCollection was
        // added: this assertion going red on a new key is the feature. `targetCollection` defaulting to
        // anything but null would silently redirect every restore, so a shape pin that CANNOT notice a
        // new default is exactly the wrong trade here.
        expect(parseArgs(['/some/bundle'])).toEqual({
            bundleRoot           : '/some/bundle',
            mode                 : 'merge',
            force                : false,
            forceTopologyMismatch: false,
            filterLabels         : [],
            filterEdgeTypes      : [],
            onlySubstrate        : null,
            postRestoreHook      : null,
            preserveReadState    : false,
            operation            : null,
            targetCollection     : null
        });
        expect(parseArgs(['/some/bundle', '--mode', 'replace', '--force'])).toEqual({
            bundleRoot           : '/some/bundle',
            mode                 : 'replace',
            force                : true,
            forceTopologyMismatch: false,
            filterLabels         : [],
            filterEdgeTypes      : [],
            onlySubstrate        : null,
            postRestoreHook      : null,
            preserveReadState    : false,
            operation            : null,
            targetCollection     : null
        });
        expect(parseArgs(['/some/bundle', '--force-topology-mismatch'])).toEqual({
            bundleRoot           : '/some/bundle',
            mode                 : 'merge',
            force                : false,
            forceTopologyMismatch: true,
            filterLabels         : [],
            filterEdgeTypes      : [],
            onlySubstrate        : null,
            postRestoreHook      : null,
            preserveReadState    : false,
            operation            : null,
            targetCollection     : null
        });
        expect(() => parseArgs([])).toThrow(/Missing required argument/);
        expect(() => parseArgs(['/x', '--unknown-flag'])).toThrow(/Unknown flag/);
    });

    // Reads the REAL `ai:reseed` string out of package.json and feeds it through the real parser, so
    // the alias is itself reachability-tested: break the script entry and this goes red. Asserting a
    // hand-written copy of the alias would only prove the copy.
    test('the ai:reseed npm alias resolves to the operational-re-seed policy', () => {
        const
            pkg   = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')),
            alias = pkg.scripts['ai:reseed'];

        expect(alias).toBeTruthy();

        // npm places the script's own args first and appends everything after `--`, so this is exactly
        // the argv an operator running `npm run ai:reseed -- <bundle> --force` produces.
        const
            aliasArgs = alias.split(/\s+/).slice(2),
            args      = parseArgs([...aliasArgs, '/tmp/bundle-x', '--force']);

        expect(args.operation).toBe('reseed');
        expect(args.mode).toBe('replace');
        expect(args.preserveReadState).toBe(true);
        // GRAPH-ONLY. `DELIVERED_TO` read-state lives in the graph, which is the entire reason
        // preservation matters — so a name advertising a safe live operation must not also replace
        // kb/mc/concepts/trajectories/mailbox. Before this was an operation, the alias inherited
        // `onlySubstrate: null` and would have replaced all six.
        expect(args.onlySubstrate).toEqual(['graph']);
        expect(args.bundleRoot).toBe('/tmp/bundle-x');
        expect(args.force).toBe(true);
        // `--force` must NOT be baked into the alias — a destructive acknowledgment may never ride
        // along inside a convenience name. It is present above only because the operator typed it.
        expect(alias).not.toMatch(/--force/);
    });

    test('parseArgs: --preserve-read-state is a boolean flag, off by default', () => {
        expect(parseArgs(['/some/bundle']).preserveReadState).toBe(false);
        expect(parseArgs(['/some/bundle', '--preserve-read-state']).preserveReadState).toBe(true);
        // Order-independent, and it does not swallow the following argument the way a value flag would.
        const args = parseArgs(['/some/bundle', '--preserve-read-state', '--mode', 'replace']);

        expect(args.preserveReadState).toBe(true);
        expect(args.mode).toBe('replace');
    });

    // REACHABILITY, not mechanism. `DatabaseService.graphReplaceReadAtPreserved.spec` already proves the
    // preservation works when asked for; it cannot prove that anyone asks. A mechanism whose only `true`
    // lives in its own spec is green and unreachable, so these two assert that the operator's intent
    // survives the trip from argv to the SDK call. They go red the moment the orchestrator stops
    // forwarding: the graph import then carries no `preserveDeliveryReadState` key and reads `undefined`.
    // A named operation must PIN its defining arguments, not pre-set overridable defaults. @neo-gpt-emmy's
    // falsifier on the first shape: `--operation`-less alias defaults left `onlySubstrate: null` and an
    // appended `--mode merge` WON — so the name promised a replace and could silently perform a merge
    // across all six substrates. A name that an argument can redefine is a suggestion, not an operation.
    test('a named operation REFUSES contradictory arguments instead of being silently redefined', () => {
        expect(() => parseArgs(['--operation', 'reseed', '/tmp/b', '--mode', 'merge']))
            .toThrow(/pins mode="replace", but "merge" was requested/);
        expect(() => parseArgs(['--operation', 'reseed', '/tmp/b', '--only-substrate=kb']))
            .toThrow(/pins onlySubstrate=\["graph"\], but \["kb"\] was requested/);
        // An AGREEING argument is not a contradiction — refusing it would be strictness for its own sake.
        expect(parseArgs(['--operation', 'reseed', '/tmp/b', '--mode', 'replace']).mode).toBe('replace');
        // Unknown operations fail closed rather than degrading to a plain restore.
        expect(() => parseArgs(['--operation', 'wipe', '/tmp/b'])).toThrow(/Unknown operation: wipe/);
        // The plain surface is untouched — disaster recovery keeps its exact-replacement default.
        const plain = parseArgs(['/tmp/b']);

        expect(plain.operation).toBe(null);
        expect(plain.preserveReadState).toBe(false);
        expect(plain.onlySubstrate).toBe(null);
    });

    test('operational re-seed: preserveReadState reaches the graph SDK import as preserveDeliveryReadState', async () => {
        const bundleRoot = buildSyntheticBundle({bundleName: 'reseed-preserve', shared_topology: true});

        await runRestore({
            expectedDimension: 1,
            bundleRoot,
            mode             : 'replace',
            force            : true,
            preserveReadState: true,
            // Flat targets MUST be scoped to workRoot. Omitting them falls back to DEFAULT_CONCEPTS_DIR
            // etc. — the live `.neo-ai-data/` this repo tracks — and `mode:'replace'` with `force:true`
            // then overwrites another agent's working state from a synthetic fixture. Same shared-resource
            // class as an orphaned Chroma port wedging every seat's suite.
            conceptsTargetDir     : path.join(workRoot, 'reseed-preserve-targets', 'concepts'),
            trajectoriesTargetFile: path.join(workRoot, 'reseed-preserve-targets', 'trajectories.jsonl'),
            sentToCullTargetFile  : path.join(workRoot, 'reseed-preserve-targets', 'sent-to-cull.jsonl'),
            logger                : silentLogger
        });

        const graphImport = calls.mc.find(c => c.action === 'import' && /graph/.test(String(c.file)));

        expect(graphImport).toBeTruthy();
        expect(graphImport.preserveDeliveryReadState).toBe(true);
    });

    test('disaster recovery: the default leaves the graph import exact, never preserving live read state', async () => {
        const bundleRoot = buildSyntheticBundle({bundleName: 'recovery-exact', shared_topology: true});

        await runRestore({
            expectedDimension     : 1,
            bundleRoot,
            mode                  : 'replace',
            force                 : true,
            conceptsTargetDir     : path.join(workRoot, 'recovery-exact-targets', 'concepts'),
            trajectoriesTargetFile: path.join(workRoot, 'recovery-exact-targets', 'trajectories.jsonl'),
            sentToCullTargetFile  : path.join(workRoot, 'recovery-exact-targets', 'sent-to-cull.jsonl'),
            logger                : silentLogger
        });

        const graphImport = calls.mc.find(c => c.action === 'import' && /graph/.test(String(c.file)));

        expect(graphImport).toBeTruthy();
        // Explicitly `false`, not absent: `mode:'replace'` means the bundle IS the new state, so a recovery
        // run must reproduce it exactly rather than silently merging live reads back in. Asserting the
        // value pins that default as a contract rather than an accident of omission.
        expect(graphImport.preserveDeliveryReadState).toBe(false);
    });

    test('merge mode warns that --preserve-read-state has no effect rather than accepting it silently', async () => {
        const bundleRoot = buildSyntheticBundle({bundleName: 'merge-warn', shared_topology: true});
        const warnings   = [];
        const logger     = {log: () => {}, warn: msg => warnings.push(String(msg)), error: () => {}};

        await runRestore({
            expectedDimension     : 1,
            bundleRoot,
            mode                  : 'merge',
            preserveReadState     : true,
            conceptsTargetDir     : path.join(workRoot, 'merge-warn-targets', 'concepts'),
            trajectoriesTargetFile: path.join(workRoot, 'merge-warn-targets', 'trajectories.jsonl'),
            sentToCullTargetFile  : path.join(workRoot, 'merge-warn-targets', 'sent-to-cull.jsonl'),
            logger
        });

        expect(warnings.some(w => /--preserve-read-state has no effect/.test(w))).toBe(true);
        expect(warnings.some(w => /merge never truncates/.test(w))).toBe(true);
    });

    test('validateBundle: standalone validation call returns parsed meta', async () => {
        const bundleRoot = buildSyntheticBundle({bundleName: 'validate-only', chromaUnified: true});
        const layout     = {
            kb          : path.join(bundleRoot, 'kb'),
            mc          : path.join(bundleRoot, 'mc'),
            graph       : path.join(bundleRoot, 'graph'),
            concepts    : path.join(bundleRoot, 'concepts'),
            trajectories: path.join(bundleRoot, 'trajectories'),
            mailbox     : path.join(bundleRoot, 'mailbox')
        };
        const meta = await validateBundle(bundleRoot, layout, silentLogger, 1);
        expect(meta.bundleVersion).toBe(1);
        expect(meta.topology.chromaUnified).toBe(true);
    });

    test('the incident ledgers survive a volume replacement — bundled, then readable again after the data dir is gone', async () => {
        // The load-bearing gap this ticket exists to close. On the cloud profile the orchestrator data
        // directory IS a named volume, so `docker compose down -v` destroys the self-heal and recovery
        // record together with the data whose loss they exist to explain — and the bundle did not cover
        // them. Post-mortem capability co-located with its subject can never describe the one class of
        // event it most needs to.
        const bundleRoot = buildSyntheticBundle({bundleName: 'ledger-survival', shared_topology: true}),
              dataRoot   = path.join(workRoot, 'ledger-survival-plane', 'orchestrator-daemon'),
              targets    = {
                  healAttemptsFile: path.join(dataRoot, 'heal-attempts.json'),
                  healEventsDir   : path.join(dataRoot, 'data-heal-events'),
                  recoveryRunsDir : path.join(dataRoot, 'recovery-runs')
              },
              ledgersDir = path.join(bundleRoot, 'ledgers');

        fs.mkdirSync(path.join(ledgersDir, 'recovery-runs'), {recursive: true});
        fs.writeFileSync(path.join(ledgersDir, 'heal-attempts.json'), JSON.stringify({'kb:chunks': {attempts: 3}}));
        fs.writeFileSync(path.join(ledgersDir, 'heal-events.jsonl'), `${JSON.stringify({collection: 'kb:chunks', type: 'freeze'})}\n`);
        fs.writeFileSync(path.join(ledgersDir, 'recovery-runs', 'run-a.jsonl'), `${JSON.stringify({recoveryRunId: 'run-a', status: 'failed'})}\n`);

        // POSITIVE CONTROL for the whole assertion: the plane is GONE, not merely empty. That is what
        // `-v` does. Every read below therefore proves the restore produced it, not that a fixture was
        // sitting there already.
        expect(fs.existsSync(dataRoot)).toBe(false);

        const result = await runRestore({
            expectedDimension: 1,
            bundleRoot,
            ledgerTargets    : targets,
            logger           : silentLogger,
            onlySubstrate    : ['ledgers']
        });

        // Readable again, with content intact — the evidence is retrievable, not merely archived.
        expect(JSON.parse(fs.readFileSync(targets.healAttemptsFile, 'utf8'))['kb:chunks'].attempts).toBe(3);
        expect(fs.readFileSync(path.join(targets.healEventsDir, 'heal-events.jsonl'), 'utf8')).toContain('freeze');
        expect(fs.readdirSync(targets.recoveryRunsDir)).toEqual(['run-a.jsonl']);

        expect(result.subsystems.ledgers.healAttempts.copied).toBe(true);
        expect(result.subsystems.ledgers.healEvents.copied).toBe(true);
        expect(result.subsystems.ledgers.recoveryRuns.copied).toBe(1);
    });

    test('a legacy bundle with no ledgers/ still restores — the durability gain is not a recovery regression', async () => {
        // `ledgers` is OPTIONAL by deliberate decision. Every bundle written before this change lacks
        // the subfolder, and making it required would render exactly the archives an operator reaches
        // for first unrestorable.
        const bundleRoot = buildSyntheticBundle({bundleName: 'legacy-no-ledgers', shared_topology: true});

        expect(fs.existsSync(path.join(bundleRoot, 'ledgers'))).toBe(false);

        const result = await runRestore({
            expectedDimension: 1,
            bundleRoot,
            logger           : silentLogger,
            onlySubstrate    : ['ledgers']
        });

        // No throw, and no fabricated ledger section for a bundle that never carried one.
        expect(result.subsystems.ledgers).toBeUndefined();
    });

    test('merge mode preserves an existing ledger; replace mode fires the destructive guard', async () => {
        // The ledgers must not become a hole in the destructive-guard coverage just because they were
        // added later than the substrates the guard was written for.
        const bundleRoot = buildSyntheticBundle({bundleName: 'ledger-modes', shared_topology: true}),
              dataRoot   = path.join(workRoot, 'ledger-modes-plane', 'orchestrator-daemon'),
              targets    = {
                  healAttemptsFile: path.join(dataRoot, 'heal-attempts.json'),
                  healEventsDir   : path.join(dataRoot, 'data-heal-events'),
                  recoveryRunsDir : path.join(dataRoot, 'recovery-runs')
              },
              ledgersDir = path.join(bundleRoot, 'ledgers');

        fs.mkdirSync(path.join(ledgersDir, 'recovery-runs'), {recursive: true});
        fs.writeFileSync(path.join(ledgersDir, 'heal-attempts.json'), JSON.stringify({fromBundle: true}));
        fs.mkdirSync(dataRoot, {recursive: true});
        fs.writeFileSync(targets.healAttemptsFile, JSON.stringify({liveOnHost: true}));

        await runRestore({
            expectedDimension: 1,
            bundleRoot,
            ledgerTargets    : targets,
            logger           : silentLogger,
            onlySubstrate    : ['ledgers']
        });

        // merge without --force keeps what is on the host: a restore must not silently overwrite a
        // ledger that has recorded events since the bundle was taken.
        expect(JSON.parse(fs.readFileSync(targets.healAttemptsFile, 'utf8')).liveOnHost).toBe(true);

        calls.guard.length = 0;

        await runRestore({
            expectedDimension: 1,
            bundleRoot,
            force            : true,
            ledgerTargets    : targets,
            logger           : silentLogger,
            mode             : 'replace',
            onlySubstrate    : ['ledgers']
        });

        expect(JSON.parse(fs.readFileSync(targets.healAttemptsFile, 'utf8')).fromBundle).toBe(true);
        expect(calls.guard.some(call => call.operation?.startsWith('restore.ledgers.'))).toBe(true);
    });

    test('replace WITHOUT --force REFUSES a populated ledger target', async () => {
        // My earlier assertion here proved the wrong proposition. It checked that
        // `assertDestructiveTargetAllowed` was CALLED on the ledgers — but that guard classifies
        // target location and confirmation; it does not enforce `--force`. The ledgers were missing
        // from `assessTargetOccupancy`, so a populated ledger on a disposable path could be
        // overwritten with `force: false`, contrary to the whole point of that preflight.
        //
        // "The guard fired" and "the run refused" are different claims, and only the second is the
        // contract. This asserts the refusal.
        const bundleRoot = buildSyntheticBundle({bundleName: 'ledger-force', shared_topology: true}),
              dataRoot   = path.join(workRoot, 'ledger-force-plane', 'orchestrator-daemon'),
              targets    = {
                  healAttemptsFile: path.join(dataRoot, 'heal-attempts.json'),
                  healEventsDir   : path.join(dataRoot, 'data-heal-events'),
                  recoveryRunsDir : path.join(dataRoot, 'recovery-runs')
              };

        fs.mkdirSync(path.join(bundleRoot, 'ledgers'), {recursive: true});
        fs.writeFileSync(path.join(bundleRoot, 'ledgers', 'heal-attempts.json'), JSON.stringify({fromBundle: true}));
        fs.mkdirSync(dataRoot, {recursive: true});
        fs.writeFileSync(targets.healAttemptsFile, JSON.stringify({mustNotBeLost: true}));

        // The other occupancy subsystems are pointed at EMPTY paths. Without this the refusal fires on
        // the repo's real `concepts`/`trajectories` data and the test passes while proving nothing
        // about the ledgers — a confounded positive, which is what the first draft of this test was.
        const isolate = {
            conceptsTargetDir     : path.join(workRoot, 'ledger-force-empty', 'concepts'),
            sentToCullTargetFile  : path.join(workRoot, 'ledger-force-empty', 'sent-to-cull.jsonl'),
            trajectoriesTargetFile: path.join(workRoot, 'ledger-force-empty', 'trajectories.jsonl')
        };

        let refusal;

        try {
            await runRestore({
                expectedDimension: 1,
                bundleRoot,
                force            : false,
                ledgerTargets    : targets,
                logger           : silentLogger,
                mode             : 'replace',
                onlySubstrate    : ['ledgers'],
                ...isolate
            })
        } catch (error) {
            refusal = error
        }

        expect(refusal?.message).toMatch(/Refusing replace mode without --force/);
        // It must refuse BECAUSE of the ledger, naming it — otherwise another subsystem's occupancy
        // could be carrying the assertion.
        expect(refusal.message).toMatch(/ledgers\.healAttempts/);

        // The refusal has to be real: the host file is untouched.
        expect(JSON.parse(fs.readFileSync(targets.healAttemptsFile, 'utf8')).mustNotBeLost).toBe(true);

        // POSITIVE CONTROL: with the ledger target EMPTY and nothing else occupied, the same call
        // proceeds — so the refusal keys on ledger occupancy, not on the ledgers merely being listed.
        fs.rmSync(targets.healAttemptsFile);

        const allowed = await runRestore({
            expectedDimension: 1,
            bundleRoot,
            force            : false,
            ledgerTargets    : targets,
            logger           : silentLogger,
            mode             : 'replace',
            onlySubstrate    : ['ledgers'],
            ...isolate
        });

        expect(allowed.subsystems.ledgers.healAttempts.copied).toBe(true);
    });

    test('a REFUSED authorization on one ledger leaves its siblings unmutated', async () => {
        // Atomicity. The three ledgers were restored in `Promise.all`, and each did
        // guard-check-THEN-mutate — so a guard that refuses SLOWLY on one ledger let a sibling whose
        // guard resolved quickly finish its overwrite before `runRestore` rejected. The run reported
        // failure having already destroyed data, which is worse than either outcome on its own: an
        // operator who sees a refusal reasonably concludes nothing happened.
        //
        // Authorization for every ledger must complete before any mutation begins.
        const bundleRoot = buildSyntheticBundle({bundleName: 'ledger-atomic', shared_topology: true}),
              dataRoot   = path.join(workRoot, 'ledger-atomic-plane', 'orchestrator-daemon'),
              targets    = {
                  healAttemptsFile: path.join(dataRoot, 'heal-attempts.json'),
                  healEventsDir   : path.join(dataRoot, 'data-heal-events'),
                  recoveryRunsDir : path.join(dataRoot, 'recovery-runs')
              };

        fs.mkdirSync(path.join(bundleRoot, 'ledgers', 'recovery-runs'), {recursive: true});
        fs.writeFileSync(path.join(bundleRoot, 'ledgers', 'heal-attempts.json'), JSON.stringify({fromBundle: true}));
        fs.writeFileSync(path.join(bundleRoot, 'ledgers', 'heal-events.jsonl'), '{"type":"freeze"}\n');
        fs.mkdirSync(targets.healEventsDir, {recursive: true});
        fs.writeFileSync(targets.healAttemptsFile, JSON.stringify({mustSurvive: true}));

        // healAttempts authorizes immediately; healEvents refuses only after a tick. Under the old
        // concurrent shape that delay is the whole exploit.
        Shared_DestructiveOperationGuard.assertDestructiveTargetAllowed = async (args) => {
            calls.guard.push(args);

            if (args.subsystem === 'ledgers.healEvents') {
                await new Promise(resolve => setTimeout(resolve, 25));
                throw new Error('refused by policy: ledgers.healEvents');
            }

            return {allowed: true, classification: 'disposable'}
        };

        await expect(runRestore({
            expectedDimension     : 1,
            bundleRoot,
            conceptsTargetDir     : path.join(workRoot, 'ledger-atomic-empty', 'concepts'),
            force                 : true,
            ledgerTargets         : targets,
            logger                : silentLogger,
            mode                  : 'replace',
            onlySubstrate         : ['ledgers'],
            sentToCullTargetFile  : path.join(workRoot, 'ledger-atomic-empty', 'sent-to-cull.jsonl'),
            trajectoriesTargetFile: path.join(workRoot, 'ledger-atomic-empty', 'trajectories.jsonl')
        })).rejects.toThrow(/refused by policy/);

        // The sibling must be untouched. This is the assertion the concurrent shape failed.
        expect(JSON.parse(fs.readFileSync(targets.healAttemptsFile, 'utf8')).mustSurvive).toBe(true);
    });

    test('a bundle written under a RELOCATED ledger path still restores', async () => {
        // The member name was coupled to the host path at both ends: backup stored under
        // `path.basename(source)` and restore searched `path.basename(target)`. Because
        // `healAttemptsPath` is env-relocatable, a bundle written by a host using
        // `custom-attempts.json` read as `source absent` on a default host — a restore reporting
        // success having restored no incident record, which is the same "evidence nobody can
        // retrieve" failure one layer down.
        const bundleRoot = buildSyntheticBundle({bundleName: 'ledger-relocated', shared_topology: true}),
              dataRoot   = path.join(workRoot, 'ledger-relocated-plane', 'orchestrator-daemon'),
              targets    = {
                  // DIFFERENT basename from the bundle member on purpose.
                  healAttemptsFile: path.join(dataRoot, 'custom-attempts.json'),
                  healEventsDir   : path.join(dataRoot, 'data-heal-events'),
                  recoveryRunsDir : path.join(dataRoot, 'recovery-runs')
              };

        fs.mkdirSync(path.join(bundleRoot, 'ledgers'), {recursive: true});
        fs.writeFileSync(path.join(bundleRoot, 'ledgers', 'heal-attempts.json'), JSON.stringify({survived: true}));

        const result = await runRestore({
            expectedDimension: 1,
            bundleRoot,
            ledgerTargets    : targets,
            logger           : silentLogger,
            onlySubstrate    : ['ledgers']
        });

        expect(result.subsystems.ledgers.healAttempts.copied).toBe(true);
        expect(JSON.parse(fs.readFileSync(targets.healAttemptsFile, 'utf8')).survived).toBe(true);
    });
});

test.describe('verifyLatestBackupRestorable — read-only restorability probe (#14030 AC2)', () => {
    let verifyLatestBackupRestorable;
    let probeRoot;
    const silent = {log: () => {}, warn: () => {}, error: () => {}};

    const writeBundle = (name, {torn = false} = {}) => {
        const bundleRoot = path.join(probeRoot, name);
        for (const sub of ['kb', 'mc', 'graph', 'concepts', 'trajectories']) {
            fs.mkdirSync(path.join(bundleRoot, sub), {recursive: true});
        }
        // The embedding-compatibility invariant requires a full 4096-dim vector on
        // vector-collection rows — the fixture row carries one explicitly.
        fs.writeFileSync(path.join(bundleRoot, 'mc', 'memory-backup.jsonl'),
            torn ? '{this is not valid json\n' : JSON.stringify({id: 'm-1', embedding: new Array(4096).fill(0.1), metadata: {t: 'prompt'}}) + '\n');
        return bundleRoot;
    };

    test.beforeAll(async () => {
        ({verifyLatestBackupRestorable} = await import('../../../../../../ai/scripts/maintenance/restore.mjs'));
    });

    test.beforeEach(() => {
        probeRoot = path.join(os.tmpdir(), `neo-restorable-probe-${process.pid}-${Date.now()}`);
        fs.mkdirSync(probeRoot, {recursive: true});
    });

    test.afterEach(() => {
        fsExtra.removeSync(probeRoot);
    });

    test('empty root, torn-newest, and valid-newest verdicts (#14030 AC2)', async () => {
        // (1) no bundles → not restorable, with a clear reason.
        const empty = await verifyLatestBackupRestorable({backupRoot: probeRoot, logger: silent});
        expect(empty.restorable).toBe(false);
        expect(empty.reason).toMatch(/no backup-\* bundles/);
        expect(empty.checkedAt).toBeTruthy();

        // (2) a torn bundle ALONE is still refused, and still names itself. This assertion moved to a
        // single-bundle root deliberately: it used to place an older VALID bundle beside the torn one
        // and assert the refusal anyway, which pinned newest-only selection as the contract. That case
        // is now inverted in the fallback describe below, asserting RESTORABLE against the older
        // bundle. What survives here is what did not change: a torn bundle with nothing behind it is
        // not restorable.
        writeBundle('backup-2026-06-01T00-00-00', {torn: true});
        const torn = await verifyLatestBackupRestorable({backupRoot: probeRoot, logger: silent});
        expect(torn.restorable).toBe(false);
        expect(torn.bundleRoot).toContain('backup-2026-06-01T00-00-00');
        expect(torn.reason).toMatch(/parse error/);

        // (3) replace the newest with a valid bundle → restorable, no reason.
        fsExtra.removeSync(path.join(probeRoot, 'backup-2026-06-01T00-00-00'));
        writeBundle('backup-2026-06-02T00-00-00');
        const ok = await verifyLatestBackupRestorable({backupRoot: probeRoot, logger: silent});
        expect(ok.restorable).toBe(true);
        expect(ok.bundleRoot).toContain('backup-2026-06-02T00-00-00');
        expect(ok.reason).toBeNull();
    });

    test('the verdict carries a machine-readable code, and an ABSENT root is not the same as an empty one', async () => {
        // A caller gating a redeploy on this probe must branch on a value, not pattern-match English
        // out of `reason` — a prose reword would silently stop matching and the gate would pass.
        const absent = await verifyLatestBackupRestorable({
            backupRoot: path.join(probeRoot, 'never-existed'),
            logger    : silent
        });
        const emptyRoot = await verifyLatestBackupRestorable({backupRoot: probeRoot, logger: silent});

        // The distinction is the point. The bundle root is bind-mounted from a path RELATIVE to the
        // compose project directory, so a deployment run from a different host checkout addresses a
        // directory that never existed while its bundles sit safely in the prior checkout. Answering
        // "no bundle" there sends an operator to recreate backups they already have.
        expect(absent.code).toBe('BUNDLE_ROOT_MISSING');
        expect(emptyRoot.code).toBe('NO_BUNDLES');
        expect(absent.code).not.toBe(emptyRoot.code);
        expect(absent.restorable).toBe(false);
        expect(emptyRoot.restorable).toBe(false);

        writeBundle('backup-2026-06-03T00-00-00', {torn: true});
        expect((await verifyLatestBackupRestorable({backupRoot: probeRoot, logger: silent})).code).toBe('BUNDLE_INVALID');

        fsExtra.removeSync(path.join(probeRoot, 'backup-2026-06-03T00-00-00'));
        writeBundle('backup-2026-06-04T00-00-00');
        expect((await verifyLatestBackupRestorable({backupRoot: probeRoot, logger: silent})).code).toBe('RESTORABLE');
    });

    test('RESTORABLE means non-empty, not merely parseable — an empty bundle is refused', async () => {
        // Reviewer falsifier, reproduced before the fix: a bundle carrying only the six required
        // directories plus a minimal meta parsed clean and returned `{restorable: true, code:
        // 'RESTORABLE'}`. That is the ticket's explicitly forbidden precondition, and the exact shape
        // of the incident — the one bundle in the ledger completed 25 minutes AFTER the new stack came
        // up, capturing an already-empty plane. A machine-readable code is only worth having when its
        // predicate is stronger than the prose it replaced.
        const emptyBundle = path.join(probeRoot, 'backup-2026-07-01T00-00-00');

        for (const sub of ['kb', 'mc', 'graph', 'concepts', 'trajectories', 'mailbox']) {
            fs.mkdirSync(path.join(emptyBundle, sub), {recursive: true});
        }
        fsExtra.writeJsonSync(path.join(emptyBundle, 'bundle-meta.json'), {
            bundleVersion: 1,
            integrity    : [],
            subsystems   : {},
            topology     : {chromaUnified: true, shared_topology: true}
        });

        const verdict = await verifyLatestBackupRestorable({backupRoot: probeRoot, logger: silent});

        expect(verdict.restorable).toBe(false);
        expect(verdict.code).toBe('BUNDLE_EMPTY');
        expect(verdict.rowTotal).toBe(0);
        // Distinct from every other refusal, so a gate can tell "nothing to restore from" apart from
        // "nothing here at all" and "here but torn".
        expect(verdict.code).not.toBe('NO_BUNDLES');
        expect(verdict.code).not.toBe('BUNDLE_INVALID');

        // POSITIVE CONTROL: a populated bundle in the same root still passes, so the new predicate
        // discriminates rather than refusing everything.
        writeBundle('backup-2026-07-02T00-00-00');

        const populated = await verifyLatestBackupRestorable({backupRoot: probeRoot, logger: silent});

        expect(populated.code).toBe('RESTORABLE');
        expect(populated.rowTotal).toBeGreaterThan(0);
    });

    test('#16567 a declared zero collection proves prior state but cannot authorize recovery', async () => {
        const bundleRoot = path.join(probeRoot, 'backup-2026-08-05T00-00-00');

        for (const sub of ['kb', 'mc', 'graph', 'concepts', 'trajectories']) {
            fs.mkdirSync(path.join(bundleRoot, sub), {recursive: true});
        }

        const row = collection => JSON.stringify({
            id       : `${collection}-1`,
            embedding: new Array(4096).fill(0.1),
            metadata : {collection}
        }) + '\n';

        fs.writeFileSync(path.join(bundleRoot, 'mc', 'memory-backup.jsonl'), row('memories'));
        fs.writeFileSync(path.join(bundleRoot, 'mc', 'summary-backup.jsonl'), row('summaries'));
        fsExtra.writeJsonSync(path.join(bundleRoot, 'bundle-meta.json'), {
            bundleVersion: 1,
            embedding    : {
                counts       : {kb: 0, memories: 1, summaries: 1},
                dimension    : 4096,
                schemaVersion: 1
            },
            integrity : [
                {bundleCount: 0, sourceCount: 0, status: 'empty', subsystem: 'kb'},
                {bundleCount: 2, sourceCount: 2, status: 'pass', subsystem: 'mc'},
                {bundleCount: 1, sourceCount: 1, status: 'pass', subsystem: 'graph'}
            ],
            subsystems: {},
            topology  : {chromaUnified: true, shared_topology: true}
        });

        const verdict = await verifyLatestBackupRestorable({backupRoot: probeRoot, logger: silent});

        expect(verdict.code).toBe('BUNDLE_INCOMPLETE');
        expect(verdict.priorStateEvidence).toBe(true);
        expect(verdict.recoverySourceAuthorized).toBe(false);
        expect(verdict.emptySubsystems).toEqual(['kb']);
    });

    test('#16567 a populated graph alone still proves prior state', async () => {
        const bundleRoot = path.join(probeRoot, 'backup-2026-08-05T01-00-00');

        fs.mkdirSync(bundleRoot, {recursive: true});

        const verdict = await verifyLatestBackupRestorable({
            backupRoot: probeRoot,
            logger    : silent,
            validateFn: async () => ({
                embeddingAdvisories: [],
                integrity          : [
                    {status: 'skipped', subsystem: 'kb'},
                    {status: 'skipped', subsystem: 'mc'},
                    {bundleCount: 1, sourceCount: 1, status: 'pass', subsystem: 'graph'}
                ],
                streamedCounts: {}
            })
        });

        expect(verdict.code).toBe('BUNDLE_INCOMPLETE');
        expect(verdict.priorStateEvidence).toBe(true);
        expect(verdict.recoverySourceAuthorized).toBe(false);
    });

    test('the per-collection fields are present on EVERY verdict, and `null` means unmeasured — not "none empty"', async () => {
        // Found in review by @neo-opus-vega. The fields shipped on RESTORABLE and BUNDLE_EMPTY but were
        // ABSENT from the catch path, which made absence indistinguishable from "measured, none empty":
        // `verdict.emptyCollections?.length > 0` reads FALSE for a bundle nobody could read — falsely
        // reassuring, on the fail-closed path where that costs most.
        //
        // Set-equality rather than a count, so a legitimate collection change never needs a pin bumped.
        // Three sibling roots under the per-test `probeRoot`, since each needs its own newest bundle.
        const caseRoot = name => path.join(probeRoot, name),
              // Mirrors the describe-level `writeBundle` layout, but into a caller-supplied root and
              // carrying the `streamedCounts` this test is actually about.
              writeMeta = (root, bundle, meta) => {
                  const dir = path.join(root, bundle);

                  for (const sub of ['kb', 'mc', 'graph', 'concepts', 'trajectories']) {
                      fs.mkdirSync(path.join(dir, sub), {recursive: true});
                  }

                  fs.writeFileSync(path.join(dir, 'mc', 'memory-backup.jsonl'),
                      JSON.stringify({id: 'm-1', embedding: new Array(4096).fill(0.1), metadata: {t: 'prompt'}}) + '\n');
                  fs.writeFileSync(path.join(dir, 'bundle-meta.json'), meta);

                  return dir
              },
              withCounts = counts => JSON.stringify({
                  embedding: {
                      counts,
                      dimension    : 4096,
                      schemaVersion: 1
                  },
                  topology: {chromaUnified: true, shared_topology: true}
              });

        // MEASURED, some empty -> both fields populated, emptyCollections names WHICH.
        const measuredRoot = caseRoot('per-collection-measured');

        writeMeta(measuredRoot, 'backup-2026-07-10T00-00-00',
            withCounts({kb: 0, memories: 1, summaries: 0}));

        const populated = await verifyLatestBackupRestorable({backupRoot: measuredRoot, logger: silent});

        // The counts come from the validator's own streaming pass, not from the fixture's meta — so
        // this pins the SHAPE contract rather than a collection roster the validator owns.
        expect(populated.code).toBe('BUNDLE_INCOMPLETE');
        expect(populated.collectionCounts, 'measured must be an object, never null').not.toBe(null);
        expect(Object.keys(populated.collectionCounts).length).toBeGreaterThan(0);

        // MEASURED zero members remain present in the declared census rather than disappearing from
        // the sparse streamed map — zero members are part of the reporting contract.
        expect(Array.isArray(populated.emptyCollections), 'measured must be an array, never null').toBe(true);
        expect(populated.emptyCollections).toEqual(['kb', 'summaries']);
        expect(populated.emptyCollections).not.toBe(null);

        // UNMEASURED -> both `null`. This is the assertion the omission would have failed, and the one
        // that makes the optional-chain read honest: `null?.length > 0` and `[]?.length > 0` are both
        // false, so a consumer MUST gate on null rather than on truthiness.
        const brokenRoot = caseRoot('per-collection-unmeasured');

        writeMeta(brokenRoot, 'backup-2026-07-12T00-00-00', '{ this is not json');

        const unmeasured = await verifyLatestBackupRestorable({backupRoot: brokenRoot, logger: silent});

        expect(unmeasured.restorable).toBe(false);
        expect(['BUNDLE_INVALID', 'BUNDLE_UNVERIFIABLE']).toContain(unmeasured.code);
        expect(unmeasured.collectionCounts, 'unmeasured must be null, never {}').toBe(null);
        expect(unmeasured.emptyCollections, 'unmeasured must be null, never []').toBe(null);
    });

    test('the probe validates the LEDGER members it attests, including the non-JSONL and nested ones', async () => {
        // The probe vouched for a member it never looked at. `ledgers` was absent from its layout, and
        // even with it present the streaming scan reaches only top-level `*.jsonl` — so
        // `heal-attempts.json` (not `.jsonl`) and `recovery-runs/*.jsonl` (nested) both passed
        // malformed while the verdict read `RESTORABLE`. A probe may only attest what it parsed.
        const bundle = path.join(probeRoot, 'backup-2026-08-01T00-00-00');

        writeBundle('backup-2026-08-01T00-00-00');
        fs.mkdirSync(path.join(bundle, 'ledgers', 'recovery-runs'), {recursive: true});

        // (1) malformed JSON object
        fs.writeFileSync(path.join(bundle, 'ledgers', 'heal-attempts.json'), '{NOT VALID JSON');

        const brokenAttempts = await verifyLatestBackupRestorable({backupRoot: probeRoot, logger: silent});

        expect(brokenAttempts.restorable).toBe(false);
        expect(brokenAttempts.code).toBe('BUNDLE_INVALID');
        expect(brokenAttempts.reason).toMatch(/heal-attempts\.json/);

        // (2) malformed NESTED recovery-run JSONL
        fsExtra.writeJsonSync(path.join(bundle, 'ledgers', 'heal-attempts.json'), {ok: true});
        fs.writeFileSync(path.join(bundle, 'ledgers', 'recovery-runs', 'run-bad.jsonl'), '{BROKEN\n');

        const brokenRun = await verifyLatestBackupRestorable({backupRoot: probeRoot, logger: silent});

        expect(brokenRun.restorable).toBe(false);
        expect(brokenRun.code).toBe('BUNDLE_INVALID');
        expect(brokenRun.reason).toMatch(/recovery-runs\/run-bad\.jsonl/);

        // POSITIVE CONTROL: well-formed ledgers restore the RESTORABLE verdict, so the new validation
        // discriminates rather than rejecting any bundle that carries ledgers at all.
        fs.writeFileSync(path.join(bundle, 'ledgers', 'recovery-runs', 'run-bad.jsonl'), `${JSON.stringify({recoveryRunId: 'ok'})}\n`);

        expect((await verifyLatestBackupRestorable({backupRoot: probeRoot, logger: silent})).code).toBe('RESTORABLE');
    });
});

/**
 * @summary Pins that one unusable newest bundle must not hide recoverable history behind it.
 *
 * The incident: a run died mid-write and left a bundle-shaped directory. The probe read that
 * directory, reported the whole root unrecoverable, and a complete bundle carrying 94,325 rows sitting
 * directly beside it was never looked at. The deploy guard refused and the repair was `rm -rf` inside
 * the backup root — deleting evidence to unblock a guard.
 *
 * Every fallback case here asserts BOTH halves: that a valid older bundle is found, AND that the
 * bundle passed over is still named in `skipped`. A fallback that succeeded silently would trade a
 * false refusal for an invisible one.
 */
test.describe('verifyLatestBackupRestorable — falls back past an unusable newest bundle (#16348 AC4)', () => {
    let verifyLatestBackupRestorable;
    let probeRoot;
    const silent = {log: () => {}, warn: () => {}, error: () => {}};

    /** Writes a structurally valid bundle carrying one full-dimension vector row. */
    const writeValidBundle = name => {
        const bundleRoot = path.join(probeRoot, name);
        for (const sub of ['kb', 'mc', 'graph', 'concepts', 'trajectories']) {
            fs.mkdirSync(path.join(bundleRoot, sub), {recursive: true});
        }
        fs.writeFileSync(path.join(bundleRoot, 'mc', 'memory-backup.jsonl'),
            JSON.stringify({id: `m-${name}`, embedding: new Array(4096).fill(0.1), metadata: {t: 'prompt'}}) + '\n');
        return bundleRoot;
    };

    /** Specimen 2 — the abort-mid-write shape: bundle-shaped directories, no rows, no receipt. */
    const writeAbortedBundle = name => {
        const bundleRoot = path.join(probeRoot, name);
        for (const sub of ['kb', 'mc', 'graph', 'concepts', 'trajectories']) {
            fs.mkdirSync(path.join(bundleRoot, sub), {recursive: true});
        }
        fs.writeFileSync(path.join(bundleRoot, 'kb', 'knowledge-base-backup.jsonl'), '');
        return bundleRoot;
    };

    /** Specimen 1 — the zero-capture shape: a complete receipt attesting an empty corpus. */
    const writeZeroCaptureBundle = name => {
        const bundleRoot = path.join(probeRoot, name);
        for (const sub of ['kb', 'mc', 'graph', 'concepts', 'trajectories', 'mailbox']) {
            fs.mkdirSync(path.join(bundleRoot, sub), {recursive: true});
        }
        fsExtra.writeJsonSync(path.join(bundleRoot, 'bundle-meta.json'), {
            bundleVersion: 1,
            integrity    : [{subsystem: 'kb', status: 'empty', sourceCount: 0, bundleCount: 0}],
            subsystems   : {kb: {count: 0, message: 'Export complete. Exported 0 knowledge base chunks.'}},
            topology     : {chromaUnified: true, shared_topology: true}
        });
        return bundleRoot;
    };

    /** Writes a torn bundle whose JSONL cannot parse. */
    const writeTornBundle = name => {
        const bundleRoot = path.join(probeRoot, name);
        for (const sub of ['kb', 'mc', 'graph', 'concepts', 'trajectories']) {
            fs.mkdirSync(path.join(bundleRoot, sub), {recursive: true});
        }
        fs.writeFileSync(path.join(bundleRoot, 'mc', 'memory-backup.jsonl'), '{this is not valid json\n');
        return bundleRoot;
    };

    test.beforeAll(async () => {
        ({verifyLatestBackupRestorable} = await import('../../../../../../ai/scripts/maintenance/restore.mjs'));
    });

    test.beforeEach(() => {
        probeRoot = path.join(os.tmpdir(), `neo-restorable-fallback-${process.pid}-${Date.now()}`);
        fs.mkdirSync(probeRoot, {recursive: true});
    });

    test.afterEach(() => {
        fsExtra.removeSync(probeRoot);
    });

    test('the live incident: an aborted newest bundle no longer hides the good bundle beside it', async () => {
        // Ordered exactly as the incident was on disk — the aborted run is NEWER than the complete one.
        writeValidBundle('backup-2026-08-01T12-13-23.398Z');
        writeAbortedBundle('backup-2026-08-02T05-12-55.917Z');

        const verdict = await verifyLatestBackupRestorable({backupRoot: probeRoot, logger: silent});

        expect(verdict.restorable).toBe(true);
        expect(verdict.code).toBe('RESTORABLE');
        expect(verdict.bundleRoot).toContain('backup-2026-08-01T12-13-23.398Z');
        expect(verdict.rowTotal).toBeGreaterThan(0);

        // The half that keeps the fallback honest: the bad bundle is still reported, by name and code.
        expect(verdict.skipped).toHaveLength(1);
        expect(verdict.skipped[0].bundleName).toBe('backup-2026-08-02T05-12-55.917Z');
        expect(verdict.skipped[0].code).toBe('BUNDLE_EMPTY');
        expect(verdict.examined).toBe(2);
    });

    test('an abrupt-death staging directory is never a restore candidate, even when it contains parseable rows (#16417)', async () => {
        writeValidBundle('backup-2026-08-01T12-13-23.398Z');
        writeValidBundle('.backup-partial-backup-2026-08-02T05-12-55.917Z-dead-process');

        const verdict = await verifyLatestBackupRestorable({backupRoot: probeRoot, logger: silent});

        expect(verdict.restorable).toBe(true);
        expect(verdict.bundleRoot).toContain('backup-2026-08-01T12-13-23.398Z');
        expect(verdict.examined).toBe(1);
        expect(verdict.skipped).toEqual([]);
    });

    test('the fallback crosses every unusable class, not just the one that caused the incident', async () => {
        // Three distinct failure shapes stacked ABOVE the only good bundle. If the walk only handled
        // the shape it was written for, one of these would stop it.
        writeValidBundle('backup-2026-07-01T00-00-00');
        writeZeroCaptureBundle('backup-2026-07-02T00-00-00');
        writeTornBundle('backup-2026-07-03T00-00-00');
        writeAbortedBundle('backup-2026-07-04T00-00-00');

        const verdict = await verifyLatestBackupRestorable({backupRoot: probeRoot, logger: silent});

        expect(verdict.restorable).toBe(true);
        expect(verdict.bundleRoot).toContain('backup-2026-07-01T00-00-00');
        expect(verdict.skipped.map(s => s.code)).toEqual(['BUNDLE_EMPTY', 'BUNDLE_INVALID', 'BUNDLE_EMPTY']);
        // Newest-first ordering, so an operator reads the skip list in the order the bundles were made.
        expect(verdict.skipped.map(s => s.bundleName)).toEqual([
            'backup-2026-07-04T00-00-00',
            'backup-2026-07-03T00-00-00',
            'backup-2026-07-02T00-00-00'
        ]);
    });

    test('#16567 an incomplete newest bundle falls through to older complete history', async () => {
        writeValidBundle('backup-2026-07-01T00-00-00');
        const incomplete = writeValidBundle('backup-2026-07-02T00-00-00');

        fsExtra.writeJsonSync(path.join(incomplete, 'bundle-meta.json'), {
            bundleVersion: 1,
            integrity    : [
                {bundleCount: 0, sourceCount: 0, status: 'empty', subsystem: 'kb'},
                {bundleCount: 1, sourceCount: 1, status: 'pass', subsystem: 'mc'},
                {bundleCount: 1, sourceCount: 1, status: 'pass', subsystem: 'graph'}
            ],
            topology: {chromaUnified: true, shared_topology: true}
        });

        const verdict = await verifyLatestBackupRestorable({backupRoot: probeRoot, logger: silent});

        expect(verdict.code).toBe('RESTORABLE');
        expect(verdict.recoverySourceAuthorized).toBe(true);
        expect(verdict.bundleRoot).toContain('backup-2026-07-01T00-00-00');
        expect(verdict.skipped).toHaveLength(1);
        expect(verdict.skipped[0].code).toBe('BUNDLE_INCOMPLETE');
    });

    test('#16567 a newer empty bundle cannot erase prior-state evidence from populated older history', async () => {
        const incompleteName = 'backup-2026-08-05T01-00-00',
              emptyName      = 'backup-2026-08-06T02-00-00',
              incompleteMeta = {
                  embeddingAdvisories: [],
                  embedding          : {counts: {kb: 0, memories: 32462, summaries: 1777}},
                  integrity          : [
                      {bundleCount: 0,     sourceCount: 0,     status: 'empty', subsystem: 'kb'},
                      {bundleCount: 34239, sourceCount: 34239, status: 'pass',  subsystem: 'mc'},
                      {bundleCount: 12,    sourceCount: 12,    status: 'pass',  subsystem: 'graph'}
                  ],
                  streamedCounts: {memories: 32462, summaries: 1777}
              },
              emptyMeta = {
                  embeddingAdvisories: [],
                  embedding          : {counts: {kb: 0, memories: 0, summaries: 0}},
                  integrity          : ['kb', 'mc', 'graph'].map(subsystem => ({
                      bundleCount: 0,
                      sourceCount: 0,
                      status     : 'empty',
                      subsystem
                  })),
                  streamedCounts: {}
              },
              bundles = {
                  [emptyName]     : emptyMeta,
                  [incompleteName]: incompleteMeta
              },
              validateFn = async bundleRoot => bundles[path.basename(bundleRoot)];

        fs.mkdirSync(path.join(probeRoot, incompleteName), {recursive: true});

        // Positive control: the populated incomplete bundle proves prior state by itself.
        const alone = await verifyLatestBackupRestorable({backupRoot: probeRoot, logger: silent, validateFn});

        expect(alone.code).toBe('BUNDLE_INCOMPLETE');
        expect(alone.priorStateEvidence).toBe(true);
        expect(alone.recoverySourceAuthorized).toBe(false);

        // Probe: failure provenance stays on the empty newest bundle, while root-level prior-state
        // evidence remains true because the older populated bundle was also examined.
        fs.mkdirSync(path.join(probeRoot, emptyName), {recursive: true});

        const stacked = await verifyLatestBackupRestorable({backupRoot: probeRoot, logger: silent, validateFn});

        expect(stacked.code).toBe('BUNDLE_EMPTY');
        expect(stacked.bundleRoot).toContain(emptyName);
        expect(stacked.priorStateEvidence).toBe(true);
        expect(stacked.recoverySourceAuthorized).toBe(false);
        expect(stacked.skipped.map(item => item.code)).toEqual(['BUNDLE_EMPTY', 'BUNDLE_INCOMPLETE']);

        const {evaluateRedeployPreconditions, PRIMARY_VOLUME_STATE} =
                  await import('../../../../../../ai/scripts/maintenance/redeployPreflight.mjs'),
              outcome = evaluateRedeployPreconditions({
                  emptySubsystems         : stacked.emptySubsystems,
                  initializeRequested     : true,
                  markerPresent           : false,
                  primaryVolumeState      : PRIMARY_VOLUME_STATE.ABSENT,
                  priorStateEvidence      : stacked.priorStateEvidence,
                  recoverySourceAuthorized: stacked.recoverySourceAuthorized,
                  verdictCode             : stacked.code
              });

        expect(outcome.proceed).toBe(false);
        expect(outcome.decision).toBe('REFUSE_ALREADY_INITIALIZED');
    });

    test('REGRESSION GUARD: a legacy bundle carrying no bundle-meta.json but real rows stays restorable', async () => {
        // `validateBundle` documents meta-absence as the LEGACY bundle contract, returning
        // `{legacy: true}` rather than failing. An earlier draft of this change rejected meta-less
        // bundles up front as the abort-mid-write specimen, which would have made every pre-meta bundle
        // permanently unrecoverable — the two shapes are only distinguishable by whether rows exist,
        // not by whether a receipt does. `writeValidBundle` writes no meta, so this is that case.
        writeValidBundle('backup-2026-06-01T00-00-00');

        const verdict = await verifyLatestBackupRestorable({backupRoot: probeRoot, logger: silent});

        expect(verdict.restorable).toBe(true);
        expect(verdict.code).toBe('RESTORABLE');
        expect(verdict.rowTotal).toBeGreaterThan(0);

        // NEGATIVE CONTROL sharing the property under test: also meta-less, also no receipt — and
        // refused. Proves the verdict turns on recoverable rows rather than on the file's absence,
        // which is the discrimination the earlier draft got wrong.
        fsExtra.removeSync(path.join(probeRoot, 'backup-2026-06-01T00-00-00'));
        writeAbortedBundle('backup-2026-06-02T00-00-00');

        const refused = await verifyLatestBackupRestorable({backupRoot: probeRoot, logger: silent});

        expect(refused.restorable).toBe(false);
        expect(refused.code).toBe('BUNDLE_EMPTY');
    });

    test('when NOTHING is restorable the verdict still describes the NEWEST bundle', async () => {
        // Contract preservation. `redeployPreflight` prints this code as the refusal cause and fails
        // closed on anything but RESTORABLE, so the walk must not trade a precise newest-bundle reason
        // for an aggregate that tells an operator less than the old single-bundle probe did.
        writeAbortedBundle('backup-2026-05-01T00-00-00');
        writeTornBundle('backup-2026-05-02T00-00-00');

        const verdict = await verifyLatestBackupRestorable({backupRoot: probeRoot, logger: silent});

        expect(verdict.restorable).toBe(false);
        expect(verdict.code).toBe('BUNDLE_INVALID');
        expect(verdict.bundleRoot).toContain('backup-2026-05-02T00-00-00');
        expect(verdict.reason).toMatch(/parse error/);
        expect(verdict.skipped).toHaveLength(2);
        // The refusal must carry the newest bundle's WHOLE verdict. A first draft rebuilt a reduced
        // `{code, reason, bundleRoot}` here and silently dropped these two fields from every failure —
        // a shape regression invisible to any assertion that only checks the code.
        expect(verdict.embeddingAdvisories).toEqual([]);
        expect(verdict.checkedAt).toBeTruthy();
    });

    test('an EMPTY newest bundle keeps reporting its rowTotal through the walk', async () => {
        // Same shape-preservation point on the other refusal branch: `rowTotal` is how a caller tells
        // "verified against zero rows" from "never got a count", and only the BUNDLE_EMPTY path sets it.
        writeZeroCaptureBundle('backup-2026-02-01T00-00-00');

        const verdict = await verifyLatestBackupRestorable({backupRoot: probeRoot, logger: silent});

        expect(verdict.code).toBe('BUNDLE_EMPTY');
        expect(verdict.rowTotal).toBe(0);
    });

    test('the scan bound is enforced AND announced — a silent cap reads like an exhaustive search', async () => {
        // A good bundle sits below more unusable ones than the bound allows. The probe must refuse
        // rather than walk forever, and must SAY that it stopped early, because "examined everything
        // and found nothing" and "gave up after two" are different facts to an operator deciding
        // whether to deploy.
        writeValidBundle('backup-2026-04-01T00-00-00');
        writeTornBundle('backup-2026-04-02T00-00-00');
        writeTornBundle('backup-2026-04-03T00-00-00');

        const warnings = [];
        const logger   = {log: () => {}, error: () => {}, warn: message => warnings.push(message)};

        const verdict = await verifyLatestBackupRestorable({backupRoot: probeRoot, logger, maxBundlesExamined: 2});

        expect(verdict.restorable).toBe(false);
        expect(verdict.examined).toBe(2);
        expect(warnings.join('\n')).toMatch(/1 older candidate\(s\) were NOT examined/);

        // POSITIVE CONTROL: the same root with the bound raised DOES reach the good bundle, so the
        // refusal above is the bound talking and not an inability to find it at all.
        const raised = await verifyLatestBackupRestorable({backupRoot: probeRoot, logger: silent, maxBundlesExamined: 3});

        expect(raised.restorable).toBe(true);
        expect(raised.bundleRoot).toContain('backup-2026-04-01T00-00-00');
    });

    test('a non-positive scan bound fails loud rather than crashing inside the walk', async () => {
        writeValidBundle('backup-2026-03-01T00-00-00');

        for (const bad of [0, -1, 1.5, 'three', null]) {
            await expect(verifyLatestBackupRestorable({backupRoot: probeRoot, logger: silent, maxBundlesExamined: bad}))
                .rejects.toThrow(/positive integer `maxBundlesExamined`/);
        }
    });

    test('an UNREADABLE newest bundle must not authorize an older one — unknown is not unusable', async () => {
        // The fail-open @neo-gpt found in review. The walk treated every validator exception as proof
        // that the candidate was a bad artifact, then used that as permission to fall back. But an
        // EACCES says "I could not tell", and skipping a bundle that was merely unreadable authorizes
        // recovery from staler history than actually exists — missing evidence used as negative
        // evidence, at a deployment authorization boundary.
        writeValidBundle('backup-2026-09-01T00-00-00');   // older, perfectly good
        writeValidBundle('backup-2026-09-02T00-00-00');   // newer, but unreadable below

        const validateFn = async bundleRoot => {
            if (bundleRoot.includes('2026-09-02')) {
                throw Object.assign(new Error('EACCES: permission denied, scandir'), {code: 'EACCES'});
            }
            return {streamedCounts: {memories: 1}, embeddingAdvisories: []}
        };

        const verdict = await verifyLatestBackupRestorable({backupRoot: probeRoot, logger: silent, validateFn});

        expect(verdict.restorable).toBe(false);
        expect(verdict.code).toBe('BUNDLE_UNVERIFIABLE');
        // It stopped AT the unreadable bundle; the older valid one was never reached.
        expect(verdict.bundleRoot).toContain('backup-2026-09-02T00-00-00');
        expect(verdict.examined).toBe(1);

        // Structured evidence, so a consumer separates "unreadable" from "malformed" without matching
        // English out of `reason` — the same reason the verdict codes exist at all.
        expect(verdict.unverifiable).toBe(true);
        expect(verdict.errorCode).toBe('EACCES');
    });

    test('POSITIVE CONTROL: a genuinely malformed newest bundle still falls through to the older one', async () => {
        // Shares the property under test — also a newest bundle whose validation throws — but here the
        // throw is a CONTENT judgement from the real validator. Without this, the test above would be
        // satisfied by a probe that simply stopped at every failure, which would reintroduce the
        // original defect while looking like a safety fix.
        writeValidBundle('backup-2026-10-01T00-00-00');
        writeTornBundle('backup-2026-10-02T00-00-00');

        const verdict = await verifyLatestBackupRestorable({backupRoot: probeRoot, logger: silent});

        expect(verdict.restorable).toBe(true);
        expect(verdict.code).toBe('RESTORABLE');
        expect(verdict.bundleRoot).toContain('backup-2026-10-01T00-00-00');
        expect(verdict.skipped[0].code).toBe('BUNDLE_INVALID');
        expect(verdict.unverifiable).toBeUndefined();
    });

    test('an unrecognised validator failure fails CLOSED — the classifier is an allowlist', async () => {
        // A defect inside the validator raises a TypeError carrying no errno, matching no known
        // failure shape. A denylist of known IO codes would classify it as content-invalid and walk on;
        // the allowlist puts anything the validator did not deliberately raise on the safe side, so a
        // future code path nobody has thought about cannot silently become continue-eligible.
        writeValidBundle('backup-2026-11-01T00-00-00');
        writeValidBundle('backup-2026-11-02T00-00-00');

        const validateFn = async bundleRoot => {
            if (bundleRoot.includes('2026-11-02')) throw new TypeError('collectionOf is not a function');
            return {streamedCounts: {memories: 1}, embeddingAdvisories: []}
        };

        const verdict = await verifyLatestBackupRestorable({backupRoot: probeRoot, logger: silent, validateFn});

        expect(verdict.restorable).toBe(false);
        expect(verdict.code).toBe('BUNDLE_UNVERIFIABLE');
        expect(verdict.unverifiable).toBe(true);
        expect(verdict.errorCode).toBeNull();   // no syscall errno — and still fails closed
    });

    test('PRODUCTION PATH: a real IO failure inside the validator fails closed, not just the injected seam', async () => {
        // The second half of the same finding. The first fix classified errors AFTER they reached
        // `probeBundle`, but the real `validateBundle` wrapped `fs.readJson` — read AND parse — in one
        // try and relabelled the result a content error, so an unreadable receipt was already
        // `BUNDLE_INVALID` before the new classifier ever saw it. Injected-seam coverage cannot catch
        // that: it bypasses the very code that erases the cause.
        //
        // The witness is a DIRECTORY where `bundle-meta.json` belongs, which yields a genuine EISDIR
        // from the real validator on every platform. `chmod 000` was the obvious choice and is the
        // wrong one — root ignores permission bits, so on a root CI image it would quietly stop
        // testing anything while still reporting green.
        writeValidBundle('backup-2027-01-01T00-00-00');

        const newest = writeValidBundle('backup-2027-01-02T00-00-00');
        fs.mkdirSync(path.join(newest, 'bundle-meta.json'));

        const verdict = await verifyLatestBackupRestorable({backupRoot: probeRoot, logger: silent});

        expect(verdict.restorable).toBe(false);
        expect(verdict.code).toBe('BUNDLE_UNVERIFIABLE');
        expect(verdict.bundleRoot).toContain('backup-2027-01-02T00-00-00');
        expect(verdict.examined).toBe(1);            // the older bundle was never consulted
        expect(verdict.unverifiable).toBe(true);
        expect(verdict.errorCode).toBe('EISDIR');    // the cause survived, rather than being relabelled
    });

    test('PRODUCTION PATH positive control: malformed metadata is still CONTENT and still falls through', async () => {
        // Shares the property under test with the case above — the newest bundle's `bundle-meta.json`
        // is unusable and the failure surfaces from the real validator — and differs only in that this
        // one is a parse failure rather than an IO failure. Without it, splitting the read from the
        // parse could have been "fixed" by making every metadata problem unverifiable, which would
        // silently reinstate the newest-only behaviour this PR exists to remove.
        writeValidBundle('backup-2027-02-01T00-00-00');

        const newest = writeValidBundle('backup-2027-02-02T00-00-00');
        fs.writeFileSync(path.join(newest, 'bundle-meta.json'), '{NOT VALID JSON');

        const verdict = await verifyLatestBackupRestorable({backupRoot: probeRoot, logger: silent});

        expect(verdict.restorable).toBe(true);
        expect(verdict.code).toBe('RESTORABLE');
        expect(verdict.bundleRoot).toContain('backup-2027-02-01T00-00-00');
        expect(verdict.skipped[0].code).toBe('BUNDLE_INVALID');
    });

    test('a genuinely MISSING required subdirectory is content, but an unreadable one is not', async () => {
        // `fs.pathExists` resolves false for ANY failure, so "required subdirectory missing" was a
        // content verdict derived from a boolean that cannot tell absence from inaccessibility. Only
        // a proven ENOENT may claim absence; everything else propagates. Both directions asserted,
        // because fixing one alone flips the defect rather than removing it.
        writeValidBundle('backup-2027-03-01T00-00-00');

        const newest = writeValidBundle('backup-2027-03-02T00-00-00');
        fsExtra.removeSync(path.join(newest, 'kb'));

        const missing = await verifyLatestBackupRestorable({backupRoot: probeRoot, logger: silent});

        expect(missing.restorable).toBe(true);                                  // proven absent = content
        expect(missing.bundleRoot).toContain('backup-2027-03-01T00-00-00');
        expect(missing.skipped[0].code).toBe('BUNDLE_INVALID');
    });

    test('stopping on an unverifiable candidate is announced, not silent', async () => {
        // The operator has to learn that older bundles were deliberately NOT considered. Silence here
        // reads identically to "nothing older exists", which is the confusion this whole lane is about.
        writeValidBundle('backup-2026-12-01T00-00-00');
        writeValidBundle('backup-2026-12-02T00-00-00');

        const warnings   = [];
        const logger     = {log: () => {}, error: () => {}, warn: message => warnings.push(message)};
        const validateFn = async bundleRoot => {
            if (bundleRoot.includes('2026-12-02')) {
                throw Object.assign(new Error('EIO: i/o error'), {code: 'EIO'});
            }
            return {streamedCounts: {memories: 1}, embeddingAdvisories: []}
        };

        await verifyLatestBackupRestorable({backupRoot: probeRoot, logger, validateFn});

        const joined = warnings.join('\n');
        expect(joined).toMatch(/STOPPING at backup-2026-12-02T00-00-00/);
        expect(joined).toMatch(/Older bundles were NOT considered/);
    });
});
