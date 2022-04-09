import Base from '../../core/Base.mjs';

/**
 * @class Neo.data.connection.Fetch
 * @extends Neo.core.Base
 */
class Fetch extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.data.connection.Fetch'
         * @protected
         */
        className: 'Neo.data.connection.Fetch'
    }}
}

Neo.applyClassConfig(Fetch);

export default Fetch;
