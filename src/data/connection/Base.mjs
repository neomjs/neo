import BaseCore from '../../core/Base.mjs';

/**
 * @class Neo.data.connection.Base
 * @extends Neo.core.Base
 */
class Base extends BaseCore {
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
