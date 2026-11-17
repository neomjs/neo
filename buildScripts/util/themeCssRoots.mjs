import fs                     from 'node:fs';
import path                   from 'node:path';
import {declaredPackageRoots} from './declaredPackageRoots.mjs';

/**
 * @summary The theme source roots of a repository, in override order: the Engine's, then the root each
 * installed package declares as `neo.css`, then the workspace's own. Inside the Engine there is one.
 * @description The one list that `build-themes`, `create-theme` and `watch-themes` read, so a sheet each
 * of them sees is the sheet the others see. A later root replaces an earlier root's sheet at the same
 * path. Packages come in name order, and a declared root that is missing or leaves its package throws
 * (see {@link declaredPackageRoots}). The Engine and workspace roots need not exist yet.
 * @param {String} repoRoot Workspace or Engine repository root.
 * @returns {String[]} Absolute directories.
 */
export function themeCssRoots(repoRoot) {
    const insideNeo = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).name.includes('neo.mjs'),
          framework = path.join(repoRoot, insideNeo ? '' : 'node_modules/neo.mjs', 'resources/css');

    if (insideNeo) {
        return [framework]
    }

    return [...new Set([
        framework,
        ...declaredPackageRoots(repoRoot, 'css', {single: true}).map(entry => entry.sourceRoot),
        path.join(repoRoot, 'resources/css')
    ])]
}
