import {
    classifyAuthorTrust,
    isTrustedTier
} from '../../shared/contentTrust/authorTrustClassifier.mjs';

/**
 * Pre-Flight (structural fast-path): `discussionRoutingDisposition.mjs` matches the pure,
 * no-I/O sibling helpers in this directory (`conversationTrust.mjs`, `contentPath.mjs`).
 * It is source-owned GitHub Workflow policy, not a graph scorer or diagnostic-script authority.
 *
 * @module ai/services/github-workflow/shared/discussionRoutingDisposition
 * @summary Classifies source-backed Discussion routing lifecycle without using age, `updatedAt`,
 * or comment activity as authority. The projection is intentionally small and typed so sync,
 * ingestion, diagnostics, and Golden Path can share one marker interpretation.
 */

export const DISCUSSION_ROUTING_DISPOSITIONS = Object.freeze({
    ACTIVE      : 'active',
    TERMINAL    : 'terminal',
    UNDETERMINED: 'undetermined'
});

/**
 * @summary Schema discriminator for coherent source-owned Discussion routing projections.
 * @type {String}
 */
export const DISCUSSION_ROUTING_DISPOSITION_SCHEMA_VERSION = 'discussion-routing-disposition.v1';

const ACTIVE_MARKERS = Object.freeze([
    'CONVERGING',
    'EVERGREEN',
    'GRADUATION_PROPOSED',
    'OQ_RESOLUTION_PENDING',
    'REVALIDATED',
    'REVALIDATION_PENDING'
]);

const TERMINAL_MARKERS = Object.freeze([
    'DECLINED',
    'DROPPED',
    'SUPERSEDED'
]);

const AUTHOR_UPDATE_RE              = /^>\s*\*{0,2}Update\s+\d{4}-\d{2}-\d{2}\b/i;
const NON_AUTHORITATIVE_SECTION_RES = Object.freeze([
    /^(?:history|historical|retrospectives?|archiv(?:e|ed|es)|examples?|instructions?|instructional|how(?:-|\s+)to|usage)\b/i,
    /\(\s*(?:historical|retrospective|archived?|examples?)\b/i
]);
const GRADUATED_CALLOUT_RES = Object.freeze([
    /^>\s*\*\*GRADUATED\*\*\s*\(\d{4}-\d{2}-\d{2}\):\s*This Discussion graduated to\s+(?:Epic|Ticket)\s+#\d+\b/i,
    /^>\s*\*\*Status:\s*GRADUATED\s+\d{4}-\d{2}-\d{2}\*\*[^\n]*\b(?:epic|ticket):?\s*#\d+\b/i
]);

const ACTIVE_EVIDENCE = new Set(ACTIVE_MARKERS.map(marker => `marker:${marker}`));

/**
 * @summary Compares one persisted evidence vector against the classifier's canonical ordered shape.
 * @param {String[]} evidence Actual evidence vector.
 * @param {String[]} expected Canonical evidence vector.
 * @returns {Boolean}
 */
function isExactEvidence(evidence, expected) {
    return evidence.length === expected.length && evidence.every((value, index) => value === expected[index])
}

/**
 * @summary Validates and normalizes one persisted lifecycle tuple. Current-schema tuples must be
 * semantically coherent across disposition, reason, and evidence; any missing, malformed, or
 * contradictory tuple degrades atomically to the legacy undetermined projection.
 * @param {Object} projection
 * @param {String} projection.schemaVersion
 * @param {String} projection.disposition
 * @param {String} projection.reasonCode
 * @param {String[]} projection.evidence
 * @returns {{schemaVersion: String, disposition: String, reasonCode: String, evidence: String[]}}
 */
export function normalizeDiscussionRoutingProjection({
    schemaVersion,
    disposition,
    reasonCode,
    evidence
} = {}) {
    const hasValidShape = schemaVersion === DISCUSSION_ROUTING_DISPOSITION_SCHEMA_VERSION &&
        Object.values(DISCUSSION_ROUTING_DISPOSITIONS).includes(disposition) &&
        typeof reasonCode === 'string' && reasonCode.length > 0 &&
        Array.isArray(evidence) && evidence.every(value => typeof value === 'string') &&
        new Set(evidence).size === evidence.length;
    let coherent = false;

    if (hasValidShape && disposition === DISCUSSION_ROUTING_DISPOSITIONS.ACTIVE) {
        coherent = reasonCode === 'explicit-active-marker' &&
            evidence.length > 0 &&
            evidence.every(value => ACTIVE_EVIDENCE.has(value))
    } else if (hasValidShape && disposition === DISCUSSION_ROUTING_DISPOSITIONS.TERMINAL) {
        if (reasonCode === 'github-closed') {
            coherent = isExactEvidence(evidence, ['github:closed'])
        } else if (reasonCode === 'graduated-to-ticket') {
            coherent = evidence.length === 1 && [
                'marker:GRADUATED_TO_TICKET',
                'callout:GRADUATED'
            ].includes(evidence[0])
        } else {
            const match = reasonCode.match(/^terminal-marker:(declined|dropped|superseded)$/);
            coherent = Boolean(match) && isExactEvidence(evidence, [`marker:${match[1].toUpperCase()}`])
        }
    } else if (hasValidShape && disposition === DISCUSSION_ROUTING_DISPOSITIONS.UNDETERMINED) {
        coherent = (
            ['untrusted-or-unclassified-root-author', 'no-authoritative-lifecycle-marker'].includes(reasonCode) &&
            evidence.length === 0
        ) || (
            reasonCode === 'resolved-scope-without-terminal-signal' &&
            isExactEvidence(evidence, ['marker:RESOLVED_TO_AC'])
        )
    }

    return coherent ? {
        schemaVersion,
        disposition,
        reasonCode,
        evidence: [...evidence]
    } : {
        schemaVersion: 'discussion-routing-disposition.legacy',
        disposition  : DISCUSSION_ROUTING_DISPOSITIONS.UNDETERMINED,
        reasonCode   : 'legacy-or-invalid-projection',
        evidence     : []
    }
}

/**
 * @summary Normalizes a possible lifecycle marker line while preserving marker order.
 * @param {String} line Source Markdown line.
 * @returns {String} Trimmed line without presentation prefixes.
 */
function normalizeMarkerLine(line) {
    return String(line || '')
        .replace(/^\s*#{1,6}\s*/, '')
        // Preserve `_` inside machine markers such as `GRADUATED_TO_TICKET`.
        // Removing it before matching was the old diagnostic's silent false-negative class.
        .replace(/[*`]/g, '')
        .trim()
}

/**
 * @summary Returns true only when a line uses a marker as current lifecycle data, rather than
 * mentioning its syntax in prose or graduation criteria.
 * @param {String} line Source Markdown line.
 * @param {String} marker Marker name without brackets.
 * @returns {Boolean}
 */
function isLifecycleMarkerLine(line, marker) {
    const sourceLine = String(line || '');
    const isAuthorUpdate = AUTHOR_UPDATE_RE.test(sourceLine);

    const
        normalized = normalizeMarkerLine(sourceLine.replace(AUTHOR_UPDATE_RE, 'Update ')),
        escaped     = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        markerRe    = new RegExp(`\\[${escaped}(?::[^\\]]*)?\\]`, 'i'),
        statusRe    = new RegExp(`^(?:Status:\\s*)?\\[${escaped}(?::[^\\]]*)?\\]`, 'i'),
        oqBound     = /(?:\bOQ\s*\d+\b|\bOpen Question\b)/i.test(normalized);

    if (!markerRe.test(normalized)) return false;
    if (/^\s*>/.test(sourceLine) && !isAuthorUpdate) return false;
    if (isAuthorUpdate) return true;

    if (marker === 'GRADUATED_TO_TICKET' || TERMINAL_MARKERS.includes(marker)) {
        // Whole-Discussion terminal authority is deliberately stricter than per-OQ marker evidence:
        // a current Status/bare/heading marker classifies; a bullet, criterion, or prose mention does not.
        return statusRe.test(normalized)
    }

    if (marker === 'OQ_RESOLUTION_PENDING' || marker === 'RESOLVED_TO_AC') {
        return statusRe.test(normalized) || oqBound
    }

    // Active whole-Discussion signals are authoritative only in a current status/bare-marker
    // shape, or when explicitly bound to an OQ. Prose that merely names marker syntax, including
    // negated or future instructions, is not lifecycle data.
    return statusRe.test(normalized) || oqBound
}

/**
 * @summary Parses a Markdown fence delimiter. A close delimiter must use the same character,
 * contain at least the opener's run length, and carry no info string.
 * @param {String} line Markdown source line.
 * @returns {{character: String, length: Number, tail: String}|null}
 */
function parseFenceDelimiter(line) {
    const match = String(line || '').match(/^\s*(`{3,}|~{3,})(.*)$/);

    return match ? {
        character: match[1][0],
        length   : match[1].length,
        tail     : match[2]
    } : null
}

/**
 * @summary Parses one ATX or Setext Markdown heading for section-authority tracking.
 * @param {String} line Markdown source line.
 * @param {String} [nextLine] Following Markdown source line for Setext underlines.
 * @returns {{level: Number, title: String}|null}
 */
function parseSectionHeading(line, nextLine) {
    const
        sourceLine = String(line || ''),
        atxMatch   = sourceLine.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);

    if (atxMatch) {
        return {
            level: atxMatch[1].length,
            title: atxMatch[2].replace(/[*`_]/g, '').trim()
        }
    }

    const setextMatch = String(nextLine || '').match(/^\s{0,3}(=+|-+)\s*$/);

    return setextMatch && sourceLine.trim() && !/^\s*>/.test(sourceLine) ? {
        level: setextMatch[1][0] === '=' ? 1 : 2,
        title: sourceLine.replace(/[*`_]/g, '').trim()
    } : null
}

/**
 * @summary Returns true for explicitly historical, retrospective, archived, example, or instructional sections.
 * Their complete Markdown subtree is evidence, not current whole-Discussion lifecycle authority.
 * @param {String} title Normalized heading title.
 * @returns {Boolean}
 */
function isNonAuthoritativeSection(title) {
    return NON_AUTHORITATIVE_SECTION_RES.some(pattern => pattern.test(title))
}

/**
 * @summary Finds authoritative lifecycle markers in a trusted Discussion body.
 * @param {String} body Discussion body.
 * @returns {String[]} Marker names in source order, de-duplicated.
 */
function findLifecycleMarkers(body) {
    const found = [];
    let   fence = null,
          nonAuthoritativeSectionLevel = null;

    const lines = String(body || '').split(/\r?\n/);

    for (let index = 0; index < lines.length; index++) {
        const line      = lines[index];
        const delimiter = parseFenceDelimiter(line);

        if (fence) {
            if (
                delimiter &&
                delimiter.character === fence.character &&
                delimiter.length >= fence.length &&
                delimiter.tail.trim() === ''
            ) {
                fence = null
            }
            continue
        }

        if (delimiter) {
            fence = delimiter;
            continue
        }

        const heading = parseSectionHeading(line, lines[index + 1]);

        if (heading) {
            if (
                nonAuthoritativeSectionLevel !== null &&
                heading.level <= nonAuthoritativeSectionLevel
            ) {
                nonAuthoritativeSectionLevel = null
            }

            if (
                nonAuthoritativeSectionLevel === null &&
                isNonAuthoritativeSection(heading.title)
            ) {
                nonAuthoritativeSectionLevel = heading.level
            }
        }

        if (nonAuthoritativeSectionLevel !== null) continue;

        if (GRADUATED_CALLOUT_RES.some(pattern => pattern.test(line)) && !found.includes('GRADUATED_CALLOUT')) {
            found.push('GRADUATED_CALLOUT')
        }

        for (const marker of [
            'GRADUATED_TO_TICKET',
            ...TERMINAL_MARKERS,
            ...ACTIVE_MARKERS,
            'RESOLVED_TO_AC'
        ]) {
            if (isLifecycleMarkerLine(line, marker) && !found.includes(marker)) {
                found.push(marker)
            }
        }
    }

    return found
}

/**
 * @summary Classifies one GitHub Discussion into the source-owned routing disposition.
 *
 * Precedence is deliberate: GitHub closure and explicit terminal markers win; an explicit active
 * marker then keeps partially-resolved Discussions live; per-OQ resolution without an explicit
 * whole-Discussion terminal signal remains `undetermined`; all other states remain `undetermined`.
 * Raw timestamps never participate. Marker-bearing content
 * from an untrusted root author cannot manufacture either active or terminal routing state.
 *
 * @param {Object} discussion Source Discussion/frontmatter projection.
 * @param {String} [discussion.author] GitHub login when `authorTrust` is not already projected.
 * @param {String} [discussion.authorTrust] Precomputed content-trust tier.
 * @param {String} [discussion.body] Root Discussion body (comments are intentionally excluded).
 * @param {Boolean} [discussion.closed] GitHub lifecycle fact.
 * @returns {{schemaVersion: String, disposition: String, reasonCode: String, evidence: String[]}}
 */
export function classifyDiscussionRoutingDisposition({
    author,
    authorTrust,
    body = '',
    closed = false
} = {}) {
    if (closed === true || String(closed).toLowerCase() === 'true') {
        return {
            schemaVersion: DISCUSSION_ROUTING_DISPOSITION_SCHEMA_VERSION,
            disposition  : DISCUSSION_ROUTING_DISPOSITIONS.TERMINAL,
            reasonCode   : 'github-closed',
            evidence     : ['github:closed']
        }
    }

    const trustTier = authorTrust || classifyAuthorTrust(author);

    if (!isTrustedTier(trustTier)) {
        return {
            schemaVersion: DISCUSSION_ROUTING_DISPOSITION_SCHEMA_VERSION,
            disposition  : DISCUSSION_ROUTING_DISPOSITIONS.UNDETERMINED,
            reasonCode   : 'untrusted-or-unclassified-root-author',
            evidence     : []
        }
    }

    const markers = findLifecycleMarkers(body);

    if (markers.includes('GRADUATED_TO_TICKET') || markers.includes('GRADUATED_CALLOUT')) {
        return {
            schemaVersion: DISCUSSION_ROUTING_DISPOSITION_SCHEMA_VERSION,
            disposition  : DISCUSSION_ROUTING_DISPOSITIONS.TERMINAL,
            reasonCode   : 'graduated-to-ticket',
            evidence     : markers.includes('GRADUATED_TO_TICKET')
                ? ['marker:GRADUATED_TO_TICKET']
                : ['callout:GRADUATED']
        }
    }

    const terminalMarker = markers.find(marker => TERMINAL_MARKERS.includes(marker));
    if (terminalMarker) {
        return {
            schemaVersion: DISCUSSION_ROUTING_DISPOSITION_SCHEMA_VERSION,
            disposition  : DISCUSSION_ROUTING_DISPOSITIONS.TERMINAL,
            reasonCode   : `terminal-marker:${terminalMarker.toLowerCase()}`,
            evidence     : [`marker:${terminalMarker}`]
        }
    }

    const activeMarkers = markers.filter(marker => ACTIVE_MARKERS.includes(marker));
    if (activeMarkers.length > 0) {
        return {
            schemaVersion: DISCUSSION_ROUTING_DISPOSITION_SCHEMA_VERSION,
            disposition  : DISCUSSION_ROUTING_DISPOSITIONS.ACTIVE,
            reasonCode   : 'explicit-active-marker',
            evidence     : activeMarkers.map(marker => `marker:${marker}`)
        }
    }

    if (markers.includes('RESOLVED_TO_AC')) {
        return {
            schemaVersion: DISCUSSION_ROUTING_DISPOSITION_SCHEMA_VERSION,
            disposition  : DISCUSSION_ROUTING_DISPOSITIONS.UNDETERMINED,
            reasonCode   : 'resolved-scope-without-terminal-signal',
            evidence     : ['marker:RESOLVED_TO_AC']
        }
    }

    return {
        schemaVersion: DISCUSSION_ROUTING_DISPOSITION_SCHEMA_VERSION,
        disposition  : DISCUSSION_ROUTING_DISPOSITIONS.UNDETERMINED,
        reasonCode   : 'no-authoritative-lifecycle-marker',
        evidence     : []
    }
}

export {findLifecycleMarkers, isLifecycleMarkerLine};
