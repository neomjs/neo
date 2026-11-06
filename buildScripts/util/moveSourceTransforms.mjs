import {parse}                        from 'acorn';
import path                           from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {staticSpecifier}              from './esmDistTransforms.mjs';

/**
 * @module buildScripts/util/moveSourceTransforms
 * @summary Source-range transforms for module relocation, without executing or reprinting source modules.
 */

/**
 * @summary Visits AST nodes with their parent, allowing a replacement to suppress descendant edits.
 * @param {Object} node Acorn node.
 * @param {Function} visit Visitor returning false to stop descent.
 * @param {Object|null} [parent=null] Parent node.
 * @param {Object[]} [ancestors=[]] Enclosing nodes, nearest last.
 * @returns {void}
 */
function walk(node, visit, parent=null, ancestors=[]) {
    if (!node || typeof node !== 'object' || typeof node.type !== 'string') return;
    if (visit(node, parent, ancestors) === false) return;

    const next = [...ancestors, node];
    for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(child => walk(child, visit, node, next));
        else if (value && typeof value === 'object') walk(value, visit, node, next);
    }
}

/**
 * @summary Reads an identifier or literal property key without evaluating computed expressions.
 * @param {Object} node Property or member key.
 * @returns {String|undefined}
 */
function keyName(node) {
    return node?.type === 'Identifier' ? node.name : node?.type === 'Literal' ? node.value : undefined
}

/**
 * @summary Finds canonical class names declared by classes and Engine functional factories.
 * @param {String} code Module source.
 * @returns {String[]}
 */
export function moduleClassNames(code) {
    return moduleInfo(code).classNames
}

/**
 * @summary Reads literal class declarations and application theme projections without executing a module.
 * @param {String} code Module source.
 * @param {Object} [context] Source identity for resolving Engine factory imports.
 * @param {String} [context.file] Absolute module path.
 * @param {String} [context.engineRoot] Canonical Engine package root.
 * @returns {Object} Class names and Neo.app declarations; null fields represent nonliteral config values.
 */
export function moduleInfo(code, {file, engineRoot}={}) {
    const names = [], applications = [], classes = [], imports = [],
        ast     = parse(code, {ecmaVersion: 'latest', sourceType: 'module'});

    for (const node of ast.body) {
        if (node.type !== 'ImportDeclaration') continue;
        for (const specifier of node.specifiers) imports.push({source: node.source.value, local: specifier.local.name,
            imported: specifier.type === 'ImportDefaultSpecifier' ? 'default' :
                specifier.type === 'ImportNamespaceSpecifier' ? '*' : keyName(specifier.imported)});
    }

    const factories = imports.filter(entry => {
        if (!entry.source.startsWith('.')) return false;
        const target = file && engineRoot
            ? path.relative(engineRoot, fileURLToPath(new URL(entry.source, pathToFileURL(file)))).split(path.sep).join('/')
            : entry.source.replace(/^(?:\.\.\/|\.\/)+/, '');
        return target === 'src/functional/_export.mjs' && ['defineComponent', '*'].includes(entry.imported) ||
            target === 'src/functional/defineComponent.mjs' && ['default', 'defineComponent', '*'].includes(entry.imported);
    });

    walk(ast, (node, parent, ancestors) => {
        if (node.type === 'CallExpression') {
            const factory = factories.find(entry => memberName(node.callee) ===
                (entry.imported === '*' ? `${entry.local}.defineComponent` : entry.local));
            if (factory && !shadowsBinding(ancestors, factory.local)) {
                const spec = node.arguments[0], config = spec?.type === 'ObjectExpression' &&
                    spec.properties.find(item => !item.computed && keyName(item.key) === 'config')?.value,
                    declaration = config?.type === 'ObjectExpression' &&
                        config.properties.find(item => !item.computed && keyName(item.key) === 'className')?.value;
                if (typeof declaration?.value === 'string') names.push(declaration.value);
            }
        }
        if (['ClassDeclaration', 'ClassExpression'].includes(node.type)) {
            const config = node.body.body.find(member => member.type === 'PropertyDefinition' && member.static &&
                    !member.computed && keyName(member.key) === 'config')?.value,
                declaration = config?.properties?.find(property => !property.computed && keyName(property.key) === 'className')?.value,
                base = node.superClass?.type === 'Identifier' ? imports.find(entry => entry.local === node.superClass.name) : null;
            classes.push({start: node.start, end: node.end, binding: node.id?.name,
                className  : declaration?.type === 'Literal' ? declaration.value : null,
                configStart: config?.start, configEnd: config?.end,
                baseImport : base?.source ?? null, baseImported: base?.imported ?? null,
                baseName   : node.superClass ? memberName(node.superClass) : null});
        }
        if (node.type === 'CallExpression' && memberName(node.callee) === 'Neo.app' &&
            node.arguments[0]?.type === 'ObjectExpression') {
            const properties = node.arguments[0].properties,
                read         = key => properties.find(property => !property.computed && keyName(property.key) === key)?.value,
                name         = read('name'), theme = read('appThemeFolder');

            applications.push({name: name?.type === 'Literal' ? name.value : null,
                appThemeFolder: theme?.type === 'Literal' ? theme.value : null, hasThemeFolder: Boolean(theme)});
        }
        if (node.type !== 'PropertyDefinition' || !node.static || node.computed ||
            keyName(node.key) !== 'config' || node.value?.type !== 'ObjectExpression') return;

        for (const property of node.value.properties) {
            if (!property.computed && keyName(property.key) === 'className' &&
                property.value?.type === 'Literal' && typeof property.value.value === 'string') {
                names.push(property.value.value)
            }
        }
    });

    const exported     = ast.body.find(node => node.type === 'ExportDefaultDeclaration')?.declaration,
        defaultBinding = exported?.type === 'Identifier' ? exported.name :
            exported?.type === 'CallExpression' && ['Neo.setupClass', 'Neo.gatekeep'].includes(memberName(exported.callee))
                ? exported.arguments[0]?.name : exported?.id?.name;
    return {classNames: names, applications, imports, classes, defaultBinding}
}

/**
 * @summary Checks enclosing declarations and parameters before recognizing an imported or global binding.
 * @param {Object[]} ancestors Enclosing AST nodes.
 * @param {String} name Binding to check.
 * @returns {Boolean}
 */
export function shadowsBinding(ancestors, name) {
    return ancestors.some(scope => {
        const names = new Set();
        scope.params?.forEach(param => bindings(param, names));
        if (scope.type === 'FunctionExpression') bindings(scope.id, names);
        if (scope.params && scope.body) walk(scope.body, node => {
            if (node.params || ['ClassDeclaration', 'ClassExpression'].includes(node.type)) return false;
            if (node.type === 'VariableDeclaration' && node.kind === 'var') {
                node.declarations.forEach(item => bindings(item.id, names));
            }
        });
        if (scope.type === 'CatchClause') bindings(scope.param, names);
        for (const declaration of [scope.init, scope.left]) {
            if (declaration?.type === 'VariableDeclaration') declaration.declarations.forEach(item => bindings(item.id, names));
        }
        if (['Program', 'BlockStatement'].includes(scope.type)) {
            for (let statement of scope.body) {
                if (statement.type.startsWith('Export')) statement = statement.declaration;
                if (statement?.type === 'VariableDeclaration') statement.declarations.forEach(item => bindings(item.id, names));
                else if (['ClassDeclaration', 'FunctionDeclaration'].includes(statement?.type)) bindings(statement.id, names);
            }
        }
        return names.has(name)
    })
}

/**
 * @summary Resolves a syntactic namespace chain without treating computed properties as names.
 * @param {Object} node Expression node.
 * @returns {String|null}
 */
function memberName(node) {
    if (!node) return null;
    if (node.type === 'Identifier') return node.name;
    if (node.type !== 'MemberExpression' || node.computed || node.property.type !== 'Identifier') return null;
    const root = memberName(node.object);
    return root ? `${root}.${node.property.name}` : null
}

/**
 * @summary Recognizes an import.meta property without interpreting arbitrary member chains.
 * @param {Object} node Expression node.
 * @param {String} name Property name.
 * @returns {Boolean}
 */
function metaProperty(node, name) {
    return node?.type === 'MemberExpression' && !node.computed && keyName(node.property) === name &&
        node.object.type === 'MetaProperty' && node.object.meta.name === 'import' && node.object.property.name === 'meta'
}

/**
 * @summary Resolves a Node builtin's imported binding, respecting aliases and enclosing shadows.
 * @param {Object} callee Function or constructor expression.
 * @param {Object} ast Module AST.
 * @param {Object[]} ancestors Enclosing scopes.
 * @param {String} module Builtin module without the node: prefix.
 * @param {String} name Exported symbol.
 * @param {Boolean} [global=false] Whether the unbound export is also a global.
 * @returns {Boolean}
 */
function builtin(callee, ast, ancestors, module, name, global=false) {
    const binding = callee.type === 'Identifier' ? callee.name :
        callee.type === 'MemberExpression' && !callee.computed && keyName(callee.property) === name && callee.object.name;
    if (!binding || shadowsBinding(ancestors, binding)) return false;
    for (const declaration of ast.body) {
        if (declaration.type !== 'ImportDeclaration') continue;
        const specifier = declaration.specifiers.find(item => item.local.name === binding);
        if (!specifier) continue;
        if (![module, `node:${module}`].includes(declaration.source.value)) return false;
        return callee.type === 'Identifier' ? specifier.type === 'ImportSpecifier' && keyName(specifier.imported) === name :
            ['ImportDefaultSpecifier', 'ImportNamespaceSpecifier'].includes(specifier.type);
    }
    return global && callee.type === 'Identifier' && binding === name
}

/**
 * @summary Plans module-relative URL and filesystem edges with their distinct filename semantics.
 * @param {Object} options AST, source paths and output collections used by rewriteModule().
 * @returns {Set<Object>} AST expressions already represented in the reference census.
 */
function modulePathEdges({ast, code, from, to, mapPath, edits, references, unresolved}) {
    const handled = new Set();
    walk(ast, (node, parent, ancestors) => {
        const url = node.type === 'NewExpression' && metaProperty(node.arguments[1], 'url') &&
                builtin(node.callee, ast, ancestors, 'url', 'URL', true),
            resolve = node.type === 'CallExpression' && node.arguments.length > 1 && metaProperty(node.arguments[0], 'dirname') &&
                builtin(node.callee, ast, ancestors, 'path', 'resolve');
        if (!url && !resolve) return;
        handled.add(node);
        const nodes = url ? [node.arguments[0]] : node.arguments.slice(1),
            entries = nodes.map(value => staticSpecifier(value, code));
        if (entries.some(entry => !entry || entry.computed)) {
            const source = url ? nodes[0] : node;
            unresolved.push({start: source.start, end: source.end, origin: from,
                ...(url ? referenceScope(source) : {prefix: null})});
            return
        }
        const values = entries.map(entry => entry.specifier);
        let value, original = values.join(path.sep);
        if (url) {
            const resolved = new URL(values[0], pathToFileURL(from));
            if (resolved.protocol !== 'file:') return;
            const target = fileURLToPath(resolved), mapped = mapPath(target);
            if (/^(?:file:|\/)/.test(values[0])) {
                const next = pathToFileURL(mapped);
                value = values[0].startsWith('file:') ? next.href : next.pathname;
                value += resolved.search + resolved.hash;
            } else value = relocateSpecifier(/^\.{1,2}\//.test(values[0]) ? values[0] : `./${values[0]}`, from, to, mapPath);
            if (from === to && mapped === target) value = values[0];
        } else {
            const target = path.resolve(path.dirname(from), ...values), mapped = mapPath(target);
            if (from === to && target === mapped) return;
            value = path.relative(path.dirname(to), mapped) || '.';
        }
        const start = nodes[0].start, end = nodes.at(-1).end;
        references.push({specifier: original, start, end, value});
        if (!url || value !== original) edits.push({start, end, value: JSON.stringify(value)});
    });
    walk(ast, (node, parent, ancestors) => {
        if (node.type === 'ImportExpression') {
            let source = node.source;
            if (source.type === 'MemberExpression' && !source.computed && keyName(source.property) === 'href') source = source.object;
            if (source.type === 'CallExpression' && builtin(source.callee, ast, ancestors, 'url', 'fileURLToPath')) source = source.arguments[0];
            if (handled.has(source)) handled.add(node.source);
        }
    });
    return handled
}

/**
 * @summary Collects bound identifiers from declaration and parameter patterns.
 * @param {Object} node Binding pattern.
 * @param {Set<String>} names Destination set.
 * @returns {void}
 */
function bindings(node, names) {
    if (!node) return;
    if (node.type === 'Identifier') names.add(node.name);
    else if (node.type === 'ObjectPattern') node.properties.forEach(property => bindings(property.value ?? property.argument, names));
    else if (node.type === 'ArrayPattern') node.elements.forEach(element => bindings(element, names));
    else if (node.type === 'AssignmentPattern') bindings(node.left, names);
    else if (node.type === 'RestElement') bindings(node.argument, names);
}

/**
 * @summary Reads the constant text before a computed expression's first variable part.
 * @param {Object} node Import source expression.
 * @returns {String}
 */
function referenceHead(node) {
    let prefix = '';

    if (node.type === 'TemplateLiteral') prefix = node.quasis[0].value.cooked ?? '';
    else if (node.type === 'BinaryExpression' && node.operator === '+') {
        let left = node.left;
        while (left.type === 'BinaryExpression' && left.operator === '+') left = left.left;
        if (left.type === 'Literal' && typeof left.value === 'string') prefix = left.value;
    }

    return prefix
}

/**
 * @summary Describes the constant URL directory and scheme, including a runtime reader's prepended path.
 * @param {Object} node Computed import source.
 * @param {String} [prefix=''] Prefix added by a known runtime reader.
 * @returns {Object}
 */
export function referenceScope(node, prefix='') {
    const value = prefix + referenceHead(node);
    return {prefix: /^\.{1,2}\//.test(value) ? value.slice(0, value.lastIndexOf('/') + 1) : null,
        externalProtocol: /^(https?:|data:|node:)/.exec(value)?.[1] ?? null}
}

/**
 * @summary Retargets a relative URL while preserving its search and fragment and encoding path segments.
 * @param {String} specifier Decoded module specifier.
 * @param {String} from Original importing file.
 * @param {String} to Destination importing file.
 * @param {Function} mapPath Maps an absolute old path to its final path.
 * @returns {String}
 */
export function relocateSpecifier(specifier, from, to, mapPath) {
    if (!/^\.{1,2}\//.test(specifier)) return specifier;

    const url  = new URL(specifier, pathToFileURL(from)),
        target = fileURLToPath(url),
        mapped = mapPath(target);

    if (from === to && mapped === target) return specifier;

    let relative = path.relative(path.dirname(to), mapped).split(path.sep).map(encodeURIComponent).join('/');
    if (!relative.startsWith('.')) relative = `./${relative}`;

    return relative + url.search + url.hash
}

/**
 * @summary Applies disjoint source edits without changing untouched bytes.
 * @param {String} code Original source.
 * @param {Object[]} edits Start/end/value edits.
 * @returns {String}
 */
export function applySourceEdits(code, edits) {
    let end = code.length;

    for (const edit of edits.sort((a, b) => b.start - a.start)) {
        if (edit.end > end || edit.start > edit.end) throw new Error('Overlapping source edits');
        code = code.slice(0, edit.start) + edit.value + code.slice(edit.end);
        end = edit.start;
    }

    return code
}

/**
 * @summary Rewrites executable relative module edges and canonical class references after relocation.
 * Computed imports remain unchanged and are returned to the planner for scope validation. Ordinary strings,
 * local bindings, ntypes and CSS identities are not namespace references.
 * @param {Object} options
 * @param {String} options.code Original source text.
 * @param {String} options.from Original absolute module path.
 * @param {String} options.to Final absolute module path.
 * @param {Function} options.mapPath Absolute path mapping for the complete move.
 * @param {Map<String,String>} [options.classNames] Canonical old/new class names.
 * @returns {Object} Rewritten code, static reference records and unresolved computed references.
 */
export function rewriteModule({code, from, to, mapPath, classNames=new Map()}) {
    const comments  = [], edits = [], references = [], unresolved = [], shadows = new Set(),
        ast         = parse(code, {ecmaVersion: 'latest', sourceType: 'module', onComment: comments}),
        sourceTypes = new Set(['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'ImportExpression']);

    const pathExpressions = modulePathEdges({ast, code, from, to, mapPath, edits, references, unresolved});

    walk(ast, node => {
        if (node.type === 'VariableDeclarator' || node.type === 'ClassDeclaration' || node.type === 'FunctionDeclaration') bindings(node.id, shadows);
        if (node.params) node.params.forEach(param => bindings(param, shadows));
        if (node.type === 'CatchClause') bindings(node.param, shadows);
        if (node.type === 'ImportDeclaration') {
            for (const specifier of node.specifiers) {
                if (specifier.type === 'ImportDefaultSpecifier' && specifier.local.name === 'Neo' &&
                    node.source.value.startsWith('.') &&
                    fileURLToPath(new URL(node.source.value, pathToFileURL(from))).endsWith(`${path.sep}src${path.sep}Neo.mjs`)) continue;
                bindings(specifier.local, shadows);
            }
        }
    });

    walk(ast, (node, parent) => {
        if (sourceTypes.has(node.type) && node.source && !pathExpressions.has(node.source)) {
            const source = node.source, entry = staticSpecifier(source, code);

            if (!entry || entry.computed) {
                unresolved.push({start: source.start, end: source.end, ...referenceScope(source)});
            } else {
                const value = relocateSpecifier(entry.specifier, from, to, mapPath);
                references.push({...entry, start: source.start, end: source.end, value});
                if (value !== entry.specifier) edits.push({start: source.start, end: source.end, value: JSON.stringify(value)});
            }
        }

        const name = node.type === 'MemberExpression' ? memberName(node) : null;
        if (name && classNames.has(name)) {
            if (shadows.has(name.split('.')[0]) || shadows.has(classNames.get(name).split('.')[0])) {
                unresolved.push({start: node.start, end: node.end, prefix: null, reason: 'Namespace root has a local binding'});
            } else edits.push({start: node.start, end: node.end, value: classNames.get(name)});
            return false
        }

        if (node.type !== 'Literal' || !classNames.has(node.value)) return;

        const classProperty = parent?.type === 'Property' && !parent.computed && keyName(parent.key) === 'className',
            call            = parent?.type === 'CallExpression' ? memberName(parent.callee) : null,
            nameArgument    = call === 'Neo.gatekeep' ? parent.arguments[1] === node :
                ['Neo.create', 'Neo.ns', 'Neo.getClass'].includes(call) && parent.arguments[0] === node;

        if (classProperty || nameArgument) {
            if (nameArgument && shadows.has('Neo')) {
                unresolved.push({start: node.start, end: node.end, prefix: null, reason: 'Neo call has a local binding'});
            } else edits.push({start: node.start, end: node.end, value: JSON.stringify(classNames.get(node.value))})
        }
    });

    for (const comment of comments) {
        if (comment.type !== 'Block' || !comment.value.startsWith('*')) continue;
        code.slice(comment.start, comment.end).replace(/(@(?:class|extends)\s+|@member\s+\{[^}]+}\s+className\s*=\s*['"]?)([\w$.]+)/g,
            (match, prefix, name, offset) => {
                if (classNames.has(name)) edits.push({start: comment.start + offset + prefix.length,
                    end: comment.start + offset + prefix.length + name.length, value: classNames.get(name)});
                return match
            });
    }

    return {code: applySourceEdits(code, edits), edits, references, unresolved}
}

export {walk as visitNodes, memberName, keyName, bindings as boundNames};
