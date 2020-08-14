import Base                     from '../../core/Base.mjs';
import DomEvents                from '../DomEvents.mjs';
import {default as MouseSensor} from '../draggable/sensor/Mouse.mjs';

/**
 * @class Neo.main.addon.DragDrop
 * @extends Neo.core.Base
 * @singleton
 */
class DragDrop extends Base {
    static getConfig() {
        return {
            /**
             * @member {String} className='Neo.main.addon.DragDrop'
             * @protected
             */
            className: 'Neo.main.addon.DragDrop',
            /**
             * @member {HTMLElement|null} dragProxyElement=null
             * @protected
             */
            dragProxyElement: null,
            /**
             * @member {Number} clientX=0
             */
            clientX: 0,
            /**
             * @member {Number} clientY=0
             */
            clientY: 0,
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
                    'setDragProxyElement',
                    'setScrollContainer'
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
             * @member {Boolean} singleton=true
             * @protected
             */
            singleton: true
        }
    }

    /**
     * @param {Object} config
     */
    constructor(config) {
        super(config);
        this.addGlobalEventListeners();

        // testing
        const mouseSensor = Neo.create({
            module: MouseSensor
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
        const e = {
            ...DomEvents.getEventData(event.detail.originalEvent),
            clientX: event.detail.clientX,
            clientY: event.detail.clientY
        };

        e.targetPath = e.path;
        e.path       = event.path.map(e => DomEvents.getTargetData(e))

        return e;
    }

    /**
     *
     * @param {Object} event
     */
    onDragEnd(event) {
        let me = this;

        Object.assign(me, {
            dragProxyElement      : null,
            scrollContainerElement: null,
            scrollContainerRect   : null
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
        let me = this,
            data;

        if (me.scrollContainerElement) {
            data = me.scrollContainer({
                clientX: event.detail.clientX,
                clientY: event.detail.clientY
            });

            event.detail.clientX = data.clientX;
            event.detail.clientY = data.clientY;
        }

        if (me.dragProxyElement) {
            me.dragProxyElement.style.left = `${event.detail.clientX - me.offsetX}px`;
            me.dragProxyElement.style.top  = `${event.detail.clientY - me.offsetY}px`;
        }

        DomEvents.sendMessageToApp({
            ...me.getEventData(event),
            type: 'drag:move'
        });
    }

    /**
     *
     * @param {Object} event
     */
    onDragStart(event) {
        let me   = this,
            rect = event.target.getBoundingClientRect();

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
            el.scrollLeft += (deltaX * 3); // todo: scrollFactorLeft
        }

        if (
            (deltaY < 0 && data.clientY < rect.top    + gap) ||
            (deltaY > 0 && data.clientY > rect.bottom - gap)
        ) {
            el.scrollTop += deltaY;
        }

        return {
            clientX: me.clientX + el.scrollLeft,
            clientY: me.clientY + el.scrollTop
        };
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
        let me = this;

        me.scrollContainerElement = document.getElementById(data.id);
        me.scrollContainerRect    = me.scrollContainerElement.getBoundingClientRect();
    }
}

Neo.applyClassConfig(DragDrop);

let instance = Neo.create(DragDrop);

Neo.applyToGlobalNs(instance);

export default instance;