import fs                                             from 'fs';
import path                                           from 'path';
import webpack                                        from 'webpack';
import {admitDeclaredRoots, canvasModulePackageRoots} from '../util/declaredPackageRoots.mjs';

/**
 * @summary The Canvas worker's package-module root, relative to the worker: the directory that holds the engine
 * package, which is the workspace's `node_modules` once the engine is installed.
 * @private
 */
const PACKAGE_MODULE_ROOT = '../../..';

/**
 * @summary Admits the roots installed packages declare under `neo.canvasModules` into the Canvas worker's
 * package-module context, and nothing else from `node_modules`.
 *
 * `Neo.worker.Canvas#loadModule` imports a `node_modules/<package>/…` path through its own root, `../../..` from
 * the worker. Its authored exclude scans nothing, which is what the Engine's own build gets. In a consumer build,
 * `workerContextRebasePlugin` empties that root, as it does every root outside the package. This plugin runs after
 * it, points the root at the workspace's `node_modules` and admits exactly the declared roots, so the context keys
 * are `./<package>/…`, the path the import asks for. A workspace that declares nothing keeps the empty context.
 *
 * Each key is one role's admission: `neo.mainAddons` roots never enter this context, and these roots never enter
 * the Main addon context (`mainAddonContextPlugin`).
 *
 * Admission needs absolute paths, which webpack's emitted context identity must not carry, so the resolved phase
 * moves the exclude into the dependency resolution, as `mainAddonContextPlugin` does.
 *
 * @param {Boolean} insideNeo Building the Engine repository itself, which installs no such packages.
 * @param {String} workspaceRoot The consumer workspace the build was started in, as its config holds it in `cwd`.
 * @returns {webpack.ContextReplacementPlugin}
 */
export default function canvasModuleContextPlugin(insideNeo, workspaceRoot) {
    const admitted = new WeakSet();

    return new webpack.ContextReplacementPlugin(/.*/, context => {
        if (context.resource !== undefined) {
            if (admitted.has(context.exclude)) {
                const {exclude, resolveDependencies} = context;

                delete context.exclude;
                context.resolveDependencies = (fs, options, callback) =>
                    resolveDependencies(fs, {...options, exclude}, callback)
            }
            return
        }

        if (insideNeo || !context.context ||
            path.posix.normalize(context.request.replaceAll('\\', '/')) !== PACKAGE_MODULE_ROOT) return;

        const workspace = path.resolve(workspaceRoot),
              workerDir = path.join(workspace, 'node_modules/neo.mjs/src/worker');

        // Only the installed engine's own worker directory, whichever real path a linked layout gives it
        if (!fs.existsSync(workerDir) || fs.realpathSync(context.context) !== fs.realpathSync(workerDir)) return;

        const roots = canvasModulePackageRoots(workspace);

        if (roots.length) {
            admitDeclaredRoots(context, workspace, roots);
            admitted.add(context.exclude)
        }
    })
}
