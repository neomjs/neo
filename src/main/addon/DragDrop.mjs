import Base      from '../../core/Base.mjs';
import DomEvents from '../DomEvents.mjs';

/**
 * @class Neo.main.addon.DragDrop
 * @extends Neo.core.Base
 * @singleton
 */
class DragDrop extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.main.addon.DragDrop'
         * @protected
         */
        className: 'Neo.main.addon.DragDrop',
        /**
         * @member {Boolean} alwaysFireDragMove=false
         */
        alwaysFireDragMove: false,
        /**
         * @member {DOMRect|null} scrollContainerRect=null
         */
        boundaryContainerRect: null,
        /**
         * @member {HTMLElement|null} dragProxyElement=null
         * @protected
         */
        dragProxyElement: null,
        /**
         * @member {DOMRect|null} dragProxyRect=null
         */
        dragProxyRect: null,
        /**
         * @member {Number} clientX=0
         */
        clientX: 0,
        /**
         * @member {Number} clientY=0
         */
        clientY: 0,
        /**
         * @member {Number} initialScrollLeft=0
         */
        initialScrollLeft: 0,
        /**
         * @member {Number} initialScrollTop=0
         */
        initialScrollTop: 0,
        /**
         * @member {Number} offsetX=0
         */
        offsetX: 0,
        /**
         * @member {Number} offsetY=0
         */
        offsetY: 0,
        /**
         * Remote method access for other workers
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'setBoundaryContainer',
                'setDragProxyElement',
                'setScrollContainer',
                'setScrollFactorLeft',
                'setScrollFactorTop'
            ]
        },
        /**
         * @member {HTMLElement|null} scrollContainerElement=null
         */
        scrollContainerElement: null,
        /**
         * @member {DOMRect|null} scrollContainerRect=null
         */
        scrollContainerRect: null,
        /**
         * @member {Number} scrollFactorLeft=1
         */
        scrollFactorLeft: 1,
        /**
         * @member {Number} scrollFactorTop=1
         */
        scrollFactorTop: 1,
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }}

    /**
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let imports = []

        this.addGlobalEventListeners();

        if (Neo.config.hasTouchEvents) {
            imports.push(import(/* webpackChunkName: 'src/main/draggable/sensor/Touch.mjs' */ '../draggable/sensor/Touch.mjs'));
        } else {
            imports.push(import(/* webpackChunkName: 'src/main/draggable/sensor/Mouse.mjs' */ '../draggable/sensor/Mouse.mjs'));
        }

        Promise.all(imports).then(modules => {
            // create the Touch or MouseSensor
            Neo.create({
                module: modules[0].default
            });
        });
    }

    /**
     *
     */
    addGlobalEventListeners() {
        let me = this;

        document.addEventListener('drag:end',   me.onDragEnd  .bind(me), true);
        document.addEventListener('drag:move',  me.onDragMove .bind(me), true);
        document.addEventListener('drag:start', me.onDragStart.bind(me), true);
    }

    /**
     *
     * @param {Event} event
     * @returns {Object}
     */
    getEventData(event) {
        const path = event.path || event.composedPath();

        const e = {
            ...DomEvents.getEventData(event.detail.originalEvent),
            clientX: event.detail.clientX,
            clientY: event.detail.clientY
        };

        if (event.detail.eventPath) {
            e.targetPath = event.detail.eventPath.map(e => DomEvents.getTargetData(e));
        } else {
            e.targetPath = e.path || e.composedPath();
        }

        e.path = path.map(e => DomEvents.getTargetData(e));

        return e;
    }

    /**
     *
     * @param {Object} event
     */
    onDragEnd(event) {
        let me = this;

        Object.assign(me, {
            boundaryContainerRect : null,
            dragProxyElement      : null,
            dragProxyRect         : null,
            initialScrollLeft     : 0,
            initialScrollTop      : 0,
            scrollContainerElement: null,
            scrollContainerRect   : null,
            setScrollFactorLeft   : 1,
            scrollFactorTop       : 1
        });

        DomEvents.sendMessageToApp({
            ...me.getEventData(event),
            type: 'drag:end'
        });
    }

    /**
     *
     * @param {Object} event
     */
    onDragMove(event) {
        let me        = this,
            proxyRect = me.dragProxyRect,
            rect      = me.boundaryContainerRect,
            data, left, top;

        if (me.scrollContainerElement) {
            data = me.scrollContainer({
                clientX: event.detail.clientX,
                clientY: event.detail.clientY
            });

            event.detail.clientX = data.clientX;
            event.detail.clientY = data.clientY;
        }

        if (me.dragProxyElement) {
            left = event.detail.clientX - me.offsetX;
            top  = event.detail.clientY - me.offsetY;

            if (rect) {
                if (left < rect.left) {
                    left = rect.left;
                } else if (left > rect.right - proxyRect.width) {
                    left = rect.right - proxyRect.width;
                }

                if (top < rect.top) {
                    top = rect.top;
                } else if (top > rect.bottom - proxyRect.height) {
                    top = rect.bottom - proxyRect.height
                }
            }

            me.dragProxyElement.style.left = `${left}px`;
            me.dragProxyElement.style.top  = `${top}px`;
        }

        if (!me.dragProxyElement || me.alwaysFireDragMove) {
            DomEvents.sendMessageToApp({
                ...me.getEventData(event),
                type: 'drag:move'
            });
        }
    }

    /**
     *
     * @param {Object} event
     */
    onDragStart(event) {
        let me   = this,
            rect = me.dragProxyRect = event.target.getBoundingClientRect();

        me.offsetX = event.detail.clientX - rect.left;
        me.offsetY = event.detail.clientY - rect.top;

        DomEvents.sendMessageToApp({
            ...this.getEventData(event),
            type: 'drag:start'
        });
    }

    /**
     *
     * @param {Object} data
     * @param {Number} data.clientX
     * @param {Number} data.clientY
     * @returns {Object}
     */
    scrollContainer(data) {
        let me     = this,
            deltaX = data.clientX - me.clientX,
            deltaY = data.clientY - me.clientY,
            el     = me.scrollContainerElement,
            gap    = 250,
            rect   = me.scrollContainerRect;

        me.clientX =  data.clientX;
        me.clientY =  data.clientY;

        if (
            (deltaX < 0 && data.clientX < rect.left  + gap) ||
            (deltaX > 0 && data.clientX > rect.right - gap)
        ) {
            el.scrollLeft += (deltaX * me.scrollFactorLeft);
        }

        if (
            (deltaY < 0 && data.clientY < rect.top    + gap) ||
            (deltaY > 0 && data.clientY > rect.bottom - gap)
        ) {
            el.scrollTop += (deltaY * me.scrollFactorTop);
        }

        return {
            clientX: me.clientX + el.scrollLeft - me.initialScrollLeft,
            clientY: me.clientY + el.scrollTop  - me.initialScrollTop
        };
    }

    /**
     *
     * @param {Object} data
     * @param {String} data.id
     */
    setBoundaryContainer(data) {
        let me   = this,
            node = data.id === 'document.body' ? document.body : document.getElementById(data.id);

        me.boundaryContainerRect = node.getBoundingClientRect();
    }

    /**
     *
     * @param {Object} data
     * @param {String} data.id
     */
    setDragProxyElement(data) {
        this.dragProxyElement = document.getElementById(data.id);
    }

    /**
     *
     * @param {Object} data
     * @param {String} data.id
     */
    setScrollContainer(data) {
        let me   = this,
            node = data.id === 'document.body' ? document.body : document.getElementById(data.id);

        Object.assign(me, {
            scrollContainerElement: node,
            scrollContainerRect   : node.getBoundingClientRect(),
            initialScrollLeft     : node.scrollLeft,
            initialScrollTop      : node.scrollTop
        });
    }

    /**
     *
     * @param {Object} data
     * @param {Number} data.value
     */
    setScrollFactorLeft(data) {
        this.scrollFactorLeft = data.value;
    }

    /**
     *
     * @param {Object} data
     * @param {Number} data.value
     */
    setScrollFactorTop(data) {
        this.scrollFactorTop = data.value;
    }
}

Neo.applyClassConfig(DragDrop);

let instance = Neo.create(DragDrop);

Neo.applyToGlobalNs(instance);

export default instance;