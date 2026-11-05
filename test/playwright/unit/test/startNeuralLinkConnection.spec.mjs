import {test, expect}                                         from '@playwright/test';
import {isAuthenticationFailed, startNeuralLinkConnection} from '../../fixtures.mjs';

/**
 * Coverage for the neuralLink fixture's connect step. A fleet-mode Bridge this process did not spawn
 * fail with an authentication error that named no remedy. Only that case gets the actionable error: a Bridge
 * this process spawned, or a failure of any other kind, keeps its original error unchanged.
 */
function authenticationError() {
    const error = new Error('Neural Link Bridge rejected authentication (code=1008, reason=Authentication required).');

    error.authenticationFailed = true;
    error.closeCode            = 1008;

    return error
}

function connection({bridgeProcess = null, error = null} = {}) {
    const calls = [];

    return {
        bridgeProcess,
        calls,
        async manageConnection(args) {
            calls.push(args);

            if (error) throw error;

            return {message: 'started'}
        }
    }
}

test.describe('test/playwright/fixtures — startNeuralLinkConnection', () => {
    test('a connect that succeeds starts through the Brain start contract and throws nothing', async () => {
        const healthy = connection();

        await startNeuralLinkConnection(healthy, 8081);

        expect(healthy.calls).toEqual([{action: 'start'}])
    });

    test('a foreign Bridge refusing authentication throws one error naming the port and NEO_NL_PORT', async () => {
        const original = authenticationError(),
              foreign  = connection({error: original});

        const thrown = await startNeuralLinkConnection(foreign, 8081).catch(e => e);

        expect(thrown).toBeInstanceOf(Error);
        expect(thrown).not.toBe(original);
        expect(thrown.message).toContain('port 8081');
        expect(thrown.message).toContain('fleet-mode');
        expect(thrown.message).toContain('NEO_NL_PORT=<free port>');
        expect(thrown.cause).toBe(original)
    });

    test('a Bridge this process spawned keeps its original authentication error', async () => {
        const original = authenticationError(),
              spawned  = connection({bridgeProcess: {pid: 4242}, error: original});

        expect(await startNeuralLinkConnection(spawned, 8081).catch(e => e)).toBe(original)
    });

    test('a failure of another kind keeps its original error', async () => {
        const original = new Error('connect ECONNREFUSED 127.0.0.1:8081'),
              refused  = connection({error: original});

        expect(await startNeuralLinkConnection(refused, 8081).catch(e => e)).toBe(original)
    });

    test('isAuthenticationFailed reads the marks ConnectionService sets on a 1008 close', () => {
        expect(isAuthenticationFailed(authenticationError())).toBe(true);
        expect(isAuthenticationFailed({closeCode: 1008})).toBe(true);

        expect(isAuthenticationFailed(new Error('other'))).toBe(false);
        expect(isAuthenticationFailed({closeCode: 1006})).toBe(false);
        expect(isAuthenticationFailed(null)).toBe(false);
        expect(isAuthenticationFailed(undefined)).toBe(false)
    })
});
