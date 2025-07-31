import fs from 'fs';
import path from 'path';
import vm from 'vm';

import { HtmlTemplate } from '../../src/functional/util/html.mjs';
import * as parse5 from '../../dist/parse5.mjs'; // parse5 is bundled and available

// Import Neo and core modules directly. Neo.mjs initializes globalThis.Neo.
import Neo from '../../src/Neo.mjs';
import * as core from '../../src/core/_export.mjs';
import { convertAstToVdom, flattenTemplate } from '../../src/functional/util/HtmlTemplateProcessorLogic.mjs';

/**
 * Processes a single HTML tagged template literal at build time.
 * It evaluates the dynamic expressions and then uses HtmlTemplateProcessorLogic
 * to convert the template into a JSON VDOM.
 * @param {Array<string>} strings The static string parts of the template literal.
 * @param {Array<string>} expressionCodeStrings The JavaScript code strings for the dynamic parts.
 * @param {Object} componentNameMap A map of component names (e.g., 'Button') to their placeholder objects.
 * @returns {Promise<Object>} A promise that resolves to the resulting JSON VDOM object.
 */
export async function processHtmlTemplateLiteral(strings, expressionCodeStrings, componentNameMap = {}) {
    const values = [];

    // Create a sandboxed context for evaluating expressions
    const context = vm.createContext({
        Neo: Neo, // Use the actual Neo object
        Math: Math,
        JSON: JSON,
        console: console,
        ...componentNameMap, // Add component name placeholders to the context
    });

    for (const exprCode of expressionCodeStrings) {
        try {
            // Attempt to evaluate the expression. If it fails, it's likely a runtime-dependent expression.
            const evaluatedValue = await vm.runInContext(`(async () => { return ${exprCode} })();`, context);
            values.push(evaluatedValue);
        } catch (e) {
            // If evaluation fails, push a special placeholder indicating a runtime expression.
            values.push(`##__NEO_EXPR__${exprCode}##__NEO_EXPR__##`);
        }
    }

    const htmlTemplateInstance = new HtmlTemplate(strings, values);

    // Call the imported functions from the logic module directly.
    const { flatString, flatValues, attributeNames } = flattenTemplate(htmlTemplateInstance);
    const ast = parse5.parseFragment(flatString, { sourceCodeLocationInfo: true });
    const parsedVdom = convertAstToVdom(ast, flatValues, flatString, attributeNames, null, { trimWhitespace: true });

    return parsedVdom;
}
