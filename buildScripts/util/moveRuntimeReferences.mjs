import {parse}                                                                          from 'acorn';
import path                                                                             from 'node:path';
import {fileURLToPath, pathToFileURL}                                                   from 'node:url';
import {boundNames, keyName, memberName, referenceScope, relocateSpecifier, visitNodes} from './moveSourceTransforms.mjs';

/**
 * @module buildScripts/util/moveRuntimeReferences
 * @summary Edits literal module and layout references at verified Neo runtime callers, using worker URL origins.
 */

/**
 * @summary Finds a literal property on a source object without interpreting spreads or computed keys.
 * @param {Object} object Object expression.
 * @param {String} name Property name.
 * @returns {Object|undefined}
 */
function property(object, name) {
    return object?.type === 'ObjectExpression'
        ? object.properties.find(item => !item.computed && keyName(item.key) === name)?.value : undefined
}

/**
 * @summary Retains opaque config objects as unresolved carriers instead of assuming their path field is absent.
 * @param {Object} object Runtime call argument.
 * @param {String} name Path field.
 * @returns {Object|undefined} Literal field value, opaque carrier, or absent literal field.
 */
function carrier(object, name) {
    return object?.type === 'ObjectExpression' && object.properties.every(item => item.type === 'Property' && !item.computed)
        ? property(object, name) : object
}

/**
 * @summary Follows declared class bases to an Engine primitive, without executing classes or guessing from names.
 * @param {Object} declaration Class metadata returned by moduleInfo().
 * @param {String} file Declaring module.
 * @param {String} target Canonical Engine primitive module.
 * @param {Function} getModule Reads/caches moduleInfo for an absolute path.
 * @param {Set<String>} [seen] Traversal cycle guard.
 * @returns {Boolean}
 */
function inherits(declaration, file, target, getModule, seen=new Set()) {
    if (file === target) return true;
    if (seen.has(file) || !declaration.baseImport?.startsWith('.')) return false;
    seen.add(file);
    const base = fileURLToPath(new URL(declaration.baseImport, pathToFileURL(file))), info = getModule(base);
    if (base === target) return true;
    if (!info) return false;
    const parent = declaration.baseImported === 'default'
        ? info.classes.find(item => item.binding === info.defaultBinding)
        : info.classes.find(item => item.binding === declaration.baseImported);
    return Boolean(parent && inherits(parent, base, target, getModule, seen))
}

/**
 * @summary Returns a fixture's lexical Neo parameter binding for an RMA helper call.
 * @param {Object[]} ancestors Enclosing AST nodes.
 * @param {String} name Receiver identifier.
 * @returns {Boolean}
 */
function isFixtureReceiver(ancestors, name) {
    for (const scope of [...ancestors].reverse()) {
        if (declares(scope, name)) return false;
        if (!scope.params) continue;
        for (const param of scope.params) {
            if (param.type === 'Identifier' && param.name === name) return false;
            if (param.type !== 'ObjectPattern') continue;
            for (const item of param.properties) {
                if (item.value?.name === name) return keyName(item.key) === 'neo';
            }
        }
    }
    return false
}

/**
 * @summary Finds direct lexical declarations in a block, without treating nested functions as the same scope.
 * @param {Object} scope Program or block node.
 * @param {String} name Binding name.
 * @returns {Boolean}
 */
function declares(scope, name) {
    if (!['Program', 'BlockStatement'].includes(scope.type)) return false;
    const names = new Set();
    for (const statement of scope.body) {
        if (statement.type === 'VariableDeclaration') statement.declarations.forEach(item => boundNames(item.id, names));
        else if (['ClassDeclaration', 'FunctionDeclaration'].includes(statement.type)) boundNames(statement.id, names);
    }
    return names.has(name)
}

/**
 * @summary Detects a locally bound Neo receiver so matching method spelling cannot authorize a rewrite.
 * @param {Object[]} ancestors Enclosing nodes.
 * @param {Object[]} imports Module imports.
 * @param {String} file Current module path.
 * @param {String} engineRoot Canonical Engine package.
 * @returns {Boolean}
 */
function shadowsNeo(ancestors, imports, file, engineRoot) {
    for (const scope of ancestors) {
        if (declares(scope, 'Neo')) return true;
        const names = new Set();
        scope.params?.forEach(param => boundNames(param, names));
        if (names.has('Neo')) return true;
    }
    return imports.some(item => item.local === 'Neo' &&
        (!item.source.startsWith('.') || path.resolve(path.dirname(file), item.source) !== path.join(engineRoot, 'src/Neo.mjs')))
}

/**
 * @summary Plans original-source edits for worker-origin references in Containers, Canvas classes and RMA callers.
 * Returned ranges compose with rewriteModule() before either transform changes offsets. Computed values at
 * concrete callers remain unresolved; forwarding implementations are not certified by this transform.
 * @param {Object} options
 * @param {String} options.code Original module source.
 * @param {String} options.file Original absolute module path.
 * @param {String} options.root Owned root.
 * @param {String} options.engineRoot Engine source package, possibly installed read-only.
 * @param {Object} options.info Metadata from moduleInfo().
 * @param {Function} options.getModule Metadata reader for class ancestors.
 * @param {Function} options.mapPath Complete absolute path mapping.
 * @param {Map<String,String>} options.classNames Canonical namespace changes.
 * @returns {Object} Source edits and unresolved caller references.
 */
export function runtimeReferenceEdits({code, file, root, engineRoot, info, getModule, mapPath, classNames}) {
    const comments   = [], ast = parse(code, {ecmaVersion: 'latest', sourceType: 'module', onComment: comments}),
        edits        = [], unresolved = [], echoes = [], bundledReferences = [],
        appWorker    = path.join(engineRoot, 'src/worker/App.mjs'),
        canvasWorker = path.join(engineRoot, 'src/worker/Canvas.mjs'),
        roles        = info.classes.map(item => ({...item,
            container: inherits(item, file, path.join(engineRoot, 'src/container/Base.mjs'), getModule),
            canvas   : inherits(item, file, path.join(engineRoot, 'src/component/Canvas.mjs'), getModule)})),
        fixture = info.imports.some(item => item.source.startsWith('.') &&
            [root, engineRoot].some(base => path.resolve(path.dirname(file), item.source) === path.join(base, 'test/playwright/fixtures.mjs')));

    const rewrite = (node, origin, {prefix='', field=null, owner=null, module=false, extension=''}={}) => {
        if (!node || node.type === 'Literal' && node.value == null) return;
        if (node.type !== 'Literal' || typeof node.value !== 'string') {
            unresolved.push({start: node.start, end: node.end, origin, ...referenceScope(node, prefix)});
            return
        }
        const original = node.value;
        if (/^(?:[a-z][\w+.-]*:|\/)/i.test(original)) return;
        if (module && !prefix && !/^\.{1,2}\//.test(original)) {
            unresolved.push({start: node.start, end: node.end, prefix: null, reason: 'Runtime module specifier needs package or import-map ownership'});
            return
        }
        const suffix  = extension && !original.endsWith(extension) ? extension : '',
            specifier = prefix + original + suffix,
            relative  = /^\.{1,2}\//.test(specifier) ? specifier : `./${specifier}`;
        const resolved = fileURLToPath(new URL(relative, pathToFileURL(origin)));
        if (field === 'rendererImportPath') bundledReferences.push({family: 'canvas', target: resolved});
        if (mapPath(resolved) === resolved && mapPath(origin) === origin) return;
        let next = relocateSpecifier(relative, origin, mapPath(origin), mapPath);
        if (prefix) {
            const target = fileURLToPath(new URL(next, pathToFileURL(mapPath(origin)))),
                base     = fileURLToPath(new URL(prefix, pathToFileURL(mapPath(origin))));
            next = path.relative(base, target).split(path.sep).join('/');
        }
        if (suffix && next.endsWith(suffix)) next = next.slice(0, -suffix.length);
        if (!prefix && !original.startsWith('.') && next.startsWith('./')) next = next.slice(2);
        if (next !== original) {
            edits.push({start: node.start, end: node.end, value: JSON.stringify(next)});
            if (field) echoes.push({owner, field, original, value: next});
        }
    };

    visitNodes(ast, (node, parent, ancestors) => {
        const owner = [...ancestors].reverse().find(item => ['ClassDeclaration', 'ClassExpression'].includes(item.type)),
            role    = owner && roles.find(item => item.start === owner.start);

        if (node.type === 'Property' && role?.canvas && parent?.start === role.configStart) {
            const key = keyName(node.key);
            if (key === 'rendererImportPath') rewrite(node.value, canvasWorker, {prefix: '../../', field: key, owner: role, extension: '.mjs'});
            else if (key === 'rendererClassName' && classNames.has(node.value?.value)) {
                edits.push({start: node.value.start, end: node.value.end, value: JSON.stringify(classNames.get(node.value.value))});
                echoes.push({owner: role, field: key, original: node.value.value, value: classNames.get(node.value.value)});
            }
        }
        if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression' || node.callee.computed) return;
        const method = keyName(node.callee.property), receiver = node.callee.object,
            name     = memberName(node.callee),
            rma      = fixture && receiver.type === 'Identifier' && isFixtureReceiver(ancestors, receiver.name);

        if (name?.startsWith('Neo.worker.App.') && shadowsNeo(ancestors, info.imports, file, engineRoot)) {
            unresolved.push({start: node.start, end: node.end, prefix: null, reason: 'Neo runtime call has a local binding'});
            return
        }

        if (method === 'loadItems' && receiver.type === 'ThisExpression' && role?.container) {
            const nestedFunction = [...ancestors].reverse().find(item => ['FunctionExpression', 'FunctionDeclaration'].includes(item.type)),
                methodOwner      = [...ancestors].reverse().find(item => item.type === 'MethodDefinition');
            if (nestedFunction === methodOwner?.value) rewrite(carrier(node.arguments[0], 'url'), appWorker);
        } else if (name === 'Neo.worker.App.loadModule') rewrite(carrier(node.arguments[0], 'path'), appWorker, {module: true});
        else if (name === 'Neo.worker.App.createNeoInstance') rewrite(carrier(node.arguments[0], 'importPath'), appWorker, {module: true});
        else if (rma && method === 'loadModule') rewrite(node.arguments[0], appWorker, {module: true});
        else if (rma && method === 'createComponent') rewrite(carrier(node.arguments[0], 'importPath'), appWorker, {module: true});
    });

    for (const comment of comments) {
        if (comment.type !== 'Block' || !comment.value.startsWith('*')) continue;
        const owner = roles.filter(role => role.start <= comment.start && role.end >= comment.end)
                .sort((a, b) => a.end - a.start - (b.end - b.start))[0] ??
            roles.find(role => role.start >= comment.end && /^(?:export(?:\s+default)?)?$/.test(code.slice(comment.end, role.start).trim()));
        code.slice(comment.start, comment.end).replace(/(@member\s+\{[^}]+}\s+)(rendererImportPath|rendererClassName)=(['"])(.*?)\3/g,
            (match, prefix, field, quote, value, offset) => {
                const echo = echoes.find(entry => entry.owner === owner && entry.field === field && entry.original === value);
                if (echo) {
                    const start = comment.start + offset + prefix.length + field.length + 2;
                    edits.push({start, end: start + value.length, value: echo.value});
                }
                return match
            });
    }

    return {edits, unresolved, bundledReferences}
}
