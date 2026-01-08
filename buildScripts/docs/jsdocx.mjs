import fs                 from 'fs-extra';
import {parse, writeJSON} from './jsdoc-x/index.mjs';
import {marked}           from 'marked';
import path               from 'path';

console.log('Starting JSDoc documentation generation...');
const totalStartTime = new Date();

const __dirname   = path.resolve(),
      cwd         = process.cwd(),
      requireJson = path => JSON.parse(fs.readFileSync((path))),
      packageJson = requireJson(path.resolve(cwd, 'package.json')),
      insideNeo   = packageJson.name.includes('neo.mjs'),
      neoPath     = insideNeo ? '' : 'node_modules/neo.mjs/',
      appNames    = [],
      options = {
          access        : 'all',
          files         : [`${neoPath}src/**/*.mjs`, `${neoPath}ai/**/*.mjs`, `${neoPath}docs/app/**/*.mjs`],
          includePattern: ".+\\.(m)js(doc)?$",
          excludePattern: "(^|\\/|\\\\)_",
          recurse       : true,
          undocumented  : false
      };

let appJsonPath = path.resolve(cwd, 'buildScripts/myApps.json'),
    appJson;

if (fs.existsSync(appJsonPath)) {
    appJson = requireJson(appJsonPath);
} else {
    appJsonPath = path.resolve(__dirname, 'buildScripts/webpack/json/myApps.json');

    if (fs.existsSync(appJsonPath)) {
        appJson = requireJson(appJsonPath);
    } else {
        appJson = requireJson(path.resolve(__dirname, 'buildScripts/webpack/json/myApps.template.json'));
    }
}

appJson?.apps.forEach(key => {
    if (key !== 'Docs') { // the docs app is automatically included
        appNames.push(key);
        options.files.push(`apps/${key.toLowerCase()}/**/*.mjs`);
    }
});

// Optimized namespace builder using plain objects instead of globalThis
function createNamespaceTree(names) {
    names = Array.isArray(names) ? names : names.split('.');

    const root = {};
    let current = root;

    for (const name of names) {
        if (!current[name]) {
            current[name] = {};
        }
        current = current[name];
    }

    return root;
}

function getNamespace(tree, names) {
    names = Array.isArray(names) ? names : names.split('.');
    let current = tree;

    for (const name of names) {
        if (!current[name]) return null;
        current = current[name];
    }

    return current;
}

function setNamespace(tree, names, value) {
    names = Array.isArray(names) ? names : names.split('.');
    let current = tree;

    for (let i = 0; i < names.length - 1; i++) {
        if (!current[names[i]]) {
            current[names[i]] = {};
        }
        current = current[names[i]];
    }

    current[names[names.length - 1]] = value;
}

let neoStructure = [{
    className: null,
    id       : 1,
    isLeaf   : false,
    name     : "src",
    path     : "",
    parentId : null,
    singleton: false
}, {
    className: null,
    collapsed: true,
    id       : 2,
    isLeaf   : false,
    name     : "apps",
    path     : "",
    parentId : null,
    singleton: false
}];

let neoStructureId = 2;

// Pre-index docs for O(1) lookups
function indexDocs(docs) {
    const byClassName = new Map();
    const appNamesSet = new Set(appNames);

    for (const doc of docs) {
        if ((doc.$kind === 'class' || doc.$kind === 'module') && doc.neoClassName) {
            byClassName.set(doc.neoClassName, doc);
        }
    }

    return { byClassName, appNamesSet };
}

function generateStructure(namespaceTree, target, parentId, docIndex) {
    const namespace = getNamespace(namespaceTree, target);

    if (!namespace) {
        console.log('Missing namespace:', target);
        return;
    }

    const entries = Object.entries(namespace);

    for (const [key, value] of entries) {
        const id        = ++neoStructureId;
        const isLeaf    = Object.keys(value).length === 0;
        let className   = null;
        let singleton   = false;
        let srcPath     = null;
        let path        = '';
        let hasMatch    = false;

        // Check app names
        for (const appName of appNames) {
            if (target.indexOf(appName + 'Empty.') === 0) {
                path = target.substr(appName.length * 2 + 6);
                className = isLeaf ? appName + (path ? path + '.' : '.') + key : null;
                hasMatch = true;
                break;
            }
        }

        if (!hasMatch) {
            if (target.indexOf('DocsEmpty.') === 0) {
                path = target.substr(15);
                className = isLeaf ? 'Docs.app.' + (path ? path + '.' : '') + key : null;
            } else {
                path = target.substr(target.indexOf('NeoEmpty.') === 0 ? 9 : 8);
                className = isLeaf ? 'Neo.' + (path ? path + '.' : '') + key : null;
                className = className === 'Neo.Neo' ? 'Neo' : className;
            }
        }

        if (isLeaf && className) {
            const docItem = docIndex.byClassName.get(className);

            if (docItem) {
                const metaPath = docItem.meta.path;
                let m = false;

                // Try different path patterns
                const patterns = [
                    { search: 'neomjs/neo/', offset: 11 },
                    { search: 'neo.mjs/', offset: 8 },
                    { search: 'neo/', offset: 4 },
                    { search: '/apps/', offset: 1 },
                    { search: '/docs/', offset: 1 }
                ];

                for (const { search, offset } of patterns) {
                    const i = metaPath.indexOf(search);
                    if (i > -1) {
                        srcPath = metaPath.substr(i + offset) + '/' + docItem.meta.filename;
                        m = true;
                        break;
                    }
                }

                // Check for singleton tag
                if (docItem.tags) {
                    singleton = docItem.tags.some(tag => tag.title === 'singleton');
                }
            }
        }

        // Adjust paths when running inside neo.mjs node module
        if (srcPath) {
            const index = srcPath.indexOf('node_modules/neo.mjs/');
            if (index > -1) {
                srcPath = srcPath.substr(index + 21);
            }

            if (!insideNeo && !srcPath.includes('apps/') && !srcPath.includes('docs/')) {
                srcPath = 'node_modules/neo.mjs/' + srcPath;
            }
        }

        neoStructure.push({
            className,
            collapsed: appNames.includes(key) || key === 'Docs',
            id,
            isLeaf,
            name     : key,
            path,
            parentId,
            singleton,
            srcPath
        });

        generateStructure(namespaceTree, target + '.' + key, id, docIndex);
    }
}

// Cache for path processing to avoid repeated regex operations
const pathCache = new Map();

function processPath(itemPath, filename, appNames) {
    const cacheKey = itemPath + '|' + filename;
    if (pathCache.has(cacheKey)) {
        return pathCache.get(cacheKey);
    }

    let path = itemPath.replace(/\\/g, '/'); // sync windows paths to macOS
    let index = path.indexOf('/ai/');

    if (index > -1) {
        path = 'ai.' + path.substr(index + 4) + '.';
    } else if (path.endsWith('/ai')) {
        path = 'ai.';
    } else {
        index = path.indexOf('/src/');

        if (index > -1) {
            path = path.substr(index + 5) + '.';
        } else {
            index = path.indexOf('/src');

            if (index > -1) {
                path = path.substr(index + 4); // top level files
            } else {
                index = path.indexOf('/apps/');

                if (index > -1) {
                    for (const appName of appNames) {
                        const lAppName = appName.toLowerCase();
                        let pathLen = path.lastIndexOf('/' + lAppName);

                        if (pathLen !== -1) {
                            // top level files
                            if (pathLen === path.length - appName.length - 1) {
                                path = appName + path.substr(index + appName.length + 6) + '.';
                                break;
                            } else {
                                pathLen = path.indexOf(lAppName + '/');

                                if (pathLen > -1) {
                                    path = appName + path.substr(index + appName.length + 6) + '.';
                                    break;
                                }
                            }
                        }
                    }
                } else {
                    index = path.indexOf('/docs/');

                    if (index > -1) {
                        path = 'Docs.' + path.substr(index + 10) + '.';
                    }
                }
            }
        }
    }

    path = path.replace(/\//g, '.');
    const result = path + filename;
    pathCache.set(cacheKey, result);
    return result;
}

console.log('Start default jsdocx parsing.');
const startDateDefault = new Date();

parse(options)
    .then(async function (docs) {
        console.log('Default jsdocx parsing done.');
        const processTimeDefault = (Math.round((new Date - startDateDefault) * 100) / 100000).toFixed(2);
        console.log(`jsdocx default parsing time: ${processTimeDefault}s`);

        const startDate = new Date();

        // Create namespace trees
        const neoTree = {};
        const docsTree = {};
        const appTrees = {};
        appNames.forEach(name => appTrees[name] = {});

        const structure = {};
        const classHierarchy = {};
        const fileNamespaces = {};

        // Single pass through docs - do everything at once
        for (let i = 0; i < docs.length; i++) {
            const item = docs[i];

            // Check for @ignoreDocs tag
            if (item.tags && item.tags.some(tag => tag.title === 'ignoredocs')) {
                continue;
            }

            docs[i].id = i + 1;

            const filename = item.meta.filename.substr(0, item.meta.filename.lastIndexOf('.'));
            const fullPath = processPath(item.meta.path, filename, appNames);

            structure[fullPath] = true;

            // Determine which tree this belongs to
            let hasMatch = false;
            let neoClassName = '';

            for (const appName of appNames) {
                if (fullPath.indexOf(appName + '.') === 0) {
                    setNamespace(appTrees[appName], appName + 'Empty.' + fullPath, {});
                    neoClassName = fullPath;
                    hasMatch = true;
                    break;
                }
            }

            if (!hasMatch) {
                if (fullPath.indexOf('Docs') === 0) {
                    setNamespace(docsTree, 'DocsEmpty.' + fullPath, {});
                    neoClassName = 'Docs.app' + fullPath.substr(4);
                } else {
                    neoClassName = fullPath === 'Neo' ? fullPath : 'Neo.' + fullPath;
                    setNamespace(neoTree, 'NeoEmpty.' + fullPath, {});
                }
            }

            item.neoClassName = neoClassName;

            // Get/create namespace for classData
            let namespace;
            if (neoClassName === 'Neo') {
                namespace = getNamespace(neoTree, 'Neo.Neo') || {};
                setNamespace(neoTree, 'Neo.Neo', namespace);
            } else {
                if (hasMatch) {
                    const appName = appNames.find(name => fullPath.indexOf(name + '.') === 0);
                    namespace = getNamespace(appTrees[appName], neoClassName) || {};
                    setNamespace(appTrees[appName], neoClassName, namespace);
                } else if (fullPath.indexOf('Docs') === 0) {
                    namespace = getNamespace(docsTree, neoClassName) || {};
                    setNamespace(docsTree, neoClassName, namespace);
                } else {
                    namespace = getNamespace(neoTree, neoClassName) || {};
                    setNamespace(neoTree, neoClassName, namespace);
                }
            }

            namespace.classData = namespace.classData || [];
            namespace.classData.push(item);

            // Store for later file writing
            fileNamespaces[fullPath] = namespace;

            // Parse markdown descriptions
            if (item.description) {
                item.description = marked.parse(item.description);
            }

            item.params?.forEach(param => {
                if (param.description) {
                    param.description = marked.parse(param.description);
                }
            });

            // Handle member-specific logic
            if (item.kind === 'member') {
                if (item.comment) {
                    item.meta.lineno += item.comment.split('\n').length;
                }

                if (item.defaultvalue && item.type?.names) {
                    const type = item.type.names[0].toLowerCase();

                    if (type.indexOf('array') > -1 || type.indexOf('object') > -1) {
                        let defaultValue = item.comment.substr(item.comment.indexOf('=') + 1);
                        defaultValue = defaultValue.substr(0, defaultValue.indexOf('\n'));
                        defaultValue.trim();
                        item.defaultvalue = defaultValue;
                    }
                }
            }

            if (item.memberof === 'module:Neo.config') {
                item.name = 'config.' + item.name;
            }

            // Build class hierarchy in same pass
            if (item.$kind === 'class' && item.neoClassName && item.neoClassName !== 'Neo') {
                const parentClass = item.augments?.length > 0 ? item.augments[0] : null;
                classHierarchy[item.neoClassName] = parentClass;
            }
        }

        // Write all.json
        await writeJSON({
            path  : './docs/output/all.json',
            indent: 0,
            force : true
        }, docs);

        // Write individual files
        const writePromises = [];
        for (const [key, namespace] of Object.entries(fileNamespaces)) {
            const firstChar = key.charAt(0);
            let filePath = key.replace(/\./g, '/');

            if (firstChar === firstChar.toUpperCase() && key.includes('.')) {
                filePath = 'apps/' + filePath + '.json';
            } else {
                filePath = 'src/' + filePath + '.json';
            }

            writePromises.push(
                writeJSON({
                    path  : './docs/output/' + filePath,
                    indent: 0,
                    force : true
                }, namespace)
            );
        }

        // Index docs for structure generation
        const docIndex = indexDocs(docs);

        // Generate structures
        generateStructure(neoTree, 'NeoEmpty', 1, docIndex);
        generateStructure(docsTree, 'DocsEmpty', 2, docIndex);

        appNames.forEach(key => {
            generateStructure(appTrees[key], key + 'Empty', 2, docIndex);
        });

        // Sort and write class hierarchy
        const sortedKeys = Object.keys(classHierarchy).sort();
        
        // Convert to JSON object for structured access
        const hierarchyJson = {};
        sortedKeys.forEach(key => {
            hierarchyJson[key] = classHierarchy[key] || null;
        });

        writePromises.push(
            writeJSON({
                path  : './docs/output/class-hierarchy.json',
                indent: 0,
                force : true
            }, hierarchyJson)
        );

        // Filter out leaf nodes with null srcPath
        neoStructure = neoStructure.filter(item => !item.isLeaf || item.srcPath !== null);

        // Prune empty folders
        let changed = true;
        while (changed) {
            changed = false;
            const parentIds = new Set(neoStructure.map(item => item.parentId));
            const initialLength = neoStructure.length;

            neoStructure = neoStructure.filter(item => {
                if (item.isLeaf) return true;
                // Keep items that are parents of existing nodes
                if (parentIds.has(item.id)) return true;
                return false;
            });

            if (neoStructure.length !== initialLength) changed = true;
        }

        // Sort structure
        neoStructure.sort(function (a, b) {
            const nameA = a.name || '';
            const nameB = b.name || '';

            if (nameA[0] === nameA[0].toLocaleLowerCase() && nameB[0] === nameB[0].toLocaleLowerCase() ||
                nameA[0] === nameA[0].toLocaleUpperCase() && nameB[0] === nameB[0].toLocaleUpperCase()) {
                return nameA.localeCompare(nameB);
            }
            if (nameA[0] === nameA[0].toLocaleLowerCase()) {
                return -1;
            }
            return 1;
        });

        writePromises.push(
            writeJSON({
                path  : './docs/output/structure.json',
                indent: 0,
                force : true
            }, neoStructure)
        );

        // Wait for all writes to complete in parallel
        await Promise.all(writePromises);

        console.log('Generated docs/output/class-hierarchy.yaml');

        const processTime = (Math.round((new Date - startDate) * 100) / 100000).toFixed(2);
        console.log(`jsdocx custom parsing time: ${processTime}s`);

        const totalTime = (Math.round((new Date - totalStartTime) * 100) / 100000).toFixed(2);
        console.log(`\nTotal documentation generation time: ${totalTime}s`);
    })
    .catch(function (err) {
        console.log(err.stack);
    });
