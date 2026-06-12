/**
 * Sanitizes command line input values by removing surrounding quotes and trimming whitespace.
 * This is useful when users wrap their arguments in quotes (e.g. --env "dev").
 *
 * @param {String|*} value The input value to sanitize
 * @returns {String|*} The sanitized value
 */
export const sanitizeInput = value => {
    if (typeof value === 'string') {
        return value.replace(/^["']|["']$/g, '').trim();
    }
    return value;
};
