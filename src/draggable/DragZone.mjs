import Base               from '../core/Base.mjs';
import DragProxyComponent from './DragProxyComponent.mjs';
import VDomUtil           from '../util/VDom.mjs';

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
         * @member {String|null} boundaryContainerId_=null
         */
        boundaryContainerId_: null,
        /**
         * The vdom (tree) of the element you want to drag
         * @member {Object|null} dragElement=null
         */
        dragElement: null,
        /**
         * The bounding client rect of the dragElement
         * Will get set inside dragStart()
         * @member {Object|null} dragElementRect=null
         */
        dragElementRect: null,
        /**
         * @member {Neo.component.Base|null} dragProxy=null
         * @protected
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
        proxyParentId_: 'document.body',
        /**
         * @member {String|null} scrollContainerId_=null
         */
        scrollContainerId_: null,
        /**
         * @member {Number} scrollFactorLeft_=1
         */
        scrollFactorLeft_: 1,
        /**
         * @member {Number} scrollFactorTop_=1
         */
        scrollFactorTop_: 1,
        /**
         * True creates a position:absolute wrapper div which contains the cloned element
         * @member {Boolean} useProxyWrapper=true
         */
        useProxyWrapper: true
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
     * Triggered after the scrollContainerId config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetScrollContainerId(value, oldValue) {
        if (value) {
            Neo.main.addon.DragDrop.setScrollContainer({
                id: value
            });
        }
    }

    /**
     * Triggered after the boundaryContainerId config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetBoundaryContainerId(value, oldValue) {
        if (value) {
            Neo.main.addon.DragDrop.setBoundaryContainer({
                id: value
            });
        }
    }

    /**
     * Triggered after the scrollFactorLeft config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetScrollFactorLeft(value, oldValue) {
        if (!(value === 1 && oldValue === undefined)) {
            Neo.main.addon.DragDrop.setScrollFactorLeft({
                value: value
            });
        }
    }

    /**
     * Triggered after the scrollFactorTop config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetScrollFactorTop(value, oldValue) {
        if (!(value === 1 && oldValue === undefined)) {
            Neo.main.addon.DragDrop.setScrollFactorTop({
                value: value
            });
        }
    }

    /**
     *
     * @param {Object} data
     */
    createDragProxy(data) {
        let me    = this,
            clone = VDomUtil.clone(me.dragElement);

        const config = {
            module          : DragProxyComponent,
            appName         : me.appName,
            moveInMainThread: me.moveInMainThread,
            parentId        : me.proxyParentId,
            vdom            : me.useProxyWrapper ? {cn: [clone]} : clone,

            style: {
                height: `${data.height}px`,
                left  : `${me.moveHorizontal ? data.left : 0}px`,
                top   : `${me.moveVertical   ? data.top  : 0}px`,
                width : `${data.width}px`
            },

            ...me.dragProxyConfig || {}
        };

        if (!me.useProxyWrapper) {
            config.cls = clone.cls;
        }

        me.dragProxy = Neo.create(config);
    }

    /**
     * Override for using custom animations
     */
    destroyDragProxy() {
        let me = this,
            id = me.dragProxy.id;

        setTimeout(() => {
            Neo.currentWorker.promiseMessage('main', {
                action: 'updateDom',
                deltas: [{action: 'removeNode', id: id}]
            });
        }, me.moveInMainThread ? 0 : 30);

        me.dragProxy.destroy();
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

        Object.assign(me, {
            dragElementRect  : null,
            offsetX          : 0,
            offsetY          : 0,
            scrollContainerId: null
        });
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
            Object.assign(me, {
                dragElementRect: rect,
                offsetX        : data.clientX - rect.left,
                offsetY        : data.clientY - rect.top
            });

            me.createDragProxy(rect);
        });
    }
}

Neo.applyClassConfig(DragZone);

export {DragZone as default};