import chalk         from 'chalk';
import { spawnSync } from 'child_process';
import { Command }   from 'commander/esm.mjs';
import envinfo       from 'envinfo';
import fs            from 'fs-extra';
import inquirer      from 'inquirer';
import path          from 'path';

const __dirname   = path.resolve(),
      cwd         = process.cwd(),
      cpOpts      = {env: process.env, cwd: cwd, stdio: 'inherit', shell: true},
      requireJson = path => JSON.parse(fs.readFileSync((path))),
      packageJson = requireJson(path.resolve(cwd, 'package.json')),
      neoPath     = packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/',
      program     = new Command(),
      webpackPath = path.resolve(neoPath, 'buildScripts/webpack'),
      programName = `${packageJson.name} buildThreads`,
      questions   = [];

let webpack = './node_modules/.bin/webpack';

program
    .name(programName)
    .version(packageJson.version)
    .option('-i, --info',            'print environment debug info')
    .option('-e, --env <value>',     '"all", "dev", "prod"')
    .option('-f, --framework')
    .option('-n, --noquestions')
    .option('-t, --threads <value>', '"all", "app", "data", "main", "vdom"')
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
        if (!programOpts.threads) {
            questions.push({
                type   : 'list',
                name   : 'threads',
                message: 'Please choose the threads to build:',
                choices: ['all', 'app', 'canvas', 'data', 'main', 'service', 'vdom'],
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
        const env       = answers.env     || programOpts.env     || 'all',
              threads   = answers.threads || programOpts.threads || 'all',
              insideNeo = programOpts.framework || false,
              startDate = new Date();
        let   status = 0;

        if (path.sep === '\\') {
            webpack = path.resolve(webpack).replace(/\\/g,'/');
        }

        function parseThreads(tPath) {
            let childProcess;

            if (threads === 'all' || threads === 'main') {
                childProcess = spawnSync(webpack, ['--config', `${tPath}.main.mjs`], cpOpts);
                status = status | childProcess.status;
            }
            if (threads === 'all' || threads === 'app') {
                childProcess = spawnSync(webpack, ['--config', `${tPath}.appworker.mjs`, `--env insideNeo=${insideNeo}`], cpOpts);
                status = status | childProcess.status;
            }
            if (threads === 'all' || threads === 'canvas') {
                childProcess = spawnSync(webpack, ['--config', `${tPath}.worker.mjs`, `--env insideNeo=${insideNeo} worker=canvas`], cpOpts);
                status = status | childProcess.status;
            }
            if (threads === 'all' || threads === 'data') {
                childProcess = spawnSync(webpack, ['--config', `${tPath}.worker.mjs`, `--env insideNeo=${insideNeo} worker=data`], cpOpts);
                status = status | childProcess.status;
            }
            if (threads === 'all' || threads === 'service') {
                childProcess = spawnSync(webpack, ['--config', `${tPath}.worker.mjs`, `--env insideNeo=${insideNeo} worker=service`], cpOpts);
                status = status | childProcess.status;
            }
            if (threads === 'all' || threads === 'vdom') {
                childProcess = spawnSync(webpack, ['--config', `${tPath}.worker.mjs`, `--env insideNeo=${insideNeo} worker=vdom`], cpOpts);
                status = status | childProcess.status;
            }
        }

        // dist/development
        if (env === 'all' || env === 'dev') {
            console.log(chalk.blue(`${programName} starting dist/development`));
            parseThreads(`${webpackPath}/development/webpack.config`);
        }

        // dist/production
        if (env === 'all' || env === 'prod') {
            console.log(chalk.blue(`${programName} starting dist/production`));
            parseThreads(`${webpackPath}/production/webpack.config`);
        }

        const processTime = (Math.round((new Date - startDate) * 100) / 100000).toFixed(2);
        console.log(`\nTotal time for ${programName}: ${processTime}s`);

        process.exit(status);
    });
}
