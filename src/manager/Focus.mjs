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
         * An array containing opts objects.
         * opts.componentPath
         * opts.data
         * @member {Object[]} history=[]
         */
        history: [],
        /**
         * How long a focusout waits for its focusin before it counts as a leave. A focusin arriving while the focusout
         * still waits makes the pair a focusmove, however long the App Worker took to handle it.
         * @member {Number} maxFocusInOutGap=50
         */
        maxFocusInOutGap: 50,
        /**
         * The maximum amount of items stored inside the history array
         * @member {Number} maxHistoryLength=20
         */
        maxHistoryLength: 20,
        /**
         * The focusout waiting for its focusin ({@link #maxFocusInOutGap}). `null` once a focusin made the pair a move,
         * or its leave came due.
         * @member {Object|null} pendingFocusOut=null
         * @protected
         */
        pendingFocusOut: null,
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @param {Object} opts
     * @param {Array}  opts.componentPath Component ids upwards
     * @param {Object} opts.data dom event infos
     * @protected
     */
    addToHistory(opts) {
        let history = this.history;

        history.unshift(opts);
        history.length >= this.maxHistoryLength && history.pop()
    }

    /**
     * @param {Object} opts
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
     * @param {Object} opts
     * @param {Array}  opts.componentPath Component ids upwards
     * @param {Object} opts.data dom event infos
     * @protected
     */
    focusMove(opts) {
        let me               = this,
            {history}        = me,
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
     * A focusin that finds a focusout still waiting completes a move; otherwise focus enters. The browser raises both
     * halves of a move in one task, so the wait decides the pair, never the time the App Worker took between them.
     * @param {Object} opts
     * @param {Array}  opts.componentPath Component ids upwards
     * @param {Object} opts.data dom event infos
     * @protected
     */
    onFocusin(opts) {
        let me      = this,
            pending = me.pendingFocusOut;

        me.pendingFocusOut = null;

        pending ? me.focusMove(opts) : me.focusEnter(opts)
    }

    /**
     * A focusout waits {@link #maxFocusInOutGap} for its focusin, then counts as a leave — unless the engine removed a
     * floating component that is shown again by then ({@link #isRemovedFloatingShownAgain}).
     * @param {Object} opts
     * @param {Array}  opts.componentPath Component ids upwards
     * @param {Object} opts.data dom event infos
     * @protected
     */
    onFocusout(opts) {
        let me = this;

        me.pendingFocusOut = opts;

        me.timeout(me.maxFocusInOutGap).then(() => {
            // Identity: a focusin made it a move, or a newer focusout, raised against a newer mount, replaced it
            if (me.pendingFocusOut === opts) {
                me.pendingFocusOut = null;
                me.isRemovedFloatingShownAgain(opts) || me.focusLeave(opts)
            }
        })
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
