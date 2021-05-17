'use strict';

const autoprefixer       = require('autoprefixer'),
      chalk              = require('chalk'),
      {program}          = require('commander'),
      cssnano            = require('cssnano'),
      cwd                = process.cwd(),
      envinfo            = require('envinfo'),
      fs                 = require('fs-extra'),
      inquirer           = require('inquirer'),
      path               = require('path'),
      packageJson        = require(path.resolve(cwd, 'package.json')),
      neoPath            = packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/',
      programName        = `${packageJson.name} buildThemes`,
      postcss            = require('postcss'),
      sass               = require('sass'),
      regexComments      = /\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm,
      regexLineBreak     = /(\r\n|\n|\r)/gm,
      regexSassImport    = /@import[^'"]+?['"](.+?)['"];?/g,
      scssPath           = 'resources/scss/',
      themeMapFile       = 'resources/theme-map.json',
      themeMapFileNoVars = 'resources/theme-map-no-vars.json',
      questions          = [];

program
    .name(programName)
    .version(packageJson.version)
    .option('-i, --info',            'print environment debug info')
    .option('-c, --cssVars <value>', '"all", "true", "false"')
    .option('-e, --env <value>',     '"all", "dev", "prod"')
    .option('-f, --framework')
    .option('-n, --noquestions')
    .option('-t, --themes <value>',  '"all", "dark", "light"')
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
    return envinfo
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
}

console.log(chalk.green(programName));

if (!programOpts.noquestions) {
    if (!programOpts.themes) {
        questions.push({
            type   : 'list',
            name   : 'themes',
            message: 'Please choose the themes to build:',
            choices: ['all', 'dark', 'light'],
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
          fileCount  = {vars: 0, noVars: 0},
          totalFiles = {vars: 0, noVars: 0};

    let sassThemes = [],
        themeMap, themeMapNoVars;

    /**
     *
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
     *
     * @param {String} p
     * @param {String} mode development or production
     */
    function buildEnv(p, mode) {
        if (cssVars !== 'no') {
            parseScssFiles(getAllScssFiles(path.join(p, 'src')), mode, 'src', true);
        }

        if (cssVars !== 'no') {
            if (themes === 'all' || themes === 'dark')  {parseScssFiles(getAllScssFiles(path.join(p, 'theme-dark')),  mode, 'theme-dark',  true);}
            if (themes === 'all' || themes === 'light') {parseScssFiles(getAllScssFiles(path.join(p, 'theme-light')), mode, 'theme-light', true);}
        }

        if (cssVars !== 'yes') {
            if (themes === 'all' || themes === 'dark')  {parseScssFiles(getAllScssFiles(path.join(p, 'src')), mode, 'theme-dark',  false);}
            if (themes === 'all' || themes === 'light') {parseScssFiles(getAllScssFiles(path.join(p, 'src')), mode, 'theme-light', false);}
        }
    }

    /**
     *
     * @param {String} dirPath
     * @returns {Object[]}
     */
    function getAllScssFiles(dirPath) {
        const files = getScssFiles(path.resolve(neoPath, dirPath));

        if (!insideNeo) {
            files.push(...getScssFiles(path.resolve(cwd, dirPath)));
        }

        return files;
    }

    /**
     *
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

                if (!fileInfo.name.startsWith('_')) {
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
                        className   : className,
                        name        : fileInfo.name,
                        path        : filePath,
                        relativePath: relativePath
                    });
                }
            }
        });

        return arrayOfFiles;
    }

    /**
     *
     * @param {String} filePath
     * @returns {Object}
     */
    function getThemeMap(filePath) {
        let themeMapJson = path.resolve(cwd, filePath),
            themeMap;

        if (fs.existsSync(themeMapJson)) {
            themeMap = require(themeMapJson);
        } else {
            themeMapJson = path.resolve(neoPath, filePath);

            if (fs.existsSync(themeMapJson)) {
                themeMap = require(themeMapJson);
            } else {
                themeMap = {};
            }
        }

        return themeMap;
    }

    /**
     *
     * @param {Array|String} names The class name string containing dots or an Array of the string parts
     * @param {Boolean} [create] Set create to true to create empty objects for non existing parts
     * @param {Object} [scope] Set a different starting point as self
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
        }, scope);
    }

    /**
     *
     * @param {Object[]} files
     * @param {String} mode development or production
     * @param {String} target src or a theme
     * @param {Boolean} useCssVars
     */
    function parseScssFiles(files, mode, target, useCssVars) {
        let data      = '',
            devMode   = mode === 'development',
            mixinPath = path.resolve(neoPath, 'resources/scss/mixins/_all.scss'),
            suffix    = useCssVars ? ''     : '-no-vars',
            varsFlag  = useCssVars ? 'vars' : 'noVars',
            map, neoThemePath, themeBuffer, themePath, workspaceThemePath;

        totalFiles[varsFlag] += files.length;

        if (path.sep === '\\') {
            mixinPath = mixinPath.replace(/\\/g, '/');
        }

        if (target.includes('theme')) {
            themePath    = `resources/scss/${target}/_all.scss`;
            neoThemePath = path.resolve(neoPath, themePath);

            if (!sassThemes[target]) {
                themeBuffer = scssCombine(fs.readFileSync(neoThemePath).toString(), path.dirname(neoThemePath));

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
                    data          : data + content,
                    outFile       : destPath,
                    sourceMap     : devMode,
                    sourceMapEmbed: false
                });

                const plugins = [autoprefixer];

                if (mode === 'production') {
                    plugins.push(cssnano);
                }

                map = result.map && result.map.toString();

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
                    fileCount[varsFlag]++;

                    const processTime = (Math.round((new Date - startDate) * 100) / 100000).toFixed(2);
                    console.log('Writing file:', (fileCount.vars + fileCount.noVars), chalk.blue(`${processTime}s`), destPath);
                    fs.writeFile(destPath, result.css, () => true);

                    if (result.map) {
                        fs.writeFile(result.opts.to + '.map', result.map.toString());
                    }

                    if (fileCount[varsFlag] === totalFiles[varsFlag]) {
                        fs.writeFile(
                            path.resolve(cwd, useCssVars ? themeMapFile : themeMapFileNoVars),
                            JSON.stringify(useCssVars ? themeMap : themeMapNoVars, null, 0)
                        );
                    }
                });
            });
        });
    }

    /**
     *
     * @param {String} content
     * @param {String} baseDir
     * @returns {String}
     */
    function scssCombine (content, baseDir) {
        if (regexSassImport.test(content)) {
            content = content.replace(regexSassImport, (m, capture) => {
                let parse = path.parse(path.resolve(baseDir, capture)),
                    file  = path.resolve(`${parse.dir}/${parse.name}.scss`);

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
        buildEnv(path.join(scssPath), 'development');
    }

    // dist/production
    if (env === 'all' || env === 'prod') {
        console.log(chalk.blue(`${programName} starting dist/production`));
        buildEnv(path.join(scssPath), 'production');
    }
});
