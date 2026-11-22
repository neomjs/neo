import chalk                     from 'chalk';
import {Command}                 from 'commander';
import envinfo                   from 'envinfo';
import fs                        from 'fs-extra';
import inquirer                  from 'inquirer';
import path                      from 'path';
import {createRequire}           from 'node:module';
import {assertInteractivePrompt} from '../util/assertInteractivePrompt.mjs';
import {runSteps}                from '../util/runSteps.mjs';
import {sanitizeInput}           from '../util/sanitizer.mjs';
import * as BuildId              from '../util/buildId.mjs';

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
    .option('--no-stamp',            'leave publishing the build id to the build that runs this one')
    .allowUnknownOption()
    .on('--help', () => {
        console.log('\nIn case you have any issues, please create a ticket here:');
        console.log(chalk.cyan(requireJson(path.resolve(neoPath, 'package.json')).bugs.url));
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

    assertInteractivePrompt({
        command: 'npm run build-threads -- -n -e dev -t all',
        questions
    });

    (questions.length ? inquirer.prompt(questions) : Promise.resolve({})).then(async answers => {
        const env        = answers.env     || programOpts.env     || 'all',
              threads    = answers.threads || programOpts.threads || 'all',
              insideNeo  = programOpts.framework || false,
              startDate  = new Date(),
              builtDists = [],
              steps      = [];

        /**
         * @summary The webpack run of each selected thread in one environment, as `runSteps` steps. Each thread
         * writes only its own bundle, chunk folder and copies, so the runs share no output.
         * @param {String} folder `development` or `production`
         * @returns {Array[]}
         */
        function threadSteps(folder) {
            return ['main', 'app', 'canvas', 'data', 'service', 'task', 'vdom']
                .filter(worker => threads === 'all' || threads === worker)
                .map(worker => {
                    const suffix = worker === 'main' ? 'main' : worker === 'app' ? 'appworker' : 'worker',
                          args   = [webpack, '--config', `${webpackPath}/${folder}/webpack.config.${suffix}.mjs`];

                    if (worker !== 'main') {
                        args.push('--env', `insideNeo=${insideNeo}`);
                        worker !== 'app' && args.push(`worker=${worker}`)
                    }

                    return [`${folder} ${worker}`, process.execPath, args]
                })
        }

        if (env === 'all' || env === 'dev') {
            steps.push(...threadSteps('development'));
            builtDists.push('dist/development')
        }

        if (env === 'all' || env === 'prod') {
            steps.push(...threadSteps('production'));
            builtDists.push('dist/production')
        }

        console.log(chalk.blue(`${programName} starting ${builtDists.join(' and ')}`));

        const failed = (await runSteps(steps, cpOpts)).find(result => result.status);

        if (failed) {
            console.error(chalk.red(`${failed.label} failed`));
            process.exit(failed.status)
        }

        // A failed thread exits before this line, so the id is published only once every selected environment built,
        // including a build of a single thread. Under `build-all` (`--no-stamp`) the whole run publishes it at its end
        BuildId.stampDeferred() || builtDists.forEach(dist => BuildId.stampBuildId({buildId: BuildId.getBuildId(), distPath: path.resolve(cwd, dist)}));

        const processTime = (Math.round((new Date - startDate) * 100) / 100000).toFixed(2);
        console.log(`\nTotal time for ${programName}: ${processTime}s`);

        process.exit();
    });
}
