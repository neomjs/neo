import {test, expect}  from '@playwright/test';
import fs              from 'node:fs';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

import {
    buildInventory,
    collectConsumerEdges,
    collectLaunchRoots,
    collectManifestDependencyRows,
    collectPackageDependencies,
    composeDependencyManifests,
    deriveRuntimeProbeTargets,
    deriveWorkflowFilePopulation,
    discoverSubprocessLaunches,
    discoverWorkflowReferences,
    formatInventory,
    inspectManifestDependencies,
    inspectEngineAgentOsDependencies,
    listTrackedFiles,
    reconcileInventory,
    reconcileConsumerEdges,
    reconcileConsumerSourceClasses,
    reconcileRuntimeProbeEligibility,
    reconcileWorkflowFileDispositions,
    resolveTrackedConfigSpecifier,
    rowKey,
    CONSUMER_EDGE_DIRECTION,
    CONSUMER_EDGE_DISPOSITIONS,
    RUNTIME_PROBE_ELIGIBILITY,
    sourceBindingError,
    SURFACE,
    WORKFLOW_FILE_DISPOSITION
}                       from '../../../../../../ai/scripts/diagnostics/agentOsExtractionInventory.mjs';
import {resolveRelative}    from '../../../../../../ai/scripts/lint/scriptPlaneClosure.mjs';
import {censusPlaneOpeners} from '../../../../../../ai/scripts/diagnostics/planePlacementCensus.mjs';

const
    __dirname = path.dirname(fileURLToPath(import.meta.url)),
    REPO_ROOT = path.resolve(__dirname, '../../../../../..');

/**
 * @summary Mutation-resistant contract for the first blocking AgentOS extraction proof: source
 * populations are discovered semantically, both residue directions fail independently, and the
 * committed current-tree receipt is complete and deterministic.
 */
test.describe('agentOsExtractionInventory — exact population × explicit authority', () => {
    test('workflow discovery counts module, registry, test, and comment occurrences separately', () => {
        const source = [
            "paths: ['ai/scripts/lint/rules.json']",
            "run: node ai/scripts/lint/check.mjs",
            "# keep test/playwright/unit/ai/scripts/lint/check.spec.mjs in the rewrite population",
            "again: ai/scripts/lint/check.mjs"
        ].join('\n');

        const rows = discoverWorkflowReferences(source, '.github/workflows/fixture.yml');

        expect(rows.map(row => row.target)).toEqual([
            'ai/scripts/lint/rules.json',
            'ai/scripts/lint/check.mjs',
            'test/playwright/unit/ai/scripts/lint/check.spec.mjs',
            'ai/scripts/lint/check.mjs'
        ]);
        expect(rows[1].identity).toContain('ai/scripts/lint/check.mjs::1');
        expect(rows[3].identity).toContain('ai/scripts/lint/check.mjs::2');
        expect(rows.map(row => row.source)).toEqual([
            '.github/workflows/fixture.yml:1',
            '.github/workflows/fixture.yml:2',
            '.github/workflows/fixture.yml:3',
            '.github/workflows/fixture.yml:4'
        ])
    });

    test('workflow-file authority is one action per file, independent of occurrence plane custody', () => {
        const
            workflowA = '.github/workflows/a.yml',
            workflowB = '.github/workflows/b.yml',
            rows      = [{
                surface    : SURFACE.workflowReference,
                identity   : `${workflowA}::ai/scripts/a.mjs::1`,
                disposition: 'edge',
                evidence   : {workflowFile: workflowA, target: 'ai/scripts/a.mjs'}
            }, {
                surface    : SURFACE.workflowReference,
                identity   : `${workflowA}::ai/scripts/b.mjs::1`,
                disposition: 'cloud',
                evidence   : {workflowFile: workflowA, target: 'ai/scripts/b.mjs'}
            }, {
                surface    : SURFACE.workflowReference,
                identity   : `${workflowB}::ai/scripts/c.mjs::1`,
                disposition: 'edge',
                evidence   : {workflowFile: workflowB, target: 'ai/scripts/c.mjs'}
            }],
            population = deriveWorkflowFilePopulation(rows),
            result     = reconcileWorkflowFileDispositions(rows, {
                workflowFileDispositions: [{
                    identity    : workflowA,
                    disposition : WORKFLOW_FILE_DISPOSITION.pinFetch,
                    pinAuthority: 'fixture immutable compatibility receipt',
                    source      : 'fixture authority',
                    rationale   : 'mixed target custody does not choose the file action'
                }, {
                    identity        : workflowB,
                    disposition     : WORKFLOW_FILE_DISPOSITION.move,
                    targetRepository: 'neomjs/neo-agent-brain',
                    source          : 'fixture authority',
                    rationale       : 'the workflow follows its AgentOS-owned subject'
                }]
            });

        expect(population.errors).toEqual([]);
        expect(population.rows).toHaveLength(2);
        expect(result.ok).toBe(true);
        expect(result.total).toBe(2);
        expect(result.occurrenceTotal).toBe(3);
        expect(result.byDisposition).toEqual({move: 1, 'pin-fetch': 1, retire: 0});
        expect(result.rows[0]).toEqual(expect.objectContaining({
            identity   : workflowA,
            disposition: WORKFLOW_FILE_DISPOSITION.pinFetch,
            evidence   : expect.objectContaining({
                occurrenceCount       : 2,
                occurrenceDispositions: ['cloud', 'edge']
            })
        }))
    });

    test('RED: workflow-file authority never infers, copies, duplicates, or outlives source', () => {
        const
            workflow = '.github/workflows/a.yml',
            rows     = [{
                surface    : SURFACE.workflowReference,
                identity   : `${workflow}::ai/scripts/a.mjs::1`,
                disposition: 'edge',
                evidence   : {workflowFile: workflow, target: 'ai/scripts/a.mjs'}
            }, {
                surface    : SURFACE.workflowReference,
                identity   : `${workflow}::ai/scripts/b.mjs::1`,
                disposition: 'cloud',
                evidence   : {workflowFile: workflow, target: 'ai/scripts/b.mjs'}
            }],
            missing = reconcileWorkflowFileDispositions(rows, {workflowFileDispositions: []}),
            hostile = reconcileWorkflowFileDispositions(rows, {
                workflowFileDispositions: [{
                    identity   : workflow,
                    disposition: 'copy',
                    source     : 'fixture authority',
                    rationale  : 'copy must never become a fourth action'
                }, {
                    identity        : workflow,
                    disposition     : WORKFLOW_FILE_DISPOSITION.move,
                    targetRepository: 'neomjs/neo-agent-brain',
                    source          : 'duplicate fixture',
                    rationale       : 'duplicate authority must stay visible'
                }, {
                    identity        : '.github/workflows/stale.yml',
                    disposition     : WORKFLOW_FILE_DISPOSITION.move,
                    targetRepository: 'neomjs/neo-agent-brain',
                    pinAuthority    : 'metadata from the wrong action',
                    source          : 'stale fixture',
                    rationale       : 'authority without source must stay red'
                }]
            });

        expect(missing.ok).toBe(false);
        expect(missing.errors).toContainEqual({
            kind: 'missing-workflow-file-authority', key: workflow
        });
        expect(hostile.ok).toBe(false);
        expect(hostile.errors.map(error => error.kind)).toEqual(expect.arrayContaining([
            'duplicate-workflow-file-authority',
            'invalid-workflow-file-disposition',
            'stale-workflow-file-authority',
            'unexpected-workflow-file-metadata'
        ]))
    });

    test('RED: every workflow-file action requires its own terminal authority metadata', () => {
        const
            files = ['move.yml', 'pin.yml', 'retire.yml'].map(name => `.github/workflows/${name}`),
            rows  = files.map((workflowFile, index) => ({
                surface    : SURFACE.workflowReference,
                identity   : `${workflowFile}::ai/scripts/${index}.mjs::1`,
                disposition: 'edge',
                evidence   : {workflowFile, target: `ai/scripts/${index}.mjs`}
            })),
            result = reconcileWorkflowFileDispositions(rows, {
                workflowFileDispositions: [{
                    identity        : files[0],
                    disposition     : WORKFLOW_FILE_DISPOSITION.move,
                    targetRepository: 'neomjs/wrong-target',
                    source          : 'fixture authority',
                    rationale       : 'a move must name the canonical target repository'
                }, {
                    identity        : files[1],
                    disposition     : WORKFLOW_FILE_DISPOSITION.pinFetch,
                    targetRepository: 'neomjs/neo-agent-brain',
                    source          : 'fixture authority',
                    rationale       : 'a pin fetch must name its immutable ref authority'
                }, {
                    identity   : files[2],
                    disposition: WORKFLOW_FILE_DISPOSITION.retire,
                    source     : 'fixture authority',
                    rationale  : 'a retirement must name its terminal evidence'
                }]
            });

        expect(result.ok).toBe(false);
        expect(result.errors.map(error => error.kind)).toEqual(expect.arrayContaining([
            'invalid-workflow-move-target',
            'missing-workflow-pin-authority',
            'missing-workflow-retirement-evidence',
            'unexpected-workflow-file-metadata'
        ]))
    });

    test('subprocess discovery uses executable AST calls, folds static strings, and ignores prose', () => {
        const source = [
            '/** ai/scripts/maintenance/prose-only.mjs */',
            "runCommand('node ' + 'ai/scripts/maintenance/uploadKnowledgeBase.mjs');",
            "spawn(process.execPath, ['ai/scripts/runners/runAgent.mjs']);",
            'execSync(`node ai/scripts/diagnostics/check.mjs`);',
            "const inert = 'ai/scripts/diagnostics/not-launched.mjs';"
        ].join('\n');

        const result = discoverSubprocessLaunches(source, 'fixture.mjs');

        expect(result.parseError).toBeNull();
        expect(result.launches.map(row => row.target)).toEqual([
            'ai/scripts/maintenance/uploadKnowledgeBase.mjs',
            'ai/scripts/runners/runAgent.mjs',
            'ai/scripts/diagnostics/check.mjs'
        ]);
        expect(result.launches.map(row => row.source)).toEqual([
            'fixture.mjs:2', 'fixture.mjs:3', 'fixture.mjs:4'
        ]);
        expect(discoverSubprocessLaunches('const = broken', 'broken.mjs').parseError).toBeTruthy()
    });

    test('consumer-edge discovery uses the shared AST parser for both directions and keeps line movement out of identity', () => {
        const
            projectRoot  = path.resolve('/repo'),
            trackedFiles = [
                'ai/cloud.mjs',
                'ai/edge.mjs',
                'test/fixture.mjs',
                'test/playwright/unit/ai/already-brain.spec.mjs'
            ],
            sources = new Map([
                [path.join(projectRoot, 'ai/cloud.mjs'), "import Engine from '../src/cloud-only.mjs';"],
                [path.join(projectRoot, 'ai/edge.mjs'), [
                    "import Base from '../src/core/Base.mjs';",
                    "export * from '../apps/agentos/config.mjs';"
                ].join('\n')],
                [path.join(projectRoot, 'test/fixture.mjs'), [
                    "import A from '../ai/a.mjs';",
                    "export {B} from '../ai/b.mjs';",
                    "export * from '../ai/c.mjs';",
                    "const load = () => import('../ai/d.mjs');"
                ].join('\n')],
                [path.join(projectRoot, 'test/playwright/unit/ai/already-brain.spec.mjs'),
                    "import Internal from '../../../../../ai/internal.mjs';"]
            ]),
            run = fixtureSources => collectConsumerEdges({
                edgeReachedFiles           : ['ai/edge.mjs'],
                preclassifiedSourcePrefixes: ['test/playwright/unit/ai/'],
                projectRoot,
                readFile                   : file => fixtureSources.get(file),
                resolve                    : (specifier, fromFile) => path.resolve(path.dirname(fromFile), specifier),
                trackedFiles
            }),
            first = run(sources);

        expect(first.errors).toEqual([]);
        expect(first.rows).toHaveLength(6);
        expect(first.rows.map(row => row.evidence.direction)).toEqual([
            CONSUMER_EDGE_DIRECTION.agentOsToOutside,
            CONSUMER_EDGE_DIRECTION.agentOsToOutside,
            CONSUMER_EDGE_DIRECTION.outsideToAgentOs,
            CONSUMER_EDGE_DIRECTION.outsideToAgentOs,
            CONSUMER_EDGE_DIRECTION.outsideToAgentOs,
            CONSUMER_EDGE_DIRECTION.outsideToAgentOs
        ]);
        expect(first.rows.map(row => row.evidence.importKind)).toEqual(expect.arrayContaining([
            'static-import', 'named-reexport', 'export-all', 'literal-dynamic-import'
        ]));
        expect(first.rows.some(row => row.evidence.sourcePath.includes('already-brain'))).toBe(false);
        expect(first.rows.some(row => row.evidence.sourcePath === 'ai/cloud.mjs')).toBe(false);

        const moved = new Map(sources);
        moved.set(path.join(projectRoot, 'test/fixture.mjs'), `\n${sources.get(path.join(projectRoot, 'test/fixture.mjs'))}`);

        const second = run(moved);

        expect(second.rows.map(row => row.identity)).toEqual(first.rows.map(row => row.identity));
        expect(second.rows.find(row => row.evidence.sourcePath === 'test/fixture.mjs').source)
            .not.toBe(first.rows.find(row => row.evidence.sourcePath === 'test/fixture.mjs').source)
    });

    test('consumer-edge authority is direction-specific and closes exact missing/stale residue', () => {
        const derived = [{
                  surface    : SURFACE.consumerEdge,
                  identity   : 'outside-to-agentos::test/a.mjs::static-import::../ai/a.mjs::ai/a.mjs::1',
                  source     : 'test/a.mjs:1',
                  disposition: null,
                  rationale  : null,
                  evidence   : {direction: CONSUMER_EDGE_DIRECTION.outsideToAgentOs}
              }, {
                  surface    : SURFACE.consumerEdge,
                  identity   : 'agentos-to-outside::ai/a.mjs::static-import::../src/Neo.mjs::src/Neo.mjs::1',
                  source     : 'ai/a.mjs:1',
                  disposition: null,
                  rationale  : null,
                  evidence   : {direction: CONSUMER_EDGE_DIRECTION.agentOsToOutside}
              }],
              authority = {
                  consumerEdges: [{
                      identities    : [derived[0].identity],
                      direction     : CONSUMER_EDGE_DIRECTION.outsideToAgentOs,
                      disposition   : 'engine-contract-client',
                      successorPhase: 'engine-continuity',
                      source        : 'fixture inbound authority',
                      rationale     : 'the Engine fixture becomes a contract client'
                  }, {
                      identities    : [derived[1].identity],
                      direction     : CONSUMER_EDGE_DIRECTION.agentOsToOutside,
                      disposition   : 'published-engine-package',
                      successorPhase: 'move',
                      source        : 'fixture outbound authority',
                      rationale     : 'the AgentOS source consumes the published Engine'
                  }]
              },
              valid = reconcileConsumerEdges(derived, authority);

        expect(valid.ok).toBe(true);
        expect(valid.rows.map(row => row.disposition)).toEqual([
            'published-engine-package', 'engine-contract-client'
        ]);

        const wrongDirection = reconcileConsumerEdges([derived[0]], {
            consumerEdges: [{
                identities    : [derived[0].identity],
                direction     : CONSUMER_EDGE_DIRECTION.outsideToAgentOs,
                disposition   : 'published-engine-package',
                successorPhase: 'move',
                source        : 'fixture wrong-direction authority',
                rationale     : 'this disposition belongs to the inverse direction'
            }]
        });

        expect(wrongDirection.errors).toContainEqual({
            kind: 'invalid-consumer-edge-disposition', key: derived[0].identity
        });

        const substituted = reconcileConsumerEdges([derived[0]], {
            consumerEdges: [{
                identities    : ['outside-to-agentos::test/b.mjs::static-import::../ai/b.mjs::ai/b.mjs::1'],
                direction     : CONSUMER_EDGE_DIRECTION.outsideToAgentOs,
                disposition   : 'engine-contract-client',
                successorPhase: 'engine-continuity',
                source        : 'fixture stale authority',
                rationale     : 'same-count replacement must remain visible'
            }]
        });

        expect(substituted.residue).toEqual({
            diskMinusAuthority: [derived[0].identity],
            authorityMinusDisk: ['outside-to-agentos::test/b.mjs::static-import::../ai/b.mjs::ai/b.mjs::1']
        })
    });

    test('preclassified AgentOS source classes are exact, non-overlapping, and non-empty', () => {
        const registry = {
                  consumerSourceClasses: [{
                      identity      : 'test/playwright/unit/ai/**',
                      pathPrefix    : 'test/playwright/unit/ai/',
                      disposition   : 'moves-agentos-test',
                      successorPhase: 'move',
                      source        : 'fixture unit-brain authority',
                      rationale     : 'the unit-brain project already owns these tests'
                  }]
              },
              valid = reconcileConsumerSourceClasses(registry, [
                  'test/playwright/unit/ai/a.spec.mjs',
                  'test/playwright/unit/body.spec.mjs'
              ]);

        expect(valid.ok).toBe(true);
        expect(valid.prefixes).toEqual(['test/playwright/unit/ai/']);
        expect(valid.rows[0].evidence.fileCount).toBe(1);

        const invalid = reconcileConsumerSourceClasses({
            consumerSourceClasses: [registry.consumerSourceClasses[0], {
                ...registry.consumerSourceClasses[0],
                identity  : 'nested',
                pathPrefix: 'test/playwright/unit/ai/nested/'
            }]
        }, ['test/playwright/unit/ai/a.spec.mjs']);

        expect(invalid.errors.map(error => error.kind)).toEqual(expect.arrayContaining([
            'overlapping-consumer-source-class-prefix',
            'stale-consumer-source-class'
        ]))
    });

    test('Engine package direction rejects AgentOS dependencies and devDependencies independently', () => {
        const forbiddenPackages = ['@neomjs/neo-agent-brain', 'neo-agent-brain'],
              clean             = inspectEngineAgentOsDependencies({
                  forbiddenPackages,
                  manifest: {dependencies: {other: '1'}}
              }),
              runtime = inspectEngineAgentOsDependencies({
                  forbiddenPackages,
                  manifest: {dependencies: {'neo-agent-brain': '1'}}
              }),
              development = inspectEngineAgentOsDependencies({
                  forbiddenPackages,
                  manifest: {devDependencies: {'@neomjs/neo-agent-brain': '2'}}
              });

        expect(clean.ok).toBe(true);
        expect(runtime.errors).toContainEqual({
            kind : 'engine-agentos-package-edge',
            key  : 'dependencies::neo-agent-brain',
            error: '1'
        });
        expect(development.errors).toContainEqual({
            kind : 'engine-agentos-package-edge',
            key  : 'devDependencies::@neomjs/neo-agent-brain',
            error: '2'
        });
        expect(inspectEngineAgentOsDependencies().errors).toContainEqual({
            kind: 'empty-engine-agentos-package-covenant',
            key : 'engineDependencyCovenant.forbiddenPackages'
        })
    });

    test('a dirty tree cannot masquerade as a SHA-bound receipt', () => {
        expect(sourceBindingError('M  ai/scripts/a.mjs\n?? scratch.mjs')).toEqual({
            kind : 'dirty-worktree',
            key  : 'ai/scripts/a.mjs, scratch.mjs',
            error: 'a commit SHA cannot bind staged, modified, or untracked source'
        });
        expect(sourceBindingError('M  ai/scripts/a.mjs', true)).toBeNull();
        expect(sourceBindingError('', false)).toBeNull()
    });

    test('a complete grouped override closes disk minus authority', () => {
        const rows = [{
            surface    : SURFACE.scriptModule,
            identity   : 'ai/scripts/a.mjs',
            source     : 'ai/scripts/a.mjs',
            disposition: null,
            rationale  : null,
            evidence   : {}
        }];

        const result = reconcileInventory(rows, {
            overrides: [{
                surface    : SURFACE.scriptModule,
                identities : ['ai/scripts/a.mjs'],
                disposition: 'edge',
                source     : 'fixture authority',
                rationale  : 'explicit fixture Edge ownership'
            }],
            custody: []
        });

        expect(result.ok).toBe(true);
        expect(result.residue).toEqual({diskMinusAuthority: [], authorityMinusDisk: []});
        expect(result.rows[0].disposition).toBe('edge')
    });

    test('RED: a disk row with no authority is named in disk minus authority', () => {
        const result = reconcileInventory([{
            surface    : SURFACE.scriptModule,
            identity   : 'ai/scripts/unowned.mjs',
            source     : 'ai/scripts/unowned.mjs',
            disposition: null,
            rationale  : null,
            evidence   : {}
        }], {overrides: [], custody: []});

        expect(result.ok).toBe(false);
        expect(result.residue.diskMinusAuthority)
            .toEqual(['script-module::ai/scripts/unowned.mjs'])
    });

    test('RED: a registry row whose disk identity vanished is named in authority minus disk', () => {
        const result = reconcileInventory([], {
            overrides: [{
                surface    : SURFACE.scriptModule,
                identities : ['ai/scripts/deleted.mjs'],
                disposition: 'retire',
                source     : 'fixture authority',
                rationale  : 'fixture row intentionally left stale'
            }],
            custody: []
        });

        expect(result.ok).toBe(false);
        expect(result.residue.authorityMinusDisk)
            .toEqual(['script-module::ai/scripts/deleted.mjs']);
        expect(result.errors).toContainEqual({
            kind: 'stale-authority',
            key : 'script-module::ai/scripts/deleted.mjs'
        })
    });

    test('RED: duplicate, invalid, and explanation-free authority cannot suppress residue', () => {
        const row = {
            surface    : SURFACE.scriptModule,
            identity   : 'ai/scripts/a.mjs',
            source     : 'ai/scripts/a.mjs',
            disposition: null,
            rationale  : null,
            evidence   : {}
        };

        const result = reconcileInventory([row], {
            overrides: [{
                surface    : SURFACE.scriptModule,
                identities : [row.identity],
                disposition: 'unknown',
                source     : '',
                rationale  : 'short'
            }, {
                surface    : SURFACE.scriptModule,
                identities : [row.identity],
                disposition: 'edge',
                source     : 'second fixture',
                rationale  : 'duplicate fixture authority row'
            }],
            custody: []
        });

        expect(result.ok).toBe(false);
        expect(result.errors.map(error => error.kind)).toEqual(expect.arrayContaining([
            'duplicate-authority', 'invalid-disposition', 'missing-rationale', 'missing-source'
        ]))
    });

    test('RED: command authority cannot contradict its explicitly owned target', () => {
        const result = reconcileInventory([{
            surface    : SURFACE.rootScript,
            identity   : 'ai:fixture',
            source     : 'package.json#scripts.ai:fixture',
            disposition: null,
            rationale  : null,
            evidence   : {suggestedDisposition: 'edge'}
        }], {
            overrides: [{
                surface    : SURFACE.rootScript,
                identities : ['ai:fixture'],
                disposition: 'cloud',
                source     : 'fixture authority',
                rationale  : 'contradictory fixture ownership'
            }],
            custody: []
        });

        expect(result.ok).toBe(false);
        expect(result.errors).toContainEqual({
            kind : 'authority-conflict',
            key  : 'root-script::ai:fixture',
            error: 'registry says cloud; target custody says edge'
        })
    });

    test('launch-root rows retain exact target identity plus their owning channel evidence', () => {
        const rows = collectLaunchRoots({
            launchRoots: [{
                name: 'ai:edge', rel: 'ai/scripts/edge.mjs', via: 'npm'
            }, {
                name                : 'wake-daemon',
                plane               : 'host-edge',
                rel                 : 'ai/daemons/wake/daemon.mjs',
                suggestedDisposition: 'edge',
                via                 : 'task'
            }],
            scriptRowsByIdentity: new Map([['ai/scripts/edge.mjs', {
                disposition: 'edge'
            }]])
        });

        expect(rows.map(row => row.identity)).toEqual([
            'ai/daemons/wake/daemon.mjs',
            'ai/scripts/edge.mjs'
        ]);
        expect(rows).toEqual(expect.arrayContaining([expect.objectContaining({
            surface : SURFACE.launchRoot,
            identity: 'ai/scripts/edge.mjs',
            source  : 'package.json#scripts.ai:edge',
            evidence: expect.objectContaining({
                name: 'ai:edge', target: 'ai/scripts/edge.mjs', via: 'npm', suggestedDisposition: 'edge'
            })
        }), expect.objectContaining({
            surface : SURFACE.launchRoot,
            identity: 'ai/daemons/wake/daemon.mjs',
            source  : 'ai/daemons/orchestrator/taskDefinitions.mjs#wake-daemon',
            evidence: expect.objectContaining({
                name                : 'wake-daemon',
                plane               : 'host-edge',
                target              : 'ai/daemons/wake/daemon.mjs',
                via                 : 'task',
                suggestedDisposition: 'edge'
            })
        })]))
    });

    test('RED: launch-root collection refuses a task root without source custody', () => {
        expect(() => collectLaunchRoots({
            launchRoots: [{
                name : 'wake-daemon',
                plane: 'host-edge',
                rel  : 'ai/daemons/wake/daemon.mjs',
                via  : 'task'
            }]
        })).toThrow(
            "collectLaunchRoots: launch root 'ai/daemons/wake/daemon.mjs' has no reconciled script-module custody or explicit suggestedDisposition"
        )
    });

    test('RED: task-root authority cannot contradict its classifier custody', () => {
        const rows = collectLaunchRoots({
                  launchRoots: [{
                      name                : 'wake-daemon',
                      plane               : 'host-edge',
                      rel                 : 'ai/daemons/wake/daemon.mjs',
                      suggestedDisposition: 'edge',
                      via                 : 'task'
                  }]
              }),
              result = reconcileInventory(rows, {
                  custody  : [],
                  overrides: [{
                      surface    : SURFACE.launchRoot,
                      identities : ['ai/daemons/wake/daemon.mjs'],
                      disposition: 'cloud',
                      source     : 'fixture task-root authority',
                      rationale  : 'fixture deliberately contradicts task-root custody'
                  }]
              });

        expect(result.ok).toBe(false);
        expect(result.errors).toContainEqual({
            kind : 'authority-conflict',
            key  : 'launch-root::ai/daemons/wake/daemon.mjs',
            error: 'registry says cloud; target custody says edge'
        })
    });

    test('RED: same-count launch-root substitution names the missing and stale targets', () => {
        const rows = collectLaunchRoots({
              launchRoots: [{
                      name                : 'replacement',
                      rel                 : 'ai/scripts/replacement.mjs',
                      suggestedDisposition: 'edge',
                      via                 : 'workflow'
                  }]
              }),
              result = reconcileInventory(rows, {
                  custody  : [],
                  overrides: [{
                      surface    : SURFACE.launchRoot,
                      identities : ['ai/scripts/original.mjs'],
                      disposition: 'edge',
                      source     : 'fixture original launch authority',
                      rationale  : 'original fixture launch target belongs to Edge'
                  }]
              });

        expect(result.residue).toEqual({
            diskMinusAuthority: ['launch-root::ai/scripts/replacement.mjs'],
            authorityMinusDisk: ['launch-root::ai/scripts/original.mjs']
        })
    });

    test('dependency identity binds manifest, section, and name while version remains evidence', () => {
        const rows = [
            ...collectManifestDependencyRows({
                manifest: {
                    dependencies   : {'edge-package': '^1.0.0'},
                    devDependencies: {'test-package': '2.0.0'}
                },
                manifestName: 'package.json'
            }),
            ...collectManifestDependencyRows({
                manifest    : {devDependencies: {'cloud-package': '3.0.0'}},
                manifestName: 'package.brain.json'
            })
        ];

        expect(rows.map(row => row.identity)).toEqual([
            'package.json::dependencies::edge-package',
            'package.json::devDependencies::test-package',
            'package.brain.json::devDependencies::cloud-package'
        ]);
        expect(rows.find(row => row.identity.endsWith('cloud-package')).evidence)
            .toEqual(expect.objectContaining({
                manifest            : 'package.brain.json',
                section             : 'devDependencies',
                name                : 'cloud-package',
                version             : '3.0.0',
                suggestedDisposition: 'cloud'
            }));

        const changed = collectManifestDependencyRows({
            manifest    : {dependencies: {'edge-package': '^9.0.0'}},
            manifestName: 'package.json'
        })[0];

        expect(changed.identity).toBe('package.json::dependencies::edge-package');
        expect(changed.evidence.version).toBe('^9.0.0')
    });

    test('RED: root and Brain dependency additions fail independently by exact identity', () => {
        const authority = {
                  custody  : [],
                  overrides: [{
                      surface        : SURFACE.packageDependency,
                      identities     : ['package.json::devDependencies::edge-package'],
                      disposition    : 'edge',
                      manifestTargets: ['edge'],
                      source         : 'fixture Edge manifest authority',
                      rationale      : 'fixture package belongs to the Edge root'
                  }, {
                      surface        : SURFACE.packageDependency,
                      identities     : ['package.brain.json::devDependencies::cloud-package'],
                      disposition    : 'cloud',
                      manifestTargets: ['cloud'],
                      source         : 'fixture Cloud manifest authority',
                      rationale      : 'fixture package belongs to the nested Cloud root'
                  }]
              },
              baseRows  = [
                  ...collectManifestDependencyRows({
                      manifest    : {devDependencies: {'edge-package': '1'}},
                      manifestName: 'package.json'
                  }),
                  ...collectManifestDependencyRows({
                      manifest    : {devDependencies: {'cloud-package': '1'}},
                      manifestName: 'package.brain.json'
                  })
              ],
              addedRoot = reconcileInventory([...baseRows,
                  ...collectManifestDependencyRows({
                      manifest    : {dependencies: {'new-edge-package': '1'}},
                      manifestName: 'package.json'
                  })
              ], authority),
              addedBrain = reconcileInventory([...baseRows,
                  ...collectManifestDependencyRows({
                      manifest    : {dependencies: {'new-cloud-package': '1'}},
                      manifestName: 'package.brain.json'
                  })
              ], authority);

        expect(addedRoot.residue.diskMinusAuthority)
            .toContain('package-dependency::package.json::dependencies::new-edge-package');
        expect(addedBrain.residue.diskMinusAuthority)
            .toContain('package-dependency::package.brain.json::dependencies::new-cloud-package')
    });

    test('RED: same-count dependency substitution names the missing and stale identities', () => {
        const rows = collectManifestDependencyRows({
                  manifest    : {devDependencies: {'replacement-package': '1'}},
                  manifestName: 'package.json'
              }),
              result = reconcileInventory(rows, {
                  custody  : [],
                  overrides: [{
                      surface        : SURFACE.packageDependency,
                      identities     : ['package.json::devDependencies::original-package'],
                      disposition    : 'edge',
                      manifestTargets: ['edge'],
                      source         : 'fixture original authority',
                      rationale      : 'original fixture package belongs to Edge'
                  }]
              });

        expect(result.residue).toEqual({
            diskMinusAuthority: ['package-dependency::package.json::devDependencies::replacement-package'],
            authorityMinusDisk: ['package-dependency::package.json::devDependencies::original-package']
        })
    });

    test('RED: missing manifests and unsupported dependency-bearing sections fail closed', () => {
        const missing = collectPackageDependencies({
                  manifestNames: ['package.brain.json'],
                  projectRoot  : path.join(REPO_ROOT, 'not-a-real-project-root')
              }),
              unsupported = inspectManifestDependencies({
                  manifest    : {
                      bundledDependencies: ['hidden-package'],
                      devDependencies    : {'visible-package': '1'}
                  },
                  manifestName: 'package.json'
              });

        expect(missing.rows).toEqual([]);
        expect(missing.errors).toContainEqual({
            kind: 'missing-dependency-manifest', key: 'package.brain.json'
        });
        expect(unsupported.rows.map(row => row.identity))
            .toEqual(['package.json::devDependencies::visible-package']);
        expect(unsupported.errors).toContainEqual({
            kind : 'unsupported-dependency-section',
            key  : 'package.json::bundledDependencies',
            error: 'dependency-bearing sections must enter the exact manifest population explicitly'
        })
    });

    test('dependency manifest composition names every target plane without a shared-custody alias', () => {
        const result = composeDependencyManifests([{
            evidence       : {name: 'both-planes', version: '1'},
            manifestTargets: ['edge', 'cloud']
        }, {
            evidence       : {name: 'engine-only', version: '2'},
            manifestTargets: ['engine']
        }]);

        expect(result.errors).toEqual([]);
        expect(result.manifests).toEqual({
            cloud : {'both-planes': '1'},
            edge  : {'both-planes': '1'},
            engine: {'engine-only': '2'},
            shared: {}
        });

        const conflict = composeDependencyManifests([{
            evidence       : {name: 'same-package', version: '1'},
            manifestTargets: ['edge']
        }, {
            evidence       : {name: 'same-package', version: '2'},
            manifestTargets: ['edge']
        }]);

        expect(conflict.errors).toContainEqual({
            kind : 'manifest-target-version-conflict',
            key  : 'edge::same-package',
            error: '1 != 2'
        })
    });

    test('RED: package authority requires valid, unique manifest targets aligned to custody', () => {
        const row = collectManifestDependencyRows({
                  manifest    : {devDependencies: {'edge-package': '1'}},
                  manifestName: 'package.json'
              })[0],
              missing = reconcileInventory([row], {
                  custody  : [],
                  overrides: [{
                      surface    : SURFACE.packageDependency,
                      identities : [row.identity],
                      disposition: 'edge',
                      source     : 'fixture missing membership authority',
                      rationale  : 'fixture deliberately omits manifest targets'
                  }]
              }),
              result = reconcileInventory([row], {
                  custody  : [],
                  overrides: [{
                      surface        : SURFACE.packageDependency,
                      identities     : [row.identity],
                      disposition    : 'edge',
                      manifestTargets: ['cloud', 'cloud', 'unknown'],
                      source         : 'fixture invalid membership authority',
                      rationale      : 'fixture deliberately contradicts Edge custody'
                  }]
              });

        expect(missing.errors).toContainEqual({
            kind: 'missing-manifest-targets', key: `package-dependency::${row.identity}`
        });
        expect(result.errors.map(error => error.kind)).toEqual(expect.arrayContaining([
            'duplicate-manifest-target',
            'invalid-manifest-target',
            'disposition-target-mismatch'
        ]))
    });

    test('RED: dependency custody cannot use the physical shared-package disposition', () => {
        const row = collectManifestDependencyRows({
                  manifest    : {devDependencies: {'shared-package': '1'}},
                  manifestName: 'package.json'
              })[0],
              sharedCustody = reconcileInventory([row], {
                  custody  : [],
                  overrides: [{
                      surface        : SURFACE.packageDependency,
                      identities     : [row.identity],
                      disposition    : 'shared',
                      manifestTargets: ['shared'],
                      source         : 'fixture shared-custody authority',
                      rationale      : 'fixture deliberately overloads physical shared custody'
                  }]
              }),
              sharedTarget = reconcileInventory([row], {
                  custody  : [],
                  overrides: [{
                      surface        : SURFACE.packageDependency,
                      identities     : [row.identity],
                      disposition    : 'edge',
                      manifestTargets: ['edge', 'shared'],
                      source         : 'fixture Edge dependency authority',
                      rationale      : 'fixture keeps shared as a materialization target only'
                  }]
              });

        expect(sharedCustody.errors).toContainEqual({
            kind: 'shared-disposition-on-dependency', key: `package-dependency::${row.identity}`
        });
        expect(sharedTarget.ok).toBe(true)
    });

    test('runtime-probe targets are every exact launch-root row whose custody is Edge', () => {
        const targets = deriveRuntimeProbeTargets({
            launchRootRows: [{
                surface: SURFACE.launchRoot, identity: 'ai/scripts/edge.mjs', disposition: 'edge'
            }, {
                surface: SURFACE.launchRoot, identity: 'ai/scripts/cloud.mjs', disposition: 'cloud'
            }, {
                surface: SURFACE.launchRoot, identity: 'ai/daemons/wake/daemon.mjs', disposition: 'edge'
            }]
        });

        expect(targets).toEqual(['ai/daemons/wake/daemon.mjs', 'ai/scripts/edge.mjs'])
    });

    test('RED: schema v3 runtime-probe derivation refuses absent launch-root authority', () => {
        expect(() => deriveRuntimeProbeTargets()).toThrow(
            'schema v3 requires non-empty reconciled launch-root rows'
        );
        expect(() => deriveRuntimeProbeTargets({launchRootRows: []})).toThrow(
            'schema v3 requires non-empty reconciled launch-root rows'
        )
    });

    test('runtime-probe authority reconciles one exact judgment per target', () => {
        const result = reconcileRuntimeProbeEligibility([
            'ai/scripts/a.mjs', 'ai/scripts/b.mjs'
        ], {
            runtimeProbeEligibility: [{
                identity   : 'ai/scripts/a.mjs',
                eligibility: RUNTIME_PROBE_ELIGIBILITY.eligible,
                reason     : 'entrypoint work is guarded and eager imports are bounded',
                source     : 'fixture:a'
            }, {
                identity   : 'ai/scripts/b.mjs',
                eligibility: RUNTIME_PROBE_ELIGIBILITY.ineligible,
                reason     : 'module starts a persistent process at import time',
                source     : 'fixture:b'
            }]
        });

        expect(result.ok).toBe(true);
        expect(result.byEligibility).toEqual({eligible: 1, ineligible: 1});
        expect(result.rows.map(row => row.identity)).toEqual(['ai/scripts/a.mjs', 'ai/scripts/b.mjs'])
    });

    test('RED: same-count eligibility substitution names missing and stale identities', () => {
        const result = reconcileRuntimeProbeEligibility(['ai/scripts/a.mjs'], {
            runtimeProbeEligibility: [{
                identity   : 'ai/scripts/b.mjs',
                eligibility: 'eligible',
                reason     : 'different identity at the same population count',
                source     : 'fixture substitution'
            }]
        });

        expect(result.ok).toBe(false);
        expect(result.residue).toEqual({
            targetsWithoutAuthority: ['ai/scripts/a.mjs'],
            authorityWithoutTargets: ['ai/scripts/b.mjs']
        });
        expect(result.errors).toEqual(expect.arrayContaining([{
            kind: 'missing-runtime-probe-eligibility', key: 'ai/scripts/a.mjs'
        }, {
            kind: 'stale-runtime-probe-eligibility', key: 'ai/scripts/b.mjs'
        }]))
    });

    test('RED: added and removed Edge targets fail independently by identity', () => {
        const shared = {
                  identity   : 'ai/scripts/a.mjs',
                  eligibility: 'eligible',
                  reason     : 'the stable target is explicitly safe to evaluate',
                  source     : 'fixture stable target'
              },
              added  = reconcileRuntimeProbeEligibility([
                  'ai/scripts/a.mjs', 'ai/scripts/new.mjs'
              ], {runtimeProbeEligibility: [shared]}),
              removed = reconcileRuntimeProbeEligibility(['ai/scripts/a.mjs'], {
                  runtimeProbeEligibility: [shared, {
                      identity   : 'ai/scripts/removed.mjs',
                      eligibility: 'ineligible',
                      reason     : 'the former target started persistent work on import',
                      source     : 'fixture removed target'
                  }]
              });

        expect(added.errors).toContainEqual({
            kind: 'missing-runtime-probe-eligibility', key: 'ai/scripts/new.mjs'
        });
        expect(added.errors.some(error => error.kind === 'stale-runtime-probe-eligibility')).toBe(false);
        expect(removed.errors).toContainEqual({
            kind: 'stale-runtime-probe-eligibility', key: 'ai/scripts/removed.mjs'
        });
        expect(removed.errors.some(error => error.kind === 'missing-runtime-probe-eligibility')).toBe(false)
    });

    test('RED: duplicate, invalid, and explanation-free probe authority stays visible', () => {
        const result = reconcileRuntimeProbeEligibility(['ai/scripts/a.mjs'], {
            runtimeProbeEligibility: [{
                identity: 'ai/scripts/a.mjs', eligibility: 'unknown', reason: '', source: ''
            }, {
                identity   : 'ai/scripts/a.mjs',
                eligibility: 'eligible',
                reason     : 'duplicate authority must not replace the first row',
                source     : 'duplicate fixture'
            }]
        });

        expect(result.ok).toBe(false);
        expect(result.errors.map(error => error.kind)).toEqual(expect.arrayContaining([
            'duplicate-runtime-probe-eligibility',
            'invalid-runtime-probe-eligibility',
            'missing-runtime-probe-reason',
            'missing-runtime-probe-source'
        ]))
    });

    test('the committed receipt is zero-residue, exhaustive, and independent of rendered overlays', () => {
        const overlayHiddenResolve = (specifier, fromFile) => {
                  const requested = path.resolve(path.dirname(fromFile), specifier),
                        template  = requested.endsWith(`${path.sep}config.mjs`)
                            ? requested.slice(0, -'config.mjs'.length) + 'config.template.mjs'
                            : null;

                  return template && fs.existsSync(template) ? null : resolveRelative(specifier, fromFile)
              },
              first       = buildInventory({allowDirty: true, projectRoot: REPO_ROOT}),
              second      = buildInventory({
                  allowDirty    : true,
                  closureResolve: overlayHiddenResolve,
                  projectRoot   : REPO_ROOT
              }),
              scriptFiles = listTrackedFiles({projectRoot: REPO_ROOT, pathspecs: ['ai/scripts']})
                  .filter(file => file.endsWith('.mjs')),
              packageScripts = Object.keys(JSON.parse(
                  fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')
              ).scripts ?? {}),
              workflowReferences = listTrackedFiles({projectRoot: REPO_ROOT, pathspecs: ['.github/workflows']})
                  .filter(file => /\.ya?ml$/.test(file))
                  .flatMap(file => discoverWorkflowReferences(
                      fs.readFileSync(path.join(REPO_ROOT, file), 'utf8'), file
                  )),
              workflowFiles = [...new Set(workflowReferences.map(row => row.identity.split('::', 1)[0]))];

        const packageDependencies = collectPackageDependencies({projectRoot: REPO_ROOT}).rows;

        expect(first).toEqual(second);
        expect(resolveTrackedConfigSpecifier(
            './config.mjs',
            path.join(REPO_ROOT, 'ai/fixture.mjs'),
            overlayHiddenResolve
        )).toBe(path.join(REPO_ROOT, 'ai/config.template.mjs'));
        expect(first.ok).toBe(true);
        expect(first.residue).toEqual({diskMinusAuthority: [], authorityMinusDisk: []});
        expect(first.errors).toEqual([]);
        expect(first.counts[SURFACE.scriptModule].total).toBe(scriptFiles.length);
        expect(first.counts[SURFACE.rootScript].total).toBe(packageScripts.length);
        expect(first.counts[SURFACE.workflowReference].total).toBe(workflowReferences.length);
        expect(first.counts[SURFACE.workflowFile].total).toBe(workflowFiles.length);
        expect(first.counts[SURFACE.planeOpener].total).toBe(censusPlaneOpeners({projectRoot: REPO_ROOT}).total);
        expect(first.schemaVersion).toBe('agentos-extraction-inventory.v5');
        expect(first.counts[SURFACE.launchRoot].total).toBe(first.launchRoots.total);
        expect(first.launchRoots.rows.map(row => row.identity))
            .toEqual(first.rows.filter(row => row.surface === SURFACE.launchRoot).map(row => row.identity));
        expect(first.launchRoots.total).toBe(
            Object.values(first.launchRoots.byVia).reduce((total, count) => total + count, 0)
        );
        expect(first.counts[SURFACE.packageDependency].total).toBe(packageDependencies.length);
        expect(first.packageDependencies.byManifest).toEqual({
            'package.brain.json': packageDependencies.filter(
                row => row.evidence.manifest === 'package.brain.json'
            ).length,
            'package.json': packageDependencies.filter(
                row => row.evidence.manifest === 'package.json'
            ).length
        });
        expect(first.packageDependencies.manifests.edge).toEqual(expect.objectContaining({
            '@modelcontextprotocol/sdk': expect.any(String),
            '@playwright/test'         : expect.any(String),
            ws                         : expect.any(String)
        }));
        expect(first.packageDependencies.manifests.cloud).toEqual(expect.objectContaining({
            '@modelcontextprotocol/sdk': expect.any(String),
            chromadb                   : expect.any(String)
        }));
        expect(first.packageDependencies.manifests.engine).toEqual(expect.objectContaining({
            '@playwright/test': expect.any(String),
            'fast-glob'       : expect.any(String)
        }));
        expect(first.packageDependencies.manifests.cloud.ws).toBeUndefined();
        expect(first.consumerEdges.total).toBeGreaterThan(0);
        expect(first.consumerEdges.byDirection).toEqual({
            [CONSUMER_EDGE_DIRECTION.agentOsToOutside]: expect.any(Number),
            [CONSUMER_EDGE_DIRECTION.outsideToAgentOs]: expect.any(Number)
        });
        expect(first.consumerEdges.byDirection[CONSUMER_EDGE_DIRECTION.agentOsToOutside]).toBeGreaterThan(0);
        expect(first.consumerEdges.byDirection[CONSUMER_EDGE_DIRECTION.outsideToAgentOs]).toBeGreaterThan(0);
        expect(first.consumerEdges.residue).toEqual({diskMinusAuthority: [], authorityMinusDisk: []});
        expect(first.workflowFiles.total).toBe(20);
        // 70, down from 73: the three `lint-skill-manifest.mjs` occurrences in skill-manifest-lint.yml
        // went with the lint when the corpus moved to neomjs/neo-agent-skills.
        expect(first.workflowFiles.occurrenceTotal).toBe(70);
        expect(first.workflowFiles.byDisposition).toEqual({move: 7, 'pin-fetch': 13, retire: 0});
        expect(first.workflowFiles.residue).toEqual({diskMinusAuthority: [], authorityMinusDisk: []});
        expect(first.workflowFiles.rows.map(row => row.identity)).toEqual(workflowFiles.sort());
        expect(first.workflowFiles.rows
            .filter(row => row.disposition === WORKFLOW_FILE_DISPOSITION.move)
            .every(row => row.targetRepository === 'neomjs/neo-agent-brain')).toBe(true);
        expect(first.workflowFiles.rows
            .filter(row => row.disposition === WORKFLOW_FILE_DISPOSITION.pinFetch)
            .every(row => !Object.hasOwn(row, 'targetRepository') && typeof row.pinAuthority === 'string'))
            .toBe(true);
        expect(first.consumerEdges.sourceClasses).toContainEqual(expect.objectContaining({
            identity   : 'test/playwright/unit/ai/**',
            disposition: 'moves-agentos-test',
            evidence   : expect.objectContaining({pathPrefix: 'test/playwright/unit/ai/'})
        }));
        expect(first.consumerEdges.rows).toEqual(expect.arrayContaining([
            expect.objectContaining({
                surface : SURFACE.consumerEdge,
                evidence: expect.objectContaining({
                    direction : CONSUMER_EDGE_DIRECTION.outsideToAgentOs,
                    sourcePath: 'test/playwright/fixtures.mjs'
                })
            }),
            expect.objectContaining({
                surface : SURFACE.consumerEdge,
                evidence: expect.objectContaining({
                    direction : CONSUMER_EDGE_DIRECTION.agentOsToOutside,
                    targetPath: 'src/Neo.mjs'
                })
            })
        ]));
        const consumerBySource = sourcePath => first.consumerEdges.rows.filter(
            row => row.evidence.sourcePath === sourcePath
        );

        expect(consumerBySource('test/playwright/restoreEmptyTargetMeasurementAdapter.mjs'))
            .toEqual(expect.arrayContaining([expect.objectContaining({disposition: 'moves-agentos-test'})]));
        expect(consumerBySource('test/playwright/e2e/agentos/AccountsConfigSurface.spec.mjs'))
            .toEqual(expect.arrayContaining([expect.objectContaining({disposition: 'served-contract-integration'})]));
        [
            '.claude/hooks/laneStateStopHook.mjs',
            '.codex/hooks/codex-context.mjs',
            '.kimi-code/hooks/turnPresenceHook.mjs'
        ].forEach(sourcePath => {
            expect(consumerBySource(sourcePath), sourcePath).toEqual(expect.arrayContaining([
                expect.objectContaining({disposition: 'generated-target-artifact'})
            ]))
        });

        for (const targetRoot of ['src/', 'apps/', 'buildScripts/']) {
            expect(first.consumerEdges.rows.some(row => row.evidence.direction ===
                CONSUMER_EDGE_DIRECTION.agentOsToOutside && row.evidence.targetPath.startsWith(targetRoot)),
            `outbound receipt must include ${targetRoot}`).toBe(true)
        }
        first.consumerEdges.rows.filter(row => row.evidence.direction ===
            CONSUMER_EDGE_DIRECTION.agentOsToOutside && row.evidence.targetPath.startsWith('src/'))
            .forEach(row => expect(row.disposition, row.identity).toBe('published-engine-package'));
        first.consumerEdges.rows.forEach(row => {
            expect(row.source, row.identity).toMatch(/:\d+$/);
            expect(row.rationale, row.identity).toBeTruthy();
            expect(['engine-continuity', 'move', 'seat-reprovisioning'], row.identity)
                .toContain(row.successorPhase)
        });
        expect(first.engineDependencyCovenant.ok).toBe(true);
        expect(first.engineDependencyCovenant.violations).toEqual([]);
        expect(first.engineDependencyCovenant.forbiddenPackages).toEqual([
            '@neomjs/neo-agent-brain', 'neo-agent-brain'
        ]);
        expect(first.runtimeProbeEligibility.ok).toBe(true);
        expect(first.runtimeProbeEligibility.total).toBe(
            first.runtimeProbeEligibility.rows.length
        );
        expect(first.runtimeProbeEligibility.byEligibility.eligible +
            first.runtimeProbeEligibility.byEligibility.ineligible).toBe(
            first.runtimeProbeEligibility.total
        );
        expect(first.runtimeProbeEligibility.total).toBe(
            first.launchRoots.rows.filter(row => row.disposition === 'edge').length
        );
        expect(first.runtimeProbeEligibility.rows).toEqual(expect.arrayContaining([
            expect.objectContaining({
                identity   : 'ai/daemons/wake/daemon.mjs',
                eligibility: 'eligible'
            }),
            expect.objectContaining({
                identity   : 'ai/mcp/server/neural-link/run-bridge.mjs',
                eligibility: 'ineligible'
            })
        ]));
        first.runtimeProbeEligibility.rows.forEach(row => {
            expect(['eligible', 'ineligible']).toContain(row.eligibility);
            expect(row.reason).toBeTruthy();
            expect(row.source).toBeTruthy()
        });

        const human = formatInventory(first);

        expect(human).toContain('launch-root identities:');
        expect(human).toContain('ai/daemons/wake/daemon.mjs — task:bridgeDaemon');
        expect(human).toContain('package-dependency identities:');
        expect(human).toContain('package.brain.json::devDependencies::better-sqlite3 @');
        expect(human).toContain('consumer-edge identities:');
        expect(human).toContain('preclassified source classes:');
        expect(human).toContain('workflow-file identities: 20 · occurrences 70');
        expect(human).toContain('pin-fetch: 13');
        expect(human).toContain('Engine→AgentOS forbidden packages:');

        const keys = first.rows.map(row => rowKey(row.surface, row.identity));

        expect(new Set(keys).size).toBe(keys.length);
        expect(keys).toEqual([...keys].sort((a, b) => a.localeCompare(b)));
        const validConsumerDispositions = new Set(Object.values(CONSUMER_EDGE_DISPOSITIONS)
            .flatMap(values => [...values]));

        first.rows.forEach(row => {
            if ([SURFACE.consumerEdge, SURFACE.consumerSourceClass].includes(row.surface)) {
                expect(validConsumerDispositions.has(row.disposition)).toBe(true)
            } else if (row.surface === SURFACE.workflowFile) {
                expect(Object.values(WORKFLOW_FILE_DISPOSITION)).toContain(row.disposition)
            } else {
                expect(['cloud', 'edge', 'retire', 'shared', 'stays-engine']).toContain(row.disposition)
            }
            expect(row.source).toBeTruthy();
            expect(row.rationale).toBeTruthy()
        });

        first.rows.filter(row => row.evidence?.override).forEach(row => {
            expect(row.authoritySource).toBeTruthy()
        });
        first.packageDependencies.rows.forEach(row => {
            expect(row.manifestTargets.length).toBeGreaterThan(0);
            expect(row.disposition).not.toBe('shared')
        });
        [
            SURFACE.launchRoot,
            SURFACE.packageDependency,
            SURFACE.rootScript,
            SURFACE.scriptModule,
            SURFACE.subprocessLaunch,
            SURFACE.workflowFile,
            SURFACE.workflowReference,
            SURFACE.consumerEdge,
            SURFACE.consumerSourceClass
        ].forEach(surface => {
            expect(first.rows.filter(row => row.surface === surface).every(row => row.evidence?.override),
                `${surface} custody must never fall through to current source shape`).toBe(true)
        });

        expect(first.rows).toContainEqual(expect.objectContaining({
            surface    : SURFACE.subprocessLaunch,
            identity   : 'ai/scripts/lifecycle/postReleaseSync.mjs::runCommand::ai/scripts/maintenance/uploadKnowledgeBase.mjs::1',
            disposition: 'cloud'
        }));
        expect(first.rows).toEqual(expect.arrayContaining([
            expect.objectContaining({
                surface    : SURFACE.subprocessLaunch,
                identity   : 'test/playwright/unit/ai/scripts/fleet/onboardPeer.spec.mjs::spawnSync::ai/scripts/fleet/onboardPeer.mjs::1',
                disposition: 'edge'
            }),
            expect.objectContaining({
                surface    : SURFACE.subprocessLaunch,
                identity   : 'test/playwright/unit/ai/scripts/maintenance/compactGraphLog.spec.mjs::spawnSync::ai/scripts/maintenance/compactGraphLog.mjs::1',
                disposition: 'cloud'
            }),
            expect.objectContaining({
                surface    : SURFACE.subprocessLaunch,
                identity   : 'test/playwright/unit/ai/scripts/migrations/canonicalizeStoredAgentIdentities.spec.mjs::spawnSync::ai/scripts/migrations/canonicalizeStoredAgentIdentities.mjs::1',
                disposition: 'cloud'
            })
        ]))
    })
});
