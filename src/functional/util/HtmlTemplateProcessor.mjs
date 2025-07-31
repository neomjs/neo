import Neo            from '../../../src/Neo.mjs';
import Base           from '../../../src/core/Base.mjs';
import {HtmlTemplate} from './html.mjs';

/**
 * A singleton class responsible for processing HtmlTemplate objects,
 * parsing them with parse5, and continuing the component update lifecycle.
 * @class Neo.functional.util.HtmlTemplateProcessor
 * @extends Neo.core.Base
 */
class HtmlTemplateProcessor extends Base {
    static config = {
        /**
         * @member {String} className='Neo.functional.util.HtmlTemplateProcessor'
         * @protected
         */
        className: 'Neo.functional.util.HtmlTemplateProcessor',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {Boolean} parse5Loaded=false
         * @protected
         */
        parse5Loaded: false
    }

    /**
     * @member {Object} parse5=null
     * @protected
     */
    parse5 = null;

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.loadParse5();
    }

    /**
     * Converts a parse5 AST node to a Neo.mjs VDOM object.
     * @param {Object} node The parse5 AST node
     * @param {Array<*>} values The array of interpolated values
     * @param {String} originalString The original template string
     * @param {Object} scope A map of component constructors
     * @returns {Object|String|null}
     */
    convertNodeToVdom(node, values, originalString, scope) {
        const placeholderRegex = /__DYNAMIC_VALUE_(\d+)__/;

        // 1. Handle text nodes
        if (node.nodeName === '#text') {
            const text = node.value.trim();
            if (!text) return null;

            const match = text.match(placeholderRegex);
            if (match) {
                if (text === match[0]) {
                    return values[parseInt(match[1], 10)];
                }
                return {ntype: 'vdomtext', text: text.replace(placeholderRegex, (m, i) => values[parseInt(i, 10)])};
            }

            return {ntype: 'vdomtext', text};
        }

        // 2. Handle element nodes
        if (node.nodeName && node.sourceCodeLocation) {
            const vdom = {};
            const startTag = originalString.substring(node.sourceCodeLocation.startTag.startOffset, node.sourceCodeLocation.startTag.endOffset);
            const tagName = startTag.match(/<([\w\.]+)/)[1];

            if (scope[tagName]) {
                vdom.module = scope[tagName];
            } else {
                vdom.tag = tagName.toLowerCase();
            }

            // Attributes
            if (node.attrs) {
                node.attrs.forEach(attr => {
                    const match = attr.value.match(placeholderRegex);
                    if (match && attr.value === match[0]) {
                        vdom[attr.name] = values[parseInt(match[1], 10)];
                    } else {
                        vdom[attr.name] = attr.value.replace(placeholderRegex, (m, i) => values[parseInt(i, 10)]);
                    }
                });
            }

            // Children
            if (node.childNodes && node.childNodes.length > 0) {
                vdom.cn = node.childNodes.map(child => this.convertNodeToVdom(child, values, originalString, scope)).filter(Boolean);
            }

            return vdom;
        }

        return null;
    }

    /**
     * Placeholder for the conversion logic
     * @param {Object} ast parse5 AST
     * @param {Array<*>} values Interpolated values
     * @param {String} originalString The original template string
     * @param {Object} scope A map of component constructors
     * @returns {Object} Neo.mjs VDOM
     */
    convertAstToVdom(ast, values, originalString, scope) {
        if (!ast.childNodes || ast.childNodes.length === 0) {
            return {};
        }

        const children = ast.childNodes.map(child => this.convertNodeToVdom(child, values, originalString, scope)).filter(Boolean);

        if (children.length === 1) {
            return children[0];
        }

        return {cn: children};
    }

    /**
     * Recursively flattens a nested HtmlTemplate structure into a single
     * string with placeholders and a single array of corresponding values.
     * @param {Neo.functional.util.HtmlTemplate} template
     * @returns {{flatString: string, flatValues: Array<*>}}
     */
    flattenTemplate(template) {
        let flatString = '';
        const flatValues = [];

        for (let i = 0; i < template.strings.length; i++) {
            flatString += template.strings[i];

            if (i < template.values.length) {
                const value = template.values[i];

                if (value instanceof HtmlTemplate) {
                    // If the value is another template, recurse
                    const nested = this.flattenTemplate(value);
                    // Adjust indices for the nested values
                    const nestedString = nested.flatString.replace(/__DYNAMIC_VALUE_(\d+)__/g, (match, index) => {
                        return `__DYNAMIC_VALUE_${parseInt(index, 10) + flatValues.length}__`;
                    });
                    flatString += nestedString;
                    flatValues.push(...nested.flatValues);
                } else {
                    // Otherwise, add the value and a placeholder
                    flatString += `__DYNAMIC_VALUE_${flatValues.length}__`;
                    flatValues.push(value);
                }
            }
        }

        return {flatString, flatValues};
    }

    /**
     * Loads the parse5 library dynamically.
     */
    async loadParse5() {
        if (!this.parse5Loaded) {
            const parse5 = await import('../../../dist/parse5.mjs');
            this.parse5 = parse5;
            this.parse5Loaded = true;
        }
    }

    /**
     * This method is the entry point for processing a template.
     * It flattens the template, parses it using parse5, and then
     * calls back to the component to continue the update process.
     * @param {Neo.functional.util.HtmlTemplate} template The root template object
     * @param {Neo.functional.component.Base} component The component instance
     * @param {Object} [scope] A map of component constructors available in the template's scope
     */
    async process(template, component, scope = {}) {
        if (!this.parse5Loaded) {
            await this.loadParse5();
        }

        const me = this;
        const {flatString, flatValues} = me.flattenTemplate(template);

        const ast = me.parse5.parseFragment(flatString, {sourceCodeLocationInfo: true});

        const parsedVdom = me.convertAstToVdom(ast, flatValues, flatString, scope);

        // The component update can continue synchronously after the await
        component.continueUpdateWithVdom(parsedVdom);
    }
}

export default Neo.setupClass(HtmlTemplateProcessor);