import Base               from '../core/Base.mjs';
import Component          from '../component/Base.mjs';
import DragProxyComponent from './DragProxyComponent.mjs';
import DragProxyContainer from './DragProxyContainer.mjs';
import NeoArray           from '../util/Array.mjs';
import Observable         from '../core/Observable.mjs';
import VDomUtil           from '../util/VDom.mjs';

/**
 * @class Neo.draggable.DragZone
 * @extends Neo.core.Base
 * @mixes Neo.core.Observable
 */
class DragZone extends Base {
    /**
     * True automatically applies the core.Observable mixin
     * @member {Boolean} observable=true
     * @static
     */
    static observable = true

    static config = {
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
         * Allow the drag proxy to move outside of the boundaryContainerId.
         * @member {Boolean} allowOverdrag=false
         */
        allowOverdrag: false,
        /**
         * drag:move will by default only fire in case moveInMainThread === false.
         * In case you want to move the dragProxy inside main but still get the event,
         * set this config to true.
         * @member {Boolean} alwaysFireDragMove=false
         */
        alwaysFireDragMove: false,
        /**
         * The name of the App this instance belongs to
         * @member {String|null} appName_=null
         * @reactive
         */
        appName_: null,
        /**
         * Optionally set a fixed cursor style to the document.body during drag operations
         * @member {String|null} bodyCursorStyle=null
         */
        bodyCursorStyle: null,
        /**
         * Limit the zone in which you can drag an element.
         * You can pass a node id, or an array of 2 node ids, in case you need an intersection.
         * Example for 2 ids: grid.header.Toolbar => boundaryContainerId: [id, me.parent.id]
         * @member {String|String[]|null} boundaryContainerId=null
         */
        boundaryContainerId: null,
        /**
         * Stores the DOMRect matching this.boundaryContainerId
         * @member {DOMRect|null} data=null
         * @protected
         */
        boundaryContainerRect: null,
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
         * @member {Object|null} dragProxyConfig_=null
         * @reactive
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
         * @member {Neo.component.Base|null} owner=null
         */
        owner: null,
        /**
         * @member {String} proxyParentId_='document.body'
         * @reactive
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
         * Optional main-thread sibling-resize descriptor consumed by `Neo.main.addon.DragDrop`.
         * The App Worker receives only the terminal resolved size.
         * @member {Object|null} resizeConfig=null
         * @protected
         */
        resizeConfig: null,
        /**
         * True creates a drag proxy for the gesture. False keeps the gesture lifecycle without a
         * cloned embodiment; an optional resizeConfig can then keep pointer frames main-thread-only.
         * @member {Boolean} useProxy=true
         */
        useProxy: true,
        /**
         * True creates a position:absolute wrapper div which contains the cloned element
         * @member {Boolean} useProxyWrapper=true
         */
        useProxyWrapper: true,
        /**
         * @member {Number|null} windowId_=null
         * @reactive
         */
        windowId_: null
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        if (!Neo.main.addon.DragDrop) {
            console.error('You can not use Neo.draggable.DragZone without adding Neo.main.addon.DragDrop to the main thread addons', me.id)
        } else {
            // Eager registration: the main-thread addon resolves the owning zone synchronously
            // inside onDragStart, so the first drag:start of a boot already carries a zone id.
            // Best-effort: a zone whose drag element is only assigned later re-registers on its
            // first setConfigs handshake. Fire-and-forget — never block construction on the RPC.
            me.registerZone()
        }
    }

    /**
     * @param args
     */
    destroy(...args) {
        let me = this;

        // Drop the eager registration so a stale root id can never resolve to a dead zone —
        // a stale id is worse than a zoneless one: it silently misattributes a later gesture
        // to a destroyed zone. The key MUST come from the same expression as registration
        // (wrapping zones override getDragElementRoot, e.g. tree/DragZone), so both call
        // sites share getRegistrationRootId() — the pair is the invariant.
        // optional-chained: bare harnesses may stub the addon without the registry API
        if (Neo.main.addon.DragDrop) {
            Neo.main.addon.DragDrop.unregisterZone?.({
                appName          : me.appName,
                windowId         : me.windowId,
                dragElementRootId: me.getRegistrationRootId(),
                dragZoneId       : me.id
            })
        }

        super.destroy(...args)
    }

    /**
     * The registration key of this zone's drag element root — the SINGLE expression shared by
     * register (construct) and unregister (destroy). Resolved via getDragElementRoot() (which
     * wrapping zones override — tree/DragZone unwraps to `dragElement.cn[0]`), never via
     * `dragElement.id` directly: the wrapper and the root diverge by design.
     * @returns {String|null}
     * @protected
     */
    getRegistrationRootId() {
        let root = this.dragElement && this.getDragElementRoot();

        return root?.id ?? null
    }

    /**
     * Registers the gesture owner and optional main-thread behavior using one shared root key.
     * @returns {Promise<*>|undefined}
     * @protected
     */
    registerZone() {
        let me                = this,
            dragElementRootId = me.getRegistrationRootId();

        if (dragElementRootId) {
            return Neo.main.addon.DragDrop.registerZone?.({
                appName     : me.appName,
                windowId    : me.windowId,
                dragElementRootId,
                dragZoneId  : me.id,
                resizeConfig: me.resizeConfig
            })
        }
    }

    /**
     * Triggered after the windowId config got changed
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        value && Neo.currentWorker.insertThemeFiles(value, this.__proto__)
    }

    /**
     * Triggered when accessing the dragProxyConfig config
     * We are re-using this config to create multiple dragProxies,
     * so it is important to work with a clone. see: createDragProxy()
     * @param {Object} value
     * @protected
     */
    beforeGetDragProxyConfig(value) {
        return Neo.clone(value, true, true)
    }

    /**
     * @param {Object}  data
     * @param {Boolean} createComponent=true
     * @returns {Object|Neo.draggable.DragProxyComponent}
     */
    async createDragProxy(data, createComponent=true) {
        let me          = this,
            component   = Neo.getComponent(me.getDragElementRoot().id) || me.owner,
            rect        = me.dragElementRect,
            proxyConfig = me.dragProxyConfig || {},
            isContainer = proxyConfig.module === DragProxyContainer,
            vdom        = proxyConfig.vdom,
            clone       = !isContainer && VDomUtil.clone(vdom ? vdom : me.dragElement),
            config, proxy;

        config = {
            module          : DragProxyComponent,
            appName         : me.appName,
            moveInMainThread: me.moveInMainThread,
            parentId        : me.proxyParentId,
            windowId        : me.windowId,

            ...proxyConfig
        };

        if (isContainer) {
            // We use manual deltas to move the component, so the proxy VDOM starts empty
            config.height          = `${data.height}px`;
            config.items           = [];
            config.parentComponent = me.owner;
            config.width           = `${data.width}px`;

            config.cls = config.cls || [];
            config.cls.push('neo-draggable');
        } else {
            config.vdom = me.useProxyWrapper ? {cn: [clone]} : clone;

            if (clone.cls && !me.useProxyWrapper) {
                config.cls = config.cls || [];
                config.cls.push(...clone.cls)
            }
        }

        config.cls = config.cls || [];

        // An explicit theme in the proxy config wins: subclasses can resolve a NEAREST-ancestor
        // theme (see Neo.dashboard.dock.interaction.TabSortZone#getDragProxyConfig) — `getTheme()` resolves the
        // OUTER boot theme, which is wrong for apps that theme-swap an inner root while
        // `document.body` keeps the boot theme. Pushing both would leave the winner to stylesheet
        // load order.
        if (component && !config.cls.some(item => item.startsWith('neo-theme-'))) {
            config.cls.push(component.getTheme())
        }

        if (me.addDragProxyCls && config.cls) {
            NeoArray.add(config.cls, me.dragProxyCls)
        }

        config.style = config.style || {};

        Object.assign(config.style, {
            height: `${data.height}px`,
            left  : `${me.moveHorizontal ? data.x : rect.x}px`,
            top   : `${me.moveVertical   ? data.y : rect.y}px`,
            width : `${data.width}px`
        });

        if (createComponent) {
            if (isContainer) {
                config.autoInitVnode = true;
                config.autoMount     = true
            }

            me.dragProxy = proxy = Neo.create(config);

            if (isContainer) {
                await proxy.mountedPromise;

                me.dragPlaceholder = Neo.create({
                    module: Component,
                    flex  : component.flex,
                    style : {height: `${data.height}px`, visibility: 'hidden', width: `${data.width}px`}
                });

                // Copy layout configs
                if (component.minHeight) me.dragPlaceholder.minHeight = component.minHeight;
                if (component.minWidth)  me.dragPlaceholder.minWidth  = component.minWidth;

                me.dragStartIndex = me.owner.items.indexOf(component);

                // Fetch the vnode from the vdom worker, without mounting it.
                const {vnode} = await Neo.vdom.Helper.create({vdom: me.dragPlaceholder.vdom});

                // Manual DOM manipulation to preserve Component state (e.g., Canvas or Charts)
                await Neo.applyDeltas(me.windowId, [{
                    action  : 'insertNode',
                    index   : me.dragStartIndex,
                    parentId: me.owner.getVdomItemsRoot().id,
                    vnode
                }, {
                    action  : 'moveNode',
                    id      : component.id,
                    index   : 0,
                    parentId: proxy.id
                }]);

                me.dragPlaceholder.set({
                    vnode,
                    mounted         : true,
                    vnodeInitialized: true
                })
            }

            return proxy
        }

        return config
    }

    /**
     * Override for using custom animations
     */
    destroyDragProxy() {
        let me         = this,
            id         = me.dragProxy.id,
            {windowId} = me;

        // The cleanup delta must outlive this zone: core.Base#destroy() clears and rejects
        // pending timeouts, and a zone torn down inside the deferral window (e.g. a closing
        // dock vessel's chrome un-projection racing a cross-window drop) would otherwise
        // orphan the proxy's DOM node in the source window with no owner left to remove it.
        me.timeout(me.moveInMainThread ? 0 : 30)
            .catch(() => null)
            .then(() => Neo.applyDeltas(windowId, [{action: 'removeNode', id}]))
            .catch(reason => {
                // The dispatch owns its terminal outcome: worker.Base's closed-port branch
                // rejects with bare `undefined` when the destination window is already gone —
                // the node died with its window, the cleanup is moot, settle silently. A
                // REASONED rejection is a live-window delta failure; this detached chain has
                // no caller to propagate to, so the console is the honest terminal surface.
                reason !== undefined && console.error('DragZone: proxy removal delta failed', {id, reason, windowId})
            });

        me.dragProxy.destroy()
    }

    /**
     * @param {Object} data
     */
    dragEnd(data) {
        let me      = this,
            {owner} = me,
            {cls}   = owner;

        NeoArray.remove(cls, 'neo-is-dragging');
        owner.cls = cls;

        if (me.dragProxy) {
            if (me.dragPlaceholder) {
                me.dragPlaceholder.destroy();
                me.dragPlaceholder = null
            }

            me.destroyDragProxy();
            me.dragProxy = null
        }

        Object.assign(me, {
            dragElementRect  : null,
            dragStartIndex   : null,
            offsetX          : 0,
            offsetY          : 0,
            scrollContainerId: null
        });

        me.fire('dragEnd', data);

        me.resetData()
    }

    /**
     * @param {Object} data
     * @param {Boolean} force=false
     */
    dragMove(data, force=false) {
        let me = this,
            style;

        if ((!me.moveInMainThread || force) && me.dragProxy) {
            style = me.dragProxy.style;

            if (me.moveHorizontal) {
                style.left = `${data.clientX - me.offsetX}px`;
            }

            if (me.moveVertical) {
                style.top = `${data.clientY - me.offsetY}px`;
            }

            me.dragProxy.style = style;
        }

        me.fire('dragMove', data)
    }

    /**
     * @param {Object} data
     */
    async dragStart(data) {
        let me                         = this,
            {appName, owner, windowId} = me,
            {cls}                      = owner,
            rect                       = me.getDragElementRect(data),
            mainData, offsetX, offsetY;

        me.setData();

        mainData = await Neo.main.addon.DragDrop.setConfigs({
            appName,
            windowId,
            ...me.getMainThreadConfigs()
        });

        me.boundaryContainerRect = mainData.boundaryContainerRect

        NeoArray.add(cls, 'neo-is-dragging');
        owner.cls = cls;

        offsetX = data.clientX - rect.left;
        offsetY = data.clientY - rect.top;

        Object.assign(me, {
            dragElementRect: rect,
            offsetX,
            offsetY
        });

        if (me.useProxy) {
            await me.createDragProxy(rect)
        }

        me.fire('dragStart', {
            clientX        : data.clientX,
            clientY        : data.clientY,
            dragElementRect: rect,
            eventData      : data,
            id             : me.id,
            offsetX,
            offsetY
        })
    }

    /**
     * @param {Object} data
     * @returns {Object}
     */
    getDragElementRect(data) {
        let me = this,
            id = me.getDragElementRoot().id;

        for (let item of data.path) {
            if (item.id === id) {
                return item.rect
            }
        }

        for (let item of data.targetPath) {
            if (item.id === id) {
                return item.rect
            }
        }

        return null
    }

    /**
     * Override this method in case you want to wrap your dragElement.
     * See: draggable.tree.DragZone
     * @returns {Object}
     */
    getDragElementRoot() {
        return this.dragElement
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
            allowOverdrag      : me.allowOverdrag,
            alwaysFireDragMove : me.alwaysFireDragMove,
            bodyCursorStyle    : me.bodyCursorStyle,
            boundaryContainerId: me.boundaryContainerId,
            dragElementRootId  : me.getDragElementRoot().id,
            dragProxyCls       : me.dragProxyCls,
            dragZoneId         : me.id,
            dropZoneIdentifier : me.dropZoneIdentifier,
            moveHorizontal     : me.moveHorizontal,
            moveVertical       : me.moveVertical,
            resizeConfig       : me.resizeConfig,
            scrollContainerId  : me.scrollContainerId,
            scrollFactorLeft   : me.scrollFactorLeft,
            scrollFactorTop    : me.scrollFactorTop
        }
    }

    /**
     * Handles the first-class gesture-cancel signal. Base drag zones have no semantic drop
     * work to undo, so cancellation fires its own observable event and tears down the proxy
     * immediately. Sort zones override this entry to restore their captured layout first.
     * @param {Object} data
     */
    onDragCancel(data) {
        this.fire('dragCancel', data);
        this.dragEnd({...data, cancelled: true})
    }

    /**
     * You can either extend this class and override the handler or listen to the event from the outside
     * @param {Object} data
     */
    onDrop(data) {
        this.fire('drop', data)
    }

    /**
     * You can either extend this class and override the handler or listen to the event from the outside
     * @param {Object} data
     */
    onDropEnter(data) {
        this.fire('drop:enter', data)
    }

    /**
     * You can either extend this class and override the handler or listen to the event from the outside
     * @param {Object} data
     */
    onDropLeave(data) {
        this.fire('drop:leave', data)
    }

    /**
     *
     */
    resetData() {
        this.timeout(50).then(() => {
            this.data = null
        })
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
        }
    }
}

export default Neo.setupClass(DragZone);
