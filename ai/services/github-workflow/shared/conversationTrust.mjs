import {classifyAuthorTrust} from '../../shared/contentTrust/authorTrustClassifier.mjs';
import {sanitizeContent}     from '../../shared/contentTrust/astroturfSanitizer.mjs';

/**
 * @summary Read-boundary trust projection for GitHub conversation payloads (organism self-defense wiring).
 *
 * The issue / pull-request / discussion `getConversation` services fetch GitHub-authored payloads
 * verbatim, so an agent reading a hostile external comment would receive traversable marketing /
 * watering-hole URLs inline. This helper projects a fetched conversation into its trust-aware shape:
 * every authored node (the root body, each comment, each nested discussion reply) gains an
 * `authorTrust` tier, untrusted-author `body` text is sanitized (URL defang, optional denylist
 * redaction, stealth-intent flags), and the root gains an always-present `contentTrust` summary so
 * consumers can distinguish "projected and clean" from "not projected at all".
 *
 * The purity contract mirrors the substrate it consumes: no I/O, no mutation of the input payload —
 * the projection returns new objects, and structured-error payloads (`{error, ...}`) pass through
 * untouched so the services' error contracts stay intact. Trusted-origin content is byte-identical
 * after projection; only the additive `authorTrust` / `contentTrust` keys appear.
 *
 * @see ../../shared/contentTrust/authorTrustClassifier.mjs (tier resolution; fail-closed)
 * @see ../../shared/contentTrust/astroturfSanitizer.mjs (the pure trust-gated transform)
 */

/**
 * @summary Creates the machine-readable summary accumulated by content trust projection.
 * @returns {{projected: Boolean, quarantined: Number, signals: Object[]}}
 */
export function createContentTrustSummary() {
    return {projected: true, quarantined: 0, signals: []}
}

/**
 * Projects one authored node (`{author, body, ...}`): stamps `authorTrust`, sanitizes an untrusted
 * author's `body`, and records redaction counts plus stealth-intent signals against `path`.
 * Non-object nodes pass through untouched so sparse / null GraphQL entries never change shape.
 * @param {Object} node a GitHub node carrying optional `author.login` and `body`
 * @param {Object} ctx  `{collaborators, productNameDenylist, summary}` shared projection context
 * @param {String} path signal location label (e.g. `body`, `comment:<id>`)
 * @returns {Object} a new node object (or the input verbatim for non-objects)
 */
function projectNode(node, ctx, path) {
    if (!node || typeof node !== 'object') {
        return node
    }

    const tier      = classifyAuthorTrust(node.author?.login, {collaborators: ctx.collaborators});
    const projected = {...node, authorTrust: tier};

    if (typeof node.body === 'string' && node.body.length > 0) {
        const {sanitized, redactions, signals, wasModified} = sanitizeContent(node.body, {
            tier,
            productNameDenylist: ctx.productNameDenylist
        });

        if (wasModified) {
            projected.body           = sanitized;
            ctx.summary.quarantined += redactions.length
        }

        signals.forEach(signal => ctx.summary.signals.push({at: path, id: signal.id, note: signal.note}))
    }

    return projected
}

/**
 * @summary Projects one authored GitHub node through the shared content-trust policy.
 * @param {Object} node The authored node carrying optional `author.login` and `body`.
 * @param {Object} [opts]
 * @param {Set<String>|String[]} [opts.collaborators] repo collaborator logins for REPO_TRUSTED.
 * @param {String[]} [opts.productNameDenylist] product names redacted from untrusted content.
 * @param {Object} [opts.summary] Existing summary accumulator; created when omitted.
 * @param {String} [opts.path='body'] Signal location label.
 * @returns {{node: Object, contentTrust: Object}} Projected node plus the summary accumulator.
 */
export function projectAuthoredNodeTrust(node, {
    collaborators,
    productNameDenylist = [],
    summary = createContentTrustSummary(),
    path = 'body'
} = {}) {
    return {
        node        : projectNode(node, {collaborators, productNameDenylist, summary}, path),
        contentTrust: summary
    }
}

/**
 * @summary Projects a fetched conversation payload into its trust-aware shape.
 *
 * Apply BEFORE selector filtering so every return path (full conversation plus all selector shapes)
 * inherits projected nodes. Covers the root authored body, `comments.nodes`, and nested
 * `replies.nodes` (discussions). Null resources and structured-error payloads pass through
 * untouched, preserving the calling services' not-found and error contracts.
 *
 * @param {Object}               conversation the GraphQL resource (issue / pullRequest / discussion)
 * @param {Object}               [opts]
 * @param {Set<String>|String[]} [opts.collaborators] repo collaborator logins for REPO_TRUSTED
 *        classification. Injectable by design and never fetched here; omitted, classification is
 *        roster-only and unknown authors fail closed to the external tier.
 * @param {String[]}             [opts.productNameDenylist] denylisted product names, config-resolved
 *        by callers once a curated list exists; the sanitizer's own default applies meanwhile.
 * @returns {Object} a new, projected conversation — or the input untouched for error / non-object payloads
 */
export function projectConversationTrust(conversation, {collaborators, productNameDenylist = []} = {}) {
    if (!conversation || typeof conversation !== 'object' || conversation.error) {
        return conversation
    }

    const summary = createContentTrustSummary();
    const ctx     = {collaborators, productNameDenylist, summary};

    const projected = projectNode(conversation, ctx, 'body');

    if (Array.isArray(conversation.comments?.nodes)) {
        projected.comments = {
            ...conversation.comments,
            nodes: conversation.comments.nodes.map(comment => {
                const path             = `comment:${comment?.id || 'unknown'}`;
                const projectedComment = projectNode(comment, ctx, path);

                if (Array.isArray(comment?.replies?.nodes)) {
                    projectedComment.replies = {
                        ...comment.replies,
                        nodes: comment.replies.nodes.map(reply =>
                            projectNode(reply, ctx, `${path}/reply:${reply?.id || 'unknown'}`))
                    }
                }

                return projectedComment
            })
        }
    }

    projected.contentTrust = summary;

    return projected
}
