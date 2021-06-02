import DragZone  from '../../../draggable/DragZone.mjs';
import Resizable from '../../../plugin/Resizable.mjs';

/**
 * @class Neo.calendar.view.week.EventResizable
 * @extends Neo.container.Base
 */
class EventResizable extends Resizable {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.view.week.EventResizable'
         * @protected
         */
        className: 'Neo.calendar.view.week.EventResizable'
    }}

    /**
     *
     * @param {Object} data
     */
    onDragEnd(data) {
        super.onDragEnd(data);
        // todo
    }

    /**
     *
     * @param {Object} data
     */
    onDragMove(data) {
        super.onDragMove(data);
        // todo
    }

    /**
     *
     * @param {Object} data
     */
    onDragStart(data) {
        let me          = this,
            containerId = me.boundaryContainerId,
            i           = 0,
            len         = data.path.length,
            owner       = me.owner,
            appName     = me.appName,
            targetNode  = me.targetNode,
            style       = targetNode.style || {},
            target;

        me.isDragging = true;

        style.opacity = 0.3;
        targetNode.style = style;

        for (; i < len; i++) {
            target = data.path[i];

            if (target.cls.includes(me.delegationCls)) {
                me.initialRect = target.rect;
            }

            if (containerId) {
                if (containerId === 'document.body' && target.tagName === 'body' || containerId === target.id) {
                    me.boundaryContainerRect = target.rect;
                    break; // assuming that the dragEl is not outside of the container
                }
            }
        }

        if (!me.boundaryContainerRect) {
            Neo.main.DomAccess.getBoundingClientRect({
                appName: appName,
                id     : me.boundaryContainerRect
            }).then(rect => {
                me.boundaryContainerRect = rect;
            });
        }

        Neo.main.DomAccess.setStyle({
            appName: appName,
            id     : 'document.body',
            style  : {cursor: `${Resizable.cursorPositions[Resizable.positions.indexOf(me.currentNodeName)]}-resize !important`}
        });

        if (!me.dragZone) {
            me.dragZone = Neo.create({
                module             : DragZone,
                appName            : appName,
                boundaryContainerId: owner.boundaryContainerId,
                dragElement        : targetNode,
                moveInMainThread   : false,
                owner              : owner,
                ...me.dragZoneConfig || {}
            });
        } else {
            me.dragZone.boundaryContainerId = owner.boundaryContainerId;
            me.dragZone.dragElement         = targetNode;
        }

        me.dragZone.dragStart(data);
    }
}

Neo.applyClassConfig(EventResizable);

export {EventResizable as default};
