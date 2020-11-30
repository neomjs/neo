'use strict';

const chalk       = require('chalk'),
      { program } = require('commander'),
      cp          = require('child_process'),
      cwd         = process.cwd(),
      cpOpts      = {env: process.env, cwd: cwd, stdio: 'inherit', shell: true},
      envinfo     = require('envinfo'),
      inquirer    = require('inquirer'),
      os          = require('os'),
      path        = require('path'),
      packageJson = require(path.resolve(cwd, 'package.json')),
      neoPath     = packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/',
      webpackPath = path.resolve(neoPath, 'buildScripts/webpack'),
      programName = `${packageJson.name} buildThemes`,
      questions   = [];

let webpack = './node_modules/.bin/webpack';

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

    if (os.platform().startsWith('win')) {
        webpack = path.resolve(webpack).replace(/\\/g,'/');
    }
    
    const buildEnv = p => {
        cp.spawnSync(webpack, ['--config', p, `--env insideNeo=${insideNeo}`, '--env json_file=neo.structure.json'], cpOpts);

        if (cssVars === 'all' || cssVars === 'yes') {
            if (themes === 'all' || themes === 'dark')  {cp.spawnSync(webpack, ['--config', p, `--env insideNeo=${insideNeo}`, '--env json_file=theme.dark.json'],            cpOpts);}
            if (themes === 'all' || themes === 'light') {cp.spawnSync(webpack, ['--config', p, `--env insideNeo=${insideNeo}`, '--env json_file=theme.light.json'],           cpOpts);}
        }

        if (cssVars === 'all' || cssVars === 'no') {
            if (themes === 'all' || themes === 'dark')  {cp.spawnSync(webpack, ['--config', p, `--env insideNeo=${insideNeo}`, '--env json_file=theme.dark.noCssVars.json'],  cpOpts);}
            if (themes === 'all' || themes === 'light') {cp.spawnSync(webpack, ['--config', p, `--env insideNeo=${insideNeo}`, '--env json_file=theme.light.noCssVars.json'], cpOpts);}
        }
    };

    // dist/development
    if (env === 'all' || env === 'dev') {
        console.log(chalk.blue(`${programName} starting dist/development`));
        buildEnv(`${webpackPath}/development/webpack.scss.config.js`);
    }

    // dist/production
    if (env === 'all' || env === 'prod') {
        console.log(chalk.blue(`${programName} starting dist/production`));
        buildEnv(`${webpackPath}/production/webpack.scss.config.js`);
    }

    const processTime = (Math.round((new Date - startDate) * 100) / 100000).toFixed(2);
    console.log(`\nTotal time for ${programName}: ${processTime}s`);

    process.exit();
});