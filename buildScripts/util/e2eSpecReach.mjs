import {execFileSync}             from 'node:child_process';
import {readFileSync}             from 'node:fs';
import {createRequire}            from 'node:module';
import {dirname, join, normalize} from 'node:path';

/**
 * @module buildScripts/util/e2eSpecReach
 * @summary What each e2e spec can reach in the committed tree, so a change can select only the specs it can affect.
 *
 * A spec reaches two things. First, the app or example it navigates and every module that entry imports. Second,
 * the e2e helpers it imports itself. Reach is measured per spec, never per app, because one app's closure is too
 * coarse to select by: Workstation's covers 41 % of `src/`.
 *
 * The map is static, so it cannot see code that loads at runtime by name or by computed path. {@link FOUNDATION}
 * and {@link RUNTIME_LOADING} name those blind spots. A change that falls in one of them has to run every spec,
 * whatever the map says.
 */

/**
 * Where the e2e specs live, relative to the repository root.
 * @member {String} SPEC_DIR
 */
export const SPEC_DIR = 'test/playwright/e2e/';

/**
 * Paths every spec can reach, whatever its closure says.
 *
 * - The core that every class extends.
 * - The worker, main-thread and vdom entry points. They load apps, main-thread addons and workers by name.
 * - The canvas workers.
 * - The top-level `src/*.mjs` entries.
 * - The theme the paint and geometry arms measure.
 * @member {RegExp[]} FOUNDATION
 */
export const FOUNDATION = [
    /^src\/(core|main|manager|util|vdom|worker)\//,
    /^src\/canvas\//,
    /^src\/[^/]+\.mjs$/,
    /^resources\/css\//
];

/**
 * A file containing one of these loads modules that no static closure can name. It loads them by path
 * (`importPath`, `loadModule({path})`, or the module list `container.Base#loadItems` fetches) or by name
 * (`mainThreadAddons`).
 * @member {RegExp} RUNTIME_LOADING
 */
export const RUNTIME_LOADING = /\bimportPath\b|\bloadModule\s*\(\s*\{|\bloadItems\s*\(|\bmainThreadAddons\b/;

// A quoted `.mjs` path. It may be an import, a literal `import()` with or without comments inside the call, or a
// path string such as `module: './Foo.mjs'`. A template literal counts only without interpolation, because an
// interpolated path names no single file.
const MODULE_PATH = /(['"`])((?:\.{1,2}\/|(?:apps|examples|src|test)\/)[^'"`$\s]*\.mjs)\1/g;

// A reference to an app, such as `examples/grid/issues/index.html` or `/docs/index.html`. The e2e specs also
// navigate the component suite's harness apps directly. The second group marks a path that continues with an
// interpolation, such as `examples/grid/${name}`, which can name any entry beneath it.
const APP_REFERENCE = /((?:test\/playwright\/component\/)?\b(?:apps|docs|examples)\/[\w-]+(?:\/[\w-]+)*)(\/\$\{)?/g;

// A computed route without an example prefix can visit any example, even when other routes are known.
const UNBOUNDED_EXAMPLE_REFERENCE = /\bexamples\/\$\{/;

// The theme builder converts these mirrored paths to Neo class namespaces.
const EXAMPLE_CSS    = /^resources\/css\/(?:src|theme-[^/]+)\/(examples\/.+)\.css$/,
      RUNTIME_SOURCE = /^(?:apps|docs|examples|src|test\/playwright\/component\/apps)\/.*\.(?:m?js|html)$|^(?:apps|examples)\/.*\/neo-config\.json$/;

const require = createRequire(import.meta.url);

/**
 * @summary Reads a template suffix that can add only a query or fragment to an example pathname.
 * @param {Object} node An Acorn expression.
 * @returns {Boolean}
 */
function isRouteSuffix(node) {
    if (node.type === 'ConditionalExpression') {
        return isRouteSuffix(node.consequent) && isRouteSuffix(node.alternate)
    }

    return node.type === 'Literal' && typeof node.value === 'string' &&
        (node.value === '' || /^[?#]/.test(node.value)) ||
        node.type === 'TemplateLiteral' && /^[?#]/.test(node.quasis[0].value.cooked)
}

/**
 * @summary Reads the fixed portion of a navigation argument that determines the visited pathname.
 * @param {Object|null} node An Acorn expression.
 * @param {Map<String, String>} constants Unshadowed, module-level string bindings.
 * @returns {String|null}
 */
function routeValue(node, constants) {
    if (node?.type === 'Literal') {
        return typeof node.value === 'string' ? node.value : null
    }
    if (node?.type === 'Identifier') {
        return constants.get(node.name) ?? null
    }
    if (node?.type !== 'TemplateLiteral') return null;

    let value = node.quasis[0].value.cooked;

    for (const [index, expression] of node.expressions.entries()) {
        if (/[?#]/.test(value)) return value;

        const suffix = node.quasis[index + 1].value.cooked,
              known  = expression.type === 'TemplateLiteral' ? null : routeValue(expression, constants);

        if (known !== null) {
            value += known + suffix
        } else {
            return index === node.expressions.length - 1 && !suffix && isRouteSuffix(expression) ? value : null
        }
    }

    return value
}

/**
 * @summary Visits each node of an Acorn syntax tree.
 * @param {Object} node
 * @param {Function} visit
 */
function walkSyntax(node, visit) {
    if (!node?.type) return;

    visit(node);

    for (const value of Object.values(node)) {
        Array.isArray(value) ? value.forEach(child => walkSyntax(child, visit)) : walkSyntax(value, visit)
    }
}

/**
 * @summary Lists the bindings declared by a parameter or destructuring pattern.
 * @param {Object|null} pattern
 * @param {Function} record
 */
function bindPattern(pattern, record) {
    switch (pattern?.type) {
        case 'Identifier': record(pattern.name); break;
        case 'AssignmentPattern': bindPattern(pattern.left, record); break;
        case 'RestElement': bindPattern(pattern.argument, record); break;
        case 'ArrayPattern': pattern.elements.forEach(item => bindPattern(item, record)); break;
        case 'ObjectPattern':
            pattern.properties.forEach(property => bindPattern(property.type === 'RestElement' ? property : property.value, record));
            break;
        default: break;
    }
}

/**
 * @summary Records the local bindings introduced directly by a syntax node.
 * @param {Object} node
 * @param {Function} record
 */
function visitBindings(node, record) {
    if (node.type === 'VariableDeclarator' || node.type.startsWith('Class')) bindPattern(node.id, record);
    if (node.type.includes('Function')) {
        bindPattern(node.id, record);
        node.params?.forEach(param => bindPattern(param, record))
    }
    if (node.type === 'CatchClause') bindPattern(node.param, record);
    if (node.type.startsWith('Import')) bindPattern(node.local, record);
}

/**
 * @summary Checks for a property call on a named fixture or test binding.
 * @param {Object|null} call
 * @param {String} receiver
 * @param {String} method
 * @returns {Boolean}
 */
function callsMethod(call, receiver, method) {
    const callee = call?.callee;

    return callee?.type === 'MemberExpression' && !callee.computed &&
        callee.object.type === 'Identifier' && callee.object.name === receiver && callee.property.name === method
}

/**
 * @summary Collects awaited calls before control flow can bypass a navigation.
 * @param {Object[]} statements
 * @returns {Object[]}
 */
function straightLineCalls(statements) {
    const calls = [];

    for (const statement of statements) {
        if (statement.type === 'FunctionDeclaration') continue;
        if (statement.type !== 'ExpressionStatement' && statement.type !== 'VariableDeclaration') break;

        const expressions = statement.type === 'VariableDeclaration'
            ? statement.declarations.map(declaration => declaration.init)
            : [statement.expression];

        for (const node of expressions) {
            if (node?.type === 'AwaitExpression' && node.argument.type === 'CallExpression') calls.push(node.argument)
        }
    }

    return calls
}

/**
 * @summary Checks that a callback keeps its page fixture and remains an active test.
 * @param {Object} callback
 * @returns {Boolean}
 */
function stablePage(callback) {
    let stable = true;

    walkSyntax(callback.body, node => {
        visitBindings(node, name => {if (name === 'page') stable = false});

        const target = node.type === 'AssignmentExpression' ? node.left : node.type === 'UpdateExpression' ? node.argument : null;

        if (target?.name === 'page' || target?.object?.name === 'page' ||
            callsMethod(node, 'test', 'skip') || callsMethod(node, 'test', 'fixme')) stable = false
    });

    return stable
}

/**
 * @summary Proves example entry visits from a spec's own Playwright navigation calls.
 * @description Broad route expansion stays in the ordinary reach map. Only a fixed navigation pathname may
 * qualify a stylesheet for narrower coverage. The supported witness is a straight-line awaited navigation from
 * a registered test, or through one directly awaited module helper receiving the same page fixture.
 * @param {String} source
 * @param {String} spec The spec's path relative to the repository root.
 * @param {Set<String>} tracked
 * @returns {Set<String>}
 */
function navigationEntries(source, spec, tracked) {
    const entries = new Set();
    let syntax;

    try {
        syntax = require('acorn').parse(source, {ecmaVersion: 'latest', sourceType: 'module'})
    } catch {
        return entries
    }

    const constants     = new Map(),
          bindings      = new Map(),
          helpers       = new Map(),
          calls         = [],
          scalar        = node => node?.type === 'Literal' && typeof node.value === 'string',
          functionValue = node => node && ['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration'].includes(node.type),
          tester        = syntax.body.some(node => node.type === 'ImportDeclaration' &&
              (node.source.value === '@playwright/test' ||
                  (normalize(join(dirname(spec), node.source.value)) === 'test/playwright/fixtures.mjs' && tracked.has('test/playwright/fixtures.mjs'))) &&
              node.specifiers.some(binding => binding.imported?.name === 'test' && binding.local.name === 'test'));

    if (!tester) return entries;

    for (const statement of syntax.body) {
        if (statement.type === 'VariableDeclaration' && statement.kind === 'const') {
            for (const {id, init} of statement.declarations) {
                if (id.type !== 'Identifier') continue;
                if (scalar(init)) constants.set(id.name, init.value);
                if (functionValue(init)) helpers.set(id.name, init)
            }
        } else if (statement.type === 'FunctionDeclaration' && statement.id) {
            helpers.set(statement.id.name, statement)
        }
    }

    walkSyntax(syntax, node => visitBindings(node, name => bindings.set(name, (bindings.get(name) || 0) + 1)));
    if (bindings.get('test') !== 1) return entries;

    for (const name of constants.keys()) {
        if (bindings.get(name) !== 1) constants.delete(name)
    }

    const collectCalls = (callback, allowHelper) => {
        if (callback.body?.type !== 'BlockStatement' || !stablePage(callback)) return;

        for (const call of straightLineCalls(callback.body.body)) {
            if (callsMethod(call, 'page', 'goto')) {
                calls.push(call.arguments[0]);
                continue
            }

            if (!allowHelper || call.callee.type !== 'Identifier' || bindings.get(call.callee.name) !== 1) continue;

            const helper = helpers.get(call.callee.name);

            if (helper?.params[0]?.type === 'Identifier' && helper.params[0].name === 'page' &&
                call.arguments[0]?.type === 'Identifier' && call.arguments[0].name === 'page') {
                collectCalls(helper, false)
            }
        }
    };

    const visitRegistrations = statements => {
        const registrations = statements.filter(node => node.type === 'ExpressionStatement' && node.expression.type === 'CallExpression')
            .map(node => node.expression);

        if (registrations.some(call => (callsMethod(call, 'test', 'skip') || callsMethod(call, 'test', 'fixme')) &&
            !functionValue(call.arguments.at(-1)))) return;

        for (const call of registrations) {
            const callback = call.arguments.at(-1);

            if (!functionValue(callback)) continue;
            if (callsMethod(call, 'test', 'describe') && callback.body.type === 'BlockStatement') {
                visitRegistrations(callback.body.body)
            } else if (call.callee.type === 'Identifier' && call.callee.name === 'test' &&
                callback.params[0]?.type === 'ObjectPattern' &&
                callback.params[0].properties.some(property => !property.computed && property.key?.name === 'page' &&
                    property.value?.type === 'Identifier' && property.value.name === 'page')) {
                collectCalls(callback, true)
            }
        }
    };
    visitRegistrations(syntax.body);

    for (const call of calls) {
        const route    = routeValue(call, constants),
              [, path] = /^\/?(examples\/[\w-]+(?:\/[\w-]+)*)\/index\.html(?:[?#]|$)/.exec(route || '') || [],
              entry    = path && `${path}/app.mjs`;

        if (entry && tracked.has(entry) && tracked.has(`${path}/index.html`)) entries.add(entry)
    }

    return entries
}
/**
 * @summary Every tracked `.mjs` file a module names by path.
 * @param {Object}      options
 * @param {String}      options.file    The naming module, relative to the repository root.
 * @param {String}      options.text    Its source.
 * @param {Set<String>} options.tracked The committed files, relative to the repository root.
 * @returns {String[]} The named files that exist in the tree, in source order, without duplicates.
 */
export function moduleEdges({file, text, tracked}) {
    const edges = new Set();

    for (const [, , path] of text.matchAll(MODULE_PATH)) {
        const target = normalize(path.startsWith('.') ? join(dirname(file), path) : path);

        tracked.has(target) && edges.add(target)
    }

    return [...edges]
}

/**
 * @summary The app entry a reference resolves to: the deepest directory along it that holds an `app.mjs`.
 * @param {String}      reference Such as `examples/grid/issues/index`, or `docs/index` for `docs/app.mjs`.
 * @param {Set<String>} tracked
 * @returns {String|null} The entry's `app.mjs`, or null when no directory along the reference holds one.
 */
export function entryOf(reference, tracked) {
    const parts = reference.split('/');

    for (let length = parts.length; length >= 1; length--) {
        const entry = `${parts.slice(0, length).join('/')}/app.mjs`;

        if (tracked.has(entry)) {
            return entry
        }
    }

    return null
}

/**
 * @summary Maps every e2e spec to what it can reach in the committed tree.
 *
 * A spec's own closure holds the spec and the `test/playwright/` helpers it reaches through module paths. Every app
 * or example that closure names adds that entry's full closure. A spec with no known entry or an unbounded example
 * route is listed in `unnamed`, since its known entries cannot rule out a change.
 * @param {Object} [options]
 * @param {String} [options.root=process.cwd()] The repository root.
 * @returns {{specs: Map<String, {entries: String[], reach: Set<String>}>, tracked: Set<String>, unnamed: String[], exampleCssOwner: Function, witnessesExample: Function}}
 */
export function specReach({root = process.cwd()} = {}) {
    const files     = execFileSync('git', ['-C', root, 'ls-files'], {encoding: 'utf8'}).trim().split('\n'),
          tracked   = new Set(files),
          sources   = new Map(),
          text      = file => sources.get(file) ?? sources.set(file, readFileSync(join(root, file), 'utf8')).get(file),
          edges     = new Map(),
          edgesOf   = file => edges.get(file) ?? edges.set(file, moduleEdges({file, text: text(file), tracked})).get(file),
          closures  = new Map(),
          cssOwners = new Map(),
          witnesses = new Map();
    let hasCssImports;

    // Every module an entry reaches, the entry included
    const closureOf = entry => {
        if (!closures.has(entry)) {
            const seen = new Set([entry]), queue = [entry];

            while (queue.length) {
                for (const next of edgesOf(queue.pop())) {
                    seen.has(next) || (seen.add(next), queue.push(next))
                }
            }

            closures.set(entry, seen)
        }

        return closures.get(entry)
    };

    /**
     * @summary Resolves a tracked stylesheet's sole standalone example using its mirrored, mounted class.
     * @param {String} file The changed stylesheet path in the merge tree.
     * @returns {String|null} The owning app entry, when the available source proves ownership.
     */
    const exampleCssOwner = file => {
        const [, stem] = EXAMPLE_CSS.exec(file) || [];

        if (!stem || !tracked.has(file)) {
            return null
        }

        if (cssOwners.has(stem)) {
            return cssOwners.get(stem)
        }

        const module = `${stem}.mjs`,
              entry  = entryOf(stem, tracked);

        cssOwners.set(stem, null);

        if (!entry || !tracked.has(module)) {
            return null
        }

        try {
            const namespace = `Neo.${stem.replaceAll('/', '.')}`,
                  source    = text(module),
                  names     = [...source.matchAll(/\bclassName\s*:\s*(['"])([^'"\r\n]+)\1/g)];

            if (!source.includes('Neo.setupClass(') || !names.some(([, , name]) => name === namespace) ||
                !closureOf(entry).has(module)) {
                return null
            }

            // An import can apply this sheet through another namespace. Keep that wiring on the full tier.
            hasCssImports ??= files.some(path => path.startsWith('resources/css/') && path.endsWith('.css') && /@import\b/i.test(text(path)));

            if (hasCssImports) {
                return null
            }

            for (const path of files) {
                if (!RUNTIME_SOURCE.test(path) || entryOf(path, tracked) === entry) {
                    continue
                }

                const content = text(path);

                // A foreign import can get the namespace from a helper in the example's entry.
                if (content.includes(namespace) || content.includes(`${stem}.css`) ||
                    (path.endsWith('.mjs') && edgesOf(path).some(edge => entryOf(edge, tracked) === entry))) {
                    return null
                }
            }

            cssOwners.set(stem, entry);
            return entry
        } catch {
            // A missing or unreadable source cannot witness local ownership.
            return null
        }
    };

    const specs   = new Map(),
          unnamed = [];

    for (const spec of files.filter(file => file.startsWith(SPEC_DIR) && file.endsWith('.spec.mjs'))) {
        const own              = new Set([spec]), queue = [spec], entries = new Set();
        let   unboundedExample = false;

        while (queue.length) {
            for (const next of edgesOf(queue.pop())) {
                next.startsWith('test/playwright/') && !own.has(next) && (own.add(next), queue.push(next))
            }
        }

        for (const file of own) {
            const source = text(file);

            unboundedExample ||= UNBOUNDED_EXAMPLE_REFERENCE.test(source);

            for (const [, reference, interpolated] of source.matchAll(APP_REFERENCE)) {
                const beneath = interpolated ? files.filter(path => path.startsWith(`${reference}/`) && path.endsWith('/app.mjs')) : [];

                (beneath.length ? beneath : [entryOf(reference, tracked)]).forEach(entry => entry && entries.add(entry))
            }
        }

        if (!entries.size || unboundedExample) {
            unnamed.push(spec)
        }

        const reach = new Set(own);

        for (const entry of entries) {
            closureOf(entry).forEach(file => reach.add(file))
        }

        specs.set(spec, {entries: [...entries].sort(), reach})
    }

    const witnessesExample = (spec, entry) => {
        if (!witnesses.has(spec)) witnesses.set(spec, navigationEntries(text(spec), spec, tracked));

        return witnesses.get(spec).has(entry)
    };

    return {specs, tracked, unnamed, exampleCssOwner, witnessesExample}
}
