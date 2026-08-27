import DomAccess from '../DomAccess.mjs';

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
        let {state} = this;

        if (!state) return null;

        const coordinate = Number(data[state.coordinate]);

        if (!Number.isFinite(coordinate)) return null;

        const delta = coordinate - state.startCoordinate,
              value = Math.min(
                  Math.max(state.startSize + (state.resizeNext ? -delta : delta), 0),
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

        if (state) {
            Object.entries(state.originalStyle).forEach(([key, {priority, value}]) => {
                if (value) {
                    state.target.style.setProperty(key, value, priority)
                } else {
                    state.target.style.removeProperty(key)
                }
            })
        }

        this.gesture = this.state = null;

        return Boolean(state)
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
            maxSize    = Math.max(0, Number(parentRect[config.axis]) - Number(config.splitterSize || 0));

        if (!Number.isFinite(startSize) || !Number.isFinite(maxSize)) return null;

        const originalStyle = {};

        ['flex', config.axis].forEach(key => {
            originalStyle[key] = {
                priority: target.style.getPropertyPriority(key),
                value   : target.style.getPropertyValue(key)
            }
        });

        return {
            axis      : config.axis,
            coordinate,
            dragZoneId: config.dragZoneId,
            lastSize  : startSize,
            maxSize,
            originalStyle,
            preview   : config.preview === true,
            resizeNext: config.resizeNext === true,
            startCoordinate,
            startSize,
            target,
            targetId  : config.targetId
        }
    }

    /**
     * Resolves the terminal size and relinquishes transient DOM authority without undoing success.
     * @param {Object} data
     * @returns {{axis: String, size: Number, targetId: String}|null}
     */
    finish(data) {
        let state = this.state,
            size  = this.apply(data),
            result;

        if (state && Number.isFinite(size)) {
            result = {axis: state.axis, size, targetId: state.targetId}
        }

        this.gesture = this.state = null;

        return result || null
    }

    /**
     * Registers or clears one DragZone descriptor. A late same-gesture registration reuses the
     * immutable native start coordinate rather than the latest pointer frame.
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

            if (!me.state && me.gesture?.dragZoneId === data.dragZoneId) {
                me.state = me.createState(me.registrations[data.dragElementRootId], me.gesture)
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
        this.cancel();

        this.gesture = {
            clientX: data.clientX,
            clientY: data.clientY,
            dragZoneId
        };

        const config = this.resolve(path);

        this.state = config?.dragZoneId === dragZoneId ? this.createState(config, this.gesture) : null
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
