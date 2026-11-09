import CoreBase from '../core/Base.mjs';

/**
 * @class Neo.manager.Focus
 * @extends Neo.core.Base
 * @singleton
 */
class Focus extends CoreBase {
    static config = {
        /**
         * @member {String} className='Neo.manager.Focus'
         * @protected
         */
        className: 'Neo.manager.Focus',
        /**
         * Newest-first focus entries per originating window, each containing componentPath and DOM event data.
         * @member {Object} history={}
         */
        history: {},
        /**
         * How long a focusout waits for its focusin before it counts as a leave. A focusin arriving while the focusout
         * still waits makes the pair a focusmove, however long the App Worker took to handle it.
         * @member {Number} maxFocusInOutGap=50
         */
        maxFocusInOutGap: 50,
        /**
         * The maximum number of entries retained in each window's history array.
         * @member {Number} maxHistoryLength=20
         */
        maxHistoryLength: 20,
        /**
         * The focusout waiting for its focusin per window ({@link #maxFocusInOutGap}). A window's entry is removed
         * once its focusin makes the pair a move, its leave comes due, or its final port retires.
         * @member {Object} pendingFocusOut={}
         * @protected
         */
        pendingFocusOut: {},
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @summary Records a focus entry in its originating window's bounded history.
     * @param {Object} opts
     * @param {String} opts.windowId Originating window from the DOM event envelope
     * @param {Array}  opts.componentPath Component ids upwards
     * @param {Object} opts.data dom event infos
     * @protected
     */
    addToHistory(opts) {
        let history = this.history[opts.windowId] ||= [];

        history.unshift(opts);
        history.length > this.maxHistoryLength && history.pop()
    }

    /**
     * @summary Enters a focus path and records it for the originating window.
     * @param {Object} opts
     * @param {String} opts.windowId
     * @param {Array}  opts.componentPath Component ids upwards
     * @param {Object} opts.data dom event infos
     * @protected
     */
    focusEnter(opts) {
        this.setComponentFocus(opts, true);
        this.addToHistory(opts)
    }

    /**
     * @param {Object} opts
     * @param {Array}  opts.componentPath Component ids upwards
     * @param {Object} opts.data dom event infos
     * @protected
     */
    focusLeave(opts) {
        this.setComponentFocus(opts, false)
    }

    /**
     * @summary Reconciles the new focus path with this window's previous history entry.
     * @param {Object} opts
     * @param {String} opts.windowId
     * @param {Array}  opts.componentPath Component ids upwards
     * @param {Object} opts.data dom event infos
     * @protected
     */
    focusMove(opts) {
        let me               = this,
            history          = me.history[opts.windowId],
            newComponentPath = opts.componentPath,
            oldComponentPath = history[0].componentPath,
            commonId         = me.getClosestCommonComponentId(oldComponentPath, newComponentPath),
            oldCommonIndex   = oldComponentPath.indexOf(commonId),
            newCommonIndex   = newComponentPath.indexOf(commonId),
            focusLeave       = oldCommonIndex === -1 ? oldComponentPath : oldComponentPath.slice(0, oldCommonIndex),
            focusEnter       = newCommonIndex === -1 ? newComponentPath : newComponentPath.slice(0, newCommonIndex),
            component, data;

        me.setComponentFocus({componentPath: focusLeave, data: opts.data}, false);
        me.setComponentFocus({componentPath: focusEnter, data: opts.data}, true);

        if (commonId) {
            component = Neo.getComponent(commonId);

            if (component) {
                data = {
                    component,
                    path   : opts.data.path,
                    oldPath: history[0].data.path
                };

                component.onFocusMove?.(data);
                component.fire('focusMove', data);

                component.onFocusChange?.(data);
                component.fire('focusChange', data)
            }
        }

        me.addToHistory(opts)
    }

    /**
     * Finds the nearest shared component between two upward component paths.
     * Both paths are ordered from the focused component toward the root.
     * @param {String[]} oldComponentPath Previous component path
     * @param {String[]} newComponentPath New component path
     * @returns {String|null} closest common component id
     * @protected
     */
    getClosestCommonComponentId(oldComponentPath, newComponentPath) {
        const oldIds = new Set(oldComponentPath);

        return newComponentPath.find(id => oldIds.has(id)) || null
    }

    /**
     * A focusout raised while the engine removed a node carries that node's id as `data.removedNodeId`.
     * When that node is the root of a floating component which is shown again by the time the leave
     * comes due, the leave belongs to the removed mount: a floating component requests focus whenever
     * it mounts (`component.Base#afterSetMounted`), so its new mount reports its own focus, and
     * delivering the old leave would dismiss it.
     * @param {Object} opts
     * @param {Object} opts.data dom event infos
     * @returns {Boolean}
     * @protected
     */
    isRemovedFloatingShownAgain({data}) {
        let component = data.removedNodeId && Neo.getComponent(data.removedNodeId);

        return !!(component?.floating && !component.hidden)
    }

    /**
     * @summary Completes a pending move within the originating window, or enters its first focus path.
     * The browser raises both halves of a move in one task, so the wait decides the pair, never the time the
     * App Worker took between them.
     * @param {Object} opts
     * @param {String} opts.windowId
     * @param {Array}  opts.componentPath Component ids upwards
     * @param {Object} opts.data dom event infos
     * @protected
     */
    onFocusin(opts) {
        let me      = this,
            pending = me.pendingFocusOut[opts.windowId];

        delete me.pendingFocusOut[opts.windowId];

        pending && me.history[opts.windowId]?.length ? me.focusMove(opts) : me.focusEnter(opts)
    }

    /**
     * @summary Defers a leave for the originating window until its focusin arrives or the gap expires.
     * A focusout waits {@link #maxFocusInOutGap} for its window's focusin, then counts as a leave — unless the engine removed a
     * floating component that is shown again by then ({@link #isRemovedFloatingShownAgain}).
     * @param {Object} opts
     * @param {String} opts.windowId
     * @param {Array}  opts.componentPath Component ids upwards
     * @param {Object} opts.data dom event infos
     * @protected
     */
    onFocusout(opts) {
        let me         = this,
            {windowId} = opts;

        me.pendingFocusOut[windowId] = opts;

        me.timeout(me.maxFocusInOutGap).then(() => {
            // Identity: a focusin made it a move, or a newer focusout, raised against a newer mount, replaced it
            if (me.pendingFocusOut[windowId] === opts) {
                delete me.pendingFocusOut[windowId];
                me.isRemovedFloatingShownAgain(opts) || me.focusLeave(opts)
            }
        })
    }

    /**
     * @summary Clears a departed window's focus state and makes its pending leave callbacks inert.
     * Called when the App Worker retires the window's final live port, before disconnect listeners can move a
     * surviving component into another window. Sibling windows retain their histories and pending leaves.
     * @param {String} windowId
     */
    removeWindow(windowId) {
        delete this.history[windowId];
        delete this.pendingFocusOut[windowId]
    }

    /**
     * @param {Object} opts
     * @param {Array}  opts.componentPath Component ids upwards
     * @param {Object} opts.data dom event infos
     * @param {Boolean} containsFocus
     * @protected
     */
    setComponentFocus(opts, containsFocus) {
        let data = {
                relatedTarget: opts.data.relatedTarget
            },
            components = opts.componentPath.map(id => Neo.getComponent(id)),
            handler;

        components.forEach(component => {
            if (component) {
                component.containsFocus = containsFocus
            }
        });

        components.forEach(component => {
            if (component) {
                data.component = component;

                data[containsFocus ? 'path' : 'oldPath'] = opts.data.path

                handler = containsFocus ? 'onFocusEnter' : 'onFocusLeave';
                component[handler]?.(data);

                component.fire(containsFocus ? 'focusEnter' : 'focusLeave', data);

                component.onFocusChange?.(data);
                component.fire('focusChange', data)
            }
        })
    }
}

export default Neo.setupClass(Focus);
