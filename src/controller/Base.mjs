import CoreBase    from '../core/Base.mjs';
import HashHistory from '../util/HashHistory.mjs';

/**
 * @class Neo.controller.Base
 * @extends Neo.core.Base
 */
class Base extends CoreBase {
    static getStaticConfig() {return {
        /**
         * True automatically applies the core/Observable.mjs mixin
         * @member {Boolean} observable=true
         */
        observable: true
    }}

    static getConfig() {return {
        /**
         * @member {String} className='Neo.controller.Base'
         * @protected
         */
        className: 'Neo.controller.Base',
        /**
         * @member {String} ntype='controller'
         * @protected
         */
        ntype: 'controller'
    }}

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        HashHistory.on('change', this.onHashChange, this);
    }

    /**
     * @param args
     */
    destroy(...args) {
        HashHistory.un('change', this.onHashChange, this);

        super.destroy(...args);
    }

    /**
     * Placeholder method which gets triggered when the hash inside the browser url changes
     * @param {Object} value
     * @param {Object} oldValue
     */
    onHashChange(value, oldValue) {

    }

    /**
     *
     */
    onConstructed() {
        let currentHash = HashHistory.first();

        currentHash && this.onHashChange(currentHash, null);

        super.onConstructed();
    }
}

Neo.applyClassConfig(Base);

export default Base;
