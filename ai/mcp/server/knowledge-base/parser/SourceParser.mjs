import * as acorn from 'acorn';
import path       from 'path';
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

        // Strip shebang if present (acorn doesn't handle it)
        if (content.startsWith('#!')) {
            content = content.replace(/^#!.*\n/, '');
        }

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
        let   className       = '';
        let   superClass      = '';
        const imports         = {}; // Map local name to import source

        // 1. Traverse AST to categorize nodes
        ast.body.forEach(node => {
            if (node.type === 'ImportDeclaration') {
                // Top-level imports
                contextNodes.push(node);
                const source = node.source.value;
                node.specifiers.forEach(specifier => {
                    imports[specifier.local.name] = source;
                });
            } else if (node.type === 'VariableDeclaration') {
                contextNodes.push(node);
            } else if (node.type === 'ClassDeclaration' || node.type === 'ExportDefaultDeclaration') {
                // Handle Class Definition
                const classDecl = node.type === 'ExportDefaultDeclaration' ? node.declaration : node;

                if (classDecl.type === 'ClassDeclaration') {
                    classStart = classDecl.start;
                    // Capture JSDoc comments preceding the class
                    const classHeadEnd = classDecl.body.start + 1; // Include opening brace
                    classDefinition    = content.substring(classDecl.start, classHeadEnd);

                    if (classDecl.id) {
                        className = classDecl.id.name;
                    }

                    if (classDecl.superClass) {
                        let localSuperName;
                        if (classDecl.superClass.type === 'Identifier') {
                            localSuperName = classDecl.superClass.name;
                        } else if (classDecl.superClass.type === 'MemberExpression') {
                            // Handle Neo.core.Base style (already fully qualified-ish)
                            let object = classDecl.superClass;
                            let parts  = [];
                            while(object.type === 'MemberExpression') {
                                parts.unshift(object.property.name);
                                object = object.object;
                            }
                            if (object.type === 'Identifier') {
                                parts.unshift(object.name);
                            }
                            superClass = parts.join('.');
                        }

                        // Try to resolve import for Identifier
                        if (localSuperName) {
                            if (imports[localSuperName]) {
                                try {
                                    // Resolve relative path to absolute file path
                                    // Assumption: filePath is relative to project root (e.g. src/component/Base.mjs)
                                    // imports[localSuperName] is e.g. '../../core/Base.mjs'
                                    const dir = path.dirname(filePath);
                                    const resolvedPath = path.join(dir, imports[localSuperName]);
                                    
                                    // Normalize path separators
                                    const normalizedPath = resolvedPath.replace(/\\/g, '/');

                                    // Convert file path to class name
                                    // Heuristic: src/foo/Bar.mjs -> Neo.foo.Bar
                                    if (normalizedPath.startsWith('src/')) {
                                        superClass = 'Neo.' + normalizedPath
                                            .substring(4) // remove src/
                                            .replace(/\.mjs$/, '')
                                            .replace(/\//g, '.');
                                    } else if (normalizedPath.startsWith('apps/')) {
                                        // apps/portal/view/Main.mjs -> Portal.view.Main (Heuristic)
                                        // This is harder because app namespace != folder name always.
                                        // For now, let's just map path segments.
                                        const parts = normalizedPath.split('/');
                                        const appName = parts[1]; // apps/<appName>/...
                                        // Capitalize app name
                                        const ns = appName.charAt(0).toUpperCase() + appName.slice(1);
                                        superClass = ns + '.' + parts.slice(2).join('.').replace(/\.mjs$/, '');
                                    } else {
                                        // Fallback to local name if we can't map to namespace
                                        superClass = localSuperName;
                                    }
                                } catch (err) {
                                    superClass = localSuperName;
                                }
                            } else {
                                superClass = localSuperName;
                            }
                        }
                    }

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

                                // Extract className from static config (Prioritize this over local identifier)
                                if (member.value.type === 'ObjectExpression') {
                                    const classNameProp = member.value.properties.find(p => p.key.name === 'className');
                                    if (classNameProp && classNameProp.value.type === 'Literal') {
                                        className = classNameProp.value.value;
                                    }
                                }
                            } else {
                                propertyNodes.push(member);
                            }
                        }
                    });
                }
            }
        });

        // Resolve fully qualified className if possible (naive approach for now, relying on config)
        // If className is still empty, we rely on what we found.

        const commonMetadata = {
            className,
            extends: superClass
        };

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
                line_end  : ast.loc.end.line, // Approximation
                ...commonMetadata
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
                line_end  : propertyNodes[propertyNodes.length - 1].loc.end.line,
                ...commonMetadata
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
                line_end  : configNode.loc.end.line,
                ...commonMetadata
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
                line_end  : node.loc.end.line,
                ...commonMetadata
            });
        });

        return chunks;
    }
}

export default Neo.setupClass(SourceParser);
