import fg   from 'fast-glob';
import fs   from 'fs-extra';
import path from 'node:path';

/**
 * @module buildScripts.docs.seo.learnSpokes
 * @summary Detects unlisted public `.md` files under `learn/` that are absent from `learn/tree.json`.
 */

export const NON_TREE_LEARN_EXCLUDED_DIRS = Object.freeze([
    'learn/blog/',
    'learn/agentos/decisions/',
    'learn/agentos/measurements/',
    'learn/agentos/incidents/',
    'learn/agentos/process/'
]);

export const NON_TREE_LEARN_EXCLUDED_FILES = new Set([
    'learn/README.md',
    'learn/agentos/AGENTS_ATLAS.md'
]);

/**
 * @summary Finds public `.md` files under `learn/` that are absent from `learn/tree.json`.
 * @param {Object} [options={}]
 * @param {String} [options.learnDir]
 * @param {String} [options.root=process.cwd()]
 * @param {String} [options.treeFilePath]
 * @returns {Promise<String[]>}
 */
export async function findUnlistedLearnMarkdownFiles(options={}) {
    const {
        root         = process.cwd(),
        learnDir     = path.resolve(root, 'learn'),
        treeFilePath = path.join(learnDir, 'tree.json')
    } = options;

    if (!(await fs.pathExists(treeFilePath)) || !(await fs.pathExists(learnDir))) {
        return [];
    }

    const tree      = await fs.readJSON(treeFilePath);
    const nodes     = Array.isArray(tree) ? tree : (Array.isArray(tree?.data) ? tree.data : []);
    const treeFiles = new Set(
        nodes
            .filter(node => node?.id && node.isLeaf !== false && !node.route)
            .map(node => `learn/${String(node.id).replace(/^\/+/, '')}.md`)
    );

    const diskFiles = await fg('**/*.md', {
        cwd      : learnDir,
        onlyFiles: true,
        ignore   : ['**/node_modules/**']
    });

    return diskFiles
        .map(rel => `learn/${rel.split(path.sep).join('/')}`)
        .filter(rel =>
            !NON_TREE_LEARN_EXCLUDED_FILES.has(rel) &&
            !NON_TREE_LEARN_EXCLUDED_DIRS.some(prefix => rel.startsWith(prefix)) &&
            !treeFiles.has(rel)
        )
        .sort((a, b) => a.localeCompare(b));
}
