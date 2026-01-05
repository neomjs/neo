import * as acorn from 'acorn';
import Base       from '../../../../../src/core/Base.mjs';
import logger     from '../logger.mjs';

/**
 * @summary Parses Neo.mjs source files into granular knowledge chunks.
 *
 * This parser decomposes ES modules (source code) into semantically meaningful chunks,
 * providing the Knowledge Base with deep insight into implementation details, not just
 * API signatures.
 *
 * It identifies and extracts:
 * 1.  **Module Context:** Imports, top-level variables, and the class definition header.
 * 2.  **Class Properties:** Static and instance fields (excluding `config`).
 * 3.  **Config Block:** The entire `static config` object as a single, cohesive unit.
 * 4.  **Methods:** Individual class methods including their bodies and JSDoc.
 *
 * It uses AST parsing (via `acorn`) to robustly handle the code structure.
 *
 * @class Neo.ai.mcp.server.knowledge-base.parser.SourceParser
 * @extends Neo.core.Base
 * @singleton
 */
class SourceParser extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.knowledge-base.parser.SourceParser'
         * @protected
         */
        className: 'Neo.ai.mcp.server.knowledge-base.parser.SourceParser',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Parses a Neo.mjs source file into granular chunks.
     * @param {String} content The raw file content.
     * @param {String} filePath The relative file path.
     * @param {String} [defaultType='src'] The type to assign to chunks (e.g., 'src', 'app', 'example').
     * @returns {Array<Object>} An array of chunks.
     */
    parse(content, filePath, defaultType='src') {
        const chunks = [];
        let ast;

        try {
            ast = acorn.parse(content, { sourceType: 'module', locations: true, ecmaVersion: 2022 });
        } catch (e) {
            logger.warn(`Failed to parse source file ${filePath}: ${e.message}`);
            return [];
        }

        const contextNodes    = [];
        const propertyNodes   = [];
        let   configNode      = null;
        const methodNodes     = [];
        let   classStart      = 0;
        let   classDefinition = '';

        // 1. Traverse AST to categorize nodes
        ast.body.forEach(node => {
            if (node.type === 'ImportDeclaration' || node.type === 'VariableDeclaration') {
                // Top-level imports and vars belong to Module Context
                contextNodes.push(node);
            } else if (node.type === 'ClassDeclaration' || node.type === 'ExportDefaultDeclaration') {
                // Handle Class Definition
                const classDecl = node.type === 'ExportDefaultDeclaration' ? node.declaration : node;

                if (classDecl.type === 'ClassDeclaration') {
                    classStart = classDecl.start;
                    // Capture JSDoc comments preceding the class
                    const classHeadEnd = classDecl.body.start + 1; // Include opening brace
                    classDefinition    = content.substring(classDecl.start, classHeadEnd);

                    // Iterate Class Body
                    classDecl.body.body.forEach(member => {
                        if (member.type === 'MethodDefinition') {
                            if (member.kind === 'constructor') {
                                methodNodes.push(member);
                            } else {
                                methodNodes.push(member);
                            }
                        } else if (member.type === 'PropertyDefinition') {
                            if (member.key.name === 'config' && member.static) {
                                configNode = member;
                            } else {
                                propertyNodes.push(member);
                            }
                        }
                    });
                }
            }
        });

        // 2. Extract Module Context Chunk
        // Includes imports, top-level vars, and the class header (docs + signature)
        let contextContent = '';
        if (contextNodes.length > 0) {
            // Get content from start of file to end of last context node
            const lastNode = contextNodes[contextNodes.length - 1];
            contextContent = content.substring(0, lastNode.end) + '\n\n';
        }
        // Add the class definition line (and its JSDoc if adjacent)
        // We need to be careful not to duplicate if variables are interleaved, but in Neo structure
        // imports/vars usually come before class.
        // A simpler approach: Context is everything *before* the class body starts, minus the class body content itself.
        // But we want to be specific.
        
        // Revised Context Strategy:
        // Everything from start of file up to the opening brace of the class.
        if (classStart > 0) {
             const preClassContent = content.substring(0, classStart).trim();
             contextContent = (preClassContent ? preClassContent + '\n\n' : '') + classDefinition;
        }

        if (contextContent.trim()) {
            chunks.push({
                type      : defaultType,
                kind      : 'module-context',
                name      : `${filePath} - [Module Context]`,
                content   : contextContent.trim(),
                source    : filePath,
                line_start: 1,
                line_end  : ast.loc.end.line // Approximation
            });
        }

        // 3. Extract Class Properties Chunk
        if (propertyNodes.length > 0) {
            // We join the raw source of all property nodes
            const propsContent = propertyNodes.map(node => content.substring(node.start, node.end)).join('\n\n');
            chunks.push({
                type      : defaultType,
                kind      : 'class-properties',
                name      : `${filePath} - [Class Properties]`,
                content   : propsContent,
                source    : filePath,
                line_start: propertyNodes[0].loc.start.line,
                line_end  : propertyNodes[propertyNodes.length - 1].loc.end.line
            });
        }

        // 4. Extract Config Chunk
        if (configNode) {
            chunks.push({
                type      : defaultType,
                kind      : 'class-config',
                name      : `${filePath} - [Config]`,
                content   : content.substring(configNode.start, configNode.end),
                source    : filePath,
                line_start: configNode.loc.start.line,
                line_end  : configNode.loc.end.line
            });
        }

        // 5. Extract Method Chunks
        methodNodes.forEach(node => {
            const methodName = node.key.name || '[computed]';
            chunks.push({
                type      : defaultType,
                kind      : 'method',
                name      : `${filePath} - ${methodName}()`,
                content   : content.substring(node.start, node.end),
                source    : filePath,
                line_start: node.loc.start.line,
                line_end  : node.loc.end.line
            });
        });

        return chunks;
    }
}

export default Neo.setupClass(SourceParser);
