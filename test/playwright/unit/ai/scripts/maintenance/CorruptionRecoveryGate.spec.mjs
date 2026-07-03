import {execFile}     from 'child_process';
import fs             from 'fs-extra';
import os             from 'os';
import path           from 'path';
import {promisify}    from 'util';
import {test, expect} from '@playwright/test';

import Neo                                                                from '../../../../../../src/Neo.mjs';
import * as core                                                          from '../../../../../../src/core/_export.mjs';
import {auditChromaVectorCoverage}                                        from '../../../../../../ai/scripts/maintenance/checkChromaIntegrity.mjs';
import {isCollectionQuarantined, quarantineCollection, storeFenceTargets} from '../../../../../../ai/services/memory-core/helpers/quarantineStore.mjs';
import {classifyDataIntegrityMode}                                        from '../../../../../../ai/daemons/orchestrator/services/dataIntegrityModeClassifier.mjs';
import {createReEmbedMissingHeal,
        createReEmbedMissingHealOperation} from '../../../../../../ai/services/memory-core/helpers/reEmbedMissingHeal.mjs';
import DataRecoveryActuatorService from '../../../../../../ai/daemons/orchestrator/services/DataRecoveryActuatorService.mjs';
import {DEFAULT_DISPATCH_BOUNDS}   from '../../../../../../ai/services/memory-core/helpers/healActionDispatch.mjs';

const execFileAsync = promisify(execFile);

/*
 * v13.1 release gate — the keystone integration proof for the Agent OS data-integrity immune system.
 *
 * The component layers each ship on their own (the coverage-drift detect-producer, the mode classifier,
 * the autonomous data-recovery actuator, the re-embed-missing heal op, the atomic-write invariant, …).
 * None of them proves the layers COMPOSE into the demonstrable release bar. This spec is that proof — the
 * v13.1 definition-of-done:
 *
 *   a corruption injected in test  →  auto-DETECTED  →  DIAGNOSED  →  autonomously HEALED
 *   end-to-end, with NO human in the loop — never discovered weeks later by a failed backup, and never
 *   merely paged into an operatorless cloud. (This gate previously, wrongly, certified that escalate-and-
 *   page-the-operator flow — the smoke-detector-not-fire-extinguisher anti-pattern the escalate-deletion removed. Its
 *   green meant the system did NOT heal. This is the corrected proof: the extinguisher fires.)
 *
 * It drives the REAL pipeline against a REAL injected corruption (an isolated Chroma SQLite via
 * fs.mkdtemp — never touches live data), rather than hand-built fixtures, so it falsifies the
 * "all subs green, nothing proven" trap:
 *
 *   inject (metadata + document persisted, vector absent — the corruption-incident shape)
 *     → auditChromaVectorCoverage      (DETECT: the immune system SEES a store "up but data-gutted" —
 *                                       the container-health blind spot that hid the incident for ~weeks)
 *     → classifyDataIntegrityMode      (DIAGNOSE: wal-stall — documents survive → lossless re-embed; the
 *                                       terminal is AUTONOMOUS, never an escalate/operator-page outcome)
 *     → DataRecoveryActuatorService.applyHeal({action: 're-embed-missing'})
 *                                      (HEAL: the ACT — re-embed the orphaned rows from their surviving
 *                                       documents and upsert the recovered vectors in place. No operator,
 *                                       no page: a cloud deployment has no human to gate.)
 *
 * The embedding provider is stubbed (a deterministic same-dimension vector) so the gate proves the
 * PIPELINE, not the provider; the real op still audits → re-embeds → write-invariant-gates → upserts.
 *
 * @see https://github.com/neomjs/neo/issues/14046
 * @see https://github.com/neomjs/neo/issues/14039
 * @see https://github.com/neomjs/neo/issues/14134
 */

const OBSERVED_AT          = 1_750_000_000_000,
      METADATA_IDS         = ['mem-1', 'mem-2', 'mem-3'],
      DETERMINISTIC_VECTOR = [0.10, 0.20, 0.30, 0.40];

/**
 * @summary Writes a minimal Chroma HNSW `index_metadata.pickle` (id → label map) so an audit reads
 * the segment as having persisted vectors. Mirrors the proven injection in `CheckChromaIntegrity.spec.mjs`.
 */
async function writeVectorIndexPickle(pickleDir, ids) {
    await fs.ensureDir(pickleDir);

    const pickleScript = [
        'import json, pickle, sys',
        'ids = json.loads(sys.argv[2])',
        'data = {"id_to_label": {id_: index for index, id_ in enumerate(ids)}}',
        'with open(sys.argv[1], "wb") as handle:',
        '    pickle.dump(data, handle)'
    ].join('\n');

    await execFileAsync('python3', ['-c', pickleScript, path.join(pickleDir, 'index_metadata.pickle'), JSON.stringify(ids)]);
}

/**
 * @summary Builds an isolated Memory Core Chroma snapshot for `auditChromaVectorCoverage`.
 *
 * A single `neo-agent-memory` collection with METADATA rows for every id in {@link METADATA_IDS}
 * and a VECTOR segment. When `writeVectorPickle` is false the segment's HNSW pickle is OMITTED —
 * the corruption-incident "metadata persisted, vectors absent" shape. When true the pickle covers
 * exactly the metadata ids — a clean store.
 *
 * @returns {String} The chroma.sqlite3 snapshot path.
 */
async function injectMemoryCoreSnapshot(tmpDir, {writeVectorPickle}) {
    const sqlitePath = path.join(tmpDir, 'chroma.sqlite3');

    await execFileAsync('sqlite3', [sqlitePath, `
        create table collections (
            id text primary key,
            name text not null,
            dimension integer,
            database_id text not null
        );
        create table segments (
            id text primary key,
            type text not null,
            scope text not null,
            collection text not null
        );
        create table embeddings (
            id integer primary key,
            segment_id text not null,
            embedding_id text not null,
            seq_id blob not null,
            created_at timestamp not null default current_timestamp,
            unique(segment_id, embedding_id)
        );
        insert into collections (id, name, dimension, database_id) values
            ('collection-a', 'neo-agent-memory', 4096, 'db-a');
        insert into segments (id, type, scope, collection) values
            ('meta-a', 'urn:chroma:segment/metadata/sqlite', 'METADATA', 'collection-a'),
            ('vec-a',  'urn:chroma:segment/vector/hnsw-local-persisted', 'VECTOR', 'collection-a');
        insert into embeddings (segment_id, embedding_id, seq_id) values
            ('meta-a', 'mem-1', x'01'),
            ('meta-a', 'mem-2', x'02'),
            ('meta-a', 'mem-3', x'03');
    `]);

    // The vector pickle lives at ${persistDir}/${vectorSegmentId}/index_metadata.pickle.
    // Omitting it = the vectors are gone while the metadata/doc rows remain (the gutted-store shape).
    if (writeVectorPickle) {
        await writeVectorIndexPickle(path.join(tmpDir, 'vec-a'), METADATA_IDS);
    }

    return sqlitePath;
}

/**
 * @summary A minimal recording Chroma collection double (mirrors `reEmbedMissingHeal.spec.mjs`): `.get`
 * returns documents/metadatas for ids whose metadata row still materializes (the surviving WAL-stall
 * documents), and `.upsert` records the recovered-vector writes so the gate can assert the ACT fired in
 * place. The heal needs a collection HANDLE; the file-level audit (DETECT) only reads the snapshot, so the
 * handle is modelled here, seeded with the same gutted rows the snapshot carries.
 */
function mockCollection(docsById = {}) {
    const upserts = [];

    return {
        name: 'neo-agent-memory',
        upserts,
        async get({ids}) {
            const result = {ids: [], documents: [], metadatas: []};

            for (const id of ids) {
                if (Object.hasOwn(docsById, id)) {
                    result.ids.push(id);
                    result.documents.push(docsById[id].document);
                    result.metadatas.push(docsById[id].metadata ?? {});
                }
            }

            return result;
        },
        async upsert(payload) {
            upserts.push(payload);
        }
    };
}

test.describe('v13.1 release gate — corruption injection → detect → diagnose → autonomous HEAL', () => {
    test('injected vector-loss / drain-stall coverage shape is DETECTED, DIAGNOSED (wal-stall), and autonomously HEALED — re-embedded in place, never paged', async () => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-corruption-gate-'));

        try {
            // 1. INJECT — the "up but data-gutted" shape: metadata + documents present, vectors absent.
            //    This is the drain-stall disposition at the recovery-gate layer: once the stalled deferred-embed
            //    drain leaves persisted rows without vectors, the coverage audit is deliberately provenance-blind
            //    and the same wal-stall → re-embed-missing gate is the recovery proof.
            const snapshotPath = await injectMemoryCoreSnapshot(tmpDir, {writeVectorPickle: false});

            // 2. DETECT — the audit SEES the gutted store (the container-health blind spot, closed).
            const coverageResult = await auditChromaVectorCoverage({
                snapshotPath,
                persistDir     : tmpDir,
                collectionNames: ['neo-agent-memory'],
                sampleSize     : 2,
                includeFullIds : true
            });

            const drifted = coverageResult.collections.find(collection => collection.name === 'neo-agent-memory');

            expect(drifted.ok).toBe(false);
            expect(drifted.missingFromVectorCount).toBeGreaterThan(0);   // the audit sees the gutted rows
            expect(coverageResult.failedCollections).toBeGreaterThanOrEqual(1);

            // 3. DIAGNOSE — the classifier routes wal-stall → re-embed-missing: AUTONOMOUS, never escalate.
            //    The documents survive (the WAL-stall shape), so the coverage gap is losslessly re-embeddable.
            const decision = classifyDataIntegrityMode({
                collection            : 'neo-agent-memory',
                rowCount              : METADATA_IDS.length,
                missingFromVectorCount: drifted.missingFromVectorCount,
                documentsPresentCount : drifted.missingFromVectorCount
            });

            expect(decision).toMatchObject({mode: 'wal-stall', terminalAction: 're-embed-missing', autonomous: true});

            // 4. HEAL — the autonomous data actuator RE-EMBEDS the orphaned rows (defer becomes act).
            //    The actuator's anti-thrash gate keys on the collection NAME; the runtime adapter resolves
            //    that name → the live handle (cross-store-guarded) + re-audits the absent ids, then delegates
            //    to the pure op. A stub embedFn supplies the deterministic vector (no live provider); the real
            //    op write-invariant-gates each recovered row before upserting it back in place.
            const collection = mockCollection({
                'mem-1': {document: 'surviving document for mem-1', metadata: {kind: 'turn'}},
                'mem-2': {document: 'surviving document for mem-2', metadata: {kind: 'turn'}},
                'mem-3': {document: 'surviving document for mem-3', metadata: {kind: 'turn'}}
            });

            const reEmbedMissing = createReEmbedMissingHeal({
                embedFn          : async documents => documents.map(() => DETERMINISTIC_VECTOR.slice()),
                auditCoverage    : async ({evidence}) => ({missingVectorIds: evidence.missingVectorIds}),
                expectedDimension: DETERMINISTIC_VECTOR.length
            });

            const healOperation = createReEmbedMissingHealOperation({
                reEmbedMissing,
                getMemoryCollection    : async () => collection,
                resolveMissingVectorIds: async () => [...METADATA_IDS]
            });

            const actuator = Neo.create(DataRecoveryActuatorService, {
                healOperations  : {[decision.terminalAction]: healOperation},
                recordRun       : async () => {},      // anti-thrash recorder (required for a mutating heal)
                recentRunsReader: async () => []        // no prior runs → within the dispatch envelope
            });

            const outcome = await actuator.applyHeal({
                action    : decision.terminalAction,
                collection: 'neo-agent-memory',   // the NAME — the anti-thrash key + cross-store guard
                evidence  : {missingVectorIds: [...METADATA_IDS]},
                now       : OBSERVED_AT
            });

            // 5. HEALED — the ACT fired: every orphaned row was re-embedded and written back in place.
            expect(outcome.status).toBe('healed');
            expect(outcome.detail.reEmbedded).toBe(METADATA_IDS.length);
            expect(outcome.detail.rejected.count).toBe(0);
            expect(collection.upserts).toHaveLength(1);
            expect(collection.upserts[0].ids.slice().sort()).toEqual([...METADATA_IDS].sort());

            // 6. NO operator page, NO escalate — the terminal is an autonomous heal, not a page-into-the-void
            //    (the model shift the escalate-deletion made: a cloud deployment has no operator to escalate to).
            expect(decision.terminalAction).not.toBe('escalate');
            expect(outcome.status).not.toBe('escalated');
        } finally {
            await fs.remove(tmpDir);
        }
    });

    test('count-regression is DIAGNOSED (count-loss) and autonomously QUARANTINED — fenced from serving, never paged', async () => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-corruption-gate-quarantine-'));

        try {
            const COLLECTION = 'neo-agent-memory';

            // DIAGNOSE — a regressed row count is NOT row-level repairable (the data already left, nothing to
            // re-embed from) → quarantine, the safe-default autonomous terminal. Never re-embed, never escalate.
            const decision = classifyDataIntegrityMode({collection: COLLECTION, countRegressed: true});
            expect(decision).toMatchObject({mode: 'count-loss', terminalAction: 'quarantine', autonomous: true});

            // HEAL — the autonomous actuator FENCES the collection from similarity-serving (the real quarantine
            // op writes the durable fence). quarantine is non-mutating containment, so it needs no recordRun.
            const actuator = Neo.create(DataRecoveryActuatorService, {
                healOperations: {
                    quarantine: async ({collection}) => {
                        await quarantineCollection(collection, {dir: tmpDir, reason: decision.mode, now: OBSERVED_AT});
                        return {status: 'quarantined', detail: {collection}};
                    }
                },
                recentRunsReader: async () => []
            });

            const outcome = await actuator.applyHeal({
                action    : decision.terminalAction,
                collection: COLLECTION,
                evidence  : {mode: decision.mode},
                now       : OBSERVED_AT
            });

            // QUARANTINED — the ACT fired: the collection is fenced. queryMemories / querySummaries read this
            // fence and fail-fast to empty (proven at the unit level in quarantineStore.spec + the guard inserts),
            // so a known-corrupt index is never served while it awaits repair.
            expect(outcome.status).toBe('quarantined');
            expect(await isCollectionQuarantined(COLLECTION, {dir: tmpDir})).toBe(true);

            // No operator page, no escalate — an autonomous containment terminal, never a page-into-the-void.
            expect(decision.terminalAction).not.toBe('escalate');
            expect(outcome.status).not.toBe('escalated');
        } finally {
            await fs.remove(tmpDir);
        }
    });

    test('store-level sqlite-integrity → quarantine fences EVERY served collection, not the unguarded service id', async () => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-corruption-gate-sqlite-'));

        try {
            // The store-expansion contract (storeFenceTargets): a store-level service id fences ALL served
            // collections; a served-collection target fences exactly itself.
            const SERVED = ['neo-agent-memory', 'neo-agent-summary'];
            expect(storeFenceTargets('mc-server',        SERVED)).toEqual(SERVED);
            expect(storeFenceTargets('neo-agent-memory', SERVED)).toEqual(['neo-agent-memory']);

            // DIAGNOSE — a store-level SQLite-integrity failure is keyed by the service id (NOT a served
            // collection) and routes to quarantine (non-losslessly recoverable).
            const SERVICE_ID = 'mc-server',
                  decision   = classifyDataIntegrityMode({collection: SERVICE_ID, sqliteIntegrityOk: false});
            expect(decision).toMatchObject({terminalAction: 'quarantine', autonomous: true});

            // HEAL — the real op expands the store-level target to EVERY served collection. Fencing only the
            // service id (the pre-fix bug) would leave a fence NO query guard observes.
            const actuator = Neo.create(DataRecoveryActuatorService, {
                healOperations: {
                    quarantine: async ({collection}) => {
                        const targets = storeFenceTargets(collection, SERVED);
                        for (const target of targets) {
                            await quarantineCollection(target, {dir: tmpDir, reason: decision.mode, now: OBSERVED_AT});
                        }
                        return {status: 'quarantined', detail: {collection, fenced: targets}};
                    }
                },
                recentRunsReader: async () => []
            });

            const outcome = await actuator.applyHeal({
                action    : decision.terminalAction,
                collection: SERVICE_ID,
                evidence  : {mode: decision.mode},
                now       : OBSERVED_AT
            });

            expect(outcome.status).toBe('quarantined');
            // the service id is NOT a served collection → fencing it alone is invisible to the guards
            expect(await isCollectionQuarantined(SERVICE_ID,         {dir: tmpDir})).toBe(false);
            // BOTH served collections ARE fenced → queryMemories / querySummaries observe it
            expect(await isCollectionQuarantined('neo-agent-memory',  {dir: tmpDir})).toBe(true);
            expect(await isCollectionQuarantined('neo-agent-summary', {dir: tmpDir})).toBe(true);
        } finally {
            await fs.remove(tmpDir);
        }
    });

    test('a clean store produces NO diagnosis and NO action (no false-positive immune response)', async () => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-corruption-gate-clean-'));

        try {
            const snapshotPath = await injectMemoryCoreSnapshot(tmpDir, {writeVectorPickle: true});

            const coverageResult = await auditChromaVectorCoverage({
                snapshotPath,
                persistDir     : tmpDir,
                collectionNames: ['neo-agent-memory'],
                sampleSize     : 2,
                includeFullIds : true
            });

            const collection = coverageResult.collections.find(collection => collection.name === 'neo-agent-memory');

            expect(collection.ok).toBe(true);
            expect(collection.missingFromVectorCount).toBe(0);
            expect(collection.extraInVectorCount).toBe(0);

            // Clean coverage → the classifier yields `clean` / `none` → no action (no false-positive heal).
            const decision = classifyDataIntegrityMode({
                collection            : 'neo-agent-memory',
                rowCount              : METADATA_IDS.length,
                missingFromVectorCount: collection.missingFromVectorCount,
                documentsPresentCount : 0
            });

            expect(decision).toMatchObject({mode: 'clean', terminalAction: 'none', autonomous: true});
        } finally {
            await fs.remove(tmpDir);
        }
    });
});

/*
 * v13.1 release gate — the self-heal SOAK proof: the single-shot gate above proves ONE corruption
 * heals; this proves the immune system survives SUSTAINED operation — the "runs autonomously for weeks (~95%)"
 * bar. It drives N inject→detect→diagnose→HEAL cycles on an accelerated clock through the REAL `applyHeal`
 * dispatch (default bounds: 3 mutating runs / hour, 10-min cooldown), threading the anti-thrash ledger across
 * cycles, and asserts the three failure modes a single shot cannot surface:
 *   - CONVERGENCE     — every cycle resolves to a terminal (healed OR anti-thrash-contained), never stuck/escalate.
 *   - NO HOT-LOOP     — under continuous re-injection the executed heals are BOUNDED by the rate/cooldown gate
 *                       (they do NOT grow 1:1 with the cycle count); the anti-thrash demonstrably engages.
 *   - BOUNDED STATE   — the active anti-thrash working set (the windowed recentRuns) stays ≤ the per-window cap
 *                       across the whole run; old attempts age out, so it never grows with the cycle count.
 * Reuses the proven injector + pipeline above — no parallel harness.
 */
test.describe('v13.1 release gate — self-heal SOAK: N corruption+heal cycles survive sustained operation (#14165)', () => {
    test('N accelerated cycles converge, never hot-loop, and keep the anti-thrash working set bounded', async () => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-corruption-soak-'));

        try {
            const CYCLES = 24,             // weeks in miniature
                  CYCLE_STEP_MS = 12 * 60 * 1000, // 12 min/cycle on the accelerated clock (> the 10-min cooldown)
                  WINDOW_MS     = 3600000,        // mirror DEFAULT_DISPATCH_BOUNDS.windowMs (the anti-thrash window)
                  ledger        = [];             // the heal-event ledger — append-only attempt log; the recentRuns source

            let healCount     = 0,
                deferCount    = 0,
                maxRecentRuns = 0;

            // The recentRuns projection: executed-attempt rows for this collection within the anti-thrash window.
            const recentRunsAt = now => ledger
                .filter(entry => entry.collection === 'neo-agent-memory' && now - entry.at < WINDOW_MS)
                .map(entry => ({action: entry.action, collection: entry.collection, at: entry.at}));

            for (let cycle = 0; cycle < CYCLES; cycle++) {
                const now = OBSERVED_AT + cycle * CYCLE_STEP_MS;

                // INJECT — the vector-loss (wal-stall) shape into a FRESH per-cycle store = sustained corruption pressure.
                const cycleDir = path.join(tmpDir, `cycle-${cycle}`);
                await fs.ensureDir(cycleDir);
                const snapshotPath = await injectMemoryCoreSnapshot(cycleDir, {writeVectorPickle: false});

                // DETECT + DIAGNOSE (the proven pipeline).
                const coverageResult = await auditChromaVectorCoverage({
                    snapshotPath, persistDir: cycleDir, collectionNames: ['neo-agent-memory'], sampleSize: 2, includeFullIds: true
                });
                const drifted = coverageResult.collections.find(collection => collection.name === 'neo-agent-memory');
                expect(drifted.ok).toBe(false); // every cycle's injection is seen — the detect never goes blind

                const decision = classifyDataIntegrityMode({
                    collection            : 'neo-agent-memory', rowCount: METADATA_IDS.length,
                    missingFromVectorCount: drifted.missingFromVectorCount, documentsPresentCount: drifted.missingFromVectorCount
                });
                expect(decision).toMatchObject({mode: 'wal-stall', terminalAction: 're-embed-missing', autonomous: true});

                const collection = mockCollection(Object.fromEntries(
                    METADATA_IDS.map(id => [id, {document: `surviving document for ${id} (cycle ${cycle})`, metadata: {kind: 'turn'}}])
                ));
                const reEmbedMissing = createReEmbedMissingHeal({
                    embedFn          : async documents => documents.map(() => DETERMINISTIC_VECTOR.slice()),
                    auditCoverage    : async ({evidence}) => ({missingVectorIds: evidence.missingVectorIds}),
                    expectedDimension: DETERMINISTIC_VECTOR.length
                });
                const healOperation = createReEmbedMissingHealOperation({
                    reEmbedMissing, getMemoryCollection: async () => collection, resolveMissingVectorIds: async () => [...METADATA_IDS]
                });

                maxRecentRuns = Math.max(maxRecentRuns, recentRunsAt(now).length);

                // HEAL — the REAL dispatch with the accumulating anti-thrash state (recordRun appends only on execute).
                const actuator = Neo.create(DataRecoveryActuatorService, {
                    healOperations  : {[decision.terminalAction]: healOperation},
                    recordRun       : async ({action, collection, at}) => { ledger.push({action, collection, at}); },
                    recentRunsReader: async () => recentRunsAt(now)
                });

                const outcome = await actuator.applyHeal({
                    action  : decision.terminalAction, collection: 'neo-agent-memory',
                    evidence: {missingVectorIds: [...METADATA_IDS]}, now
                });

                // CONVERGENCE — a terminal every cycle, never stuck/escalate/paged.
                expect(['healed', 'rate-limited', 'thrash-cooldown', 'deferred']).toContain(outcome.status);
                expect(outcome.status).not.toBe('escalated');

                if (outcome.status === 'healed') healCount++; else deferCount++;
            }

            // CONVERGENCE — every cycle accounted for (no stuck / errored cycle).
            expect(healCount + deferCount).toBe(CYCLES);

            // NO HOT-LOOP — the anti-thrash demonstrably engaged (some cycles deferred) AND the system still
            // healed (it is not wedged shut); the executed heals are strictly fewer than the cycles.
            expect(healCount).toBeGreaterThan(0);
            expect(deferCount).toBeGreaterThan(0);
            expect(healCount).toBeLessThan(CYCLES);

            // BOUNDED STATE — the active anti-thrash working set never exceeds the per-window cap across the run
            // (old attempts age out of the window on the accelerated clock — no monotonic growth with cycle count).
            expect(maxRecentRuns).toBeLessThanOrEqual(DEFAULT_DISPATCH_BOUNDS.maxRunsPerWindow);
        } finally {
            await fs.remove(tmpDir);
        }
    });
});
