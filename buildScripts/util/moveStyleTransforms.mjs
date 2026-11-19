import path        from 'node:path';
import postcss     from 'postcss';
import valueParser from 'postcss-value-parser';

/**
 * @module buildScripts/util/moveStyleTransforms
 * @summary Keeps a stylesheet's relative `@import` URLs naming the same files when the stylesheet or an imported
 * file relocates.
 */

/**
 * @summary Rewrites the relative `@import` URLs of a stylesheet that moves, or whose imports move; returns the
 * imports it cannot resolve. Absolute and remote URLs keep their meaning and stay as written. A browser resolves
 * an import against the built sheet, and the build mirrors the source tree, so source paths decide.
 * @param {Object} options
 * @param {String} options.code Stylesheet source.
 * @param {String} options.from Original absolute path.
 * @param {String} options.to Final absolute path.
 * @param {Function} options.mapPath Complete old/new path mapping.
 * @param {Function} options.exists Predicate over original absolute paths.
 * @returns {Object} Rewritten code and unresolved references.
 */
export function rewriteStyle({code, from, to, mapPath, exists}) {
    const root = postcss.parse(code, {from}), unresolved = [];

    root.walkAtRules('import', rule => {
        const params = valueParser(rule.params),
              first  = params.nodes.find(node => node.type !== 'space'),
              holder = first?.type === 'function' && first.value.toLowerCase() === 'url' ? first.nodes[0] : first;

        if (!holder || !['string', 'word'].includes(holder.type)) return;

        const original = holder.value;

        if (/^(?:[a-z][\w+.-]*:|\/\/|\/)/i.test(original)) return;

        const resolved = path.resolve(path.dirname(from), original.replace(/[?#].*$/, ''));

        // An unresolvable import is this move's concern only when the stylesheet itself relocates
        if (!exists(resolved)) {
            if (from !== to) unresolved.push({line: rule.source.start.line, reference: original, reason: 'unresolved CSS import'});
            return
        }

        const target = mapPath(resolved);

        if (from !== to || target !== resolved) {
            let relative = path.relative(path.dirname(to), target).split(path.sep).join('/');

            if (!relative.startsWith('.')) relative = `./${relative}`;

            holder.value = relative + original.slice(original.replace(/[?#].*$/, '').length);
            rule.params  = params.toString()
        }
    });

    return {code: root.toString(), unresolved}
}
