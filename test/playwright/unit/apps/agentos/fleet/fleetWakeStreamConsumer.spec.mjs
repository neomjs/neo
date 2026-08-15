import {expect, test} from '@playwright/test';

import {parseSseFrames as relayParseSseFrames} from '../../../../../../ai/services/fleet/fleetWakeSseConsumer.mjs';

import {createFleetWakeStreamConsumer, parseSseFrames} from '../../../../../../apps/agentos/fleet/fleetWakeStreamConsumer.mjs';

// The browser twin of the relay-side wake consumer. The realm boundary carries no imports, so the
// frame parser is duplicated by construction — the PARITY block below is the binding. The consumer
// tests assert the C2 differences: two credential headers (never synthesized here — the injected
// authHeaders closure is the custody seam) and the same absence-of-signal observation grammar.

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

test.describe('parseSseFrames — PARITY: the browser twin answers exactly as the relay authority', () => {
    const fixtures = [
        'event: state\ndata: {"a":1}\n\nevent: wake\ndata: {"b"',
        'retry: 7000\n:hb\nevent: wake\ndata: {"x":\ndata: 1}\n\n',
        'data: bare-message\n\n',
        'retry: nonsense\nevent: state\ndata: {}\n\n',
        ': comment only\n\n',
        '',
        'event: wake\n\n' // frame without data
    ];

    test('every fixture parses identically in both realms', () => {
        for (const fixture of fixtures) {
            expect(parseSseFrames(fixture), `parity(${JSON.stringify(fixture.slice(0, 30))})`)
                .toEqual(relayParseSseFrames(fixture))
        }
    });

    test('complete frames parse; the trailing partial stays as rest', () => {
        const {frames, rest} = parseSseFrames('event: state\ndata: {"a":1}\n\nevent: wake\ndata: {"b"');

        expect(frames).toHaveLength(1);
        expect(frames[0]).toEqual({event: 'state', data: '{"a":1}', retry: null});
        expect(rest).toBe('event: wake\ndata: {"b"')
    })
});

test.describe('fleetWakeStreamConsumer — the browser-direct wake observation', () => {
    test('credentials never ride consumer options: an authHeaders closure is required', () => {
        expect(() => createFleetWakeStreamConsumer({eventsUrl: 'http://127.0.0.1:8083/fleet/events'}))
            .toThrow(/authHeaders function — credentials stay in the bridge closure/);
        expect(() => createFleetWakeStreamConsumer({authHeaders: () => ({})}))
            .toThrow(/requires an eventsUrl/)
    });

    test('the full arc, two-header armed: connect → vouched cold catch-up → wake → drop → reconnect at the held watermark', async () => {
        const
            responses   = [],
            pollCalls   = [],
            headersSeen = [];

        const nextResponse = () => {
            const response = sseResponse();
            responses.push(response);
            return response
        };

        const consumer = createFleetWakeStreamConsumer({
            eventsUrl   : 'http://127.0.0.1:8083/fleet/events',
            retryFloorMs: 10,
            logger      : QUIET,
            authHeaders : () => ({
                authorization           : 'Bearer class-1-admission',
                'x-neo-mc-authorization': 'Bearer class-3-mc-mint'
            }),
            pollDigest: async args => {
                pollCalls.push(args);
                return {counts: {pending: pollCalls.length === 1 ? 3 : 0}, watermark: pollCalls.length === 1 ? 41 : 44}
            },
            fetchImpl: async (url, options) => {
                expect(url).toBe('http://127.0.0.1:8083/fleet/events');
                expect(options.headers.accept).toBe('text/event-stream');
                headersSeen.push({
                    class1: options.headers.authorization,
                    class3: options.headers['x-neo-mc-authorization']
                });
                return nextResponse()
            }
        });

        consumer.start();
        await wait(20);

        // Both mints, distinct headers — the never-aliased pair as the wire truth.
        expect(headersSeen[0]).toEqual({class1: 'Bearer class-1-admission', class3: 'Bearer class-3-mc-mint'});

        // The handshake vouches the subscription id → cold catch-up fires ONCE, before any wake.
        responses[0].push('event: state\ndata: {"armed":true,"armedForViewer":true,"subscriptionId":"sub-9"}\n\n');
        await wait(20);

        expect(pollCalls).toEqual([{subscriptionId: 'sub-9', sinceLogId: 0}]);
        expect(consumer.resolveDeliveryLiveness()).toEqual({
            alive : true,
            reason: 'composed wake stream connected · armed for this viewer · 3 pending caught up'
        });

        // A live wake advances the client-held watermark past the catch-up's 41.
        responses[0].push('event: wake\ndata: {"subscriptionId":"sub-9","envelope":{"logId":57}}\n\n');
        await wait(20);
        expect(consumer.describe().watermark).toBe(57);

        // Drop → reconnect: the SECOND connection catches up AT the held watermark.
        responses[0].close();
        await wait(60);

        responses[1].push('event: state\ndata: {"armed":true,"armedForViewer":true,"subscriptionId":"sub-9"}\n\n');
        await wait(20);

        expect(pollCalls).toHaveLength(2);
        expect(pollCalls[1]).toEqual({subscriptionId: 'sub-9', sinceLogId: 57});
        expect(headersSeen).toHaveLength(2);

        consumer.stop()
    });

    test('the vouch is CONNECTION-EPOCH state: a disarmed reconnect never reuses the prior subscription', async () => {
        const
            responses = [],
            pollCalls = [];

        const nextResponse = () => {
            const response = sseResponse();
            responses.push(response);
            return response
        };

        const consumer = createFleetWakeStreamConsumer({
            eventsUrl   : 'http://127.0.0.1:8083/fleet/events',
            retryFloorMs: 10,
            logger      : QUIET,
            authHeaders : () => ({authorization: 'Bearer class-1-admission'}),
            pollDigest  : async args => { pollCalls.push(args); return {counts: {pending: 0}} },
            fetchImpl   : async () => nextResponse()
        });

        consumer.start();
        await wait(20);

        responses[0].push('event: state\ndata: {"armed":true,"armedForViewer":true,"subscriptionId":"sub-9"}\n\n');
        await wait(20);
        expect(pollCalls).toHaveLength(1);

        // Disarmed between connections: the new epoch's handshake vouches NO id.
        responses[0].close();
        await wait(60);
        responses[1].push('event: state\ndata: {"armed":true,"armedForViewer":false,"reason":"disarmed"}\n\n');
        await wait(20);

        expect(pollCalls, 'no catch-up may fire on the PRIOR epoch\'s subscription').toHaveLength(1);
        expect(consumer.describe().subscriptionId).toBeNull();
        expect(consumer.resolveDeliveryLiveness().reason).toContain('not armed for this viewer (disarmed)');

        consumer.stop()
    });

    test('transport-open is not handshake-live: an HTTP 200 with ZERO frames stays unknown', async () => {
        const response = sseResponse(); // opened, never pushed to

        const consumer = createFleetWakeStreamConsumer({
            eventsUrl   : 'http://127.0.0.1:8083/fleet/events',
            retryFloorMs: 10,
            logger      : QUIET,
            authHeaders : () => ({authorization: 'Bearer class-1-admission'}),
            fetchImpl   : async () => response
        });

        consumer.start();
        await wait(30);

        expect(consumer.describe().connected, 'the transport IS open').toBe(true);
        expect(consumer.resolveDeliveryLiveness()).toEqual({
            alive : 'unknown',
            reason: 'stream open, state handshake pending — liveness unconfirmed'
        });

        consumer.stop()
    });

    test('the honest not-armed shape: one header only, and the server\'s own reason carried verbatim', async () => {
        const response = sseResponse();

        const consumer = createFleetWakeStreamConsumer({
            eventsUrl   : 'http://127.0.0.1:8083/fleet/events',
            retryFloorMs: 10,
            logger      : QUIET,
            authHeaders : () => ({authorization: 'Bearer class-1-admission'}),
            fetchImpl   : async (url, options) => {
                expect(options.headers['x-neo-mc-authorization'], 'no second header is ever synthesized').toBeUndefined();
                return response
            }
        });

        consumer.start();
        await wait(20);

        response.push('event: state\ndata: {"armed":true,"armedForViewer":false,"reason":"push lane armed for @relay-viewer; this viewer polls"}\n\n');
        await wait(20);

        expect(consumer.resolveDeliveryLiveness()).toEqual({
            alive : true,
            reason: 'composed wake stream connected · not armed for this viewer (push lane armed for @relay-viewer; this viewer polls)'
        });

        consumer.stop()
    });

    test('a refused stream is an observation, never a throw — and poll remains the truth lane', async () => {
        const consumer = createFleetWakeStreamConsumer({
            eventsUrl   : 'http://127.0.0.1:8083/fleet/events',
            retryFloorMs: 10,
            logger      : QUIET,
            authHeaders : () => ({}),
            fetchImpl   : async () => ({ok: false, status: 401, body: null})
        });

        consumer.start();
        await wait(20);

        const liveness = consumer.resolveDeliveryLiveness();

        expect(liveness.alive).toBe('unknown');
        expect(liveness.reason).toContain('stream refused: HTTP 401');
        expect(liveness.reason).toContain('poll remains the truth lane');

        consumer.stop()
    });

    test('the server retry hint is a floor the client respects; caps mean backoff, never a storm', async () => {
        const response = sseResponse();

        const consumer = createFleetWakeStreamConsumer({
            eventsUrl   : 'http://127.0.0.1:8083/fleet/events',
            retryFloorMs: 10,
            logger      : QUIET,
            authHeaders : () => ({authorization: 'Bearer class-1-admission'}),
            fetchImpl   : async () => response
        });

        consumer.start();
        await wait(20);

        response.push('retry: 45000\nevent: state\ndata: {"armed":false}\n\n');
        await wait(20);

        expect(consumer.describe().retryFloorMs).toBe(45000);
        consumer.stop()
    });

    test('stopped is the honest terminal observation, and stop is idempotent', async () => {
        const consumer = createFleetWakeStreamConsumer({
            eventsUrl  : 'http://127.0.0.1:8083/fleet/events',
            logger     : QUIET,
            authHeaders: () => ({}),
            fetchImpl  : async () => ({ok: false, status: 503, body: null})
        });

        expect(consumer.resolveDeliveryLiveness()).toEqual({alive: 'unknown', reason: 'wake stream consumer not running'});

        consumer.start();
        consumer.stop();
        consumer.stop();

        expect(consumer.resolveDeliveryLiveness().reason).toBe('wake stream consumer not running')
    })
});
