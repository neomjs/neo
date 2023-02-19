import chalk         from 'chalk';
import { spawnSync } from 'child_process';
import { Command }   from 'commander/esm.mjs';
import envinfo       from 'envinfo';
import fs            from 'fs-extra';
import inquirer      from 'inquirer';
import os            from 'os';
import path          from 'path';

const __dirname   = path.resolve(),
      cwd         = process.cwd(),
      cpOpts      = {env: process.env, cwd: cwd, stdio: 'inherit', shell: true},
      requireJson = path => JSON.parse(fs.readFileSync((path))),
      packageJson = requireJson(path.resolve(cwd, 'package.json')),
      program     = new Command(),
      configPath  = path.resolve(cwd, 'buildScripts/myApps.json'),
      neoPath     = packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/',
      webpackPath = path.resolve(neoPath, 'buildScripts/webpack'),
      programName = `${packageJson.name} buildMyApps`,
      questions   = [];

let webpack = './node_modules/.bin/webpack',
    config;

if (fs.existsSync(configPath)) {
    config = requireJson(configPath);
} else {
    const myAppsPath = path.resolve(neoPath, 'buildScripts/webpack/json/myApps.json');

    if (fs.existsSync(myAppsPath)) {
        config = requireJson(myAppsPath);
    } else {
        config = requireJson(path.resolve(neoPath, 'buildScripts/webpack/json/myApps.template.json'));
    }
}

let index = config.apps.indexOf('Docs');

index > -1 && config.apps.splice(index, 1);

program
    .name(programName)
    .version(packageJson.version)
    .option('-i, --info',         'print environment debug info')
    .option('-a, --apps <value>', ['all'].concat(config.apps).map(e => `"${e}"`).join(', '))
    .option('-e, --env <value>',  '"all", "dev", "prod"')
    .option('-f, --framework')
    .option('-n, --noquestions')
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
            System     : ['OS', 'CPU'],
            Binaries   : ['Node', 'npm', 'Yarn'],
            Browsers   : ['Chrome', 'Edge', 'Firefox', 'Safari'],
            npmPackages: ['neo.mjs']
        }, {
            duplicates  : true,
            showNotFound: true
        })
        .then(console.log);
} else {
    console.log(chalk.green(programName));

    if (!programOpts.noquestions) {
        if (!programOpts.env) {
            questions.push({
                type   : 'list',
                name   : 'env',
                message: 'Please choose the environment:',
                choices: ['all', 'dev', 'prod'],
                default: 'all'
            });
        }

        if (!programOpts.apps && config.apps.length > 1) {
            questions.push({
                type   : 'checkbox',
                name   : 'apps',
                message: 'Please choose which apps you want to build:',
                choices: config.apps
            });
        }
    }

    inquirer.prompt(questions).then(answers => {
        const apps      = (answers.apps.length > 0 ? answers.apps : null) || programOpts.apps || ['all'],
              env       = answers.env || programOpts.env || ['all'],
              insideNeo = !!programOpts.framework || false,
              startDate = new Date();
        let   childProcess;

        if (os.platform().startsWith('win')) {
            webpack = path.resolve(webpack).replace(/\\/g,'/');
        }

        // dist/development
        if (env === 'all' || env === 'dev') {
            console.log(chalk.blue(`${programName} starting dist/development`));
            childProcess = spawnSync(webpack, ['--config', `${webpackPath}/development/webpack.config.myapps.mjs`, `--env apps=${apps}`, `--env insideNeo=${insideNeo}`], cpOpts);
            childProcess.status && process.exit(childProcess.status);
        }

        // dist/production
        if (env === 'all' || env === 'prod') {
            console.log(chalk.blue(`${programName} starting dist/production`));
            childProcess = spawnSync(webpack, ['--config', `${webpackPath}/production/webpack.config.myapps.mjs`, `--env apps=${apps}`, `--env insideNeo=${insideNeo}`], cpOpts);
            childProcess.status && process.exit(childProcess.status);
        }

        const processTime = (Math.round((new Date - startDate) * 100) / 100000).toFixed(2);
        console.log(`\nTotal time for ${programName}: ${processTime}s`);

        process.exit();
    });
}
