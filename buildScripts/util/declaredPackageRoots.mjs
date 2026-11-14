import fs   from 'node:fs';
import path from 'node:path';

/**
 * @summary Reads the roots installed dependencies declare under one `neo` manifest key, for webpack and emitted-ESM
 * builds.
 * @description Each key is one role's admission: `neo.mainAddons` reaches the Main addon context only, and
 * `neo.canvasModules` reaches the Canvas worker's module context only, so no declaration crosses into another
 * role's context. Each root stays within its declaring package, including when that package is linked. The caller
 * owns its build context or output tree; this reader creates neither and never scans undeclared package trees.
 * @param {String} workspaceRoot The consuming workspace whose manifest names the dependencies.
 * @param {String} key The manifest key under `neo`, such as `mainAddons` or `canvasModules`.
 * @returns {Array<{packageName: String, sourceRoot: String, relativeRoot: String}>}
 */
export function declaredPackageRoots(workspaceRoot, key) {
    const manifest = JSON.parse(fs.readFileSync(path.join(workspaceRoot, 'package.json'), 'utf8')),
          names    = Object.keys({...manifest.dependencies, ...manifest.devDependencies, ...manifest.optionalDependencies}).sort(),
          field    = `neo.${key}`,
          result   = [];

    for (const packageName of names) {
        if (!/^(?:@[^/\\.][^/\\]*\/)?[^/\\.][^/\\]*$/.test(packageName)) {
            throw new Error(`Invalid dependency name for ${field}: ${packageName}`)
        }

        const packageRoot  = path.join(workspaceRoot, 'node_modules', packageName),
              manifestPath = path.join(packageRoot, 'package.json');
        if (!fs.existsSync(manifestPath)) continue;

        const declared = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).neo?.[key];
        if (declared === undefined) continue;
        if (!Array.isArray(declared)) {
            throw new Error(`${packageName}: ${field} must be an array of package-relative directories`)
        }

        const packageReal = fs.realpathSync(packageRoot), seen = new Set();
        for (const root of declared) {
            if (typeof root !== 'string' || !root || root.includes('\\') || path.posix.isAbsolute(root) ||
                /^[A-Za-z]:/.test(root) || root.split('/').includes('..')) {
                throw new Error(`${packageName}: invalid ${field} root ${JSON.stringify(root)}`)
            }

            const normalized = path.posix.normalize(root), sourceRoot = path.join(packageRoot, normalized);
            if (seen.has(normalized)) continue;
            seen.add(normalized);
            if (!fs.existsSync(sourceRoot) || !fs.statSync(sourceRoot).isDirectory()) {
                throw new Error(`${packageName}: ${field} root ${root} is not a directory`)
            }

            const relativeReal = path.relative(packageReal, fs.realpathSync(sourceRoot));
            if (relativeReal === '..' || relativeReal.startsWith(`..${path.sep}`) || path.isAbsolute(relativeReal)) {
                throw new Error(`${packageName}: ${field} root ${root} leaves its package`)
            }

            result.push({packageName, sourceRoot, relativeRoot: path.posix.join('node_modules', packageName, normalized)})
        }
    }

    return result
}

/**
 * @summary The Main addon roots installed dependencies declare under `neo.mainAddons`.
 * @param {String} workspaceRoot The consuming workspace whose manifest names the dependencies.
 * @returns {Array<{packageName: String, sourceRoot: String, relativeRoot: String}>}
 */
export function mainAddonPackageRoots(workspaceRoot) {
    return declaredPackageRoots(workspaceRoot, 'mainAddons')
}

/**
 * @summary The Canvas worker module roots installed dependencies declare under `neo.canvasModules`: the trees
 * `Neo.worker.Canvas#loadModule` may load from by path.
 * @param {String} workspaceRoot The consuming workspace whose manifest names the dependencies.
 * @returns {Array<{packageName: String, sourceRoot: String, relativeRoot: String}>}
 */
export function canvasModulePackageRoots(workspaceRoot) {
    return declaredPackageRoots(workspaceRoot, 'canvasModules')
}

/** @summary Escapes a filesystem path for a context admission expression. @param {String} value @returns {String} */
const escapePattern = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @summary Points an unresolved webpack import context at the workspace's `node_modules` and admits exactly the
 * declared roots.
 * @description The context's keys become `./<package>/<root>/…`, never the `./node_modules/…` form, which webpack
 * rewrites into module requests that no longer match a `./` pattern. Every directory that is neither a declared
 * root, inside one, nor on the way to one is pruned, so no undeclared dependency is walked. Without roots the
 * context matches nothing.
 * @param {Object} context The unresolved context, as `ContextReplacementPlugin` hands it over.
 * @param {String} workspaceRoot The consuming workspace, never inferred from a linked package's real path.
 * @param {Object[]} roots The answer of {@link declaredPackageRoots} for the context's own key.
 */
export function admitDeclaredRoots(context, workspaceRoot, roots) {
    const root        = fs.realpathSync(path.join(workspaceRoot, 'node_modules')),
          directories = new Set(),
          allowed     = [];

    for (const entry of roots) {
        const folder = path.join(root, entry.relativeRoot.substring('node_modules/'.length));

        allowed.push(escapePattern(folder) + '(?:[/\\\\]|$)');
        for (let parent = path.dirname(folder); parent !== root; parent = path.dirname(parent)) {
            directories.add(escapePattern(parent) + '$')
        }
    }

    const request = path.relative(context.context, root).split(path.sep).join('/');

    context.request   = request.startsWith('.') ? request : './' + request;
    context.regExp    = roots.length
        ? new RegExp('^\\./(?:' + roots.map(entry => escapePattern(entry.relativeRoot.substring(13))).join('|') + ')/.*\\.mjs$')
        : /(?!)/;
    context.exclude   = roots.length ? new RegExp('^(?!(?:' + [...allowed, ...directories].join('|') + '))') : /.*/;
    context.recursive = roots.length > 0
}
