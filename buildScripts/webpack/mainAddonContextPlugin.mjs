import fs                                          from 'fs';
import path                                        from 'path';
import webpack                                     from 'webpack';
import {admitDeclaredRoots, mainAddonPackageRoots} from '../util/declaredPackageRoots.mjs';

const
    MATCHES_NOTHING   = /(?!)/,
    PACKAGE_REQUEST   = '../src/main/addon',
    WORKSPACE_REQUEST = '../../../src/main/addon';

/**
 * @summary Resolves workspace-owned and declared installed-package Main-addon contexts without mixing their roots.
 *
 * The existing roots stay distinct: `./main/addon` owns Engine addons;
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
 * @param {String} [workspaceRoot] The consumer workspace the build was started in, as its config holds it in
 * `cwd`. The authored `../../../src/main/addon` reaches the workspace only while the package sits two
 * directories under it, which a linked package does not. Omitted, the caller falls back to the installed
 * depth (`<workspace>/node_modules/neo.mjs`), the Main-side twin of the worker plugin's `../../../..`, so
 * the request stays the workspace's instead of doubling the addon segment inside the package.
 * @returns {webpack.ContextReplacementPlugin}
 */
export default function mainAddonContextPlugin(insideNeo, workspaceRoot) {
    const packageExcludes = new WeakSet();

    return new webpack.ContextReplacementPlugin(/.*/, context => {
        if (context.resource !== undefined) {
            if (packageExcludes.has(context.exclude)) {
                const {exclude, resolveDependencies} = context;

                // Pruning needs absolute paths; webpack's emitted context identity must not carry them.
                delete context.exclude;
                context.resolveDependencies = (fs, options, callback) =>
                    resolveDependencies(fs, {...options, exclude}, callback)
            }
            return
        }
        if (!context.context) return;

        const request = path.posix.normalize(context.request.replaceAll('\\', '/'));
        if (request === '../..' || request === '../node_modules') {
            const workspace = workspaceRoot ? path.resolve(workspaceRoot) :
                      path.resolve(context.context, insideNeo ? '..' : '../../..'),
                  sourceRoot = path.join(workspace, insideNeo ? 'src' : 'node_modules/neo.mjs/src');

            if (fs.existsSync(sourceRoot) && fs.realpathSync(context.context) === fs.realpathSync(sourceRoot)) {
                admitDeclaredRoots(context, workspace, mainAddonPackageRoots(workspace));
                packageExcludes.add(context.exclude)
            }
            return
        }

        if (request !== WORKSPACE_REQUEST) return;

        if (insideNeo) {
            context.request = PACKAGE_REQUEST;
            return
        }

        const workspaceRootResolved = workspaceRoot
            ? path.resolve(workspaceRoot)
            : path.resolve(context.context, '../../..');

        const workspaceAddon = path.relative(
            context.context, path.join(workspaceRootResolved, 'src/main/addon')
        ).split(path.sep).join('/');

        if (!fs.existsSync(path.resolve(context.context, workspaceAddon))) {
            context.request = PACKAGE_REQUEST;
            context.regExp  = MATCHES_NOTHING
        } else {
            context.request = workspaceAddon.startsWith('.') ? workspaceAddon : `./${workspaceAddon}`
        }
    })
}
