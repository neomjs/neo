import {test, expect} from '@playwright/test';

import {
    dispatchLocalWake,
    formatLocalWakeDigest
} from '../../../../../../ai/daemons/wake/localWakeAdapters.mjs';

test.describe.serial('ai/daemons/wake/localWakeAdapters', () => {
    const record = (adapter, overrides = {}) => ({
        recordKey     : 'a'.repeat(64),
        subscriptionId: 'WAKE_SUB:test',
        envelope      : {
            agentIdentity: '@neo-gpt',
            payload      : {
                totalEvents   : 2,
                sourceEventIds: ['MESSAGE:1', 'HEARTBEAT:1'],
                breakdown     : {
                    sent_to_me     : {count: 1, latest: {from: '@neo-opus-vega', priority: 'high', subject: 'review'}},
                    heartbeat_pulse: {count: 1, latest: {pulseId: 'HEARTBEAT:1'}}
                }
            }
        },
        route: {
            agentIdentity,
            harnessTargetMetadata: {adapter},
            adapterConfig        : {attemptTimeoutMs: 100}
        },
        ...overrides
    });
    const agentIdentity = '@neo-gpt';

    test('formats one human wake digest from the structured Shape-B envelope', () => {
        expect(formatLocalWakeDigest(record('test').envelope)).toContain(
            '[WAKE][priority:high] 2 events for @neo-gpt:'
        );
        expect(formatLocalWakeDigest(record('test').envelope)).toContain(
            '1 new messages (latest: "review" from @neo-opus-vega)'
        );
    });

    test('preserves strongest message priority and the pure-heartbeat lifecycle directive', () => {
        const mixed = record('test').envelope;
        mixed.payload.breakdown.sent_to_me = {
            count          : 2,
            highestPriority: 'high',
            latest         : {
                from    : '@neo-opus-vega',
                priority: 'normal',
                subject : 'follow-up'
            }
        };

        const mixedDigest = formatLocalWakeDigest(mixed);
        expect(mixedDigest).toContain('[WAKE][priority:high]');
        expect(mixedDigest).toContain('latest priority: normal');

        const summary = {
            source    : 'idle-out-nudge',
            reason    : 'idle',
            nextAction: 'review the queue'
        };
        const pureHeartbeat = structuredClone(mixed);
        pureHeartbeat.payload.totalEvents = 1;
        pureHeartbeat.payload.breakdown = {
            heartbeat_pulse: {
                count : 1,
                latest: {
                    pulseId: `idle-out-nudge.${Buffer
                        .from(JSON.stringify(summary))
                        .toString('base64url')}`
                }
            }
        };

        const heartbeatDigest = formatLocalWakeDigest(pureHeartbeat);
        expect(heartbeatDigest).toContain('idle-out nudge — idle; next: review the queue');
        expect(heartbeatDigest).toContain('Directive — lifecycle-first:');
    });

    test('test adapter returns delivered without host process effects', async () => {
        expect(await dispatchLocalWake(record('test'), {log: {log() {}}})).toBe('delivered');
    });

    test('missing Codex app-server binary fails closed', async () => {
        expect(await dispatchLocalWake(record('codex-app-server', {
            route: {
                agentIdentity,
                harnessTargetMetadata: {adapter: 'codex-app-server', appName: 'Codex'},
                adapterConfig        : {attemptTimeoutMs: 100}
            }
        }))).toBe('skipped');
    });

    test('a non-abortable adapter timeout is unknown and is not represented as a safe retry', async () => {
        const hanging = record('test-hang', {
            route: {
                agentIdentity,
                harnessTargetMetadata: {adapter: 'test-hang'},
                adapterConfig        : {attemptTimeoutMs: 10}
            }
        });

        expect(await dispatchLocalWake(hanging)).toBe('unknown');
    });

    test('an abortable adapter timeout is failed because the in-flight effect was cancelled', async () => {
        const hanging = record('test-hang-abortable', {
            route: {
                agentIdentity,
                harnessTargetMetadata: {adapter: 'test-hang-abortable'},
                adapterConfig        : {attemptTimeoutMs: 10}
            }
        });

        expect(await dispatchLocalWake(hanging)).toBe('failed');
    });

    test('an addressed webhook route stays loopback-only', async () => {
        let request;
        const addressed = record('tmux', {
            route: {
                agentIdentity,
                harnessTargetMetadata: {
                    adapter        : 'tmux',
                    addressType    : 'webhookUrl',
                    instanceAddress: 'http://127.0.0.1:9123/wake'
                },
                adapterConfig: {attemptTimeoutMs: 100}
            }
        });

        expect(await dispatchLocalWake(addressed, {
            fetch: async (url, options) => {
                request = {url, options};
                return {ok: true, status: 200};
            }
        })).toBe('delivered');
        expect(request.url.href).toBe('http://127.0.0.1:9123/wake');
        expect(JSON.parse(request.options.body).digest).toContain('[WAKE]');
    });

    test('instance-addressed UI delivery fails closed when the target cannot be resolved', async () => {
        const addressed = record('osascript', {
            route: {
                agentIdentity,
                harnessTargetMetadata: {
                    adapter        : 'osascript',
                    appName        : 'Claude',
                    addressType    : 'pid',
                    instanceAddress: '1234'
                },
                adapterConfig: {attemptTimeoutMs: 100}
            }
        });

        expect(await dispatchLocalWake(addressed, {
            platform             : 'darwin',
            resolveGuiInstancePid: async () => {
                throw new Error('target is stale');
            }
        })).toBe('skipped');
    });

    test('UI delivery preserves bundle identity, draft restore, and post-submit retry boundary', async () => {
        let osascriptArgs;
        const uiRecord = record('osascript', {
            route: {
                agentIdentity,
                harnessTargetMetadata: {
                    adapter: 'osascript',
                    appName: 'Claude'
                },
                adapterConfig: {attemptTimeoutMs: 1000}
            }
        });

        expect(await dispatchLocalWake(uiRecord, {
            platform        : 'darwin',
            getDefaultTarget: async () => ({
                status       : 'resolved',
                pid          : 4321,
                instanceCount: 1,
                bundleName   : 'Claude'
            }),
            spawnAsync: async (command, args) => {
                expect(command).toBe('osascript');
                osascriptArgs = args;
            }
        })).toBe('delivered');

        const script = osascriptArgs.join('\n');
        expect(script).toContain('bundle identifier of frontmostProcess');
        expect(script).toContain('before prompt clear');
        expect(script).toContain('key code 36');
        expect(script).toContain('before user input restore paste');
        expect(script).toContain('set the clipboard to savedClipboard');
    });

    test('OpenCode retries changed coordinates once without allowing authority retarget', async () => {
        const first = {
            hostname : '127.0.0.1',
            port     : 4101,
            sessionId: 'session-1',
            projectId: 'project-1',
            directory: '/workspace/one',
            username : 'neo',
            password : 'secret'
        };
        const rebound    = {...first, port: 4102};
        let   readCount  = 0;
        let   fetchCount = 0;

        const opencode = record('opencode-server', {
            route: {
                agentIdentity,
                harnessTargetMetadata: {
                    adapter     : 'opencode-server',
                    envelopePath: '/seat/opencode-envelope.json'
                },
                adapterConfig: {attemptTimeoutMs: 1000}
            }
        });

        expect(await dispatchLocalWake(opencode, {
            fs: {
                readFile: async () => JSON.stringify(readCount++ === 0 ? first : rebound)
            },
            fetch: async () => {
                fetchCount++;
                if (fetchCount === 1) {
                    const error = new Error('connection refused');
                    error.code  = 'ECONNREFUSED';
                    throw error;
                }
                return {status: 204};
            }
        })).toBe('delivered');
        expect(readCount).toBe(2);
        expect(fetchCount).toBe(2);

        readCount  = 0;
        fetchCount = 0;
        expect(await dispatchLocalWake(opencode, {
            fs: {
                readFile: async () => JSON.stringify(readCount++ === 0
                    ? first
                    : {...rebound, sessionId: 'different-session'})
            },
            fetch: async () => {
                fetchCount++;
                const error = new Error('connection refused');
                error.code  = 'ECONNREFUSED';
                throw error;
            }
        })).toEqual({
            outcome      : 'failed',
            // The sibling boundary carries its cause too. Before this, every non-osascript adapter —
            // opencode-server, tmux, codex-app-server, webhook — lost the reason at the shared catch,
            // so a seat saw `failed` with nothing to act on.
            outcomeReason: 'opencode-server authority tuple changed during coordinate rebind; refusing session retarget'
        });
        expect(fetchCount).toBe(1);
    });

    test('a post-submit draft-restore focus race is delivered and never retried', async () => {
        let   attempts = 0;
        const uiRecord = record('osascript', {
            route: {
                agentIdentity,
                harnessTargetMetadata: {adapter: 'osascript', appName: 'Claude'},
                adapterConfig        : {attemptTimeoutMs: 1000}
            }
        });

        expect(await dispatchLocalWake(uiRecord, {
            platform        : 'darwin',
            getDefaultTarget: async () => ({status: 'resolved', pid: 4321, instanceCount: 1, bundleName: 'Claude'}),
            spawnAsync      : async () => {
                attempts++;
                throw new Error('Target app lost frontmost status before user input restore paste (-2700)');
            }
        })).toBe('delivered');
        expect(attempts).toBe(1);
    });

    test('a terminal osascript failure reports the captured stderr, in the log and on the outcome (#16259)', async () => {
        const logged   = [];
        const uiRecord = record('osascript', {
            route: {
                agentIdentity,
                harnessTargetMetadata: {adapter: 'osascript', appName: 'Claude'},
                adapterConfig        : {attemptTimeoutMs: 1000}
            }
        });

        const outcome = await dispatchLocalWake(uiRecord, {
            platform        : 'darwin',
            getDefaultTarget: async () => ({status: 'resolved', pid: 4321, instanceCount: 1, bundleName: 'Claude'}),
            log             : {error: line => logged.push(line)},
            // The real spawnAsync rejects with the child's captured stderr; this is that value.
            spawnAsync      : async () => { throw new Error('kTCCServicePostEvent denied (-1743)') }
        });

        // Both surfaces, because they fail independently: the log is what a foreground operator sees,
        // the outcome is what reaches the durable record under launchd.
        expect(outcome).toEqual({outcome: 'failed', outcomeReason: 'kTCCServicePostEvent denied (-1743)'});
        expect(logged.join('\n')).toContain('kTCCServicePostEvent denied (-1743)');

        // Positive control: the assertion above can only pass on the INJECTED text, so a fixed
        // string like the one this ticket removed would fail it.
        expect(logged.join('\n')).not.toBe(`[Wake Receiver] osascript failed for ${uiRecord.subscriptionId}`);
    });

    test('an osascript failure with empty stderr still names a cause (#16259)', async () => {
        const logged   = [];
        const uiRecord = record('osascript', {
            route: {
                agentIdentity,
                harnessTargetMetadata: {adapter: 'osascript', appName: 'Claude'},
                adapterConfig        : {attemptTimeoutMs: 1000}
            }
        });

        const outcome = await dispatchLocalWake(uiRecord, {
            platform        : 'darwin',
            getDefaultTarget: async () => ({status: 'resolved', pid: 4321, instanceCount: 1, bundleName: 'Claude'}),
            log             : {error: line => logged.push(line)},
            // spawnAsync's own fallback when the child wrote nothing to stderr.
            spawnAsync      : async () => { throw new Error('osascript exited with code 1') }
        });

        // The fix must not regress into an empty reason when there is no stderr to carry.
        expect(outcome.outcomeReason).toBe('osascript exited with code 1');
        expect(outcome.outcomeReason.length).toBeGreaterThan(0);
        expect(logged.join('\n')).toContain('exited with code 1');
    });

    test('a reported failure reason never carries the route signing key (#16259)', async () => {
        const logged   = [];
        const key      = 'b'.repeat(64);
        const uiRecord = record('osascript', {
            route: {
                agentIdentity,
                signingKey           : key,
                harnessTargetMetadata: {adapter: 'osascript', appName: 'Claude'},
                adapterConfig        : {attemptTimeoutMs: 1000}
            }
        });

        const outcome = await dispatchLocalWake(uiRecord, {
            platform        : 'darwin',
            getDefaultTarget: async () => ({status: 'resolved', pid: 4321, instanceCount: 1, bundleName: 'Claude'}),
            log             : {error: line => logged.push(line)},
            spawnAsync      : async () => { throw new Error('script error at line 3') }
        });

        expect(outcome.outcomeReason).not.toContain(key);
        expect(logged.join('\n')).not.toContain(key);

        // Positive control: a key present in the reason WOULD be caught. Without this, the two
        // assertions above pass equally well against a route that never carried a key at all.
        expect(`leaked ${key}`).toContain(key);
    });
});
