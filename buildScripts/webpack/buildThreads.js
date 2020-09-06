'use strict';

const chalk       = require('chalk'),
      { program } = require('commander'),
      cp          = require('child_process'),
      cwd         = process.cwd(),
      cpOpts      = {env: process.env, cwd: cwd, stdio: 'inherit', shell: true},
      envinfo     = require('envinfo'),
      inquirer    = require('inquirer'),
      path        = require('path'),
      packageJson = require(path.resolve(cwd, 'package.json')),
      neoPath     = packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/',
      webpack     = './node_modules/.bin/webpack',
      webpackPath = path.resolve(neoPath, 'buildScripts/webpack'),
      programName = `${packageJson.name} buildThreads`,
      questions   = [];

program
    .name(programName)
    .version(packageJson.version)
    .option('-i, --info',           'print environment debug info')
    .option('-e, --env <name>',     '"all", "dev", "prod"')
    .option('-n, --noquestions')
    .option('-t, --threads <name>', '"all", "app", "data", "main", "vdom"')
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
            System     : ['OS', 'CPU'],
            Binaries   : ['Node', 'npm', 'Yarn'],
            Browsers   : ['Chrome', 'Edge', 'Firefox', 'Safari'],
            npmPackages: ['neo.mjs']
        }, {
            duplicates  : true,
            showNotFound: true
        })
        .then(console.log);
}

console.log(chalk.green(programName));

if (!program.noquestions) {
    if (!program.threads) {
        questions.push({
            type   : 'list',
            name   : 'threads',
            message: 'Please choose the threads to build:',
            choices: ['all', 'app', 'data', 'main', 'vdom'],
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
}

inquirer.prompt(questions).then(answers => {
    const env       = answers.env     || program.env     || 'all',
          threads   = answers.threads || program.threads || 'all',
          startDate = new Date();

    // dist/development
    if (env === 'all' || env === 'dev') {
        console.log(chalk.blue(`${programName} starting dist/development`));
        if (threads === 'all' || threads === 'main') {cp.spawnSync(webpack, ['--config', `${webpackPath}/development/webpack.config.main.js`],                        cpOpts);}
        if (threads === 'all' || threads === 'app')  {cp.spawnSync(webpack, ['--config', `${webpackPath}/development/webpack.config.worker.js`, '--env.worker=app'],  cpOpts);}
        if (threads === 'all' || threads === 'data') {cp.spawnSync(webpack, ['--config', `${webpackPath}/development/webpack.config.worker.js`, '--env.worker=data'], cpOpts);}
        if (threads === 'all' || threads === 'vdom') {cp.spawnSync(webpack, ['--config', `${webpackPath}/development/webpack.config.worker.js`, '--env.worker=vdom'], cpOpts);}
    }

    // dist/production
    if (env === 'all' || env === 'prod') {
        console.log(chalk.blue(`${programName} starting dist/production`));
        if (threads === 'all' || threads === 'main') {cp.spawnSync(webpack, ['--config', `${webpackPath}/production/webpack.config.main.js`],                            cpOpts);}
        if (threads === 'all' || threads === 'app')  {cp.spawnSync(webpack, ['--config', `${webpackPath}/production/webpack.config.appworker.js`, '--env.worker=app'],   cpOpts);}
        if (threads === 'all' || threads === 'data') {cp.spawnSync(webpack, ['--config', `${webpackPath}/production/webpack.config.worker.js`,    '--env.worker=data'],  cpOpts);}
        if (threads === 'all' || threads === 'vdom') {cp.spawnSync(webpack, ['--config', `${webpackPath}/production/webpack.config.worker.js`,    '--env.worker=vdom'],  cpOpts);}
    }

    const processTime = (Math.round((new Date - startDate) * 100) / 100000).toFixed(2);
    console.log(`\nTotal time for ${programName}: ${processTime}s`);

    process.exit();
});