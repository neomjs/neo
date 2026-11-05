import Base          from '../../../../plugin/Base.mjs';
import EventDragZone from '../EventDragZone.mjs';
import VDomUtil      from '../../../../util/VDom.mjs';

/**
 * @class Neo.calendar.view.month.plugin.DragDrop
 * @extends Neo.plugin.Base
 */
class DragDrop extends Base {
    static config = {
        /**
         * @member {String} className='Neo.calendar.view.month.plugin.DragDrop'
         * @protected
         */
        className: 'Neo.calendar.view.month.plugin.DragDrop',
        /**
         * @member {String} ntype='plugin-calendar-month-dragdrop'
         * @protected
         */
        ntype: 'plugin-calendar-month-dragdrop',
        /**
         * @member {Boolean} isDragging=false
         * @protected
         */
        isDragging: false
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me        = this,
            eventOpts = {delegate: '.neo-event', scope: me};

        me.owner.addDomListeners([
            {'drag:end'  : me.onEventDragEnd,   ...eventOpts},
            {'drag:move' : me.onEventDragMove,  ...eventOpts},
            {'drag:start': me.onEventDragStart, ...eventOpts}
        ])
    }

    /**
     * @summary Lazily creates or reconfigures the month view's EventDragZone with the active scroll container ID.
     * @param {Object} opts
     * @param {Object} opts.dragElement
     * @param {Object} opts.eventRecord
     * @param {String} opts.proxyParentId
     * @returns {Neo.calendar.view.month.EventDragZone}
     */
    getEventDragZone(opts) {
        let me                         = this,
            {appName, owner, windowId} = me,
            {eventDragZone}            = owner,
            scrollContainerId          = owner.getScrollContainer?.()?.id || null,
            config                     = {
                dragElement  : opts.dragElement,
                eventRecord  : opts.eventRecord,
                proxyParentId: opts.proxyParentId,
                scrollContainerId
            };

        if (!eventDragZone) {
            owner.eventDragZone = eventDragZone = Neo.create({
                module: EventDragZone,
                appName,
                owner,
                windowId,
                ...config
            })
        } else {
            eventDragZone.set(config)
        }

        return eventDragZone
    }

    /**
     * @summary Completes the month event drag gesture, committing the new day and resetting body cursor classes.
     * @param {Object} data
     */
    onEventDragEnd(data) {
        let me              = this,
            {owner}         = me,
            {eventDragZone} = owner;

        if (owner.enableDrag && eventDragZone) {
            eventDragZone.dragEnd(data);
            eventDragZone.removeBodyCursorCls();
            me.isDragging = false
        }
    }

    /**
     * @summary Forwards `drag:move` events to the active month EventDragZone.
     * @param {Object} data
     */
    onEventDragMove(data) {
        let {owner} = this;

        if (owner.enableDrag) {
            owner.eventDragZone?.dragMove(data)
        }
    }

    /**
     * @summary Starts dragging a month event when `owner.enableDrag` is active.
     * @param {Object} data
     */
    onEventDragStart(data) {
        let me      = this,
            {owner} = me,
            dragElement, eventDragZone;

        if (owner.enableDrag) {
            me.isDragging = true;

            dragElement = VDomUtil.find(owner.vdom, data.path[0].id).vdom;

            eventDragZone = me.getEventDragZone({
                dragElement,
                eventRecord  : owner.eventStore.get(dragElement.flag),
                proxyParentId: data.path[1].id
            });

            eventDragZone.addBodyCursorCls();
            return eventDragZone.dragStart(data)
        }
    }
}

export default Neo.setupClass(DragDrop);
