import {setup} from '../../../../../setup.mjs';

const appName = 'McpServerToolLimitsTest';

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

import {test, expect}  from '@playwright/test';
import path            from 'path';
import {fileURLToPath} from 'url';
import Neo             from '../../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../../src/core/_export.mjs';
import ToolService     from '../../../../../../../ai/mcp/ToolService.mjs';

const
    __filename = fileURLToPath(import.meta.url),
    __dirname  = path.dirname(__filename),
    repoRoot   = path.resolve(__dirname, '../../../../../../..');

test.describe('Neo.ai.mcp.server.memory-core Tool limits', () => {
    let toolService;

    test.beforeAll(async () => {
        // ADR 0019 B4: storagePaths.graph resolves to ':memory:' by construction under // ticket-ref-ok: ADR id
        // UNIT_TEST_MODE — no singleton mutation, no temp DB path needed.

        const ToolServiceModule = await import('../../../../../../../ai/mcp/server/memory-core/toolService.mjs');
        toolService = {
            callTool                    : ToolServiceModule.callTool,
            composeMemoryCoreHealthcheck: ToolServiceModule.composeMemoryCoreHealthcheck,
            listTools                   : ToolServiceModule.listTools,
            readLaneLandscapeConfig     : ToolServiceModule.readLaneLandscapeConfig
        };
    });

    test('explore_lane_landscape resolves ONLY the census domain — the source domain is host-edge (#15468 two-domain contract retired by #17285)', () => {
        // The two-domain contract was RETIRED, not broken. This seam used to resolve a second domain
        // from the GitHub Workflow child — a host-edge provider — which is precisely the cross-plane
        // read the census fix removed. Spelled out because the next reader of this diff would
        // otherwise see a dropped assertion and "restore" the violation.
        // ticket-ref-ok: names the superseded contract so the supersession is legible rather than
        // looking like an accidental regression
        const config = toolService.readLaneLandscapeConfig();

        expect(config).toEqual({
            census: {
                edgeLimit: 5000,
                maxPages : 50,
                pageLimit: 100
            }
        });

        // `toEqual` above already fails on a re-added domain, so this line is not what CATCHES the
        // regression — it is what states that the absence is the contract. Its value is against a
        // future loosening to `toMatchObject`, which would keep the assertion looking intact while
        // silently permitting any second domain back in.
        expect(Object.keys(config)).toEqual(['census'])
    });

    test('All Memory Core tools must respect description length constraints', async () => {
        const { tools } = await toolService.listTools();
        expect(tools.length).toBeGreaterThan(0);

        for (const tool of tools) {
            // Anthropic/Gemini MCP limits
            expect(tool.name.length).toBeLessThanOrEqual(64);
            expect(tool.description.length).toBeLessThanOrEqual(1024);

            // Schema prose no longer rides the listing at all — the absence is the
            // contract here, and the length discipline moves to the prose's new home below.
            if (tool.inputSchema && tool.inputSchema.properties) {
                for (const [propName, propDef] of Object.entries(tool.inputSchema.properties)) {
                    expect(propDef.description, `${tool.name}.${propName} schema prose stays off the listing`).toBeUndefined();
                }
            }

            // Relocated, not deleted: the handbook payload carries the fully-described schema,
            // and the ≤1024 discipline still binds there.
            const handbook = await toolService.callTool('get_mcp_tool_handbook', {toolId: tool.name});

            if (handbook.inputSchema && handbook.inputSchema.properties) {
                for (const [propName, propDef] of Object.entries(handbook.inputSchema.properties)) {
                    if (propDef.description) {
                        expect(propDef.description.length, `${tool.name}.${propName} handbook prose`).toBeLessThanOrEqual(1024);
                    }
                }
            }
        }
    });

    test('manage_wake_subscription surfaces bridge metadata contract', async () => {
        const { tools } = await toolService.listTools();
        const tool      = tools.find(item => item.name === 'manage_wake_subscription');
        const metadata  = tool.inputSchema.properties.harnessTargetMetadata;

        expect(metadata.required).toBeUndefined();
        expect(Object.keys(metadata.properties)).toEqual(expect.arrayContaining([
            'addressType',
            'adapter',
            'appName',
            'coalesceWindow',
            'cwd',
            'daemonSocketPath',
            'envelopePath',
            'focusSeedKey',
            'instanceAddress',
            'lockPath',
            'tabShortcut',
            'tmuxSession',
            'tokenPath',
            'url'
        ]));
        expect(metadata.properties.adapter.enum).toEqual(['osascript', 'tmux', 'codex-app-server', 'opencode-server', 'kimi-server', 'kimi-pull-bridge']);
        expect(metadata.properties.envelopePath.type).toBe('string');
        expect(metadata.properties.addressType.enum).toEqual(['userDataDir', 'pid', 'tmuxSession', 'webhookUrl']);

        // The prose half of the contract relocated to the lazy handbook payload — the
        // listing above now witnesses shape-only (type/enum/properties survive the projection).
        const handbook = await toolService.callTool('get_mcp_tool_handbook', {toolId: 'manage_wake_subscription'});

        expect(handbook.inputSchema.properties.harnessTargetMetadata.description)
            .toContain("exempt for envelope-routed adapters 'opencode-server', 'kimi-server', 'kimi-pull-bridge'");
    });

    test('get_neighbors output schema exposes semanticVectorId contract (#11680)', async () => {
        const { tools } = await toolService.listTools();
        const tool      = tools.find(item => item.name === 'get_neighbors');
        const neighbor  = tool.outputSchema.properties.neighbors.items;

        expect(neighbor.properties.semanticVectorId.type).toBe('string');
        expect(neighbor.additionalProperties).not.toBe(false);

        // The description relocated to the handbook payload — the listing keeps shape only.
        const handbook = await toolService.callTool('get_mcp_tool_handbook', {toolId: 'get_neighbors'});

        expect(handbook.outputSchema.properties.neighbors.items.properties.semanticVectorId.description)
            .toContain('semantic vector identifier');
    });

    test('get_rem_pipeline_state surfaces the REM axis-count output contract (#12087)', async () => {
        const { tools } = await toolService.listTools();
        const tool      = tools.find(item => item.name === 'get_rem_pipeline_state');

        expect(tool).toBeTruthy();
        expect(tool.annotations.readOnlyHint).toBe(true);
        expect(tool.outputSchema.properties.undigested.type).toBe('integer');
        expect(tool.outputSchema.properties.digested.type).toBe('integer');
        expect(tool.outputSchema.properties.sessionNodes.type).toBe('integer');
        expect(tool.outputSchema.properties.topologyConflicts.type).toBe('integer');
        expect(tool.outputSchema.properties.recentCycles.type).toBe('array');
        expect(tool.outputSchema.properties.recentCycles.items.properties.runId.type).toBe('string');
        expect(tool.outputSchema.properties.recentCycles.items.properties.cycleOverflowSignal.type).toBe('boolean');
        const perSessionSchema = tool.outputSchema.properties.perSession;
        const perSession       = perSessionSchema.type === 'object'
            ? perSessionSchema
            : perSessionSchema.anyOf.find(item => item.type === 'object');

        expect(perSession.properties.entityCount.type).toBe('integer');
    });

    test('healthcheck exposes diagnostic options through the MCP schema (#13460)', async () => {
        const { tools } = await toolService.listTools();
        const tool      = tools.find(item => item.name === 'healthcheck');

        expect(tool).toBeTruthy();
        expect(tool.annotations.readOnlyHint).toBe(true);
        expect(tool.inputSchema.properties.freshObservability.type).toBe('boolean');
        expect(tool.inputSchema.properties.chromaProbeTimeoutMs.type).toBe('integer');
        expect(tool.inputSchema.properties.chromaProbeTimeoutMs.minimum).toBe(1);
        // The per-call canary timeout is retired — attempts are producer-owned and the
        // timeout binds at producer start. The schema must not advertise a knob that does nothing.
        expect(tool.inputSchema.properties.embeddingWriteCanaryTimeoutMs).toBeUndefined();
        expect(tool.inputSchema.properties.includeSqliteHolders).toBeUndefined();
    });

    test('#15913 mark_read exposes selected-id and all-snapshot modes without adding a tool', async () => {
        const {tools} = await toolService.listTools();
        const
            markRead  = tools.find(item => item.name === 'mark_read'),
            messageId = markRead.inputSchema.properties.messageId;

        expect(messageId.anyOf.map(option => option.type)).toEqual(['string', 'array']);
        expect(messageId.anyOf[1].items.type).toBe('string');
        expect(markRead.inputSchema.properties.all.type).toBe('boolean');
        expect(tools.some(item => item.name === 'mark_all_read')).toBe(false);
    });

    test('get_sqlite_holder_diagnostics exposes read-only grouped holder contract (#13475)', async () => {
        const { tools } = await toolService.listTools();
        const tool      = tools.find(item => item.name === 'get_sqlite_holder_diagnostics');

        expect(tool).toBeTruthy();
        expect(tool.annotations.readOnlyHint).toBe(true);
        expect(tool.inputSchema.properties).toEqual({});
        expect(tool.outputSchema.properties.status.enum).toEqual(['ok', 'degraded']);
        expect(tool.outputSchema.properties.totalProcesses.type).toBe('integer');
        expect(tool.outputSchema.properties.byHarness.additionalProperties.type).toBe('integer');
        expect(tool.outputSchema.properties.groups.items.properties.harness.type).toBe('string');
        expect(tool.outputSchema.properties.groups.items.properties.processes.type).toBe('array');
        expect(tool.outputSchema.properties.processes.items.properties.pid.type).toBe('integer');
        expect(tool.outputSchema.properties.processes.items.properties.chain.type).toBe('array');
        expect(tool.outputSchema.properties.warnings.items.properties.code.type).toBe('string');
    });

    test('get_sandman_handoff exposes the read-only handoff freshness contract (#15599)', async () => {
        const { tools } = await toolService.listTools();
        const tool      = tools.find(item => item.name === 'get_sandman_handoff');

        expect(tool).toBeTruthy();
        expect(tool.annotations.readOnlyHint).toBe(true);
        expect(tool.inputSchema.properties.staleAfterMs.type).toBe('number');
    });

    test('healthcheck DECLARES memoryWalDrain, and every key its real producer returns is in the schema (#16060)', async () => {
        // Output schemas are passthrough, so production can add a response field that `tools/list`
        // never declares and CI stays green. `memoryWalDrain` shipped exactly that way: the runtime
        // handler returned it, callers were told by `add_memory` to poll it, and the generated MCP
        // output schema did not mention it — so a consumer reading the declared contract could not
        // discover the instrument it was being pointed at.
        const { tools } = await toolService.listTools();
        const tool      = tools.find(item => item.name === 'healthcheck');

        expect(tool).toBeTruthy();

        // POSITIVE CONTROL on the assertion mechanism: `plane` was already declared, so if this
        // lookup path were wrong, the control fails and the real assertion below cannot pass
        // vacuously.
        expect(tool.outputSchema.properties.plane).toBeTruthy();
        expect(tool.outputSchema.properties.plane.properties.dataRoot.type).toBe('string');

        const declared = tool.outputSchema.properties.memoryWalDrain;

        expect(declared).toBeTruthy();
        expect(declared.properties.observable.type).toBe('boolean');
        expect(declared.properties.state.enum).toEqual(['caught-up', 'pending', 'stalled', 'unobservable']);
        expect(declared.properties.stallThresholdMs.type).toBe('number');
        expect(declared.properties.pendingDrainDepth.type).toBe('integer');
        expect(declared.properties.allWritesSemanticallyQueryable.type).toBe('boolean');

        // The generalizable limb, and the reason this test is worth its bytes: cross-check the DECLARED
        // shape against what the REAL producer actually returns, rather than against a hand-written
        // list that drifts. `describeDrainState` is the production function the handler calls, so a
        // field added there without a schema entry fails here — including fields nobody thought to
        // name in a review.
        //
        // Imported inside the test, not at module scope: this is a ToolService/schema spec, and hoisting
        // a service import that reaches AiConfig would couple schema assertions to service boot order.
        // Both the measured and the degraded branch of `describeDrainState` return the SAME key set, so
        // this cross-check does not depend on a WAL existing here.
        const {default: MemoryService} = await import('../../../../../../../ai/services/memory-core/MemoryService.mjs'),
              produced                 = await MemoryService.describeDrainState(),
              undeclared               = Object.keys(produced).filter(key => !declared.properties[key]);

        expect(undeclared).toEqual([]);

        // And the inverse direction, so the schema cannot advertise a contract the producer does not
        // honour. Both directions matter: an undeclared field hides an instrument, a declared-but-absent
        // field promises one that isn't there.
        const unproduced = Object.keys(declared.properties).filter(key => !(key in produced));

        expect(unproduced).toEqual([]);
    });

    test('healthcheck composition consumes a memory ceiling from the deployment snapshot (#17121)', () => {
        // The WIRING, not the fold. The first implementation folded the disposition into the
        // bridge's own nested service record and called that "the composed surface" — so a correct
        // derivation shipped, its unit matrix passed, and the healthcheck an operator actually calls
        // never read it. A pure-function test cannot see that gap by construction: it exercises the
        // consumer directly and therefore assumes the reachability that was missing.
        const
            now          = Date.now(),
            plane        = {id: 'test-plane', dataRoot: '/test-data'},
            drain        = {observable: false, state: 'unobservable', stallThresholdMs: 1, pendingDrainDepth: 0, oldestPendingAgeMs: 0, allWritesSemanticallyQueryable: false},
            baseHealth   = {status: 'healthy', details: ['Connected to ChromaDB', 'All features are operational']},
            atCapService = {
                serviceKey    : 'embedding-model',
                observedAt    : new Date(now - 1000).toISOString(),
                memoryPressure: {
                    disposition: 'at-cap',
                    reason     : null,
                    // Carries the sample window because AC-2's receipt names the service, the cap AND
                    // the window. This fixture omitted the window for a revision — the same omission
                    // the fold spec's fixture had — and both passed, because the consumer validated
                    // only the fields its sentence printed. Two fixtures written from the consumer's
                    // side is how a contract half stays unenforced end to end.
                    receipt    : {
                        serviceKey: 'embedding-model', metric: 'memory', scope: 'container',
                        threshold : 90, minPercent: 99.8, observedWindowMs: 120000, requiredWindowMs: 120000
                    }
                }
            },
            compose = services => toolService.composeMemoryCoreHealthcheck({
                health                : baseHealth,
                memoryWalDrain        : drain,
                plane,
                starvationNow         : now,
                starvationStaleAfterMs: 2 * 60 * 1000,
                deploymentInspection  : {ok: true, status: 'available', snapshot: {generatedAt: now, services}}
            });

        const degraded = compose([atCapService]);

        expect(degraded.status).toBe('degraded');
        expect(degraded.serviceMemoryPressure.state).toBe('consumed-degraded');
        expect(degraded.details).not.toContain('All features are operational');
        expect(degraded.details.at(-1)).toContain('embedding-model');

        // The control: the same call shape with a below disposition must leave the verdict alone, so
        // this case cannot pass by degrading unconditionally.
        const clear = compose([{...atCapService, memoryPressure: {disposition: 'below', reason: null, receipt: null}}]);

        expect(clear.status).toBe('healthy');
        expect(clear.serviceMemoryPressure.state).toBe('consumed-clear');
        expect(clear.details).toContain('All features are operational');
    });

    test('healthcheck composition degrades only a stalled drain and preserves stronger verdicts (#16305)', () => {
        const plane        = {id: 'test-plane', dataRoot: '/test-data'};
        const pendingDrain = {
            observable                    : true,
            state                         : 'pending',
            stallThresholdMs              : 6 * 60 * 60 * 1000,
            pendingDrainDepth             : 2,
            oldestPendingAgeMs            : 60 * 1000,
            allWritesSemanticallyQueryable: false
        };
        const baseHealth = {
            status : 'healthy',
            details: ['Connected to ChromaDB', 'All features are operational']
        };

        const pending = toolService.composeMemoryCoreHealthcheck({health: baseHealth, memoryWalDrain: pendingDrain, plane});

        expect(pending.status).toBe('healthy');
        expect(pending.details).toContain('All features are operational');

        const stalledDrain = {
            ...pendingDrain,
            state             : 'stalled',
            pendingDrainDepth : 29,
            oldestPendingAgeMs: pendingDrain.stallThresholdMs + 1
        };
        const stalled = toolService.composeMemoryCoreHealthcheck({health: baseHealth, memoryWalDrain: stalledDrain, plane});

        expect(stalled.status).toBe('degraded');
        expect(stalled.details).toContain('Connected to ChromaDB');
        expect(stalled.details).not.toContain('All features are operational');
        expect(stalled.details.at(-1)).toContain('29 pending records');
        expect(stalled.details.at(-1)).toContain(`${stalledDrain.oldestPendingAgeMs} ms`);

        const unhealthy = toolService.composeMemoryCoreHealthcheck({
            health        : {...baseHealth, status: 'unhealthy'},
            memoryWalDrain: stalledDrain,
            plane
        });

        expect(unhealthy.status).toBe('unhealthy');

        const unobservable = toolService.composeMemoryCoreHealthcheck({
            health        : {...baseHealth, status: 'unhealthy'},
            memoryWalDrain: {
                ...pendingDrain,
                observable                    : false,
                state                         : 'unobservable',
                pendingDrainDepth             : null,
                oldestPendingAgeMs            : null,
                allWritesSemanticallyQueryable: null
            },
            plane
        });

        expect(unobservable.status).toBe('unhealthy');
        expect(unobservable.memoryWalDrain.state).toBe('unobservable');
    });

    test('healthcheck projects current degraded backup maintenance without trusting stale bridge state (#17068)', async () => {
        const
            plane        = {id: 'test-plane', dataRoot: '/test-data'},
            healthyDrain = {
                observable                    : true,
                state                         : 'caught-up',
                stallThresholdMs              : 6 * 60 * 60 * 1000,
                pendingDrainDepth             : 0,
                oldestPendingAgeMs            : null,
                allWritesSemanticallyQueryable: true
            },
            baseHealth   = {
                status : 'healthy',
                details: ['Connected to ChromaDB', 'All features are operational']
            },
            inspection  = {
                ok      : true,
                status  : 'available',
                snapshot: {
                    maintenance: {
                        health: {
                            status      : 'degraded',
                            reasonCodes : ['backup-retry-exhausted', 'backup-last-run-failed'],
                            staleAfterMs: 90000000
                        }
                    }
                }
            };

        const degraded = toolService.composeMemoryCoreHealthcheck({
            health              : baseHealth,
            memoryWalDrain      : healthyDrain,
            plane,
            deploymentInspection: inspection
        });

        expect(degraded.status).toBe('degraded');
        expect(degraded.maintenance).toEqual({
            observationStatus: 'available',
            backup           : inspection.snapshot.maintenance.health
        });
        expect(degraded.details).not.toContain('All features are operational');
        expect(degraded.details.at(-1)).toContain('backup-retry-exhausted, backup-last-run-failed');

        const stale = toolService.composeMemoryCoreHealthcheck({
            health              : baseHealth,
            memoryWalDrain      : healthyDrain,
            plane,
            deploymentInspection: {...inspection, ok: false, status: 'stale'}
        });

        expect(stale.status).toBe('healthy');
        expect(stale.maintenance).toEqual({observationStatus: 'stale', backup: null});
        expect(stale.details).toContain('All features are operational');

        const unhealthy = toolService.composeMemoryCoreHealthcheck({
            health              : {...baseHealth, status: 'unhealthy'},
            memoryWalDrain      : healthyDrain,
            plane,
            deploymentInspection: inspection
        });

        expect(unhealthy.status).toBe('unhealthy');

        const combined = toolService.composeMemoryCoreHealthcheck({
            health        : baseHealth,
            memoryWalDrain: {
                ...healthyDrain,
                state             : 'stalled',
                pendingDrainDepth : 3,
                oldestPendingAgeMs: healthyDrain.stallThresholdMs + 1
            },
            plane,
            deploymentInspection: inspection
        });

        expect(combined.details.some(detail => detail.includes('Memory WAL embed drain is stalled'))).toBe(true);
        expect(combined.details.some(detail => detail.includes('Backup maintenance is degraded'))).toBe(true);

        const {tools}  = await toolService.listTools();
        const declared = tools.find(item => item.name === 'healthcheck').outputSchema.properties.maintenance;

        expect(declared).toBeTruthy();
        expect(declared.properties.observationStatus.enum).toEqual(['available', 'stale', 'degraded', 'unavailable']);
        expect(declared.properties.backup.properties.status.enum).toEqual(['healthy', 'degraded', 'pending']);
        expect(declared.properties.backup.properties.reasonCodes.items.type).toBe('string');

        // The two `observationStatus` fields sit one level apart and answer different questions —
        // whether the BRIDGE could be read, versus whether the verdict's own input was PRESENT. The
        // enums are kept disjoint so no payload can blur them, and this pins that.
        expect(declared.properties.backup.properties.observationStatus.enum).toEqual(['observed', 'partial']);
        expect(declared.properties.backup.required).not.toContain('observationStatus');
    });

    test('a zero-bundle inventory vetoes a healthy backup verdict it contradicts (#17338)', async () => {
        const
            plane        = {id: 'test-plane', dataRoot: '/test-data'},
            healthyDrain = {
                observable                    : true,
                state                         : 'caught-up',
                stallThresholdMs              : 6 * 60 * 60 * 1000,
                pendingDrainDepth             : 0,
                oldestPendingAgeMs            : null,
                allWritesSemanticallyQueryable: true
            },
            // No bundle is restorable here, and the two facts are produced by different processes:
            // the orchestrator derives its verdict from task state and receipt, neither of which can
            // see this mount.
            emptyInventory = {lastSuccessful: null, lastCompleted: null, count: 0, unusableCount: 0, unverifiedCount: 0},
            baseHealth     = {
                backup : emptyInventory,
                status : 'healthy',
                details: ['Connected to ChromaDB', 'All features are operational']
            },
            inspectionWith = health => ({
                ok      : true,
                status  : 'available',
                snapshot: {maintenance: {health}}
            }),
            compose        = (health, inspection) => toolService.composeMemoryCoreHealthcheck({
                health,
                memoryWalDrain      : healthyDrain,
                plane,
                deploymentInspection: inspection
            }),
            healthyVerdict = {
                observationStatus: 'observed',
                reasonCodes     : [],
                staleAfterMs    : 90000000,
                status          : 'healthy'
            },
            vetoed         = compose(baseHealth, inspectionWith(healthyVerdict));

        expect(vetoed.maintenance.backup.status).toBe('degraded');
        expect(vetoed.maintenance.backup.reasonCodes).toContain('backup-inventory-empty');
        expect(vetoed.status).toBe('degraded');
        expect(vetoed.details.at(-1)).toContain('backup-inventory-empty');
        expect(vetoed.details).not.toContain('All features are operational');

        // CONTROL 1: a bundle exists. The verdict passes through untouched — the SAME object, so a
        // veto that fired on every call rather than on the contradiction would fail here.
        const stocked = compose(
            {...baseHealth, backup: {...emptyInventory, count: 3, lastSuccessful: '2026-08-20T00:00:00Z'}},
            inspectionWith(healthyVerdict)
        );

        expect(stocked.maintenance.backup).toBe(healthyVerdict);
        expect(stocked.status).toBe('healthy');

        // CONTROL 2: a first boot has the same empty inventory and is not making a positive claim.
        // `pending` is already honest, and degrading it would warn on every fresh deployment.
        const fresh = compose(baseHealth, inspectionWith({...healthyVerdict, observationStatus: 'partial', status: 'pending'}));

        expect(fresh.maintenance.backup.status).toBe('pending');
        expect(fresh.maintenance.backup.reasonCodes).toEqual([]);
        expect(fresh.status).toBe('healthy');

        // CONTROL 3: an unread inventory vetoes nothing. Absence of a reading is not a reading, and
        // a veto that fired on `undefined` would degrade every caller that does not census bundles.
        const unread = compose({...baseHealth, backup: undefined}, inspectionWith(healthyVerdict));

        expect(unread.maintenance.backup).toBe(healthyVerdict);
        expect(unread.status).toBe('healthy');
    });

    test('healthcheck dispatch passes diagnostic options as one object (#13460)', async () => {
        const observedArgs   = [];
        const spyToolService = Neo.create(ToolService, {
            openApiFilePath: path.join(repoRoot, 'ai/mcp/server/memory-core/openapi.yaml'),
            serviceMapping : {
                healthcheck: async args => {
                    observedArgs.push(args);
                    return {status: 'healthy', args};
                }
            }
        });

        const args = {
            freshObservability  : false,
            chromaProbeTimeoutMs: 1234
        };

        await expect(spyToolService.callTool('healthcheck', args)).resolves.toEqual({
            status: 'healthy',
            args
        });
        expect(observedArgs).toEqual([args]);
    });
});
