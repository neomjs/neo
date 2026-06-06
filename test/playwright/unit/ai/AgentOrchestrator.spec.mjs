import test         from '@playwright/test';
import fs           from 'fs';
import path         from 'path';
import Neo               from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import AgentOrchestrator from '../../../../ai/agent/AgentOrchestrator.mjs';

const createTestHandoff = (filename, content) => {
          const filePath = path.resolve(process.cwd(), filename);
          fs.writeFileSync(filePath, content, 'utf-8');
          return filePath;
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
              async initAsync() {
                  if (initError) {
                      throw initError;
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
    test('Golden Path regex correctly extracts issue IDs and descriptions', async () => {
        const content = `
# Autonomous Handoff

## Computed Golden Path (Strategic Recommendation)

Based on priorities, the following tasks are mathematically recommended:

1. **issue-9900**: Score 3.25 (Semantic: 1.12, Structural: 1.00)
   - *docs: restructure CodebaseOverview "Query Entry Points" to lead with ask_knowledge_base*
2. **issue-9844**: Score 2.08 (Semantic: 1.04, Structural: 0.00)
   - *feat: Implement Safe Commit Pipeline for Autonomous Agent Execution*

> **Strategic Interpretation:**
> Pivot memory synthesis.
`;

        const testHandoffPath = createTestHandoff('.neo-test-handoff.md', content);

        try {
            const orchestrator = Neo.create(AgentOrchestrator, {
                handoffPath: testHandoffPath
            });

            const directives = orchestrator.parseGoldenPath();

            test.expect(directives).not.toBeNull();
            test.expect(directives.length).toBe(2);
            test.expect(directives[0].issueId).toBe('9900');
            test.expect(directives[0].description).toBe('docs: restructure CodebaseOverview "Query Entry Points" to lead with ask_knowledge_base');
            test.expect(directives[1].issueId).toBe('9844');
        } finally {
            if (fs.existsSync(testHandoffPath)) {
                fs.unlinkSync(testHandoffPath);
            }
        }
    });

    test('Golden Path parser ignores visibility-only Silent Threads', async () => {
        const content = `
# Autonomous Handoff

## Silent Threads

- **[#7777](https://github.com/neomjs/neo/issues/7777)** — Quiet issue — 30 days idle; visibility-only, no routing

## Computed Golden Path (Strategic Recommendation)

1. **issue-9900**: Score 3.25 (Semantic: 1.12, Structural: 1.00)
   - *docs: restructure CodebaseOverview "Query Entry Points" to lead with ask_knowledge_base*
`;

        const testHandoffPath = createTestHandoff('.neo-test-handoff-silent.md', content);

        try {
            const orchestrator = Neo.create(AgentOrchestrator, {
                handoffPath: testHandoffPath
            });

            const directives = orchestrator.parseGoldenPath();

            test.expect(directives).not.toBeNull();
            test.expect(directives.length).toBe(1);
            test.expect(directives[0].issueId).toBe('9900');
            test.expect(directives.map(directive => directive.issueId)).not.toContain('7777');
        } finally {
            if (fs.existsSync(testHandoffPath)) {
                fs.unlinkSync(testHandoffPath);
            }
        }
    });

    test('execute records completed outcomes for exhausted Golden Path directives', async () => {
        const content = `
# Autonomous Handoff

## Computed Golden Path (Strategic Recommendation)

1. **issue-9900**: Score 3.25 (Semantic: 1.12, Structural: 1.00)
   - *docs: restructure CodebaseOverview "Query Entry Points" to lead with ask_knowledge_base*
2. **issue-9844**: Score 2.08 (Semantic: 1.04, Structural: 0.00)
   - *feat: Implement Safe Commit Pipeline for Autonomous Agent Execution*
`;

        const testHandoffPath = createTestHandoff('.neo-test-handoff-outcomes.md', content),
              outcomePath     = path.resolve(process.cwd(), '.neo-test-agent-orchestrator/completed.jsonl'),
              fakeAgent       = createFakeAgent(),
              healthCalls     = [],
              exitCodes       = [],
              times           = [
                  '2026-06-06T08:00:00.000Z',
                  '2026-06-06T08:00:03.000Z'
              ];

        try {
            const orchestrator = Neo.create(AgentOrchestrator, {
                agentFactory     : () => fakeAgent,
                exitHandler      : code => exitCodes.push(code),
                handoffPath      : testHandoffPath,
                healthService    : {
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
        const content = `
# Autonomous Handoff

## Computed Golden Path (Strategic Recommendation)

1. **issue-9900**: Score 3.25 (Semantic: 1.12, Structural: 1.00)
   - *docs: restructure CodebaseOverview "Query Entry Points" to lead with ask_knowledge_base*
`;

        const testHandoffPath = createTestHandoff('.neo-test-handoff-failed.md', content),
              outcomePath     = path.resolve(process.cwd(), '.neo-test-agent-orchestrator/failed.jsonl'),
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
                agentFactory     : () => createFakeAgent({failedEvents}),
                exitHandler      : () => {},
                handoffEmitter   : outcome => {
                    handoffCalls.push(outcome);
                    return 'MESSAGE:failed';
                },
                handoffPath      : testHandoffPath,
                healthService    : {
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
        const content = `
# Autonomous Handoff

## Computed Golden Path (Strategic Recommendation)

1. **issue-9900**: Score 3.25 (Semantic: 1.12, Structural: 1.00)
   - *docs: restructure CodebaseOverview "Query Entry Points" to lead with ask_knowledge_base*
`;

        const testHandoffPath = createTestHandoff('.neo-test-handoff-blocked.md', content),
              outcomePath     = path.resolve(process.cwd(), '.neo-test-agent-orchestrator/blocked.jsonl'),
              failedEvents    = [{
                  error     : 'blocked-task-state: credentials required',
                  event     : {
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
        const content = `
# Autonomous Handoff

## Computed Golden Path (Strategic Recommendation)

1. **issue-9900**: Score 3.25 (Semantic: 1.12, Structural: 1.00)
   - *docs: restructure CodebaseOverview "Query Entry Points" to lead with ask_knowledge_base*
`;

        const testHandoffPath = createTestHandoff('.neo-test-handoff-expired.md', content),
              outcomePath     = path.resolve(process.cwd(), '.neo-test-agent-orchestrator/expired.jsonl'),
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
                handoffPath       : testHandoffPath,
                monitorIntervalMs : 50,
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
        const content = `
# Autonomous Handoff

## Computed Golden Path (Strategic Recommendation)

1. **issue-9920**: Score 4.00 (Semantic: 1.00, Structural: 1.00)
   - *Golden Path issue-task failure envelope and requeue policy*
`;

        const testHandoffPath = createTestHandoff('.neo-test-handoff-crashed.md', content),
              outcomePath     = path.resolve(process.cwd(), '.neo-test-agent-orchestrator/crashed.jsonl'),
              initError       = new Error('boot failed'),
              handoffCalls    = [],
              times           = [
                  '2026-06-06T09:00:00.000Z',
                  '2026-06-06T09:00:01.000Z'
              ];

        try {
            const orchestrator = Neo.create(AgentOrchestrator, {
                agentFactory     : () => createFakeAgent({initError}),
                handoffEmitter   : outcome => {
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
        const content = `
# Autonomous Handoff

## Computed Golden Path (Strategic Recommendation)

1. **issue-9900**: Score 3.25 (Semantic: 1.12, Structural: 1.00)
   - *docs: restructure CodebaseOverview "Query Entry Points" to lead with ask_knowledge_base*
`;

        const testHandoffPath = createTestHandoff('.neo-test-handoff-health-fallback.md', content),
              outcomePath     = path.resolve(process.cwd(), '.neo-test-agent-orchestrator/health-fallback.jsonl'),
              exitCodes       = [];

        try {
            const orchestrator = Neo.create(AgentOrchestrator, {
                agentFactory     : () => createFakeAgent(),
                exitHandler      : code => exitCodes.push(code),
                handoffPath      : testHandoffPath,
                healthService    : {
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
            runId      : 'run-invalid',
            directive  : {
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
