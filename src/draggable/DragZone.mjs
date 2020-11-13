import Base               from '../core/Base.mjs';
import DragProxyComponent from './DragProxyComponent.mjs';
import NeoArray           from '../util/Array.mjs';
import VDomUtil           from '../util/VDom.mjs';

/**
 * @class Neo.draggable.DragZone
 * @extends Neo.core.Base
 */
class DragZone extends Base {
    static getStaticConfig() {return {
        /**
         * True automatically applies the core/Observable.mjs mixin
         * @member {Boolean} observable=true
         * @static
         */
        observable: true
    }}

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
         * Adds this.dragProxyCls => 'neo-dragproxy' to the top level dragProxyEl node
         * @member {Boolean} addDragProxyCls=true
         */
        addDragProxyCls: true,
        /**
         * drag:move will by default only fire in case moveInMainThread === false.
         * In case you want to move the dragProxy inside main but still get the event,
         * set this config to true.
         * @member {Boolean} alwaysFireDragMove=false
         */
        alwaysFireDragMove: false,
        /**
         * The name of the App this instance belongs to
         * @member {String|null} appName=null
         */
        appName: null,
        /**
         * @member {String|null} boundaryContainerId=null
         */
        boundaryContainerId: null,
        /**
         * Store data which you want to pass to drop related events here
         * @member {Object|null} data=null
         */
        data: null,
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
        dragProxyConfig_: null,
        /**
         * @member {String} dragProxyCls='neo-dragproxy'
         */
        dragProxyCls: 'neo-dragproxy',
        /**
         * You can either pass an array of (dom) ids or cls rules or both
         * @example
         * dropZoneIdentifier: {
         *     ids: ['foo','bar']
         * }
         * @example
         * dropZoneIdentifier: {
         *     cls: ['my-class-1','my-class-2']
         * }
         * @example
         * dropZoneIdentifier: {
         *     cls: ['my-class-1','my-class-2'],
         *     ids: ['foo','bar']
         * }
         * @member {Object|null} dropZoneIdentifier=null
         */
        dropZoneIdentifier: null,
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
         * @member {Neo.component.Base} owner=null
         */
        owner: null,
        /**
         * @member {String} proxyParentId_='document.body'
         */
        proxyParentId_: 'document.body',
        /**
         * @member {String|null} scrollContainerId=null
         */
        scrollContainerId: null,
        /**
         * @member {Number} scrollFactorLeft=1
         */
        scrollFactorLeft: 1,
        /**
         * @member {Number} scrollFactorTop=1
         */
        scrollFactorTop: 1,
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
            console.error('You can not use Neo.draggable.DragZone without adding Neo.main.addon.DragDrop to the main thread addons', this.id);
        }
    }

    /**
     * Triggered when accessing the dragProxyConfig config
     * We are re-using this config to create multiple dragProxies,
     * so it is important to work with a clone. see: createDragProxy()
     * @param {Object} value
     * @protected
     */
    beforeGetDragProxyConfig(value) {
        return Neo.clone(value, true, true);
    }

    /**
     *
     * @param {Object} data
     */
    createDragProxy(data) {
        let me        = this,
            component = Neo.getComponent(me.getDragElementRoot().id) || me.owner,
            clone     = VDomUtil.clone(me.dragElement);

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

        config.cls = config.cls || [];

        if (component) {
            config.cls.push(component.getTheme());
        }

        if (!me.useProxyWrapper) {
            config.cls.push(...clone.cls);
        }

        if (me.addDragProxyCls && config.cls) {
            NeoArray.add(config.cls, me.dragProxyCls);
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
        let me    = this,
            owner = me.owner,
            cls   = owner.cls;

        NeoArray.remove(cls, 'neo-is-dragging');
        owner.cls = cls;

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

        me.resetData();
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
        let me    = this,
            owner = me.owner,
            cls   = owner.cls;

        me.setData();

        NeoArray.add(cls, 'neo-is-dragging');
        owner.cls = cls;

        Neo.main.addon.DragDrop.setConfigs(me.getMainThreadConfigs());

        Neo.main.DomAccess.getBoundingClientRect({
            id: me.getDragElementRoot().id
        }).then(rect => {
            Object.assign(me, {
                dragElementRect: rect,
                offsetX        : data.clientX - rect.left,
                offsetY        : data.clientY - rect.top
            });

            me.createDragProxy(rect);
        });
    }

    /**
     * Override this method in case you want to wrap your dragElement.
     * See: draggable.tree.DragZone
     * @returns {Object}
     */
    getDragElementRoot() {
        return this.dragElement;
    }

    /**
     * Override this method inside class extensions to add more configs
     * which get passed to main.addon.DragDrop onDragStart()
     * @returns {Object}
     * @protected
     */
    getMainThreadConfigs() {
        let me = this;

        return {
            alwaysFireDragMove : me.alwaysFireDragMove,
            boundaryContainerId: me.boundaryContainerId,
            dragProxyCls       : me.dragProxyCls,
            dragZoneId         : me.id,
            dropZoneIdentifier : me.dropZoneIdentifier,
            moveHorizontal     : me.moveHorizontal,
            moveVertical       : me.moveVertical,
            scrollContainerId  : me.scrollContainerId,
            scrollFactorLeft   : me.scrollFactorLeft,
            scrollFactorTop    : me.scrollFactorTop
        };
    }

    /**
     * You can either extend this class and override the handler or listen to the event from the outside
     * @param {Object} data
     */
    onDrop(data) {
        this.fire('drop', data);
    }

    /**
     * You can either extend this class and override the handler or listen to the event from the outside
     * @param {Object} data
     */
    onDropEnter(data) {
        this.fire('drop:enter', data);
    }

    /**
     * You can either extend this class and override the handler or listen to the event from the outside
     * @param {Object} data
     */
    onDropLeave(data) {
        this.fire('drop:leave', data);
    }

    /**
     *
     */
    resetData() {
        setTimeout(() => {
            this.data = null;
        }, 30);
    }

    /**
     * Extend this method for child classes to pass additional properties
     * @param {Object} data={}
     */
    setData(data={}) {
        let me = this;

        me.data = {
            dragElement: me.getDragElementRoot(),
            dragZoneId : me.id,
            ...data
        };
    }
}

Neo.applyClassConfig(DragZone);

export {DragZone as default};