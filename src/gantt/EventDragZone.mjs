import EventDragZone from '../timeline/draggable/EventDragZone.mjs';
import Component     from '../component/Base.mjs';

/**
 * @summary Routes finish-terminal drops to the Gantt writer and preserves ordinary move and resize handling.
 * @class Neo.gantt.EventDragZone
 * @extends Neo.timeline.draggable.EventDragZone
 */
class GanttEventDragZone extends EventDragZone {
    static config = {className: 'Neo.gantt.EventDragZone'}

    /**
     * @summary Finds a finish endpoint in the pointer path. A configured drag zone may provide its own terminal.
     * @param {Object[]} path
     * @returns {Object|undefined}
     * @protected
     */
    getLinkTerminal(path=[]) {
        return path.find(node => node?.cls?.includes('neo-gantt-link-terminal'))
    }

    async dragStart(data = {}, terminal=this.getLinkTerminal(data.path || data.targetPath)) {
        this.linkSource = terminal && this.owner.canLinkTasks(this.eventRecord) &&
            this.owner.resolveTaskRecord(terminal.data.linkFrom) === this.eventRecord ? this.eventRecord : null;
        if (terminal && !this.linkSource) return;
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
            await super.dragStart(data)
        } catch (error) {
            this.clearLinkPreview();
            throw error
        }
    }

    /** @summary Accepts a bar or its pooled grid row only when the nearest Gantt root is this owner. */
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

    dragMove(data = {}) {
        if (!this.linkSource) return super.dragMove(data);
        const target = this.dropTask(data), origin = this.linkOrigin;
        if (origin && this.preview) {
            const dx       = data.clientX - origin.x, dy = data.clientY - origin.y;
            const eligible = Boolean(target && this.owner.canLinkTasks(this.linkSource, target));
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

    dragEnd(data = {}) {
        const source = this.linkSource;
        if (!source) return super.dragEnd(data);
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
        if (this.linkOrigin && !this.owner.isDestroyed) {
            this.owner.removeCls('neo-gantt-link-over');
            this.owner.removeCls('neo-gantt-link-drawing')
        }
        this.preview?.destroy(true);
        this.preview = this.linkSource = this.linkOrigin = null
    }

    destroy(...args) {
        this.clearLinkPreview();
        super.destroy(...args)
    }
}

export default Neo.setupClass(GanttEventDragZone);
