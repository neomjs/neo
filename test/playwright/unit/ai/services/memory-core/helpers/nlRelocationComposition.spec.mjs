import {test, expect} from '@playwright/test';
import {spawnSync}    from 'node:child_process';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';

/**
 * @summary Composition proof for the Neural Link data relocation: what the container ADMITS is what the
 * container's own consumer can READ.
 *
 * **This suite exists because the two halves were shipped separately and did not meet.** The relocation
 * moved the telemetry writer from a host `nl_action_log` table to `nl-action-telemetry` graph nodes, while
 * `GapInferenceEngine.inferNlActionDigest` went on reading the table. Nothing went red: the reader probed
 * `sqlite_master`, found no table, and returned its clean-degradation answer, so a permanently dead digest
 * looked exactly like a quiet week. Unit arms on either side stayed green throughout — each half was
 * correct about itself. Only a composition arm can fail here, so this is the one that has to exist.
 *
 * **A real store, not a stub.** The digest reads its rows with `json_extract` over the `Nodes` table, so a
 * stubbed `upsertNode` would prove the helpers were called and nothing about whether the shapes meet.
 *
 * A child process, because `NEO_MEMORY_DB_PATH` is bound when the graph module loads and the suite must
 * point it at a disposable file rather than a developer's real graph.
 */
test.describe('NL relocation — admission and digest meet in the container graph', () => {
    const rootDir = path.resolve(import.meta.dirname, '../../../../../../../');

    /**
     * Admits telemetry and an archive into a throwaway graph, then reads both back.
     * @returns {Object} The child's observations.
     */
    function runComposition() {
        const
            dir    = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-nl-composition-')),
            rel    = file => JSON.stringify(path.join(rootDir, file)),
            script = `
                import Neo       from ${rel('src/Neo.mjs')};
                import * as core from ${rel('src/core/_export.mjs')};

                const {admitNlActions} = await import(${rel('ai/services/memory-core/helpers/nlActionTelemetryStore.mjs')});

                // THE WIRE, not a direct call. The store helper and the digest agreed with each other
                // while the SCHEMA between them silently dropped the correlation token, so a composition
                // that starts at the helper certifies a path production never takes. Everything below is
                // admitted through the operation's real compiled schema first.
                const YAML       = (await import('yaml')).default,
                      validator  = await import(${rel('ai/mcp/validation/openApiValidator.mjs')}),
                      fsMod      = await import('node:fs'),
                      openApiDoc = YAML.parse(fsMod.readFileSync(${rel('ai/mcp/server/memory-core/openapi.yaml')}, 'utf8'));

                let admitOperation = null;
                for (const [p, item] of Object.entries(openApiDoc.paths)) {
                    for (const [method, op] of Object.entries(item)) {
                        if (op.operationId === 'admit_nl_actions') admitOperation = {path: p, method, ...op};
                    }
                }

                const admitSchema = validator.buildZodSchema(openApiDoc, admitOperation),
                      overWire    = payload => admitSchema.parse(payload);
                const {
                    NL_TRANSACTION_ARCHIVE_NODE_TYPE, getNlTransactionArchiveNodeId,
                    saveNlTransaction, getNlTransaction, markNlTransactionReplayed
                } = await import(${rel('ai/services/memory-core/helpers/nlTransactionArchiveStore.mjs')});
                const {Memory_GraphService: GraphService} = await import(${rel('ai/services.mjs')});

                await GraphService.ready?.();

                const TOKEN_A = '11111111-1111-4111-8111-111111111111',
                      TOKEN_B = '22222222-2222-4222-8222-222222222222';

                const admit = admitNlActions(overWire({actions: [
                    {sequenceId: TOKEN_A, sessionId: 's1', timestamp: 5000, tool: 'create_component',
                     success: true, durationMs: 3, appName: 'App',
                     targets: {classNames: ['Neo.button.Base'], componentIds: ['btn-1']}},
                    {sequenceId: TOKEN_A, sessionId: 's1', timestamp: 5001, tool: 'set_instance_properties',
                     success: true, durationMs: 4, appName: 'App',
                     targets: {classNames: [], componentIds: ['btn-1']}},
                    {sequenceId: TOKEN_B, sessionId: 's1', timestamp: 5002, tool: 'create_component',
                     success: true, durationMs: 2, appName: 'App',
                     targets: {classNames: ['Neo.grid.Container'], componentIds: []}},
                    // The identity-shaped token the host must never send.
                    {sequenceId: 'agent-7_turn-2', sessionId: 's1', timestamp: 5003, tool: 'create_component',
                     success: true, durationMs: 1, appName: 'App', targets: {classNames: [], componentIds: []}}
                ]}));

                // Recorded separately so a failure names WHICH boundary lost the token. The schema
                // dropping it and the store refusing it produce the same admitted count, and only this
                // tells them apart.
                const wireKeys = Object.keys(overWire({actions: [{
                    sequenceId: TOKEN_A, sessionId: 's1', timestamp: 1, tool: 't',
                    success: true, durationMs: 1, appName: 'A', targets: {classNames: [], componentIds: []}
                }]}).actions[0]).sort();

                // ISOLATION CONTROL: a telemetry row that is NOT team-visible. Written through the same
                // GraphService the admission uses, so the only difference is the disposition itself.
                GraphService.upsertNode({
                    id        : 'nl-action-telemetry:private-other-tenant',
                    type      : 'nl-action-telemetry',
                    name      : 'create_component',
                    updatedAt : 5004,
                    properties: {
                        sequenceId: '33333333-3333-4333-8333-333333333333',
                        sessionId : 'other-tenant', timestamp: 5004, tool: 'create_component',
                        success   : true, durationMs: 1, appName: 'Other',
                        targets   : {classNames: [], componentIds: []}
                    }
                });

                const engine = (await import(${rel('ai/services/graph/GapInferenceEngine.mjs')})).default,
                      read   = engine.readNlActionRows({sinceTimestamp: 1000, sequenceLimit: 10}),
                      groups = read.status === 'ok'
                          ? [...engine.groupNlActionRowsBySequence(read.rows).entries()]
                                .map(([id, rows]) => [id, rows.length]).sort()
                          : null;

                const saved    = saveNlTransaction({appSessionId: 'app-1', name: 'spec', transaction: {
                          txId: 'tx-1', status: 'committed', committedAt: 4242,
                          originWriter: {agentId: 'a', sessionId: 's'},
                          ops: [{method: 'setConfigs', args: [{id: 'c1'}]}]
                      }}),
                      readBack = saved.saved ? getNlTransaction({archiveId: saved.archiveId}) : null,
                      replayed = saved.saved ? markNlTransactionReplayed({archiveId: saved.archiveId, now: 99}) : null,
                      afterMark = saved.saved ? getNlTransaction({archiveId: saved.archiveId}) : null;

                // A SUCCESSFUL read of a real graph that holds no such node — the only thing entitled to
                // be called not-found.
                const absent = getNlTransaction({archiveId: 'no-such-archive-anywhere'});

                // A stored record whose \`ops\` is NOT an array. This is the shape that makes the mark's
                // write dangerous: the read REBUILDS \`ops\` as [] for it, so a mark that writes the whole
                // read-back record replaces a real payload with an empty one. A well-formed archive cannot
                // expose that — spreading its own array back is harmless — so this is the only fixture
                // that can tell the two implementations apart.
                const legacyId   = 'legacy-shaped-archive',
                      legacyNode = getNlTransactionArchiveNodeId(legacyId);

                GraphService.upsertNode({
                    id        : legacyNode,
                    type      : NL_TRANSACTION_ARCHIVE_NODE_TYPE,
                    name      : legacyId,
                    updatedAt : 1,
                    properties: {archiveId: legacyId, ops: 'a-json-string-from-the-old-column', replayCount: 0}
                });

                const legacyMark = markNlTransactionReplayed({archiveId: legacyId, now: 101}),
                      legacyRaw  = GraphService.getNodeRecord({id: legacyNode});

                // UNREACHABLE, probed last because it breaks the reader for everything after it. Patching
                // the graph writer is the only way to produce a throw against a real, healthy graph, and a
                // throw is the case that used to be indistinguishable from absence.
                const realGetNodeRecord = GraphService.getNodeRecord;

                GraphService.getNodeRecord = () => { throw new Error('graph gone') };

                const unreachableRead = getNlTransaction({archiveId: saved.archiveId}),
                      unreachableMark = markNlTransactionReplayed({archiveId: saved.archiveId, now: 100});

                GraphService.getNodeRecord = realGetNodeRecord;

                // Read back through the raw store, NOT the digest: proves the control row exists and is
                // in-window, so the digest's silence about it is the predicate rather than an empty seed.
                const controlRow = GraphService.getNodeRecord({id: 'nl-action-telemetry:private-other-tenant'});

                process.stdout.write(JSON.stringify({
                    admit,
                    wireKeys,
                    controlRowPresent: Boolean(controlRow) && controlRow.properties?.timestamp === 5004,
                    readStatus  : read.status,
                    rowCount    : read.rows?.length ?? null,
                    groups,
                    firstRow    : read.rows?.[0] ?? null,
                    storedTokens: [...new Set((read.rows ?? []).map(row => row.sequence_id))].sort(),
                    archive     : {
                        saved      : saved.saved,
                        sourceTxId : readBack?.sourceTxId ?? null,
                        opCount    : saved.opCount ?? null,
                        committedAt: readBack?.committedAt ?? null,
                        ops        : readBack?.ops?.length ?? null,
                        updated    : replayed?.updated ?? null,
                        replayCount: afterMark?.replayCount ?? null
                    },
                    outcomes    : {
                        foundStatus      : readBack?.status ?? null,
                        absentStatus     : absent.status,
                        absentHasReason  : Object.hasOwn(absent, 'reason'),
                        unreachableStatus: unreachableRead.status,
                        unreachableNamed : String(unreachableRead.reason ?? '').startsWith('archive-store-unavailable'),
                        markStatus       : unreachableMark.status,
                        markUpdated      : unreachableMark.updated,
                        markCount        : replayed?.replayCount ?? null,
                        opsSurviveMark   : afterMark?.ops?.length ?? null,
                        legacyMarked     : legacyMark.updated,
                        legacyOpsType    : Array.isArray(legacyRaw?.properties?.ops)
                            ? 'array-the-mark-wrote'
                            : typeof legacyRaw?.properties?.ops,
                        legacyReplayCount: legacyRaw?.properties?.replayCount ?? null
                    }
                }));
            `,
            childEnv = {...process.env, NEO_MEMORY_DB_PATH: path.join(dir, 'graph.sqlite')};

        // The harness markers would resolve the shared test config; this child must own its graph file.
        delete childEnv.UNIT_TEST_MODE;
        delete childEnv.NEO_TEST_CONFIG_TEMPLATES;
        delete childEnv.NEO_MCP_REMOTE_TOKEN;

        const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
            cwd: rootDir, encoding: 'utf8', env: childEnv
        });

        try {
            return JSON.parse(result.stdout.trim().split('\n').pop())
        } catch {
            throw new Error(`composition child produced no result:\n${(result.stderr || '').split('\n').slice(-16).join('\n')}`)
        } finally {
            fs.rmSync(dir, {recursive: true, force: true})
        }
    }

    let out;

    test.beforeAll(() => {
        out = runComposition()
    });

    test('THE WIRE: the correlation token survives OpenAPI/Zod normalization', () => {
        // The boundary this suite originally skipped, and the one that was broken. Zod strips undeclared
        // keys, so an operation schema that never declares `sequenceId` silently deletes the token before
        // the handler sees it — and the handler then refuses every row for a value the wire removed.
        // Both halves stayed green because both were called directly. @neo-gpt-emmy found this by running
        // the compiler; the arm exists so nobody has to find it that way again.
        expect(out.wireKeys).toEqual([
            'appName', 'durationMs', 'sequenceId', 'sessionId', 'success', 'targets', 'timestamp', 'tool'
        ]);

        // Stated as its own assertion because it is the one key whose absence is silent: the batch still
        // parses, still dispatches, and still reports a count.
        expect(out.wireKeys).toContain('sequenceId');
    });

    test('every admitted row is readable by the digest, through the real store', () => {
        expect(out.admit.admitted).toBe(3);
        expect(out.readStatus).toBe('ok');

        // THE ARM THAT WAS MISSING. Three admitted, three read back — the writer and the reader agree
        // about where the rows live and what shape they are in.
        expect(out.rowCount).toBe(3);
    });

    test('the correlation token survives storage, so the digest still sees SEQUENCES', () => {
        // Two tokens, one carrying two actions. A per-row token would produce three groups of one here
        // and every success rate would be computed over a single action.
        expect(out.groups).toEqual([
            ['11111111-1111-4111-8111-111111111111', 2],
            ['22222222-2222-4222-8222-222222222222', 1]
        ]);
    });

    test('the row arrives in the shape the digest scores, targets included', () => {
        // `success` is stored as a boolean and read as 1/0, which is the column semantic it replaced —
        // `buildNlActionSequenceEvidence` compares `Number(row.success) === 1`, so a boolean here would
        // score every action as a failure and silently disqualify every sequence.
        expect(out.firstRow).toEqual({
            sequence_id: '11111111-1111-4111-8111-111111111111',
            session_id : 's1',
            timestamp  : 5000,
            tool       : 'create_component',
            success    : 1,
            duration_ms: 3,
            app_name   : 'App',
            targets    : {classNames: ['Neo.button.Base'], componentIds: ['btn-1']}
        });
    });

    test('ISOLATION: a telemetry row without the shared disposition is invisible to the digest', () => {
        // Two identities, one store. The admitted rows declare `visibility: 'team'`; the control row is
        // written through the same GraphService without it. A reader with no RLS predicate returns all
        // four sequences and looks perfectly healthy — which is exactly how a privacy hole ships.
        expect(out.storedTokens).not.toContain('33333333-3333-4333-8333-333333333333');

        // POSITIVE CONTROL: the control row IS in the store and IS within the lookback window, so its
        // absence above is the predicate working rather than the row never having been written.
        expect(out.controlRowPresent).toBe(true);
    });

    test('an identity-shaped token is refused, and never reaches the graph', () => {
        // Counted, not silent: a host that starts sending the wrong shape shows up as a refused batch.
        expect(out.admit.refused).toBe(1);

        // And the refusal is a property of the STORE, not of the projection — proven by reading back.
        expect(out.storedTokens).toEqual([
            '11111111-1111-4111-8111-111111111111',
            '22222222-2222-4222-8222-222222222222'
        ]);
    });

    test('#14829 archive semantics round-trip through the same graph', () => {
        // Provenance, op payload, commit stamp and replay-mark are the four things replay reconstructs
        // from; the relocation is only lossless if all four come back.
        expect(out.archive).toEqual({
            saved      : true,
            sourceTxId : 'tx-1',
            opCount    : 1,
            committedAt: 4242,
            ops        : 1,
            updated    : true,
            replayCount: 1
        });
    });

    test('the replay mark stays synchronous — the property that replaces the old atomic UPDATE', () => {
        // The old store incremented in ONE statement (`SET replay_count = replay_count + 1`), which read
        // and wrote the row itself. This is a read-modify-write over two `GraphService` calls, and the only
        // thing making it equivalent for concurrent marks is that BOTH halves are synchronous: no other JS
        // can run in the gap, so no increment can be lost. An `await` introduced between them would restore
        // the lost-update window silently — no test would red and no reviewer would see it in the diff.
        //
        // Source-shape, because the failure it guards is a FUTURE edit rather than current behaviour.
        // `async` is part of the pattern rather than assumed absent: the control below reads an
        // `export async function`, and an extractor that only matched the sync spelling would return null
        // there and quietly pass both `not.toContain` assertions above. It did, until the control failed.
        const bodyOf = (source, name) => {
                  const start = source.search(new RegExp('export (?:async )?function ' + name + '\\b'));

                  if (start < 0) return null;

                  const end = source.indexOf('\n}', start);

                  return end < 0 ? null : source.slice(start, end)
              },
              storeSource = fs.readFileSync(
                  path.join(rootDir, 'ai/services/memory-core/helpers/nlTransactionArchiveStore.mjs'), 'utf8'
              ),
              markBody    = bodyOf(storeSource, 'markNlTransactionReplayed');

        // The extractor found a real body — an empty slice would make every assertion below vacuous.
        expect(markBody).toContain('GraphService.upsertNode');
        expect(markBody).toContain('getNlTransaction(');
        expect(markBody).not.toContain('await');
        expect(markBody).not.toContain('async');

        // POSITIVE CONTROL: the same extractor over a function that genuinely awaits. Without it, a
        // `bodyOf` that silently returned a too-short slice would satisfy both `not.toContain` assertions
        // while checking nothing.
        const clientSource = fs.readFileSync(
                  path.join(rootDir, 'ai/services/neural-link/memoryCoreArchiveClient.mjs'), 'utf8'
              ),
              awaitingBody = bodyOf(clientSource, 'recordTransactionReplay');

        expect(awaitingBody).toContain('await');
        expect(bodyOf(storeSource, 'noSuchFunctionExists')).toBeNull()
    });

    test('absence and unreachability are distinguishable against a REAL graph', () => {
        // All four rows come from one live graph in one child process, which is what makes this a
        // discrimination rather than four independent fixtures agreeing with themselves: the same reader
        // answers `found`, `not-found` and `unavailable` depending only on the graph's actual state.
        expect(out.outcomes).toEqual({
            foundStatus : 'found',
            absentStatus: 'not-found',
            // Not-found carries NO reason — there is no failure to explain, and a reason here would invite
            // a caller to treat a plain absence as an error.
            absentHasReason  : false,
            unreachableStatus: 'unavailable',
            unreachableNamed : true,
            markStatus       : 'unavailable',
            markUpdated      : false,
            markCount        : 1,
            opsSurviveMark   : 1,
            // THE MARK MUST NOT DAMAGE WHAT IT MARKS, and `opsSurviveMark` above does NOT prove that —
            // measured, not assumed: restoring the old whole-record spread leaves it green, because
            // spreading a well-formed archive's own array back is harmless. Only a record whose stored
            // `ops` is not an array can separate the two, since the read rebuilds that as `[]` and the old
            // mark wrote the rebuild. A replay mark writing an empty payload over a real one is data loss
            // caused by BOOKKEEPING, which is the worst kind to ship silently.
            legacyMarked     : true,
            legacyOpsType    : 'string',
            legacyReplayCount: 1
        });
    });
});
