/**
 * @summary Parse an inbound Neural Link frame into its JSON-RPC message + an optional agent context.
 *
 * Backward-compatible envelope handling for the multi-writer enforcement transport. The Bridge
 * forwards either a bare JSON-RPC message (legacy / non-agent) or — now that the agent identity-transport
 * has landed — a `{type:'agent_message', agentId, sessionId, message}` sidecar. **This parser does not
 * authenticate**: it routes the frame and surfaces the agent context, but the trustworthiness of
 * `agentId` is established UPSTREAM by the Bridge connection-auth leaf (a token verification that retires
 * the self-claimed connection id) — not here. The `sessionId` is likewise Bridge-minted (one per
 * authenticated connection, stamped at `registerAgent`), not self-claimed. The Bridge auth + sidecar-emit
 * leaves have landed, so the sidecar is live. This returns the inner JSON-RPC plus the agent context so
 * `Neo.ai.Client` threads the Bridge-stamped `(agentId, sessionId)` pair to the write services for
 * topological-lock enforcement, while a legacy bare frame is dispatched exactly as before.
 *
 * It is deliberately pure (no Client, no socket): `Neo.ai.Client` is a connect-on-init singleton, so
 * keeping the parsing logic free of it makes the contract unit-testable — and it lets the Client learn
 * to unwrap the sidecar BEFORE the Bridge starts emitting it, so an `agent_message` arriving at a
 * Client that already understands it never breaks the live agent→app channel.
 *
 * @param {*} frame The parsed inbound WebSocket frame.
 * @returns {{jsonrpc: (Object|null), context: ({agentId: (String|null), sessionId: (String|null)}|null)}}
 *   `jsonrpc` is the JSON-RPC message to dispatch, or `null` if the frame carries none.
 *   `context` is `{agentId, sessionId}` for an `agent_message` — the enforcement keys on the
 *   `(agentId, sessionId)` writer pair, and a malformed / absent id yields `null` for that field so the
 *   write service fails closed rather than mutating — or `null` for a bare / legacy frame (non-agent,
 *   unenforced).
 */
export function parseAgentEnvelope(frame) {
    if (frame && typeof frame === 'object' && frame.type === 'agent_message') {
        const
            message   = frame.message,
            agentId   = (typeof frame.agentId   === 'string' && frame.agentId.length   > 0) ? frame.agentId   : null,
            sessionId = (typeof frame.sessionId === 'string' && frame.sessionId.length > 0) ? frame.sessionId : null;

        return {
            jsonrpc: (message && typeof message === 'object') ? message : null,
            context: {agentId, sessionId}
        }
    }

    // Bare JSON-RPC (legacy / non-agent) — unchanged, no agent context.
    return {
        jsonrpc: (frame && typeof frame === 'object') ? frame : null,
        context: null
    }
}
