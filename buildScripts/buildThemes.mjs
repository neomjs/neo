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

const
    __dirname    = path.resolve(),
    cwd          = process.cwd(),
    requireJson  = path => JSON.parse(fs.readFileSync((path))),
    packageJson  = requireJson(path.resolve(cwd, 'package.json')),
    insideNeo    = packageJson.name === 'neo.mjs',
    neoPath      = path.resolve(insideNeo ? './' : './node_modules/neo.mjs/'),
    programName  = `${packageJson.name} buildThemes`,
    program      = new Command(),
    scssPath     = 'resources/scss/',
    scssFolders  = fs.readdirSync(path.resolve(scssPath)),
    themeMapFile = 'resources/theme-map.json',
    themeFolders = [],
    questions    = [];

scssFolders.forEach(folder => {
    if (folder.includes('theme')) {
        themeFolders.push(folder);
    }
});

program
    .name(programName)
    .version(packageJson.version)
    .option('-i, --info',            'print environment debug info')
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
    }

    inquirer.prompt(questions).then(answers => {
        const env        = answers.env       || programOpts.env     || 'all',
              themes     = answers.themes    || programOpts.themes  || 'all',
              insideNeo  = programOpts.framework || false,
              startDate  = new Date(),
              fileCount  = {development: {vars: 0, noVars: 0}, production: {vars: 0, noVars: 0}},
              totalFiles = {development: {vars: 0, noVars: 0}, production: {vars: 0, noVars: 0}},
              sassThemes = [];

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
         * @param {String} p
         * @param {String} mode development or production
         */
        function buildEnv(p, mode) {
            parseScssFiles(getAllScssFiles(path.join(p, 'src')), mode, 'src');

            themeFolders.forEach(themeFolder => {
                if (themes === 'all' || themes === themeFolder) {
                    parseScssFiles(getAllScssFiles(path.join(p, themeFolder)), mode, themeFolder);
                }
            });
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
         */
        function parseScssFiles(files, mode, target) {
            let devMode = mode === 'development',
                map;

            totalFiles[mode]['vars'] += files.length;

            files.forEach(file => {
                addItemToThemeMap(file, target);

                let folderPath = path.resolve(cwd, `dist/${mode}/css/${target}/${file.relativePath}`),
                    destPath   = path.resolve(folderPath, `${file.name}.css`);

                let result = sass.compile(file.path, {
                    outFile                : destPath,
                    sourceMap              : devMode,
                    sourceMapIncludeSources: true
                });

                const plugins = [autoprefixer];

                if (mode === 'production') {
                    plugins.push(cssnano);
                }

                map = result.sourceMap;

                postcss(plugins).process(result.css, {
                    from: file.path,
                    to  : destPath,
                    map : !devMode ? null : {
                        inline: false,
                        prev  : map && JSON.stringify(map)
                    }
                }).then(result => {
                    fs.mkdirpSync(folderPath);
                    fileCount[mode]['vars']++;

                    const processTime = (Math.round((new Date - startDate) * 100) / 100000).toFixed(2);
                    console.log('Writing file:', (fileCount[mode].vars + fileCount[mode].noVars), chalk.blue(`${processTime}s`), destPath);
                    fs.writeFileSync(
                        destPath,
                        result.map ?
                            `${result.css}\n\n/*# sourceMappingURL=${path.relative(path.dirname(destPath), result.opts.to + '.map')} */` :
                            result.css,
                        () => true
                    );

                    if (result.map) {
                        fs.writeFileSync(result.opts.to + '.map', result.map.toString());
                    }

                    if (fileCount[mode]['vars'] === totalFiles[mode]['vars']) {
                        fs.writeFileSync(
                            path.resolve(cwd, themeMapFile),
                            JSON.stringify(themeMap, null, 0)
                        );

                        fs.mkdirpSync(path.join(cwd, '/dist/', mode, '/resources'), {
                            recursive: true
                        });

                        fs.writeFileSync(
                            path.join(cwd, '/dist/', mode, themeMapFile),
                            JSON.stringify(themeMap, null, 0)
                        );
                    }
                });
            });
        }

        themeMap = getThemeMap(themeMapFile);

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
