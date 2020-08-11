import Base from '../../core/Base.mjs';

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
     * @param {Object} event
     */
    onDragEnd(event) {
        console.log('onDragEnd', event);
    }

    /**
     *
     * @param {Object} event
     */
    onDragMove(event) {
        console.log('onDragMove', event);
    }

    /**
     *
     * @param {Object} event
     */
    onDragStart(event) {
        console.log('onDragStart', event);
    }
}

Neo.applyClassConfig(DragDrop);

let instance = Neo.create(DragDrop);

Neo.applyToGlobalNs(instance);

export default instance;