#!/usr/bin/env node

import fs                from 'node:fs';
import path              from 'node:path';
import {createInterface} from 'node:readline/promises';
import scss              from 'postcss-scss';
import selectorParser    from 'postcss-selector-parser';
import {fileURLToPath}   from 'node:url';
import {parseArgs}       from 'node:util';
import valueParser       from 'postcss-value-parser';

const themePattern = /^theme-[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * @summary Discovers SCSS roots in the same override order as the theme builder.
 * @param {String} cwd Workspace or Engine repository root.
 * @returns {String[]}
 */
function scssRoots(cwd) {
    const packageJson = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')),
          framework   = packageJson.name === 'neo.mjs' ? cwd : path.join(cwd, 'node_modules/neo.mjs'),
          roots       = [path.join(framework, 'resources/scss')];

    if (framework !== cwd) {
        const dependencies = new Set([
            ...Object.keys(packageJson.dependencies || {}),
            ...Object.keys(packageJson.devDependencies || {})
        ]);

        for (const dependency of dependencies) {
            const dependencyRoot = path.join(cwd, 'node_modules', dependency),
                  packagePath    = path.join(dependencyRoot, 'package.json');

            if (fs.existsSync(packagePath)) {
                const scss = JSON.parse(fs.readFileSync(packagePath, 'utf8')).neo?.scss;
                if (scss) roots.push(path.resolve(dependencyRoot, scss));
            }
        }

        roots.push(path.join(cwd, 'resources/scss'));
    }

    return [...new Set(roots)];
}

/**
 * @summary Lists selectable base themes across Engine, component packages and workspace.
 * @param {String} cwd Workspace or Engine repository root.
 * @returns {String[]}
 */
export function listThemes(cwd) {
    return [...new Set(scssRoots(cwd).flatMap(root => fs.existsSync(root)
        ? fs.readdirSync(root, {withFileTypes: true})
            .filter(entry => entry.isDirectory() && themePattern.test(entry.name))
            .map(entry => entry.name)
        : []))].sort();
}

/**
 * @summary Retargets a theme's selectors and preserves Sass module resolution after relocation.
 * Internal modules follow the snapshot; shared modules remain owned by their original root.
 * @param {String} content SCSS source.
 * @param {String} source Original file.
 * @param {String} target Generated file.
 * @param {String} baseRoot Original theme directory.
 * @param {String} destination Generated theme directory.
 * @returns {String}
 */
function retargetScss(content, source, target, baseRoot, destination) {
    const baseClass = `neo-${path.basename(baseRoot)}`,
          newClass  = `neo-${path.basename(destination)}`,
          root      = scss.parse(content, {from: source});

    root.walkRules(rule => {
        if (rule.selector.includes(baseClass)) {
            rule.selector = selectorParser(selectors => selectors.walkClasses(node => {
                if (node.value === baseClass) node.value = newClass;
            })).processSync(rule.selector);
        }
    });

    root.walkAtRules(rule => {
        if (!['use', 'forward', 'import'].includes(rule.name)) return;

        const params = valueParser(rule.params);

        for (const node of params.nodes) {
            if (node.type !== 'string') continue;

            const url = node.value;

            if (!/^(?:[a-z][\w+.-]*:|\/\/|\/)/i.test(url) &&
                !(rule.name === 'import' && /\.css(?:[?#]|$)/i.test(url))) {
                let   resolved = path.resolve(path.dirname(source), url);
                const relative = path.relative(baseRoot, resolved);

                if (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
                    resolved = path.join(destination, relative);
                }

                if (path.resolve(path.dirname(target), url) !== resolved) {
                    node.value = path.relative(path.dirname(target), resolved).split(path.sep).join('/');
                    if (!node.value.startsWith('.')) node.value = `./${node.value}`;
                }
            }

            if (rule.name !== 'import') break;
        }

        rule.params = params.toString();
    });

    return root.toString(scss.stringify);
}

/**
 * @summary Creates an editable theme snapshot without changing existing themes or application config.
 * @param {Object} options
 * @param {String} options.cwd Workspace or Engine repository root.
 * @param {String} options.baseTheme Existing theme folder, e.g. theme-neo-dark.
 * @param {String} options.themeName New theme folder, e.g. theme-acme.
 * @returns {String} Absolute generated theme directory.
 */
export function generateTheme({cwd, baseTheme, themeName}) {
    cwd = fs.realpathSync(cwd);

    for (const name of [baseTheme, themeName]) {
        if (typeof name !== 'string' || !themePattern.test(name)) {
            throw new Error('Theme names must use theme- followed by lowercase letters, numbers and single hyphens.');
        }
    }

    const roots       = scssRoots(cwd),
          destination = path.join(cwd, 'resources/scss', themeName),
          files       = new Map();

    for (const root of roots) {
        if (fs.existsSync(path.join(root, themeName))) {
            throw new Error(`Theme already exists: ${themeName}`);
        }
    }

    for (const directory of ['resources', 'resources/scss', `resources/scss/${themeName}`]) {
        const target = path.join(cwd, directory);
        if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) {
            throw new Error(`Refusing symbolic link destination: ${target}`);
        }
    }

    /**
     * @summary Reads and validates the complete source tree before creating a destination.
     * @param {String} directory Source directory.
     * @param {String} baseRoot Source theme root.
     * @returns {void}
     */
    function visit(directory, baseRoot) {
        if (fs.lstatSync(directory).isSymbolicLink()) throw new Error(`Refusing symbolic link source: ${directory}`);

        for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
            const source   = path.join(directory, entry.name),
                  relative = path.relative(baseRoot, source),
                  target   = path.join(destination, relative);

            if (entry.isDirectory()) {
                visit(source, baseRoot);
            } else if (entry.isFile()) {
                const content = fs.readFileSync(source);
                files.set(relative, source.endsWith('.scss')
                    ? retargetScss(content.toString('utf8'), source, target, baseRoot, destination)
                    : content);
            } else {
                throw new Error(`Unsupported theme source: ${source}`);
            }
        }
    }

    for (const root of roots) {
        const baseRoot = path.join(root, baseTheme);
        if (fs.existsSync(baseRoot)) visit(baseRoot, baseRoot);
    }

    if (!files.has('Global.scss')) throw new Error(`Base theme must contain Global.scss: ${baseTheme}`);

    fs.mkdirSync(path.dirname(destination), {recursive: true});
    fs.mkdirSync(destination);

    try {
        for (const [relative, content] of files) {
            const target = path.join(destination, relative);
            fs.mkdirSync(path.dirname(target), {recursive: true});
            fs.writeFileSync(target, content, {flag: 'wx'});
        }
    } catch (error) {
        fs.rmSync(destination, {recursive: true, force: true});
        throw error;
    }

    return destination;
}

/**
 * @summary Runs the interactive or flag-driven theme generator.
 * @returns {Promise<void>}
 */
async function main() {
    const {values: options} = parseArgs({options: {
        base       : {type: 'string', short: 'b'},
        help       : {type: 'boolean', short: 'h'},
        name       : {type: 'string', short: 'n'},
        noquestions: {type: 'boolean'}
    }}), cwd = process.cwd();

    if (options.help) {
        console.log('Create an editable workspace theme from an existing theme.\n\n' +
            'Usage: create-theme [options]\n' +
            '  -b, --base <theme>  Base folder, e.g. theme-neo-dark\n' +
            '  -n, --name <theme>  New folder, e.g. theme-acme\n' +
            '  --noquestions       Require explicit --name and --base; do not prompt\n' +
            '  -h, --help          Display help');
        return;
    }

    if (!options.noquestions && (!options.name || !options.base)) {
        if (!process.stdin.isTTY) throw new Error('Pass --name and --base with --noquestions for unattended use.');

        const input = createInterface({input: process.stdin, output: process.stdout});

        try {
            if (!options.name) options.name = (await input.question('New theme folder (theme-acme): ')).trim();
            if (!options.base) {
                console.log(`Available base themes: ${listThemes(cwd).join(', ')}`);
                options.base = (await input.question('Base theme: ')).trim();
            }
        } finally {
            input.close();
        }
    }

    const destination = generateTheme({cwd, baseTheme: options.base, themeName: options.name});
    console.log(`Created ${destination}`);
    console.log(`Add "neo-${options.name}" to your application's neo-config.json themes array to select it.`);
    console.log(`Build with: node ${path.relative(cwd, fileURLToPath(new URL('../build/themes.mjs', import.meta.url)))} -n -e dev -t ${options.name}`);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
