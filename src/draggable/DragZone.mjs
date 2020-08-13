import Base                  from '../core/Base.mjs';
import DragProxyComponent    from './DragProxyComponent.mjs';
import {default as VDomUtil} from '../util/VDom.mjs';

/**
 * @class Neo.draggable.DragZone
 * @extends Neo.core.Base
 */
class DragZone extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.draggable.DragZone'
         * @protected
         */
        className: 'Neo.draggable.DragZone',
        /**
         * @member {String} ntype='dragzone'
         * @protected
         */
        ntype: 'dragzone',
        /**
         * The name of the App this instance belongs to
         * @member {String|null} appName=null
         */
        appName: null,
        /**
         * The vdom (tree) of the element you want to drag
         * @member {Object|null} dragElement=null
         */
        dragElement: null,
        /**
         * @member {Neo.component.Base|null} dragProxy=null
         */
        dragProxy: null,
        /**
         * @member {Object|null} dragProxyConfig=null
         */
        dragProxyConfig: null,
        /**
         * @member {Boolean} moveHorizontal=true
         */
        moveHorizontal: true,
        /**
         * @member {Boolean} moveInMainThread=true
         */
        moveInMainThread: true,
        /**
         * @member {Boolean} moveVertical=true
         */
        moveVertical: true,
        /**
         * @member {Number} offsetX=0
         */
        offsetX: 0,
        /**
         * @member {Number} offsetY=0
         */
        offsetY: 0,
        /**
         * @member {String} proxyParentId_='document.body'
         */
        proxyParentId_: 'document.body'
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        if (!Neo.main.addon.DragDrop) {
            throw new Error('You can not use Neo.draggable.DragZone without adding Neo.main.addon.DragDrop to the main thread addons');
        }
    }

    /**
     *
     * @param {Object} data
     */
    createDragProxy(data) {
        let me = this;

        me.dragProxy = Neo.create({
            module          : DragProxyComponent,
            appName         : me.appName,
            moveInMainThread: me.moveInMainThread,
            parentId        : me.proxyParentId,
            vdom            : {cn: [VDomUtil.clone(me.dragElement)]},

            style: {
                height: `${data.height}px`,
                left  : `${me.moveHorizontal ? data.left : 0}px`,
                top   : `${me.moveVertical   ? data.top  : 0}px`,
                width : `${data.width}px`
            },

            ...me.dragProxyConfig || {}
        });
    }

    /**
     * Override for using custom animations
     */
    destroyDragProxy() {
        this.dragProxy.destroy(true);
    }

    /**
     *
     */
    dragEnd() {
        let me = this;

        if (me.dragProxy) {
            me.destroyDragProxy();
            me.dragProxy = null;
        }
    }

    /**
     *
     * @param {Object} data
     */
    dragMove(data) {
        let me = this,
            style;

        if (!me.moveInMainThread && me.dragProxy) {
            style = me.dragProxy.style;

            if (me.moveHorizontal) {
                style.left = `${data.clientX - me.offsetX}px`;
            }

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
    dragStart(data) {
        let me = this;

        Neo.main.DomAccess.getBoundingClientRect({
            id: me.dragElement.id
        }).then(rect => {
            me.offsetX = data.clientX - rect.left;
            me.offsetY = data.clientY - rect.top;

            me.createDragProxy(rect);
        });
    }
}

Neo.applyClassConfig(DragZone);

export {DragZone as default};