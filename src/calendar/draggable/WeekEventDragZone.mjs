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
         * @member {Boolean} moveHorizontal=false
         */
        moveHorizontal: false,
        /**
         * @member {Boolean} moveInMainThread=false
         */
        moveInMainThread: false,
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
            style;

        for (; i < len; i++) {
            if (path[i].cls.includes('neo-c-w-column')) {
                me.proxyParentId = path[i].id;
                break;
            }
        }

        if (!me.moveInMainThread && me.dragProxy) {
            style = me.dragProxy.style;

            if (me.moveVertical) {
                style.top = `${data.clientY - me.offsetY}px`;
            }

            me.dragProxy.style = style;
        }
    }
}

Neo.applyClassConfig(WeekEventDragZone);

export {WeekEventDragZone as default};