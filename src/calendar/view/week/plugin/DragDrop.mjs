import Base          from '../../../../plugin/Base.mjs';
import DateUtil      from '../../../../util/Date.mjs';
import EventDragZone from '../EventDragZone.mjs';
import VDomUtil      from '../../../../util/VDom.mjs';

const newRecordSymbol = Symbol.for('newRecordSymbol');

/**
 * @class Neo.calendar.view.week.plugin.DragDrop
 * @extends Neo.plugin.Base
 */
class DragDrop extends Base {
    static config = {
        /**
         * @member {String} className='Neo.calendar.view.week.plugin.DragDrop'
         * @protected
         */
        className: 'Neo.calendar.view.week.plugin.DragDrop',
        /**
         * @member {String} ntype='plugin-calendar-week-dragdrop'
         * @protected
         */
        ntype: 'plugin-calendar-week-dragdrop',
        /**
         * @member {Boolean} isDragging=false
         * @protected
         */
        isDragging: false,
        /**
         * @member {String} resizablePluginType='plugin-calendar-week-dragdrop'
         */
        resizablePluginType: 'calendar-week-eventresizable'
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me         = this,
            columnOpts = {scope: me, delegate: '.neo-c-w-column'},
            eventOpts  = {scope: me, delegate: '.neo-event'};

        me.owner.addDomListeners([
            {'drag:end'  : me.onColumnDragEnd,   ...columnOpts},
            {'drag:end'  : me.onEventDragEnd,    ...eventOpts},
            {'drag:move' : me.onColumnDragMove,  ...columnOpts},
            {'drag:move' : me.onEventDragMove,   ...eventOpts},
            {'drag:start': me.onColumnDragStart, ...columnOpts},
            {'drag:start': me.onEventDragStart,  ...eventOpts}
        ]);
    }

    /**
     * Adjusts drag events which start on an event resize handle
     * @param {Object} data
     * @returns {Object}
     */
    adjustResizeEvent(data) {
        data.path.shift();
        data.targetPath.shift();
        data.target = data.path[0];

        return data;
    }

    /**
     * @param {Object} opts
     * @param {Object} opts.dragElement
     * @param {Boolean} opts.enableResizingAcrossOppositeEdge
     * @param {Object} opts.eventRecord
     * @param {String} opts.proxyParentId
     * @returns {Neo.calendar.view.week.EventDragZone}
     */
    getEventDragZone(opts) {
        let me                        = this,
            {appName, owner}          = me,
            {eventDragZone, timeAxis} = owner,

            config = {
                axisEndTime                     : timeAxis.getTime(owner.endTime),
                axisStartTime                   : timeAxis.getTime(owner.startTime),
                dragElement                     : opts.dragElement,
                enableResizingAcrossOppositeEdge: opts.enableResizingAcrossOppositeEdge,
                eventRecord                     : opts.eventRecord,
                proxyParentId                   : opts.proxyParentId
            };

        if (!eventDragZone) {
            owner.eventDragZone = eventDragZone = Neo.create({
                module           : EventDragZone,
                appName,
                owner,
                scrollContainerId: owner.getScrollContainer().id,
                ...config,

                dragProxyConfig: {
                    style: {
                        transition: 'none',
                        willChange: 'height'
                    }
                }
            })
        } else {
            eventDragZone.set(config)
        }

        return eventDragZone
    }

    /**
     * Returns the active field value of the active or first calendar record
     * @returns {Boolean}
     */
    isActiveCalendar() {
        let {owner}         = this,
            {calendarStore} = owner,
            calendarId      = owner.data.activeCalendarId || calendarStore.getAt(0)[calendarStore.keyProperty];

        return calendarStore.get(calendarId).active;
    }

    /**
     * @param {Object} path
     * @returns {Boolean}
     */
    isTopLevelColumn(path) {
        return path[0].cls.includes('neo-c-w-column');
    }

    /**
     * @param {Object} eventData
     * @returns {Boolean}
     */
    isTopLevelEvent(eventData) {
        return eventData.path[0].cls.includes('neo-event');
    }

    /**
     * @param {Object} data
     */
    onColumnDragEnd(data) {
        let me      = this,
            {owner} = me,
            record  = me[newRecordSymbol];

        if (record && me.isTopLevelColumn(data.path)) {
            me.isDragging = false;

            delete me[newRecordSymbol];

            Neo.applyDeltas(me.appName, {
                id   : owner.getEventId(record.id),
                style: {opacity: 1}
            }).then(() => {
                owner.eventDragZone.dragEnd();
                owner.getPlugin(me.resizablePluginType).onDragEnd(data)
            })
        }
    }

    /**
     * @param {Object} data
     */
    onColumnDragMove(data) {
        let me = this;

        if (me.isActiveCalendar() && me.isTopLevelColumn(data.path)) {
            me.owner.eventDragZone?.dragMove(data)
        }
    }

    /**
     * @param {Object} data
     */
    onColumnDragStart(data) {
        let me = this;

        if (me.isActiveCalendar() && me.isTopLevelColumn(data.targetPath)) {
            let {owner}         = me,
                axisStartTime   = owner.timeAxis.getTime(owner.startTime),
                {calendarStore} = owner,
                columnRect      = data.path[0].rect,
                intervalSize    = 15,
                intervals       = (owner.timeAxis.getTime(owner.endTime) - axisStartTime) * 60 / intervalSize,
                intervalHeight  = columnRect.height / intervals,
                position        = Math.min(columnRect.height, data.clientY - columnRect.top),
                currentInterval = Math.floor(position / intervalHeight),
                startDate       = new Date(VDomUtil.findVdomChild(owner.vdom, data.path[0].id).vdom.flag + 'T00:00:00.000Z'),
                dragElement, endDate, eventDragZone, eventId, record;

            me.isDragging = true;

            startDate.setHours(axisStartTime);
            startDate.setMinutes(Math.min(currentInterval * intervalSize, intervals * intervalSize - owner.minimumEventDuration));

            endDate = DateUtil.clone(startDate);

            endDate.setMinutes(endDate.getMinutes() + owner.minimumEventDuration);

            // 24:00 fix
            endDate.getHours() === 0 && endDate.getMinutes() === 0 && endDate.setMinutes(endDate.getMinutes() - 1);

            record = owner.eventStore.add({
                calendarId: owner.data.activeCalendarId || calendarStore.getAt(0)[calendarStore.keyProperty],
                endDate,
                startDate,
                title     : 'New Event'
            })[0];

            // we need to cache a reference to make the record accessible for onColumnDragEnd()
            me[newRecordSymbol] = record;

            // wait until the new event got mounted
            setTimeout(() => {
                eventId     = owner.getEventId(record.id);
                dragElement = VDomUtil.findVdomChild(owner.vdom, eventId).vdom;

                eventDragZone = me.getEventDragZone({
                    dragElement,
                    enableResizingAcrossOppositeEdge: true,
                    eventRecord                     : record,
                    proxyParentId                   : data.path[0].id
                });

                owner.getPlugin(me.resizablePluginType).onDragStart(data);
                eventDragZone.dragStart(data);

                setTimeout(() => {
                    me.isDragging && Neo.applyDeltas(me.appName, {
                        id   : eventId,
                        style: {opacity: 0}
                    })
                }, 50)
            }, 50)
        }
    }

    /**
     * @param {Object} data
     */
    onEventDragEnd(data) {
        let me              = this,
            {owner}         = me,
            {eventDragZone} = owner;

        if (owner.enableDrag) {
            eventDragZone.dragEnd();

            if (!me.isTopLevelEvent(data)) {
                data = me.adjustResizeEvent(data);
                owner.getPlugin(me.resizablePluginType).onDragEnd(data)
            } else {
                eventDragZone.removeBodyCursorCls()
            }

            me.isDragging = false
        }
    }

    /**
     * @param {Object} data
     */
    onEventDragMove(data) {
        let me      = this,
            {owner} = me;

        if (owner.enableDrag) {
            if (!me.isTopLevelEvent(data)) {
                data = me.adjustResizeEvent(data)
            }

            owner.eventDragZone.dragMove(data)
        }
    }

    /**
     * @param {Object} data
     */
    onEventDragStart(data) {
        let me        = this,
            {owner}   = me,
            modelData = owner.data;

        if (owner.enableDrag) {
            let isTopLevelEvent = me.isTopLevelEvent(data),
                dragElement, eventDragZone;

            if (!isTopLevelEvent) {
                data = me.adjustResizeEvent(data)
            }

            me.isDragging = true;

            dragElement = VDomUtil.findVdomChild(owner.vdom, data.path[0].id).vdom;

            eventDragZone = me.getEventDragZone({
                dragElement,
                enableResizingAcrossOppositeEdge: modelData.events.enableResizingAcrossOppositeEdge,
                eventRecord                     : owner.eventStore.get(dragElement.flag),
                proxyParentId                   : data.path[1].id
            });

            if (isTopLevelEvent) {
                eventDragZone.addBodyCursorCls()
            } else {
                owner.getPlugin(me.resizablePluginType).onDragStart(data)
            }

            eventDragZone.dragStart(data)
        }
    }
}

Neo.setupClass(DragDrop);

export default DragDrop;
