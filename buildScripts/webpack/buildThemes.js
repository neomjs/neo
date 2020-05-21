'use strict';

const chalk        = require('chalk'),
      commander   = require('commander'),
      cp          = require('child_process'),
      cpOpts      = { env: process.env, cwd: process.cwd(), stdio: 'inherit' },
      envinfo     = require('envinfo'),
      packageJson = require('../../package.json'),
      path        = './buildScripts/webpack/',
      startDate   = new Date();

const program = new commander.Command(packageJson.name + ' buildThemes')
    .version(packageJson.version)
    .option('-i, --info',          'print environment debug info')
    .option('-c, --css4 <name>',   '"all", "true", "false"') // defaults to all
    .option('-e, --env <name>',    '"all", "dev", "prod"')   // defaults to all
    .option('-t, --themes <name>', '"all", "dark", "light"') // defaults to all
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

console.log(chalk.green(packageJson.name + ' buildThemes'));

const css4   = program.css4   || 'all',
      env    = program.env    || 'all',
      themes = program.themes || 'all';

// dist/development
if (env === 'all' || env === 'dev') {
    cp.spawnSync('webpack', ['--config', path + 'development/webpack.scss.config.js', '--env.json_file=neo.structure.json'], cpOpts);

    if (css4 === 'all' || css4 === 'true') {
        if (themes === 'all' || themes === 'dark')  {cp.spawnSync('webpack', ['--config', path + 'development/webpack.scss.config.js', '--env.json_file=theme.dark.json'],         cpOpts);}
        if (themes === 'all' || themes === 'light') {cp.spawnSync('webpack', ['--config', path + 'development/webpack.scss.config.js', '--env.json_file=theme.light.json'],        cpOpts);}
    }

    if (css4 === 'all' || css4 === 'false') {
        if (themes === 'all' || themes === 'dark')  {cp.spawnSync('webpack', ['--config', path + 'development/webpack.scss.config.js', '--env.json_file=theme.dark.noCss4.json'],  cpOpts);}
        if (themes === 'all' || themes === 'light') {cp.spawnSync('webpack', ['--config', path + 'development/webpack.scss.config.js', '--env.json_file=theme.light.noCss4.json'], cpOpts);}
    }
}

// dist/production
if (env === 'all' || env === 'prod') {
    cp.spawnSync('webpack', ['--config', path + 'production/webpack.scss.config.js', '--env.json_file=neo.structure.json'], cpOpts);

    if (css4 === 'all' || css4 === 'true') {
        if (themes === 'all' || themes === 'dark')  {cp.spawnSync('webpack', ['--config', path + 'production/webpack.scss.config.js', '--env.json_file=theme.dark.json'],          cpOpts);}
        if (themes === 'all' || themes === 'light') {cp.spawnSync('webpack', ['--config', path + 'production/webpack.scss.config.js', '--env.json_file=theme.light.json'],         cpOpts);}
    }

    if (css4 === 'all' || css4 === 'false') {
        if (themes === 'all' || themes === 'dark')  {cp.spawnSync('webpack', ['--config', path + 'production/webpack.scss.config.js', '--env.json_file=theme.dark.noCss4.json'],   cpOpts);}
        if (themes === 'all' || themes === 'light') {cp.spawnSync('webpack', ['--config', path + 'production/webpack.scss.config.js', '--env.json_file=theme.light.noCss4.json'],  cpOpts);}
    }
}

const processTime = (Math.round((new Date - startDate) * 100) / 100000).toFixed(2);
console.log(`Total time: ${processTime}s`);

process.exit();