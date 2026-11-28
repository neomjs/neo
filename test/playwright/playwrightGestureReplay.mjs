import {setTimeout as delay}                    from 'node:timers/promises';
import {gestureLimits, normalizeGestureRequest} from '../../src/ai/client/gestureTrace.mjs';

const busyPages        = new WeakSet(),
      deliveryClockKey = 'neo.playwright.gestureDeliveryTime',
      eventType        = {touchcancel: 'touchCancel', touchend: 'touchEnd', touchmove: 'touchMove', touchstart: 'touchStart'};

/**
 * @summary Records trusted delivery in each fixture window before app listeners can delay observation.
 * CDP may set the native timestamp to the planned recognizer clock.
 * @param {import('@playwright/test').BrowserContext} context
 * @returns {Promise<void>}
 */
export function installBrowserGestureDeliveryClock(context) {
    return context.addInitScript(({deliveryClockKey, types}) => {
        const key = Symbol.for(deliveryClockKey);

        if (globalThis[key]) return;

        const times = new WeakMap();

        for (const type of types) {
            window.addEventListener(type, event => {
                if (event.isTrusted) times.set(event, performance.now())
            }, {capture: true, passive: true})
        }

        Object.defineProperty(globalThis, key, {value: event => times.get(event)})
    }, {deliveryClockKey, types: Object.keys(eventType)})
}

/**
 * @summary Finds one test-owned page by both App Worker and Main window identity.
 * @param {import('@playwright/test').Page[]} pages
 * @param {String} workerId
 * @param {String} windowId
 * @returns {Promise<import('@playwright/test').Page|null>}
 */
async function findPage(pages, workerId, windowId) {
    const matches = (await Promise.all([...new Set(pages)].filter(page => !page.isClosed()).map(async page => {
        const ownsTarget = await page.evaluate(async ({workerId, windowId}) => {
            const worker          = globalThis.Neo?.worker,
                  currentWindowId = worker?.Manager?.windowId;

            if (currentWindowId == null || String(currentWindowId) !== windowId) return false;

            const id = await worker.App?.getWorkerId?.();

            return (typeof id === 'string' ? id : id?.data) === workerId
        }, {workerId, windowId}).catch(() => false);

        return ownsTarget ? page : null
    }))).filter(Boolean);

    return matches.length === 1 ? matches[0] : null
}

/**
 * @summary Arms an observation bound to the original node without adding properties to the application.
 * @param {import('@playwright/test').Page} page
 * @param {Object} request The bound worker, window and target IDs.
 * @returns {Promise<import('@playwright/test').JSHandle>}
 */
function observeTarget(page, request) {
    return page.evaluateHandle(async ({deliveryClockKey, target, types, windowId, workerId}) => {
        const worker = globalThis.Neo?.worker,
              id     = await worker?.App?.getWorkerId?.();

        if (String(worker?.Manager?.windowId) !== windowId || (typeof id === 'string' ? id : id?.data) !== workerId) {
            return null
        }

        const find = () => target === 'body' || target === 'document.body' ? document.body : document.getElementById(target),
              node = find(),
              rect = node?.getBoundingClientRect();

        if (!rect?.width || !rect.height) return null;

        const deliveryTime = globalThis[Symbol.for(deliveryClockKey)];

        if (typeof deliveryTime !== 'function') return {clockAvailable: false};

        const controller = new AbortController(),
              events     = [],
              read       = list => Array.from(list, touch => ({
                  clientX: touch.clientX, clientY: touch.clientY, identifier: touch.identifier,
                  inside : node.contains(touch.target)
              }));

        for (const type of types) {
            document.addEventListener(type, event => {
                const time = deliveryTime(event);

                if (Number.isFinite(time)) events.push({
                    active: read(event.touches), changed: read(event.changedTouches), time, type
                })
            }, {capture: true, passive: true, signal: controller.signal})
        }

        return {
            events, clockAvailable: true, left: rect.left, top: rect.top, start: performance.now(),
            isLive : () => node.isConnected && find() === node,
            dispose: () => controller.abort()
        }
    }, {...request, deliveryClockKey, types: Object.keys(eventType)})
}

/**
 * @summary Converts delivered browser contact IDs to trace labels and checks the observed transition.
 * Chromium may deliver one event per changed point. The final active list and all changes must match the step.
 * @param {Object[]} events
 * @param {Object} step
 * @param {Map<Number, String|Number>} labels
 * @param {Object} origin
 * @returns {Object[]|null}
 */
function readStep(events, step, labels, {left, top, start}) {
    const sameIds = (points, intended) => points.length === intended.length &&
              intended.every(point => points.some(sample => sample.id === point.id)),
          map = list => list.map(({clientX, clientY, identifier}) => ({clientX, clientY, id: labels.get(identifier)})),
          samples = [],
          assigned = new Set();

    for (const event of events) {
        if (event.type !== step.type || [...event.active, ...event.changed].some(point => !point.inside)) return null;

        if (event.type === 'touchstart') {
            for (const point of event.changed) {
                const candidates = step.changed.filter(candidate => !assigned.has(candidate.id)),
                      match      = candidates.find(candidate => candidate.identifier === point.identifier) ??
                          candidates.find(candidate => Math.abs(left + candidate.x - point.clientX) <= 1 &&
                              Math.abs(top + candidate.y - point.clientY) <= 1);

                if (!match) return null;

                labels.set(point.identifier, match.id);
                assigned.add(match.id)
            }
        }

        const active = map(event.active), changed = map(event.changed);

        if ([...active, ...changed].some(point => point.id === undefined)) return null;

        samples.push({active, changed, elapsedMs: event.time - start, type: event.type})
    }

    return samples.length && sameIds(samples.at(-1).active, step.active) &&
        sameIds(samples.flatMap(sample => sample.changed), step.changed) ? samples : null
}

/**
 * @summary Replays a bounded touch trace over Chromium's native input in the exact owning document.
 * The receipt records browser events. App semantics must be read separately through Neural Link.
 * @param {Object} request
 * @param {Object} options
 * @param {Function} options.pages Returns the pages owned by this fixture.
 * @param {String} options.workerId
 * @returns {Promise<Object>} A complete, unavailable, invalid, or interrupted provider receipt.
 */
export async function driveBrowserGesture(request, {pages, workerId}) {
    const receipt = {
        cleanup : {attempted: false, succeeded: true}, observationAvailable: true,
        observed: [], phases: [], provider: 'browser', sequences: [], status: 'unavailable',
        success : false, terminal: 'none', trusted: null
    };
    const fail = (status, code, message) => Object.assign(receipt, {error: {code, message}, status});

    let plan;

    try {
        plan = normalizeGestureRequest(request)
    } catch (error) {
        return fail('invalid', 'INVALID_GESTURE_TRACE', error.message)
    }

    if (plan.frames.some(frame => frame.events.some(step => step.type === 'touchcancel' && step.active.length))) {
        return fail('unavailable', 'BROWSER_TOUCH_PARTIAL_CANCEL_UNAVAILABLE', 'CDP can only cancel all active contacts')
    }

    const page = await findPage(pages(), workerId, plan.windowId);

    if (!page) return fail('unavailable', 'BROWSER_PROVIDER_UNAVAILABLE', 'no attached Playwright page owns this worker and window');
    if (busyPages.has(page)) return fail('busy', 'GESTURE_BUSY', 'another browser gesture owns this page');

    busyPages.add(page);

    let cdp, observer, active = false;

    try {
        try {
            cdp = await page.context().newCDPSession(page)
        } catch {
            return fail('unavailable', 'BROWSER_PROVIDER_UNAVAILABLE', 'the owning page has no Chromium input attachment')
        }

        observer = await observeTarget(page, {target: plan.target, windowId: plan.windowId, workerId});
        const origin = await observer.evaluate(state => state && {
            clockAvailable: state.clockAvailable, left: state.left, top: state.top, start: state.start
        });

        if (!origin) return fail('unavailable', 'GESTURE_TARGET_UNAVAILABLE', 'the target has no rendered border box');

        if (!origin.clockAvailable) {
            receipt.observationAvailable = false;
            return fail('unavailable', 'BROWSER_PROVIDER_UNAVAILABLE', 'the owning page has no early delivery clock')
        }

        // The Engine dispatches in-process. Browser IPC can spend more time between delivered frames.
        const labels    = new Map(),
              timeoutMs = request.timeoutMs ?? Math.min(plan.timeoutMs + 4000, gestureLimits.durationMs + 1000),
              deadline  = performance.now() + timeoutMs;

        let previousTime = 0, observedAt = performance.now();

        for (const [index, frame] of plan.frames.entries()) {
            // A delayed CDP round trip must not use up the contact's next hold or move interval.
            const dueAt = observedAt + frame.t - previousTime,
                  wait  = Math.min(dueAt, deadline) - performance.now();

            if (wait > 0) await delay(Math.ceil(wait));
            if (dueAt >= deadline || performance.now() >= deadline) {
                return fail('interrupted', 'GESTURE_TIMEOUT', 'the browser trace exceeded its deadline')
            }

            const sample = {active: [], changed: [], events: [], frame: index, t: frame.t};

            for (const step of frame.events) {
                if (!await observer.evaluate(state => state.isLive())) {
                    return fail('interrupted', 'GESTURE_TARGET_REMOVED', 'the original browser target was removed or replaced')
                }

                const points = step.type === 'touchend' ? step.changed : step.active;

                // Target liveness is an async round trip and can settle after the frame deadline check.
                if (performance.now() >= deadline) {
                    return fail('interrupted', 'GESTURE_TIMEOUT', 'the browser trace exceeded its deadline')
                }

                active ||= step.type === 'touchstart';
                await cdp.send('Input.dispatchTouchEvent', {
                    type       : eventType[step.type],
                    touchPoints: points.map(({identifier, x, y}) => ({id: identifier, x: origin.left + x, y: origin.top + y}))
                });

                const events  = await observer.evaluate(state => state.events.splice(0)),
                      samples = readStep(events, step, labels, origin);

                if (!samples) {
                    return fail('interrupted', 'GESTURE_OBSERVATION_MISMATCH', `the browser did not deliver the planned ${step.type} transition`)
                }

                if (!sample.events.length) receipt.observed.push(sample);

                sample.active = samples.at(-1).active.map(point => point.id);
                sample.changed.push(...samples.flatMap(event => event.changed.map(point => point.id)));
                sample.events.push(...samples);
                receipt.trusted = true;
                active = sample.active.length > 0;

                if (step.terminal) {
                    receipt.sequences.push(step.terminal);
                    receipt.terminal = step.terminal
                }
            }

            previousTime = frame.t;
            observedAt   = performance.now()
        }

        return Object.assign(receipt, {status: 'complete', success: true})
    } catch (error) {
        const code = page.isClosed() ? 'GESTURE_WINDOW_DEPARTED' : 'BROWSER_GESTURE_DISPATCH_FAILED';

        return fail('interrupted', code, error.message)
    } finally {
        if (active) {
            receipt.sequences.push('none');
            receipt.terminal = 'none';
            receipt.cleanup.attempted = true;
            try {
                await cdp.send('Input.dispatchTouchEvent', {type: 'touchCancel', touchPoints: []});
                receipt.cleanup.succeeded = await observer.evaluate(state => state.events.some(event =>
                    event.type === 'touchcancel' && event.active.length === 0))
            } catch {
                receipt.cleanup.succeeded = false
            }
        }

        if (observer) {
            await observer.evaluate(state => state?.dispose?.()).catch(() => {});
            await observer.dispose().catch(() => {})
        }

        await cdp?.detach().catch(() => {});
        busyPages.delete(page)
    }
}
