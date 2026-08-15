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
    // CURRENT node ID: an UPPERCASE type prefix, an underscore, then base64url. `IC_kwDODSospM4hM0EW`.
    //
    // The uppercase prefix is the entire guard, and deliberately so. An earlier draft allowed any
    // leading letter, which admitted `not_an_id` and `bogus_123` as "node IDs" and degraded them to
    // well-formed-but-absent instead of rejecting them, which is the silent-empty class this module
    // exists to close, arriving through its own grammar.
    // A length floor was tried alongside it and removed: it rejected no real id, closed nothing the
    // case rule does not already close, and only broke short fixtures. Guards should be the property
    // that actually discriminates, not that property plus a plausible-looking companion.
    //
    // `ABC_xyz` remains admissible by construction: GitHub owns this namespace, so a well-formed id
    // we cannot resolve is exactly the "absent from this thread" case, which returns empty comments.
    NODE_ID_PATTERN        = /^[A-Z]{1,10}_[A-Za-z0-9_-]{3,}$/u,
    // LEGACY node ID: base64 of `NN:TypeNameNNN`, e.g. `MDEyOklzc3VlQ29tbWVudDU1NzAwNzEyNg==` →
    // `012:IssueComment557007126`. Still live and resolvable, so it is admitted by DECODING and
    // checking the payload rather than by pattern-matching base64 — "looks base64" would readmit the
    // arbitrary-junk class the uppercase guard above exists to close.
    LEGACY_PAYLOAD_PATTERN = /^\d{2,}:[A-Za-z]+\d+$/u,
    NUMERIC_PATTERN        = /^\d+$/u,
    // A CLOSED prefix set, not `[a-z]*comment`. The open form matched `evilcomment-123` and handed
    // back numeric 123 — an id outside the accepted vocabulary silently becoming a valid selector.
    // Matched at the END so a full URL reduces to this case rather than needing its own parser.
    ANCHOR_PATTERN         = /(?:^|#)(?:issue|discussion|pullrequestreview)comment-(\d+)$/iu;

/**
 * @summary Whether a string is a LEGACY GitHub node ID, proven by decoding it.
 *
 * `atob`-style decode, then require the payload to be `NN:TypeNameNNN`. Anything that fails to
 * decode, or decodes to something else, is not a node ID — which keeps the admitted set closed
 * while still accepting a form GitHub currently resolves.
 *
 * @param {String} value Candidate id.
 * @returns {Boolean}
 * @private
 */
function isLegacyNodeId(value) {
    // A legacy id is base64; anything with URL or anchor punctuation is a different shape entirely.
    if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(value)) {
        return false
    }

    let decoded;

    try {
        decoded = Buffer.from(value, 'base64').toString('utf8')
    } catch {
        return false
    }

    // Round-trip guard: base64 decoding is lenient and will happily consume a string that is not a
    // faithful encoding, so a payload that does not re-encode to the input was never this id.
    if (Buffer.from(decoded, 'utf8').toString('base64') !== value) {
        return false
    }

    return LEGACY_PAYLOAD_PATTERN.test(decoded)
}

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
        return {kind: 'numeric', databaseId: anchor[1]}
    }

    // Checked last: a URL that did NOT end in a comment anchor is a link to something else (the issue
    // itself, a commit, a file), and admitting it as an opaque node ID would turn a caller's wrong
    // link into a silent empty result — the defect this module exists to remove.
    if (value.includes('/') || value.includes('#')) {
        return null
    }

    if (NODE_ID_PATTERN.test(value) || isLegacyNodeId(value)) {
        return {kind: 'node', nodeId: value}
    }

    return null
}

/**
 * @summary Whether the caller SUPPLIED a selector, independent of whether its value is usable.
 *
 * Presence, not truthiness. The three services previously branched on `if (comment_id)`, so an
 * empty string skipped the selector path entirely and returned the full unscoped conversation — a
 * caller who addressed a comment with a blank value got the whole thread and no error, which is the
 * exact silent-wrong-answer this module exists to remove.
 *
 * Presence must invoke parsing; parsing decides validity.
 *
 * @param {*} value Candidate selector argument.
 * @returns {Boolean}
 */
export function isSelectorPresent(value) {
    return value !== undefined && value !== null
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
