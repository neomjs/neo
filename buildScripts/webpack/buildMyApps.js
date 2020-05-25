'use strict';

const chalk            = require('chalk'),
      { program }      = require('commander'),
      cp               = require('child_process'),
      cpOpts           = {env: process.env, cwd: process.cwd(), stdio: 'inherit'},
      envinfo          = require('envinfo'),
      fs               = require('fs'),
      inquirer         = require('inquirer'),
      packageJson      = require('../../package.json'),
      path             = require('path'),
      processRoot      = process.cwd(),
      configPath       = path.resolve(processRoot, 'buildScripts/myApps.json'),
      neoPath          = packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/',
      buildScriptsPath = path.resolve(neoPath, 'buildScripts'),
      programName      = `${packageJson.name} buildMyApps`,
      appChoices       = [],
      questions        = [];

let config;

if (fs.existsSync(configPath)) {
    config = require(configPath);
} else {
    const myAppsPath = path.resolve(neoPath, 'buildScripts/webpack/json/myApps.json');

    if (fs.existsSync(myAppsPath)) {
        config = require(myAppsPath);
    } else {
        config = require(path.resolve(neoPath, 'buildScripts/webpack/json/myApps.template.json'));
    }
}

if (config.apps) {
    Object.keys(config.apps).forEach(key => {
        appChoices.push(key);
    });
}

program
    .name(programName)
    .version(packageJson.version)
    .option('-i, --info',        'print environment debug info')
    .option('-a, --apps <name>', ['all'].concat(appChoices).map(e => `"${e}"`).join(', '))
    .option('-e, --env <name>',  '"all", "dev", "prod"')
    .option('-n, --noquestions')
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
    if (!program.env) {
        questions.push({
            type   : 'list',
            name   : 'env',
            message: 'Please choose the environment:',
            choices: ['all', 'dev', 'prod'],
            default: 'all'
        });
    }

    if (!program.apps && appChoices.length > 1) {
        questions.push({
            type   : 'checkbox',
            name   : 'apps',
            message: 'Please choose which apps you want to build:',
            choices: appChoices
        });
    }
}

inquirer.prompt(questions).then(answers => {
    const apps      = answers.apps || program.apps || ['all'],
          env       = answers.env  || program.env  || ['all'],
          startDate = new Date();

    // dist/development
    if (env === 'all' || env === 'dev') {
        console.log(chalk.blue(`${programName} starting dist/development`));
        cp.spawnSync('webpack', ['--config', `${buildScriptsPath}/webpack/development/webpack.config.myapps.js`, `--env.apps=${apps}`], cpOpts);
    }

    // dist/production
    if (env === 'all' || env === 'prod') {
        console.log(chalk.blue(`${programName} starting dist/production`));
        cp.spawnSync('webpack', ['--config', `${buildScriptsPath}/webpack/production/webpack.config.myapps.js`, `--env.apps=${apps}`], cpOpts);
    }

    const processTime = (Math.round((new Date - startDate) * 100) / 100000).toFixed(2);
    console.log(`\nTotal time for ${programName}: ${processTime}s`);

    process.exit();
});