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
         * @member {Boolean} moveInMainThread=true
         */
        moveInMainThread: true,
        /**
         * @member {String} proxyParentId='document.body'
         */
        proxyParentId: 'document.body'
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
            module  : DragProxyComponent,
            appName : me.appName,
            parentId: me.proxyParentId,
            vdom    : {cn: [VDomUtil.clone(me.dragElement)]},

            style: {
                height: `${data.height}px`,
                left  : `${data.left}px`,
                top   : `${data.top}px`,
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
     * @param {Number} data.clientX
     * @param {Number} data.clientY
     */
    dragMove(data) {
        let me = this,
            style;

        if (!me.moveInMainThread && me.dragProxy) {
            style = me.dragProxy.style;

            style.left = `${data.clientX}px`;
            style.top  = `${data.clientY}px`;

            me.dragProxy.style = style;
        }
    }

    /**
     *
     */
    dragStart() {
        let me = this;

        Neo.main.DomAccess.getBoundingClientRect({
            id: me.dragElement.id
        }).then(data => {
            me.createDragProxy(data);
        });
    }
}

Neo.applyClassConfig(DragZone);

export {DragZone as default};