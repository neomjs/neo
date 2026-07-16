import test              from '@playwright/test';
import fs                from 'fs';
import os                from 'os';
import path              from 'path';
import Neo               from '../../../../src/Neo.mjs';
import * as core         from '../../../../src/core/_export.mjs';
import AgentOrchestrator from '../../../../ai/agent/AgentOrchestrator.mjs';

/**
 * @summary Creates a private outcome directory for one fully-parallel test so another test's
 * cleanup cannot remove its JSONL evidence.
 * @param {String} filename Outcome filename.
 * @returns {String}
 */
const createOutcomePath = filename => path.join(
          fs.mkdtempSync(path.join(os.tmpdir(), 'neo-test-agent-orchestrator-')),
          filename
      ),
      // A fixture representing a FRESH route must carry a complete freshness proof: a real future
      // expiry, matching freshness, and named provenance. An absent expiry is a falsifier case
      // below — never the happy-path default (a fixture without one silently blesses a bypass).
      writeComputedRoute = (items, {kind = 'computed-ranked', extra = {}} = {}) => {
          const dir        = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-test-agent-route-')),
                capturedAt = new Date(Date.now() - 60 * 1000).toISOString(),
                expiresAt  = new Date(Date.now() + 60 * 60 * 1000).toISOString();

          fs.writeFileSync(path.join(dir, 'computed-route.json'), JSON.stringify({
              schemaVersion     : 'computed-route.v1',
              status            : 'fresh',
              notAuthority      : true,
              capturedAt,
              expiresAt,
              routeVersion      : 'rv-test',
              sourceManifestHash: 'hash-test',
              sourceWatermark   : 'wm-test',
              provenance        : {producer: 'GoldenPathSynthesizer', runId: null, algorithmVersion: 'v-test', citations: []},
              freshness         : {status: 'fresh', checkedAt: capturedAt, expiresAt},
              route             : {kind, items},
              ...extra
          }), 'utf-8');
          return path.join(dir, 'sandman_handoff.md');
      },
      readJsonl = filePath => fs.readFileSync(filePath, 'utf-8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map(line => JSON.parse(line)),
      createFakeAgent = ({
          failedEvents = [],
          initError = null,
          onSchedule = null,
          schedulerEmpty = true
      } = {}) => {
          const agent = {
              activeSubAgents: {},
              disconnected   : false,
              loop           : {
                  failedEvents,
                  processing: false,
                  scheduler : {
                      isEmpty: () => schedulerEmpty
                  }
              },
              scheduled: [],
              // the Agent readiness contract: construct auto-fires init; ready() resolves on a
              // healthy boot and re-throws the captured boot failure — the crashed-outcome spec
              // below pins that a failed boot never looks success-shaped
              initError,
              async ready() {
                  if (this.initError) {
                      throw this.initError;
                  }
              },
              schedule(event) {
                  this.scheduled.push(event);
                  onSchedule?.(event);
              },
              start() {},
              disconnect() {
                  this.disconnected = true;
              }
          };

          return agent;
      };

test.describe('Neo.ai.agent.AgentOrchestrator', () => {
    test('readComputedRoute maps the typed computed-ranked route to issue directives', () => {
        const handoffPath = writeComputedRoute([
            {id: 'issue-9900', title: 'docs: restructure CodebaseOverview "Query Entry Points"'},
            {id: 'issue-9844', title: 'feat: Implement Safe Commit Pipeline'}
        ]);

        const orchestrator = Neo.create(AgentOrchestrator, {handoffPath});
        const directives   = orchestrator.readComputedRoute();

        test.expect(directives.length).toBe(2);
        test.expect(directives[0].issueId).toBe('9900');
        test.expect(directives[0].description).toBe('docs: restructure CodebaseOverview "Query Entry Points"');
        test.expect(directives[1].issueId).toBe('9844');
    });

    test('readComputedRoute fail-open: a missing sidecar yields zero directives', () => {
        const orchestrator = Neo.create(AgentOrchestrator, {
            handoffPath: path.join(os.tmpdir(), 'neo-test-no-such-dir-xyz', 'sandman_handoff.md')
        });

        test.expect(orchestrator.readComputedRoute()).toEqual([]);
    });

    test('readComputedRoute routes a current-focus-substitution route — the never-empty floor is preserved', () => {
        // When every computed candidate is blocked by live Current Focus, the producer emits a
        // current-focus-substitution route carrying the actionable focus item; the consumer routes it.
        // The blocked content candidate is diagnostic-only and never appears in route.items.
        const handoffPath = writeComputedRoute(
            [{id: 'issue-14988', title: 'Fleet auth restart supervised'}],
            {kind: 'current-focus-substitution'}
        );

        const orchestrator = Neo.create(AgentOrchestrator, {handoffPath});
        const directives   = orchestrator.readComputedRoute();

        test.expect(directives.length).toBe(1);
        test.expect(directives[0].issueId).toBe('14988');
        test.expect(directives.map(directive => directive.issueId)).not.toContain('200');
    });

    test('readComputedRoute does NOT route declared-intent advisory items — advisory, not executed route', () => {
        // The declared-intent fallback is an empty route (kind none) carrying advisory context only.
        // Routing it would make declared intent gate execution; the executable slot is route.items only.
        const handoffPath = writeComputedRoute([], {
            kind : 'none',
            extra: {
                status          : 'empty',
                advisoryFallback: {
                    kind  : 'declared-intent',
                    status: 'available',
                    items : [{id: 'issue-14620', title: 'Unblocked epic leaf'}]
                }
            }
        });

        const orchestrator = Neo.create(AgentOrchestrator, {handoffPath});

        test.expect(orchestrator.readComputedRoute()).toEqual([]);
    });

    test('readComputedRoute REFUSES a route carrying no expiresAt — absent freshness proof is never read as freshness', () => {
        // The exact bypass the consumer previously carried: an `expiresAt &&` guard skipped the
        // expiry gate whenever the field was absent, so a route with no freshness proof executed.
        // JSON.stringify drops the undefined key, reproducing a sidecar written without an expiry.
        const handoffPath = writeComputedRoute(
            [{id: 'issue-1', title: 'Must not route without an expiry'}],
            {extra: {expiresAt: undefined}}
        );

        const orchestrator = Neo.create(AgentOrchestrator, {handoffPath});

        test.expect(orchestrator.readComputedRoute()).toEqual([]);
    });

    test('readComputedRoute REFUSES an expired route', () => {
        const past        = new Date(Date.now() - 60 * 1000).toISOString(),
              handoffPath = writeComputedRoute(
                  [{id: 'issue-1', title: 'Expired route'}],
                  {extra: {expiresAt: past, freshness: {status: 'fresh', checkedAt: past, expiresAt: past}}}
              );

        const orchestrator = Neo.create(AgentOrchestrator, {handoffPath});

        test.expect(orchestrator.readComputedRoute()).toEqual([]);
    });

    test('readComputedRoute REFUSES an executable route carried under a non-fresh status', () => {
        // A stale/degraded/missing pass outcome must never route, even when it carries a populated
        // executable slot — that combination is a producer breach, not a route to run.
        const handoffPath = writeComputedRoute(
            [{id: 'issue-1', title: 'Executable slot under a stale status'}],
            {extra: {status: 'stale'}}
        );

        const orchestrator = Neo.create(AgentOrchestrator, {handoffPath});

        test.expect(orchestrator.readComputedRoute()).toEqual([]);
    });

    test('readComputedRoute REFUSES the WHOLE route when any item is malformed', () => {
        // Never a partial route: executing only the well-formed subset would silently drop work the
        // producer believed it had routed.
        const handoffPath = writeComputedRoute([
            {id: 'issue-1', title: 'Well formed'},
            {id: 'issue-2'}
        ]);

        const orchestrator = Neo.create(AgentOrchestrator, {handoffPath});

        test.expect(orchestrator.readComputedRoute()).toEqual([]);
    });

    test('readComputedRoute REFUSES an unattributed route (no provenance.producer)', () => {
        const handoffPath = writeComputedRoute(
            [{id: 'issue-1', title: 'Unattributed route'}],
            {extra: {provenance: {runId: null, algorithmVersion: 'v-test', citations: []}}}
        );

        const orchestrator = Neo.create(AgentOrchestrator, {handoffPath});

        test.expect(orchestrator.readComputedRoute()).toEqual([]);
    });

    test('execute records completed outcomes for exhausted Golden Path directives', async () => {
        const testHandoffPath = writeComputedRoute([{id: 'issue-9900', title: 'docs: restructure CodebaseOverview'}, {id: 'issue-9844', title: 'feat: Safe Commit Pipeline'}]),
              outcomePath     = createOutcomePath('completed.jsonl'),
              fakeAgent       = createFakeAgent(),
              healthCalls     = [],
              exitCodes       = [],
              // Consumed in call order: the first tick is readComputedRoute's route-expiry check,
              // then the outcome start/end. Route admission always costs one now() read — the
              // consumer checks expiry unconditionally rather than skipping it when absent.
              times           = [
                  '2026-06-06T08:00:00.000Z',
                  '2026-06-06T08:00:00.000Z',
                  '2026-06-06T08:00:03.000Z'
              ];

        try {
            const orchestrator = Neo.create(AgentOrchestrator, {
                agentFactory : () => fakeAgent,
                exitHandler  : code => exitCodes.push(code),
                handoffPath  : testHandoffPath,
                healthService: {
                    recordTaskOutcome: (...args) => healthCalls.push(args)
                },
                monitorIntervalMs: 1,
                now              : () => new Date(times.shift() || '2026-06-06T08:00:03.000Z'),
                outcomePath
            });

            await orchestrator.execute({runId: 'run-completed'});

            const outcomes = readJsonl(outcomePath);

            test.expect(fakeAgent.scheduled).toHaveLength(2);
            test.expect(fakeAgent.scheduled[0]).toMatchObject({
                type    : 'system:golden-path',
                priority: 'high',
                data    : {
                    issueId: '9900'
                }
            });
            test.expect(fakeAgent.disconnected).toBe(true);
            test.expect(exitCodes).toEqual([0]);
            test.expect(outcomes).toHaveLength(2);
            test.expect(outcomes[0]).toMatchObject({
                runId           : 'run-completed',
                issueId         : '9900',
                startedAt       : '2026-06-06T08:00:00.000Z',
                completedAt     : '2026-06-06T08:00:03.000Z',
                status          : 'completed',
                reasonCode      : 'queue-exhausted',
                retryPolicy     : 'no-retry',
                error           : null,
                handoffMessageId: null
            });
            test.expect(outcomes[1].issueId).toBe('9844');
            test.expect(healthCalls).toHaveLength(2);
            test.expect(healthCalls[0][0]).toBe('agent-orchestrator');
            test.expect(healthCalls[0][1]).toBe('completed');
            test.expect(healthCalls[0][2]).toMatchObject({issueId: '9900'});
        } finally {
            if (fs.existsSync(testHandoffPath)) {
                fs.unlinkSync(testHandoffPath);
            }
            fs.rmSync(path.dirname(outcomePath), {recursive: true, force: true});
        }
    });

    test('execute records failed outcomes for Golden Path dead-letter events', async () => {
        const testHandoffPath = writeComputedRoute([{id: 'issue-9900', title: 'docs: restructure CodebaseOverview'}]),
              outcomePath     = createOutcomePath('failed.jsonl'),
              handoffCalls    = [],
              healthCalls     = [],
              failedEvents    = [{
                  error: 'tool failed after max retries',
                  event: {
                      type: 'system:golden-path',
                      data: {
                          issueId: '9900'
                      }
                  }
              }];

        try {
            const orchestrator = Neo.create(AgentOrchestrator, {
                agentFactory  : () => createFakeAgent({failedEvents}),
                exitHandler   : () => {},
                handoffEmitter: outcome => {
                    handoffCalls.push(outcome);
                    return 'MESSAGE:failed';
                },
                handoffPath  : testHandoffPath,
                healthService: {
                    recordTaskOutcome: (...args) => healthCalls.push(args)
                },
                monitorIntervalMs: 1,
                outcomePath
            });

            await orchestrator.execute({runId: 'run-failed'});

            const outcomes = readJsonl(outcomePath);

            test.expect(outcomes).toHaveLength(1);
            test.expect(outcomes[0]).toMatchObject({
                runId           : 'run-failed',
                issueId         : '9900',
                status          : 'failed',
                reasonCode      : 'productive-failure-tripwire',
                retryPolicy     : 'demote-next-cycle',
                handoffMessageId: 'MESSAGE:failed'
            });
            test.expect(outcomes[0].error).toMatchObject({
                message: 'tool failed after max retries',
                name   : 'Error'
            });
            test.expect(handoffCalls).toHaveLength(1);
            test.expect(healthCalls[0][1]).toBe('failed');
        } finally {
            if (fs.existsSync(testHandoffPath)) {
                fs.unlinkSync(testHandoffPath);
            }
            fs.rmSync(path.dirname(outcomePath), {recursive: true, force: true});
        }
    });

    test('execute records blocked outcomes for blocked-task-state dead-letter events', async () => {
        const testHandoffPath = writeComputedRoute([{id: 'issue-9900', title: 'docs: restructure CodebaseOverview'}]),
              outcomePath     = createOutcomePath('blocked.jsonl'),
              failedEvents    = [{
                  error: 'blocked-task-state: credentials required',
                  event: {
                      type: 'system:golden-path',
                      data: {
                          issueId: '9900'
                      }
                  },
                  reasonCode: 'blocked-task-state'
              }];

        try {
            const orchestrator = Neo.create(AgentOrchestrator, {
                agentFactory     : () => createFakeAgent({failedEvents}),
                exitHandler      : () => {},
                handoffPath      : testHandoffPath,
                monitorIntervalMs: 1,
                outcomePath
            });

            await orchestrator.execute({runId: 'run-blocked'});

            const outcomes = readJsonl(outcomePath);

            test.expect(outcomes).toHaveLength(1);
            test.expect(outcomes[0]).toMatchObject({
                runId      : 'run-blocked',
                issueId    : '9900',
                status     : 'blocked',
                reasonCode : 'blocked-task-state',
                retryPolicy: 'blocked-handoff'
            });
        } finally {
            if (fs.existsSync(testHandoffPath)) {
                fs.unlinkSync(testHandoffPath);
            }
            fs.rmSync(path.dirname(outcomePath), {recursive: true, force: true});
        }
    });

    test('execute records expired outcomes when execution timeout fires', async () => {
        const testHandoffPath = writeComputedRoute([{id: 'issue-9900', title: 'docs: restructure CodebaseOverview'}]),
              outcomePath     = createOutcomePath('expired.jsonl'),
              exitCodes       = [],
              handoffCalls    = [];

        try {
            const orchestrator = Neo.create(AgentOrchestrator, {
                agentFactory      : () => createFakeAgent({schedulerEmpty: false}),
                executionTimeoutMs: 1,
                exitHandler       : code => exitCodes.push(code),
                handoffEmitter    : outcome => {
                    handoffCalls.push(outcome);
                    return 'MESSAGE:expired';
                },
                handoffPath      : testHandoffPath,
                monitorIntervalMs: 50,
                outcomePath
            });

            await orchestrator.execute({runId: 'run-expired'});

            const outcomes = readJsonl(outcomePath);

            test.expect(outcomes).toHaveLength(1);
            test.expect(outcomes[0]).toMatchObject({
                runId           : 'run-expired',
                issueId         : '9900',
                status          : 'expired',
                reasonCode      : 'execution-timeout',
                retryPolicy     : 'preserve-urgency',
                handoffMessageId: 'MESSAGE:expired'
            });
            test.expect(outcomes[0].error.message).toContain('execution exceeded 1ms');
            test.expect(exitCodes).toEqual([1]);
            test.expect(handoffCalls).toHaveLength(1);
        } finally {
            if (fs.existsSync(testHandoffPath)) {
                fs.unlinkSync(testHandoffPath);
            }
            fs.rmSync(path.dirname(outcomePath), {recursive: true, force: true});
        }
    });

    test('execute records crashed outcome and handoff id when agent bootstrap fails', async () => {
        const testHandoffPath = writeComputedRoute([{id: 'issue-9920', title: 'Golden Path failure envelope'}]),
              outcomePath     = createOutcomePath('crashed.jsonl'),
              initError       = new Error('boot failed'),
              handoffCalls    = [],
              // Consumed in call order: the first tick is readComputedRoute's route-expiry check,
              // then the outcome start/end.
              times           = [
                  '2026-06-06T09:00:00.000Z',
                  '2026-06-06T09:00:00.000Z',
                  '2026-06-06T09:00:01.000Z'
              ];

        try {
            const orchestrator = Neo.create(AgentOrchestrator, {
                agentFactory  : () => createFakeAgent({initError}),
                handoffEmitter: outcome => {
                    handoffCalls.push(outcome);
                    return {messageId: 'MESSAGE:crash'};
                },
                handoffPath      : testHandoffPath,
                monitorIntervalMs: 1,
                now              : () => new Date(times.shift() || '2026-06-06T09:00:01.000Z'),
                outcomePath
            });

            await test.expect(orchestrator.execute({runId: 'run-crashed'})).rejects.toThrow('boot failed');

            const outcomes = readJsonl(outcomePath);

            test.expect(outcomes).toHaveLength(1);
            test.expect(outcomes[0]).toMatchObject({
                runId           : 'run-crashed',
                issueId         : '9920',
                startedAt       : '2026-06-06T09:00:00.000Z',
                completedAt     : '2026-06-06T09:00:01.000Z',
                status          : 'crashed',
                reasonCode      : 'agent-uncaught-error',
                retryPolicy     : 'preserve-urgency',
                handoffMessageId: 'MESSAGE:crash'
            });
            test.expect(outcomes[0].error).toMatchObject({
                message: 'boot failed',
                name   : 'Error'
            });
            test.expect(handoffCalls).toHaveLength(1);
            test.expect(handoffCalls[0]).toMatchObject({
                issueId   : '9920',
                status    : 'crashed',
                reasonCode: 'agent-uncaught-error'
            });
        } finally {
            if (fs.existsSync(testHandoffPath)) {
                fs.unlinkSync(testHandoffPath);
            }
            fs.rmSync(path.dirname(outcomePath), {recursive: true, force: true});
        }
    });

    test('health projection failures do not block JSONL outcome persistence', async () => {
        const testHandoffPath = writeComputedRoute([{id: 'issue-9900', title: 'docs: restructure CodebaseOverview'}]),
              outcomePath     = createOutcomePath('health-fallback.jsonl'),
              exitCodes       = [];

        try {
            const orchestrator = Neo.create(AgentOrchestrator, {
                agentFactory : () => createFakeAgent(),
                exitHandler  : code => exitCodes.push(code),
                handoffPath  : testHandoffPath,
                healthService: {
                    recordTaskOutcome: () => {
                        throw new Error('health down');
                    }
                },
                monitorIntervalMs: 1,
                outcomePath
            });

            await orchestrator.execute({runId: 'run-health-fallback'});

            const outcomes = readJsonl(outcomePath);

            test.expect(outcomes).toHaveLength(1);
            test.expect(outcomes[0]).toMatchObject({
                runId : 'run-health-fallback',
                status: 'completed'
            });
            test.expect(exitCodes).toEqual([0]);
        } finally {
            if (fs.existsSync(testHandoffPath)) {
                fs.unlinkSync(testHandoffPath);
            }
            fs.rmSync(path.dirname(outcomePath), {recursive: true, force: true});
        }
    });

    test('createOutcome rejects unsupported outcome vocabulary', async () => {
        const orchestrator = Neo.create(AgentOrchestrator, {});

        test.expect(() => orchestrator.createOutcome({
            runId    : 'run-invalid',
            directive: {
                issueId    : '1',
                description: 'invalid vocabulary'
            },
            startedAt  : '2026-06-06T09:00:00.000Z',
            completedAt: '2026-06-06T09:00:01.000Z',
            status     : 'complete',
            reasonCode : 'queue-exhausted',
            retryPolicy: 'no-retry'
        })).toThrow('unsupported outcome status');
    });
});
