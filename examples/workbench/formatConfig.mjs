/**
 * @module Neo.examples.workbench.formatConfig
 * @summary Pure helpers that format changed component configs into evaluable Neo config source.
 */

const VALID_IDENTIFIER_RE = /^[a-zA-Z_$][\w$]*$/;

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
 * @summary Formats a literal Neo config value into valid indented JavaScript source.
 * @param {*} value
 * @param {Number} [indent=4]
 * @returns {String}
 */
export function formatConfigValue(value, indent=4) {
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

    if (type === 'Array') {
        if (value.length === 0) return '[]';

        const
            childPad = ' '.repeat(indent + 4),
            items    = value.map(item => `${childPad}${formatConfigValue(item, indent + 4)}`);

        return `[\n${items.join(',\n')}\n${pad}]`
    }

    if (type === 'Object') {
        const entries = Object.entries(value);

        if (entries.length === 0) return '{}';

        const
            childPad = ' '.repeat(indent + 4),
            keyPad   = Math.max(...entries.map(([key]) => formatConfigKey(key).length)),
            lines    = entries.map(([key, item]) => {
                const formattedKey = formatConfigKey(key).padEnd(keyPad, ' ');
                return `${childPad}${formattedKey}: ${formatConfigValue(item, indent + 4)}`
            });

        return `{\n${lines.join(',\n')}\n${pad}}`
    }

    return String(value)
}

/**
 * @summary Builds evaluable Neo config source from a class name and changed configs, omitting non-literal entries as comments.
 * @param {String|null} className
 * @param {Object} [changedConfigs={}]
 * @returns {String}
 */
export function formatExampleCode(className, changedConfigs={}) {
    if (!className && Object.keys(changedConfigs).length === 0) {
        return '{\n}'
    }

    const
        entries  = [['module', className || 'Neo.component.Base']],
        comments = [];

    Object.entries(changedConfigs).forEach(([key, value]) => {
        const reason = describeNonLiteralReason(value);

        if (reason) {
            comments.push(`    // ${key}: ${reason}`)
        } else {
            entries.push([formatConfigKey(key), formatConfigValue(value, 4)])
        }
    });

    const
        keyPad = Math.max(...entries.map(([key]) => key.length)),
        lines  = entries.map(([key, formattedValue]) => `    ${key.padEnd(keyPad, ' ')}: ${formattedValue}`),
        body   = [lines.join(',\n'), ...comments].filter(Boolean).join('\n');

    return `{\n${body}\n}`
}
