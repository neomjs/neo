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
 * the center timeline track, from `axisLeft`, where the timeline starts in its scrolling region. Only dependencies
 * whose source and target tasks are currently expanded in `taskStore` and whose horizontal span intersects the axis
 * window `[left - bufferPx, left + viewportWidth + bufferPx]`, `left` being `max(0, scrollLeft - axisLeft)`, are
 * projected into `<path class="neo-gantt-dependency-arrow">` descriptors.
 *
 * The layer replaces the visible arrows and their marker definitions together as one SVG fragment.
 * It escapes record-derived attributes and skips the DOM update when the fragment and its bounds are unchanged.
 * @class Neo.gantt.DependencyLayer
 * @extends Neo.component.Base
 * @see Neo.gantt.Container
 * @see Neo.gantt.DependencyStore
 */
class DependencyLayer extends Component {
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
         * Center-content x in pixels where the time axis starts: the width of the columns before the timeline in
         * its scrolling region. The layer is drawn from there, and `scrollLeft` minus this is the axis scroll.
         * @member {Number} axisLeft_=0
         * @reactive
         */
        axisLeft_: 0,
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
         * Array of dependency edge keys highlighted as highlighted arrows (`.neo-gantt-dependency-arrow-highlighted`, `data-highlighted="true"`).
         * @member {Array<String|Number>} highlightedDependencyIds_=[]
         * @reactive
         */
        highlightedDependencyIds_: [],
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
        _vdom:
        {style: {left: '0px', pointerEvents: 'none', position: 'absolute', top: '0px'}}
    }

    /**
     * Projected arrow path descriptors from the latest {@link #project} pass.
     * @member {Object[]} arrows=[]
     */
    arrows = []
    /**
     * In-flight spans by task id that links attach to instead of their tasks' dates. The owning chart shares its
     * {@link Neo.gantt.Container#drawnSpans}, so a link follows a moving bar.
     * @member {Map<String, Number[]>|null} drawnSpans=null
     */
    drawnSpans = null
    /**
     * True once `#projectedMinPx` and `#projectedMaxPx` hold a valid projected window.
     * @member {Boolean} #hasProjectedWindow=false
     * @private
     */
    #hasProjectedWindow = false
    /**
     * Normalized string set of `highlightedDependencyIds` for $O(1)$ lookup during SVG arrow projection.
     * @member {Set<String>} #highlightedDependencySet
     * @private
     */
    #highlightedDependencySet = new Set()
    /**
     * Instances created from this layer's own configuration.
     * @member {WeakSet} #ownedInputs
     * @private
     */
    #ownedInputs = new WeakSet()
    /**
     * The height in pixels of the grid's physical scroll page, supplied by the center body. Standalone layers
     * use logical coordinates and keep Infinity.
     * @member {Number} #pageHeight=Infinity
     * @private
     */
    #pageHeight = Infinity
    /**
     * The offset in pixels of the grid's current physical page, supplied by the center body.
     * @member {Number} #pageOffset=0
     * @private
     */
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
     * Fixed-row route inputs admitted by the last data or horizontal-window change.
     * @member {Object[]} #routes=[]
     * @private
     */
    #routes = []

    /**
     * @summary Constructs the layer and projects its first arrows.
     * @param {Object} config The instance config
     */
    construct(config) {
        super.construct(config);
        this.project()
    }

    /**
     * @summary Moves the layer and its window to the new start of the time axis.
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetAxisLeft(value, oldValue) {
        if (oldValue !== undefined && this.isConstructed) {
            this.project()
        }
    }

    /**
     * @summary Releases an owned input when its replacement is installed.
     * @param {Neo.gantt.DependencyStore|null} value
     * @param {Neo.gantt.DependencyStore|null} oldValue
     * @protected
     */
    afterSetDependencyStore(value, oldValue) { this.releaseOwnedInput(value, oldValue) }

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
     * @summary Releases an owned input when its replacement is installed.
     * @param {Neo.gantt.TaskStore|null} value
     * @param {Neo.gantt.TaskStore|null} oldValue
     * @protected
     */
    afterSetTaskStore(value, oldValue) { this.releaseOwnedInput(value, oldValue) }

    /**
     * @summary Releases an owned input when its replacement is installed.
     * @param {Neo.timeline.TimeAxis|null} value
     * @param {Neo.timeline.TimeAxis|null} oldValue
     * @protected
     */
    afterSetTimeAxis(value, oldValue) { this.releaseOwnedInput(value, oldValue) }

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
        let store = ClassSystemUtil.beforeSetInstance(value, DependencyStore);
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
        let store = ClassSystemUtil.beforeSetInstance(value, TaskStore);
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
        let axis = ClassSystemUtil.beforeSetInstance(value, TimeAxis);
        if (axis !== value) this.#ownedInputs.add(axis);
        return axis
    }

    /**
     * @summary Computes an orthogonal SVG path string (`M ... L ...`) connecting `(x1, y1)` to `(x2, y2)` for dependency `type`.
     * @description A finish-to-start link whose target starts less than two stubs to the right — or whose source is a
     * milestone whose label sits immediately to the right of its diamond — turns at the row boundary next to its source,
     * where no bar or milestone label stands, and drops in a stub left of its target: a run through the source row or
     * intermediate rows would cross milestone labels or bars starting on the same date.
     * @param {Number}  x1                    The link's start x in pixels
     * @param {Number}  y1                    The link's start y in pixels
     * @param {Number}  x2                    The link's end x in pixels
     * @param {Number}  y2                    The link's end y in pixels
     * @param {String}  [type='FS']           `'FS' | 'SS' | 'FF' | 'SF'`
     * @param {Boolean} [fromMilestone=false] True when the source is a milestone, whose label stands right of its diamond
     * @returns {String}
     */
    buildPathD(x1, y1, x2, y2, type='FS', fromMilestone=false) {
        let normType = String(type || 'FS').toUpperCase(),
            r1       = Math.round(x1 * 100) / 100,
            ry1      = Math.round(y1 * 100) / 100,
            r2       = Math.round(x2 * 100) / 100,
            ry2      = Math.round(y2 * 100) / 100;

        if (normType === 'SS') {
            let turnX = Math.min(r1, r2) - ARROW_STUB_PX;
            return `M ${r1} ${ry1} L ${turnX} ${ry1} L ${turnX} ${ry2} L ${r2} ${ry2}`
        }

        if (normType === 'FF') {
            let turnX = Math.max(r1, r2) + ARROW_STUB_PX;
            return `M ${r1} ${ry1} L ${turnX} ${ry1} L ${turnX} ${ry2} L ${r2} ${ry2}`
        }

        if (!fromMilestone && r2 >= r1 + ARROW_STUB_PX * 2) {
            let midX = Math.round(((r1 + r2) / 2) * 100) / 100;
            return `M ${r1} ${ry1} L ${midX} ${ry1} L ${midX} ${ry2} L ${r2} ${ry2}`
        }

        let half  = Math.max(1, this.rowHeight || 48) / 2,
            outX  = r1 + ARROW_STUB_PX,
            inX   = r2 - ARROW_STUB_PX,
            turnY = Math.round((ry2 < ry1 ? ry1 - half : ry1 + half) * 100) / 100;

        return `M ${r1} ${ry1} L ${outX} ${ry1} L ${outX} ${turnY} L ${inX} ${turnY} L ${inX} ${ry2} L ${r2} ${ry2}`
    }

    /**
     * @summary Releases only inputs constructed by this layer.
     * @param {...*} args Passed on to the component
     */
    destroy(...args) {
        let inputs = [this.dependencyStore, this.taskStore, this.timeAxis];
        super.destroy(...args);
        for (let input of new Set(inputs)) {
            if (input && this.#ownedInputs.has(input) && !input.isDestroyed) input.destroy()
        }
    }

    /**
     * @summary Computes the integer half-diagonal in pixels of a Gantt milestone diamond for a given row height.
     * @param {Number} [rowHeight=48] The row height in pixels
     * @returns {Number}
     */
    static milestoneHalfSize(rowHeight=48) {
        return Math.max(7, Math.round((rowHeight || 48) * 0.28))
    }

    /**
     * @summary Returns `true` when `[scrollLeft, scrollLeft + viewportWidth]` steps outside the last projected
     * `[#projectedMinPx, #projectedMaxPx]` buffer window.
     * @description Delegates to {@link Neo.timeline.TimeAxis.needsReprojection}.
     * @param {Number} [scrollLeft=this.scrollLeft]       Center-content pixels, from which {@link #axisLeft} is subtracted
     * @param {Number} [viewportWidth=this.viewportWidth] The visible width in pixels
     * @returns {Boolean}
     */
    needsReprojection(scrollLeft=this.scrollLeft, viewportWidth=this.viewportWidth) {
        return TimeAxis.needsReprojection({
            bufferPx          : this.bufferPx,
            hasProjectedWindow: this.#hasProjectedWindow,
            projectedMaxPx    : this.#projectedMaxPx,
            projectedMinPx    : this.#projectedMinPx,
            scrollLeft        : (Number(scrollLeft) || 0) - (this.axisLeft || 0),
            timeAxis          : this.timeAxis,
            viewportWidth     : viewportWidth || 1200
        })
    }

    /**
     * @summary Projects all visible dependency arrows intersecting the buffered horizontal window into `this.vdom.html`
     * (escaped with `StringUtil.escapeHtml`) and triggers `this.update()` when the layer output changes.
     * @returns {Object[]} The projected `<path>` VDOM descriptors
     */
    project() {
        let me        = this,
            axis      = me.timeAxis,
            taskStore = me.taskStore,
            depStore  = me.dependencyStore,
            vdom      = me.vdom;

        if (!vdom) {
            return []
        }

        if (!axis || !taskStore || !depStore) {
            let hadHtml = Boolean(vdom.html);

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

        let taskCount  = taskStore.getCount(),
            depCount   = depStore.getCount(),
            rowHeight  = Math.max(1, me.rowHeight || 48),
            totalWidth = Math.max(1, axis.totalSize || 1),
            // Clamped as the scroll guard clamps it, so both read the same visible axis
            axisScroll = Math.max(0, (me.scrollLeft || 0) - (me.axisLeft || 0)),
            minPx      = Math.max(0, axisScroll - (me.bufferPx || 0)),
            maxPx      = Math.min(totalWidth, axisScroll + Math.max(1, me.viewportWidth || 1200) + (me.bufferPx || 0)),
            indexById  = new Map(),
            paths      = [];

        me.#hasProjectedWindow = true;
        me.#projectedMinPx     = minPx;
        me.#projectedMaxPx     = maxPx;

        if (depCount) {
            let rows     = taskStore.items,
                plainIds = new Map();
            for (let i = 0; i < rows.length; i++) {
                let row = rows[i];
                if (row) {
                    indexById.set(String(me.constructor.projectedTaskId(taskStore, row, i, plainIds)), i)
                }
            }
        }

        for (let i = 0; i < depCount; i++) {
            let edge = depStore.getAt(i);
            if (!edge) {
                continue
            }

            let fromId    = String(edge.fromId ?? ''),
                toId      = String(edge.toId   ?? ''),
                fromIndex = indexById.get(fromId),
                toIndex   = indexById.get(toId);

            if (fromIndex === undefined || toIndex === undefined) {
                continue
            }

            let fromTask  = taskStore.getAt(fromIndex),
                toTask    = taskStore.getAt(toIndex),
                fromStart = fromTask?.[me.startDateField],
                fromEnd   = fromTask?.[me.endDateField],
                toStart   = toTask?.[me.startDateField],
                toEnd     = toTask?.[me.endDateField];

            if (!fromStart || !fromEnd || !toStart || !toEnd) {
                continue
            }

            let type          = String(edge.type || 'FS').toUpperCase(),
                fromSpan      = me.drawnSpans?.get(fromId),
                toSpan        = me.drawnSpans?.get(toId),
                half          = me.constructor.milestoneHalfSize(rowHeight),
                fromMilestone = Boolean(fromTask?.milestone),
                toMilestone   = Boolean(toTask?.milestone),
                x1            = (type === 'SS' || type === 'SF')
                    ? axis.dateToOffset(fromSpan?.[0] ?? fromStart) - (fromMilestone ? half : 0)
                    : axis.dateToOffset(fromSpan?.[1] ?? fromEnd)   + (fromMilestone ? half : 0),
                x2            = (type === 'FF' || type === 'SF')
                    ? axis.dateToOffset(toSpan?.[1] ?? toEnd)       + (toMilestone   ? half : 0)
                    : axis.dateToOffset(toSpan?.[0] ?? toStart)     - (toMilestone   ? half : 0),
                // A left or right turn can lie one stub beyond both anchors. Include the same
                // rounded coordinates the SVG path uses at the edge of the buffered window.
                spanMin = Math.round(Math.min(x1, x2) * 100) / 100 - ARROW_STUB_PX,
                spanMax = Math.round(Math.max(x1, x2) * 100) / 100 + ARROW_STUB_PX;

            if (spanMax < minPx || spanMin > maxPx) {
                continue
            }

            paths.push({
                fromMilestone, key: String(edge.id ?? `${fromId}-${toId}-${i}`), fromId, toId, type, x1, x2,
                y1: fromIndex * rowHeight + rowHeight / 2,
                y2: toIndex   * rowHeight + rowHeight / 2
            })
        }

        me.#routes = paths;
        return me.renderRoutes()
    }

    /**
     * @summary Gets the same endpoint id as a native Record without materializing a plain-id task.
     * Other fields on a raw row may already have been derived by its Store.
     * @param {Neo.gantt.TaskStore} store    The task store that holds the row
     * @param {Object}              row      A record, or a raw row of the store
     * @param {Number}              index    Visible row index
     * @param {Map}                 plainIds Per-projection cache by row model
     * @returns {*} Native projected task id
     */
    static projectedTaskId(store, row, index, plainIds) {
        if (RecordFactory.isRecord(row)) return row.id;
        let model = store.modelOf(row);
        if (!plainIds.has(model)) {
            let idField = model.getField('id');
            plainIds.set(model, idField && Object.keys(idField).length === 1 && idField.name === 'id')
        }
        // Calculated or converted ids can depend on the record itself. Use its ordinary getter.
        return plainIds.get(model) ? RecordFactory.restoreOwnValues({...row}).id : store.getAt(index).id
    }

    /**
     * @summary Retires a replaced input created by this layer.
     * @param {*} value    The input being installed
     * @param {*} oldValue The input it replaces
     */
    releaseOwnedInput(value, oldValue) {
        if (oldValue && oldValue !== value && this.#ownedInputs.has(oldValue)) oldValue.destroy()
    }

    /**
     * @summary Paints the buffered routes in the same physical page as the rows without walking either Store.
     * @returns {Object[]} Projected path descriptors.
     * @protected
     */
    renderRoutes() {
        let me                = this,
            {vdom}            = me,
            rowHeight         = Math.max(1, me.rowHeight || 48),
            totalHeight       = Math.min(me.#pageHeight, Math.max(rowHeight, me.taskStore.getCount() * rowHeight)),
            totalWidth        = Math.max(1, me.timeAxis.totalSize || 1),
            markerId          = `${me.id}__arrowhead`,
            highlightMarkerId = `${me.id}__arrowhead-highlighted`,
            esc               = val => StringUtil.escapeHtml(String(val)),
            paths             = me.#routes.map(({fromMilestone, key, fromId, toId, type, x1, y1, x2, y2}) => {
                let highlighted = me.#highlightedDependencySet.has(key),
                    cls         = ['neo-gantt-dependency-arrow', `neo-type-${type.toLowerCase()}`];

                if (highlighted) cls.push('neo-gantt-dependency-arrow-highlighted');

                return {
                    tag         : 'path',
                    id          : `${me.id}__dep__${key}`,
                    cls,
                    d           : me.buildPathD(x1, y1 - me.#pageOffset, x2, y2 - me.#pageOffset, type, fromMilestone),
                    'marker-end': `url(#${highlighted ? highlightMarkerId : markerId})`,
                    data        : {dependencyId: key, fromId, toId, type, ...(highlighted ? {highlighted: 'true'} : {})}
                }
            }),
            escMarkerId          = esc(markerId),
            escHighlightMarkerId = esc(highlightMarkerId),
            escCompId            = esc(me.id),
            pathHtml             = paths.map(p =>
                `<path id="${esc(p.id)}" class="${esc(p.cls.join(' '))}" d="${esc(p.d)}" marker-end="${esc(p['marker-end'])}"` +
                ` data-dependency-id="${esc(p.data.dependencyId)}" data-from-id="${esc(p.data.fromId)}"` +
                ` data-to-id="${esc(p.data.toId)}" data-type="${esc(p.data.type)}"` +
                `${p.data.highlighted ? ' data-highlighted="true"' : ''}></path>`
            ).join(''),
            nextLeft        = `${me.axisLeft || 0}px`,
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
            changed         = vdom.style.left !== nextLeft || vdom.style.width !== nextWidth || vdom.style.height !== nextHeight ||
                vdom.html !== nextHtml || (vdom.style.overflowY ?? null) !== overflowY;

        me.arrows         = paths;
        vdom.style.left   = nextLeft;
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

    /**
     * @summary Repositions the existing horizontal routes when the grid selects a different physical page.
     * @param {Neo.grid.Body} body Center body whose fixed rows share this overlay.
     */
    syncScrollPage(body) {
        let view   = body.gridContainer.view,
            height = view?.paged ? view.scrollPages.physicalExtent : Infinity,
            offset = body.pageOffset;

        if (height !== this.#pageHeight || offset !== this.#pageOffset) {
            this.#pageHeight = height;
            this.#pageOffset = offset;
            if (this.#hasProjectedWindow) this.renderRoutes()
        }
    }
}

export default Neo.setupClass(DependencyLayer);
