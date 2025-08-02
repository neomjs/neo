import { HtmlTemplate } from '../../src/functional/util/html.mjs';
import * as parse5      from '../../dist/parse5.mjs'; // parse5 is bundled and available

/**
 * This script contains the core logic for Neo.mjs's build-time processing of HTML tagged template literals.
 * Its primary purpose is to convert the `html`...` syntax into a standard, serializable Neo.mjs VDOM
 * object. This transformation happens during the build process (`build-dist-esm`), meaning the code that
 * runs in the browser receives a pre-compiled, optimized VDOM structure, eliminating the need for a
 * client-side HTML parser and improving runtime performance.
 *
 * The process is carefully designed to be a "compile-time equivalent" of the client-side parser, ensuring
 * that developers get a consistent experience between development and production modes.
 *
 * The core challenge is to take the raw strings and an array of code strings (representing the dynamic
 * parts like `${this.name}`) and correctly reconstruct a VDOM tree. This involves:
 * 1. Flattening nested templates.
 * 2. Using `parse5` to create a standard HTML AST.
 * 3. Walking the AST and converting each node into a VDOM object.
 * 4. Crucially, preserving the JavaScript expressions as-is for runtime evaluation, which is achieved by
 *    wrapping them in special placeholders (`##__NEO_EXPR__...##`) that are later converted back into
 *    raw code in the final AST.
 * 5. Handling mixed content (e.g., `Hello, ${this.name}!`) by converting it into a robust chain of
 *    string concatenations rather than a fragile template literal reconstruction.
 */

// Defining regexes at the module level is a performance best practice,
// as it prevents them from being re-created on every function call.
const
    /**
     * @private
     * @const {RegExp} regexAttribute
     * Finds an attribute name right before an interpolated value (e.g., `... style=${...}`).
     * This is crucial for preserving the original mixed-case spelling of attributes when they are dynamic.
     */
    regexAttribute            = /\s+([a-zA-Z][^=]*)\s*=\s*"?$/,
    /**
     * @private
     * @const {RegExp} regexDynamicValue
     * Finds a placeholder for a dynamic value that is the entire attribute value.
     */
    regexDynamicValue         = /^__DYNAMIC_VALUE_(\d+)__$/,
    /**
     * @private
     * @const {RegExp} regexDynamicValueG
     * Finds all dynamic value placeholders within a string (globally).
     */
    regexDynamicValueG        = /__DYNAMIC_VALUE_(\d+)__/g,
    /**
     * @private
     * @const {RegExp} regexNested
     * Finds placeholders for nested templates or dynamic component tags to re-index them during flattening.
     */
    regexNested               = /(__DYNAMIC_VALUE_|neotag)(\d+)/g,
    /**
     * @private
     * @const {RegExp} regexOriginalTagName
     * Extracts the original tag name from its source code string to preserve case sensitivity, as parse5 lowercases all tags.
     */
    regexOriginalTagName      = /<([\w\.]+)/,
    /**
     * @private
     * @const {RegExp} selfClosingComponentRegex
     * Finds self-closing custom component tags (e.g., `<MyComponent />`) and converts them to
     * explicit start/end tags (`<MyComponent></MyComponent>`) because `parse5` in fragment mode
     * does not correctly handle them for non-standard elements.
     */
    selfClosingComponentRegex = /<((?:[A-Z][\w\.]*)|(?:neotag\d+))([^>]*?)\/?>/g;

/**
 * Recursively converts a single parse5 AST node into a Neo.mjs VDOM node.
 * This is the heart of the transformation process, translating the HTML structure into a JSON structure.
 * @param {object} node The parse5 AST node to process.
 * @param {string[]} values The array of placeholder strings for interpolated values (e.g., '##__NEO_EXPR__...##').
 * @param {string} originalString The flattened, raw template string.
 * @param {object} attributeNameMap A map of dynamic value indices to their original, case-sensitive attribute names.
 * @param {object} options Configuration options for parsing.
 * @param {object} parseState A state object to track parsing progress (currently unused but available).
 * @returns {object|string|null} A VDOM node, a raw expression placeholder string, or null if the node is empty.
 * @private
 */
function convertNodeToVdom(node, values, originalString, attributeNameMap, options, parseState) {
    // 1. Handle text nodes
    if (node.nodeName === '#text') {
        let text = node.value;

        if (options?.trimWhitespace) {
            text = text.replace(/\s+/g, ' ').trim();
        }

        if (text === '') return null;

        // CRITICAL: This handles conditional rendering (e.g., `${condition && template}`).
        // If a text node consists of a SINGLE dynamic value, we must return the raw placeholder string.
        // This allows the expression to be placed directly into the parent's `cn` array, where it will be
        // evaluated at runtime. If we wrapped it in a `{vtype: 'text', ...}` object, it would always render as a string.
        const singleDynamicMatch = text.match(/^__DYNAMIC_VALUE_(\d+)__$/);
        if (singleDynamicMatch) {
            const index = parseInt(singleDynamicMatch[1], 10);
            return values[index]; // Return the raw '##__NEO_EXPR__...##' placeholder
        }

        // If the text node is a mix of strings and dynamic values (e.g., `Hello, ${name}`),
        // we build a robust string concatenation chain (e.g., `'Hello, ' + (name)`). This is more
        // reliable than trying to reconstruct a nested template literal, as it avoids complex escaping issues.
        const regex = /(__DYNAMIC_VALUE_\d+__)/g;
        const parts = text.split(regex).filter(p => p);

        if (parts.length > 1) {
            const additionChain = parts.map(part => {
                const match = part.match(/__DYNAMIC_VALUE_(\d+)__/);
                if (match) {
                    const index = parseInt(match[1], 10);
                    const value = values[index]; // This is the '##__NEO_EXPR__...' string
                    const exprMatch = value.match(/##__NEO_EXPR__(.*)##__NEO_EXPR__##/s);
                    if (exprMatch) {
                        return `(${exprMatch[1]})`; // Wrap expression in parens for safety
                    }
                }
                // Escape single quotes for the string literal part of the chain.
                return `'${part.replace(/'/g, "\'" )}'`;
            }).filter(p => p !== `''`).join(' + ');

            // The entire chain becomes a single expression placeholder.
            return { vtype: 'text', text: `##__NEO_EXPR__${additionChain}##__NEO_EXPR__##` };
        }

        // It's a simple static text node.
        return { vtype: 'text', text };
    }

    // 2. Handle element nodes
    if (node.nodeName && node.sourceCodeLocation?.startTag) {
        const vdom = {};
        const tagName = node.tagName;

        // A `neotag` is a placeholder for a dynamically injected component constructor (e.g., `<${Button}>`).
        if (tagName.startsWith('neotag')) {
            const index = parseInt(tagName.replace('neotag', ''), 10);
            vdom.module = values[index];
        } else {
            // parse5 lowercases all tag names. To support case-sensitive component tags (e.g., `<MyComponent>`),
            // we must retrieve the original tag name from the source string.
            const { startTag } = node.sourceCodeLocation;
            const startTagStr = originalString.substring(startTag.startOffset, startTag.endOffset);
            const originalTagNameMatch = startTagStr.match(regexOriginalTagName);
            if (originalTagNameMatch) {
                const originalTagName = originalTagNameMatch[1];
                // By convention, a tag starting with an uppercase letter is a Neo.mjs component.
                if (originalTagName[0] === originalTagName[0].toUpperCase()) {
                    // At build time, we don't resolve the component. We create a placeholder that the
                    // main build script will convert into a plain Identifier in the AST.
                    vdom.module = { __neo_component_name__: originalTagName };
                } else {
                    vdom.tag = originalTagName;
                }
            } else {
                vdom.tag = tagName; // Fallback
            }
        }

        // Re-construct attributes, re-inserting dynamic values and preserving original case.
        node.attrs?.forEach(attr => {
            const match = attr.value.match(regexDynamicValue);
            // If the entire attribute is a dynamic value, we can directly assign the placeholder.
            if (match) {
                const dynamicValueIndex = parseInt(match[1], 10);
                const attrName = attributeNameMap[dynamicValueIndex] || attr.name;
                vdom[attrName] = values[dynamicValueIndex];
            } else {
                // If the attribute is a mix of strings and dynamic values, build a concatenation chain.
                let hasDynamicPart = false;
                const valueParts = attr.value.split(regexDynamicValueG).map(part => {
                    if (part.match(/^\d+$/)) {
                        const index = parseInt(part, 10);
                        if (values[index]) {
                            hasDynamicPart = true;
                            const value = values[index];
                            const exprMatch = value.match(/##__NEO_EXPR__(.*)##__NEO_EXPR__##/s);
                            return exprMatch ? `(${exprMatch[1]})` : JSON.stringify(value);
                        }
                    }
                    return `'${part.replace(/'/g, "\'" )}'`;
                });

                if (hasDynamicPart) {
                    const finalExpression = valueParts.filter(p => p !== `''`).join(' + ');
                    vdom[attr.name] = `##__NEO_EXPR__${finalExpression}##__NEO_EXPR__##`;
                } else {
                    vdom[attr.name] = attr.value;
                }
            }
        });

        // Recursively process child nodes.
        if (node.childNodes?.length > 0) {
            const children = node.childNodes.map(child => convertNodeToVdom(child, values, originalString, attributeNameMap, options, parseState)).filter(Boolean);
            if (children.length > 0) {
                // Optimization: If a node has only one child, check if it's a text node (either static or dynamic)
                // and simplify the VDOM by moving the content directly into the parent's `text` property.
                if (children.length === 1) {
                    const child = children[0];
                    if (child.vtype === 'text') {
                        vdom.text = child.text;
                    } else if (typeof child === 'string' && child.startsWith('##__NEO_EXPR__')) {
                        vdom.text = child; // Assign the dynamic expression placeholder directly.
                    } else {
                        vdom.cn = children;
                    }
                } else {
                    vdom.cn = children;
                }
            }
        }

        return vdom;
    }

    return null;
}

/**
 * Kicks off the AST to VDOM conversion for the entire template.
 * @param {object} ast The root parse5 AST.
 * @param {string[]} values The array of placeholder strings for interpolated values.
 * @param {string} originalString The flattened, raw template string.
 * @param {object} attributeNameMap A map of dynamic value indices to their original, case-sensitive attribute names.
 * @param {object} options Configuration options for parsing.
 * @param {object} parseState A state object to track parsing progress.
 * @returns {object} The final Neo.mjs VDOM.
 * @private
 */
function convertAstToVdom(ast, values, originalString, attributeNameMap, options, parseState) {
    if (!ast.childNodes || ast.childNodes.length < 1) {
        return {};
    }

    const children = ast.childNodes.map(child => convertNodeToVdom(child, values, originalString, attributeNameMap, options, parseState)).filter(Boolean);

    // If the template has only one root node, we return it directly.
    // Otherwise, we return a fragment-like object with children in a `cn` array.
    if (children.length === 1) {
        return children[0];
    }

    return { cn: children };
}

/**
 * Flattens a potentially nested HtmlTemplate object into a single string and a corresponding array of values.
 * This is a necessary pre-processing step before parsing with `parse5`, which only accepts a single string.
 * It recursively walks through nested templates, merging their strings and values, and carefully re-indexes
 * all placeholders to be unique within the final flattened structure.
 * @param {Neo.functional.util.HtmlTemplate} template The root template object.
 * @param {string[]} [parentValues] Used for recursion.
 * @param {object} [parentAttributeMap] Used for recursion.
 * @returns {{flatString: string, flatValues: Array<*>, attributeNameMap: Object}}
 * @private
 */
function flattenTemplate(template, parentValues, parentAttributeMap) {
    let flatString = '';
    const flatValues = parentValues || [];
    const attributeNameMap = parentAttributeMap || {};

    for (let i = 0; i < template.strings.length; i++) {
        let str = template.strings[i];
        const attrMatch = str.match(regexAttribute);

        flatString += str;

        if (i < template.values.length) {
            const value = template.values[i];

            if (value instanceof HtmlTemplate) {
                // A value can be another template. Recurse into it.
                const nestedStartIndex = flatValues.length;
                const nested = flattenTemplate(value, flatValues, attributeNameMap);
                // The nested template's placeholders must be re-indexed to fit into the parent's value array.
                const nestedString = nested.flatString.replace(regexNested, (match, p1, p2) => {
                    return `${p1}${parseInt(p2, 10) + nestedStartIndex}`;
                });
                flatString += nestedString;
                // flatValues and attributeNameMap are mutated by the recursive call, so no merge needed here.
            } else if (value !== false && value != null) {
                // Falsy values are ignored, enabling conditional rendering.
                const currentIndex = flatValues.length;
                if (attrMatch) {
                    // If the value is for an attribute, store the original attribute name.
                    attributeNameMap[currentIndex] = attrMatch[1];
                }

                // Replace the dynamic value with a placeholder.
                if (template.strings[i].trim().endsWith('<') || template.strings[i].trim().endsWith('</')) {
                    flatString += `neotag${currentIndex}`;
                } else {
                    flatString += `__DYNAMIC_VALUE_${currentIndex}__`;
                }
                flatValues.push(value);
            }
        }
    }

    return { flatString, flatValues, attributeNameMap };
}

/**
 * The main entry point for the build-time template processor.
 * It orchestrates the flattening, parsing, and VDOM conversion.
 * @param {string[]} strings The static string parts of the template literal from the AST.
 * @param {string[]} expressionCodeStrings The raw JavaScript code strings for the dynamic parts from the AST.
 * @returns {object} The resulting serializable JSON VDOM object.
 */
export function processHtmlTemplateLiteral(strings, expressionCodeStrings) {
    // At build time, we don't evaluate expressions. We wrap the raw code strings in placeholders.
    // These placeholders will be converted back into real AST nodes by the main build script.
    const values = expressionCodeStrings.map(exprCode => `##__NEO_EXPR__${exprCode}##__NEO_EXPR__##`);

    // The HtmlTemplate class provides a convenient structure for handling template parts.
    const htmlTemplateInstance = new HtmlTemplate(strings, values);

    // 1. Flatten the template to handle nested templates.
    const { flatString, flatValues, attributeNameMap } = flattenTemplate(htmlTemplateInstance);
    // 2. Fix self-closing tags for parse5 compatibility.
    const stringWithClosingTags = flatString.replace(selfClosingComponentRegex, '<$1$2></$1>');
    // 3. Parse the flattened string into an AST.
    const ast = parse5.parseFragment(stringWithClosingTags, { sourceCodeLocationInfo: true });
    const parseState = { attrNameIndex: 0 };
    // 4. Convert the AST into the final VDOM object.
    const parsedVdom = convertAstToVdom(ast, flatValues, stringWithClosingTags, attributeNameMap, { trimWhitespace: true }, parseState);

    return parsedVdom;
}
