import autoprefixer              from 'autoprefixer';
import chalk                     from 'chalk';
import cssnano                   from 'cssnano';
import {Command}                 from 'commander';
import envinfo                   from 'envinfo';
import fs                        from 'fs-extra';
import inquirer                  from 'inquirer';
import path                      from 'path';
import postcss                   from 'postcss';
import {assertInteractivePrompt} from '../util/assertInteractivePrompt.mjs';
import {sanitizeInput}           from '../util/sanitizer.mjs';
import {
    isCssTargetFolder,
    resolveThemeClassMap
}                                from '../util/themeCss.mjs';
import {themeCssRoots}           from '../util/themeCssRoots.mjs';

const
    __dirname        = path.resolve(),
    cwd              = process.cwd(),
    requireJson      = path => JSON.parse(fs.readFileSync(path)),
    packageJson      = requireJson(path.resolve(cwd, 'package.json')),
    insideNeo        = packageJson.name.includes('neo.mjs'),
    neoPath          = path.resolve(insideNeo ? './' : './node_modules/neo.mjs/'),
    programName      = `${packageJson.name} buildThemes`,
    program          = new Command(),
    cssPath          = 'resources/css/',
    frameworkCssPath = path.resolve(neoPath, cssPath),
    cssRoots         = themeCssRoots(cwd, {insideNeo}),
    themeMapFile     = 'resources/theme-map.json',
    themeFolders     = [...new Set(cssRoots.flatMap(root => {
        if (!fs.existsSync(root)) return [];

        return fs.readdirSync(root, {withFileTypes: true})
            .filter(entry => entry.isDirectory() && !entry.isSymbolicLink() && entry.name !== 'src' && isCssTargetFolder(cssRoots, entry.name))
            .map(entry => entry.name)
    }))],
    questions        = [];

program
    .name(programName)
    .version(packageJson.version)
    .option('-i, --info',           'print environment debug info')
    .option('-e, --env <value>',    '"all", "dev", "esm", "prod"',       sanitizeInput)
    .option('-f, --framework')
    .option('-n, --noquestions')
    .option('-t, --themes <value>', ["all", ...themeFolders].join(", "), sanitizeInput)
    .allowUnknownOption()
    .on('--help', () => {
        console.log('\nIn case you have any issues, please create a ticket here:');
        console.log(chalk.cyan(requireJson(path.resolve(neoPath, 'package.json')).bugs.url));
    })
    .parse(process.argv);

const programOpts = program.opts();

if (programOpts.info) {
    console.log(chalk.bold('\nEnvironment Info:'));
    console.log(`\n  current version of ${packageJson.name}: ${packageJson.version}`);
    console.log(`  running from ${__dirname}`);

    envinfo
        .run({
            System           : ['OS', 'CPU'],
            Binaries         : ['Node', 'npm', 'Yarn'],
            Browsers         : ['Chrome', 'Edge', 'Firefox', 'Safari'],
            npmPackages      : ['neo.mjs'],
            npmGlobalPackages: ['neo-app']
        }, {
            duplicates  : true,
            showNotFound: true
        })
        .then(console.log);
} else {
    console.log(chalk.green(programName));

    if (!programOpts.noquestions) {
        if (!programOpts.themes) {
            questions.push({
                type   : 'select',
                name   : 'themes',
                message: 'Please choose the themes to build:',
                choices: ['all', ...themeFolders],
                default: 'all'
            });
        }

        if (!programOpts.env) {
            questions.push({
                type   : 'select',
                name   : 'env',
                message: 'Please choose the environment:',
                choices: ['all', 'dev', 'esm', 'prod'],
                default: 'all'
            });
        }
    }

    assertInteractivePrompt({
        command: `npm run build-themes -- -n -e dev -t all`,
        questions
    });

    (questions.length ? inquirer.prompt(questions) : Promise.resolve({})).then(async answers => {
        const env         = answers.env      || programOpts.env    || 'all',
              themes      = answers.themes   || programOpts.themes || 'all',
              activeRoots = programOpts.framework ? [frameworkCssPath] : cssRoots,
              startDate   = new Date(),
              fileCount   = {development: 0, esm: 0, production: 0},
              totalFiles  = {development: 0, esm: 0, production: 0};

        let themeMap;

        /**
         * @param {Object} file
         * @param {String} target
         */
        function addItemToThemeMap(file, target) {
            let classPath = file.className.split('.'),
                fileName  = classPath.pop(),
                namespace;

            classPath = classPath.join('.');
            namespace = ns(classPath, true, themeMap);

            if (!namespace[fileName]) {
                namespace[fileName] = [target];
            } else {
                if (!namespace[fileName].includes(target)) {
                    namespace[fileName].push(target);
                }
            }
        }

        /**
         * @param {String} mode development or production
         */
        async function buildEnv(mode) {
            await buildFiles(getAllCssFiles('src'), mode, 'src');

            for (const themeFolder of themeFolders) {
                if (themes === 'all' || themes === themeFolder) {
                    await buildFiles(getAllCssFiles(themeFolder), mode, themeFolder);
                }
            }
        }

        /**
         * @param {String} target
         * @returns {Object[]}
         */
        function getAllCssFiles(target) {
            return activeRoots.flatMap(root => {
                const targetPath = path.resolve(root, target);
                return fs.existsSync(targetPath) ? getCssFiles(targetPath) : [];
            });
        }

        /**
         * @param {String} dirPath
         * @param [arrayOfFiles=[]]
         * @param [relativePath='']
         * @returns {Object[]}
         */
        function getCssFiles(dirPath, arrayOfFiles=[], relativePath='') {
            let files = fs.readdirSync(dirPath),
                className, fileInfo, filePath;

            files.forEach(file => {
                filePath = path.join(dirPath + '/' + file);

                if (fs.statSync(filePath).isDirectory()) {
                    arrayOfFiles = getCssFiles(filePath, arrayOfFiles, relativePath + '/' + file);
                } else {
                    fileInfo = path.parse(file);

                    if (fileInfo.ext === '.css') {
                        className = relativePath === '' ? fileInfo.name : `${relativePath.substring(1)}/${fileInfo.name}`;
                        className = className.split('/').join('.');

                        if (className.startsWith('apps.')) {
                            className = className.split('.');
                            className[0].toLowerCase();
                            className = className.join('.');
                        } else {
                            className = 'Neo.' + className;
                        }

                        arrayOfFiles.push({
                            className,
                            name: fileInfo.name,
                            path: filePath,
                            relativePath
                        });
                    }
                }
            });

            return arrayOfFiles;
        }

        /**
         * @param {Array|String} names The class name string containing dots or an Array of the string parts
         * @param {Boolean} [create] Set create to true to create empty objects for non existing parts
         * @param {Object} [scope] Set a different starting point as globalThis
         * @returns {Object} reference to the toplevel namespace
         */
        function ns(names, create, scope) {
            names = Array.isArray(names) ? names : names.split('.');

            return names.reduce((prev, current) => {
                if (create && !prev[current]) {
                    prev[current] = {};
                }
                if (prev) {
                    return prev[current];
                }
            }, scope || globalThis);
        }

        /**
         * @summary Copies each source sheet to `dist/<mode>/css/<target>`, through autoprefixer, plus cssnano
         * for esm and production; development output carries a source map back to the source.
         * @param {Object[]} files
         * @param {String} mode development or production
         * @param {String} target src or a theme
         */
        async function buildFiles(files, mode, target) {
            let devMode = mode === 'development';

            totalFiles[mode] += files.length;

            for (const file of files) {
                addItemToThemeMap(file, target);

                let folderPath = path.resolve(cwd, `dist/${mode}/css/${target}/${file.relativePath}`),
                    destPath   = path.resolve(folderPath, `${file.name}.css`);

                const plugins = [autoprefixer];

                if (mode === 'esm' || mode === 'production') {
                    plugins.push(cssnano) // CSSNano works async only
                }

                const postcssResult = await postcss(plugins).process(fs.readFileSync(file.path, 'utf8'), {
                    from: file.path,
                    to  : destPath,
                    map : devMode && {inline: false}
                });

                fs.mkdirpSync(folderPath);
                fileCount[mode]++;

                let currentFileNumber = fileCount.development + fileCount.esm + fileCount.production,
                    processTime       = (Math.round((new Date - startDate) * 100) / 100000).toFixed(2);

                console.log('Writing file:', currentFileNumber, chalk.blue(`${processTime}s`), destPath);

                fs.writeFileSync(destPath, postcssResult.css);

                if (postcssResult.map) {
                    fs.writeFileSync(`${destPath}.map`, postcssResult.map.toString())
                }

                if (fileCount[mode] === totalFiles[mode]) {
                    fs.writeFileSync(
                        path.resolve(cwd, themeMapFile),
                        JSON.stringify(themeMap, null, 0)
                    );

                    fs.mkdirpSync(path.join(cwd, '/dist/', mode, '/resources'), {recursive: true});

                    fs.writeFileSync(
                        path.join(cwd, '/dist/', mode, themeMapFile),
                        JSON.stringify(themeMap, null, 0)
                    );
                }
            }
        }

        // Full builds REGENERATE the map from the effective source tree: seeding from the previous
        // artifact made deletions/renames permanent (insertion is create-only, so no key ever left).
        // The only legitimate seed is the ENGINE's map in a workspace build (cwd !== neoPath), which
        // keeps engine components resolvable (guide §8); a workspace's own previous output fossilizes
        // identically and is not a seed either.
        const engineSeedMap = cwd !== neoPath && fs.existsSync(path.resolve(neoPath, themeMapFile))
            ? requireJson(path.resolve(neoPath, themeMapFile))
            : null;

        themeMap        = engineSeedMap ? structuredClone(engineSeedMap) : {};
        themeMap.themes = resolveThemeClassMap({
            cssRoots           : activeRoots,
            includeWorkspaceMap: false,
            seedThemes         : engineSeedMap?.themes
        });

        // dist/development
        if (env === 'all' || env === 'dev') {
            console.log(chalk.blue(`${programName} starting dist/development`));
            await buildEnv('development');
        }

        // dist/esm
        if (env === 'all' || env === 'esm') {
            console.log(chalk.blue(`${programName} starting dist/esm`));
            await buildEnv('esm');
        }

        // dist/production
        if (env === 'prod') {
            console.log(chalk.blue(`${programName} starting dist/production`));
            await buildEnv('production');
        } else if (env === 'all') {
            // dist/esm & dist/production contain the same output, so we can just copy it over.
            const cssPath = path.join(cwd, '/dist/production/css');

            fs.mkdirpSync(cssPath, {recursive: true});
            fs.mkdirpSync(path.join(cwd, '/dist/production/resources'), {recursive: true});

            fs.copySync(path.join(cwd, '/dist/esm/css'), cssPath);
            fs.copySync(path.join(cwd, '/dist/esm/resources/theme-map.json'), path.join(cwd, '/dist/production/resources/theme-map.json'));
        }
    });
}
