import {test, expect}                 from '@playwright/test';
import {attachPageSharedAppWorker}    from '../../sharedWorkerAppWorker.mjs';
import {runDedicatedWorkerNeuralLink} from '../../dedicatedWorkerNeuralLink.mjs';

const APP_URL = 'http://localhost:8080/src/worker/App.mjs';

/**
 * @summary A SharedWorker's `Neo` with an in-memory `Neo.ai.Client` that records every request and release.
 * @returns {Object}
 */
function createSharedWorkerNeo() {
    const disconnectedPairs = [],
          requests          = [];

    return {
        disconnectedPairs,
        requests,
        neo: {
            apps   : {1: {name: 'Workstation'}, 2: {name: 'Workstation'}},
            config : {allowAiClientInTests: true, appName: 'Workstation'},
            manager: {Window: {items: [{id: '1'}, {id: '2'}]}},
            worker : {App: {aiClientPromise: Promise.resolve(), id: '99999999-8888-7777-6666-555555555555', isSharedWorker: true}},
            ai     : {
                Client: {
                    handleAgentDisconnected(pair) {
                        disconnectedPairs.push(pair);
                        return {released: 1, swept: true}
                    },
                    async handleTestRequest(method, params, context) {
                        requests.push({context, method, params});
                        return {method, ok: true}
                    }
                }
            }
        }
    }
}

/**
 * @summary Runs a relayed `Runtime.evaluate` expression the way the worker would: as global code, against the
 * worker's `Neo`, awaiting its promise and reporting a throw as `exceptionDetails`.
 * @param {Object} neo
 * @param {String} expression
 * @returns {Promise<Object>} The CDP reply's payload
 */
async function evaluateInFakeWorker(neo, expression) {
    const previousNeo = globalThis.Neo;

    globalThis.Neo = neo;

    try {
        return {result: {type: 'object', value: await (0, eval)(expression)}}
    } catch (error) {
        return {result: {type: 'object'}, exceptionDetails: {exception: {description: String(error)}, text: 'Uncaught'}}
    } finally {
        globalThis.Neo = previousNeo
    }
}

/**
 * @summary A Chromium `Browser` whose CDP target list spans contexts, relaying target messages to a fake worker.
 * @param {Object}   options
 * @param {Object[]} options.targets   `Target.getTargets` infos
 * @param {Object}   [options.workerNeo] The attached worker's `Neo`
 * @returns {Object}
 */
function createFakeChromium({targets, workerNeo}) {
    const sessions = [];

    return {
        sessions,
        async newBrowserCDPSession() {
            const listeners = new Map(),
                  session   = {
                      attachedTo: null,
                      detached  : false,
                      emit(event, payload) {
                          (listeners.get(event) || []).forEach(listener => listener(payload))
                      },
                      on(event, listener) {
                          listeners.set(event, [...(listeners.get(event) || []), listener])
                      },
                      async detach() {
                          session.detached = true
                      },
                      async send(method, params) {
                          if (method === 'Target.getTargets') {
                              return {targetInfos: targets}
                          }
                          if (method === 'Target.attachToTarget') {
                              session.attachedTo = params.targetId;
                              return {sessionId: 'attached-session'}
                          }
                          if (method === 'Target.sendMessageToTarget') {
                              const {id, method: inner, params: innerParams} = JSON.parse(params.message);

                              queueMicrotask(async () => {
                                  const reply = inner === 'Runtime.evaluate'
                                      ? await evaluateInFakeWorker(workerNeo, innerParams.expression)
                                      : {result: {}};

                                  // CDP nests a command's payload: {id, result: {result: RemoteObject, exceptionDetails?}}
                                  session.emit('Target.receivedMessageFromTarget', {
                                      message  : JSON.stringify({id, result: reply}),
                                      sessionId: params.sessionId
                                  })
                              });

                              return {}
                          }

                          throw new Error(`unexpected CDP method ${method}`)
                      }
                  };

            sessions.push(session);
            return session
        }
    }
}

/**
 * @summary A Playwright `Page` in the CDP context `browserContextId`, with `workers` as its dedicated workers.
 * @param {String}   browserContextId
 * @param {Object[]} [workers=[]]
 * @returns {Object}
 */
function createFakePage(browserContextId, workers = []) {
    return {
        context: () => ({
            async newCDPSession() {
                return {
                    async detach() {},
                    async send() {
                        return {targetInfo: {browserContextId}}
                    }
                }
            }
        }),
        on() {},
        url    : () => 'about:blank',
        workers: () => workers
    }
}

const sharedWorkerTarget = (browserContextId, targetId) => ({browserContextId, targetId, type: 'shared_worker', url: APP_URL});

test.describe('test/playwright/sharedWorkerAppWorker — the page\'s own SharedWorker App Worker', () => {
    test('binds the SharedWorker of the page\'s own context, never another context\'s', async () => {
        const {neo}   = createSharedWorkerNeo(),
              browser = createFakeChromium({
                  targets  : [sharedWorkerTarget('ctx-other', 'other-test'), {type: 'page', url: 'about:blank'}, sharedWorkerTarget('ctx-mine', 'mine')],
                  workerNeo: neo
              });

        const handle = await attachPageSharedAppWorker({browser, page: createFakePage('ctx-mine')});

        expect(handle.targetId).toBe('mine');
        expect(browser.sessions[0].attachedTo).toBe('mine');
        expect(handle.url()).toBe(APP_URL)
    });

    test('yields no handle without a SharedWorker App Worker in the page\'s context, or without browser CDP', async () => {
        const browser = createFakeChromium({targets: [sharedWorkerTarget('ctx-other', 'other-test')]});

        expect(await attachPageSharedAppWorker({browser, page: createFakePage('ctx-mine')})).toBeNull();
        expect(browser.sessions[0].detached, 'an unused session is detached').toBe(true);
        expect(await attachPageSharedAppWorker({browser: {}, page: createFakePage('ctx-mine')})).toBeNull()
    });

    test('evaluate runs fn(arg) in the worker, awaits it, and turns a worker throw into a rejection', async () => {
        const {neo}  = createSharedWorkerNeo(),
              handle = await attachPageSharedAppWorker({
                  browser: createFakeChromium({targets: [sharedWorkerTarget('ctx-mine', 'mine')], workerNeo: neo}),
                  page   : createFakePage('ctx-mine')
              });

        expect(await handle.evaluate(async ({suffix}) => globalThis.Neo.worker.App.id + suffix, {suffix: '!'}))
            .toBe('99999999-8888-7777-6666-555555555555!');
        await expect(handle.evaluate(() => {throw new Error('worker-side failure')})).rejects.toThrow('worker-side failure')
    });

    test('console entries of the attached session reach onConsole; another session\'s never do', async () => {
        const entries = [],
              browser = createFakeChromium({targets: [sharedWorkerTarget('ctx-mine', 'mine')], workerNeo: createSharedWorkerNeo().neo});

        await attachPageSharedAppWorker({browser, onConsole: entry => entries.push(entry), page: createFakePage('ctx-mine')});

        const consoleEvent = (sessionId, value) => browser.sessions[0].emit('Target.receivedMessageFromTarget', {
            message: JSON.stringify({method: 'Runtime.consoleAPICalled', params: {args: [{type: 'string', value}], type: 'warning'}}),
            sessionId
        });

        consoleEvent('attached-session', 'from my worker');
        consoleEvent('some-other-session', 'from elsewhere');

        expect(entries.map(({message, type}) => ({message, type}))).toEqual([{message: 'from my worker', type: 'warning'}])
    });

    test('close() detaches the session and rejects a call still in flight', async () => {
        const browser = createFakeChromium({targets: [sharedWorkerTarget('ctx-mine', 'mine')], workerNeo: createSharedWorkerNeo().neo}),
              handle  = await attachPageSharedAppWorker({browser, page: createFakePage('ctx-mine')}),
              pending = handle.evaluate(() => new Promise(() => {}));

        await handle.close();

        await expect(pending).rejects.toThrow('session closed');
        expect(browser.sessions[0].detached).toBe(true)
    });
});

test.describe('test/playwright/dedicatedWorkerNeuralLink — the fixture on a SharedWorker page', () => {
    /**
     * @param {Object} browser
     * @param {Object} page
     * @returns {Object} The fixtures `runDedicatedWorkerNeuralLink` receives
     */
    const fixtures = (browser, page) => ({browser, context: {async route() {}}, page});

    test('serves the page\'s SharedWorker under the fixture\'s pair, releasing that pair before the session closes', async () => {
        const worker  = createSharedWorkerNeo(),
              browser = createFakeChromium({targets: [sharedWorkerTarget('ctx-mine', 'mine')], workerNeo: worker.neo});
        let pair;

        await runDedicatedWorkerNeuralLink(fixtures(browser, createFakePage('ctx-mine')), async nl => {
            pair = nl.writerPair;

            const nlApp = await nl.connectToApp('Workstation');

            await nlApp.setProperties('neo-button-1', {text: 'off-socket'});
            expect(browser.sessions[0].detached, 'the session outlives the test body').toBe(false)
        });

        expect(worker.requests.map(({context}) => context)).toEqual([pair]);
        expect(worker.disconnectedPairs).toEqual([pair]);
        expect(browser.sessions[0].detached).toBe(true)
    });

    test('two pages sharing one SharedWorker each dispatch and release only their own pair', async () => {
        const worker  = createSharedWorkerNeo(),
              browser = createFakeChromium({targets: [sharedWorkerTarget('ctx-shared', 'shared')], workerNeo: worker.neo}),
              pairs   = [];

        for (const text of ['first page', 'second page']) {
            await runDedicatedWorkerNeuralLink(fixtures(browser, createFakePage('ctx-shared')), async nl => {
                pairs.push(nl.writerPair);
                await (await nl.connectToApp('Workstation')).setProperties('neo-button-1', {text})
            });

            expect(worker.disconnectedPairs, `after the ${text}, only its own pair and earlier ones were released`)
                .toEqual([...pairs])
        }

        expect(pairs[0].sessionId).not.toBe(pairs[1].sessionId);
        expect(worker.requests.map(({context}) => context)).toEqual(pairs)
    });

    test('a page with a dedicated App Worker never opens a browser CDP session', async () => {
        const browser   = createFakeChromium({targets: [sharedWorkerTarget('ctx-mine', 'mine')]}),
              shared    = createSharedWorkerNeo(),
              dedicated = {
                  url: () => APP_URL,
                  async evaluate(fn, arg) {
                      const previousNeo = globalThis.Neo;

                      globalThis.Neo = {...shared.neo, worker: {App: {...shared.neo.worker.App, isSharedWorker: false}}};

                      try {
                          return await fn(arg)
                      } finally {
                          globalThis.Neo = previousNeo
                      }
                  }
              };

        await runDedicatedWorkerNeuralLink(fixtures(browser, createFakePage('ctx-mine', [dedicated])), async nl => {
            await (await nl.connectToApp('Workstation')).setProperties('neo-button-1', {text: 'dedicated'})
        });

        expect(browser.sessions).toHaveLength(0);
        expect(shared.requests).toHaveLength(1)
    })
});
