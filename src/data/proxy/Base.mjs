import Base       from '../../core/Base.mjs';
import Observable from '../../core/Observable.mjs';

/**
 * @class Neo.data.proxy.Base
 * @extends Neo.core.Base
 * @mixes Neo.core.Observable
 */
class Proxy extends Base {
    /**
     * True automatically applies the core.Observable mixin
     * @member {Boolean} observable=true
     * @static
     */
    static observable = true

    static config = {
        /**
         * @member {String} className='Neo.data.proxy.Base'
         * @protected
         */
        className: 'Neo.data.proxy.Base',
        /**
         * @member {String} ntype='proxy'
         * @protected
         */
        ntype: 'proxy',
        /**
         * @member {String|null} url=null
         */
        url: null
    }

    /**
     * @param {Object} operation
     * @returns {Promise}
     */
    read(operation) {
        return Promise.reject('read method not implemented');
    }
}

export default Neo.setupClass(Proxy);
