import Neo            from '../../../src/Neo.mjs';
import Base           from '../../../src/core/Base.mjs';
import {HtmlTemplate} from './html.mjs';
import * as parse5    from '../../../dist/parse5.mjs';

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
        singleton: true
    }

    /**
     * Converts a parse5 AST node to a Neo.mjs VDOM object.
     * @param {Object} node The parse5 AST node
     * @param {Array<*>} values The array of interpolated values
     * @param {String} originalString The original template string
     * @returns {Object|String|null}
     */
    convertNodeToVdom(node, values, originalString, attributeNames) {
        const placeholderRegex = /__DYNAMIC_VALUE_(\d+)__/g;

        // 1. Handle text nodes
        if (node.nodeName === '#text') {
            const text = node.value.trim();
            if (!text) return null;

            const replacedText = text.replace(placeholderRegex, (m, i) => {
                const value = values[parseInt(i, 10)];
                return Neo.isObject(value) ? JSON.stringify(value) : value;
            });
            return {vtype: 'text', text: replacedText};
        }

        // 2. Handle element nodes
        if (node.nodeName && node.sourceCodeLocation?.startTag) {
            const vdom = {};
            const tagName = node.tagName;

            if (tagName.startsWith('neotag')) {
                const index = parseInt(tagName.replace('neotag', ''), 10);
                vdom.module = values[index];
            } else {
                const startTagStr = originalString.substring(node.sourceCodeLocation.startTag.startOffset, node.sourceCodeLocation.startTag.endOffset);
                const originalTagName = startTagStr.match(/<([\w\.]+)/)[1];

                if (originalTagName[0] === originalTagName[0].toUpperCase()) {
                    const resolvedModule = Neo.ns(originalTagName, false);
                    if (resolvedModule) {
                        vdom.module = resolvedModule;
                    } else {
                        throw new Error(`Could not resolve component tag <${originalTagName}> from global namespace.`);
                    }
                } else {
                    vdom.tag = originalTagName;
                }
            }

            if (node.attrs) {
                let attrNameIndex = 0;
                node.attrs.forEach(attr => {
                    const match = attr.value.match(/^__DYNAMIC_VALUE_(\d+)__$/);
                    if (match) {
                        const attrName = attributeNames[attrNameIndex++] || attr.name;
                        vdom[attrName] = values[parseInt(match[1], 10)];
                    } else {
                        vdom[attr.name] = attr.value.replace(placeholderRegex, (m, i) => values[parseInt(i, 10)]);
                    }
                });
            }

            if (node.childNodes && node.childNodes.length > 0) {
                vdom.cn = node.childNodes.map(child => this.convertNodeToVdom(child, values, originalString, attributeNames)).filter(Boolean);

                if (vdom.cn.length === 1 && vdom.cn[0].vtype === 'text') {
                    vdom.text = vdom.cn[0].text;
                    delete vdom.cn;
                }
            }

            return vdom;
        }

        return null;
    }

    /**
     * @param {Object} ast parse5 AST
     * @param {Array<*>} values Interpolated values
     * @param {String} originalString The original template string
     * @returns {Object} Neo.mjs VDOM
     */
    convertAstToVdom(ast, values, originalString, attributeNames) {
        if (!ast.childNodes || ast.childNodes.length === 0) {
            return {};
        }

        const children = ast.childNodes.map(child => this.convertNodeToVdom(child, values, originalString, attributeNames)).filter(Boolean);

        if (children.length === 1) {
            return children[0];
        }

        return {cn: children};
    }

    /**
     * @param {Neo.functional.util.HtmlTemplate} template
     * @returns {{flatString: string, flatValues: Array<*>}}
     */
    flattenTemplate(template) {
        let flatString = '';
        const flatValues = [];
        const attributeNames = [];

        for (let i = 0; i < template.strings.length; i++) {
            let str = template.strings[i];
            const attrMatch = str.match(/\s+([a-zA-Z][^=]*)=$/);
            if (attrMatch) {
                attributeNames.push(attrMatch[1]);
            }

            flatString += str;

            if (i < template.values.length) {
                const value = template.values[i];

                if (value instanceof HtmlTemplate) {
                    const nested = this.flattenTemplate(value);
                    const nestedString = nested.flatString.replace(/(__DYNAMIC_VALUE_|neotag)(\d+)/g, (match, p1, p2) => {
                        return `${p1}${parseInt(p2, 10) + flatValues.length}`;
                    });
                    flatString += nestedString;
                    flatValues.push(...nested.flatValues);
                    attributeNames.push(...nested.attributeNames);
                } else {
                    if (template.strings[i].trim().endsWith('<') || template.strings[i].trim().endsWith('</')) {
                        flatString += `neotag${flatValues.length}`;
                    } else {
                        flatString += `__DYNAMIC_VALUE_${flatValues.length}__`;
                    }
                    flatValues.push(value);
                }
            }
        }

        return {flatString, flatValues, attributeNames};
    }

    /**
     * @param {Neo.functional.util.HtmlTemplate} template The root template object
     * @param {Neo.functional.component.Base} component The component instance
     */
    process(template, component) {
        const me = this;
        const {flatString, flatValues, attributeNames} = me.flattenTemplate(template);

        const ast = parse5.parseFragment(flatString, {sourceCodeLocationInfo: true});

        const parsedVdom = me.convertAstToVdom(ast, flatValues, flatString, attributeNames);

        component.continueUpdateWithVdom(parsedVdom);
    }
}

export default Neo.setupClass(HtmlTemplateProcessor);
