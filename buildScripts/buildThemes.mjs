import autoprefixer from 'autoprefixer';
import chalk        from 'chalk';
import cssnano      from 'cssnano';
import { Command }  from 'commander/esm.mjs';
import envinfo      from 'envinfo';
import fs           from 'fs-extra';
import inquirer     from 'inquirer';
import path         from 'path';
import postcss      from 'postcss';
import * as sass    from 'sass';

const __dirname          = path.resolve(),
      cwd                = process.cwd(),
      requireJson        = path => JSON.parse(fs.readFileSync((path))),
      packageJson        = requireJson(path.resolve(cwd, 'package.json')),
      insideNeo          = packageJson.name === 'neo.mjs',
      neoPath            = path.resolve(insideNeo ? './' : './node_modules/neo.mjs/'),
      programName        = `${packageJson.name} buildThemes`,
      program            = new Command(),
      regexComments      = /\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm,
      regexLineBreak     = /(\r\n|\n|\r)/gm,
      regexSassImport    = /@import[^'"]+?['"](.+?)['"];?/g,
      scssPath           = 'resources/scss/',
      scssFolders        = fs.readdirSync(path.resolve(scssPath)),
      themeMapFile       = 'resources/theme-map.json',
      themeMapFileNoVars = 'resources/theme-map-no-vars.json',
      themeFolders       = [],
      questions          = [];

scssFolders.forEach(folder => {
    if (folder.includes('theme')) {
        themeFolders.push(folder);
    }
});

program
    .name(programName)
    .version(packageJson.version)
    .option('-i, --info',            'print environment debug info')
    .option('-c, --cssVars <value>', '"all", "true", "false"')
    .option('-e, --env <value>',     '"all", "dev", "prod"')
    .option('-f, --framework')
    .option('-n, --noquestions')
    .option('-t, --themes <value>',  ["all", ...themeFolders].join(", "))
    .allowUnknownOption()
    .on('--help', () => {
        console.log('\nIn case you have any issues, please create a ticket here:');
        console.log(chalk.cyan(packageJson.bugs.url));
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
                type   : 'list',
                name   : 'themes',
                message: 'Please choose the themes to build:',
                choices: ['all', ...themeFolders],
                default: 'all'
            });
        }

        if (!programOpts.env) {
            questions.push({
                type   : 'list',
                name   : 'env',
                message: 'Please choose the environment:',
                choices: ['all', 'dev', 'prod'],
                default: 'all'
            });
        }

        if (!programOpts.cssVars) {
            questions.push({
                type   : 'list',
                name   : 'cssVars',
                message: 'Build using CSS variables?',
                choices: ['all', 'yes', 'no'],
                default: 'yes'
            });
        }
    }

    inquirer.prompt(questions).then(answers => {
        const cssVars    = answers.cssVars   || programOpts.cssVars || 'all',
              env        = answers.env       || programOpts.env     || 'all',
              themes     = answers.themes    || programOpts.themes  || 'all',
              insideNeo  = programOpts.framework || false,
              startDate  = new Date(),
              fileCount  = {development: {vars: 0, noVars: 0}, production: {vars: 0, noVars: 0}},
              totalFiles = {development: {vars: 0, noVars: 0}, production: {vars: 0, noVars: 0}},
              sassThemes = [];

        let themeMap, themeMapNoVars;

        /**
         * @param {Object} file
         * @param {String} target
         * @param {Boolean} useCssVars
         */
        function addItemToThemeMap(file, target, useCssVars) {
            let classPath = file.className.split('.'),
                fileName  = classPath.pop(),
                namespace;

            classPath = classPath.join('.');
            namespace = ns(classPath, true, useCssVars ? themeMap : themeMapNoVars);

            if (!namespace[fileName]) {
                namespace[fileName] = [target];
            } else {
                if (!namespace[fileName].includes(target)) {
                    namespace[fileName].push(target);
                }
            }
        }

        /**
         * @param {String} p
         * @param {String} mode development or production
         */
        function buildEnv(p, mode) {
            if (cssVars !== 'no') {
                parseScssFiles(getAllScssFiles(path.join(p, 'src')), mode, 'src', true);

                themeFolders.forEach(themeFolder => {
                    if (themes === 'all' || themes === themeFolder) {
                        parseScssFiles(getAllScssFiles(path.join(p, themeFolder)), mode, themeFolder, true);
                    }
                });
            }

            if (cssVars !== 'yes') {
                themeFolders.forEach(themeFolder => {
                    if (themes === 'all' || themes === themeFolder) {
                        parseScssFiles(getAllScssFiles(path.join(p, 'src')), mode, themeFolder, false);
                    }
                });
            }
        }

        /**
         * @param {String} dirPath
         * @returns {Object[]}
         */
        function getAllScssFiles(dirPath) {
            let files    = [],
                scssPath = path.resolve(neoPath, dirPath);

            if (fs.existsSync(scssPath)) {
                files.push(...getScssFiles(scssPath));
            }

            if (!insideNeo) {
                scssPath = path.resolve(cwd, dirPath);

                if (fs.existsSync(scssPath)) {
                    files.push(...getScssFiles(scssPath));
                }
            }

            return files;
        }

        /**
         * @param {String} dirPath
         * @param [arrayOfFiles=[]]
         * @param [relativePath='']
         * @returns {Object[]}
         */
        function getScssFiles(dirPath, arrayOfFiles=[], relativePath='') {
            let files = fs.readdirSync(dirPath),
                className, fileInfo, filePath;

            files.forEach(file => {
                filePath = path.join(dirPath + '/' + file);

                if (fs.statSync(filePath).isDirectory()) {
                    arrayOfFiles = getScssFiles(filePath, arrayOfFiles, relativePath + '/' + file);
                } else {
                    fileInfo = path.parse(file);

                    if (!fileInfo.name.startsWith('_') && fileInfo.ext === '.scss') {
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
         * @param {String} filePath
         * @returns {Object}
         */
        function getThemeMap(filePath) {
            let themeMapJson = path.resolve(cwd, filePath),
                themeMap;

            if (fs.existsSync(themeMapJson)) {
                themeMap = requireJson(themeMapJson);
            } else {
                themeMapJson = path.resolve(neoPath, filePath);

                if (fs.existsSync(themeMapJson)) {
                    themeMap = requireJson(themeMapJson);
                } else {
                    themeMap = {};
                }
            }

            return themeMap;
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
         * @param {Object[]} files
         * @param {String} mode development or production
         * @param {String} target src or a theme
         * @param {Boolean} useCssVars
         */
        function parseScssFiles(files, mode, target, useCssVars) {
            let data        = '',
                devMode     = mode === 'development',
                mixinPath   = path.resolve(neoPath, 'resources/scss/mixins/_all.scss'),
                suffix      = useCssVars ? ''     : '-no-vars',
                themeBuffer = '',
                varsFlag    = useCssVars ? 'vars' : 'noVars',
                dirName, map, neoThemePath, themePath, workspaceThemePath;

            totalFiles[mode][varsFlag] += files.length;

            if (path.sep === '\\') {
                mixinPath = mixinPath.replace(/\\/g, '/');
            }

            if (target.includes('theme')) {
                themePath    = `resources/scss/${target}/_all.scss`;
                neoThemePath = path.resolve(neoPath, themePath);

                if (!sassThemes[target]) {
                    dirName = path.dirname(neoThemePath);

                    if (fs.existsSync(dirName)) {
                        themeBuffer += scssCombine(fs.readFileSync(neoThemePath).toString(), dirName);
                    }

                    if (!insideNeo) {
                        workspaceThemePath = path.resolve(cwd, themePath);
                        themeBuffer += scssCombine(fs.readFileSync(workspaceThemePath).toString(), path.dirname(workspaceThemePath));
                    }

                    themeBuffer = themeBuffer.replace(regexComments,  '');
                    themeBuffer = themeBuffer.replace(regexLineBreak, '');

                    sassThemes[target] = themeBuffer;
                }

                data = [
                    `@use "sass:map";`,
                    `@use "sass:math";`,
                    `$neoMap: ();`,
                    `$useCssVars: ${useCssVars};`,
                    `@import "${mixinPath}";`,
                    `$useCssVars: false;`,
                    `${sassThemes[target]}`,
                    `$useCssVars: ${useCssVars};`
                ].join('');
            } else {
                data = [
                    `@use "sass:map";`,
                    `@use "sass:math";`,
                    `$neoMap: ();`,
                    `$useCssVars: ${useCssVars};`,
                    `@import "${mixinPath}";`
                ].join('');
            }

            files.forEach(file => {
                addItemToThemeMap(file, target, useCssVars);

                let folderPath = path.resolve(cwd, `dist/${mode}/css${suffix}/${target}/${file.relativePath}`),
                    destPath   = path.resolve(folderPath, `${file.name}.css`);

                fs.readFile(file.path).then(content => {
                    let result = sass.renderSync({
                        data          : data + scssCombine(content.toString(), path.join(neoPath, scssPath, target, file.relativePath)),
                        outFile       : destPath,
                        sourceMap     : devMode,
                        sourceMapEmbed: false
                    });

                    const plugins = [autoprefixer];

                    if (mode === 'production') {
                        plugins.push(cssnano);
                    }

                    map = result.map?.toString();

                    if (map) {
                        // https://github.com/neomjs/neo/issues/1970
                        map = JSON.parse(map);
                        let len = file.relativePath.split('/').length,
                            src = `${target}${file.relativePath}/${file.name}.scss`,
                            i   = 0;

                        for (; i < len; i++) {
                            src = '../' + src;
                        }

                        map.sources = [src];
                    }

                    postcss(plugins).process(result.css, {
                        from: file.path,
                        to  : destPath,
                        map : !devMode ? null : {
                            prev: map && JSON.stringify(map)
                        }
                    }).then(result => {
                        fs.mkdirpSync(folderPath);
                        fileCount[mode][varsFlag]++;

                        const processTime = (Math.round((new Date - startDate) * 100) / 100000).toFixed(2);
                        console.log('Writing file:', (fileCount[mode].vars + fileCount[mode].noVars), chalk.blue(`${processTime}s`), destPath);
                        fs.writeFileSync(destPath, result.css, () => true);

                        if (result.map) {
                            fs.writeFileSync(result.opts.to + '.map', result.map.toString());
                        }

                        if (fileCount[mode][varsFlag] === totalFiles[mode][varsFlag]) {
                            fs.writeFileSync(
                                path.resolve(cwd, useCssVars ? themeMapFile : themeMapFileNoVars),
                                JSON.stringify(useCssVars ? themeMap : themeMapNoVars, null, 0)
                            );

                            fs.mkdirpSync(path.join(cwd, '/dist/', mode, '/resources'), {
                                recursive: true
                            });

                            fs.writeFileSync(
                                path.join(cwd, '/dist/', mode, useCssVars ? themeMapFile : themeMapFileNoVars),
                                JSON.stringify(useCssVars ? themeMap : themeMapNoVars, null, 0)
                            );
                        }
                    });
                });
            });
        }

        /**
         * @param {String} content
         * @param {String} baseDir
         * @returns {String}
         */
        function scssCombine (content, baseDir) {
            if (regexSassImport.test(content)) {
                content = content.replace(regexSassImport, (m, capture) => {
                    if (!insideNeo && capture.startsWith('../')) {
                        capture = '../../' + capture;
                    }

                    let parse = path.parse(path.join(baseDir, capture)),
                        file  = path.join(`${parse.dir}/${parse.name}.scss`);

                    if (!fs.existsSync(file)) {
                        file = path.resolve(`${parse.dir}/_${parse.name}.scss`);

                        if (!fs.existsSync(file)) {
                            return '';
                        }
                    }

                    return scssCombine(fs.readFileSync(file).toString(), path.dirname(file));
                });
            }

            return content;
        }

        if (cssVars !== 'no')  {themeMap       = getThemeMap(themeMapFile);}
        if (cssVars !== 'yes') {themeMapNoVars = getThemeMap(themeMapFileNoVars);}

        // dist/development
        if (env === 'all' || env === 'dev') {
            console.log(chalk.blue(`${programName} starting dist/development`));
            buildEnv(scssPath, 'development');
        }

        // dist/production
        if (env === 'all' || env === 'prod') {
            console.log(chalk.blue(`${programName} starting dist/production`));
            buildEnv(scssPath, 'production');
        }
    });
}
