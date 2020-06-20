import Base from '../../core/Base.mjs';

/**
 * @class Neo.data.connection.Socket
 * @extends Neo.core.Base
 */
class Socket extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.data.connection.Socket'
         * @protected
         */
        className: 'Neo.data.connection.Socket',
        /**
         * @member {String} ntype='socket-connection'
         * @protected
         */
        ntype: 'socket-connection'
    }}
}

Neo.applyClassConfig(Socket);

export {Socket as default};