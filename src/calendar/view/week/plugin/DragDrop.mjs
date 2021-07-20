import Base          from '../../../../plugin/Base.mjs';
import DateUtil      from '../../../../util/Date.mjs';
import EventDragZone from '../EventDragZone.mjs';
import VDomUtil      from '../../../../util/VDom.mjs';

/**
 * @class Neo.calendar.view.week.plugin.DragDrop
 * @extends Neo.plugin.Base
 */
class DragDrop extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.view.week.plugin.DragDrop'
         * @protected
         */
        className: 'Neo.calendar.view.week.plugin.DragDrop',
        /**
         * @member {Neo.calendar.view.week.EventDragZone|null} eventDragZone=null
         */
        eventDragZone: null
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me           = this,
            columnOpts   = {scope: me, delegate: '.neo-c-w-column'},
            eventOpts    = {scope: me, delegate: '.neo-event'},
            owner        = me.owner,
            domListeners = owner.domListeners;

        domListeners.push(
            {'drag:end'  : me.onColumnDragEnd,    ...columnOpts},
            {'drag:end'  : me.onEventDragEnd,     ...eventOpts},
            {'drag:move' : me.onColumnDragMove,   ...columnOpts},
            {'drag:move' : me.onEventDragMove,    ...eventOpts},
            {'drag:start': me.onColumnDragStart,  ...columnOpts},
            {'drag:start': me.onEventDragStart,   ...eventOpts}
        );

        owner.domListeners = domListeners;
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
     *
     * @param {Object} opts
     * @param {Object} opts.dragElement
     * @param {Boolean} opts.enableResizingAcrossOppositeEdge
     * @param {Object} opts.eventRecord
     * @param {String} opts.proxyParentId
     * @returns {Neo.calendar.view.week.EventDragZone}
     */
    getEventDragZone(opts) {
        let me            = this,
            eventDragZone = me.eventDragZone,
            owner         = me.owner,
            timeAxis      = owner.timeAxis,

            config = {
                axisEndTime                     : timeAxis.getTime(owner.endTime),
                axisStartTime                   : timeAxis.getTime(owner.startTime),
                dragElement                     : opts.dragElement,
                enableResizingAcrossOppositeEdge: opts.enableResizingAcrossOppositeEdge,
                eventRecord                     : opts.eventRecord,
                proxyParentId                   : opts.proxyParentId
            };

        if (!eventDragZone) {
            me.eventDragZone = eventDragZone = Neo.create({
                module           : EventDragZone,
                appName          : me.appName,
                owner            : owner,
                scrollContainerId: owner.getScrollContainer().id,
                ...config,

                dragProxyConfig: {
                    style: {
                        transition: 'none',
                        willChange: 'height'
                    }
                }
            });
        } else {
            eventDragZone.set(config);
        }

        return eventDragZone;
    }

    /**
     *
     * @param {Object} path
     * @returns {Boolean}
     */
    isTopLevelColumn(path) {
        return path[0].cls.includes('neo-c-w-column');
    }

    /**
     *
     * @param {Object} eventData
     * @returns {Boolean}
     */
    isTopLevelEvent(eventData) {
        return eventData.path[0].cls.includes('neo-event');
    }

    /**
     *
     * @param {Object} data
     */
    onColumnDragEnd(data) {
        let me           = this,
            recordSymbol = Symbol.for('addedRecord'),
            record       = me[recordSymbol];

        if (record && me.isTopLevelColumn(data.path)) {
            delete me[recordSymbol];

            Neo.applyDeltas(me.appName, {
                id   : me.getEventId(record.id),
                style: {opacity: 1}
            }).then(() => {
                me.eventDragZone.dragEnd();
                me.getPlugin({flag:'resizable'}).onDragEnd(data);

                me.isDragging = false;
            });
        }
    }

    /**
     *
     * @param {Object} data
     */
    onColumnDragMove(data) {
        if (this.isTopLevelColumn(data.path)) {
            this.eventDragZone?.dragMove(data);
        }
    }

    /**
     *
     * @param {Object} data
     */
    onColumnDragStart(data) {
        let me = this;

        if (me.isTopLevelColumn(data.targetPath)) {
            let axisStartTime   = me.timeAxis.getTime(me.startTime),
                calendarStore   = me.calendarStore,
                columnRect      = data.path[0].rect,
                intervalSize    = 15,
                intervals       = (me.timeAxis.getTime(me.endTime) - axisStartTime) * 60 / intervalSize,
                intervalHeight  = columnRect.height / intervals,
                position        = Math.min(columnRect.height, data.clientY - columnRect.top),
                currentInterval = Math.floor(position / intervalHeight),
                startDate       = new Date(VDomUtil.findVdomChild(me.vdom, data.path[0].id).vdom.flag + 'T00:00:00'),
                dragElement, endDate, eventDragZone, eventId, record;

            me.isDragging = true;

            startDate.setHours(axisStartTime);
            startDate.setMinutes(currentInterval * intervalSize);

            endDate = DateUtil.clone(startDate);

            endDate.setMinutes(endDate.getMinutes() + me.minimumEventDuration);

            record = me.eventStore.add({
                calendarId: me.data.activeCalendarId || calendarStore.getAt(0)[calendarStore.keyProperty],
                endDate,
                startDate,
                title     : 'New Event'
            })[0];

            // we need to cache a reference to make the record accessible for onColumnDragEnd()
            me[Symbol.for('addedRecord')] = record;

            // wait until the new event got mounted
            setTimeout(() => {
                eventId     = me.getEventId(record.id);
                dragElement = VDomUtil.findVdomChild(me.vdom, eventId).vdom;

                eventDragZone = me.getEventDragZone({
                    dragElement,
                    enableResizingAcrossOppositeEdge: true,
                    eventRecord                     : record,
                    proxyParentId                   : data.path[0].id
                });

                me.getPlugin({flag:'resizable'}).onDragStart(data);
                eventDragZone.dragStart(data);

                setTimeout(() => {
                    Neo.applyDeltas(me.appName, {
                        id   : eventId,
                        style: {opacity: 0}
                    });
                }, 50);
            }, 50);
        }
    }

    /**
     *
     * @param {Object} data
     */
    onEventDragEnd(data) {
        let me    = this,
            owner = me.owner;

        if (owner.enableDrag) {
            me.eventDragZone.dragEnd();

            if (!me.isTopLevelEvent(data)) {
                data = me.adjustResizeEvent(data);
                owner.getPlugin({flag:'resizable'}).onDragEnd(data);
            } else {
                me.eventDragZone.removeBodyCursorCls();
            }

            me.isDragging = false;
        }
    }

    /**
     *
     * @param {Object} data
     */
    onEventDragMove(data) {
        let me = this;

        if (me.owner.enableDrag) {
            if (!me.isTopLevelEvent(data)) {
                data = me.adjustResizeEvent(data);
            }

            me.eventDragZone.dragMove(data);
        }
    }

    /**
     *
     * @param {Object} data
     */
    onEventDragStart(data) {
        let me        = this,
            owner     = me.owner,
            modelData = owner.data;

        if (owner.enableDrag) {
            let isTopLevelEvent = me.isTopLevelEvent(data),
                dragElement, eventDragZone;

            if (!isTopLevelEvent) {
                data = me.adjustResizeEvent(data);
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
                eventDragZone.addBodyCursorCls();
            } else {
                owner.getPlugin({flag:'resizable'}).onDragStart(data);
            }

            eventDragZone.dragStart(data);
        }
    }
}

Neo.applyClassConfig(DragDrop);

export {DragDrop as default};
