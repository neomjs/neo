import { HtmlTemplate } from '../../src/functional/util/html.mjs';
import * as parse5 from '../../dist/parse5.mjs'; // parse5 is bundled and available

// *******************************************************************
// Logic moved from src/functional/util/HtmlTemplateProcessorLogic.mjs
// *******************************************************************

const
    regexAttribute            = /\s+([a-zA-Z][^=]*)\s*=\s*"?$/, 
    regexDynamicValue         = /^__DYNAMIC_VALUE_(\d+)__$/, 
    regexDynamicValueG        = /__DYNAMIC_VALUE_(\d+)__/g,
    regexNested               = /(__DYNAMIC_VALUE_|neotag)(\d+)/g,
    regexOriginalTagName      = /<([\w\.]+)/,
    selfClosingComponentRegex = /<((?:[A-Z][\w\.]*)|(?:neotag\d+))([^>]*?)\/\>/g,
    // For escaping strings to be used inside a template literal
    regexEscapeBackslashes    = /\\/g,
    regexEscapeBackticks      = /`/g,
    regexEscapeDollarBrackets = /\${/g;

function escapeStringForTemplateLiteral(str) {
    return str.replace(regexEscapeBackslashes, '\\')
              .replace(regexEscapeBackticks, '\`')
              .replace(regexEscapeDollarBrackets, '\${');
}

function convertNodeToVdom(node, values, originalString, attributeNameMap, options, parseState) {
    // 1. Handle text nodes: Convert text content, re-inserting any dynamic values.
    if (node.nodeName === '#text') {
        let text = node.value;

        if (options?.trimWhitespace) {
            text = text.replace(/\s+/g, ' ').trim();
        }

        if (text === '') return null;

        // This is the crucial part for conditional rendering (e.g., `${condition && template}`).
        // If a text node is just a single dynamic value, return the raw placeholder.
        const singleDynamicMatch = text.match(/^__DYNAMIC_VALUE_(\d+)__$/);
        if (singleDynamicMatch) {
            const index = parseInt(singleDynamicMatch[1], 10);
            return values[index]; // Return the raw '##__NEO_EXPR__...##' placeholder
        }

        // If the text node is a mix of strings and dynamic values, create a template literal expression.
        const regex = /(__DYNAMIC_VALUE_\d+__)/g;
        const parts = text.split(regex).filter(p => p);

        if (parts.length > 1) {
            const expressionParts = parts.map(part => {
                const match = part.match(/__DYNAMIC_VALUE_(\d+)__/);
                if (match) {
                    const index = parseInt(match[1], 10);
                    const value = values[index]; // This is the '##__NEO_EXPR__...' string
                    const exprMatch = value.match(/##__NEO_EXPR__(.*)##__NEO_EXPR__##/s);
                    if (exprMatch) {
                        return `\${exprMatch[1]}`;
                    }
                }
                return escapeStringForTemplateLiteral(part);
            });
            const finalExpression = `\`${expressionParts.join('')}\`
`;
            return { vtype: 'text', text: `##__NEO_EXPR__${finalExpression}##__NEO_EXPR__##` };
        }

        // It's a simple static text node
        return { vtype: 'text', text };
    }

    // 2. Handle element nodes
    if (node.nodeName && node.sourceCodeLocation?.startTag) {
        const vdom = {};
        const tagName = node.tagName;

        if (tagName.startsWith('neotag')) {
            const index = parseInt(tagName.replace('neotag', ''), 10);
            vdom.module = values[index];
        } else {
            const { startTag } = node.sourceCodeLocation;
            const startTagStr = originalString.substring(startTag.startOffset, startTag.endOffset);
            const originalTagNameMatch = startTagStr.match(regexOriginalTagName);
            if (originalTagNameMatch) {
                const originalTagName = originalTagNameMatch[1];
                if (originalTagName[0] === originalTagName[0].toUpperCase()) {
                    vdom.module = { __neo_component_name__: originalTagName };
                } else {
                    vdom.tag = originalTagName;
                }
            } else {
                vdom.tag = tagName;
            }
        }

        node.attrs?.forEach(attr => {
            const match = attr.value.match(regexDynamicValue);
            if (match) {
                const dynamicValueIndex = parseInt(match[1], 10);
                // Use the map to get the correct, original attribute name
                const attrName = attributeNameMap[dynamicValueIndex] || attr.name;
                vdom[attrName] = values[dynamicValueIndex];
            } else {
                // For attributes with mixed content, we need to reconstruct the expression
                let hasDynamicPart = false;
                const valueParts = attr.value.split(regexDynamicValueG).map(part => {
                    if (part.match(/^\d+$/)) {
                        const index = parseInt(part, 10);
                        if (values[index]) {
                            hasDynamicPart = true;
                            const value = values[index];
                            const exprMatch = value.match(/##__NEO_EXPR__(.*)##__NEO_EXPR__##/s);
                            return exprMatch ? `\${exprMatch[1]}` : JSON.stringify(value);
                        }
                    }
                    return escapeStringForTemplateLiteral(part);
                });

                if (hasDynamicPart) {
                    const finalExpression = `\`${valueParts.join('')}\`
`;
                    vdom[attr.name] = `##__NEO_EXPR__${finalExpression}##__NEO_EXPR__##`;
                } else {
                    vdom[attr.name] = attr.value;
                }
            }
        });

        if (node.childNodes?.length > 0) {
            const children = node.childNodes.map(child => convertNodeToVdom(child, values, originalString, attributeNameMap, options, parseState)).filter(Boolean);
            if (children.length > 0) {
                // Optimization: If a node has only one child, check if it's a text node
                // (either static or a dynamic expression) and simplify the VDOM accordingly.
                if (children.length === 1) {
                    const child = children[0];
                    if (child.vtype === 'text') {
                        vdom.text = child.text;
                    } else if (typeof child === 'string' && child.startsWith('##__NEO_EXPR__')) {
                        // This is a dynamic text node, assign the expression to the text property
                        vdom.text = child;
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


function convertAstToVdom(ast, values, originalString, attributeNameMap, options, parseState) {
    if (!ast.childNodes || ast.childNodes.length < 1) {
        return {};
    }

    const children = ast.childNodes.map(child => convertNodeToVdom(child, values, originalString, attributeNameMap, options, parseState)).filter(Boolean);

    if (children.length === 1) {
        return children[0];
    }

    return { cn: children };
}

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
                // For nested templates, we need to adjust the dynamic value indices
                const nestedStartIndex = flatValues.length;
                const nested = flattenTemplate(value, flatValues, attributeNameMap);
                const nestedString = nested.flatString.replace(regexNested, (match, p1, p2) => {
                    return `${p1}${parseInt(p2, 10) + nestedStartIndex}`;
                });
                flatString += nestedString;
                // flatValues and attributeNameMap are already updated by the recursive call
            } else if (value !== false && value != null) {
                const currentIndex = flatValues.length;
                if (attrMatch) {
                    attributeNameMap[currentIndex] = attrMatch[1];
                }

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
 * Processes a single HTML tagged template literal at build time.
 * It preserves the dynamic expressions and then uses the internal logic
 * to convert the template into a JSON VDOM.
 * @param {string[]} strings The static string parts of the template literal.
 * @param {string[]} expressionCodeStrings The JavaScript code strings for the dynamic parts.
 * @returns {Object} The resulting JSON VDOM object.
 */
export function processHtmlTemplateLiteral(strings, expressionCodeStrings) {
    // Instead of evaluating, wrap expressions in placeholders
    const values = expressionCodeStrings.map(exprCode => `##__NEO_EXPR__${exprCode}##__NEO_EXPR__##`);

    const htmlTemplateInstance = new HtmlTemplate(strings, values);

    const { flatString, flatValues, attributeNameMap } = flattenTemplate(htmlTemplateInstance);
    const stringWithClosingTags = flatString.replace(selfClosingComponentRegex, '<$1$2></$1>');
    const ast = parse5.parseFragment(stringWithClosingTags, { sourceCodeLocationInfo: true });
    const parseState = { attrNameIndex: 0 }; // This might be obsolete now with the map
    const parsedVdom = convertAstToVdom(ast, flatValues, stringWithClosingTags, attributeNameMap, { trimWhitespace: true }, parseState);

    return parsedVdom;
}