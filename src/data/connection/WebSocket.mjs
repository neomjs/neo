import Base                from '../../core/Base.mjs';
import {createInterceptor} from '../../util/Function.mjs';
import Observable          from '../../core/Observable.mjs';

/**
 * @class Neo.data.connection.WebSocket
 * @extends Neo.core.Base
 */
class Socket extends Base {
    /**
     * True automatically applies the core.Observable mixin
     * @member {Boolean} observable=true
     * @static
     */
    static observable = true

    static config = {
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
    }

    /**
     * @member {String|null} channel=null
     */
    channel = null
    /**
     * @member {Number} maxReconnectAttempts=5
     */
    maxReconnectAttempts = 5
    /**
     * @member {Object} messageCallbacks={}
     * @protected
     */
    messageCallbacks = {}
    /**
     * @member {Number} messageId=1
     * @protected
     */
    messageId = 1
    /**
     * @member {Number} reconnectAttempts=0
     * @protected
     */
    reconnectAttempts = 0
    /**
     * @member {String|null} serverAddress=null
     */
    serverAddress = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.createSocket();
    }

    /**
     * @param {Function} callback
     * @param {Object} scope
     */
    attemptReconnect(callback, scope) {
        let me = this;

        me.reconnectAttempts++;

        if (me.reconnectAttempts < me.maxReconnectAttempts) {
            me.createSocket();

            callback && me.on('open', {
                callback,
                scope : scope || me,
                single: true
            });
        }
    }

    /**
     * Intercepts the WebSocket send calls
     * @param {Object} data
     * @returns {String}
     */
    beforeSend(data) {
        let me      = this,
            channel = me.channel;

        console.log('WS: Sending message', (channel ? '\nChannel: ' + channel : ''), '\nData:', data);

        return JSON.stringify(channel ? {channel, data} : data);
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
                onclose  : me.onClose  .bind(me),
                onerror  : me.onError  .bind(me),
                onmessage: me.onMessage.bind(me),
                onopen   : me.onOpen   .bind(me)
            });

            createInterceptor(value, 'send', me.beforeSend, me);
        }

        return value;
    }

    /**
     * @param {Number} [code] defaults to 1000
     * @param {String} [reason]
     */
    close(code, reason) {
        this.socket.close(code, reason);
    }

    /**
     *
     */
    createSocket() {
        this.socket = new WebSocket(this.serverAddress);
    }

    /**
     *
     */
    destroy(...args) {
        this.close();
        super.destroy(...args);
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
     * @param {MessageEvent} event
     */
    onMessage(event) {
        let me   = this,
            data = JSON.parse(event.data);

        console.log('onMessage', data);

        if (data.mId) {
            me.messageCallbacks[data.mId].resolve(data.data);
            delete me.messageCallbacks[data.mId];
        }
    }

    /**
     *
     */
    onOpen() {
        this.fire('open', {scope: this});
    }

    /**
     * @param {Object} data
     * @returns {Promise<any>}
     */
    promiseMessage(data) {
        let me = this;

        return new Promise((resolve, reject) => {
            me.messageCallbacks[me.messageId] = {reject, resolve};

            me.sendMessage({data, mId: me.messageId});
            me.messageId++;
        });
    }

    /**
     * @param {Object} data
     */
    sendMessage(data) {
        let me     = this,
            socket = me.socket,
            d      = data;

        // CONNECTING  0   The connection is not yet open.
        // OPEN        1   The connection is open and ready to communicate.
        // CLOSING     2   The connection is in the process of closing.
        // CLOSED      3   The connection is closed or couldn't be opened.

        // If socket is not yet ready let's defer to open then resend
        switch (socket.readyState) {
            case WebSocket.CLOSED:
            case WebSocket.CLOSING:
                me.attemptReconnect(function() {
                    me.sendMessage(d);
                });
                break;
            case WebSocket.CONNECTING:
                me.on('open', function() {
                    me.sendMessage(d);
                }, me, {single: true});
                break;
            case WebSocket.OPEN:
                socket.send(data);
                break;
        }
    }
}

Neo.setupClass(Socket);

export default Socket;
