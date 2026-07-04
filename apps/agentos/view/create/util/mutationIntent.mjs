/**
 * @module AgentOS.view.create.util.mutationIntent
 * @summary Bounded, fail-closed parser + target resolver for keeper follow-up mutations.
 *
 * This module is the create-flow sibling of the first-widget childapp's edit grammar: short natural
 * language follow-ups become schema-allowlisted mutation partials, never executable code, and target
 * phrases resolve through the created-instance registry instead of walking the component tree. It is
 * deliberately deterministic until the NL boundary lands: unknown wording refuses with a reason, and
 * ambiguous titles refuse rather than guessing which live instance to mutate.
 */

const
    DEFAULT_LARGE_HEIGHT = 520,
    DEFAULT_SMALL_HEIGHT = 320,
    DEFAULT_LARGE_WIDTH  = 720,
    DEFAULT_SMALL_WIDTH  = 420,
    MAX_REQUEST_LENGTH   = 240,
    MAX_TITLE_LENGTH     = 80;

/**
 * @summary Mutation intake refusal stages.
 * @type {Object}
 */
export const MUTATION_INTENT_STAGES = Object.freeze({
    REQUEST: 'request',
    TARGET : 'target'
});

/**
 * @param {String} value
 * @returns {String}
 */
function cleanTitle(value) {
    return value.trim().replace(/^["']|["']$/g, '').replace(/\s+/g, ' ')
}

/**
 * @param {String} value
 * @returns {String}
 */
function normalizeTitle(value) {
    return cleanTitle(value).toLowerCase()
}

/**
 * @param {String} value
 * @returns {String}
 */
function titleCase(value) {
    return cleanTitle(value).replace(/\w\S*/g, word => word[0].toUpperCase() + word.slice(1).toLowerCase())
}

/**
 * @param {String} phrase
 * @returns {Object}
 */
function selectorFromPhrase(phrase='') {
    const cleaned = cleanTitle(phrase).toLowerCase();

    if (!cleaned || ['it', 'this', 'the grid', 'grid'].includes(cleaned)) {
        return {}
    }

    if (phrase.startsWith('"') || phrase.startsWith("'")) {
        return {title: cleanTitle(phrase)}
    }

    const titled = cleanTitle(phrase).replace(/^the\s+/i, '');

    return titled ? {title: titleCase(titled)} : {}
}

/**
 * @param {String} rawTitle
 * @returns {{accepted: Boolean, title: String|null, reason: String|null}}
 */
function parseNewTitle(rawTitle) {
    const title = cleanTitle(rawTitle);

    if (!title) {
        return {accepted: false, title: null, reason: 'New title is empty.'}
    }

    if (title.length > MAX_TITLE_LENGTH) {
        return {accepted: false, title: null, reason: `Title is too long (max ${MAX_TITLE_LENGTH} characters).`}
    }

    return {accepted: true, title, reason: null}
}

/**
 * @param {String} rawRows
 * @returns {{accepted: Boolean, data: Object[]|null, reason: String|null}}
 */
function parseRows(rawRows) {
    let data;

    try {
        data = JSON.parse(rawRows)
    } catch (error) {
        return {accepted: false, data: null, reason: 'Data rows must be a JSON array of row objects.'}
    }

    if (!Array.isArray(data)) {
        return {accepted: false, data: null, reason: 'Data rows must be a JSON array.'}
    }

    if (data.some(row => row == null || typeof row !== 'object' || Array.isArray(row))) {
        return {accepted: false, data: null, reason: 'Data rows must contain only row objects.'}
    }

    return {accepted: true, data, reason: null}
}

/**
 * Parses one follow-up mutation intent into a registry selector plus a schema-allowlisted mutation.
 *
 * @param {String} text
 * @returns {{accepted: true, selector: Object, mutation: Object, stage: null, reason: null}|{accepted: false, selector: null, mutation: null, stage: String, reason: String}}
 */
export function parseMutationIntent(text) {
    if (typeof text !== 'string') {
        return {accepted: false, selector: null, mutation: null, reason: 'Mutation intent must be text.', stage: MUTATION_INTENT_STAGES.REQUEST}
    }

    const trimmed = text.trim();

    if (!trimmed) {
        return {accepted: false, selector: null, mutation: null, reason: 'Mutation intent is empty — type a follow-up change.', stage: MUTATION_INTENT_STAGES.REQUEST}
    }

    if (trimmed.length > MAX_REQUEST_LENGTH) {
        return {accepted: false, selector: null, mutation: null, reason: `Mutation intent is too long (max ${MAX_REQUEST_LENGTH} characters).`, stage: MUTATION_INTENT_STAGES.REQUEST}
    }

    if (/[<>]/.test(trimmed)) {
        return {accepted: false, selector: null, mutation: null, reason: 'Mutation intent must be plain text (no markup).', stage: MUTATION_INTENT_STAGES.REQUEST}
    }

    let match = trimmed.match(/^make\s+(.+?)\s+(taller|shorter|wider|narrower|bigger|larger|smaller)$/i);

    if (match) {
        const
            selector = selectorFromPhrase(match[1]),
            size     = match[2].toLowerCase(),
            config   = {};

        if (size === 'taller') {
            config.height = DEFAULT_LARGE_HEIGHT
        } else if (size === 'shorter') {
            config.height = DEFAULT_SMALL_HEIGHT
        } else if (size === 'wider') {
            config.width = DEFAULT_LARGE_WIDTH
        } else if (size === 'narrower') {
            config.width = DEFAULT_SMALL_WIDTH
        } else if (size === 'smaller') {
            config.height = DEFAULT_SMALL_HEIGHT;
            config.width  = DEFAULT_SMALL_WIDTH
        } else {
            config.height = DEFAULT_LARGE_HEIGHT;
            config.width  = DEFAULT_LARGE_WIDTH
        }

        return {accepted: true, selector, mutation: {config}, reason: null, stage: null}
    }

    match = trimmed.match(/^(?:rename|retitle)\s+(?:(.+?)\s+)?to\s+(.+)$/i);

    if (match) {
        const title = parseNewTitle(match[2]);

        if (!title.accepted) {
            return {accepted: false, selector: null, mutation: null, reason: title.reason, stage: MUTATION_INTENT_STAGES.REQUEST}
        }

        return {accepted: true, selector: selectorFromPhrase(match[1] || ''), mutation: {title: title.title}, reason: null, stage: null}
    }

    match = trimmed.match(/^(?:replace|set)\s+(?:(.+?)\s+)?(?:data\s+rows|rows|data)\s+(?:with|to)\s+(.+)$/i);

    if (match) {
        const rows = parseRows(match[2]);

        if (!rows.accepted) {
            return {accepted: false, selector: null, mutation: null, reason: rows.reason, stage: MUTATION_INTENT_STAGES.REQUEST}
        }

        return {accepted: true, selector: selectorFromPhrase(match[1] || ''), mutation: {data: rows.data}, reason: null, stage: null}
    }

    return {
        accepted: false,
        selector: null,
        mutation: null,
        reason  : 'Unknown mutation. Try "make it taller", "rename it to Q3 Metrics", or "replace data with [{\\"item\\":\\"A\\"}]".',
        stage   : MUTATION_INTENT_STAGES.REQUEST
    }
}

/**
 * Resolves a parsed mutation selector against the created-instance registry.
 *
 * @param {Object} options
 * @param {Object} options.registry CreatedInstances singleton or test double
 * @param {Object} [options.selector={}]
 * @returns {{accepted: Boolean, record: Object|null, reason: String|null, stage: String|null}}
 */
export function resolveMutationTarget({registry, selector={}} = {}) {
    if (!registry || typeof registry.resolveTarget !== 'function') {
        return {accepted: false, record: null, reason: 'created-instance registry unavailable', stage: MUTATION_INTENT_STAGES.TARGET}
    }

    if (selector.instanceId) {
        const record = registry.resolveTarget({instanceId: selector.instanceId});

        return record
            ? {accepted: true, record, reason: null, stage: null}
            : {accepted: false, record: null, reason: `No created instance found for "${selector.instanceId}".`, stage: MUTATION_INTENT_STAGES.TARGET}
    }

    if (selector.title) {
        const
            expected = normalizeTitle(selector.title),
            matches  = [];

        registry.items?.forEach(record => {
            if (record.state === 'live' && normalizeTitle(record.title) === expected) {
                matches.push(record)
            }
        });

        if (matches.length > 1) {
            const names = matches.map(record => `${record.instanceId} (${record.title})`).join(', ');

            return {
                accepted: false,
                record  : null,
                reason  : `Target title "${selector.title}" is ambiguous: ${names}. Name a more specific target.`,
                stage   : MUTATION_INTENT_STAGES.TARGET
            }
        }

        if (matches.length === 1) {
            return {accepted: true, record: matches[0], reason: null, stage: null}
        }

        return {accepted: false, record: null, reason: `No live created instance titled "${selector.title}".`, stage: MUTATION_INTENT_STAGES.TARGET}
    }

    const record = registry.resolveTarget({});

    return record
        ? {accepted: true, record, reason: null, stage: null}
        : {accepted: false, record: null, reason: 'No live created instance to mutate yet.', stage: MUTATION_INTENT_STAGES.TARGET}
}
