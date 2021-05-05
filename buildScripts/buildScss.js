'use strict';

const autoprefixer    = require('autoprefixer'),
      chalk           = require('chalk'),
      { program }     = require('commander'),
      cssnano         = require('cssnano'),
      cwd             = process.cwd(),
      envinfo         = require('envinfo'),
      fs              = require('fs-extra'),
      inquirer        = require('inquirer'),
      path            = require('path'),
      packageJson     = require(path.resolve(cwd, 'package.json')),
      neoPath         = packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/',
      postcss         = require('postcss'),
      sass            = require('sass'),
      sassImportRegex = /@import[^'"]+?['"](.+?)['"];?/g,
      scssPath        = 'resources/scss_new/',
      programName     = `${packageJson.name} buildThemes`,
      questions       = [];

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

if (program.info) {
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

if (!program.noquestions) {
    if (!program.themes) {
        questions.push({
            type   : 'list',
            name   : 'themes',
            message: 'Please choose the themes to build:',
            choices: ['all', 'dark', 'light'],
            default: 'all'
        });
    }

    if (!program.env) {
        questions.push({
            type   : 'list',
            name   : 'env',
            message: 'Please choose the environment:',
            choices: ['all', 'dev', 'prod'],
            default: 'all'
        });
    }

    if (!program.cssVars) {
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
    const cssVars   = answers.cssVars || program.cssVars || 'all',
          env       = answers.env     || program.env     || 'all',
          themes    = answers.themes  || program.themes  || 'all',
          insideNeo = program.framework || false,
          startDate = new Date();


    let fileCount  = 0,
        sassThemes = [],
        totalFiles = 0;

    const buildEnv = (p, mode) => {
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
    };

    const getAllScssFiles = (dirPath, arrayOfFiles=[], relativePath='') => {
        let files = fs.readdirSync(dirPath),
            className, fileInfo;

        files.forEach(file => {
            if (fs.statSync(dirPath + '/' + file).isDirectory()) {
                arrayOfFiles = getAllScssFiles(dirPath + '/' + file, arrayOfFiles, relativePath + '/' + file);
            } else {
                fileInfo = path.parse(file);

                if (!fileInfo.name.startsWith('_')) {
                    className = relativePath === '' ? fileInfo.name : `${relativePath.substring(1)}/${fileInfo.name}`;
                    className = className.split('/').join('.');

                    if (className.startsWith('apps.')) {
                        className = className.substring(5);
                    } else {
                        className = 'Neo.' + className;
                    }

                    arrayOfFiles.push({
                        className   : className,
                        name        : fileInfo.name,
                        path        : path.join(dirPath, '/', file),
                        relativePath: relativePath
                    });
                }
            }
        });

        return arrayOfFiles;
    }

    const parseScssFiles = (files, mode, target, useCssVars) => {
        let data      = '',
            devMode   = mode === 'development',
            mixinPath = path.resolve(neoPath, 'resources/scss_new/mixins/_all.scss'),
            suffix    = useCssVars ? '' : '-no-vars',
            themePath;

        totalFiles += files.length;

        if (target.includes('theme')) {
            themePath = path.resolve(neoPath, `resources/scss_new/${target}/_all.scss`);

            if (!sassThemes[target]) {
                sassThemes[target] = scssCombine(fs.readFileSync(themePath).toString(), path.dirname(themePath));
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
            let folderPath = path.resolve(neoPath, `dist/${mode}/css${suffix}/${target}/${file.relativePath}`),
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

                postcss(plugins).process(result.css, {
                    from: file.path,
                    to  : destPath,
                    map : {
                        prev: result.map && result.map.toString()
                    }
                }).then(result => {
                    fs.mkdirpSync(folderPath);

                    const processTime = (Math.round((new Date - startDate) * 100) / 100000).toFixed(2);
                    console.log('Write file:', ++fileCount, chalk.blue(`${processTime}s`), destPath);
                    fs.writeFile(destPath, result.css, () => true);

                    if (result.map) {
                        fs.writeFile(result.opts.to + '.map', result.map.toString())
                    }

                    if (fileCount === totalFiles) {
                        console.log(totalFiles);
                    }
                });
            });
        });
    };

    const scssCombine = (content, baseDir) => {
        if (sassImportRegex.test(content)) {
            content = content.replace(sassImportRegex, (m, capture) => {
                let parse = path.parse(path.resolve(baseDir, capture)),
                    file  = `${parse.dir}/${parse.name}.scss`;

                if (!fs.existsSync(file)) {
                    file = `${parse.dir}/_${parse.name}.scss`;

                    if (!fs.existsSync(file)) {
                        return '';
                    }
                }

                return scssCombine(fs.readFileSync(file).toString(), path.dirname(file));
            });
        }

        return content;
    };

    // dist/development
    if (env === 'all' || env === 'dev') {
        console.log(chalk.blue(`${programName} starting dist/development`));
        buildEnv(path.resolve(neoPath, scssPath), 'development');
    }

    // dist/production
    if (env === 'all' || env === 'prod') {
        console.log(chalk.blue(`${programName} starting dist/production`));
        buildEnv(path.resolve(neoPath, scssPath), 'production');
    }
});