import chalk           from 'chalk';
import {spawnSync}     from 'child_process';
import {Command}       from 'commander';
import envinfo         from 'envinfo';
import fs              from 'fs-extra';
import inquirer        from 'inquirer';
import path            from 'path';
import {createRequire} from 'node:module';
import {sanitizeInput} from '../util/sanitizer.mjs';

const __dirname   = path.resolve(),
      cwd         = process.cwd(),
      cpOpts      = {env: process.env, cwd: cwd, stdio: 'inherit'},
      requireJson = path => JSON.parse(fs.readFileSync((path))),
      packageJson = requireJson(path.resolve(cwd, 'package.json')),
      neoPath     = packageJson.name.includes('neo.mjs') ? './' : './node_modules/neo.mjs/',
      program     = new Command(),
      webpackPath = path.resolve(neoPath, 'buildScripts/webpack'),
      webpackJson = createRequire(path.join(cwd, 'package.json')).resolve('webpack/package.json'),
      webpack     = path.resolve(path.dirname(webpackJson), requireJson(webpackJson).bin.webpack),
      programName = `${packageJson.name} buildThreads`,
      questions   = [];

program
    .name(programName)
    .version(packageJson.version)
    .option('-i, --info',            'print environment debug info')
    .option('-e, --env <value>',     '"all", "dev", "prod"',                                              sanitizeInput)
    .option('-f, --framework')
    .option('-n, --noquestions')
    .option('-t, --threads <value>', '"all", "app", "canvas", "data", "main", "service", "task", "vdom"', sanitizeInput)
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
                type   : 'select',
                name   : 'threads',
                message: 'Please choose the threads to build:',
                choices: ['all', 'app', 'canvas', 'data', 'main', 'service', 'task', 'vdom'],
                default: 'all'
            });
        }

        if (!programOpts.env) {
            questions.push({
                type   : 'select',
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

        /**
         * @summary Builds selected threads with the resolved webpack entry and literal arguments.
         * @param {String} tPath Configuration filename prefix for one environment.
         */
        function parseThreads(tPath) {
            for (const worker of ['main', 'app', 'canvas', 'data', 'service', 'task', 'vdom']) {
                if (threads !== 'all' && threads !== worker) continue;

                const suffix = worker === 'main' ? 'main' : worker === 'app' ? 'appworker' : 'worker',
                      args   = [webpack, '--config', `${tPath}.${suffix}.mjs`];

                if (worker !== 'main') {
                    args.push('--env', `insideNeo=${insideNeo}`);
                    worker !== 'app' && args.push(`worker=${worker}`)
                }

                const childProcess = spawnSync(process.execPath, args, cpOpts);

                if (childProcess.error) throw childProcess.error;
                if (childProcess.status !== 0) process.exit(childProcess.status ?? 1)
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

        process.exit();
    });
}
