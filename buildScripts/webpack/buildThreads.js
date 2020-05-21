'use strict';

const chalk        = require('chalk'),
      commander   = require('commander'),
      cp          = require('child_process'),
      cpOpts      = { env: process.env, cwd: process.cwd(), stdio: 'inherit' },
      envinfo     = require('envinfo'),
      packageJson = require('../../package.json'),
      path        = './buildScripts/webpack/',
      startDate   = new Date();

const program = new commander.Command(packageJson.name + ' buildThreads')
    .version(packageJson.version)
    .option('-i, --info',           'print environment debug info')
    .option('-e, --env <name>',     '"all", "dev", "prod"')          // defaults to all
    .option('-t, --threads <name>', '"all", "data", "main", "vdom"') // defaults to all
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

console.log(chalk.green(packageJson.name + ' buildThreads'));

const env     = program.env     || 'all',
      threads = program.threads || 'all';

// dist/development
if (env === 'all' || env === 'dev') {
    if (threads === 'all' || threads === 'main') {cp.spawnSync('webpack', ['--config', path + 'development/webpack.config.main.js'],                        cpOpts);}
    if (threads === 'all' || threads === 'data') {cp.spawnSync('webpack', ['--config', path + 'development/webpack.config.worker.js', '--env.worker=data'], cpOpts);}
    if (threads === 'all' || threads === 'vdom') {cp.spawnSync('webpack', ['--config', path + 'development/webpack.config.worker.js', '--env.worker=vdom'], cpOpts);}
}

// dist/production
if (env === 'all' || env === 'prod') {
    if (threads === 'all' || threads === 'main') {cp.spawnSync('webpack', ['--config', path + 'production/webpack.config.main.js'],                         cpOpts);}
    if (threads === 'all' || threads === 'data') {cp.spawnSync('webpack', ['--config', path + 'production/webpack.config.worker.js', '--env.worker=data'],  cpOpts);}
    if (threads === 'all' || threads === 'vdom') {cp.spawnSync('webpack', ['--config', path + 'production/webpack.config.worker.js', '--env.worker=vdom'],  cpOpts);}
}

const processTime = (Math.round((new Date - startDate) * 100) / 100000).toFixed(2);
console.log(`Total time: ${processTime}s`);

process.exit();