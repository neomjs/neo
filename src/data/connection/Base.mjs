import CoreBase   from '../../core/Base.mjs';
import Observable from '../../core/Observable.mjs';

/**
 * @class Neo.data.connection.Base
 * @extends Neo.core.Base
 * @mixes Neo.core.Observable
 */
class Base extends CoreBase {
    /**
     * True automatically applies the core.Observable mixin
     * @member {Boolean} observable=true
     * @static
     */
    static observable = true

    static config = {
        /**
         * @member {String} className='Neo.data.connection.Base'
         * @protected
         */
        className: 'Neo.data.connection.Base',
        /**
         * @member {String} ntype='connection'
         * @protected
         */
        ntype: 'connection',
        /**
         * The url to connect to
         * @member {String|null} url=null
         */
        url: null
    }

    /**
     * @param {Object} [params]
     * @returns {Promise<any>}
     */
    async read(params) {
        throw new Error('connection.Base: read() needs to get implemented in subclasses');
    }
}

export default Neo.setupClass(Base);
