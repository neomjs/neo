import Base           from '../../../src/core/Base.mjs';
import {HtmlTemplate} from './html.mjs';
import * as parse5    from '../../../dist/parse5.mjs';

// This file uses several regular expressions to parse and transform the template string.
// Defining them as constants at the module level is a performance best practice,
// as it prevents them from being re-created on every function call.
const
    // Finds an attribute name right before an interpolated value (e.g., `... testText="${...}"`)
    // This is crucial for preserving the original mixed-case spelling of attributes.
    regexAttribute            = /\s+([a-zA-Z][^=]*)\s*=\s*"?$/,
    // Finds a placeholder for a dynamic value that is the entire attribute value.
    regexDynamicValue         = /^__DYNAMIC_VALUE_(\d+)__$/,
    // Finds all dynamic value placeholders within a string (globally).
    regexDynamicValueG        = /__DYNAMIC_VALUE_(\d+)__/g,
    // Finds placeholders for nested templates or dynamic component tags to re-index them.
    regexNested               = /(__DYNAMIC_VALUE_|neotag)(\d+)/g,
    // Extracts the original tag name from its source code string to preserve case sensitivity.
    regexOriginalTagName      = /<([\w\.]+)/,
    // parse5 cannot handle self-closing tags, this regex will add closing tags for all custom components
    selfClosingComponentRegex = /<((?:[A-Z][\w\.]*)|(?:neotag\d+))([^>]*?)\/>/g;

/**
 * A singleton class responsible for processing HtmlTemplate objects.
 * The core challenge is to convert a tagged template literal (which is just strings and values)
 * into a valid Neo.mjs VDOM structure. This requires several steps:
 * 1. Flattening nested templates into a single string with placeholders.
 * 2. Using a robust HTML parser (`parse5`) to create an Abstract Syntax Tree (AST).
 * 3. Traversing the AST and converting it back into a Neo.mjs VDOM object, re-inserting
 *    the original dynamic values (like functions, objects, and components) in the correct places.
 * @class Neo.functional.util.HtmlTemplateProcessor
 * @extends Neo.core.Base
 * @singleton
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
     * Recursively converts a single parse5 AST node into a Neo.mjs VDOM node.
     * This is the heart of the transformation process.
     * @param {Object}   node             The parse5 AST node
     * @param {Array<*>} values           The array of interpolated values from the flattened template
     * @param {String}   originalString   The flattened template string
     * @param {Object}   attributeNameMap A map of dynamic value indices to original, case-sensitive attribute names
     * @returns {Object|String|null} A VDOM node, a text string, or null if the node is empty
     */
    convertNodeToVdom(node, values, originalString, attributeNameMap) {
        // 1. Handle text nodes: Convert text content, re-inserting any dynamic values.
        if (node.nodeName === '#text') {
            const text = node.value.trim();
            if (!text) return null;

            const replacedText = text.replace(regexDynamicValueG, (m, i) => {
                const value = values[parseInt(i, 10)];
                return Neo.isObject(value) ? JSON.stringify(value) : value
            });

            return {vtype: 'text', text: replacedText}
        }

        // 2. Handle element nodes: This is where most of the logic resides.
        if (node.nodeName && node.sourceCodeLocation?.startTag) {
            const
                vdom    = {},
                tagName = node.tagName;

            // A `neotag` is a placeholder for a dynamically injected component constructor (e.g., `<${Button}>`).
            if (tagName.startsWith('neotag')) {
                const index = parseInt(tagName.replace('neotag', ''), 10);
                vdom.module = values[index]
            } else {
                // parse5 lowercases all tag names. To support case-sensitive component tags (e.g., `<MyComponent>`),
                // we must retrieve the original tag name from the source string.
                const
                    {startTag}      = node.sourceCodeLocation,
                    startTagStr     = originalString.substring(startTag.startOffset, startTag.endOffset),
                    originalTagName = startTagStr.match(regexOriginalTagName)[1];

                // By convention, a tag starting with an uppercase letter is a Neo.mjs component.
                if (originalTagName[0] === originalTagName[0].toUpperCase()) {
                    const resolvedModule = Neo.ns(originalTagName, false);

                    if (resolvedModule) {
                        vdom.module = resolvedModule
                    } else {
                        throw new Error(`Could not resolve component tag <${originalTagName}> from global namespace.`)
                    }
                } else {
                    vdom.tag = originalTagName
                }
            }

            // Re-construct attributes, re-inserting dynamic values and preserving original case.
            node.attrs?.forEach(attr => {
                const match = attr.value.match(regexDynamicValue);
                // If the entire attribute is a dynamic value, we can directly assign the rich data type (object, array, function).
                if (match) {
                    const
                        dynamicValueIndex = parseInt(match[1], 10),
                        attrName          = attributeNameMap[dynamicValueIndex] || attr.name; // Use the map

                    vdom[attrName] = values[dynamicValueIndex]
                } else {
                    // If the attribute is a mix of strings and dynamic values, we must coerce everything to a string.
                    vdom[attr.name] = attr.value.replace(regexDynamicValueG, (m, i) => values[parseInt(i, 10)])
                }
            });

            // Recursively process child nodes.
            if (node.childNodes?.length > 0) {
                vdom.cn = node.childNodes.map(child => this.convertNodeToVdom(child, values, originalString, attributeNameMap)).filter(Boolean);

                // Optimization: If a node has only one child and it's a text node, we can simplify the VDOM
                // by moving the text content directly into the parent's `text` property.
                if (vdom.cn.length === 1 && vdom.cn[0].vtype === 'text') {
                    vdom.text = vdom.cn[0].text;
                    delete vdom.cn
                }
            }

            return vdom
        }

        return null
    }

    /**
     * Kicks off the AST to VDOM conversion for the entire template.
     * @param {Object}   ast              The root parse5 AST
     * @param {Array<*>} values           Interpolated values
     * @param {String}   originalString   The flattened template string
     * @param {Object}   attributeNameMap The original attribute names with mixed case, mapped by dynamic value index
     * @returns {Object} The final Neo.mjs VDOM
     */
    convertAstToVdom(ast, values, originalString, attributeNameMap) {
        if (!ast.childNodes || ast.childNodes.length < 1) {
            return {}
        }

        const children = ast.childNodes.map(child => this.convertNodeToVdom(child, values, originalString, attributeNameMap)).filter(Boolean);

        // If the template has only one root node, we return it directly.
        // Otherwise, we return a fragment-like object with children in a `cn` array.
        if (children.length === 1) {
            return children[0]
        }

        return {cn: children}
    }

    /**
     * Flattens a potentially nested HtmlTemplate object into a single string and a corresponding array of values.
     * This is a necessary pre-processing step before parsing with parse5, which only accepts a single string.
     * @param {Neo.functional.util.HtmlTemplate} template The root template object
     * @returns {{flatString: string, flatValues: Array<*>, attributeNameMap: Object}}
     */
    flattenTemplate(template) {
        let flatString = '';
        const
            flatValues       = [],
            attributeNameMap = {};

        for (let i = 0; i < template.strings.length; i++) {
            let str = template.strings[i];
            flatString += str;

            if (i < template.values.length) {
                const
                    value     = template.values[i],
                    attrMatch = str.match(regexAttribute);

                // If a value is another HtmlTemplate, we recursively flatten it and merge the results.
                if (value instanceof HtmlTemplate) {
                    const nested = this.flattenTemplate(value);
                    // The indices of the nested template's values need to be shifted to avoid collisions.
                    const nestedString = nested.flatString.replace(regexNested, (match, p1, p2) => {
                        const
                            oldIndex = parseInt(p2, 10),
                            newIndex = oldIndex + flatValues.length;
                        // Adjust keys in nested.attributeNameMap before merging
                        if (nested.attributeNameMap[oldIndex]) {
                            attributeNameMap[newIndex] = nested.attributeNameMap[oldIndex]
                        }
                        return `${p1}${newIndex}`
                    });

                    flatString += nestedString;
                    flatValues.push(...nested.flatValues)
                    // No need to push nested.attributeNames, as we merged the map above
                }
                // Falsy values like false, null, and undefined should not be rendered.
                // This is crucial for enabling conditional rendering with `&&`.
                else if (value !== false && value != null) {
                    // If a dynamic value is a component constructor, we replace it with a special `neotag` placeholder.
                    if (template.strings[i].trim().endsWith('<') || template.strings[i].trim().endsWith('</')) {
                        flatString += `neotag${flatValues.length}`
                    } else {
                        flatString += `__DYNAMIC_VALUE_${flatValues.length}__`
                    }

                    flatValues.push(value);
                    if (attrMatch) {
                        // Store attribute name by its dynamic value index
                        attributeNameMap[flatValues.length - 1] = attrMatch[1]
                    }
                }
            }
        }

        return {flatString, flatValues, attributeNameMap};
    }

    /**
     * The main entry point for processing a template.
     * It orchestrates the flattening, parsing, and VDOM conversion, and then passes the result
     * back to the component to continue its update lifecycle.
     * @param {Neo.functional.util.HtmlTemplate} template  The root template object
     * @param {Neo.functional.component.Base}    component The component instance
     */
    process(template, component) {
        const
            me                                         = this,
            {flatString, flatValues, attributeNameMap} = me.flattenTemplate(template), // Change variable name
            stringWithClosingTags                      = flatString.replace(selfClosingComponentRegex, '<$1$2></$1>'),
            ast                                        = parse5.parseFragment(stringWithClosingTags, {sourceCodeLocationInfo: true}),
            parsedVdom                                 = me.convertAstToVdom(ast, flatValues, stringWithClosingTags, attributeNameMap);

        component.continueUpdateWithVdom(parsedVdom)
    }
}

export default Neo.setupClass(HtmlTemplateProcessor);
