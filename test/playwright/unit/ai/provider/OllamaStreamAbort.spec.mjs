import {test, expect} from '@playwright/test';
import {createServer} from 'node:http';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import Ollama         from '../../../../../ai/provider/Ollama.mjs';

/**
 * @summary `Ollama.stream()` must be cancellable and must not wait forever.
 *
 * Its sibling `OpenAiCompatible.stream()` passes a signal, and `Ollama.generate()` documents the
 * parity in its own JSDoc — while `stream()` issued a bare `fetch` with no cancellation surface at
 * all. This suite pins the repair, and the second test is the one that constrains the SHAPE of it:
 * the timeout has to be an IDLE timer, because a total deadline would kill a healthy long stream,
 * which is a worse defect than the one being fixed.
 *
 * Tests drive a real local HTTP server rather than a stubbed `fetch`: the bug lives in the request's
 * cancellation surface, and a stub would assert the arguments we chose rather than the behaviour a
 * stalled provider actually produces.
 */

/**
 * @summary Starts a throwaway ndjson server on an ephemeral port.
 * @param {Function} handler
 * @returns {Promise<Object>} The listening server.
 */
function serve(handler) {
    return new Promise(resolve => {
        const server = createServer(handler);
        server.listen(0, () => resolve(server))
    })
}

const chunk    = text => `${JSON.stringify({message: {content: text}})}\n`,
      hostOf   = server => `http://127.0.0.1:${server.address().port}`,
      provider = server => Neo.create(Ollama, {host: hostOf(server), modelName: 'probe-model'});

test('a stalled provider raises a PROVIDER_TIMEOUT instead of hanging forever', async () => {
    // Sends one chunk, then goes silent and never ends the response.
    const server = await serve((request, response) => {
        response.writeHead(200, {'Content-Type': 'application/x-ndjson'});
        response.write(chunk('hi'))
    });

    const received = [];
    let   caught   = null;

    try {
        for await (const text of provider(server).stream('x', {timeoutMs: 250, operationLabel: 'probe'})) {
            received.push(text)
        }
    } catch (error) {
        caught = error
    } finally {
        server.close()
    }

    expect(received, 'chunks delivered before the stall are still yielded').toEqual(['hi']);
    expect(caught, 'the generator must not hang on a silent provider').not.toBeNull();
    expect(caught.code).toBe('PROVIDER_TIMEOUT');
    expect(caught.message).toMatch(/probe/)
});

test('a HEALTHY long stream survives — the timer measures silence, not duration', async () => {
    // Six chunks at 120ms against a 300ms idle timeout: total runtime far exceeds the timeout, so a
    // flat deadline would kill this. Only an idle timer re-armed per chunk lets it finish.
    const server = await serve(async (request, response) => {
        response.writeHead(200, {'Content-Type': 'application/x-ndjson'});

        for (let index = 0; index < 6; index++) {
            response.write(chunk(`c${index}`));
            await new Promise(resolve => setTimeout(resolve, 120))
        }

        response.end()
    });

    const received = [];
    let   caught   = null;

    try {
        for await (const text of provider(server).stream('x', {timeoutMs: 300})) {
            received.push(text)
        }
    } catch (error) {
        caught = error
    } finally {
        server.close()
    }

    expect(caught, 'a steady stream must not be cancelled by its own idle timeout').toBeNull();
    expect(received).toEqual(['c0', 'c1', 'c2', 'c3', 'c4', 'c5'])
});

test('an upstream abort propagates, and is NOT mislabelled as a timeout', async () => {
    const server = await serve((request, response) => {
        response.writeHead(200, {'Content-Type': 'application/x-ndjson'});
        response.write(chunk('a'))
    });

    const controller = new AbortController();
    let   caught     = null;

    setTimeout(() => controller.abort(), 150);

    try {
        for await (const text of provider(server).stream('x', {signal: controller.signal, timeoutMs: 60000})) {
            void text
        }
    } catch (error) {
        caught = error
    } finally {
        server.close()
    }

    expect(caught, 'the caller must be able to stop the stream').not.toBeNull();
    // Both paths surface as an AbortError from fetch. Reporting a caller's cancellation as a
    // provider timeout would send the next reader hunting for a stall that never happened.
    expect(caught.code, 'a cancellation is not a timeout').not.toBe('PROVIDER_TIMEOUT')
});

test('an already-aborted signal stops the request before it is issued', async () => {
    let reached = false;

    const server = await serve((request, response) => {
        reached = true;
        response.writeHead(200);
        response.end()
    });

    let caught = null;

    try {
        for await (const text of provider(server).stream('x', {signal: AbortSignal.abort()})) {
            void text
        }
    } catch (error) {
        caught = error
    } finally {
        server.close()
    }

    expect(caught, 'an already-cancelled caller must not reach the provider').not.toBeNull();
    expect(reached, 'no request should have been issued').toBe(false)
});
