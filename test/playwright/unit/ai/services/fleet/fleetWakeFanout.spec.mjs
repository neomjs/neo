import {setup} from '../../../../setup.mjs';

const appName = 'FleetWakeFanoutTest';

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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

import {createFleetWakeFanout} from '../../../../../../ai/services/fleet/fleetWakeFanout.mjs';

/**
 * A minimal SSE response double: collects head + frames, and lets the test fire the close /
 * error events exactly like a dropped or faulted EventSource does. `failWrites` makes every
 * write throw; `writableLength` simulates kernel-buffer backpressure.
 */
function createStream({failWrites = false, writableLength = 0} = {}) {
    const listeners = {};

    return {
        head     : null,
        chunks   : [],
        ended    : false,
        destroyed: false,
        failWrites,
        writableLength,
        writeHead(status, headers) {
            this.head = {status, headers}
        },
        write(chunk) {
            if (this.failWrites) {
                throw new Error('socket gone')
            }

            this.chunks.push(chunk)
        },
        end() {
            this.ended = true
        },
        destroy() {
            this.destroyed = true
        },
        on(event, handler) {
            listeners[event] = handler
        },
        close() {
            listeners.close?.()
        },
        error() {
            listeners.error?.()
        },
        events(name) {
            return this.chunks.filter(chunk => chunk.startsWith(`event: ${name}\n`))
        }
    }
}

function createArmedFanout({identity = '@viewer', now} = {}) {
    const fanout = createFleetWakeFanout({logger: {error: () => {}}, heartbeatMs: 0, now});

    const calls = [];

    const callTool = async (name, args) => {
        calls.push({name, args});

        if (args.action === 'subscribe')  return {subscriptionId: 'WAKE_SUB:relay'};
        if (args.action === 'rotate-key') return {subscriptionId: 'WAKE_SUB:relay', signingKey: 'a'.repeat(64)};

        throw new Error(`unexpected action ${args.action}`)
    };

    return {
        fanout,
        calls,
        arm: () => fanout.armRelaySubscription({
            identity,
            wakeSelfBase: 'http://fleet-server:8083',
            callTool
        })
    }
}

test.describe('fleetWakeFanout - identity-keyed SSE fan-out + relay-subscription arming', () => {
    test('an undeclared self-address renders unarmed with its reason — never a guessed default', async () => {
        const fanout  = createFleetWakeFanout({logger: {error: () => {}}, heartbeatMs: 0});
        const outcome = await fanout.armRelaySubscription({identity: null, wakeSelfBase: '', callTool: null});

        expect(outcome.armed).toBe(false);
        expect(outcome.reason).toContain('wakeSelfBase undeclared');
        expect(fanout.describeState().armed).toBe(false)
    });

    test('a missing plane client renders unarmed with its own distinct reason', async () => {
        const fanout  = createFleetWakeFanout({logger: {error: () => {}}, heartbeatMs: 0});
        const outcome = await fanout.armRelaySubscription({
            identity    : '@viewer',
            wakeSelfBase: 'http://fleet-server:8083',
            callTool    : null
        });

        expect(outcome.armed).toBe(false);
        expect(outcome.reason).toContain('no authenticated plane client')
    });

    test('arming subscribes the canonical /wake target, then rotates unconditionally, and the rotated key becomes the in-memory route', async () => {
        const {fanout, calls, arm} = createArmedFanout();
        const outcome              = await arm();

        expect(outcome).toEqual({armed: true, reason: 'armed', subscriptionId: 'WAKE_SUB:relay'});

        expect(calls.map(call => call.args.action)).toEqual(['subscribe', 'rotate-key']);
        expect(calls[0].args.harnessTarget).toBe('a2a-webhook');
        expect(calls[0].args.harnessTargetMetadata.url).toBe('http://fleet-server:8083/wake');

        expect(fanout.resolveRoute('WAKE_SUB:relay')).toEqual({
            signingKey   : 'a'.repeat(64),
            agentIdentity: '@viewer'
        });
        expect(fanout.resolveRoute('WAKE_SUB:stranger')).toBeNull()
    });

    test('a rotate-key answer without a key refuses arming — an idempotently reused key from a dead process life is never trusted', async () => {
        const fanout = createFleetWakeFanout({logger: {error: () => {}}, heartbeatMs: 0});

        const outcome = await fanout.armRelaySubscription({
            identity    : '@viewer',
            wakeSelfBase: 'http://fleet-server:8083',
            callTool    : async (name, args) => (
                args.action === 'subscribe' ? {subscriptionId: 'WAKE_SUB:relay'} : {}
            )
        });

        expect(outcome.armed).toBe(false);
        expect(outcome.reason).toContain('rotate-key returned no signing key');
        expect(fanout.resolveRoute('WAKE_SUB:relay')).toBeNull()
    });

    test('a throwing plane call refuses arming without throwing out of the fail-soft contract', async () => {
        const fanout = createFleetWakeFanout({logger: {error: () => {}}, heartbeatMs: 0});

        const outcome = await fanout.armRelaySubscription({
            identity    : '@viewer',
            wakeSelfBase: 'http://fleet-server:8083',
            callTool    : async () => {
                throw new Error('plane unreachable')
            }
        });

        expect(outcome.armed).toBe(false);
        expect(outcome.reason).toContain('arming failed')
    });

    test('a digest routes to exactly its identity\'s streams — a second identity can never receive it', async () => {
        const {fanout, arm} = createArmedFanout();
        await arm();

        const
            mine   = createStream(),
            theirs = createStream();

        fanout.registerStream('@viewer', mine);
        fanout.registerStream('@someone-else', theirs);

        fanout.handleDigest({
            subscriptionId: 'WAKE_SUB:relay',
            agentIdentity : '@viewer',
            envelope      : {digest: 'wake up'}
        });

        expect(mine.events('wake')).toHaveLength(1);
        expect(mine.events('wake')[0]).toContain('"digest":"wake up"');
        expect(theirs.events('wake')).toHaveLength(0)
    });

    test('the SSE state event is per-viewer honest: armed for the relay viewer, not-armed-for-you elsewhere', async () => {
        const {fanout, arm} = createArmedFanout();
        await arm();

        const
            mine   = createStream(),
            theirs = createStream();

        fanout.registerStream('@viewer', mine);
        fanout.registerStream('@someone-else', theirs);

        expect(mine.events('state')[0]).toContain('"armedForViewer":true');
        expect(theirs.events('state')[0]).toContain('"armedForViewer":false');

        expect(mine.head.headers['content-type']).toBe('text/event-stream')
    });

    test('a closed stream is forgotten: later digests reach nothing and leak nothing', async () => {
        const {fanout, arm} = createArmedFanout();
        await arm();

        const stream = createStream();

        fanout.registerStream('@viewer', stream);
        stream.close();

        const before = stream.chunks.length;

        fanout.handleDigest({
            subscriptionId: 'WAKE_SUB:relay',
            agentIdentity : '@viewer',
            envelope      : {digest: 'late'}
        });

        expect(stream.chunks.length).toBe(before);
        expect(fanout.describeState().connectedIdentities).toBe(0)
    });

    test('the per-viewer stream cap refuses the excess connection untouched, and a close frees the slot', async () => {
        const fanout = createFleetWakeFanout({logger: {error: () => {}}, heartbeatMs: 0, maxStreamsPerIdentity: 2, maxStreamsTotal: 10});

        const
            first  = createStream(),
            second = createStream(),
            third  = createStream(),
            fourth = createStream();

        expect(fanout.registerStream('@viewer', first).accepted).toBe(true);
        expect(fanout.registerStream('@viewer', second).accepted).toBe(true);

        const refused = fanout.registerStream('@viewer', third);

        expect(refused).toEqual({accepted: false, reason: 'stream cap reached (per viewer)'});
        // The refused response was never converted to SSE — the route still owns it.
        expect(third.head).toBeNull();
        expect(third.chunks).toHaveLength(0);

        first.close();
        expect(fanout.registerStream('@viewer', fourth).accepted).toBe(true)
    });

    test('the total stream cap bounds the process across identities', async () => {
        const fanout = createFleetWakeFanout({logger: {error: () => {}}, heartbeatMs: 0, maxStreamsPerIdentity: 8, maxStreamsTotal: 2});

        expect(fanout.registerStream('@a', createStream()).accepted).toBe(true);
        expect(fanout.registerStream('@b', createStream()).accepted).toBe(true);
        expect(fanout.registerStream('@c', createStream())).toEqual({
            accepted: false,
            reason  : 'stream cap reached (total)'
        })
    });

    test('a faulty first stream is evicted without costing the healthy second its delivery', async () => {
        const {fanout, arm} = createArmedFanout();
        await arm();

        const
            faulty  = createStream(),
            healthy = createStream();

        fanout.registerStream('@viewer', faulty);
        fanout.registerStream('@viewer', healthy);

        faulty.failWrites = true;

        fanout.handleDigest({
            subscriptionId: 'WAKE_SUB:relay',
            agentIdentity : '@viewer',
            envelope      : {digest: 'wake up'}
        });

        expect(healthy.events('wake')).toHaveLength(1);
        expect(faulty.destroyed).toBe(true);
        // The evicted slot is freed: connectedIdentities still names the viewer via the healthy stream.
        expect(fanout.describeState().connectedIdentities).toBe(1)
    });

    test('a stream past the backpressure bound is evicted instead of buffered forever', async () => {
        const {fanout, arm} = createArmedFanout();
        await arm();

        const bloated = createStream({writableLength: 512 * 1024});

        // Registration writes ride the same bound, so the overfull stream is evicted at the
        // first write — nothing is ever queued behind a consumer that stopped reading.
        fanout.registerStream('@viewer', bloated);

        expect(bloated.destroyed).toBe(true);
        expect(fanout.describeState().connectedIdentities).toBe(0)
    });

    test('close and error cleanups are idempotent: no double-decrement can corrupt the caps', async () => {
        const fanout = createFleetWakeFanout({logger: {error: () => {}}, heartbeatMs: 0, maxStreamsPerIdentity: 8, maxStreamsTotal: 2});

        const stream = createStream();

        fanout.registerStream('@a', stream);
        stream.close();
        stream.error();
        stream.close();

        expect(fanout.registerStream('@b', createStream()).accepted).toBe(true);
        expect(fanout.registerStream('@c', createStream()).accepted).toBe(true);
        expect(fanout.registerStream('@d', createStream()).accepted).toBe(false)
    });

    test('dispose ends every held stream so a server can terminate with open SSE clients', async () => {
        const {fanout, arm} = createArmedFanout();
        await arm();

        const
            one = createStream(),
            two = createStream();

        fanout.registerStream('@viewer', one);
        fanout.registerStream('@someone-else', two);

        fanout.dispose();

        expect(one.ended).toBe(true);
        expect(two.ended).toBe(true);
        expect(fanout.describeState().connectedIdentities).toBe(0)
    });

    test('lastPushAt is observational: recorded on delivery even when no stream is connected', async () => {
        let tick = 1000;

        const {fanout, arm} = createArmedFanout({now: () => tick});
        await arm();

        expect(fanout.describeState().lastPushAt).toBeNull();

        fanout.handleDigest({
            subscriptionId: 'WAKE_SUB:relay',
            agentIdentity : '@viewer',
            envelope      : {digest: 'unwitnessed'}
        });

        expect(fanout.describeState().lastPushAt).toBe(1000)
    })
});
