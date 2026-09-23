/**
 * @summary The sessionStorage key a window keeps its canvas group id under.
 * @type {String}
 */
export const CANVAS_GROUP_STORAGE_KEY = 'neo-canvas-group';

/**
 * @summary The name prefix of a canvas SharedWorker; the group id follows it.
 * @type {String}
 */
export const CANVAS_WORKER_NAME_PREFIX = 'neomjs-canvas-worker-';

/**
 * @summary The app worker's view of canvas window groups: which window belongs to which group, each group's
 * channel port to its canvas worker, and whether that worker can take calls yet.
 *
 * One canvas SharedWorker serves one group, so canvas-bound traffic resolves `windowId` → group → port and never
 * falls back to another group: a call that reached a foreign group's worker would paint into a canvas of the
 * wrong process. A registered port is not readiness — the worker's `registerRemote` follows its `registerPort` —
 * so a group becomes `ready` only when its `Neo.worker.Canvas` registration arrives over its own channel.
 *
 * Waits are settled here and never queued inside `sendMessage`, which must return the `Message` it actually sent.
 *
 * @class Neo.worker.CanvasGroups
 */
class CanvasGroups {
    /**
     * @summary Creates a typed rejection for a canvas call.
     * @param {String} code    `NEO_UNROUTABLE`, `NEO_WORKER_START_FAILED` or `NEO_DEAD_PORT`
     * @param {String} message
     * @param {Object} [fields] Extra routing context, e.g. `windowId` or `group`
     * @returns {Error}
     */
    static error(code, message, fields={}) {
        return Object.assign(new Error(`CanvasGroups: ${message}`), {code, destination: 'canvas', ...fields})
    }

    /**
     * @summary Reads the canvas group id out of a canvas worker's own name.
     * @param {String} [name] `WorkerGlobalScope#name`
     * @returns {String|null} The group id, or `null` for a worker not named per group
     */
    static groupFromWorkerName(name) {
        return name?.startsWith(CANVAS_WORKER_NAME_PREFIX) ? name.slice(CANVAS_WORKER_NAME_PREFIX.length) || null : null
    }

    /**
     * @summary Decides which canvas group a booting window joins — the carrier rule.
     *
     * Windows of one browsing-context group share a renderer process, so they may share one canvas SharedWorker.
     * An unrelated root may not: painting a DOM canvas owned by another process kills the worker's host process.
     * The stored id is only evidence of membership in two cases, both measured:
     *
     * - a popup whose opener is live: its sessionStorage is the opener's copy, so the id names the opener's group;
     * - a boot reading `navigation.type === 'reload'`: the window rejoins the group it already belonged to.
     *
     * Every other boot mints a fresh id, because a copied id proves nothing: a duplicated tab, a session restore
     * (`back_forward` in Chromium) and a `navigate` that inherited storage all carry one without sharing a process.
     * @param {Object}   options
     * @param {Boolean}  options.hasLiveOpener  Whether `window.opener` exists and is not closed
     * @param {Function} options.mint           Returns a fresh group id
     * @param {String}   [options.navigationType='navigate'] `PerformanceNavigationTiming#type` of this boot
     * @param {String}   [options.stored]       The id this window's sessionStorage carries, if any
     * @returns {String} The group id this window joins
     */
    static resolveCarrier({hasLiveOpener, mint, navigationType='navigate', stored}) {
        if (stored && (hasLiveOpener || navigationType === 'reload')) {
            return stored
        }

        return mint()
    }

    /**
     * @member {Map<String, Object>} groups=new Map() Group id → `{port, state, timer, waiters}`
     */
    groups = new Map()
    /**
     * @member {Map<String, Object>} pending=new Map() Group id → `{port, ready}` that arrived before any member window
     */
    pending = new Map()
    /**
     * @member {Map<String, String>} windows=new Map() windowId → group id
     */
    windows = new Map()

    /**
     * @param {Object}   [options]
     * @param {Function} [options.isDeparted] `(windowId) => Boolean`: whether a window recently departed, so a late
     *     call from it rejects as its departure rather than as a routing defect
     * @param {Number}   [options.startBound=30000] Milliseconds a group may stay silent before its start counts as failed
     */
    constructor({isDeparted=() => false, startBound=30000}={}) {
        this.isDeparted = isDeparted;
        this.startBound = startBound
    }

    /**
     * @summary Records that a window's canvas worker belongs to a group — announced by the window's main thread
     * before that worker exists, so routing never has to guess.
     * @param {Object} data
     * @param {String} data.group
     * @param {String} data.windowId
     */
    addWindow({group, windowId}) {
        let early = this.pending.get(group),
            entry;

        this.windows.set(windowId, group);
        entry = this.entry(group);

        if (early) {
            this.pending.delete(group);
            early.port && (entry.port = early.port);
            early.ready && this.markReady(group)
        }
    }

    /**
     * @summary Returns a group's record, creating it in `booting` state with its silent-start bound running.
     * @param {String} group
     * @returns {Object}
     * @protected
     */
    entry(group) {
        let {groups} = this,
            entry    = groups.get(group);

        if (!entry) {
            entry = {port: null, state: 'booting', timer: null, waiters: new Set()};
            groups.set(group, entry);
            entry.timer = setTimeout(() => this.fail(group, 'silent'), this.startBound)
        }

        return entry
    }

    /**
     * @summary Fails a group whose canvas worker did not start: every wait on it rejects, now and later.
     * A failure reported after the group became ready is ignored — a running worker's own errors are mirrored,
     * not treated as a failed start.
     * @param {String} group
     * @param {String} cause `load` for a worker that failed to load or parse, `silent` for one that never answered
     */
    fail(group, cause) {
        let entry = this.groups.get(group);

        if (entry?.state !== 'booting') {
            return
        }

        clearTimeout(entry.timer);
        entry.state = 'failed';
        entry.cause = cause;

        entry.waiters.forEach(waiter => waiter.reject(this.startError(group, cause, waiter.windowId)));
        entry.waiters.clear()
    }

    /**
     * @param {String} group
     * @returns {Boolean}
     */
    has(group) {
        return this.groups.has(group)
    }

    /**
     * @summary Whether the group of this window is ready, so a canvas call may go straight through.
     * @param {String} [windowId]
     * @returns {Boolean}
     */
    isReady(windowId) {
        let group = this.resolve(windowId).group;
        return Boolean(group) && this.groups.get(group)?.state === 'ready'
    }

    /**
     * @summary Marks a group ready once its canvas worker's remotes have arrived over the group's own channel,
     * and releases its waits.
     * @param {String} group
     */
    markReady(group) {
        let entry = this.groups.get(group);

        // A group with no member window is retired or not yet announced: park the signal, never revive state
        if (!entry) {
            this.park(group, {ready: true});
            return
        }

        if (entry.state === 'ready') {
            return
        }

        clearTimeout(entry.timer);
        entry.state = 'ready';

        entry.waiters.forEach(waiter => waiter.resolve());
        entry.waiters.clear()
    }

    /**
     * @summary The port of one group, for traffic that already knows its group: a reply to a request that arrived
     * on that group's own channel.
     * @param {String} group
     * @returns {MessagePort|null}
     */
    groupPort(group) {
        return this.groups.get(group)?.port ?? null
    }

    /**
     * @summary The port a canvas-bound message for this window takes, or `null` when no port may take it.
     * @param {String} [windowId]
     * @returns {MessagePort|null}
     */
    portFor(windowId) {
        let {group} = this.resolve(windowId);
        return group ? this.groupPort(group) : null
    }

    /**
     * @summary Retires a departed window. Its own waits reject as that window's departure; a sibling on the same
     * group keeps waiting. A group whose last window left is retired with it.
     * @param {String} windowId
     */
    removeWindow(windowId) {
        let group = this.windows.get(windowId),
            entry = group && this.groups.get(group);

        if (!group) {
            return
        }

        this.windows.delete(windowId);

        entry?.waiters.forEach(waiter => {
            if (waiter.windowId === windowId) {
                entry.waiters.delete(waiter);
                waiter.reject(CanvasGroups.error('NEO_DEAD_PORT', `window ${windowId} departed before its canvas group was ready`, {windowId}))
            }
        });

        if (![...this.windows.values()].includes(group)) {
            clearTimeout(entry?.timer);
            this.groups.delete(group);
            this.pending.delete(group)
        }
    }

    /**
     * @summary Resolves the group a canvas call targets.
     *
     * A supplied `windowId` that names no known window is always unroutable. A missing one is unroutable only while
     * more than one group is known — a single-window caller keeps working, and a two-group omission is refused
     * instead of being guessed.
     * @param {String} [windowId]
     * @returns {{group: (String|null), error: (Error|null)}}
     */
    resolve(windowId) {
        let {groups, windows} = this;

        if (windowId) {
            let group = windows.get(windowId);

            if (group) {
                return {error: null, group}
            }

            // Late work from a window that just left is that window's departure, and never a sibling's to take
            return {
                error: this.isDeparted(windowId)
                    ? CanvasGroups.error('NEO_DEAD_PORT', `window ${windowId} departed`, {windowId})
                    : CanvasGroups.error('NEO_UNROUTABLE', `window ${windowId} belongs to no canvas group`, {windowId}),
                group: null
            }
        }

        if (groups.size === 1) {
            return {error: null, group: groups.keys().next().value}
        }

        return {
            error: CanvasGroups.error('NEO_UNROUTABLE', `a canvas call without a windowId is ambiguous across ${groups.size} groups`, {windowId: null}),
            group: null
        }
    }

    /**
     * @summary Records the channel port a group's canvas worker registered.
     * @param {Object}      data
     * @param {String}      data.group
     * @param {MessagePort} data.port
     */
    setPort({group, port}) {
        let entry = this.groups.get(group);

        entry ? entry.port = port : this.park(group, {port})
    }

    /**
     * @summary Holds a port or readiness signal that arrived for a group no window has joined yet.
     * @param {String} group
     * @param {Object} signal `{port}` and/or `{ready: true}`
     * @protected
     */
    park(group, signal) {
        this.pending.set(group, {...this.pending.get(group), ...signal})
    }

    /**
     * @param {String} group
     * @param {String} cause
     * @param {String} [windowId]
     * @returns {Error}
     * @protected
     */
    startError(group, cause, windowId) {
        return CanvasGroups.error('NEO_WORKER_START_FAILED', `canvas worker of group ${group} did not start (${cause})`, {cause, group, windowId})
    }

    /**
     * @summary Waits until the canvas group of this window is ready.
     * @param {String} [windowId]
     * @returns {Promise<void>} Rejects with `NEO_UNROUTABLE`, `NEO_WORKER_START_FAILED`, or — when the waiting window
     *     departs first — `NEO_DEAD_PORT` naming that window
     */
    whenReady(windowId) {
        let {error, group} = this.resolve(windowId);

        if (error) {
            return Promise.reject(error)
        }

        let entry = this.groups.get(group);

        if (entry.state === 'ready') {
            return Promise.resolve()
        }

        if (entry.state === 'failed') {
            return Promise.reject(this.startError(group, entry.cause, windowId))
        }

        return new Promise((resolve, reject) => {
            entry.waiters.add({reject, resolve, windowId})
        })
    }
}

export default CanvasGroups;
