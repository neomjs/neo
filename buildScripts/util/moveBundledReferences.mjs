import {parse, parseExpressionAt} from 'acorn';
import path                       from 'node:path';
import {nativeReaderContracts}    from './moveNativeReferences.mjs';
import {sourceHash}               from './moveReferenceScopes.mjs';
import {keyName, visitNodes}      from './moveSourceTransforms.mjs';

/**
 * @module buildScripts/util/moveBundledReferences
 * @summary Rejects moved boot and renderer targets that their inspected Webpack contexts cannot include.
 */

const contracts = {
    app   : nativeReaderContracts.find(reader => reader.carrier === 'neo-config.json:appPath'),
    canvas: {file: 'src/worker/Canvas.mjs', owner: 'Canvas', method: 'loadModule',
        hash: 'e7727840a81cffbecbf6145e4f34fdc27aa81b00c758713c74e685927d702d4a'}
};

/**
 * @summary Reads regex literals from the import expression's actual magic comments without evaluating source.
 * @param {Object[]} comments Acorn comments belonging to one import expression.
 * @returns {Object} Include/exclude regexes keyed by their Webpack option.
 */
function patterns(comments) {
    const result = {};
    for (const comment of comments) {
        for (const key of ['webpackInclude', 'webpackExclude']) {
            const match = new RegExp(`\\b${key}\\s*:`).exec(comment.value);
            if (!match) continue;
            const node = parseExpressionAt(comment.value, match.index + match[0].length, {ecmaVersion: 'latest'});
            if (!node.regex || result[key]) throw new Error(`Ambiguous ${key} on bundled reader`);
            result[key] = new RegExp(node.regex.pattern, node.regex.flags);
        }
    }
    return result
}

/**
 * @summary Checks containment on path-segment boundaries.
 * @param {String} root Absolute context root.
 * @param {String} file Absolute target.
 * @returns {Boolean}
 */
function inside(root, file) {
    const relative = path.relative(root, file);
    return relative === '' || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

/**
 * @summary Checks affected literal carriers against pinned readers, including their build-significant comments.
 * Source readers are supplied by the planner so installed dependency bytes participate in apply freshness.
 * Workspace app contexts are rebased by workerContextRebasePlugin; package canvas contexts stay in Engine.
 * @param {Object} options
 * @param {Object[]} options.references Carrier file, family and original absolute target records.
 * @param {String} options.root Owned workspace root.
 * @param {String} options.engineRoot Canonical Engine package root.
 * @param {Function} options.mapPath Original-to-final path mapping.
 * @param {Function} options.readSource Freshness-accounted source reader, returning text or null.
 * @returns {Object[]} Unresolved bundled destination findings.
 */
export function checkBundledReferences({references, root, engineRoot, mapPath, readSource}) {
    const blockers = [], contexts = new Map();
    for (const reference of references) {
        const destination = mapPath(reference.target);
        if (destination === reference.target) continue;
        const contract = contracts[reference.family], reader = path.join(engineRoot, contract.file),
            label      = `${contract.owner}#${contract.method}`;
        try {
            if (!contexts.has(reader)) {
                const code = readSource(reader), comments = [];
                let method;
                if (code) visitNodes(parse(code, {ecmaVersion: 'latest', sourceType: 'module', onComment: comments}), (node, parent, ancestors) => {
                    const owner = ancestors.findLast(item => item.type === 'ClassDeclaration');
                    if (node.type === 'MethodDefinition' && owner?.id?.name === contract.owner && keyName(node.key) === contract.method) method = node;
                });
                if (!method || sourceHash(code.slice(method.start, method.end)) !== contract.hash || mapPath(reader) !== reader) {
                    throw new Error(`${label} is missing, changed or moved; re-admit its resolution origin and Webpack include/exclude rules before updating the source pin`);
                }
                const imports = [];
                visitNodes(method, node => {
                    if (node.type === 'ImportExpression') imports.push({
                        prefix: node.source.quasis?.[0].value.cooked,
                        ...patterns(comments.filter(comment => comment.start >= node.start && comment.end <= node.source.start))
                    });
                });
                contexts.set(reader, imports);
            }
            const packageCanvas = reference.family === 'canvas' && inside(path.join(engineRoot, 'src/canvas'), destination),
                context         = contexts.get(reader).find(item => item.prefix === (packageCanvas ? '../canvas/' : '../../')),
                contextRoot     = packageCanvas ? path.join(engineRoot, 'src/canvas') : root,
                resource        = destination.split(path.sep).join('/');
            if (!context || !inside(contextRoot, destination) || !destination.endsWith('.mjs') ||
                context.webpackInclude && !context.webpackInclude.test(resource) || context.webpackExclude?.test(resource)) {
                throw new Error(`Destination is outside ${label}'s bundled import context: ${path.relative(root, destination)}`);
            }
        } catch (error) {
            blockers.push({file: reference.file, reader, target: destination, reason: error.message});
        }
    }
    return blockers
}
