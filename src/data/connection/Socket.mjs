import Base       from '../../core/Base.mjs';
import Observable from '../../core/Observable.mjs';

/**
 * @class Neo.data.connection.WebSocket
 * @extends Neo.core.Base
 */
class Socket extends Base {
    /**
     * @member {String|null} serverAddress=null
     */
    serverAddress = null

    static getStaticConfig() {return {
        /**
         * True automatically applies the core.Observable mixin
         * @member {Boolean} observable=true
         * @static
         */
        observable: true
    }}

    static getConfig() {return {
        /**
         * @member {String} className='Neo.data.connection.WebSocket'
         * @protected
         */
        className: 'Neo.data.connection.WebSocket',
        /**
         * @member {String} ntype='socket-connection'
         * @protected
         */
        ntype: 'socket-connection',
        /**
         * @member {WebSocket|null} socket_=null
         * @protected
         */
        socket_: null
    }}

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.socket = new WebSocket(this.serverAddress);
    }

    /**
     * Triggered before the socket config gets changed.
     * @param {WebSocket|null} value
     * @param {WebSocket|null} oldValue
     * @returns {WebSocket|null}
     * @protected
     */
    beforeSetSocket(value, oldValue) {
        if (value) {
            let me = this;

            Object.assign(value, {
                onclose  : me.onClose.bind(me),
                onerror  : me.onError.bind(me),
                onmessage: me.onMessage.bind(me)
            });
        }

        return value;
    }

    /**
     * @param {CloseEvent} event The Websocket generated CloseEvent
     * @param {Number}     event.code The WebSocket connection close code provided by the server
     *
     *        Code        Name                  Description
     *        0-999                             Reserved and not used.
     *        1000        CLOSE_NORMAL          Normal closure; the connection successfully completed whatever purpose for which it was created.
     *        1001        CLOSE_GOING_AWAY      The endpoint is going away, either because of a server failure or because the browser is navigating away from the page that opened the connection.
     *        1002        CLOSE_PROTOCOL_ERROR  The endpoint is terminating the connection due to a protocol error.
     *        1003        CLOSE_UNSUPPORTED     The connection is being terminated because the endpoint received data of a type it cannot accept (for example, a text-only endpoint received binary data).
     *        1004        CLOSE_TOO_LARGE       The endpoint is terminating the connection because a data frame was received that is too large.
     *        1005        CLOSE_NO_STATUS       Reserved.  Indicates that no status code was provided even though one was expected.
     *        1006        CLOSE_ABNORMAL        Reserved. Used to indicate that a connection was closed abnormally (that is, with no close frame being sent) when a status code is expected.
     *        1007-1999                         Reserved for future use by the WebSocket standard.
     *        2000-2999                         Reserved for use by WebSocket extensions.
     *        3000-3999                         Available for use by libraries and frameworks. May not be used by applications.
     *        4000-4999                         Available for use by applications.
     *
     * @param {String}     reason A string indicating the reason the server closed the connection. This is specific to the particular server and sub-protocol.
     * @param {Boolean}    wasClean Indicates whether or not the connection was cleanly closed.
     */
    onClose(event, reason, wasClean) {
        console.log('onClose', event, reason, wasClean);
    }

    /**
     *
     */
    onError() {
        console.log('onError', arguments);
    }

    /**
     * @param {Object} event
     */
    onMessage(event) {
        console.log('onMessage', event);
    }
}

Neo.applyClassConfig(Socket);

export default Socket;
