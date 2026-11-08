import {test, expect}                 from '@playwright/test';
import vm                             from 'node:vm';
import {attachPageSharedAppWorker}    from '../../sharedWorkerAppWorker.mjs';
import {runDedicatedWorkerNeuralLink} from '../../dedicatedWorkerNeuralLink.mjs';

const APP_URL   = 'http://localhost:8080/src/worker/App.mjs',
      REALM_NEO = globalThis.Neo;

// The fake workers evaluate in their own vm contexts. A leaked fake Neo would break the next spec in this worker.
test.afterAll(() => {
    expect(globalThis.Neo, 'the test realm keeps its own Neo').toBe(REALM_NEO)
});

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
 * worker's `Neo`, awaiting its promise and reporting a throw as `exceptionDetails`. The expression runs in its own
 * `vm` context, so overlapping evaluations never swap the test realm's `globalThis.Neo` under each other.
 * @param {Object} neo
 * @param {String} expression
 * @returns {Promise<Object>} The CDP reply's payload
 */
async function evaluateInFakeWorker(neo, expression) {
    try {
        return {result: {type: 'object', value: await vm.runInNewContext(expression, {Neo: neo})}}
    } catch (error) {
        return {result: {type: 'object'}, exceptionDetails: {exception: {description: String(error)}, text: 'Uncaught'}}
    }
}

/**
 * @summary A Chromium `Browser` whose CDP target list spans contexts, relaying target messages to a fake worker.
 * @param {Object}   options
 * @param {Object[]} options.targets      `Target.getTargets` infos
 * @param {Object}   [options.workerNeo]  The attached worker's `Neo`
 * @param {Object}   [options.workerNeos] A `Neo` per target id, for a page whose re-boot starts another worker
 * @returns {Object}
 */
function createFakeChromium({attachError, targets, workerNeo, workerNeos}) {
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
                              if (attachError) {
                                  throw new Error(attachError)
                              }

                              session.attachedTo = params.targetId;
                              return {sessionId: 'attached-session'}
                          }
                          if (method === 'Target.sendMessageToTarget') {
                              const {id, method: inner, params: innerParams} = JSON.parse(params.message);

                              queueMicrotask(async () => {
                                  const reply = inner === 'Runtime.evaluate'
                                      ? await evaluateInFakeWorker(workerNeos?.[session.attachedTo] ?? workerNeo, innerParams.expression)
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
 * @param {String} [appWorkerUrl=APP_URL]
 * @param {String} [workerId] The page's remote App Worker id
 * @returns {Object}
 */
function createFakePage(browserContextId, workers = [], appWorkerUrl = APP_URL, workerId = '99999999-8888-7777-6666-555555555555') {
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
        // Execute the actual page-side read, including the SharedWorker remote's reply envelope.
        evaluate: async fn => vm.runInNewContext(`(${fn})()`, {
            Neo: {
                config: {workerBasePath: ''},
                worker: {
                    App    : {getWorkerId: async () => ({data: workerId})},
                    Manager: {workers: {app: appWorkerUrl ? {basePath: '', fileName: appWorkerUrl} : null}}
                }
            },
            URL,
            document: {baseURI: 'http://localhost:8080/'}
        }),
        isClosed: () => false,
        on() {},
        opener : async () => null,
        url    : () => 'about:blank',
        workers: () => workers
    }
}

const sharedWorkerTarget = (browserContextId, targetId, url = APP_URL) => ({browserContextId, targetId, type: 'shared_worker', url});

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

    test('binds the App Worker the page itself loads when another root\'s App Worker shares its context', async () => {
        const rootA   = 'http://localhost:8080/root-a/src/worker/App.mjs',
              rootB   = 'http://localhost:8080/root-b/src/worker/App.mjs',
              browser = createFakeChromium({
                  targets  : [sharedWorkerTarget('ctx-mine', 'root-a', rootA), sharedWorkerTarget('ctx-mine', 'root-b', rootB)],
                  workerNeo: createSharedWorkerNeo().neo
              });

        const handle = await attachPageSharedAppWorker({browser, page: createFakePage('ctx-mine', [], rootB)});

        expect(handle.targetId, 'a page of root B binds root B').toBe('root-b');
        expect(browser.sessions.map(session => session.attachedTo), 'root A is never attached').toEqual(['root-b'])
    });

    test('two candidates for the page\'s App Worker script are refused, and the browser session is released', async () => {
        const browser = createFakeChromium({targets: [sharedWorkerTarget('ctx-mine', 'first'), sharedWorkerTarget('ctx-mine', 'second')]});

        await expect(attachPageSharedAppWorker({browser, page: createFakePage('ctx-mine')})).rejects.toMatchObject({
            message: expect.stringContaining('refusing to guess'),
            name   : 'AmbiguousSharedAppWorkerError'
        });
        expect(browser.sessions[0].attachedTo, 'neither candidate is attached').toBeNull();
        expect(browser.sessions[0].detached, 'the refusal releases the session').toBe(true)
    });

    test('a target that disappears before attachment releases the browser session and keeps the original error', async () => {
        const browser = createFakeChromium({attachError: 'No target with given id found', targets: [sharedWorkerTarget('ctx-mine', 'gone')]});

        await expect(attachPageSharedAppWorker({browser, page: createFakePage('ctx-mine')})).rejects.toThrow('No target with given id found');
        expect(browser.sessions[0].detached, 'the failed attachment releases the session').toBe(true)
    });

    test('before the page names its App Worker script, no browser session opens', async () => {
        const browser = createFakeChromium({targets: [sharedWorkerTarget('ctx-mine', 'mine')]});

        expect(await attachPageSharedAppWorker({browser, page: createFakePage('ctx-mine', [], null)})).toBeNull();
        expect(browser.sessions).toHaveLength(0)
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

    test('a closed handle rejects a later call at once', async () => {
        const browser = createFakeChromium({targets: [sharedWorkerTarget('ctx-mine', 'mine')], workerNeo: createSharedWorkerNeo().neo}),
              handle  = await attachPageSharedAppWorker({browser, page: createFakePage('ctx-mine')});

        await handle.close();

        await expect(handle.evaluate(() => 'answered')).rejects.toThrow('session closed')
    });
});

test.describe('test/playwright/dedicatedWorkerNeuralLink — the fixture on a SharedWorker page', () => {
    /**
     * @param {Object} browser
     * @param {Object} page
     * @returns {Object} The fixtures `runDedicatedWorkerNeuralLink` receives
     */
    const fixtures = (browser, page) => ({browser, context: {async route() {}}, page});

    test('an id-bound second context releases before navigation and on its last window closing', async () => {
        const workerId        = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
              first           = createSharedWorkerNeo(),
              second          = createSharedWorkerNeo(),
              targets         = [sharedWorkerTarget('ctx-cold', 'first')],
              browser         = createFakeChromium({targets, workerNeos: {first: first.neo, second: second.neo}}),
              fixture         = createFakePage('ctx-seed'),
              cold            = createFakePage('ctx-cold', [], APP_URL, workerId),
              routes          = [],
              closes          = [],
              mainFrame       = {},
              originalContext = cold.context();
        let pages = [cold];

        first.neo.worker.App.id = second.neo.worker.App.id = workerId;
        fixture.isClosed = () => true;
        cold.context = () => ({...originalContext, pages: () => pages});
        cold.mainFrame = () => mainFrame;
        cold.on = (event, listener) => {event === 'close' && closes.push(listener)};
        cold.route = async (pattern, handler) => {routes.push({handler, pattern})};
        browser.contexts = () => [cold.context()];

        await runDedicatedWorkerNeuralLink(fixtures(browser, fixture), async nl => {
            const app = await nl.connectToApp(workerId, {identityTimeout: 100});

            await app.setProperties('cold', {text: 'first boot'});

            const navigation = routes.find(({pattern}) => pattern.test('http://localhost:8080/apps/workstation/index.html'));

            await navigation.handler({
                fallback: async () => {},
                request : () => ({frame: () => ({}), isNavigationRequest: () => true})
            });
            expect(browser.sessions[0].detached, 'an iframe does not release the root binding').toBe(false);

            let detachedBeforeDocument = false;

            await navigation.handler({
                fallback: async () => {detachedBeforeDocument = browser.sessions[0].detached},
                request : () => ({frame: () => mainFrame, isNavigationRequest: () => true})
            });
            expect(detachedBeforeDocument, 'the second context releases before its navigation continues').toBe(true);

            targets.splice(0, 1, sharedWorkerTarget('ctx-cold', 'second'));
            await app.setProperties('cold', {text: 'second boot'});

            second.neo.ai.Client.handleTestRequest = () => new Promise(() => {});
            const unanswered = app.setProperties('cold', {text: 'last window'});

            pages = [];
            closes.forEach(listener => listener(cold));

            await expect(unanswered).rejects.toThrow('session closed')
        });

        expect(first.requests.map(({params}) => params.properties.text)).toEqual(['first boot']);
        expect(second.requests.map(({params}) => params.properties.text)).toEqual(['second boot']);
        expect(browser.sessions.every(session => session.detached)).toBe(true)
    });

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

    test('a navigation of the page\'s own document releases the session before it proceeds, and the next call binds the App Worker it started', async () => {
        const first     = createSharedWorkerNeo(),
              second    = createSharedWorkerNeo(),
              targets   = [sharedWorkerTarget('ctx-mine', 'first')],
              browser   = createFakeChromium({targets, workerNeos: {first: first.neo, second: second.neo}}),
              page      = createFakePage('ctx-mine'),
              mainFrame = {},
              routes    = [];

        page.mainFrame = () => mainFrame;
        page.route     = async (pattern, handler) => {routes.push({handler, pattern})};

        await runDedicatedWorkerNeuralLink(fixtures(browser, page), async nl => {
            const nlApp = await nl.connectToApp('Workstation');

            await nlApp.setProperties('neo-button-1', {text: 'first boot'});

            // A held session would keep `first` alive into the next boot; the next document starts `second`
            targets.splice(0, 1, sharedWorkerTarget('ctx-mine', 'second'));

            const navigation    = routes.find(({pattern}) => pattern.test('http://localhost:8080/apps/workstation/index.html'));
            let   releasedFirst = null;

            await navigation.handler({
                fallback: async () => {releasedFirst = browser.sessions[0].detached},
                request : () => ({frame: () => mainFrame, isNavigationRequest: () => true})
            });

            expect(releasedFirst, 'the session is released before the document request continues').toBe(true);

            await nlApp.setProperties('neo-button-1', {text: 'second boot'});
            expect(browser.sessions[1].attachedTo, 'the next call attaches the new App Worker').toBe('second')
        });

        expect(first.requests.map(({params}) => params.properties.text)).toEqual(['first boot']);
        expect(second.requests.map(({params}) => params.properties.text)).toEqual(['second boot'])
    });

    test('the context\'s last window closing releases the session, so a call the worker never answers rejects', async () => {
        const worker         = createSharedWorkerNeo(),
              browser        = createFakeChromium({targets: [sharedWorkerTarget('ctx-mine', 'mine')], workerNeo: worker.neo}),
              page           = createFakePage('ctx-mine'),
              pageContext    = page.context,
              closeListeners = [];

        page.context = () => ({...pageContext(), pages: () => []});
        page.on      = (event, listener) => {event === 'close' && closeListeners.push(listener)};

        await runDedicatedWorkerNeuralLink(fixtures(browser, page), async nl => {
            const nlApp = await nl.connectToApp('Workstation');

            // A worker kept alive past its last window never answers again
            worker.neo.ai.Client.handleTestRequest = () => new Promise(() => {});

            const unanswered = nlApp.setProperties('neo-button-1', {text: 'after the last window'});

            closeListeners.forEach(listener => listener(page));

            await expect(unanswered).rejects.toThrow('session closed')
        });

        expect(browser.sessions[0].detached).toBe(true)
    });

    test('a page with a dedicated App Worker never opens a browser CDP session', async () => {
        const browser   = createFakeChromium({targets: [sharedWorkerTarget('ctx-mine', 'mine')]}),
              shared    = createSharedWorkerNeo(),
              dedicated = {
                  url: () => APP_URL,
                  async evaluate(fn, arg) {
                      return vm.runInNewContext(`(${fn})(${JSON.stringify(arg)})`, {
                          Neo: {...shared.neo, worker: {App: {...shared.neo.worker.App, isSharedWorker: false}}}
                      })
                  }
              };

        await runDedicatedWorkerNeuralLink(fixtures(browser, createFakePage('ctx-mine', [dedicated])), async nl => {
            await (await nl.connectToApp('Workstation')).setProperties('neo-button-1', {text: 'dedicated'})
        });

        expect(browser.sessions).toHaveLength(0);
        expect(shared.requests).toHaveLength(1)
    })
});
