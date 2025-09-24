import fs       from 'fs-extra';
import helper   from 'neo-jsdoc-x/src/lib/helper.js';
import jsdocx   from 'neo-jsdoc-x';
import {marked} from 'marked';
import path     from 'path';

const __dirname   = path.resolve(),
      cwd         = process.cwd(),
      requireJson = path => JSON.parse(fs.readFileSync((path))),
      packageJson = requireJson(path.resolve(cwd, 'package.json')),
      insideNeo   = packageJson.name.includes('neo.mjs'),
      neoPath     = insideNeo ? '' : 'node_modules/neo.mjs/',
      appNames    = [],
      options = {
          access        : 'all',
          files         : [`${neoPath}src/**/*.mjs`, `${neoPath}docs/app/**/*.mjs`],
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

function ns(names, create) {
    names = Array.isArray(names) ? names : names.split('.');

    return names.reduce((prev, current) => {
        if (create && !prev[current]) {
            prev[current] = {};
        }
        if (prev) {
            return prev[current];
        }
    }, globalThis);
}

const neoStructure = [{
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

function generateStructure(target, parentId, docs) {
    let namespace = ns(target),
        len       = docs.length,
        className, docItem, i, id, j, hasMatch, isLeaf, path, singleton, srcPath, tagLength;

    if (!namespace) {
        console.log(target);
    }

    Object.entries(namespace).forEach(([key, value]) => {
        id        = ++neoStructureId;
        isLeaf    = Object.entries(value).length < 1;
        singleton = false;
        srcPath   = null;

        hasMatch = false;

        for (i=0; i < appNames.length; i++) {
            if (target.indexOf(appNames[i] + 'Empty.') === 0) {
                path = target.substr(appNames[i].length * 2 + 6);

                className = isLeaf ? appNames[i] + (path ? path + '.' : '.') + key : null;
                // console.log(target);
                // console.log(path);
                // console.log(className);
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

        if (isLeaf) {
            for (i = 0; i < len; i++) {
                docItem = docs[i];

                if ((docItem.$kind === 'class' || docItem.$kind === 'module') && docItem.neoClassName === className) {
                    let i = docItem.meta.path.indexOf('neomjs/neo/'),
                        m = false;

                    if (i > -1) {
                        srcPath = docItem.meta.path.substr(i + 11) + '/' + docItem.meta.filename;
                        m = true;
                    }

                    if (!m) {
                        i = docItem.meta.path.indexOf('neo.mjs/');

                        if (i > -1) {
                            srcPath = docItem.meta.path.substr(i + 8) + '/' + docItem.meta.filename;
                            m = true;
                        }
                    }

                    if (!m) {
                        i = docItem.meta.path.indexOf('neo/');

                        if (i > -1) {
                            srcPath = docItem.meta.path.substr(i + 4) + '/' + docItem.meta.filename;
                            m = true;
                        }
                    }

                    if (!m) {
                        i = docItem.meta.path.indexOf('/apps/');

                        if (i > -1) {
                            srcPath = docItem.meta.path.substr(i + 1) + '/' + docItem.meta.filename;
                            m = true;
                        }
                    }

                    if (!m) {
                        i = docItem.meta.path.indexOf('/docs/');

                        if (i > -1) {
                            srcPath = docItem.meta.path.substr(i + 1) + '/' + docItem.meta.filename;
                        }
                    }

                    if (docItem.tags) {
                        j         = 0;
                        tagLength = docItem.tags.length;

                        for (; j < tagLength; j++) {
                            if (docItem.tags[j].title === 'singleton') {
                                singleton = true;
                                break;
                            }
                        }
                    }
                }

                if (singleton === true) {
                    break;
                }
            }
        }

        // console.log(className);

        // adjusted paths when running the script inside the neo.mjs node module
        const index = srcPath && srcPath.indexOf('node_modules/neo.mjs/') || -1;
        if (index > -1) {
            srcPath = srcPath.substr(index + 21);
        }

        if (!insideNeo && srcPath && !srcPath.includes('apps/') && !srcPath.includes('docs/')) {
            srcPath = 'node_modules/neo.mjs/' + srcPath;
        }

        // console.log(srcPath);

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

        generateStructure(target + '.' + key, id, docs);
    });
}

console.log('Start default jsdocx parsing.');
const startDateDefault = new Date();

jsdocx.parse(options)
    .then(function (docs) {
        console.log('Default jsdocx parsing done.');
        const processTimeDefault = (Math.round((new Date - startDateDefault) * 100) / 100000).toFixed(2);
        console.log(`jsdocx default parsing time: ${processTimeDefault}s`);

        const startDate = new Date();

        let i         = 0,
            len       = docs.length,
            structure = {},
            defaultValue, filename, hasMatch, index, item, j, lAppName, namespace, path, pathLen, type;

        for (; i < len; i++) {
            item = docs[i];

            docs[i].id = i + 1;

            filename = item.meta.filename;
            filename = filename.substr(0, filename.lastIndexOf('.'));

            path = item.meta.path;
            path = path.replace(/\\/g, '/'); // sync windows paths to macOS

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
                        for (j=0; j < appNames.length; j++) {
                            lAppName = appNames[j].toLowerCase();
                            pathLen  = path.lastIndexOf('/' + lAppName);

                            if (pathLen !== -1) {
                                // top level files
                                if (pathLen === path.length - appNames[j].length - 1) {
                                    path = appNames[j] + path.substr(index + appNames[j].length + 6) + '.';
                                    break;
                                } else {
                                    pathLen = path.indexOf(lAppName + '/');

                                    if (pathLen > -1) {
                                        path = appNames[j] + path.substr(index + appNames[j].length + 6) + '.';
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

            path = path.replace(/\//g, '.');

            filename = path + filename;

            structure[filename] = true;

            hasMatch = false;

            for (j=0; j < appNames.length; j++) {
                if (path.indexOf(appNames[j] + '.') === 0) {
                    // console.log('NS', appNames[j] + 'Empty.' + filename);
                    ns(appNames[j] + 'Empty.' + filename, true);
                    item.neoClassName = filename;
                    // console.log(item.neoClassName);
                    // console.log(filename);
                    hasMatch = true;
                    break;
                }
            }

            if (!hasMatch) {
                if (path.indexOf('Docs') === 0) {
                    ns('DocsEmpty.' + filename, true);
                    item.neoClassName = 'Docs.app' + filename.substr(4);
                } else {
                    item.neoClassName = filename === 'Neo' ? filename : 'Neo.' + filename;
                    ns('NeoEmpty.' + filename, true);
                }
            }

            if (item.neoClassName === 'Neo') {
                namespace = ns('Neo.Neo', true);
            } else {
                namespace = ns(item.neoClassName, true);
            }

            namespace.classData = namespace.classData || [];
            namespace.classData.push(item);

            if (item.description) {
                item.description = marked.parse(item.description)
            }

            item.params?.forEach(param => {
                if (param.description) {
                    param.description = marked.parse(param.description)
                }
            });

            if (item.kind === 'member') {
                if (item.comment) {
                    item.meta.lineno += item.comment.split('\n').length;
                }

                if (item.defaultvalue && item.type && item.type.names) {
                    type = item.type.names[0].toLowerCase();

                    if (type.indexOf('array') > -1 || type.indexOf('object') > -1) {
                        defaultValue = item.comment.substr(item.comment.indexOf('=') + 1);
                        defaultValue = defaultValue.substr(0, defaultValue.indexOf('\n'));
                        defaultValue.trim();
                        item.defaultvalue = defaultValue;
                    }
                }
            }

            if (item.memberof === 'module:Neo.config') {
                item.name = 'config.' + item.name;
            }
        }

        helper.writeJSON({
            path  : './docs/output/all.json',
            indent: 0,
            force : true
        }, docs);

        let firstChar, fileNs;

        Object.keys(structure).forEach(key => {
            firstChar = key.charAt(0);
            path      = key.replace(/\./g, '/');

            // check for app related files
            if (firstChar === firstChar.toUpperCase() && key.includes('.')) {
                if (key.startsWith('Docs.')) {
                    key = 'Docs.app' + key.substr(4);
                }

                fileNs = ns(key);
                path   = 'apps/' + path + '.json';
            } else {
                fileNs = ns('Neo.' + key);
                path   = 'src/' + path + '.json';
            }

            helper.writeJSON({
                path  : './docs/output/' + path,
                indent: 0,
                force : true
            }, fileNs);
        });

        // console.log(Neo);

        generateStructure('NeoEmpty',  1, docs);
        generateStructure('DocsEmpty', 2, docs);

        appNames.forEach(key => {
            generateStructure(key + 'Empty', 2, docs);
        });

        const classHierarchy = {};

        docs.forEach(item => {
            if (item.$kind === 'class' && item.neoClassName && item.neoClassName !== 'Neo') {
                const parentClass = item.augments && item.augments.length > 0 ? item.augments[0] : null;
                classHierarchy[item.neoClassName] = parentClass;
            }
        });

        const sortedKeys = Object.keys(classHierarchy).sort();

        let yamlString = '# This file is automatically generated. Do not edit.\n\n';
        sortedKeys.forEach(key => {
            yamlString += `${key}: ${classHierarchy[key] || 'null'}\n`;
        });

                fs.writeFileSync('./docs/output/class-hierarchy.yaml', yamlString);

        console.log('Generated docs/output/class-hierarchy.yaml');

        neoStructure.sort(function (a, b) {
            if (a.name[0] === a.name[0].toLocaleLowerCase() && b.name[0] === b.name[0].toLocaleLowerCase() ||
                a.name[0] === a.name[0].toLocaleUpperCase() && b.name[0] === b.name[0].toLocaleUpperCase()) {
                return a.name.localeCompare(b.name);
            }
            if (a.name[0] === a.name[0].toLocaleLowerCase()) {
                return -1;
            }
            return 1;
        });

        // console.log(neoStructure);

        helper.writeJSON({
            path  : './docs/output/structure.json',
            indent: 0,
            force : true
        }, neoStructure);


        const processTime = (Math.round((new Date - startDate) * 100) / 100000).toFixed(2);
        console.log(`jsdocx custom parsing time: ${processTime}s`);
    })
    .catch(function (err) {
        console.log(err.stack);
    });
