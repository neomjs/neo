const isHtmlTemplate = Symbol.for('neo.isHtmlTemplate');

/**
 * A container for the result of an `html` tagged template literal.
 * It holds the static strings and the dynamic values of the template.
 * @class Neo.functional.util.HtmlTemplate
 */
class HtmlTemplate {
    /**
     * @param {Array<String>} strings The static parts of the template
     * @param {Array<*>} values The dynamic values of the template
     */
    constructor(strings, values) {
        this.strings = strings;
        this.values  = values;
        this[isHtmlTemplate] = true;
    }
}

/**
 * A tagged template literal function that creates an `HtmlTemplate` instance.
 * This function does not perform any parsing or string concatenation itself.
 * It simply captures the template's parts for later processing.
 * @param {Array<String>} strings
 * @param {Array<*>} values
 * @returns {Neo.functional.util.HtmlTemplate} An instance of HtmlTemplate
 */
const html = (strings, ...values) => {
    return new HtmlTemplate(strings, values);
};

export { html, isHtmlTemplate, HtmlTemplate };
