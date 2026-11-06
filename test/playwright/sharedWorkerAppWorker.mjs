/**
 * @summary Binds a page's own SharedWorker App Worker through the browser's CDP targets, behind the `evaluate`
 * a Playwright `Worker` offers, so the off-socket `neuralLink` adapter serves SharedWorker apps unchanged.
 *
 * Playwright lists dedicated workers in `page.workers()` but never SharedWorkers. The browser's target list
 * has them, for every context in the browser, so a parallel test's SharedWorker is one entry away. The handle
 * therefore matches the page's own `browserContextId` AND the exact script URL the page's worker Manager loads
 * its App Worker from: one context can hold App Workers of different roots, and the dedicated adapter addresses
 * the page's own worker, never a worker found by name. A context with two candidates for that URL is refused
 * rather than guessed. Chromium only; elsewhere there is no browser CDP session and no handle.
 */

/**
 * @summary Reads the absolute script URL the page's own App Worker loads, the way
 * `Neo.worker.Manager#createWorker` builds it, or null while the page has no Neo main thread yet.
 * @param {Object} page A Playwright `Page`
 * @returns {Promise<String|null>}
 */
async function readPageAppWorkerUrl(page) {
    try {
        return await page.evaluate(() => {
            const app = globalThis.Neo?.worker?.Manager?.workers?.app;

            return app ? new URL((app.basePath || globalThis.Neo.config.workerBasePath) + app.fileName, document.baseURI).href : null
        })
    } catch {
        return null
    }
}

/**
 * @summary Reads the CDP `browserContextId` a page belongs to.
 * @param {Object} page A Playwright `Page`
 * @returns {Promise<String|null>}
 */
async function readBrowserContextId(page) {
    const session = await page.context().newCDPSession(page);

    try {
        const {targetInfo} = await session.send('Target.getTargetInfo');

        return targetInfo?.browserContextId || null
    } finally {
        await session.detach().catch(() => {})
    }
}

/**
 * @summary Formats a `Runtime.consoleAPICalled` event as a captured log entry, in the dedicated adapter's shape.
 * @param {Object} params The event's params
 * @returns {{message: String, timestamp: Number, type: String}}
 */
function toLogEntry({args = [], type = 'log'}) {
    return {
        message  : args.map(arg => arg.value ?? arg.description ?? '').join(' '),
        timestamp: Date.now(),
        type
    }
}

/**
 * @summary Attaches to the page's own SharedWorker App Worker and returns a `Worker`-shaped handle, or null
 * while the page has none yet (or the browser offers no CDP). Two candidates for the page's App Worker URL in its
 * context throw instead of binding either.
 *
 * The handle's `evaluate(fn, arg)` runs `fn(arg)` inside the worker and resolves its value, awaiting promises,
 * so `createDedicatedWorkerAppConnection` and `disconnectTestWriter` accept it unchanged. Its `close()` detaches
 * the CDP session, which the fixture's teardown owes after it has released the test's writer pair. Until the
 * handle exists, every exit detaches the browser session itself and keeps the original error.
 * @param {Object}   options
 * @param {Object}   options.browser     A Playwright `Browser`
 * @param {Function} [options.onConsole] Receives each console entry the worker logs, as `{message, timestamp, type}`
 * @param {Object}   options.page        A Playwright `Page`
 * @returns {Promise<Object|null>} `{close, evaluate, targetId, url}`
 */
export async function attachPageSharedAppWorker({browser, onConsole, page}) {
    if (typeof browser?.newBrowserCDPSession !== 'function') {
        return null
    }

    const browserContextId = await readBrowserContextId(page),
          appWorkerUrl     = await readPageAppWorkerUrl(page);

    if (!browserContextId || !appWorkerUrl) {
        return null
    }

    const cdp = await browser.newBrowserCDPSession();

    try {
        const {targetInfos} = await cdp.send('Target.getTargets'),
              candidates    = targetInfos.filter(info => info.type === 'shared_worker' &&
                  info.browserContextId === browserContextId && info.url === appWorkerUrl);

        if (candidates.length > 1) {
            const error = new Error(`${candidates.length} SharedWorker App Workers in the page's context load ` +
                `${appWorkerUrl}; refusing to guess which one is the page's own.`);

            error.name = 'AmbiguousSharedAppWorkerError';
            throw error
        }

        const [target] = candidates;

        if (!target) {
            await cdp.detach().catch(() => {});
            return null
        }

        const {sessionId} = await cdp.send('Target.attachToTarget', {targetId: target.targetId, flatten: false}),
              pending     = new Map();
        let nextId = 0;

        cdp.on('Target.receivedMessageFromTarget', ({message, sessionId: from}) => {
            if (from !== sessionId) return;

            const data = JSON.parse(message);

            if (pending.has(data.id)) {
                const {reject, resolve} = pending.get(data.id);

                pending.delete(data.id);
                data.error ? reject(new Error(data.error.message)) : resolve(data.result)
            } else if (data.method === 'Runtime.consoleAPICalled') {
                onConsole?.(toLogEntry(data.params))
            }
        });

        /**
         * @param {String} method
         * @param {Object} [params]
         * @returns {Promise<Object>}
         */
        const send = (method, params = {}) => new Promise((resolve, reject) => {
            const id = ++nextId;

            pending.set(id, {reject, resolve});
            cdp.send('Target.sendMessageToTarget', {message: JSON.stringify({id, method, params}), sessionId})
                .catch(error => {
                    pending.delete(id);
                    reject(error)
                })
        });

        onConsole && await send('Runtime.enable');

        return {
            targetId: target.targetId,
            url     : () => target.url,

            async close() {
                pending.forEach(({reject}) => reject(new Error('The SharedWorker App Worker session closed.')));
                pending.clear();
                await cdp.detach().catch(() => {})
            },

            async evaluate(fn, arg) {
                const {exceptionDetails, result} = await send('Runtime.evaluate', {
                    awaitPromise : true,
                    expression   : `(${fn})(${JSON.stringify(arg)})`,
                    returnByValue: true
                });

                if (exceptionDetails) {
                    throw new Error(exceptionDetails.exception?.description || exceptionDetails.text)
                }

                return result?.value
            }
        }
    } catch (error) {
        await cdp.detach().catch(() => {});
        throw error
    }
}
