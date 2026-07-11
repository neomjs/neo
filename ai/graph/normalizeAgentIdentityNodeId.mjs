/**
 * @module Neo.ai.graph.normalizeAgentIdentityNodeId
 * @summary Canonicalizes direct AgentIdentity graph-node identifiers without absorbing
 * mailbox-specific addressing grammar.
 */

/**
 * @summary Normalizes a direct AgentIdentity identifier to the canonical `@<identity>` graph-node form.
 *
 * String inputs are trimmed, a missing `@` is added, and redundant leading `@` characters collapse
 * to one. Namespace-bearing values such as `AGENT:*`, `role:*`, and `human:*` are returned unchanged:
 * those are addressing schemes, not direct AgentIdentity node ids, and remain owned by their service
 * layer. Non-string inputs pass through unchanged so this primitive never invents an identity by
 * stringifying an unrelated value.
 *
 * @param {*} identity Candidate direct AgentIdentity id or bare identity handle.
 * @returns {*} Canonical direct AgentIdentity id, unchanged addressing scheme, or unchanged non-string.
 */
export function normalizeAgentIdentityNodeId(identity) {
    if (typeof identity !== 'string') return identity;

    const value = identity.trim();
    if (!value || value.includes(':')) return value;

    const bareIdentity = value.replace(/^@+/, '');
    return bareIdentity ? `@${bareIdentity}` : '@';
}
