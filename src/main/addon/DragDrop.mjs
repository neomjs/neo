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
             * @member {String|null} dragProxyId=null
             * @protected
             */
            dragProxyId: null,
            /**
             * Remote method access for other workers
             * @member {Object} remote
             * @protected
             */
            remote: {
                app: [
                    'setDragProxyId'
                ]
            },
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

    /**
     *
     * @param {Object} data
     */
    setDragProxyId(data) {
        console.log('setDragProxyId', data);
    }
}

Neo.applyClassConfig(DragDrop);

let instance = Neo.create(DragDrop);

Neo.applyToGlobalNs(instance);

export default instance;