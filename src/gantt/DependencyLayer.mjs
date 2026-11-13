import ClassSystemUtil from '../util/ClassSystem.mjs';
import Component       from '../component/Base.mjs';
import DependencyStore from './DependencyStore.mjs';
import RecordFactory   from '../data/RecordFactory.mjs';
import StringUtil      from '../util/String.mjs';
import TaskStore       from './TaskStore.mjs';
import TimeAxis        from '../timeline/TimeAxis.mjs';

const ARROW_STUB_PX = 12;

/**
 * @summary Single SVG dependency-arrow overlay (`Neo.gantt.DependencyLayer`) for `Neo.gantt.Container`.
 * @description Renders directed task dependencies (`FS`, `SS`, `FF`, `SF`) inside a single `<svg>` element layered over
 * the center timeline track. Only dependencies whose source and target tasks are currently expanded in `taskStore`
 * and whose horizontal span intersects `[scrollLeft - bufferPx, scrollLeft + viewportWidth + bufferPx]` are projected
 * into `<path class="neo-gantt-dependency-arrow">` descriptors.
 *
 * SVG is serialized with escaped attributes so the browser creates nodes in the SVG namespace.
 * @class Neo.gantt.DependencyLayer
 * @extends Neo.component.Base
 * @see Neo.gantt.Container
 * @see Neo.gantt.DependencyStore
 */
class DependencyLayer extends Component {
    /** Instances created from this layer's own configuration. */
    #ownedInputs = new WeakSet()
    /**
     * @summary Gets the same endpoint id as a native Record without materializing a plain-id task.
     * Other fields on a raw row may already have been derived by its Store.
     * @param {Neo.gantt.TaskStore} store
     * @param {Object} row
     * @param {Number} index Visible row index
     * @param {Map} plainIds Per-projection cache by row model
     * @returns {*} Native projected task id
     */
    static projectedTaskId(store, row, index, plainIds) {
        if (RecordFactory.isRecord(row)) return row.id;
        const model = store.modelOf(row);
        if (!plainIds.has(model)) {
            const idField = model.getField('id');
            plainIds.set(model, idField && Object.keys(idField).length === 1 && idField.name === 'id')
        }
        // Calculated or converted ids can depend on the record itself. Use its ordinary getter.
        return plainIds.get(model) ? RecordFactory.restoreOwnValues({...row}).id : store.getAt(index).id
    }

    static config = {
        /**
         * @member {String} className='Neo.gantt.DependencyLayer'
         * @protected
         */
        className: 'Neo.gantt.DependencyLayer',
        /**
         * @member {String} ntype='gantt-dependency-layer'
         * @protected
         */
        ntype: 'gantt-dependency-layer',
        /**
         * @member {String[]} baseCls=['neo-gantt-dependency-layer']
         * @protected
         */
        baseCls: ['neo-gantt-dependency-layer'],
        /**
         * Horizontal overscan buffer in pixels on each side of the visible viewport.
         * @member {Number} bufferPx_=400
         * @reactive
         */
        bufferPx_: 400,
        /**
         * Array of dependency edge keys highlighted as highlighted arrows (`.neo-gantt-dependency-arrow-highlighted`, `data-highlighted="true"`).
         * @member {Array<String|Number>} highlightedDependencyIds_=[]
         * @reactive
         */
        highlightedDependencyIds_: [],
        /**
         * Store of {@link Neo.gantt.DependencyModel} edges (`fromId` → `toId`).
         * @member {Neo.gantt.DependencyStore|Object|null} dependencyStore_=null
         * @reactive
         */
        dependencyStore_: null,
        /**
         * Field name on task records holding the end date.
         * @member {String} endDateField_='endDate'
         * @reactive
         */
        endDateField_: 'endDate',
        /**
         * Row height in pixels matching the owning `Neo.gantt.Container`.
         * @member {Number} rowHeight_=48
         * @reactive
         */
        rowHeight_: 48,
        /**
         * Current horizontal scroll offset in pixels.
         * @member {Number} scrollLeft_=0
         * @reactive
         */
        scrollLeft_: 0,
        /**
         * Field name on task records holding the start date.
         * @member {String} startDateField_='startDate'
         * @reactive
         */
        startDateField_: 'startDate',
        /**
         * Store of hierarchical {@link Neo.gantt.TaskStore} records.
         * @member {Neo.gantt.TaskStore|Object|null} taskStore_=null
         * @reactive
         */
        taskStore_: null,
        /**
         * Shared {@link Neo.timeline.TimeAxis} instance driving horizontal coordinates.
         * @member {Neo.timeline.TimeAxis|Object|null} timeAxis_=null
         * @reactive
         */
        timeAxis_: null,
        /**
         * Visible center viewport width in pixels.
         * @member {Number} viewportWidth_=1200
         * @reactive
         */
        viewportWidth_: 1200,
        /**
         * @member {Object} _vdom
         */
        _vdom: {
            tag  : 'div',
            cls  : ['neo-gantt-dependency-layer'],
            style: {
                left         : '0px',
                pointerEvents: 'none',
                position     : 'absolute',
                top          : '0px'
            }
        }
    }

    /**
     * Projected arrow path descriptors from the latest {@link #project} pass.
     * @member {Object[]} arrows=[]
     */
    arrows = []

    /**
     * Normalized string set of `highlightedDependencyIds` for $O(1)$ lookup during SVG arrow projection.
     * @member {Set<String>} #highlightedDependencySet=new Set()
     * @private
     */
    #highlightedDependencySet = new Set()

    /**
     * True once `#projectedMinPx` and `#projectedMaxPx` hold a valid projected window.
     * @member {Boolean} #hasProjectedWindow=false
     * @private
     */
    #hasProjectedWindow = false

    /** Fixed-row route inputs admitted by the last data or horizontal-window change. */
    #routes = []

    /** Physical page geometry supplied by the center body. Standalone layers use logical coordinates. */
    #pageHeight = Infinity
    #pageOffset = 0

    /**
     * Right boundary in pixels of the last projected buffered window.
     * @member {Number} #projectedMaxPx=0
     * @private
     */
    #projectedMaxPx = 0

    /**
     * Left boundary in pixels of the last projected buffered window.
     * @member {Number} #projectedMinPx=0
     * @private
     */
    #projectedMinPx = 0

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.project()
    }

    /**
     * @summary Updates `#highlightedDependencySet` and re-projects arrows when `highlightedDependencyIds` changes.
     * @param {Array<String|Number>|null} value
     * @param {Array<String|Number>|null} oldValue
     * @protected
     */
    afterSetHighlightedDependencyIds(value, oldValue) {
        this.#highlightedDependencySet = new Set(
            Array.isArray(value) ? value.map(id => String(id)) : []
        );

        if (oldValue !== undefined && this.isConstructed) {
            this.project()
        }
    }

    /**
     * @summary Re-projects dependency arrows only when horizontal scrolling exits the currently projected
     * `[#projectedMinPx, #projectedMaxPx]` buffer window.
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetScrollLeft(value, oldValue) {
        if (oldValue !== undefined && this.isConstructed && this.needsReprojection(value, this.viewportWidth)) {
            this.project()
        }
    }

    /**
     * @summary Coerces `dependencyStore` config objects into a {@link Neo.gantt.DependencyStore} instance.
     * @param {Neo.gantt.DependencyStore|Object|null} value
     * @returns {Neo.gantt.DependencyStore|null}
     * @protected
     */
    beforeSetDependencyStore(value) {
        if (!value) {
            return null
        }
        const store = ClassSystemUtil.beforeSetInstance(value, DependencyStore);
        if (store !== value) this.#ownedInputs.add(store);
        return store
    }

    /**
     * @summary Coerces `taskStore` config objects into a {@link Neo.gantt.TaskStore} instance.
     * @param {Neo.gantt.TaskStore|Object|null} value
     * @returns {Neo.gantt.TaskStore|null}
     * @protected
     */
    beforeSetTaskStore(value) {
        if (!value) {
            return null
        }
        const store = ClassSystemUtil.beforeSetInstance(value, TaskStore);
        if (store !== value) this.#ownedInputs.add(store);
        return store
    }

    /**
     * @summary Coerces `timeAxis` config objects into a {@link Neo.timeline.TimeAxis} instance.
     * @param {Neo.timeline.TimeAxis|Object|null} value
     * @returns {Neo.timeline.TimeAxis|null}
     * @protected
     */
    beforeSetTimeAxis(value) {
        if (!value) {
            return null
        }
        const axis = ClassSystemUtil.beforeSetInstance(value, TimeAxis);
        if (axis !== value) this.#ownedInputs.add(axis);
        return axis
    }

    /** @summary Releases an owned input when its replacement is installed. */
    afterSetDependencyStore(value, oldValue) { this.releaseOwnedInput(value, oldValue) }

    /** @summary Releases an owned input when its replacement is installed. */
    afterSetTaskStore(value, oldValue) { this.releaseOwnedInput(value, oldValue) }

    /** @summary Releases an owned input when its replacement is installed. */
    afterSetTimeAxis(value, oldValue) { this.releaseOwnedInput(value, oldValue) }

    /** @summary Retires a replaced input created by this layer. @param {*} value @param {*} oldValue */
    releaseOwnedInput(value, oldValue) {
        if (oldValue && oldValue !== value && this.#ownedInputs.has(oldValue)) oldValue.destroy()
    }

    /** @summary Releases only inputs constructed by this layer. @param {...*} args */
    destroy(...args) {
        const inputs = [this.dependencyStore, this.taskStore, this.timeAxis];
        super.destroy(...args);
        for (const input of new Set(inputs)) {
            if (input && this.#ownedInputs.has(input) && !input.isDestroyed) input.destroy()
        }
    }

    /**
     * @summary Computes an orthogonal SVG path string (`M ... L ...`) connecting `(x1, y1)` to `(x2, y2)` for dependency `type`.
     * @param {Number} x1
     * @param {Number} y1
     * @param {Number} x2
     * @param {Number} y2
     * @param {String} [type='FS'] `'FS' | 'SS' | 'FF' | 'SF'`
     * @returns {String}
     */
    buildPathD(x1, y1, x2, y2, type='FS') {
        const
            normType = String(type || 'FS').toUpperCase(),
            r1       = Math.round(x1 * 100) / 100,
            ry1      = Math.round(y1 * 100) / 100,
            r2       = Math.round(x2 * 100) / 100,
            ry2      = Math.round(y2 * 100) / 100;

        if (normType === 'SS') {
            const turnX = Math.min(r1, r2) - ARROW_STUB_PX;
            return `M ${r1} ${ry1} L ${turnX} ${ry1} L ${turnX} ${ry2} L ${r2} ${ry2}`
        }

        if (normType === 'FF') {
            const turnX = Math.max(r1, r2) + ARROW_STUB_PX;
            return `M ${r1} ${ry1} L ${turnX} ${ry1} L ${turnX} ${ry2} L ${r2} ${ry2}`
        }

        if (r2 >= r1 + ARROW_STUB_PX * 2) {
            const midX = Math.round(((r1 + r2) / 2) * 100) / 100;
            return `M ${r1} ${ry1} L ${midX} ${ry1} L ${midX} ${ry2} L ${r2} ${ry2}`
        }

        const
            outX = r1 + ARROW_STUB_PX,
            inX  = r2 - ARROW_STUB_PX,
            midY = Math.round(((ry1 + ry2) / 2) * 100) / 100;

        return `M ${r1} ${ry1} L ${outX} ${ry1} L ${outX} ${midY} L ${inX} ${midY} L ${inX} ${ry2} L ${r2} ${ry2}`
    }

    /**
     * @summary Returns `true` when `[scrollLeft, scrollLeft + viewportWidth]` steps outside the last projected
     * `[#projectedMinPx, #projectedMaxPx]` buffer window.
     * @description Delegates to {@link Neo.timeline.TimeAxis.needsReprojection}.
     * @param {Number} [scrollLeft=this.scrollLeft]
     * @param {Number} [viewportWidth=this.viewportWidth]
     * @returns {Boolean}
     */
    needsReprojection(scrollLeft=this.scrollLeft, viewportWidth=this.viewportWidth) {
        return TimeAxis.needsReprojection({
            bufferPx          : this.bufferPx,
            hasProjectedWindow: this.#hasProjectedWindow,
            projectedMaxPx    : this.#projectedMaxPx,
            projectedMinPx    : this.#projectedMinPx,
            scrollLeft,
            timeAxis          : this.timeAxis,
            viewportWidth     : viewportWidth || 1200
        })
    }

    /**
     * @summary Repositions the existing horizontal routes when the grid selects a different physical page.
     * @param {Neo.grid.Body} body Center body whose fixed rows share this overlay.
     */
    syncScrollPage(body) {
        const view   = body.gridContainer.view,
              height = view?.paged ? view.scrollPages.physicalExtent : Infinity,
              offset = body.pageOffset;

        if (height !== this.#pageHeight || offset !== this.#pageOffset) {
            this.#pageHeight = height;
            this.#pageOffset = offset;
            if (this.#hasProjectedWindow) this.renderRoutes()
        }
    }

    /**
     * @summary Projects all visible dependency arrows intersecting the buffered horizontal window into `this.vdom.html`
     * (escaped with `StringUtil.escapeHtml`) and triggers `this.update()` when the layer output changes.
     * @returns {Object[]} The projected `<path>` VDOM descriptors
     */
    project() {
        const
            me        = this,
            axis      = me.timeAxis,
            taskStore = me.taskStore,
            depStore  = me.dependencyStore,
            vdom      = me.vdom;

        if (!vdom) {
            return []
        }

        if (!axis || !taskStore || !depStore) {
            const hadHtml = Boolean(vdom.html);

            me.#routes             = [];
            me.arrows              = [];
            me.#hasProjectedWindow = false;
            me.#projectedMinPx     = 0;
            me.#projectedMaxPx     = 0;
            vdom.html              = '';
            delete vdom.style.height;
            delete vdom.style.width;
            delete vdom.style.overflowY;

            if (hadHtml && me.isConstructed) {
                me.update()
            }

            return []
        }

        const
            taskCount  = taskStore.getCount(),
            depCount   = depStore.getCount(),
            rowHeight  = Math.max(1, me.rowHeight || 48),
            totalWidth = Math.max(1, axis.totalSize || 1),
            minPx      = Math.max(0, (me.scrollLeft || 0) - (me.bufferPx || 0)),
            maxPx      = Math.min(totalWidth, (me.scrollLeft || 0) + Math.max(1, me.viewportWidth || 1200) + (me.bufferPx || 0)),
            indexById  = new Map(),
            paths      = [];

        me.#hasProjectedWindow = true;
        me.#projectedMinPx     = minPx;
        me.#projectedMaxPx     = maxPx;

        if (depCount) {
            const rows = taskStore.items, plainIds = new Map();
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                if (row) {
                    indexById.set(String(me.constructor.projectedTaskId(taskStore, row, i, plainIds)), i)
                }
            }
        }

        for (let i = 0; i < depCount; i++) {
            const edge = depStore.getAt(i);
            if (!edge) {
                continue
            }

            const
                fromId    = String(edge.fromId ?? ''),
                toId      = String(edge.toId   ?? ''),
                fromIndex = indexById.get(fromId),
                toIndex   = indexById.get(toId);

            if (fromIndex === undefined || toIndex === undefined) {
                continue
            }

            const
                fromTask  = taskStore.getAt(fromIndex),
                toTask    = taskStore.getAt(toIndex),
                fromStart = fromTask?.[me.startDateField],
                fromEnd   = fromTask?.[me.endDateField],
                toStart   = toTask?.[me.startDateField],
                toEnd     = toTask?.[me.endDateField];

            if (!fromStart || !fromEnd || !toStart || !toEnd) {
                continue
            }

            const
                type = String(edge.type || 'FS').toUpperCase(),
                x1   = (type === 'SS' || type === 'SF')
                    ? axis.dateToOffset(fromStart)
                    : axis.dateToOffset(fromEnd),
                x2   = (type === 'FF' || type === 'SF')
                    ? axis.dateToOffset(toEnd)
                    : axis.dateToOffset(toStart),
                // A left or right turn can lie one stub beyond both anchors. Include the same
                // rounded coordinates the SVG path uses at the edge of the buffered window.
                spanMin = Math.round(Math.min(x1, x2) * 100) / 100 - ARROW_STUB_PX,
                spanMax = Math.round(Math.max(x1, x2) * 100) / 100 + ARROW_STUB_PX;

            if (spanMax < minPx || spanMin > maxPx) {
                continue
            }

            paths.push({
                key: String(edge.id ?? `${fromId}-${toId}-${i}`), fromId, toId, type, x1, x2,
                y1 : fromIndex * rowHeight + rowHeight / 2,
                y2 : toIndex   * rowHeight + rowHeight / 2
            })
        }

        me.#routes = paths;
        return me.renderRoutes()
    }

    /**
     * @summary Paints the buffered routes in the same physical page as the rows without walking either Store.
     * @returns {Object[]} Projected path descriptors.
     * @protected
     */
    renderRoutes() {
        const me              = this, {vdom} = me,
            rowHeight         = Math.max(1, me.rowHeight || 48),
            totalHeight       = Math.min(me.#pageHeight, Math.max(rowHeight, me.taskStore.getCount() * rowHeight)),
            totalWidth        = Math.max(1, me.timeAxis.totalSize || 1),
            markerId          = `${me.id}__arrowhead`,
            highlightMarkerId = `${me.id}__arrowhead-highlighted`,
            esc               = val => StringUtil.escapeHtml(String(val)),
            paths             = me.#routes.map(({key, fromId, toId, type, x1, y1, x2, y2}) => {
                const highlighted = me.#highlightedDependencySet.has(key),
                      cls         = ['neo-gantt-dependency-arrow', `neo-type-${type.toLowerCase()}`];

                if (highlighted) cls.push('neo-gantt-dependency-arrow-highlighted');

                return {
                    tag         : 'path',
                    id          : `${me.id}__dep__${key}`,
                    cls,
                    d           : me.buildPathD(x1, y1 - me.#pageOffset, x2, y2 - me.#pageOffset, type),
                    'marker-end': `url(#${highlighted ? highlightMarkerId : markerId})`,
                    data        : {dependencyId: key, fromId, toId, type, ...(highlighted ? {highlighted: 'true'} : {})}
                }
            });

        const
            escMarkerId          = esc(markerId),
            escHighlightMarkerId = esc(highlightMarkerId),
            escCompId            = esc(me.id),
            pathHtml             = paths.map(p =>
                `<path id="${esc(p.id)}" class="${esc(p.cls.join(' '))}" d="${esc(p.d)}" marker-end="${esc(p['marker-end'])}"` +
                ` data-dependency-id="${esc(p.data.dependencyId)}" data-from-id="${esc(p.data.fromId)}"` +
                ` data-to-id="${esc(p.data.toId)}" data-type="${esc(p.data.type)}"` +
                `${p.data.highlighted ? ' data-highlighted="true"' : ''}></path>`
            ).join(''),
            nextWidth       = `${totalWidth}px`,
            nextHeight      = `${totalHeight}px`,
            nextHtml        =
                `<svg id="${escCompId}__svg" class="neo-gantt-dependency-svg" xmlns="http://www.w3.org/2000/svg"` +
                ` width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}">` +
                `<defs id="${escCompId}__defs">` +
                `<marker id="${escMarkerId}" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" viewBox="0 0 6 6">` +
                `<path id="${escMarkerId}__path" class="neo-gantt-dependency-arrowhead" d="M 0 0 L 6 3 L 0 6 z"></path>` +
                `</marker>` +
                `<marker id="${escHighlightMarkerId}" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" viewBox="0 0 6 6">` +
                `<path id="${escHighlightMarkerId}__path" class="neo-gantt-dependency-arrowhead neo-gantt-dependency-arrowhead-highlighted" d="M 0 0 L 6 3 L 0 6 z"></path>` +
                `</marker>` +
                `</defs>${pathHtml}</svg>`,
            overflowY       = Number.isFinite(me.#pageHeight) ? 'clip' : null,
            changed         = vdom.style.width !== nextWidth || vdom.style.height !== nextHeight ||
                vdom.html !== nextHtml || (vdom.style.overflowY ?? null) !== overflowY;

        me.arrows         = paths;
        vdom.style.width  = nextWidth;
        vdom.style.height = nextHeight;
        if (overflowY) vdom.style.overflowY = overflowY;
        else delete vdom.style.overflowY;
        vdom.html         = nextHtml;

        if (changed && me.isConstructed) {
            me.update()
        }

        return paths
    }
}

export default Neo.setupClass(DependencyLayer);
