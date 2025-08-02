import * as acorn                   from 'acorn';
import {generate}                   from 'astring';
import {processHtmlTemplateLiteral} from './templateBuildProcessor.mjs';

/**
 * This module provides a self-contained, reusable pipeline for transforming `html` tagged
 * template literals within a JavaScript file into standard Neo.mjs VDOM objects.
 * It is designed to be called from any build script (`dist/esm`, Webpack, etc.) to ensure
 * consistent template processing across all build environments.
 *
 * The core strategy is a full Abstract Syntax Tree (AST) transformation:
 * 1. A string of JS code is parsed into an AST using `acorn`.
 * 2. The AST is traversed to find all `html` tagged template expressions.
 * 3. Each found template is processed by `templateBuildProcessor.mjs`, which converts the
 *    HTML-like syntax into a serializable VDOM object, carefully preserving any
 *    embedded JavaScript expressions as placeholders.
 * 4. This VDOM object is then converted back into a valid AST `ObjectExpression` node.
 * 5. The original `TaggedTemplateExpression` node is replaced in the main AST with the
 *    new `ObjectExpression` node.
 * 6. Finally, the modified AST is converted back into a string of JavaScript code using `astring`.
 *
 * This AST-centric approach is robust and correctly handles complex scenarios like nested
 * templates and varied JavaScript expressions, which are difficult to manage with
 * simpler methods like regular expressions.
 */

const regexHtml = /html\s*`/;

/**
 * Converts a serializable VDOM object into a valid Acorn AST `ObjectExpression`.
 * This function is the critical bridge between the intermediate VDOM representation and the
 * final, executable code. It recursively builds the AST, paying special attention to the
 * `##__NEO_EXPR__...##` placeholders.
 *
 * When a placeholder is found, this function extracts the raw expression string and uses
 * `acorn.parseExpressionAt` to parse it into a proper AST node. This ensures that runtime
 * expressions are injected directly into the final AST, preserving them perfectly for
 * when the code is executed in the browser.
 *
 * @param {object} json The JSON-like VDOM object from the template processor.
 * @returns {object} A valid Acorn AST node representing the VDOM.
 * @private
 */
function jsonToAst(json) {
    if (json === null) {
        return { type: 'Literal', value: null };
    }
    switch (typeof json) {
        case 'string':
            const exprMatch = json.match(/^##__NEO_EXPR__(.*)##__NEO_EXPR__##$/s);
            if (exprMatch) {
                try {
                    return acorn.parseExpressionAt(exprMatch[1], 0, {ecmaVersion: 'latest'});
                } catch (e) {
                    console.error(`Failed to parse expression: ${exprMatch[1]}`, e);
                    return { type: 'Literal', value: json };
                }
            }
            return { type: 'Literal', value: json };
        case 'number':
        case 'boolean':
            return { type: 'Literal', value: json };
        case 'object':
            if (json.__neo_component_name__) {
                return { type: 'Identifier', name: json.__neo_component_name__ };
            }
            if (Array.isArray(json)) {
                return {
                    type: 'ArrayExpression',
                    elements: json.map(jsonToAst)
                };
            }
            const properties = Object.entries(json).map(([key, value]) => {
                const keyNode = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
                    ? { type: 'Identifier', name: key }
                    : { type: 'Literal', value: key };
                return {
                    type: 'Property',
                    key: keyNode,
                    value: jsonToAst(value),
                    kind: 'init',
                    computed: keyNode.type === 'Literal'
                };
            });
            return { type: 'ObjectExpression', properties };
        default:
            return { type: 'Literal', value: null };
    }
}

/**
 * Performs a true post-order traversal of the AST (children before parent).
 * This traversal strategy is essential for this transformation. By processing the innermost
 * `html` templates first, we ensure that a nested template is already converted into an
 * `ObjectExpression` before its parent template is processed. The parent can then treat
 * the nested result as just another expression, leading to a clean, recursive solution.
 * @param {object} node The current AST node to start traversal from.
 * @param {function} visitor The visitor function to call on each node after its children have been visited.
 * @private
 */
function postOrderWalk(node, visitor) {
    if (!node) return;

    Object.entries(node).forEach(([key, value]) => {
        if (key === 'parent') return;
        if (Array.isArray(value)) {
            value.forEach(child => postOrderWalk(child, visitor));
        } else if (typeof value === 'object' && value !== null) {
            postOrderWalk(value, visitor);
        }
    });

    visitor(node);
}

/**
 * Recursively adds parent pointers to each node in the AST.
 * While ASTs are typically one-way trees, having a back-reference to the parent makes
 * node replacement trivial. Instead of complex logic to find and splice a node in its
 * parent's `body` or `expressions` array, we can simply access `node.parent` to perform
 * the replacement.
 * @param {object} node The current AST node.
 * @param {object|null} parent The parent of the current node.
 * @private
 */
function addParentLinks(node, parent) {
    if (!node || typeof node !== 'object') return;
    node.parent = parent;
    for (const key in node) {
        if (key === 'parent') continue;
        const child = node[key];
        if (Array.isArray(child)) {
            child.forEach(c => addParentLinks(c, node));
        } else {
            addParentLinks(child, node);
        }
    }
}

/**
 * The main exported function for this module. It orchestrates the entire transformation.
 * As an optimization, it first performs a quick regex check to see if a template
 * likely exists, avoiding the expensive AST parsing for the vast majority of files.
 * @param {string} fileContent The raw source code of the file to process.
 * @param {string} filePath The path to the file, used for logging errors.
 * @returns {{content: string, hasChanges: boolean}} An object containing the transformed
 * code and a flag indicating if any changes were made.
 */
export function processFileContent(fileContent, filePath) {
    // Optimization: a quick regex check is much faster than parsing every file.
    if (!regexHtml.test(fileContent)) {
        return { content: fileContent, hasChanges: false };
    }

    try {
        const ast = acorn.parse(fileContent, {ecmaVersion: 'latest', sourceType: 'module'});
        addParentLinks(ast, null);

        let hasChanges = false;

        postOrderWalk(ast, (node) => {
            if (node.type === 'TaggedTemplateExpression' && node.tag.type === 'Identifier' && node.tag.name === 'html') {
                hasChanges = true;

                // As a quality-of-life feature, if a template is the return value of a method
                // named `render`, we automatically rename the method to `createVdom`.
                let current = node;
                while (current.parent) {
                    const parent = current.parent;
                    if ((parent.type === 'MethodDefinition' || parent.type === 'Property') && parent.key.name === 'render') {
                        parent.key.name = 'createVdom';
                        break;
                    }
                    current = parent;
                }

                const templateLiteral = node.quasi;
                const strings = templateLiteral.quasis.map(q => q.value.cooked);
                const expressionCodeStrings = templateLiteral.expressions.map(exprNode => generate(exprNode));

                const vdom = processHtmlTemplateLiteral(strings, expressionCodeStrings);
                const vdomAst = jsonToAst(vdom);

                const parent = node.parent;
                for (const key in parent) {
                    if (parent[key] === node) {
                        parent[key] = vdomAst;
                        return;
                    }
                    if (Array.isArray(parent[key])) {
                        const index = parent[key].indexOf(node);
                        if (index > -1) {
                            parent[key][index] = vdomAst;
                            return;
                        }
                    }
                }
            }
        });

        return {
            content: hasChanges ? generate(ast) : fileContent,
            hasChanges
        };
    } catch (e) {
        console.error(`Error processing HTML template in: ${filePath}`);
        console.error(e);
        return { content: fileContent, hasChanges: false };
    }
}
