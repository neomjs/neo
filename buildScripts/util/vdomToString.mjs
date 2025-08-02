/**
 * A regex to check if a string is a valid JavaScript identifier.
 * @member {RegExp} validIdentifierRegex=/^[a-zA-Z_$][a-zA-Z0-9_$]*$/
 */
const validIdentifierRegex = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

/**
 * Serializes a VDOM object into a JavaScript object literal string.
 * This is a custom implementation to ensure keys are unquoted if they are
 * valid identifiers, and correctly quoted otherwise. It also handles
 * special placeholders for runtime expressions.
 * @param {Object} vdom The VDOM object to serialize.
 * @returns {String} The string representation of the VDOM.
 */
export function vdomToString(vdom) {
    if (vdom === null) {
        return 'null';
    }
    if (typeof vdom !== 'object') {
        // It's a primitive value (string, number, boolean)
        // Check for our special expression placeholder
        if (typeof vdom === 'string') {
            const match = vdom.match(/##__NEO_EXPR__(.*)##__NEO_EXPR__##/);
            if (match) {
                return match[1]; // Return the raw expression
            }
        }
        // Otherwise, stringify it normally
        return JSON.stringify(vdom);
    }

    if (Array.isArray(vdom)) {
        return `[${vdom.map(vdomToString).join(',')}]`;
    }

    const parts = [];
    for (const key in vdom) {
        if (Object.prototype.hasOwnProperty.call(vdom, key)) {
            const value = vdom[key];
            const keyString = validIdentifierRegex.test(key) ? key : `'${key}'`;
            parts.push(`${keyString}:${vdomToString(value)}`);
        }
    }

    return `{${parts.join(',')}}`;
}
