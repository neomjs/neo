import fs      from 'fs';
import path    from 'path';
import webpack from 'webpack';

const
    MATCHES_NOTHING   = /(?!)/,
    PACKAGE_REQUEST   = path.join('..', 'src', 'main', 'addon'),
    WORKSPACE_REQUEST = path.join('..', '..', '..', 'src', 'main', 'addon');

/**
 * @summary Resolves the optional workspace-owned Main-addon context without leaking package addons.
 *
 * `Main.mjs` has two intentionally distinct dynamic roots. `./main/addon` owns Engine addons;
 * `../../../src/main/addon` owns modules selected through the `WS/` prefix from a consuming
 * workspace. Inside this repository both roots physically coincide, so the workspace request is
 * rewritten to the package root exactly as before. In an installed consumer the authored request
 * already points at the correct workspace root and stays untouched when that optional directory
 * exists.
 *
 * Webpack resolves a dynamic-context directory even when the application config names no module
 * from it. An external workspace without `src/main/addon` is therefore valid but would fail at
 * compile time. That arm resolves through the package's existing addon directory and empties the
 * context match: resolving the package root without `MATCHES_NOTHING` would silently expose every
 * Engine addon through the consumer-owned `WS/` namespace.
 *
 * `ContextReplacementPlugin` visits both unresolved and resolved phases. Only the first owns the
 * request string; the phase gate keeps the mapping idempotent instead of inferring state from path
 * shape.
 *
 * @param {Boolean} insideNeo Building the Engine repository itself.
 * @returns {webpack.ContextReplacementPlugin}
 */
export default function mainAddonContextPlugin(insideNeo) {
    return new webpack.ContextReplacementPlugin(/.*/, context => {
        if (context.resource !== undefined || !context.context) return;
        if (path.join(context.request) !== WORKSPACE_REQUEST) return;

        if (insideNeo) {
            context.request = PACKAGE_REQUEST;
            return
        }

        if (!fs.existsSync(path.resolve(context.context, context.request))) {
            context.request = PACKAGE_REQUEST;
            context.regExp  = MATCHES_NOTHING
        }
    })
}
