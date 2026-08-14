import {setup} from '../../../../setup.mjs';

const appName = 'FleetWakeSseConsumerTest';

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

import {createFleetWakeSseConsumer, parseSseFrames} from '../../../../../../ai/services/fleet/fleetWakeSseConsumer.mjs';

const QUIET = {info: () => {}, warn: () => {}, error: () => {}};

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/** A scriptable SSE response: the test pushes encoded chunks and closes the stream at will. */
function sseResponse() {
    let controller;

    const stream = new ReadableStream({
        start(c) {
            controller = c
        }
    });

    const encoder = new TextEncoder();

    return {
        ok    : true,
        status: 200,
        body  : stream,
        push(text) {
            controller.enqueue(encoder.encode(text))
        },
        close() {
            try {
                controller.close()
            } catch {/* already closed */}
        }
    }
}

test.describe('parseSseFrames - the text/event-stream frame grammar', () => {
    test('complete frames parse; the trailing partial stays as rest', () => {
        const {frames, rest} = parseSseFrames('event: state\ndata: {"a":1}\n\nevent: wake\ndata: {"b"');

        expect(frames).toHaveLength(1);
        expect(frames[0]).toEqual({event: 'state', data: '{"a":1}', retry: null});
        expect(rest).toBe('event: wake\ndata: {"b"')
    });

    test('multi-line data joins; comments are ignored; retry hints parse', () => {
        const {frames} = parseSseFrames('retry: 7000\n:hb\nevent: wake\ndata: {"x":\ndata: 1}\n\n');

        expect(frames[0].retry).toBe(7000);
        expect(frames[0].event).toBe('wake');
        expect(frames[0].data).toBe('{"x":\n1}')
    })
});

test.describe('fleetWakeSseConsumer - the delivery-liveness observation', () => {
    test('the full arc: connect → handshake-vouched cold catch-up → wake → drop → reconnect catch-up at the held watermark', async () => {
        const
            responses = [],
            pollCalls = [];

        const nextResponse = () => {
            const response = sseResponse();
            responses.push(response);
            return response
        };

        const consumer = createFleetWakeSseConsumer({
            eventsUrl   : 'http://127.0.0.1:3102/fleet/events',
            credential  : 'relay-admission',
            retryFloorMs: 10,
            logger      : QUIET,
            fetchImpl   : async (url, options) => {
                expect(url).toBe('http://127.0.0.1:3102/fleet/events');
                expect(options.headers.authorization).toBe('Bearer relay-admission');
                // The non-alias discipline as a wire assertion: no second credential header is
                // ever synthesized by this consumer.
                expect(options.headers['x-neo-mc-authorization']).toBeUndefined();
                return nextResponse()
            },
            pollDigest: async args => {
                pollCalls.push(args);
                // The cold catch-up finds nothing pending; the reconnect catch-up finds 2.
                return pollCalls.length === 1
                    ? {counts: {pending: 0}, watermark: 0}
                    : {counts: {pending: 2}, watermark: 9}
            }
        });

        expect(consumer.resolveDeliveryLiveness()).toEqual({
            alive : 'unknown',
            reason: 'wake stream consumer not running'
        });

        consumer.start();
        await wait(30);

        // Connected but pre-handshake: no subscription id has been vouched yet, so catch-up has
        // nothing to target.
        expect(pollCalls).toHaveLength(0);

        // No retry hint here on purpose: a server hint can only RAISE the floor, and this arc's
        // reconnect timing rides the injected 10ms test floor. The handshake vouches the
        // subscription id, which is the cold catch-up trigger.
        responses[0].push('event: state\ndata: {"armed":true,"armedForViewer":true,"reason":"armed","subscriptionId":"WAKE_SUB:live"}\n\n');
        await wait(20);

        expect(pollCalls).toEqual([{subscriptionId: 'WAKE_SUB:live', sinceLogId: 0}]);

        let liveness = consumer.resolveDeliveryLiveness();

        expect(liveness.alive).toBe(true);
        expect(liveness.reason).toContain('armed for this viewer');

        responses[0].push('event: wake\ndata: {"subscriptionId":"WAKE_SUB:live","envelope":{"payload":{"watermark":7}}}\n\n');
        await wait(20);

        expect(consumer.describe().subscriptionId).toBe('WAKE_SUB:live');
        expect(consumer.describe().watermark).toBe(7);

        // Drop the stream: the reconnect (floor 10ms) re-runs the handshake, and ITS catch-up
        // carries the held watermark — nothing durable was lost with the stream.
        responses[0].close();
        await wait(80);

        expect(responses.length).toBeGreaterThanOrEqual(2);
        expect(pollCalls).toHaveLength(1);

        responses[1].push('event: state\ndata: {"armed":true,"armedForViewer":true,"reason":"armed","subscriptionId":"WAKE_SUB:live"}\n\n');
        await wait(20);

        expect(pollCalls[1]).toEqual({subscriptionId: 'WAKE_SUB:live', sinceLogId: 7});
        expect(consumer.describe().watermark).toBe(9);

        liveness = consumer.resolveDeliveryLiveness();
        expect(liveness.alive).toBe(true);
        expect(liveness.reason).toContain('2 pending caught up');

        consumer.stop();

        expect(consumer.resolveDeliveryLiveness()).toEqual({
            alive : 'unknown',
            reason: 'wake stream consumer not running'
        })
    });

    test('the cold window: pending wakes + a fresh consumer + NO live wake — the vouched handshake id alone drives catch-up', async () => {
        const
            response  = sseResponse(),
            pollCalls = [];

        const consumer = createFleetWakeSseConsumer({
            eventsUrl   : 'http://127.0.0.1:3102/fleet/events',
            credential  : 'relay-admission',
            retryFloorMs: 10,
            logger      : QUIET,
            fetchImpl   : async () => response,
            pollDigest  : async args => {
                pollCalls.push(args);
                return {counts: {pending: 3}, watermark: 12}
            }
        });

        consumer.start();
        await wait(30);

        response.push('event: state\ndata: {"armed":true,"armedForViewer":true,"reason":"armed","subscriptionId":"WAKE_SUB:cold"}\n\n');
        await wait(20);

        // The shipped-defect falsifier: before the handshake vouched the id, a cold consumer
        // skipped catch-up entirely, and pending wakes waited on a live wake that might never
        // come. Now the handshake alone drains them.
        expect(pollCalls).toEqual([{subscriptionId: 'WAKE_SUB:cold', sinceLogId: 0}]);
        expect(consumer.describe().watermark).toBe(12);

        const liveness = consumer.resolveDeliveryLiveness();

        expect(liveness.alive).toBe(true);
        expect(liveness.reason).toContain('3 pending caught up');

        consumer.stop();
        response.close()
    });

    test('a server that vouches no subscription id leaves catch-up honestly unfired — no guessed target, no fabricated count', async () => {
        const
            response  = sseResponse(),
            pollCalls = [];

        const consumer = createFleetWakeSseConsumer({
            eventsUrl   : 'http://127.0.0.1:3102/fleet/events',
            credential  : 'relay-admission',
            retryFloorMs: 10,
            logger      : QUIET,
            fetchImpl   : async () => response,
            pollDigest  : async args => {
                pollCalls.push(args);
                return {counts: {pending: 5}, watermark: 40}
            }
        });

        consumer.start();
        await wait(30);

        response.push('event: state\ndata: {"armed":true,"armedForViewer":true,"reason":"armed"}\n\n');
        await wait(20);

        expect(pollCalls).toHaveLength(0);

        const liveness = consumer.resolveDeliveryLiveness();

        expect(liveness.alive).toBe(true);
        expect(liveness.reason).not.toContain('caught up');

        consumer.stop();
        response.close()
    });

    test('a refused stream renders unknown with the HTTP reason — never a fabricated verdict', async () => {
        const consumer = createFleetWakeSseConsumer({
            eventsUrl   : 'http://127.0.0.1:3102/fleet/events',
            retryFloorMs: 10,
            logger      : QUIET,
            fetchImpl   : async () => ({ok: false, status: 401, body: null})
        });

        consumer.start();
        await wait(30);
        consumer.stop();

        expect(consumer.describe().lastDisconnect).toBe('stream refused: HTTP 401')
    });

    test('a silent-but-open stream degrades to unknown past the staleness horizon', async () => {
        let tick = 1_000_000;

        const response = sseResponse();

        const consumer = createFleetWakeSseConsumer({
            eventsUrl   : 'http://127.0.0.1:3102/fleet/events',
            retryFloorMs: 10,
            logger      : QUIET,
            now         : () => tick,
            fetchImpl   : async () => response
        });

        consumer.start();
        await wait(30);

        response.push('event: state\ndata: {"armed":true,"armedForViewer":false,"reason":"not armed"}\n\n');
        await wait(20);

        expect(consumer.resolveDeliveryLiveness().alive).toBe(true);

        // 91 seconds of silence on an open socket: liveness is UNCONFIRMED, not asserted.
        tick += 91_000;

        const liveness = consumer.resolveDeliveryLiveness();

        expect(liveness.alive).toBe('unknown');
        expect(liveness.reason).toContain('silent for 91s');

        consumer.stop();
        response.close()
    })
});
