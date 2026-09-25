/**
 * @summary A stand-in for the global `WebSocket`, so a `Neo.ai.Client` unit spec never dials the Neural Link bridge.
 * @description Creating `Neo.ai.Client` creates a `Neo.data.connection.WebSocket`, and that wrapper calls
 * `new WebSocket(serverAddress)` at once. Under Node the global dials a real socket, so a spec that creates the
 * client would connect to whatever listens on the bridge port, on a developer machine a live bridge. Install this
 * class on `globalThis.WebSocket` before the client is created and restore the original afterwards.
 *
 * `readyState` is the input `Client#isConnected` reads. A spec that needs a connected or a closed client sets it on
 * the wrapper's `socket` (or swaps `client.socket` for a double carrying one), never on the client.
 */
export default class UnitTestWebSocket {
    static CLOSED     = 3
    static CLOSING    = 2
    static CONNECTING = 0
    static OPEN       = 1

    readyState = UnitTestWebSocket.OPEN

    /**
     * @param {String} serverAddress
     */
    constructor(serverAddress) {
        this.serverAddress = serverAddress
    }

    /**
     * Mirrors a browser socket: closing moves `readyState` to `CLOSED`, so `Client#isConnected` reads false.
     */
    close() {
        this.readyState = UnitTestWebSocket.CLOSED
    }

    /**
     * Frames go nowhere; the specs assert on the client's own send methods.
     */
    send() {}
}
