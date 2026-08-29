import DomAccess from '../DomAccess.mjs';

/**
 * @summary Resolves one computed CSS bound into pixels against its owning layout axis.
 *
 * Computed styles resolve absolute units such as `rem` to pixels, but percentage min/max values
 * remain percentages. Treating `50%` as the number 50 silently turns a half-workspace ceiling into
 * a 50px ceiling, so percentages are resolved explicitly against the measured parent layout box.
 * @param {String} value Computed CSS property value.
 * @param {Number} parentSize Parent layout extent on the resize axis.
 * @returns {Number} Pixel bound, or `NaN` when no finite bound exists.
 */
function resolveCssBound(value, parentSize) {
    const source = String(value ?? '').trim(),
          number = Number.parseFloat(source);

    if (!Number.isFinite(number)) return Number.NaN;

    return source.endsWith('%') ? parentSize * number / 100 : number
}

/**
 * @summary Gesture-local DOM resizing owned by the main-thread DragDrop addon.
 *
 * Pointer frames mutate only the registered target's outer layout node. The App Worker receives
 * one terminal size and remains the durable `wrapperStyle` authority. Cancellation restores the
 * exact inline properties captured at gesture start.
 * @class Neo.main.draggable.Resize
 */
class Resize {
    /**
     * The native gesture identity retained so a late registration can still capture start geometry.
     * @member {Object|null} gesture=null
     * @protected
     */
    gesture = null

    /**
     * Resize descriptors keyed by DragZone root id.
     * @member {Object} registrations
     * @protected
     */
    registrations = {}

    /**
     * One opt-in terminal whose pixels await the App Worker's semantic commit verdict.
     * @member {Object|null} pendingTerminal=null
     * @protected
     */
    pendingTerminal = null

    /**
     * Monotonic identity for worker-settled terminals. A stale response can never settle a
     * successor gesture which happens to address the same zone and target.
     * @member {Number} settlementGeneration=0
     * @protected
     */
    settlementGeneration = 0

    /**
     * Active transient preview state.
     * @member {Object|null} state=null
     * @protected
     */
    state = null

    /**
     * @returns {Boolean}
     */
    get active() {
        return Boolean(this.state)
    }

    /**
     * Applies one pointer frame without crossing the worker boundary.
     * @param {Object} data
     * @returns {Number|null}
     */
    apply(data) {
        let me               = this,
            {gesture, state} = me;

        if (gesture) {
            const clientX = Number(data.clientX),
                  clientY = Number(data.clientY);

            Number.isFinite(clientX) && (gesture.latestClientX = clientX);
            Number.isFinite(clientY) && (gesture.latestClientY = clientY)
        }

        if (!state) return null;

        const coordinate = Number(data[state.coordinate]);

        if (!Number.isFinite(coordinate)) return null;

        const delta = coordinate - state.startCoordinate,
              value = Math.min(
                  Math.max(state.startSize + (state.resizeNext ? -delta : delta), state.minSize || 0),
                  state.maxSize
              );

        if (state.preview && value !== state.lastSize) {
            state.target.style.setProperty('flex', 'none');
            state.target.style.setProperty(state.axis, `${value}px`)
        }

        state.lastSize = value;

        return value
    }

    /**
     * Restores interrupted preview authority and clears the gesture.
     * @returns {Boolean}
     */
    cancel() {
        let {state} = this;

        this.restoreState(state);

        this.gesture = this.state = null;

        return Boolean(state)
    }

    /**
     * Restores the exact inline properties captured before transient resize ownership began.
     * @param {Object|null} state
     * @returns {Boolean}
     * @protected
     */
    restoreState(state) {
        if (!state) return false;

        Object.entries(state.originalStyle).forEach(([key, {priority, value}]) => {
            if (value) {
                state.target.style.setProperty(key, value, priority)
            } else {
                state.target.style.removeProperty(key)
            }
        });

        return true
    }

    /**
     * Captures transform-immune layout geometry and the exact inline properties touched by preview.
     * @param {Object|null} config
     * @param {Object} data
     * @returns {Object|null}
     * @protected
     */
    createState(config, data) {
        if (!config || !['height', 'width'].includes(config.axis)) return null;

        const
            parent          = DomAccess.getElement(config.parentId),
            target          = DomAccess.getElement(config.targetId),
            coordinate      = config.axis === 'width' ? 'clientX' : 'clientY',
            startCoordinate = Number(data[coordinate]);

        if (!parent || !target || !Number.isFinite(startCoordinate)) return null;

        const
            parentRect = DomAccess.getLayoutRect(parent),
            targetRect = DomAccess.getLayoutRect(target),
            startSize  = Number(targetRect[config.axis]),
            layoutMax  = Math.max(0, Number(parentRect[config.axis]) - Number(config.splitterSize || 0)),
            computed   = globalThis.getComputedStyle?.(target),
            minValue   = resolveCssBound(computed?.getPropertyValue(`min-${config.axis}`), Number(parentRect[config.axis])),
            maxValue   = resolveCssBound(computed?.getPropertyValue(`max-${config.axis}`), Number(parentRect[config.axis])),
            minSize    = Number.isFinite(minValue) ? Math.max(0, minValue) : 0,
            maxSize    = Math.max(minSize, Math.min(layoutMax, Number.isFinite(maxValue) ? maxValue : layoutMax));

        if (!Number.isFinite(startSize) || !Number.isFinite(maxSize)) return null;

        const originalStyle = {};

        ['flex', config.axis].forEach(key => {
            originalStyle[key] = {
                priority: target.style.getPropertyPriority(key),
                value   : target.style.getPropertyValue(key)
            }
        });

        return {
            axis                 : config.axis,
            awaitWorkerSettlement: config.awaitWorkerSettlement === true,
            coordinate,
            dragZoneId           : config.dragZoneId,
            lastSize             : startSize,
            maxSize,
            minSize,
            originalStyle,
            parentId             : config.parentId,
            preview              : config.preview === true,
            resizeNext           : config.resizeNext === true,
            startCoordinate,
            startSize,
            target,
            targetId             : config.targetId
        }
    }

    /**
     * Resolves the terminal size and relinquishes active gesture authority without undoing success.
     * Semantic consumers may opt into one generation-scoped pending terminal: success discards its
     * rollback snapshot, while rejection restores the exact pre-gesture inline properties.
     * @param {Object} data
     * @returns {{axis: String, generation: (Number|undefined), size: Number, targetId: String}|null}
     */
    finish(data) {
        let me    = this,
            state = me.state,
            size  = me.apply(data),
            result;

        if (state && Number.isFinite(size)) {
            result = {axis: state.axis, size, targetId: state.targetId};

            if (state.preview && state.awaitWorkerSettlement) {
                me.pendingTerminal && me.restoreState(me.pendingTerminal);

                const generation = ++me.settlementGeneration;

                me.pendingTerminal = {...state, generation};
                result.generation  = generation
            }
        } else if (state?.preview) {
            me.restoreState(state)
        }

        me.gesture = me.state = null;

        return result || null
    }

    /**
     * Settles one exact worker-owned semantic terminal. Success merely relinquishes the rollback
     * snapshot; rejection restores the transient target. All three identities must match so a late
     * response cannot mutate a newer gesture which reused the same DOM node.
     * @param {Object} data
     * @param {String} data.dragZoneId
     * @param {Number} data.generation
     * @param {Boolean} [data.restore=false]
     * @param {String} data.targetId
     * @returns {Boolean}
     */
    settle({dragZoneId, generation, restore=false, targetId}={}) {
        let me      = this,
            pending = me.pendingTerminal;

        if (
            !pending || pending.dragZoneId !== dragZoneId || pending.generation !== generation ||
            pending.targetId !== targetId
        ) return false;

        restore && me.restoreState(pending);
        me.pendingTerminal = null;

        return true
    }

    /**
     * Registers or clears one DragZone descriptor. A late same-gesture registration reuses the
     * immutable native start coordinate. When reconciliation replaced the target after eager
     * registration, it restores the stale target, captures the current one, and replays the latest
     * pointer frame so live preview cannot remain bound to retired DOM.
     * @param {Object} data
     */
    register(data) {
        let me = this;

        if (!data?.dragElementRootId || !data?.dragZoneId || !Object.hasOwn(data, 'resizeConfig')) return;

        if (data.resizeConfig) {
            me.registrations[data.dragElementRootId] = {
                ...data.resizeConfig,
                dragZoneId: data.dragZoneId
            };

            if (me.gesture?.dragZoneId === data.dragZoneId) {
                const
                    config  = me.registrations[data.dragElementRootId],
                    current = me.state,
                    changed = !current || current.axis !== config.axis || current.parentId !== config.parentId ||
                        current.targetId !== config.targetId;

                if (changed) {
                    me.restoreState(current);
                    me.state = me.createState(config, me.gesture);

                    me.state && me.apply({
                        clientX: me.gesture.latestClientX,
                        clientY: me.gesture.latestClientY
                    })
                }
            }
        } else {
            if (me.state?.dragZoneId === data.dragZoneId) {
                me.cancel()
            }

            delete me.registrations[data.dragElementRootId]
        }
    }

    /**
     * Resolves the descriptor for the first registered root in an event path.
     * @param {Array<HTMLElement>} path
     * @returns {Object|null}
     */
    resolve(path) {
        for (const node of path || []) {
            if (node?.id && this.registrations[node.id]) {
                return this.registrations[node.id]
            }
        }

        return null
    }

    /**
     * Captures the native gesture before any App-Worker handshake is required.
     * @param {Array<HTMLElement>} path
     * @param {Object} data
     * @param {String|null} dragZoneId
     */
    start(path, data, dragZoneId) {
        let me = this;

        if (me.pendingTerminal) {
            me.restoreState(me.pendingTerminal);
            me.pendingTerminal = null
        }

        me.cancel();

        me.gesture = {
            clientX      : data.clientX,
            clientY      : data.clientY,
            dragZoneId,
            latestClientX: data.clientX,
            latestClientY: data.clientY
        };

        const config = me.resolve(path);

        me.state = config?.dragZoneId === dragZoneId ? me.createState(config, me.gesture) : null
    }

    /**
     * Removes every descriptor owned by a DragZone and restores an active target before teardown.
     * @param {Object} data
     */
    unregister(data) {
        let me = this;

        if (data?.dragZoneId && me.state?.dragZoneId === data.dragZoneId) {
            me.cancel()
        }

        if (data?.dragZoneId && me.pendingTerminal?.dragZoneId === data.dragZoneId) {
            me.restoreState(me.pendingTerminal);
            me.pendingTerminal = null
        }

        if (data?.dragElementRootId) {
            delete me.registrations[data.dragElementRootId]
        }

        if (data?.dragZoneId) {
            Object.keys(me.registrations).forEach(key => {
                if (me.registrations[key].dragZoneId === data.dragZoneId) {
                    delete me.registrations[key]
                }
            })
        }
    }
}

export default Resize;
