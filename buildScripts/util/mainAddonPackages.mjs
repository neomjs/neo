import fs   from 'node:fs';
import path from 'node:path';

/**
 * @summary Reads installed dependencies' declared Main-addon roots for webpack and emitted-ESM builds.
 * @description Each root stays within its declaring package, including when that package is linked. The caller
 * owns its build context or output tree; this reader creates neither and never scans undeclared package trees.
 * @param {String} workspaceRoot The consuming workspace whose manifest names the dependencies.
 * @returns {Array<{packageName: String, sourceRoot: String, relativeRoot: String}>}
 */
export function mainAddonPackageRoots(workspaceRoot) {
    const manifest = JSON.parse(fs.readFileSync(path.join(workspaceRoot, 'package.json'), 'utf8')),
          names    = Object.keys({...manifest.dependencies, ...manifest.devDependencies, ...manifest.optionalDependencies}).sort(),
          result   = [];

    for (const packageName of names) {
        if (!/^(?:@[^/\\.][^/\\]*\/)?[^/\\.][^/\\]*$/.test(packageName)) {
            throw new Error(`Invalid dependency name for Main addons: ${packageName}`)
        }

        const packageRoot  = path.join(workspaceRoot, 'node_modules', packageName),
              manifestPath = path.join(packageRoot, 'package.json');
        if (!fs.existsSync(manifestPath)) continue;

        const declared = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).neo?.mainAddons;
        if (declared === undefined) continue;
        if (!Array.isArray(declared)) {
            throw new Error(`${packageName}: neo.mainAddons must be an array of package-relative directories`)
        }

        const packageReal = fs.realpathSync(packageRoot), seen = new Set();
        for (const root of declared) {
            if (typeof root !== 'string' || !root || root.includes('\\') || path.posix.isAbsolute(root) ||
                /^[A-Za-z]:/.test(root) || root.split('/').includes('..')) {
                throw new Error(`${packageName}: invalid neo.mainAddons root ${JSON.stringify(root)}`)
            }

            const normalized = path.posix.normalize(root), sourceRoot = path.join(packageRoot, normalized);
            if (seen.has(normalized)) continue;
            seen.add(normalized);
            if (!fs.existsSync(sourceRoot) || !fs.statSync(sourceRoot).isDirectory()) {
                throw new Error(`${packageName}: neo.mainAddons root ${root} is not a directory`)
            }

            const relativeReal = path.relative(packageReal, fs.realpathSync(sourceRoot));
            if (relativeReal === '..' || relativeReal.startsWith(`..${path.sep}`) || path.isAbsolute(relativeReal)) {
                throw new Error(`${packageName}: neo.mainAddons root ${root} leaves its package`)
            }

            result.push({packageName, sourceRoot, relativeRoot: path.posix.join('node_modules', packageName, normalized)})
        }
    }

    return result
}
