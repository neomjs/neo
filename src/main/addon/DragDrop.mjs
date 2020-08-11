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

    getEventData(event) {
        return {
            ...DomEvents.getEventData(event.detail.originalEvent),
            clientX: event.clientX,
            clientY: event.clientY
        };
    }

    /**
     *
     * @param {Object} event
     */
    onDragEnd(event) {
        DomEvents.sendMessageToApp({
            ...this.getEventData(event),
            type: 'drag:end'
        });
    }

    /**
     *
     * @param {Object} event
     */
    onDragMove(event) {
        DomEvents.sendMessageToApp({
            ...this.getEventData(event),
            type: 'drag:move'
        });
    }

    /**
     *
     * @param {Object} event
     */
    onDragStart(event) {
        DomEvents.sendMessageToApp({
            ...this.getEventData(event),
            type: 'drag:start'
        });
    }
}

Neo.applyClassConfig(DragDrop);

let instance = Neo.create(DragDrop);

Neo.applyToGlobalNs(instance);

export default instance;