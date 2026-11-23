/**
 * @module Neo.examples.workbench.formatConfig
 * @summary Pure helpers that format component configs as source and URL-serialize the changed ones.
 */

const
    JSON_NUMBER_RE      = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/,
    PROTO_CHAIN_KEYS    = new Set(['__proto__', 'constructor', 'prototype']),
    VALID_IDENTIFIER_RE = /^[a-zA-Z_$][\w$]*$/;

/**
 * @summary Copies the plain objects and arrays of an authored config and keeps classes, functions and instances by
 * reference, so `Neo.create()` can consume the original while the copy stays as the author wrote it.
 * @param {*} value
 * @returns {*}
 */
export function cloneConfig(value) {
    const type = Neo.typeOf(value);

    if (type === 'Array') {
        return value.map(cloneConfig)
    }

    if (type === 'Object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneConfig(item)]))
    }

    return value
}

/**
 * @summary Escapes a string literal as valid single-quoted Neo config source.
 * @param {String} value
 * @returns {String}
 */
export function formatConfigString(value) {
    const escaped = value
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');

    return `'${escaped}'`
}

/**
 * @summary Formats an object key as a bare identifier when valid JS syntax, otherwise single-quoted.
 * @param {String} key
 * @returns {String}
 */
export function formatConfigKey(key) {
    return VALID_IDENTIFIER_RE.test(key) ? key : formatConfigString(key)
}

/**
 * @summary Returns a human-readable omission reason if a value is or contains a function or live Neo instance.
 * @param {*} value
 * @param {Set<*>} [seen]
 * @returns {String|null}
 */
export function describeNonLiteralReason(value, seen=new Set()) {
    const type = Neo.typeOf(value);

    if (type === 'Function') {
        return 'a function, not shown'
    }

    if (type === 'NeoInstance') {
        return `a ${value.className || 'Neo'} instance, not shown`
    }

    if (type === 'Array' || type === 'Object') {
        if (seen.has(value)) {
            return 'a cyclic value, not shown'
        }

        seen.add(value);
        const children = type === 'Array' ? value : Object.values(value);

        for (const item of children) {
            if (describeNonLiteralReason(item, seen)) {
                return 'contains non-literal values, not shown'
            }
        }
    }

    return null
}

/**
 * @summary Returns why one value cannot be written as source where it sits: a function, a live Neo instance, or a
 * container that is one of its own ancestors. Null for anything else, plain objects and arrays included: they format
 * entry by entry, so a function inside one costs a comment line, not the whole value.
 * @param {*} value
 * @param {Set<Object>} ancestors The objects and arrays currently being formatted around `value`
 * @returns {String|null}
 */
function describeUnwritableReason(value, ancestors) {
    const type = Neo.typeOf(value);

    if (type === 'Function') {
        return 'a function, not shown'
    }

    if (type === 'NeoInstance') {
        return `a ${value.className || 'Neo'} instance, not shown`
    }

    if ((type === 'Array' || type === 'Object') && ancestors.has(value)) {
        return 'a cyclic value, not shown'
    }

    return null
}

/**
 * @summary Formats a Neo config value into valid indented JavaScript source. A function or live instance inside an
 * object or array becomes a comment line where it sits.
 * @param {*} value
 * @param {Number} [indent=4]
 * @param {Set<Object>} [ancestors=new Set()] The objects and arrays being formatted around `value`
 * @returns {String}
 */
export function formatConfigValue(value, indent=4, ancestors=new Set()) {
    const
        type = Neo.typeOf(value),
        pad  = ' '.repeat(indent);

    if (value === null)      return 'null';
    if (value === undefined) return 'undefined';

    if (type === 'String')   return formatConfigString(value);
    if (type === 'Number' || type === 'Boolean') return String(value);
    if (type === 'Date')     return `new Date(${formatConfigString(value.toISOString())})`;
    if (type === 'RegExp')   return String(value);
    if (type === 'NeoClass') return value.prototype?.className || 'null';

    if (type === 'Array' || type === 'Object') {
        const entries = type === 'Array' ? value.map(item => [null, item]) : Object.entries(value);

        if (entries.length === 0) return type === 'Array' ? '[]' : '{}';

        const
            childPad = ' '.repeat(indent + 4),
            comments = [],
            written  = [];

        ancestors.add(value);

        entries.forEach(([key, item]) => {
            const reason = describeUnwritableReason(item, ancestors);

            if (reason) {
                comments.push(`${childPad}// ${key === null ? '' : `${key}: `}${reason}`)
            } else {
                written.push([key === null ? null : formatConfigKey(key), formatConfigValue(item, indent + 4, ancestors)])
            }
        });

        ancestors.delete(value);

        const
            keyPad        = Math.max(0, ...written.map(([key]) => key?.length || 0)),
            lines         = written.map(([key, source]) => `${childPad}${key === null ? '' : `${key.padEnd(keyPad, ' ')}: `}${source}`),
            body          = [lines.join(',\n'), ...comments].filter(Boolean).join('\n'),
            [open, close] = type === 'Array' ? ['[', ']'] : ['{', '}'];

        return `${open}\n${body}\n${pad}${close}`
    }

    return String(value)
}

/**
 * @summary Builds evaluable Neo config source from a class name and configs. A function or live instance becomes a
 * comment line where it sits, at the top level or nested.
 * @param {String|null} className
 * @param {Object} [configs={}]
 * @returns {String}
 */
export function formatExampleCode(className, configs={}) {
    if (!className && Object.keys(configs).length === 0) {
        return '{\n}'
    }

    const
        ancestors = new Set([configs]),
        entries   = [['module', className || 'Neo.component.Base']],
        comments  = [];

    Object.entries(configs).forEach(([key, value]) => {
        const reason = describeUnwritableReason(value, ancestors);

        if (reason) {
            comments.push(`    // ${key}: ${reason}`)
        } else {
            entries.push([formatConfigKey(key), formatConfigValue(value, 4, ancestors)])
        }
    });

    const
        keyPad = Math.max(...entries.map(([key]) => key.length)),
        lines  = entries.map(([key, formattedValue]) => `    ${key.padEnd(keyPad, ' ')}: ${formattedValue}`),
        body   = [lines.join(',\n'), ...comments].filter(Boolean).join('\n');

    return `{\n${body}\n}`
}

/**
 * @summary Checks whether a value is a JSON-safe config literal free of prototype-chain keys.
 * @param {*} value
 * @returns {Boolean}
 */
function isJsonSafeLiteral(value) {
    if (value === null || typeof value === 'boolean' || typeof value === 'string') {
        return true
    }

    if (typeof value === 'number') {
        return Number.isFinite(value)
    }

    const type = Neo.typeOf(value);

    if (type === 'Array') {
        return value.every(isJsonSafeLiteral)
    }

    if (type === 'Object') {
        for (const key of Object.keys(value)) {
            if (PROTO_CHAIN_KEYS.has(key) || !isJsonSafeLiteral(value[key])) {
                return false
            }
        }
        return true
    }

    return false
}

/**
 * @summary Encodes one JSON-safe config value as a compact unambiguous hash token.
 * @param {*} value
 * @returns {String}
 */
function encodeConfigToken(value) {
    if (value === null || typeof value === 'boolean' || typeof value === 'number') {
        return String(value)
    }

    if (typeof value === 'string') {
        const collidesWithLiteral =
            value === 'true' ||
            value === 'false' ||
            value === 'null' ||
            JSON_NUMBER_RE.test(value) ||
            value.startsWith('"') ||
            value.startsWith('[') ||
            value.startsWith('{');

        return collidesWithLiteral ? JSON.stringify(value) : value
    }

    return JSON.stringify(value)
}

/**
 * @summary Serializes changed literal configs into deterministic `key=value` URL hash parameters.
 * @param {Object} [changedConfigs={}]
 * @param {Set<String>|null} [excludedKeys=null]
 * @returns {String}
 */
export function serializeConfigParams(changedConfigs={}, excludedKeys=null) {
    if (!changedConfigs || typeof changedConfigs !== 'object') {
        return ''
    }

    const params = [];

    Object.keys(changedConfigs).sort().forEach(key => {
        if (!key || PROTO_CHAIN_KEYS.has(key) || excludedKeys?.has?.(key)) {
            return
        }

        const value = changedConfigs[key];

        if (value === undefined || describeNonLiteralReason(value) || !isJsonSafeLiteral(value)) {
            return
        }

        params.push(`${encodeURIComponent(key)}=${encodeURIComponent(encodeConfigToken(value))}`)
    });

    return params.join('&')
}

/**
 * @summary Parses URL hash parameters back into typed config literals, skipping unsafe or malformed entries.
 * @param {String} [hashString='']
 * @param {Set<String>|null} [excludedKeys=null]
 * @returns {Object}
 */
export function parseConfigParams(hashString='', excludedKeys=null) {
    const parsed = {};

    if (typeof hashString !== 'string') {
        return parsed
    }

    const clean = hashString.replace(/^#/, '');

    if (!clean) {
        return parsed
    }

    for (const segment of clean.split('&')) {
        const eqIndex = segment.indexOf('=');

        if (eqIndex <= 0) {
            continue
        }

        let key, rawValue;

        try {
            key      = decodeURIComponent(segment.slice(0, eqIndex));
            rawValue = decodeURIComponent(segment.slice(eqIndex + 1))
        } catch {
            continue
        }

        if (!key || PROTO_CHAIN_KEYS.has(key) || excludedKeys?.has?.(key)) {
            continue
        }

        let value;

        if (rawValue === 'true') {
            value = true
        } else if (rawValue === 'false') {
            value = false
        } else if (rawValue === 'null') {
            value = null
        } else if (JSON_NUMBER_RE.test(rawValue)) {
            value = Number(rawValue);
            if (!Number.isFinite(value)) continue
        } else if (rawValue.startsWith('"') || rawValue.startsWith('[') || rawValue.startsWith('{')) {
            try {
                value = JSON.parse(rawValue)
            } catch {
                continue
            }
            if (!isJsonSafeLiteral(value)) continue
        } else {
            value = rawValue
        }

        parsed[key] = value
    }

    return parsed
}
