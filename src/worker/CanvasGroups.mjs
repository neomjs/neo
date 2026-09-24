import Base from '../core/Base.mjs';

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
 * A group routes to one live channel at a time. The canvas worker opens a channel per window connection and sends
 * each new one over its current one, so a `registerPort` arriving over the group's channel is a handover within the
 * same worker and keeps its readiness; one arriving any other way is a new worker, which must register again. A
 * replaced or retired channel is closed and never counts again — its late signals can neither ready a group nor
 * survive into a later reload of it.
 *
 * Waits are settled here and never queued inside `sendMessage`, which must return the `Message` it actually sent.
 *
 * @class Neo.worker.CanvasGroups
 * @extends Neo.core.Base
 */
class CanvasGroups extends Base {
    static config = {
        /**
         * @member {String} className='Neo.worker.CanvasGroups'
         * @protected
         */
        className: 'Neo.worker.CanvasGroups',
        /**
         * `(windowId) => Boolean`: whether a window recently departed, so a late call from it rejects as its departure
         * rather than as a routing defect
         * @member {Function|null} isDeparted=null
         */
        isDeparted: null,
        /**
         * Milliseconds a group may stay silent before its start counts as failed
         * @member {Number} startBound=30000
         */
        startBound: 30000
    }

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
     * @summary Mints a fresh group id without needing a secure context.
     *
     * The group is resolved at every boot, before any worker exists. `crypto.randomUUID` exists only in a secure
     * context, so an app served over plain http whose window id comes from SSR — which boots without it today —
     * would throw here. `crypto.getRandomValues` has no such gate.
     * @returns {String} 32 hex characters
     */
    static mint() {
        return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
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
     * @member {WeakSet<MessagePort>} retired=new WeakSet() Channels this worker stopped routing to
     */
    retired = new WeakSet()
    /**
     * @member {Map<String, String>} windows=new Map() windowId → group id
     */
    windows = new Map()

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
            entry.port = early.port;
            early.ready && this.markReady(group, early.port)
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
            entry = {port: null, state: null, timer: null, waiters: new Set()};
            groups.set(group, entry);
            this.boot(group, entry)
        }

        return entry
    }

    /**
     * @summary Puts a group into `booting` with a fresh silent-start bound — at its creation, and again when a new
     * canvas worker takes it over. Its waits keep waiting.
     * @param {String} group
     * @param {Object} entry
     * @protected
     */
    boot(group, entry) {
        clearTimeout(entry.timer);
        entry.state = 'booting';
        entry.timer = setTimeout(() => this.fail(group, 'silent'), this.startBound)
    }

    /**
     * @summary Settles what the instance still holds before it releases its members: every silent-start bound is
     * cleared, every wait rejects as a dead port, and every channel, routed or held for an announcement, is closed.
     */
    destroy() {
        let me = this;

        me.groups.forEach((entry, group) => {
            clearTimeout(entry.timer);

            entry.waiters.forEach(waiter => waiter.reject(
                CanvasGroups.error('NEO_DEAD_PORT', `canvas group ${group} destroyed before it was ready`, {group, windowId: waiter.windowId})
            ));

            entry.port && me.retireChannel(entry.port)
        });

        me.pending.forEach(({port}) => me.retireChannel(port));

        super.destroy()
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
     *
     * Not `isReady`: that is `core.Base`'s reactive config, and applying its default creates an instance property
     * that would shadow a method of the same name.
     * @param {String} [windowId]
     * @returns {Boolean}
     */
    isReadyFor(windowId) {
        let group = this.resolve(windowId).group;
        return Boolean(group) && this.groups.get(group)?.state === 'ready'
    }

    /**
     * @summary Marks a group ready once its canvas worker's remotes have arrived over the group's own channel,
     * and releases its waits. Readiness from any other channel — a replaced or retired one — counts for nothing.
     * @param {String}      group
     * @param {MessagePort} channel The channel the registration arrived over
     */
    markReady(group, channel) {
        let entry = this.groups.get(group),
            early;

        if (!entry) {
            early = this.pending.get(group);

            // Not yet announced: kept only together with the channel that delivered it
            if (early?.port === channel) {
                early.ready = true
            }

            return
        }

        if (entry.port !== channel || entry.state === 'ready') {
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

        entry.waiters.forEach(waiter => {
            if (waiter.windowId === windowId) {
                entry.waiters.delete(waiter);
                waiter.reject(CanvasGroups.error('NEO_DEAD_PORT', `window ${windowId} departed before its canvas group was ready`, {windowId}))
            }
        });

        if (![...this.windows.values()].includes(group)) {
            this.retire(group, windowId)
        }
    }

    /**
     * @summary Retires a group whose last window left. Its remaining waits — those that omitted a window while it
     * was the only group — reject as that window's departure, and its channel is closed, so nothing that channel
     * delivers late can ready the group again.
     * @param {String} group
     * @param {String} windowId The window that left last
     * @protected
     */
    retire(group, windowId) {
        let entry = this.groups.get(group);

        clearTimeout(entry.timer);

        entry.waiters.forEach(waiter => waiter.reject(
            CanvasGroups.error('NEO_DEAD_PORT', `canvas group ${group} retired: its last window ${windowId} departed`, {group, windowId})
        ));

        entry.port && this.retireChannel(entry.port);
        this.groups.delete(group)
    }

    /**
     * @summary Stops routing to a channel for good: its handler is released, the port closed, and it never counts
     * again.
     * @param {MessagePort} channel
     * @protected
     */
    retireChannel(channel) {
        this.retired.add(channel);
        channel.onmessage = null;
        channel.close()
    }

    /**
     * @summary Rejects the waits that one exact main-port generation admitted, once that port is retired — even when
     * its window lives on in another port, the rule `Neo.worker.Base#removePort` applies to calls already sent.
     * @param {Object} portEntry
     */
    retirePort(portEntry) {
        this.groups.forEach(entry => entry.waiters.forEach(waiter => {
            if (waiter.portEntry === portEntry) {
                entry.waiters.delete(waiter);
                waiter.reject(CanvasGroups.error('NEO_DEAD_PORT', `port ${portEntry.id} retired before its canvas group was ready`, {windowId: waiter.windowId}))
            }
        }))
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
                error: this.isDeparted?.(windowId)
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
     * @summary Records the channel a group's canvas worker registered, and retires the channel it replaces.
     *
     * `handover` says the registration arrived over the group's own channel. Only the worker holding that channel can
     * send over it, so the new one leads to the same worker and keeps the group's readiness. A replacement arriving
     * any other way is a new worker: the group starts over at `booting`, and readiness must arrive over the new channel.
     * @param {Object}      data
     * @param {String}      data.group
     * @param {Boolean}     [data.handover=false]
     * @param {MessagePort} data.port
     */
    setPort({group, handover=false, port}) {
        if (this.retired.has(port)) {
            return
        }

        let entry = this.groups.get(group),
            early = entry ? null : this.pending.get(group),
            old   = entry ? entry.port : early?.port;

        if (old === port) {
            return
        }

        old && this.retireChannel(old);

        if (entry) {
            entry.port = port;
            old && !handover && this.boot(group, entry)
        } else {
            // Before the window announcement: held for it, with readiness only when the same worker handed it over
            this.pending.set(group, {port, ready: handover && Boolean(early?.ready)})
        }
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
     * @param {Object} [portEntry=null] The main-port generation that admitted the call: retiring it rejects the wait
     * @returns {Promise<void>} Rejects with `NEO_UNROUTABLE`, `NEO_WORKER_START_FAILED`, or `NEO_DEAD_PORT` when the
     *     admitting port, the waiting window or the group's last window leaves first
     */
    whenReady(windowId, portEntry=null) {
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
            entry.waiters.add({portEntry, reject, resolve, windowId})
        })
    }
}

export default Neo.setupClass(CanvasGroups);
