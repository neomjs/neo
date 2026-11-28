/**
 * @module buildScripts/util/themeCssLayers
 * @summary The cascade layer of each built theme sheet, and the PostCSS plugin that writes it.
 *
 * A sheet's layer follows from its folder, so `build-themes` and `watch-themes` call the same two
 * functions and a watched save writes the layer the full build writes. No sheet under
 * `resources/css` writes `@layer` itself: the plugin is the only writer there and rejects a sheet that does.
 */

/**
 * The cascade layers, weakest first. Every built sheet starts with this order statement, so the order
 * holds whichever sheet arrives first. `neo.vendor` is for vendor sheets loaded from outside
 * `resources/css`, which carry their own layer; `neo.apps` holds every sheet under an `apps` or `examples`
 * folder, so an app's rule wins without `!important`. Rules inserted at runtime stay unlayered and win.
 * @type {String[]}
 */
export const LAYER_ORDER = Object.freeze([
    'neo.vendor',
    'neo.roles',
    'neo.base',
    'neo.theme',
    'neo.rules',
    'neo.apps'
]);

/**
 * @summary Returns the cascade layer of a built sheet from its folder.
 * @description An app's and an example's sheets sit in `neo.apps` whichever top folder holds them, so an
 * app's theme projection outranks the engine's theme values by layer, not by selector weight. Inside
 * `theme-base`, `Global.css` enters `neo.roles` beside each theme's `Global.css` so per-theme `--neo-global-*`
 * values and classic `initial` declines outrank the zero-weight base bindings regardless of arrival order.
 * @param {String} root The sheet's top folder under `resources/css`: `src`, `theme-base` or a theme folder.
 * @param {String} relativeFile The sheet's path inside that folder, e.g. `component/Base.css`.
 * @returns {String} One of {@link LAYER_ORDER}.
 */
export function cascadeLayer(root, relativeFile) {
    const parts = relativeFile.split(/[\\/]/).filter(Boolean);

    if (parts[0] === 'apps' || parts[0] === 'examples') {
        return 'neo.apps'
    }

    if (root === 'src') {
        return 'neo.rules'
    }

    if (root === 'theme-base') {
        return parts.length === 1 && parts[0] === 'Global.css' ? 'neo.roles' : 'neo.base'
    }

    return parts.length === 1 && parts[0] === 'Global.css' ? 'neo.roles' : 'neo.theme'
}

/**
 * @summary PostCSS plugin: wraps a sheet's rules in its cascade layer and starts the sheet with the
 * order statement.
 * @description The plugin moves the syntax tree's nodes into one layer block instead of prepending text,
 * so a source map keeps its lines. `@charset` stays first, and an `@import` stays at the top level, because
 * an import inside a layer block is never fetched. A relative import resolves to another built sheet,
 * which enters its own layer once.
 * @param {Object} options
 * @param {String} options.layer The sheet's layer, from {@link cascadeLayer}.
 * @returns {Object} The PostCSS plugin.
 */
export function cascadeLayerPlugin({layer}) {
    return {
        postcssPlugin: 'neo-cascade-layer',
        Once(root, {AtRule}) {
            root.walkAtRules('layer', node => {
                throw node.error('A sheet under resources/css writes no @layer: the theme build writes its layer (ADR 0044, I3)')
            });

            // The generated nodes take the sheet's own span, so the map's only source stays the sheet
            const {source} = root,
                  isHead   = node => node.type === 'atrule' && (node.name === 'charset' || node.name === 'import'),
                  body     = root.nodes.filter(node => !isHead(node)),
                  charset  = root.nodes.find(node => node.type === 'atrule' && node.name === 'charset'),
                  order    = new AtRule({name: 'layer', params: LAYER_ORDER.join(', '), source});

            if (body.length > 0) {
                root.append(new AtRule({name: 'layer', params: layer, raws: {between: ' '}, source}).append(body))
            }

            charset ? charset.after(order) : root.prepend(order);
            root.raws.semicolon = true
        }
    }
}

cascadeLayerPlugin.postcss = true;
