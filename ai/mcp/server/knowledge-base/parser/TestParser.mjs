import * as acorn from 'acorn';
import Base       from '../../../../../src/core/Base.mjs';
import logger     from '../logger.mjs';

/**
 * @summary Extracts knowledge chunks from Playwright test files.
 *
 * This parser is responsible for decomposing Playwright test files (`.spec.mjs`) into
 * granular knowledge chunks. It identifies:
 * 1.  **File Context:** Imports, setup calls, and top-level descriptions.
 * 2.  **Test Cases:** Individual `test()` blocks, extracting their description and body.
 *
 * It uses AST parsing (via `acorn`) to robustly handle test file structure, ensuring
 * that code comments and nested blocks are correctly processed. The generated chunks
 * include line number metadata to support precise navigation.
 *
 * @class Neo.ai.mcp.server.knowledge-base.parser.TestParser
 * @extends Neo.core.Base
 * @singleton
 */
class TestParser extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.knowledge-base.parser.TestParser'
         * @protected
         */
        className: 'Neo.ai.mcp.server.knowledge-base.parser.TestParser',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Parses a Playwright test file into granular chunks.
     * @param {String} content The raw file content.
     * @param {String} filePath The relative file path.
     * @returns {Array<Object>} An array of chunks (header + test cases).
     */
    parse(content, filePath) {
        const chunks = [];
        let ast;
        try {
            ast = acorn.parse(content, { sourceType: 'module', locations: true, ecmaVersion: 2022 });
        } catch (e) {
            logger.warn(`Failed to parse test file ${filePath}: ${e.message}`);
            return [];
        }

        const testNodes = [];

        const visit = (node) => {
            if (!node) return;

            // Handle ExpressionStatement (wraps calls at top level)
            if (node.type === 'ExpressionStatement') {
                visit(node.expression);
                return;
            }

            // Handle CallExpression
            if (node.type === 'CallExpression') {
                const callee = node.callee;
                // Check for test() or test.only(), test.skip(), test.fixme()
                const isTest =
                    (callee.name === 'test' && (!callee.property || ['only', 'skip', 'fixme'].includes(callee.property?.name))) ||
                    (callee.object?.name === 'test' && ['only', 'skip', 'fixme'].includes(callee.property?.name));

                if (isTest) {
                    testNodes.push(node);
                    return; // Do not recurse into test body
                }

                // Recurse into arguments to find nested tests (e.g. inside describe blocks)
                if (node.arguments) {
                    node.arguments.forEach(arg => {
                        if (arg.type === 'ArrowFunctionExpression' || arg.type === 'FunctionExpression') {
                            visit(arg.body);
                        }
                    });
                }
                return;
            }

            // Recurse standard block structures
            if (node.body) {
                if (Array.isArray(node.body)) node.body.forEach(visit);
                else visit(node.body);
            }
        };

        visit(ast);

        if (testNodes.length === 0) return [];

        // Sort by position to find the "header" cut-off
        testNodes.sort((a, b) => a.start - b.start);

        // 1. Header Chunk
        // Content up to the start of the first test.
        // This includes imports, setup, and the opening lines of any wrapping describe blocks.
        const headerEnd     = testNodes[0].start;
        const headerContent = content.substring(0, headerEnd).trim();

        if (headerContent.length > 0) {
            chunks.push({
                type   : 'test',
                kind   : 'test-header',
                name   : `${filePath} - [Context]`,
                content: headerContent,
                source : filePath
            });
        }

        // 2. Test Chunks
        testNodes.forEach(node => {
            let description = 'Unknown Test';
            if (node.arguments && node.arguments[0] && node.arguments[0].type === 'Literal') {
                description = node.arguments[0].value;
            }

            chunks.push({
                type      : 'test',
                kind      : 'test-case',
                name      : `${filePath} - ${description}`,
                content   : content.substring(node.start, node.end),
                source    : filePath,
                line_start: node.loc.start.line,
                line_end  : node.loc.end.line
            });
        });

        return chunks;
    }
}

export default Neo.setupClass(TestParser);
