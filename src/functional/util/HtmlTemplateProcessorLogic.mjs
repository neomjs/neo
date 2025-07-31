import {HtmlTemplate} from './html.mjs';

// This file uses several regular expressions to parse and transform the template string.
// Defining them as constants at the module level is a performance best practice,
// as it prevents them from being re-created on every function call.
const
    // Finds an attribute name right before an interpolated value (e.g., `... testText="${...}"`)
    // This is crucial for preserving the original mixed-case spelling of attributes.
    regexAttribute       = /\s+([a-zA-Z][^=]*)\s*=\s*"?$/,
    // Finds a placeholder for a dynamic value that is the entire attribute value.
    regexDynamicValue    = /^__DYNAMIC_VALUE_(\d+)__$/,
    // Finds all dynamic value placeholders within a string (globally).
    regexDynamicValueG   = /__DYNAMIC_VALUE_(\d+)__/g,
    // Finds placeholders for nested templates or dynamic component tags to re-index them.
    regexNested          = /(__DYNAMIC_VALUE_|neotag)(\d+)/g,
    // Extracts the original tag name from its source code string to preserve case sensitivity.
    regexOriginalTagName = /<([\w\.]+)/;

/**
 * A helper to check if a value is an object (and not null).
 * @param {*} value The value to check
 * @returns {boolean}
 */
function isObject(value) {
    return typeof value === 'object' && value !== null;
}

/**
 * Recursively converts a single parse5 AST node into a Neo.mjs VDOM node.
 * This is the heart of the transformation process.
 * @param {Object} node The parse5 AST node
 * @param {Array<*>} values The array of interpolated values from the flattened template
 * @param {String} originalString The flattened template string
 * @param {Array<string>} attributeNames An array of original, case-sensitive attribute names
 * @param {Function} [nsResolver] Optional namespace resolver (used on client, omitted for build)
 * @param {Object} [options] Optional configuration object
 * @returns {Object|String|null} A VDOM node, a text string, or null if the node is empty
 */
function convertNodeToVdom(node, values, originalString, attributeNames, nsResolver, options) {
    // 1. Handle text nodes: Convert text content, re-inserting any dynamic values.
    if (node.nodeName === '#text') {
        let text = node.value;

        // Conditionally apply whitespace trimming for the build process
        if (options?.trimWhitespace) {
            text = text.replace(/\s+/g, ' ').trim();
        }

        if (text === '') return null;

        // For client-side, where we don't trim, we still need to check for effectively empty nodes
        if (!options?.trimWhitespace && text.trim() === '') {
            return null;
        }

        const regex = /(__DYNAMIC_VALUE_\d+__)/g;
        const parts = text.split(regex).filter(p => p); // filter out empty strings

        // Case 1: Purely static text
        if (parts.length === 1 && !parts[0].match(regex)) {
            return {vtype: 'text', text: parts[0]};
        }

        // Case 2: A single dynamic value, nothing else
        if (parts.length === 1 && parts[0].match(/^__DYNAMIC_VALUE_\d+__$/)) {
            const index = parseInt(parts[0].match(/\d+/)[0], 10);
            const value = values[index];
            // Pass the value (which could be our placeholder) through directly
            return {vtype: 'text', text: value};
        }

        // Case 3: Mixed content (or multiple dynamic values) -> build a template literal
        const expressionParts = parts.map(part => {
            const match = part.match(/__DYNAMIC_VALUE_(\d+)__/);
            if (match) {
                const index = parseInt(match[1], 10);
                const value = values[index];
                const exprMatch = typeof value === 'string' && value.match(/##__NEO_EXPR__(.*)##__NEO_EXPR__##/);
                if (exprMatch) {
                    // It's a runtime expression, embed it directly in the template literal
                    return `\${${exprMatch[1]}}`;
                } else {
                    // It's a build-time resolved value, embed it as a literal
                    return `\${${JSON.stringify(value)}}`;
                }
            }
            // It's a static string part. Escape backticks, backslashes, and starting template literal markers.
            return part.replace(/\\/g, '\\\\').replace(/`/g, '\`').replace(/\${/g, '\\${');
        });

        const finalExpression = `\`${expressionParts.join('')}\``;

        // Wrap the whole template literal expression in our placeholder for buildSingleFile.mjs
        return {vtype: 'text', text: `##__NEO_EXPR__${finalExpression}##__NEO_EXPR__##`};
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
            // parse5 lowercases all tag names. To support case-sensitive component tags (e.g., `<MyComponent> rust`),
            // we must retrieve the original tag name from the source string.
            const
                {startTag}      = node.sourceCodeLocation,
                startTagStr     = originalString.substring(startTag.startOffset, startTag.endOffset),
                originalTagName = startTagStr.match(regexOriginalTagName)[1];

            // By convention, a tag starting with an uppercase letter is a Neo.mjs component.
            if (originalTagName[0] === originalTagName[0].toUpperCase()) {
                if (nsResolver) {
                    const resolvedModule = nsResolver(originalTagName, false);

                    if (resolvedModule) {
                        vdom.module = resolvedModule
                    } else {
                        throw new Error(`Could not resolve component tag <${originalTagName}> from global namespace.`)
                    }
                } else {
                    // For build-time processing, create a placeholder instead of resolving the namespace
                    vdom.module = { __neo_component_name__: originalTagName };
                }
            } else {
                vdom.tag = originalTagName
            }
        }

        // Re-construct attributes, re-inserting dynamic values and preserving original case.
        let attrNameIndex = 0;

        node.attrs?.forEach(attr => {
            const match = attr.value.match(regexDynamicValue);
            // If the entire attribute is a dynamic value, we can directly assign the rich data type (object, array, function).
            if (match) {
                // parse5 also lowercases attribute names. We use our pre-collected `attributeNames` array to restore the original casing.
                const attrName = attributeNames[attrNameIndex++] || attr.name;
                vdom[attrName] = values[parseInt(match[1], 10)]
            } else {
                // If the attribute is a mix of strings and dynamic values, we must coerce everything to a string.
                vdom[attr.name] = attr.value.replace(regexDynamicValueG, (m, i) => values[parseInt(i, 10)])
            }
        });

        // Recursively process child nodes.
        if (node.childNodes?.length > 0) {
            vdom.cn = node.childNodes.map(child => convertNodeToVdom(child, values, originalString, attributeNames, nsResolver, options)).filter(Boolean);

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
 * @param {Object} ast The root parse5 AST
 * @param {Array<*>} values Interpolated values
 * @param {String} originalString The flattened template string
 * @param {Array<string>} attributeNames The original attribute names with mixed case
 * @param {Function} [nsResolver] Optional namespace resolver
 * @param {Object} [options] Optional configuration object
 * @returns {Object} The final Neo.mjs VDOM
 */
export function convertAstToVdom(ast, values, originalString, attributeNames, nsResolver, options) {
    if (!ast.childNodes || ast.childNodes.length < 1) {
        return {}
    }

    const children = ast.childNodes.map(child => convertNodeToVdom(child, values, originalString, attributeNames, nsResolver, options)).filter(Boolean);

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
 * @returns {{flatString: string, flatValues: Array<*>, attributeNames: Array<string>}}
 */
export function flattenTemplate(template) {
    let flatString = '';
    const
        flatValues     = [],
        attributeNames = [];

    for (let i = 0; i < template.strings.length; i++) {
        let str = template.strings[i];
        // We capture attribute names just before a dynamic value to preserve their original case,
        // as parse5 will lowercase them.
        const attrMatch = str.match(regexAttribute);
        if (attrMatch) {
            attributeNames.push(attrMatch[1])
        }

        flatString += str;

        if (i < template.values.length) {
            const value = template.values[i];

            // If a value is another HtmlTemplate, we recursively flatten it and merge the results.
            if (value instanceof HtmlTemplate) {
                const nested = flattenTemplate(value);
                // The indices of the nested template's values need to be shifted to avoid collisions.
                const nestedString = nested.flatString.replace(regexNested, (match, p1, p2) => {
                    return `${p1}${parseInt(p2, 10) + flatValues.length}`
                });

                flatString += nestedString;
                flatValues.push(...nested.flatValues);
                attributeNames.push(...nested.attributeNames)
            }
            // Falsy values like false, null, and undefined should not be rendered.
            // This is crucial for enabling conditional rendering with `&&`.
            else if (value !== false && value != null) {
                // If a dynamic value is a component constructor, we replace it with a special `neotag` placeholder.
                if (template.strings[i].trim().endsWith('<') || template.strings[i].trim().endsWith('</')) {
                    flatString += `neotag${flatValues.length}`
                } else {
                    // Otherwise, we use a standard dynamic value placeholder.
                    flatString += `__DYNAMIC_VALUE_${flatValues.length}__`
                }

                flatValues.push(value)
            }
        }
    }

    return {flatString, flatValues, attributeNames}
}