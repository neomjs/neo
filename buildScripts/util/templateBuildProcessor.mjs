import fs from 'fs';
import path from 'path';
import vm from 'vm';

import { HtmlTemplate } from '../../src/functional/util/html.mjs';
import * as parse5 from '../../dist/parse5.mjs'; // parse5 is bundled and available

// Import Neo and core modules directly. Neo.mjs initializes globalThis.Neo.
import Neo from '../../src/Neo.mjs';
import * as core from '../../src/core/_export.mjs';

// *******************************************************************
// Logic moved from src/functional/util/HtmlTemplateProcessorLogic.mjs
// *******************************************************************

const
    regexAttribute       = /\s+([a-zA-Z][^=]*)\s*=\s*"?$/,
    regexDynamicValue    = /^__DYNAMIC_VALUE_(\d+)__$/,
    regexDynamicValueG   = /__DYNAMIC_VALUE_(\d+)__/g,
    regexNested          = /(__DYNAMIC_VALUE_|neotag)(\d+)/g,
    regexOriginalTagName = /<([\w\.]+)/;

function convertNodeToVdom(node, values, originalString, attributeNames, options, parseState) {
    // 1. Handle text nodes: Convert text content, re-inserting any dynamic values.
    if (node.nodeName === '#text') {
        let text = node.value;

        if (options?.trimWhitespace) {
            text = text.replace(/\s+/g, ' ').trim();
        }

        if (text === '') return null;

        if (!options?.trimWhitespace && text.trim() === '') {
            return null;
        }

        const regex = /(__DYNAMIC_VALUE_\d+__)/g;
        const parts = text.split(regex).filter(p => p);

        if (parts.length === 1 && !parts[0].match(regex)) {
            return {vtype: 'text', text: parts[0]};
        }

        if (parts.length === 1 && parts[0].match(/^__DYNAMIC_VALUE_\d+__$/)) {
            const index = parseInt(parts[0].match(/\d+/)[0], 10);
            const value = values[index];
            return {vtype: 'text', text: value};
        }

        const expressionParts = parts.map(part => {
            const match = part.match(/__DYNAMIC_VALUE_(\d+)__/);
            if (match) {
                const index = parseInt(match[1], 10);
                const value = values[index];
                const exprMatch = typeof value === 'string' && value.match(/##__NEO_EXPR__(.*)##__NEO_EXPR__##/);
                if (exprMatch) {
                    return `\${${exprMatch[1]}}`;
                } else {
                    return `\${${JSON.stringify(value)}}`;
                }
            }
            return part.replace(/\\/g, '\\\\').replace(/`/g, '\`').replace(/\${/g, '\\${');
        });

        const finalExpression = `\`${expressionParts.join('')}\``;

        return {vtype: 'text', text: `##__NEO_EXPR__${finalExpression}##__NEO_EXPR__##`};
    }

    // 2. Handle element nodes
    if (node.nodeName && node.sourceCodeLocation?.startTag) {
        const
            vdom    = {},
            tagName = node.tagName;

        if (tagName.startsWith('neotag')) {
            const index = parseInt(tagName.replace('neotag', ''), 10);
            vdom.module = values[index]
        } else {
            const
                {startTag}      = node.sourceCodeLocation,
                startTagStr     = originalString.substring(startTag.startOffset, startTag.endOffset),
                originalTagName = startTagStr.match(regexOriginalTagName)[1];

            if (originalTagName[0] === originalTagName[0].toUpperCase()) {
                // For build-time processing, create a placeholder instead of resolving the namespace
                vdom.module = { __neo_component_name__: originalTagName };
            } else {
                vdom.tag = originalTagName
            }
        }

        node.attrs?.forEach(attr => {
            const match = attr.value.match(regexDynamicValue);
            if (match) {
                const attrName = attributeNames[parseState.attrNameIndex++] || attr.name;
                vdom[attrName] = values[parseInt(match[1], 10)]
            } else {
                vdom[attr.name] = attr.value.replace(regexDynamicValueG, (m, i) => values[parseInt(i, 10)])
            }
        });

        if (node.childNodes?.length > 0) {
            vdom.cn = node.childNodes.map(child => convertNodeToVdom(child, values, originalString, attributeNames, options, parseState)).filter(Boolean);

            if (vdom.cn.length === 1 && vdom.cn[0].vtype === 'text') {
                vdom.text = vdom.cn[0].text;
                delete vdom.cn
            }
        }

        return vdom
    }

    return null
}

function convertAstToVdom(ast, values, originalString, attributeNames, options, parseState) {
    if (!ast.childNodes || ast.childNodes.length < 1) {
        return {}
    }

    const children = ast.childNodes.map(child => convertNodeToVdom(child, values, originalString, attributeNames, options, parseState)).filter(Boolean);

    if (children.length === 1) {
        return children[0]
    }

    return {cn: children}
}

function flattenTemplate(template) {
    let flatString = '';
    const
        flatValues     = [],
        attributeNames = [];

    for (let i = 0; i < template.strings.length; i++) {
        let str = template.strings[i];
        const attrMatch = str.match(regexAttribute);
        if (attrMatch) {
            attributeNames.push(attrMatch[1])
        }

        flatString += str;

        if (i < template.values.length) {
            const value = template.values[i];

            if (value instanceof HtmlTemplate) {
                const nested = flattenTemplate(value);
                const nestedString = nested.flatString.replace(regexNested, (match, p1, p2) => {
                    return `${p1}${parseInt(p2, 10) + flatValues.length}`
                });

                flatString += nestedString;
                flatValues.push(...nested.flatValues);
                attributeNames.push(...nested.attributeNames)
            }
            else if (value !== false && value != null) {
                if (template.strings[i].trim().endsWith('<') || template.strings[i].trim().endsWith('</')) {
                    flatString += `neotag${flatValues.length}`
                } else {
                    flatString += `__DYNAMIC_VALUE_${flatValues.length}__`
                }

                flatValues.push(value)
            }
        }
    }

    return {flatString, flatValues, attributeNames}
}

/**
 * Processes a single HTML tagged template literal at build time.
 * It evaluates the dynamic expressions and then uses the internal logic
 * to convert the template into a JSON VDOM.
 * @param {Array<string>} strings The static string parts of the template literal.
 * @param {Array<string>} expressionCodeStrings The JavaScript code strings for the dynamic parts.
 * @param {Object} componentNameMap A map of component names (e.g., 'Button') to their placeholder objects.
 * @returns {Promise<Object>} A promise that resolves to the resulting JSON VDOM object.
 */
export async function processHtmlTemplateLiteral(strings, expressionCodeStrings, componentNameMap = {}) {
    const values = [];

    const context = vm.createContext({
        Neo: Neo,
        Math: Math,
        JSON: JSON,
        console: console,
        ...componentNameMap,
    });

    for (const exprCode of expressionCodeStrings) {
        try {
            const evaluatedValue = await vm.runInContext(`(async () => { return ${exprCode} })();`, context);
            values.push(evaluatedValue);
        } catch (e) {
            values.push(`##__NEO_EXPR__${exprCode}##__NEO_EXPR__##`);
        }
    }

    const htmlTemplateInstance = new HtmlTemplate(strings, values);

    const { flatString, flatValues, attributeNames } = flattenTemplate(htmlTemplateInstance);
    const ast = parse5.parseFragment(flatString, { sourceCodeLocationInfo: true });
    const parseState = { attrNameIndex: 0 };
    const parsedVdom = convertAstToVdom(ast, flatValues, flatString, attributeNames, { trimWhitespace: true }, parseState);

    return parsedVdom;
}