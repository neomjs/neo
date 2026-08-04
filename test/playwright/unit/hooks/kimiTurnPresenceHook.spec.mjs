import {test, expect}  from '@playwright/test';
import {spawnSync}     from 'node:child_process';
import fs              from 'node:fs';
import {fileURLToPath} from 'node:url';

import {
    parseKimiHookPayload,
    recordKimiTurnPresence,
    resolveKimiTurnPresenceEvent
} from '../../../../.kimi-code/hooks/turnPresenceHook.mjs';

const
    configPath = fileURLToPath(new URL('../../../../.kimi-code/hooks/turn-presence.example.toml', import.meta.url)),
    hookPath   = fileURLToPath(new URL('../../../../.kimi-code/hooks/turnPresenceHook.mjs', import.meta.url)),
    PLANE      = Object.freeze({baseUrl: 'http://plane.test/mc/mcp', credential: 'test-bearer'});

/**
 * @summary Captures every call the adapter routes to the transport, standing in for the served store.
 *
 * The predecessor of this fixture was a temporary SQLite file, and the assertions read rows back out of
 * it. That shape could not fail on the defect it was meant to guard: writing to a local file is exactly
 * what the hook used to do wrong, so a green suite proved only that *some* store received the beacon —
 * never that the deployment's store did. Recording the outbound call instead pins the contract at the
 * boundary the beacon actually has to cross.
 * @returns {{calls: Object[], record: Function}}
 */
function createTransportRecorder() {
    const calls = [];

    return {
        calls,
        record: async args => {
            calls.push(args);

            return {
                agentIdentity: args.identity,
                turnId       : 'turn-under-test',
                status       : 'recorded'
            }
        }
    }
}

test.describe('Kimi Code turn-presence hook adapter', () => {
    test('maps only the documented per-turn event contract', () => {
        const expected = {
            Interrupt: {
                action       : 'terminal',
                eventName    : 'Interrupt',
                source       : 'kimi-interrupt',
                terminalState: 'aborted'
            },
            PostToolUse: {
                action   : 'progress',
                eventName: 'PostToolUse',
                source   : 'kimi-post-tool-use'
            },
            Stop: {
                action       : 'terminal',
                eventName    : 'Stop',
                source       : 'kimi-stop',
                terminalState: 'completed'
            },
            StopFailure: {
                action       : 'terminal',
                eventName    : 'StopFailure',
                source       : 'kimi-stop-failure',
                terminalState: 'aborted'
            },
            UserPromptSubmit: {
                action   : 'start',
                eventName: 'UserPromptSubmit',
                source   : 'kimi-user-prompt-submit'
            }
        };

        Object.entries(expected).forEach(([hook_event_name, mapping]) => {
            expect(resolveKimiTurnPresenceEvent({hook_event_name})).toEqual(mapping)
        });

        ['SessionStart', 'SessionEnd', 'PostToolUseFailure'].forEach(hook_event_name => {
            expect(resolveKimiTurnPresenceEvent({hook_event_name})).toBeNull()
        });
        expect(resolveKimiTurnPresenceEvent(null)).toBeNull();
        expect(parseKimiHookPayload('{malformed')).toBeNull()
    });

    test('keeps the install template schema-bounded and identity-neutral', () => {
        const blocks = fs.readFileSync(configPath, 'utf8')
            .split('[[hooks]]')
            .slice(1)
            .map(block => Object.fromEntries(block.trim().split('\n')
                .filter(line => line && !line.startsWith('#'))
                .map(line => {
                    const separator = line.indexOf('='),
                          key       = line.slice(0, separator).trim(),
                          rawValue  = line.slice(separator + 1).trim(),
                          value     = rawValue.replace(/^(['"])(.*)\1$/, '$2');

                    return [key, key === 'timeout' ? Number(value) : value]
                })));

        expect(blocks.map(({event}) => event)).toEqual([
            'UserPromptSubmit',
            'PostToolUse',
            'Stop',
            'StopFailure',
            'Interrupt'
        ]);
        blocks.forEach(block => {
            expect(Object.keys(block).sort()).toEqual(['command', 'event', 'timeout']);
            expect(block.timeout).toBe(5);
            expect(block.command).toBe(
                'node --env-file-if-exists="$(git rev-parse --show-toplevel)/.env" "$(git rev-parse --show-toplevel)/.kimi-code/hooks/turnPresenceHook.mjs"'
            );
            expect(block.command).not.toMatch(/@neo-/)
        })
    });

    test('each mapped event reaches the served store with its own action, source and terminal state', async () => {
        const {calls, record} = createTransportRecorder(),
              env             = {NEO_AGENT_IDENTITY: '@test-kimi'};

        for (const [hook_event_name, extra] of [
            ['UserPromptSubmit', {session_id: 'session-test'}],
            ['PostToolUse',      {tool_name: 'Shell'}],
            ['Stop',             {}]
        ]) {
            await recordKimiTurnPresence({
                env,
                hookPayload: {hook_event_name, ...extra},
                plane      : PLANE,
                record
            })
        }

        expect(calls.map(({action, source, note}) => ({action, source, note}))).toEqual([
            {action: 'start',    source: 'kimi-user-prompt-submit', note: 'kimi UserPromptSubmit'},
            {action: 'progress', source: 'kimi-post-tool-use',      note: 'kimi PostToolUse Shell'},
            {action: 'terminal', source: 'kimi-stop',               note: 'kimi Stop'}
        ]);

        // Only the terminal call carries a terminalState — sending one on start/progress would assert a
        // close that did not happen.
        expect(calls.map(({terminalState}) => terminalState)).toEqual([undefined, undefined, 'completed']);

        // Every call must name THIS seat and THIS plane. Without the identity the server records the
        // beacon against the credential's owner, publishing the wrong agent as mid-turn.
        calls.forEach(call => {
            expect(call.identity).toBe('@test-kimi');
            expect(call.baseUrl).toBe(PLANE.baseUrl);
            expect(call.credential).toBe(PLANE.credential)
        });

        // No turnId is sent: the hook holds none, and the server resolves the open interval. Sending a
        // locally-invented id is what would fork a second turn per event.
        expect(calls.every(({turnId}) => turnId === undefined)).toBe(true)
    });

    for (const [eventName, source] of [['StopFailure', 'kimi-stop-failure'], ['Interrupt', 'kimi-interrupt']]) {
        test(`${eventName} closes the turn as aborted`, async () => {
            const {calls, record} = createTransportRecorder();

            await recordKimiTurnPresence({
                env        : {NEO_AGENT_IDENTITY: '@test-kimi'},
                hookPayload: {hook_event_name: eventName},
                plane      : PLANE,
                record
            });

            expect(calls).toHaveLength(1);
            expect(calls[0]).toMatchObject({action: 'terminal', source, terminalState: 'aborted'})
        })
    }

    test('an unsupported event, a missing identity, and an unconfigured plane each skip WITHOUT reaching the transport', async () => {
        const {calls, record} = createTransportRecorder();

        await expect(recordKimiTurnPresence({
            env        : {NEO_AGENT_IDENTITY: '@test-kimi'},
            hookPayload: {hook_event_name: 'SessionStart'},
            plane      : PLANE,
            record
        })).resolves.toEqual({eventName: 'SessionStart', reason: 'unsupported-hook-event', status: 'noop'});

        await expect(recordKimiTurnPresence({
            env        : {},
            hookPayload: {hook_event_name: 'UserPromptSubmit'},
            plane      : PLANE,
            record
        })).resolves.toMatchObject({status: 'skipped'});

        // The load-bearing case: an unconfigured plane must NAME the skip, never fall back to writing
        // somewhere reachable. A beacon in a store nobody reads makes an unmeasured state look measured,
        // which is the defect this whole path was repaired for.
        const unconfigured = await recordKimiTurnPresence({
            env        : {NEO_AGENT_IDENTITY: '@test-kimi'},
            hookPayload: {hook_event_name: 'UserPromptSubmit'},
            plane      : {baseUrl: ''},
            record
        });

        expect(unconfigured.status).toBe('skipped');
        expect(unconfigured.reason).toContain('no Memory Core plane is configured');
        expect(calls).toHaveLength(0)
    });

    test('missing identity warns once on UserPromptSubmit, never on PostToolUse, always fail-open', async () => {
        const {calls, record} = createTransportRecorder(),
              writes          = [],
              originalWrite   = process.stderr.write;

        process.stderr.write = chunk => { writes.push(String(chunk)); return true };

        try {
            await expect(recordKimiTurnPresence({
                env        : {},
                hookPayload: {hook_event_name: 'UserPromptSubmit'},
                plane      : PLANE,
                record
            })).resolves.toMatchObject({status: 'skipped'});
            expect(writes).toHaveLength(1);
            expect(writes[0]).toContain('NEO_AGENT_IDENTITY unresolved');
            expect(writes[0]).toContain('--env-file-if-exists');

            writes.length = 0;
            await expect(recordKimiTurnPresence({
                env        : {},
                hookPayload: {hook_event_name: 'PostToolUse', tool_name: 'Shell'},
                plane      : PLANE,
                record
            })).resolves.toMatchObject({status: 'skipped'});
            expect(writes).toHaveLength(0);

            await expect(recordKimiTurnPresence({
                env        : {NEO_AGENT_IDENTITY: '@test-kimi'},
                hookPayload: {hook_event_name: 'UserPromptSubmit'},
                plane      : PLANE,
                record
            })).resolves.toMatchObject({status: 'recorded'});
            expect(writes).toHaveLength(0);
            expect(calls).toHaveLength(1)
        } finally {
            process.stderr.write = originalWrite
        }
    });

    test('the executable adapter survives an unreachable plane and SAYS SO on stderr', () => {
        const result = spawnSync(process.execPath, [hookPath], {
            encoding: 'utf8',
            env     : {
                ...process.env,
                NEO_AGENT_IDENTITY: '@test-kimi',
                // A port nothing is listening on: the write cannot land, which must surface rather than
                // pass silently. The predecessor of this test asserted EMPTY stderr here — it encoded the
                // silence as the contract, so the failure it should have caught was the behaviour it pinned.
                NEO_FLEET_PLANE_BASE: 'http://127.0.0.1:1'
            },
            input  : JSON.stringify({hook_event_name: 'UserPromptSubmit'}),
            timeout: 20000
        });

        expect(result.error).toBeUndefined();
        expect(result.status).toBe(0);
        expect(result.stdout).toBe('');

        // Discriminated deliberately: 'not recorded' alone would ALSO be printed by the unconfigured-plane
        // skip, so asserting it would let this test pass without the transport ever being attempted. The
        // throw text can only come from a plane that was configured, reached for, and failed.
        expect(result.stderr).toContain('not recorded');
        expect(result.stderr).toContain('threw');
        expect(result.stderr).not.toContain('no Memory Core plane is configured')
    })
});
