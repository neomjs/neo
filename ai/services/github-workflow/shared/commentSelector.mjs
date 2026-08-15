/**
 * Addressing ONE comment, in whichever spelling the caller actually has.
 *
 * The point of `comment_id` is that a peer hand-off is cheap — "read issuecomment-5301580683" rather
 * than "read the thread". That only works if the id a peer HAS is the id the tool accepts, and the id
 * a peer has is almost never the GraphQL node ID: it is the anchor at the end of a pasted URL, the
 * URL itself, or the bare number. Accepting only the node ID made the parameter documented and
 * unusable, and its failure was silent — an unrecognised id filtered every comment away and returned
 * an empty list, which reads as "this comment has nothing" rather than "you addressed it wrong".
 *
 * So this module answers two questions the services previously answered with one strict equality:
 * what did the caller mean, and does a given comment match it. Both are pure, so the whole matrix is
 * testable without a network.
 */

/**
 * @summary The spellings accepted for `comment_id` / `since_comment_id`, phrased for an error message.
 * @type {String}
 */
export const ACCEPTED_COMMENT_ID_FORMS = [
    'a GraphQL node ID (IC_kwDO…, DC_kwDO…)',
    'the numeric database id (18022679)',
    'a URL anchor (issuecomment-18022679, discussioncomment-18022679)',
    'a full comment URL ending in one of those anchors'
].join(', ');

const
    // A node ID is opaque base64-ish text with a type prefix. Deliberately loose: GitHub owns this
    // vocabulary and mints new prefixes, so pinning the known ones would reject tomorrow's valid id.
    NODE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_-]+$/u,
    NUMERIC_PATTERN = /^\d+$/u,
    // `issuecomment-N`, `discussioncomment-N`, `pullrequestreviewcomment-N`. Matched at the END so a
    // full URL reduces to the same case rather than needing its own parser.
    ANCHOR_PATTERN  = /(?:^|#)([a-z]*comment)-(\d+)$/iu;

/**
 * @summary Resolves any accepted spelling into a matcher descriptor.
 *
 * Order matters, and numeric is checked before the node pattern for a reason: a bare `18022679` is
 * unambiguous, while a permissive node-ID pattern must never be allowed to swallow it.
 *
 * @param {*} raw The caller-supplied id.
 * @returns {{kind: 'node', nodeId: String}|{kind: 'numeric', databaseId: String}|null} `null` when no
 *     accepted spelling matches — the malformed case, which callers turn into an explicit error
 *     rather than an empty result.
 */
export function parseCommentId(raw) {
    if (typeof raw !== 'string') {
        return null
    }

    const value = raw.trim();

    if (!value) {
        return null
    }

    if (NUMERIC_PATTERN.test(value)) {
        return {kind: 'numeric', databaseId: value}
    }

    const anchor = value.match(ANCHOR_PATTERN);

    if (anchor) {
        return {kind: 'numeric', databaseId: anchor[2]}
    }

    // Checked last: a URL that did NOT end in a comment anchor is a link to something else (the issue
    // itself, a commit, a file), and admitting it as an opaque node ID would turn a caller's wrong
    // link into a silent empty result — the defect this module exists to remove.
    if (!value.includes('/') && !value.includes('#') && NODE_ID_PATTERN.test(value)) {
        return {kind: 'node', nodeId: value}
    }

    return null
}

/**
 * @summary Whether one comment node is the one the selector addresses.
 *
 * The numeric arm needs `databaseId` on the node, which is why the conversation queries select it.
 * A node missing it simply does not match rather than throwing: a query that forgot the field
 * degrades to "no match" (visible, and caught by the absent-vs-malformed distinction) instead of
 * taking the request down.
 *
 * @param {Object} comment  A comment node.
 * @param {Object} selector A {@link parseCommentId} result.
 * @returns {Boolean}
 */
export function commentMatches(comment, selector) {
    if (!comment || !selector) {
        return false
    }

    return selector.kind === 'node'
        ? comment.id === selector.nodeId
        : comment.databaseId != null && String(comment.databaseId) === selector.databaseId
}

/**
 * @summary The structured error for an id in no accepted spelling.
 *
 * Malformed is reported, never silently filtered. The old behaviour — an empty comment list — cost a
 * caller a full re-fetch of the thread to discover a typo, which is the exact expense the addressed
 * fetch exists to avoid.
 *
 * @param {String} field The parameter name, so the message names what the caller passed.
 * @param {*}      raw   The offending value.
 * @returns {Object} A structured MCP error payload.
 */
export function malformedCommentIdError(field, raw) {
    return {
        error  : 'Bad Request',
        message: `'${field}' is not a recognised comment id: ${JSON.stringify(raw)}. Accepted: ${ACCEPTED_COMMENT_ID_FORMS}.`,
        code   : 'MALFORMED_COMMENT_ID'
    }
}

/**
 * @summary Strips the parent body from a SCOPED conversation payload.
 *
 * A scoped request asks for part of a thread and was charged for all of it: fetching one 2KB comment
 * out of a 26KB discussion cost the same as reading the head. The body is therefore omitted exactly
 * when a selector narrowed the request, and untouched otherwise — an unscoped `get_conversation`
 * keeps its shape, so nothing that reads the head today has to change.
 *
 * `bodyOmitted` is set rather than the field silently vanishing: a consumer that finds no `body` must
 * be able to tell "scoped away" from "this thread has an empty body".
 *
 * @param {Object} conversation The projected conversation.
 * @returns {Object}
 */
export function omitScopedBody(conversation) {
    const {body, ...rest} = conversation || {};

    return {...rest, bodyOmitted: true}
}
