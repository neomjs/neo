import {execFile}     from 'child_process';
import fs             from 'fs-extra';
import os             from 'os';
import path           from 'path';
import {promisify}    from 'util';
import {test, expect} from '@playwright/test';

import Neo                                   from '../../../../../../src/Neo.mjs';
import * as core                             from '../../../../../../src/core/_export.mjs';
import {auditChromaVectorCoverage}           from '../../../../../../ai/scripts/maintenance/checkChromaIntegrity.mjs';
import {buildDataIntegrityCoverageDiagnosis} from '../../../../../../ai/daemons/orchestrator/services/dataIntegrityCoverageDiagnosis.mjs';
import {RecoveryActuatorService}             from '../../../../../../ai/daemons/orchestrator/services/RecoveryActuatorService.mjs';
import {TIER1_DEFAULTS}                      from '../../../../fixtures/aiConfigDefaults.mjs';

const execFileAsync = promisify(execFile);

/*
 * v13.1 release gate — the keystone integration proof for the Agent OS data-integrity immune system.
 *
 * The component layers each ship on their own (the coverage-drift detect-producer, the escalate
 * sink, the recovery actuator, the atomic-write invariant, the test write-guard, …). None of them
 * proves the layers COMPOSE into the demonstrable release bar. This spec is that proof — the
 * v13.1 definition-of-done:
 *
 *   a corruption injected in test  →  auto-DETECTED  →  DIAGNOSED  →  RECOVERED-or-ESCALATED
 *   end-to-end — never discovered weeks later by a failed backup (the corruption-incident failure mode).
 *
 * It drives the REAL pipeline against a REAL injected corruption (an isolated Chroma SQLite via
 * fs.mkdtemp — never touches live data), rather than hand-built fixtures, so it falsifies the
 * "all subs green, nothing proven" trap:
 *
 *   inject (metadata-without-vector — the corruption-incident shape)
 *     → auditChromaVectorCoverage            (DETECT: the immune system SEES a store that is "up
 *                                             but data-gutted" — the container-health blind spot that
 *                                             let the incident hide for ~weeks while the container kept
 *                                             reporting green)
 *     → buildDataIntegrityCoverageDiagnosis  (DIAGNOSE: a data-integrity / escalate recovery-diagnosis)
 *     → RecoveryActuatorService.escalateDiagnosis
 *                                            (ESCALATE: page the operator — the SAFE recovery action
 *                                             for data-integrity. The immune system does NOT auto-repair
 *                                             data; data mutation stays operator-gated — the detect/act
 *                                             two-worlds boundary. "Never silent-green.")
 *
 * When this gate is green, the release gate's end-to-end integration clause is met.
 *
 * @see https://github.com/neomjs/neo/issues/14046
 * @see https://github.com/neomjs/neo/issues/14039
 */

const OBSERVED_AT  = 1_750_000_000_000,
      METADATA_IDS = ['mem-1', 'mem-2', 'mem-3'];

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
 * @summary Constructs a RecoveryActuatorService with capturing mocks (mirrors the createService
 * harness in `RecoveryActuatorService.spec.mjs`). The page dispatcher, runtime-access, and
 * supervisor calls are captured so the gate can assert that escalation pages but mutates nothing.
 */
function createRecoveryActuator(tmpDir) {
    const pageCalls       = [],
          runtimeCalls    = [],
          supervisorCalls = [],
          taskOutcomes    = [],
          service         = Neo.create(RecoveryActuatorService, {
              actuatorConfig: {
                  ...TIER1_DEFAULTS.orchestrator.recoveryActuator,
                  healAttemptsPath   : path.join(tmpDir, 'heal-attempts.json'),
                  recoveryRunStateDir: path.join(tmpDir, 'recovery-runs'),
                  baseBackoffMs      : 0,
                  maxBackoffMs       : 0
              },
              dataDir      : tmpDir,
              healthService: {
                  recordTaskOutcome(taskName, status, details) {
                      taskOutcomes.push({taskName, status, details});
                  }
              },
              deploymentRuntimeAccessService: {
                  runtimeAccessConfig: {allowedServices: ['chroma', 'kb-server', 'mc-server', 'local-model']},
                  async applyLifecycle(options) {
                      runtimeCalls.push(options);
                      return {ok: true, statusCode: 204};
                  }
              },
              processSupervisorService: {
                  taskDefinitions: {},
                  killTask(taskName, reason) {
                      supervisorCalls.push({taskName, reason});
                  }
              },
              pageDispatcher(page) {
                  pageCalls.push(page);
              },
              async providerResidencyRepair() {
                  return {ready: true};
              },
              writeLog: () => {}
          });

    return {service, pageCalls, runtimeCalls, supervisorCalls, taskOutcomes};
}

test.describe('v13.1 release gate — corruption injection → detect → diagnose → escalate', () => {
    test('injected vector-loss corruption is DETECTED, DIAGNOSED (data-integrity), and ESCALATED — never silently auto-repaired', async () => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-corruption-gate-'));

        try {
            // 1. INJECT — the "up but data-gutted" shape: metadata rows present, vectors absent.
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
            expect(drifted.missingFromVectorCount).toBeGreaterThan(0);
            expect(coverageResult.failedCollections).toBeGreaterThanOrEqual(1);

            // 3. DIAGNOSE — the detect-producer turns the audit into a data-integrity / escalate diagnosis.
            const diagnosis = buildDataIntegrityCoverageDiagnosis({
                coverageResult,
                observedAt: OBSERVED_AT,
                serviceId : 'memory-core'
            });

            expect(diagnosis).toMatchObject({
                diagnosisId   : `data-integrity:memory-core:coverage-drift:${OBSERVED_AT}`,
                type          : 'recovery-diagnosis',
                recoveryClass : 'data-integrity',
                targetIdentity: {kind: 'compose-service', id: 'memory-core'},
                details       : {actionClass: 'escalate', reasonCode: 'data-integrity-coverage-drift'}
            });
            expect(diagnosis.details.driftedCollections).toContain('neo-agent-memory');

            // 4. ESCALATE — the SAFE recovery action for data-integrity: page the operator, mutate NOTHING.
            const {service, pageCalls, runtimeCalls, supervisorCalls, taskOutcomes} = createRecoveryActuator(tmpDir);

            let executedPrivilegedAction = false;

            service.executeTargetAction = async () => {
                executedPrivilegedAction = true;
                throw new Error('the data-integrity gate must ESCALATE, never execute a privileged recovery action');
            };

            const outcome = await service.escalateDiagnosis(diagnosis, {
                now   : OBSERVED_AT,
                reason: 'v13.1-corruption-recovery-gate'
            });

            expect(outcome).toMatchObject({
                status        : 'escalated',
                reasonCode    : 'data-integrity-coverage-drift',
                targetIdentity: {kind: 'compose-service', id: 'memory-core'}
            });

            // The immune system escalated — it did NOT mutate data (the detect/act two-worlds boundary held).
            expect(executedPrivilegedAction).toBe(false);
            expect(runtimeCalls).toEqual([]);
            expect(supervisorCalls).toEqual([]);

            // A single operator page carrying the data-integrity diagnosis.
            expect(pageCalls).toHaveLength(1);
            expect(pageCalls[0]).toMatchObject({
                serviceKey        : 'memory-core',
                action            : 'escalate',
                targetIdentity    : {kind: 'compose-service', id: 'memory-core'},
                operatorPageTarget: 'AGENT:*'
            });
            expect(pageCalls[0].diagnosisEvent).toMatchObject({
                recoveryClass: 'data-integrity',
                details      : {actionClass: 'escalate'}
            });

            // The recovery-run ledger recorded the escalation (escalate-with-diagnosis, not silent-green).
            expect(taskOutcomes.some(outcome => outcome.details?.status === 'escalated')).toBe(true);
        } finally {
            await fs.remove(tmpDir);
        }
    });

    test('a clean store produces NO diagnosis and NO escalation (no false-positive immune response)', async () => {
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

            // Clean coverage → the producer returns null → there is nothing to escalate.
            const diagnosis = buildDataIntegrityCoverageDiagnosis({
                coverageResult,
                observedAt: OBSERVED_AT,
                serviceId : 'memory-core'
            });

            expect(diagnosis).toBeNull();
        } finally {
            await fs.remove(tmpDir);
        }
    });
});
