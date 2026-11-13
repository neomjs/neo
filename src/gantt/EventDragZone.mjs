import EventDragZone   from '../timeline/draggable/EventDragZone.mjs';
import Component       from '../component/Base.mjs';
import DependencyStore from './DependencyStore.mjs';
import VDom            from '../util/VDom.mjs';

/**
 * @summary Routes finish-terminal drops to the Gantt writer and preserves ordinary move and resize handling.
 * @class Neo.gantt.EventDragZone
 * @extends Neo.timeline.draggable.EventDragZone
 */
class GanttEventDragZone extends EventDragZone {
    static config = {
        className       : 'Neo.gantt.EventDragZone',
        useProxy        : true,
        moveInMainThread: false
    }

    /** @type {Neo.data.Model|null} The currently eligible link destination. */
    linkTarget = null
    /** @type {Neo.data.Model|null} The task whose committed bar is behind a floating preview. */
    taskPreviewRecord = null
    #candidateTarget = null
    #admissionStore = null
    #admissionListeners = null
    #cachedTarget = null
    #cachedRefusal = null
    #admissionValid = false

    /**
     * @summary Finds a finish endpoint in the pointer path. A configured drag zone may provide its own terminal.
     * @param {Object[]} path
     * @returns {Object|undefined}
     * @protected
     */
    getLinkTerminal(path=[]) {
        return path.find(node => node?.cls?.includes('neo-gantt-link-terminal'))
    }

    /**
     * @summary Starts a link gesture or a snapped task preview without changing the task record.
     * @param {Object} [data={}] Pointer and path data.
     * @param {Object} [terminal] Finish terminal from the pointer path, if this is a link gesture.
     * @returns {Promise<void>}
     */
    async dragStart(data = {}, terminal=this.getLinkTerminal(data.path || data.targetPath)) {
        this.linkSource = terminal && this.owner.canLinkTasks(this.eventRecord) &&
            this.owner.resolveTaskRecord(terminal.data.linkFrom) === this.eventRecord ? this.eventRecord : null;
        if (terminal && !this.linkSource) return;
        const useProxy = this.useProxy;
        if (this.linkSource) {
            this.useProxy = false;
            this.syncAdmissionStore()
        } else if (useProxy) {
            const row    = this.owner.body.items.find(item => item.record === this.eventRecord);
            const source = row && VDom.find(row.vdom, this.dragElement.id)?.vdom;
            if (!source) throw new Error('Gantt task preview requires the rendered bar');
            this.dragProxyConfig = {...this.dragProxyConfig, cls:['neo-gantt', 'neo-gantt-task-proxy'],
                vdom:this.buildTaskPreview(source)}
        }
        if (this.linkSource && terminal.rect) {
            this.owner.addCls('neo-gantt-link-drawing');
            const rect = terminal.rect;
            this.linkOrigin = {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
            this.preview = Neo.create(Component, {
                appName      : this.appName, windowId: this.windowId, parentId: 'document.body',
                autoInitVnode: true, autoMount: true, cls: ['neo-gantt-link-preview'], vdom: {'aria-hidden':'true'}
            })
        }
        try {
            await super.dragStart(data);
            if (!this.linkSource && this.dragProxy) this.setTaskPreviewRecord(this.eventRecord)
        } catch (error) {
            this.clearLinkPreview();
            if (this.owner?.cls) super.dragEnd({cancelled:true});
            this.setTaskPreviewRecord(null);
            throw error
        } finally {
            this.useProxy = useProxy
        }
    }

    /**
     * @summary Clones the rendered bar's appearance and content without duplicating its interaction nodes.
     * @param {Object} source Rendered task bar VDOM.
     * @returns {Object} Non-interactive preview VDOM.
     */
    buildTaskPreview(source) {
        const preview = VDom.clone(source);
        preview.style = {...preview.style, left:'0px', top:'0px', width:'100%', height:'100%', position:'relative'};
        preview.data = {...preview.data};
        delete preview.data.eventId;
        delete preview.role;
        delete preview.tabIndex;
        delete preview['aria-label'];
        preview.cn = preview.cn.filter(node => !node.cls?.includes('neo-timeline-bar-handle') &&
            !node.cls?.includes('neo-gantt-link-terminal'));
        return preview
    }

    /**
     * @summary Resolves a bar or pooled row only inside this Gantt's own grid.
     * @param {Object} data Pointer target path.
     * @returns {Neo.data.Model|null} The target task, if present.
     */
    dropTask(data) {
        const path = data.targetPath || [],
              root = path.find(node => node?.cls?.includes('neo-gantt'));
        if (root?.id !== this.owner.id) return null;

        const bar = this.owner.extractBarTarget(path).barNode;
        if (bar) return this.owner.resolveTaskRecord(bar.data?.eventId);
        const node = path.find(item => item?.cls?.includes('neo-grid-row'));
        const row  = node?.id ? Neo.getComponent(node.id) : null;
        return row?.parent?.gridContainer === this.owner ? this.owner.resolveTaskRecord(row.record) : null
    }

    /**
     * @summary Moves the snapped task preview or the link line and highlights its eligible target.
     * @param {Object} [data={}] Current pointer and target path.
     * @returns {void}
     */
    dragMove(data = {}) {
        if (!this.linkSource) return super.dragMove(data);
        const target = this.dropTask(data), origin = this.linkOrigin;
        if (origin && this.preview) {
            const dx       = data.clientX - origin.x, dy = data.clientY - origin.y;
            this.#candidateTarget = target;
            const eligible = this.isEligibleLinkTarget(target);
            this.setLinkTarget(eligible ? target : null);
            if (this.owner.cls.includes('neo-gantt-link-over') !== eligible) {
                this.owner[eligible ? 'addCls' : 'removeCls']('neo-gantt-link-over')
            }
            this.preview.style = {
                left          : origin.x + 'px', top: origin.y + 'px', width: Math.hypot(dx, dy) + 'px',
                borderTopStyle: eligible ? 'solid' : 'dashed',
                transform     : 'rotate(' + Math.atan2(dy, dx) + 'rad)'
            }
        }
    }

    /**
     * @summary Observes the current dependency store and invalidates cached admission on graph changes.
     * @returns {void}
     */
    syncAdmissionStore() {
        const store = this.owner.dependencyStore;
        if (store === this.#admissionStore) return;
        this.#admissionStore?.un(this.#admissionListeners);
        this.#admissionStore = store;
        this.#admissionValid = false;
        if (store) {
            const changed = () => {
                this.#admissionValid = false;
                const target = this.#candidateTarget;
                this.setLinkTarget(this.isEligibleLinkTarget(target) ? target : null)
            };
            this.#admissionListeners = {mutate:changed, recordChange:changed, filter:changed};
            store.on(this.#admissionListeners)
        } else {
            this.#admissionListeners = null
        }
    }

    /**
     * @summary Checks the configured policy and caches structural admission for the current target.
     * @param {Neo.data.Model|null} target Candidate destination.
     * @returns {Boolean} Whether the link can be offered by the native graph.
     */
    isEligibleLinkTarget(target) {
        this.syncAdmissionStore();
        if (!target || !this.owner.canLinkTasks(this.linkSource, target) || !this.#admissionStore) return false;
        if (!this.#admissionValid || this.#cachedTarget !== target) {
            const input = {fromId:this.owner.store.getKey(this.linkSource), toId:this.owner.store.getKey(target)};
            this.#cachedRefusal = typeof this.#admissionStore.getFinishToStartRefusal === 'function'
                ? this.#admissionStore.getFinishToStartRefusal(input)
                : DependencyStore.getFinishToStartRefusal(this.#admissionStore, input);
            this.#cachedTarget = target;
            this.#admissionValid = true
        }
        return !this.#cachedRefusal
    }

    /**
     * @summary Positions the preview over the task row at its snapped timeline bounds.
     * @param {Object} next Candidate dates.
     * @param {Object} data Pointer data.
     * @returns {Object} Proxy position and size.
     */
    getDragProxyStyle(next, data) {
        const style = super.getDragProxyStyle(next, data);
        return {...style, left: `${this.trackOrigin + parseFloat(style.left)}px`,
            width: `${Math.max(this.owner.minBarWidthPx, parseFloat(style.width))}px`,
            top  : `${this.dragElementRect.top}px`}
    }

    /**
     * @summary Publishes a changed link target through the ordinary row projection.
     * @param {Neo.data.Model|null} target Eligible destination or null.
     * @returns {void}
     */
    setLinkTarget(target) {
        if (this.linkTarget !== target) {
            this.linkTarget = target;
            if (!this.owner.isDestroyed && this.owner.timelineColumn) this.owner.timelineColumn.refreshMountedRows()
        }
    }

    /**
     * @summary Marks only the committed task behind a live preview, reprojecting on gesture boundaries.
     * @param {Neo.data.Model|null} record Dragged task or null after the gesture.
     * @returns {void}
     */
    setTaskPreviewRecord(record) {
        if (this.taskPreviewRecord !== record) {
            this.taskPreviewRecord = record;
            if (!this.owner.isDestroyed && this.owner.timelineColumn) this.owner.timelineColumn.refreshMountedRows()
        }
    }

    /**
     * @summary Clears gesture feedback and commits an eligible link, or finishes a task move or resize.
     * @param {Object} [data={}] Final pointer data and cancellation flag.
     * @returns {void}
     */
    dragEnd(data = {}) {
        const source = this.linkSource;
        if (!source) {
            try {
                return super.dragEnd(data)
            } finally {
                this.setTaskPreviewRecord(null)
            }
        }
        const target = !data.cancelled && this.dropTask(data);
        // The timeline writer must never see a link gesture as an event move.
        this.clearLinkPreview();
        this.pendingDrop = null;
        super.dragEnd(data);
        if (target && this.owner.resolveTaskRecord(source) && this.owner.resolveTaskRecord(target)) {
            this.owner.linkTasks({fromId: this.owner.store.getKey(source), toId: this.owner.store.getKey(target)})
        }
    }

    /** @summary Removes only this gesture's floating line on drop, cancel, failure, or teardown. */
    clearLinkPreview() {
        this.#admissionStore?.un(this.#admissionListeners);
        this.#admissionStore = this.#admissionListeners = this.#candidateTarget = this.#cachedTarget = null;
        this.#admissionValid = false;
        this.setLinkTarget(null);
        if (this.linkOrigin && !this.owner.isDestroyed) {
            this.owner.removeCls('neo-gantt-link-over');
            this.owner.removeCls('neo-gantt-link-drawing')
        }
        this.preview?.destroy(true);
        this.preview = this.linkSource = this.linkOrigin = null
    }

    /**
     * @summary Removes transient link feedback before destroying the gesture zone.
     * @param {...*} args Base destruction arguments.
     * @returns {void}
     */
    destroy(...args) {
        this.clearLinkPreview();
        if (this.initialSnapshot || this.dragProxy) {
            if (this.owner?.cls) {
                super.dragEnd({cancelled:true})
            } else if (this.dragProxy) {
                this.destroyDragProxy();
                this.dragProxy = null
            }
        }
        this.setTaskPreviewRecord(null);
        super.destroy(...args)
    }
}

export default Neo.setupClass(GanttEventDragZone);
