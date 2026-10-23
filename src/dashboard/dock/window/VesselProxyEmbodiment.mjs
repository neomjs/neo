import Base               from '../../../core/Base.mjs';
import DragProxyComponent from '../../../draggable/DragProxyComponent.mjs';
import DragProxyContainer from '../../../draggable/DragProxyContainer.mjs';
import VesselEmbodiment   from './VesselEmbodiment.mjs';

/**
 * @summary One host-local target-proxy embodiment over a {@link Neo.dashboard.dock.window.VesselEmbodiment}.
 *
 * A claimed tab drag (`embodyHeader`) enters the target as the tab-header proxy it showed in its own
 * window — a {@link Neo.draggable.DragProxyComponent} over the source zone's drag-proxy vdom — while
 * the live pane stays home until the drop. Every other embodiment (the native title-bar handoff) moves
 * the SAME live pane into one target-window {@link Neo.draggable.DragProxyContainer}, the owned
 * VesselEmbodiment preserving its exact slot in the parked source popup. The generation fence makes a
 * late renderer settlement from a restored predecessor unable to retire a successor proxy.
 *
 * The host remains the lifecycle authority: pointer movement calls {@link #move}, a leave or cancel
 * calls {@link #restore}, and a committed transfer calls {@link #promote}. No document or native-window
 * state enters this class. It owns its proxies and its VesselEmbodiment and destroys both; the live
 * pane stays borrowed.
 * @class Neo.dashboard.dock.window.VesselProxyEmbodiment
 * @extends Neo.core.Base
 */
class VesselProxyEmbodiment extends Base {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.dock.window.VesselProxyEmbodiment'
         * @protected
         */
        className: 'Neo.dashboard.dock.window.VesselProxyEmbodiment',
        /**
         * Host pane resolution: `(itemId) => Neo.component.Base|null`.
         * @member {Function|null} resolvePane=null
         */
        resolvePane: null,
        /**
         * Host proxy policy: `({draggedItem, proxyRect, sourceSortZone, sourceWindowId, targetWindowId}) =>
         * Object|null` — the proxy config, or null when this target takes no proxy.
         * @member {Function|null} resolveProxyConfig=null
         */
        resolveProxyConfig: null
    }

    /**
     * The one active proxy record: `{generation, header, itemId, promoted, proxy, settle, settlement,
     * settled, sourceWindowId, targetWindowId}`.
     * @member {Object|null} active=null
     * @protected
     */
    active = null
    /**
     * The owned registry that reserves a pane proxy's exact source slot.
     * @member {Neo.dashboard.dock.window.VesselEmbodiment|null} embodiment=null
     * @protected
     */
    embodiment = null
    /**
     * Monotonic proxy generation; the fence against late settlements.
     * @member {Number} generation=0
     * @protected
     */
    generation = 0

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        const me = this;

        if (typeof me.resolvePane !== 'function' || typeof me.resolveProxyConfig !== 'function') {
            throw new Error(`${me.className} requires resolvePane and resolveProxyConfig seams`)
        }

        me.embodiment = Neo.create(VesselEmbodiment, {
            resolvePane  : itemId => me.resolvePane(itemId),
            resolveTarget: targetWindowId => me.active?.targetWindowId === targetWindowId ? me.active.proxy : null
        })
    }

    /**
     * @summary Creates one proxy instance from its resolved config. Overridable; focused tests inject one.
     * @param {Object} config
     * @returns {Neo.component.Base}
     * @protected
     */
    createProxy(config) {
        return Neo.create(config)
    }

    /**
     * @summary Restores any active pane proxy, retires the proxy, then destroys the owned embodiment.
     * @param {...*} args
     */
    destroy(...args) {
        const me     = this,
              record = me.active;

        if (record && !record.promoted && !record.header) {
            me.embodiment.restore({itemId: record.itemId, windowId: record.targetWindowId})
        }

        record && me.active === record && me.retireProxy(record);
        me.embodiment?.destroy();

        super.destroy(...args)
    }

    /**
     * @summary Whether one target-local proxy rectangle is finite and drawable.
     * @param {Object} rect
     * @returns {Boolean}
     * @protected
     */
    isMeasurableProxyRect(rect) {
        return Boolean(rect) &&
            Number.isFinite(rect.x) && Number.isFinite(rect.y) &&
            Number.isFinite(rect.width) && rect.width > 0 &&
            Number.isFinite(rect.height) && rect.height > 0
    }

    /**
     * @summary Reports whether one item renders through a target proxy: a header proxy, or the pane
     * itself with its exact source-slot reservation.
     * @param {String} itemId
     * @returns {Boolean}
     */
    isStaged(itemId) {
        const {active} = this;

        return (active?.header === true && active.itemId === itemId) || this.embodiment.isStaged(itemId)
    }

    /**
     * @summary Moves or updates one admitted target-local proxy.
     *
     * The move is synchronously fail-closed: by return time either a proxy is admitted (a header proxy
     * whose mount is under way, or the pane with a recorded exact source slot and the proxy as its
     * parent), or none is. Renderer settlement continues behind the generation fence and is exposed
     * through {@link #snapshot} for release gating; a header proxy whose mount is refused retires, and
     * {@link #isStaged} stops answering for it.
     * @param {Object} data
     * @param {Neo.component.Base} data.draggedItem
     * @param {Boolean} [data.embodyHeader=false] Render the source's tab-header drag proxy; the live pane
     *     stays where it is.
     * @param {Object} data.proxyRect Target-window-local `{x,y,width,height}`
     * @param {Neo.draggable.container.SortZone} data.sourceSortZone
     * @param {String|Number} [data.sourceWindowId] Exact physical source vessel identity. Otherwise
     *     retains an active origin or reads the live pane's rendering window before using the source sort
     *     zone. A parked popup can differ from its originating sort zone.
     * @param {String|Number} data.targetWindowId
     * @returns {Boolean}
     */
    move({draggedItem, embodyHeader=false, proxyRect, sourceSortZone, sourceWindowId, targetWindowId} = {}) {
        const
            me     = this,
            header = embodyHeader === true,
            itemId = draggedItem?.dockItemId;

        if (!itemId) return false;

        sourceWindowId ??= me.active?.itemId === itemId
            ? me.active.sourceWindowId
            : me.resolvePane(itemId)?.windowId ?? sourceSortZone?.windowId;

        if (sourceWindowId == null || targetWindowId == null || !me.isMeasurableProxyRect(proxyRect)) {
            return false
        }

        if (me.active && (
            me.active.header !== header ||
            me.active.itemId !== itemId ||
            me.active.sourceWindowId !== sourceWindowId ||
            me.active.targetWindowId !== targetWindowId
        )) {
            if (!me.restore({itemId: me.active.itemId})) return false
        }

        if (!me.active && !me.openProxy({draggedItem, header, itemId, proxyRect, sourceSortZone, sourceWindowId, targetWindowId})) {
            return false
        }

        const {proxy} = me.active;

        proxy.hidden = false;
        proxy.height = `${proxyRect.height}px`;
        proxy.width  = `${proxyRect.width}px`;
        proxy.style  = {
            ...(proxy.style || {}),
            left: `${proxyRect.x}px`,
            top : `${proxyRect.y}px`
        };

        return header || (me.embodiment.isStaged(itemId) && me.resolvePane(itemId)?.parent === proxy)
    }

    /**
     * @summary Creates and admits a fresh proxy generation: a header proxy mounted behind its own
     * settlement, or a pane proxy whose slot the embodiment reserves.
     * @param {Object} data
     * @param {Neo.component.Base} data.draggedItem
     * @param {Boolean} data.header
     * @param {String} data.itemId
     * @param {Object} data.proxyRect
     * @param {Neo.draggable.container.SortZone} data.sourceSortZone
     * @param {String|Number} data.sourceWindowId
     * @param {String|Number} data.targetWindowId
     * @returns {Boolean} Whether a proxy was admitted.
     * @protected
     */
    openProxy({draggedItem, header, itemId, proxyRect, sourceSortZone, sourceWindowId, targetWindowId}) {
        const me = this;

        let proxyConfig, vdom;

        try {
            proxyConfig = me.resolveProxyConfig({draggedItem, proxyRect, sourceSortZone, sourceWindowId, targetWindowId})
        } catch {
            return false
        }

        if (!proxyConfig || typeof proxyConfig !== 'object') return false;

        if (header) {
            try {
                vdom = sourceSortZone?.getDragProxyVdom?.()
            } catch {
                return false
            }

            if (!vdom) return false
        }

        const record = {
            generation: ++me.generation,
            header,
            itemId,
            promoted  : false,
            proxy     : null,
            settle    : null,
            settlement: null,
            settled   : false,
            sourceWindowId,
            targetWindowId
        };

        try {
            record.proxy = me.createProxy({
                ...proxyConfig,
                // a header proxy is mounted by the settlement below, whose promise carries the render outcome
                ...(header ? {autoInitVnode: false, autoMount: false, module: DragProxyComponent, vdom} : {module: DragProxyContainer, items: []}),
                height          : `${proxyRect.height}px`,
                moveInMainThread: false,
                style           : {
                    ...(proxyConfig.style || {}),
                    left: `${proxyRect.x}px`,
                    top : `${proxyRect.y}px`
                },
                width   : `${proxyRect.width}px`,
                windowId: targetWindowId
            })
        } catch {
            return false
        }

        if (!record.proxy) return false;

        me.active = record;

        if (header) {
            let attempt;

            try {
                attempt = Promise.resolve(record.proxy.initVnode(true))
            } catch (error) {
                attempt = Promise.reject(error)
            }

            // settles with the render attempt; a refused mount retires this generation, and a retirement
            // that comes first settles it false
            record.settlement = new Promise(resolve => {
                record.settle = resolve;
                attempt.then(() => resolve(me.active === record), () => {
                    me.retireProxy(record);
                    resolve(false)
                })
            }).then(settled => record.settled = settled === true);

            return true
        }

        let settlement;

        try {
            settlement = me.embodiment.stage({itemId, windowId: targetWindowId})
        } catch {
            me.retireProxy(record);
            return false
        }

        if (!me.embodiment.isStaged(itemId)) {
            me.retireProxy(record);
            return false
        }

        record.settlement = Promise.resolve(settlement).then(admitted => {
            if (me.active !== record) return false;

            record.settled = admitted === true;

            !record.settled && me.retireProxy(record);

            return record.settled
        }, () => {
            me.active === record && me.retireProxy(record);
            return false
        });

        return true
    }

    /**
     * @summary Promotes one committed pane out of transient source-slot ownership.
     * @description The proxy is retired without destroying the pane; the queued committed projection
     * reparents that same cached instance into its document-owned target, from the proxy or, behind a
     * header proxy, from the parked vessel.
     * @param {Object} identity
     * @param {String} identity.itemId
     * @param {String|Number} [identity.sourceWindowId]
     * @param {String|Number} [identity.targetWindowId]
     * @returns {Boolean}
     */
    promote(identity = {}) {
        const me     = this,
              record = me.resolveRecord(identity);

        if (!record) {
            me.reportUnresolved('promote', identity);
            return false
        }

        if (!record.header && !me.embodiment.promote({itemId: record.itemId, windowId: record.targetWindowId})) {
            return false
        }

        record.promoted = true;
        me.retireProxy(record);

        return true
    }

    /**
     * @summary Resolves an optional exact identity against the current generation.
     * @param {Object} identity
     * @returns {Object|null}
     * @protected
     */
    resolveRecord({itemId, sourceWindowId, targetWindowId} = {}) {
        const {active} = this;

        if (
            !active || active.itemId !== itemId ||
            (sourceWindowId != null && active.sourceWindowId !== sourceWindowId) ||
            (targetWindowId != null && active.targetWindowId !== targetWindowId)
        ) {
            return null
        }

        return active
    }

    /**
     * @summary Restores one zero-mutation proxy: retires it, and a pane proxy returns the pane through
     * the parked popup's live placeholder.
     * @param {Object} identity
     * @param {String} identity.itemId
     * @param {String|Number} [identity.sourceWindowId]
     * @param {String|Number} [identity.targetWindowId]
     * @returns {Boolean}
     */
    restore(identity = {}) {
        const me     = this,
              record = me.resolveRecord(identity);

        if (!record) {
            me.reportUnresolved('restore', identity);
            return false
        }

        if (record.promoted || (!record.header && !me.embodiment.restore({itemId: record.itemId, windowId: record.targetWindowId}))) {
            return false
        }

        me.retireProxy(record);

        return true
    }

    /**
     * @summary Reports a terminal that resolved nothing while a generation is live in its target window.
     *
     * A miss is ordinary while no generation is live there: another terminal ended it first. With one live,
     * the terminal missed the generation it was meant to end, and that generation's proxy stays on screen.
     * @param {String} terminal `promote` or `restore`
     * @param {Object} identity
     * @protected
     */
    reportUnresolved(terminal, {itemId, targetWindowId} = {}) {
        const {active} = this;

        if (active && targetWindowId != null && active.targetWindowId === targetWindowId) {
            console.error(`${this.className}: ${terminal} of ${itemId} resolved no generation, and generation ${active.generation} of ${active.itemId} stays live in window ${targetWindowId}`)
        }
    }

    /**
     * @summary Restores the active proxy when either participating native window departs.
     * @param {String|Number} windowId
     * @returns {Boolean}
     */
    restoreByWindow(windowId) {
        const record = this.active;

        return record && (record.sourceWindowId === windowId || record.targetWindowId === windowId)
            ? this.restore({itemId: record.itemId})
            : false
    }

    /**
     * @summary Retires one exact proxy without destroying its reusable live pane.
     * @param {Object} record
     * @returns {Boolean}
     * @protected
     */
    retireProxy(record) {
        if (!record || this.active !== record) return false;

        this.active = null;
        record.settle?.(false);

        if (!record.proxy?.isDestroyed) {
            record.proxy.hidden = true;
            record.proxy.destroy()
        }

        return true
    }

    /**
     * @summary Returns clone-safe target-proxy truth for semantic release witnesses.
     * @param {String|null} [itemId=null]
     * @returns {Object|null}
     */
    snapshot(itemId=null) {
        const
            record = this.active,
            pane   = record && this.resolvePane(record.itemId),
            proxy  = record?.proxy;

        if (!record || (itemId != null && record.itemId !== itemId)) return null;

        return {
            cls           : Array.isArray(proxy?.cls) ? [...proxy.cls] : [],
            generation    : record.generation,
            header        : record.header,
            itemId        : record.itemId,
            ownsPane      : pane?.parent === proxy,
            proxyId       : proxy?.id ?? null,
            settled       : record.settled,
            sourceWindowId: record.sourceWindowId,
            targetWindowId: record.targetWindowId,
            visible       : Boolean(proxy) && !proxy.isDestroyed && proxy.hidden !== true &&
                proxy.style?.display !== 'none' && String(proxy.style?.opacity ?? 1) !== '0'
        }
    }

    /**
     * @summary Waits for the exact active proxy generation to finish cross-window rendering.
     *
     * Synchronous staging reserves source ownership, but target `promiseUpdate()` settlement is the
     * first point at which a retained handoff interval may honestly begin. A restored, promoted, or
     * superseded generation resolves false.
     * @param {Object} identity
     * @param {String} identity.itemId
     * @param {String|Number} [identity.sourceWindowId]
     * @param {String|Number} [identity.targetWindowId]
     * @returns {Promise<Boolean>}
     */
    async whenSettled(identity = {}) {
        const me     = this,
              record = me.resolveRecord(identity);

        if (!record?.settlement) return false;

        const admitted = await record.settlement;

        return admitted === true &&
            me.active === record &&
            me.resolveRecord(identity) === record &&
            (record.header || (me.embodiment.isStaged(record.itemId) && me.resolvePane(record.itemId)?.parent === record.proxy))
    }
}

export default Neo.setupClass(VesselProxyEmbodiment);
