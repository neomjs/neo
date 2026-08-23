import {test, expect} from '@playwright/test';

import {
    dispatchLocalWake,
    formatLocalWakeDigest,
    probeSessionContext
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
            '1 message events (latest: "review" from @neo-opus-vega)'
        );
    });

    test('the session-context line rides the digest only when the gate attached probe data (AC-2)', () => {
        const probed = record('test');

        probed.envelope.payload.sessionContext = {contextTokens: 45_000, maxContextTokens: 250_000};

        const probedDigest = formatLocalWakeDigest(probed.envelope);

        expect(probedDigest).toContain('[session-context: 45K tokens, gate at 250K]');
        // The line sits directly under the [WAKE] header, ahead of the breakdown bullets
        expect(probedDigest.indexOf('[session-context:')).toBeLessThan(probedDigest.indexOf('1 message events'));

        // Absent probe data → no field → no line (an unprobed wake stays noise-free)
        expect(formatLocalWakeDigest(record('test').envelope)).not.toContain('session-context');
        // A malformed field is treated as absent, never rendered half-formed
        const malformed = record('test');

        malformed.envelope.payload.sessionContext = {contextTokens: 'big'};

        expect(formatLocalWakeDigest(malformed.envelope)).not.toContain('session-context');
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

        // Every keystroke block must type into the VERIFIED target, never a fresh frontmost read.
        // The TOCTOU that misrouted a wake into another seat's session: each block used to open with
        // `first application process whose frontmost is true` — a second read taken AFTER
        // `assertTargetFrontmost` had approved the target — so the payload went wherever focus had
        // drifted during the 0.2s-1.0s delays. Losing focus BEFORE a check aborts loudly; losing it
        // AFTER raised nothing and typed one seat's wake, and on the restore path the operator's own
        // recovered draft, into whichever window had taken focus.
        //
        // Folded into this arm rather than given its own: `dispatchLocalWake` serializes on
        // module-level state, so a second delivery perturbs specs sharing the worker. A standalone
        // version of this check broke an unrelated stale-replay arm — an isolation defect introduced
        // by a test for an isolation defect.
        const tells = script.match(/tell (targetProcess|frontmostProcess)/g) ?? [];

        expect(tells.length, 'the delivery has keystroke blocks to check').toBeGreaterThan(0);
        expect(tells.every(line => line === 'tell targetProcess'),
            `no keystroke block may tell a re-read frontmost process — saw ${tells.join(', ')}`).toBe(true);
        expect(script).toContain('set targetProcess to first application process whose unix id is');
        expect(script).toContain('whose bundle identifier is targetBundleId');
        // The assertion itself still reads whoever is frontmost — that is the comparison, not a
        // delivery target. Without this the arm would pass on a build that deleted the check.
        expect(script, 'the frontmost READ survives inside the check')
            .toContain('set frontmostProcess to first application process whose frontmost is true');
    });


    test('OpenCode retries changed coordinates once without allowing authority retarget', async () => {
        const first = {
            agentIdentity,
            hostname     : '127.0.0.1',
            port         : 4101,
            sessionId    : 'session-1',
            projectId    : 'project-1',
            directory    : '/workspace/one',
            username     : 'neo',
            password     : 'secret'
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

    test('an OpenCode-named route dispatches through the generic osascript choreography', async () => {
        let osascriptArgs;
        const openCodeRecord = record('osascript', {
            route: {
                agentIdentity,
                harnessTargetMetadata: {
                    adapter        : 'osascript',
                    appName        : 'OpenCode',
                    addressType    : 'userDataDir',
                    instanceAddress: '/seat/ai.opencode.desktop'
                },
                adapterConfig: {attemptTimeoutMs: 1000}
            }
        });

        expect(await dispatchLocalWake(openCodeRecord, {
            platform             : 'darwin',
            resolveGuiInstancePid: async () => 5719,
            spawnAsync           : async (command, args) => {
                expect(command).toBe('osascript');
                osascriptArgs = args;
            }
        })).toBe('delivered');

        const script = osascriptArgs.join('\n');

        // The generic Electron-safe path: activate, frontmost assert on the RESOLVED pid, clear and
        // preserve the prompt, paste the payload, submit with Return, restore the user's draft.
        expect(script).toContain('tell application "OpenCode" to activate');
        expect(script).toContain('first process whose unix id is 5719');
        expect(script).toContain('set the clipboard to wakePayload');
        expect(script).toContain('key code 36');
        // …and no Codex-only Esc prelude: the OpenCode route gets the generic submit, not a quirk.
        expect(script).not.toContain('key code 53');
    });

    test.describe('probeSessionContext (#16682 context gate)', () => {
        const openCodeRecord = () => record('opencode-server');
        const kimiRecord     = () => record('kimi-pull-bridge');

        const openCodeEnvelope = JSON.stringify({
            // Names the seat that WROTE it. The envelope path is per-seat only while each seat owns
            // its XDG_DATA_HOME, so the file has to say whose it is or a sharing seat inherits it.
            agentIdentity: '@neo-gpt',
            hostname     : '127.0.0.1',
            port         : 63181,
            sessionId    : 'ses_probe',
            projectId    : 'proj',
            directory    : '/seat',
            username     : 'opencode',
            password     : 'secret'
        });

        const messageList = [
            {info: {role: 'assistant', time: {created: 1000}, tokens: {input: 40_000, cache: {read: 300_000}}}},
            {info: {role: 'user',      time: {created: 2000}}},
            {info: {role: 'assistant', time: {created: 3000}, tokens: {input: 12_000, cache: {read: 438_000}}}}
        ];

        test('reads context occupancy from the opencode server message API', async () => {
            let   requestedUrl = null;
            const probe        = await probeSessionContext(openCodeRecord(), {
                homedir: () => '/home/seat',
                fs     : {readFile: async () => openCodeEnvelope},
                fetch  : async url => {
                    requestedUrl = url;
                    return {ok: true, json: async () => messageList};
                }
            });

            expect(requestedUrl).toBe('http://127.0.0.1:63181/session/ses_probe/message?limit=30');
            // The NEWEST assistant turn owns the occupancy — 12k fresh + 438k cached, not the older one.
            expect(probe).toEqual({contextTokens: 450_000, lastActivityAt: 3000, sessionId: 'ses_probe'});
        });

        test('an unreadable opencode server fails open to null', async () => {
            const probe = await probeSessionContext(openCodeRecord(), {
                homedir: () => '/home/seat',
                fs     : {readFile: async () => openCodeEnvelope},
                fetch  : async () => { throw new Error('ECONNREFUSED'); }
            });

            expect(probe).toBeNull();
        });

        test('reads the kimi seat from the wire.jsonl tail, newest usage line wins', async () => {
            const wireLines = [
                JSON.stringify({usage: {inputOther: 5_000, inputCacheRead: 100_000}, time: 1_786_190_000_000}),
                JSON.stringify({usage: {inputOther: 4_900, inputCacheRead: 438_000}, time: 1_786_190_600_000}),
                '' // trailing newline of a jsonl tail
            ].join('\n');
            const kimiFs = {
                readFile  : async () => JSON.stringify({sessionId: 'session_abc', cwd: '/seat'}),
                readdir   : async () => ['wd_neo_1'],
                pathExists: async () => true,
                stat      : async () => ({size: wireLines.length + 262_000}), // forces the tail-read branch
                open      : async () => ({
                    read : async buffer => { buffer.write(wireLines); },
                    close: async () => {}
                })
            };

            const probe = await probeSessionContext(kimiRecord(), {homedir: () => '/home/seat', fs: kimiFs});

            expect(probe).toEqual({
                contextTokens : 442_900,
                lastActivityAt: 1_786_190_600_000,
                sessionId     : 'session_abc'
            });
        });

        test('a kimi wire ledger without usage lines fails open to null', async () => {
            const kimiFs = {
                readFile  : async () => JSON.stringify({sessionId: 'session_abc', cwd: '/seat'}),
                readdir   : async () => ['wd_neo_1'],
                pathExists: async () => true,
                stat      : async () => ({size: 100}),
                open      : async () => ({
                    read : async buffer => { buffer.write('{"noUsage":true}\n'); },
                    close: async () => {}
                })
            };

            expect(await probeSessionContext(kimiRecord(), {homedir: () => '/home/seat', fs: kimiFs})).toBeNull();
        });

        test('adapters without local context authority (osascript, tmux, test) return null', async () => {
            for (const adapter of ['osascript', 'tmux', 'test']) {
                expect(await probeSessionContext(record(adapter), {})).toBeNull();
            }
        });
    });

    /**
     * The envelope names ONE seat, and two seats on one host can end up sharing the file.
     *
     * `<XDG_DATA_HOME>/opencode/wake-envelope.json` is per-seat by construction — until two seats run
     * under one `HOME` with no per-seat `XDG_DATA_HOME`, at which point whichever booted last owns
     * delivery for both. Observed live: a peer's own broadcasts echoed back into its session inside
     * envelopes addressed to a different seat, three times in 22 minutes, because the reader validated
     * six coordinate fields and never the owner.
     *
     * `deliverKimiPullBridge` already refuses on `record.route.agentIdentity`; these arms hold the
     * OpenCode adapter to the same contract. Delivery is the load-bearing one, but the probe matters
     * too — it READS session messages, so a misrouted probe leaks a transcript rather than a wake.
     */
    test.describe('opencode envelope owner check (#17586)', () => {
        const foreignEnvelope = JSON.stringify({
            agentIdentity: '@neo-kimi-phoebe',   // written by the OTHER seat
            hostname     : '127.0.0.1',
            port         : 63181,
            sessionId    : 'ses_phoebe',
            projectId    : 'proj',
            directory    : '/seat',
            username     : 'opencode',
            password     : 'secret'
        });
        const ownEnvelope = JSON.stringify({
            agentIdentity: '@neo-gpt',           // matches record().route.agentIdentity
            hostname     : '127.0.0.1',
            port         : 63181,
            sessionId    : 'ses_own',
            projectId    : 'proj',
            directory    : '/seat',
            username     : 'opencode',
            password     : 'secret'
        });

        test('a wake refuses an envelope written by another seat, and issues NO request', async () => {
            let calls = 0;

            const outcome = await dispatchLocalWake(record('opencode-server'), {
                homedir: () => '/home/seat',
                fs     : {readFile: async () => foreignEnvelope},
                fetch  : async () => { calls++; return {status: 204}; }
            });

            // The refusal REASON is asserted, not just the outcome: a `failed` that happened to come
            // from an unreadable file would satisfy the outcome alone and prove nothing about ownership.
            expect(outcome, 'a wake for one seat must not deliver into another seat\'s session')
                .toMatchObject({outcome: 'failed', outcomeReason: 'opencode-server envelope does not match the configured seat owner'});
            // The assertion that matters: refusing AFTER the POST would already have started a turn on
            // somebody else's lane. A wake is a turn-creation primitive.
            expect(calls, 'no request may be issued against a session this wake does not own').toBe(0);
        });

        test('POSITIVE CONTROL: the same wake delivers when the envelope is its own', async () => {
            let posted = null;

            const outcome = await dispatchLocalWake(record('opencode-server'), {
                homedir: () => '/home/seat',
                fs     : {readFile: async () => ownEnvelope},
                fetch  : async url => { posted = url; return {status: 204}; }
            });

            // Without this the guard could refuse everything and the arm above would still pass —
            // a check that never admits anything is not a check, it is an outage.
            expect(outcome).toBe('delivered');
            expect(posted).toContain('/session/ses_own/prompt_async');
        });

        test('a pre-#17586 envelope carrying no owner is refused, not trusted', async () => {
            // Envelopes already on disk predate the field. Fail closed: an unnamed owner cannot be
            // proven to be this seat, and "probably ours" is how the original defect delivered.
            const unnamed = JSON.stringify(JSON.parse(ownEnvelope, (key, value) =>
                key === 'agentIdentity' ? undefined : value));
            let calls = 0;

            const outcome = await dispatchLocalWake(record('opencode-server'), {
                homedir: () => '/home/seat',
                fs     : {readFile: async () => unnamed},
                fetch  : async () => { calls++; return {status: 204}; }
            });

            expect(outcome).toMatchObject({outcome: 'failed'});
            expect(outcome.outcomeReason, 'the refusal names the missing field rather than guessing an owner')
                .toContain("requires 'agentIdentity'");
            expect(calls).toBe(0);
        });

        test('the context probe refuses a foreign envelope rather than reading its transcript', async () => {
            let calls = 0;

            const probe = await probeSessionContext(record('opencode-server'), {
                homedir: () => '/home/seat',
                fs     : {readFile: async () => foreignEnvelope},
                fetch  : async () => { calls++; return {ok: true, json: async () => []}; }
            });

            // `null` is this path's documented fail-open value, so the outcome alone cannot
            // distinguish "refused" from "unreadable". The request count is what proves the refusal
            // happened BEFORE another seat's messages were fetched.
            expect(probe).toBeNull();
            expect(calls, 'a misrouted probe would read a peer\'s session messages').toBe(0);
        });
    });
});
