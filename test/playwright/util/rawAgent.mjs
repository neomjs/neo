import WebSocket from 'ws';

/**
 * Opens a raw `role=agent` WebSocket connection to the live Neural Link Bridge — a writer identity
 * DISTINCT from the fixture's primary `ConnectionService` writer. The Bridge accepts a `role=agent&id=`
 * connection (no token = dev path), mints a per-connection `sessionId`, and stamps the `agent_message`
 * sidecar on every forward, so writes from this socket carry the `(agentId, sessionId)` pair the
 * `WriteGuard` keys locks on — i.e. a genuinely separate writer for multi-writer / disconnect-release proofs.
 *
 * Shared by the WriteGuard live e2es (`WriteGuardMultiWriterNL`, `WriteGuardDisconnectReleaseNL`). Pass the
 * fixture-derived `neuralLink.bridgePort` so the raw writer targets the SAME Bridge the fixture connected
 * (or spawned) on, rather than a hardcoded `:8081` literal.
 *
 * @param {Number} port    The live Bridge port — pass `neuralLink.bridgePort`.
 * @param {String} agentId A distinct agent id for this writer.
 * @returns {Promise<{call: Function, close: Function}>} A thin client: `call(targetSessionId, method, params)`
 * resolves with the App Worker's id-matched response (success or jsonrpc error); `close()` drops the socket.
 */
export async function openRawAgent(port, agentId) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}?role=agent&id=${encodeURIComponent(agentId)}`);

    await new Promise((resolve, reject) => {
        ws.on('open',  resolve);
        ws.on('error', reject);
    });

    let nextId = 1;

    return {
        /**
         * Sends a JSON-RPC method to the target App Worker over this raw agent socket and resolves with the
         * App Worker's response (success or jsonrpc error), matched by request id, tolerating a bare frame
         * or a `{message: <response>}` envelope.
         * @param {String} targetSessionId
         * @param {String} method
         * @param {Object} params
         * @returns {Promise<Object>}
         */
        call(targetSessionId, method, params) {
            const id = nextId++;
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    ws.off('message', onMessage);
                    reject(new Error(`raw-agent call ${method} (#${id}) timed out`));
                }, 15000);

                const onMessage = data => {
                    let frame;
                    try { frame = JSON.parse(data.toString()); } catch { return; }
                    const msg = frame?.message ?? frame;
                    if (msg && msg.id === id) {
                        clearTimeout(timer);
                        ws.off('message', onMessage);
                        resolve(msg);
                    }
                };

                ws.on('message', onMessage);
                ws.send(JSON.stringify({
                    target : targetSessionId,
                    message: { jsonrpc: '2.0', method, params, id }
                }));
            });
        },

        /** Closes the raw agent socket — the Bridge `agent_disconnected` sweep then releases any held locks. */
        close() {
            ws.close();
        }
    };
}
