import DragZone from '../../draggable/DragZone.mjs';

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
         * @member {Number} startTime=0
         */
        endTime: 0,
        /**
         * @member {Boolean} moveHorizontal=false
         */
        moveHorizontal: false,
        /**
         * @member {Boolean} moveInMainThread=false
         */
        moveInMainThread: false,
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
     *
     * @param {Object} data
     */
    dragMove(data) {
        let me   = this,
            path = data.targetPath,
            i    = 0,
            len  = path.length,
            position, style;

        for (; i < len; i++) {
            if (path[i].cls.includes('neo-c-w-column')) {
                me.proxyParentId = path[i].id;
                break;
            }
        }

        if (!me.moveInMainThread && me.dragProxy) {
            position = Math.min(me.columnHeight, data.clientY - me.columnTop);
            position = Math.max(0, position);

            console.log(position, me.columnHeight);

            style = me.dragProxy.style;

            if (me.moveVertical) {
                style.top = `${data.clientY - me.offsetY}px`;
            }

            me.dragProxy.style = style;
        }
    }

    /**
     *
     * @param {Object} data
     */
    dragStart(data) {console.log(data.path[1]);
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