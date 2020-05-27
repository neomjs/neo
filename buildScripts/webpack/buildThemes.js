'use strict';

const chalk       = require('chalk'),
      { program } = require('commander'),
      cp          = require('child_process'),
      cpOpts      = {env: process.env, cwd: process.cwd(), stdio: 'inherit'},
      cwd         = process.cwd(),
      envinfo     = require('envinfo'),
      inquirer    = require('inquirer'),
      path        = require('path'),
      packageJson = require(path.resolve(cwd, 'package.json')),
      neoPath     = packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/',
      webpackPath = path.resolve(cwd, neoPath, 'buildScripts/webpack'),
      programName = `${packageJson.name} buildThemes`,
      questions   = [];

program
    .name(programName)
    .version(packageJson.version)
    .option('-i, --info',          'print environment debug info')
    .option('-c, --css4 <name>',   '"all", "true", "false"')
    .option('-e, --env <name>',    '"all", "dev", "prod"')
    .option('-n, --noquestions')
    .option('-t, --themes <name>', '"all", "dark", "light"')
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

    if (!program.css4) {
        questions.push({
            type   : 'list',
            name   : 'css4',
            message: 'Build using CSS variables?',
            choices: ['all', 'yes', 'no'],
            default: 'yes'
        });
    }
}

inquirer.prompt(questions).then(answers => {
    const css4      = answers.css4   || program.css4   || 'all',
          env       = answers.env    || program.env    || 'all',
          themes    = answers.themes || program.themes || 'all',
          startDate = new Date();

    const buildEnv = p => {
        cp.spawnSync('webpack', ['--config', p, '--env.json_file=neo.structure.json'], cpOpts);

        if (css4 === 'all' || css4 === 'yes') {
            if (themes === 'all' || themes === 'dark')  {cp.spawnSync('webpack', ['--config', p, '--env.json_file=theme.dark.json'],         cpOpts);}
            if (themes === 'all' || themes === 'light') {cp.spawnSync('webpack', ['--config', p, '--env.json_file=theme.light.json'],        cpOpts);}
        }

        if (css4 === 'all' || css4 === 'no') {
            if (themes === 'all' || themes === 'dark')  {cp.spawnSync('webpack', ['--config', p, '--env.json_file=theme.dark.noCss4.json'],  cpOpts);}
            if (themes === 'all' || themes === 'light') {cp.spawnSync('webpack', ['--config', p, '--env.json_file=theme.light.noCss4.json'], cpOpts);}
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