import Neo       from '../Neo.mjs';
import Base      from './Base.mjs';
import * as core from '../core/_export.mjs';

/**
 * Experimental.
 * The Canvas worker is responsible for dynamically manipulating offscreen canvas.
 * See: https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas
 * @class Neo.worker.Canvas
 * @extends Neo.worker.Base
 * @singleton
 */
class Canvas extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.worker.Canvas'
         * @protected
         */
        className: 'Neo.worker.Canvas',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {String} workerId='canvas'
         * @protected
         */
        workerId: 'canvas'
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        console.log('worker.Canvas ctor', this);
    }
}

Neo.applyClassConfig(Canvas);

let instance = Neo.create(Canvas);

Neo.applyToGlobalNs(instance);

export default instance;
