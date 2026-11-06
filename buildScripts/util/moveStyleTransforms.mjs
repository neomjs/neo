import path        from 'node:path';
import scss        from 'postcss-scss';
import valueParser from 'postcss-value-parser';

/**
 * @module buildScripts/util/moveStyleTransforms
 * @summary Resolves local Sass modules before relocating their importer or target, preserving selector identities.
 */

/**
 * @summary Resolves a local Sass path, including partials and directory indexes, without choosing between collisions.
 * @param {String} specifier Sass module URL.
 * @param {String} from Original stylesheet.
 * @param {Function} exists Predicate over absolute file paths.
 * @returns {String[]} Candidate existing files.
 */
function resolveStyle(specifier, from, exists) {
    const target   = path.resolve(path.dirname(from), specifier),
        directory  = path.dirname(target), name = path.basename(target),
        extensions = path.extname(target) ? [''] : ['.scss', '.sass', '.css'],
        candidates = extensions.flatMap(extension => [target + extension, path.join(directory, `_${name}${extension}`)]);

    if (!path.extname(target)) candidates.push(path.join(target, '_index.scss'), path.join(target, 'index.scss'));

    return [...new Set(candidates.filter(exists))]
}

/**
 * @summary Rewrites local use/forward/import paths using resolved file identity; returns ambiguous references.
 * Built-in modules and external CSS imports retain their existing semantics. Non-local Sass load paths cannot
 * be inferred from a stylesheet alone and are returned unresolved when its origin moves.
 * @param {Object} options
 * @param {String} options.code Stylesheet source.
 * @param {String} options.from Original absolute path.
 * @param {String} options.to Final absolute path.
 * @param {Function} options.mapPath Complete old/new path mapping.
 * @param {Function} options.exists Predicate over original absolute paths.
 * @returns {Object} Rewritten code and unresolved references.
 */
export function rewriteStyle({code, from, to, mapPath, exists}) {
    const root = scss.parse(code, {from}), unresolved = [];

    root.walkAtRules(rule => {
        if (!['use', 'forward', 'import'].includes(rule.name)) return;
        const params = valueParser(rule.params);

        for (const node of params.nodes) {
            if (node.type !== 'string') continue;
            const original = node.value;

            if (/^(?:[a-z][\w+.-]*:|\/\/|\/)/i.test(original) ||
                (rule.name === 'import' && /\.css(?:[?#]|$)/i.test(original))) continue;

            if (original.includes('#{')) {
                unresolved.push({line: rule.source.start.line, reference: original, reason: 'computed Sass URL'});
                continue
            }

            const candidates = resolveStyle(original, from, exists);

            if (candidates.length !== 1) {
                unresolved.push({line: rule.source.start.line, reference: original,
                    reason: candidates.length ? 'ambiguous Sass resolution' : 'unresolved Sass load path'});
                continue
            }

            const resolved = candidates[0], target = mapPath(resolved);

            if (from !== to || target !== resolved) {
                let relative = path.relative(path.dirname(to), target).split(path.sep).join('/');
                if (!path.extname(original)) relative = relative.replace(/\.(scss|sass|css)$/, '');
                if (!path.basename(original).startsWith('_')) {
                    relative = relative.replace(/(^|\/)_(?=[^/]+$)/, '$1');
                }
                if (!relative.startsWith('.')) relative = `./${relative}`;
                node.value = relative;

                const namespace = value => path.basename(value).replace(/^_/, '').replace(/\.(scss|sass|css)$/, '');
                if (rule.name === 'use' && namespace(original) !== namespace(relative) &&
                    !params.nodes.some(token => token.type === 'word' && token.value === 'as')) {
                    params.nodes.splice(params.nodes.indexOf(node) + 1, 0,
                        {type: 'space', value: ' '}, {type: 'word', value: 'as'},
                        {type: 'space', value: ' '}, {type: 'word', value: namespace(original)});
                }
            }
        }

        rule.params = params.toString();
    });

    return {code: root.toString(scss.stringify), unresolved}
}
