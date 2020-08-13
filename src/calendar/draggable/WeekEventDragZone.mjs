import DragZone              from '../../draggable/DragZone.mjs';
import {default as VDomUtil} from '../../util/VDom.mjs';

/**
 * @class Neo.calendar.draggable.WeekEventDragZone
 * @extends Neo.draggable.DragZone
 */
class WeekEventDragZone extends DragZone {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.draggable.WeekEventDragZone'
         * @protected
         */
        className: 'Neo.calendar.draggable.WeekEventDragZone',
        /**
         * @member {String} ntype='calendar-week-event-dragzone'
         * @protected
         */
        ntype: 'calendar-week-event-dragzone',
        /**
         * @member {Number} columnHeight=0
         */
        columnHeight: 0,
        /**
         * @member {Number} columnTop=0
         */
        columnTop: 0,
        /**
         * @member {Number} currentInterval=0
         */
        currentInterval: 0,
        /**
         * @member {Number} startTime=0
         */
        endTime: 0,
        /**
         * @member {Object} eventRecord=null
         */
        eventRecord: null,
        /**
         * @member {Boolean} moveHorizontal=false
         */
        moveHorizontal: false,
        /**
         * @member {Boolean} moveInMainThread=false
         */
        moveInMainThread: false,
        /**
         * @member {Neo.calendar.view.WeekComponent} owner=null
         */
        owner: null,
        /**
         * @member {Number} startTime=0
         */
        startTime: 0,
        /**
         * @member {Boolean} useProxyWrapper=false
         */
        useProxyWrapper: false
    }}

    /**
     * Triggered after the proxyParentId config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetProxyParentId(value, oldValue) {
        if (oldValue !== undefined) {
            Neo.currentWorker.promiseMessage('main', {
                action: 'updateDom',
                deltas: [{
                    action  : 'moveNode',
                    id      : this.dragProxy.id,
                    index   : 0,
                    parentId: value
                }]
            });
        }
    }

    /**
     * DragEnd equals drop, since we can only drag to valid positions
     * todo: ESC key
     */
    dragEnd() {
        super.dragEnd();

        let me      = this,
            newDate = new Date(VDomUtil.findVdomChild(me.owner.vdom, me.proxyParentId).vdom.flag);

        newDate.setHours(me.startTime);
        newDate.setMinutes(me.currentInterval * 15);

        me.eventRecord.startDate = newDate;

        me.owner.updateEvents();
    }

    /**
     *
     * @param {Object} data
     */
    dragMove(data) {
        let me   = this,
            path = data.targetPath,
            i    = 0,
            len  = path.length,
            intervalHeight, intervals, position, style;

        for (; i < len; i++) {
            if (path[i].cls.includes('neo-c-w-column')) {
                me.proxyParentId = path[i].id;
                break;
            }
        }

        if (!me.moveInMainThread && me.dragProxy) {
            intervals      = (me.endTime - me.startTime) * 4; // 15 minutes each
            intervalHeight = me.columnHeight / intervals;

            position = Math.min(me.columnHeight, data.clientY - me.offsetY - me.columnTop);
            position = Math.max(0, position);

            me.currentInterval = Math.floor(position / intervalHeight);

            position = me.currentInterval * intervalHeight; // snap to valid intervals
            position = position / me.columnHeight * 100;

            style = me.dragProxy.style;

            if (me.moveVertical) {
                style.top = `calc(${position}% + 1px)`;
            }

            me.dragProxy.style = style;
        }
    }

    /**
     *
     * @param {Object} data
     */
    dragStart(data) {
        let me = this;

        Neo.main.DomAccess.getBoundingClientRect({
            id: [me.dragElement.id, data.path[1].id]
        }).then(rects => {
            Object.assign(me, {
                columnHeight: rects[1].height,
                columnTop   : rects[1].top,
                offsetX     : data.clientX - rects[0].left,
                offsetY     : data.clientY - rects[0].top
            });

            me.createDragProxy(rects[0]);
        });
    }
}

Neo.applyClassConfig(WeekEventDragZone);

export {WeekEventDragZone as default};