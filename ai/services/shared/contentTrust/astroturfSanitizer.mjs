import {isTrustedTier} from './authorTrustClassifier.mjs';

/**
 * @summary Pure, trust-gated astroturf sanitizer for externally-authored GitHub content (organism self-defense).
 *
 * The empirical attack class: an outside automated account posts a credible, peer-toned technical
 * comment, then seeds a marketing payload — a traversable marketing URL, a *link-free* bare product
 * name, a vendor pitch carrying a reward-conditional engagement bait plus an offer to stand up an
 * external endpoint against our repo, or a self-promotional product introduction paired with
 * non-commercial and commercial-use licensing terms. Two harms: an agent traversing the URL walks
 * into a watering-hole / injection payload, and the comment is ingested into the KB (`resources/content/
 * issues/*.md`) — turning our corpus into an SEO / name-seeding link-farm.
 *
 * This function is the pure transform both boundaries will call (the `get_conversation` read path
 * and the KB ingestion path, in later wiring slices): it defangs URLs, redacts denylisted product
 * names, and FLAGS stealth-intent signals — all gated on the author NOT being a positively-recognized
 * trusted tier (per {@link isTrustedTier}); missing/unrecognized provenance fails closed (sanitized). It is
 * intentionally **non-mutating + side-effect-free**: it returns
 * a new string and never touches GitHub, local sync files, or the Memory Core (the read path must
 * never become a mutating moderation path).
 *
 * Signals are FLAGGED, not redacted: ambiguous technical terms keep their signal for human review;
 * only deterministic URLs and explicitly-denylisted names are rewritten — keep the technical
 * signal, just kill the link, extended to bare names for the link-free seeding variant.
 *
 * @see ./authorTrustClassifier.mjs (supplies the `tier` gate)
 * @see .agents/skills/hostile-content-quarantine (the moderation-response playbook this feeds)
 */

/**
 * Whole-URL matcher (scheme through first whitespace / bracket / quote). Domain is derived
 * separately so trailing punctuation in the raw match never corrupts the quarantine marker.
 * @type {RegExp}
 */
const URL_RE = /https?:\/\/[^\s<>()[\]"'`]+/gi;

/**
 * Markdown-link matcher — handled before bare URLs so the human-readable link text survives.
 * @type {RegExp}
 */
const MD_LINK_RE = /\[([^\]]+)]\(\s*(https?:\/\/[^\s)]+)\s*\)/gi;

/**
 * High-precision stealth-intent signal patterns. Deliberately narrow (low false-positive): each is
 * lifted from a documented incident, not a generic-spam heuristic. Matched against the ORIGINAL
 * content and surfaced as review flags — never auto-redacted.
 * @type {Array<{id: String, pattern: RegExp, note: String}>}
 */
const STEALTH_SIGNALS = [
    {
        id     : 'engagement-bait-reward-conditional',
        // "if this gets 15+ 👍 I'll index neo ..." — quid-pro-quo of an action for reactions.
        // No `\b` after the reaction group: an emoji (👍) is a non-word char, so a word boundary
        // never forms between it and a following space — the original `\b` there silently failed the match.
        pattern: /\bif\s+(?:this|it)\b[^.!?\n]{0,80}\b\d+\s*\+?\s*(?:👍|thumbs?\s*-?\s*ups?|upvotes?|reactions?|stars?|likes?)[^.!?\n]{0,80}\bi(?:'ll|\s+will)\b/i,
        note   : 'reward-conditional engagement bait (an action promised in exchange for reactions)'
    },
    {
        id     : 'external-endpoint-offer',
        // "stand up a hosted MCP endpoint" / "index your repo" — offering to run external infra on our content.
        pattern: /\b(?:host(?:ed)?|stand\s*up|spin\s*up|set\s*up|provide|offer)\b[^.!?\n]{0,60}\b(?:mcp\b|endpoint\b|index(?:ing)?\s+(?:your|the|this)\s+(?:repo|repository|codebase)\b)/i,
        note   : 'offer to stand up an external endpoint / index our repo (external-infra-on-our-content)'
    },
    {
        id     : 'maintainer-dual-licensing-terms',
        // Incident fixture: "I maintain <product> ... free for non-commercial use, while commercial
        // use requires separate permission." Require all three parts in one bounded sentence:
        // self-reference plus both licensing legs. Ordinary maintainer or licensing context stays clean.
        pattern: /\b(?:i|we)\s+(?:also\s+)?maintain\b(?=[^.!?\n]{0,120}\b(?:source[- ]available|free\s+for\s+non[- ]commercial\s+use)\b)(?=[^.!?\n]{0,120}\bcommercial\s+use\s+requires?\s+(?:(?:a\s+)?(?:separate|specific)\s+|a\s+)?(?:permission|licen[cs]e)\b)/i,
        note   : 'first-person product maintenance paired with non-commercial and commercial-use terms'
    }
];

/**
 * Derives a bare, traversal-safe domain from a URL for the quarantine marker.
 * @param {String} url
 * @returns {String}
 */
function domainOf(url) {
    return String(url)
        .replace(/^https?:\/\//i, '')
        .replace(/^www\./i, '')
        .split(/[/?#]/)[0]
        .replace(/[.,;:!?)\]]+$/, '') || 'unknown'
}

/**
 * Escapes a literal string for safe use inside a `RegExp`.
 * @param {String} value
 * @returns {String}
 */
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * @summary Trust-gated sanitization of a single content blob.
 *
 * Trusted-origin content (any roster / collaborator tier) is returned verbatim. External /
 * unclassified content is rewritten: markdown + bare URLs become `[QUARANTINED_URL: <domain>]`
 * (domain preserved for audit, traversability removed), and any denylisted product name becomes
 * `[external product name redacted]`. Stealth-intent signals are reported, not redacted.
 *
 * @param {String} content the raw comment / body text
 * @param {Object}   [opts]
 * @param {String}   [opts.tier] the author's `TRUST_TIERS` value (from {@link classifyAuthorTrust});
 *        when not external/unclassified the content passes through untouched
 * @param {String[]} [opts.productNameDenylist] known astroturf product names to redact (the
 *        link-free seeding variant). Injected — the denylist itself is config, resolved by callers.
 * @returns {{sanitized: String, redactions: Array<Object>, signals: Array<{id: String, note: String}>, wasModified: Boolean}}
 */
export function sanitizeContent(content, {tier, productNameDenylist = []} = {}) {
    if (typeof content !== 'string' || content.length === 0) {
        return {sanitized: typeof content === 'string' ? content : '', redactions: [], signals: [], wasModified: false}
    }

    // FAIL CLOSED: pass through ONLY for a positively-recognized trusted tier. A missing,
    // malformed, or unrecognized tier is treated as untrusted and sanitized — absent provenance
    // must never mean "trusted" at this boundary.
    if (isTrustedTier(tier)) {
        return {sanitized: content, redactions: [], signals: [], wasModified: false}
    }

    const redactions = [];
    let   sanitized  = content;

    // 1. Markdown links first — preserve the human-readable text, quarantine the target.
    sanitized = sanitized.replace(MD_LINK_RE, (match, text, url) => {
        const domain = domainOf(url);
        redactions.push({type: 'markdown-link', original: url, domain});
        return `${text} [QUARANTINED_URL: ${domain}]`
    });

    // 2. Bare URLs.
    sanitized = sanitized.replace(URL_RE, match => {
        const domain = domainOf(match);
        redactions.push({type: 'url', original: match, domain});
        return `[QUARANTINED_URL: ${domain}]`
    });

    // 3. Denylisted bare product names (link-free seeding).
    for (const name of productNameDenylist) {
        if (typeof name !== 'string' || !name.trim()) {
            continue
        }

        const nameRe = new RegExp(escapeRegExp(name.trim()), 'gi');

        if (nameRe.test(sanitized)) {
            sanitized = sanitized.replace(nameRe, '[external product name redacted]');
            redactions.push({type: 'product-name', original: name.trim()})
        }
    }

    // 4. Stealth-intent signals — flagged against the ORIGINAL content, never redacted.
    const signals = STEALTH_SIGNALS
        .filter(signal => signal.pattern.test(content))
        .map(signal => ({id: signal.id, note: signal.note}));

    return {sanitized, redactions, signals, wasModified: sanitized !== content}
}
