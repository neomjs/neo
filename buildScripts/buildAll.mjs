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
      npmCmd      = os.platform().startsWith('win') ? 'npm.cmd' : 'npm', // npm binary based on OS
      requireJson = path => JSON.parse(fs.readFileSync((path))),
      packageJson = requireJson(path.join(__dirname, 'package.json')),
      program     = new Command(),
      neoPath     = path.resolve(packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/'),
      webpackPath = path.resolve(neoPath, 'buildScripts/webpack'),
      programName = `${packageJson.name} buildAll`,
      questions   = [];

program
    .name(programName)
    .version(packageJson.version)
    .option('-i, --info',               'print environment debug info')
    .option('-e, --env <value>',        '"all", "dev", "prod"')
    .option('-l, --npminstall <value>', '"yes", "no"')
    .option('-f, --framework')
    .option('-n, --noquestions')
    .option('-p, --parsedocs <value>',  '"yes", "no"')
    .option('-t, --themes <value>',     '"yes", "no"')
    .option('-w, --threads <value>',    '"yes", "no"')
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
        if (!programOpts.npminstall) {
            questions.push({
                type   : 'list',
                name   : 'npminstall',
                message: 'Run npm install?:',
                choices: ['yes', 'no'],
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

        if (!programOpts.npminstall) {
            questions.push({
                type   : 'list',
                name   : 'themes',
                message: 'Build the themes?',
                choices: ['yes', 'no'],
                default: 'yes'
            });
        }

        if (!programOpts.threads) {
            questions.push({
                type   : 'list',
                name   : 'threads',
                message: 'Build the threads?',
                choices: ['yes', 'no'],
                default: 'yes'
            });
        }

        if (!programOpts.parsedocs) {
            questions.push({
                type   : 'list',
                name   : 'parsedocs',
                message: 'Trigger the jsdocx parsing?',
                choices: ['yes', 'no'],
                default: 'yes'
            });
        }
    }

    inquirer.prompt(questions).then(answers => {
        const env        = answers.env        || programOpts.env        || 'all',
              npminstall = answers.npminstall || programOpts.npminstall || 'yes',
              parsedocs  = answers.parsedocs  || programOpts.parsedocs  || 'yes',
              themes     = answers.themes     || programOpts.themes     || 'yes',
              threads    = answers.threads    || programOpts.threads    || 'yes',
              insideNeo  = !!programOpts.framework || false,
              cpArgs     = ['-e', env],
              startDate  = new Date();
        let   childProcess,
              status = 0;

        programOpts.noquestions && cpArgs.push('-n');
        insideNeo               && cpArgs.push('-f');

        if (npminstall === 'yes') {
            childProcess = spawnSync(npmCmd, ['i'], cpOpts);
            status = status | childProcess.status;
        }
        if (themes     === 'yes') {
            childProcess = spawnSync('node', [`${neoPath}/buildScripts/buildThemes.mjs`].concat(cpArgs), cpOpts);
            status = status | childProcess.status;
        }
        if (threads    === 'yes') {
            childProcess = spawnSync('node', [`${webpackPath}/buildThreads.mjs`].concat(cpArgs), cpOpts);
            status = status | childProcess.status;
        }
        if (parsedocs  === 'yes') {
            childProcess = spawnSync(npmCmd, ['run', 'generate-docs-json'], cpOpts);
            status = status | childProcess.status;
        };

        if (env === 'all' || env === 'dev') {
            childProcess = spawnSync('node', [`${neoPath}/buildScripts/copyFolder.mjs -s ${path.resolve(cwd, 'docs/output')   } -t ${path.resolve(cwd, 'dist/development/docs/output')}`],    cpOpts);
            status = status | childProcess.status;
            childProcess = spawnSync('node', [`${neoPath}/buildScripts/copyFolder.mjs -s ${path.resolve(cwd, 'docs/resources')} -t ${path.resolve(cwd, 'dist/development/docs/resources')}`], cpOpts);
            status = status | childProcess.status;
        }

        if (env === 'all' || env === 'prod') {
            childProcess = spawnSync('node', [`${neoPath}/buildScripts/copyFolder.mjs -s ${path.resolve(cwd, 'docs/output')   } -t ${path.resolve(cwd, 'dist/production/docs/output')}`],    cpOpts);
            status = status | childProcess.status;
            childProcess = spawnSync('node', [`${neoPath}/buildScripts/copyFolder.mjs -s ${path.resolve(cwd, 'docs/resources')} -t ${path.resolve(cwd, 'dist/production/docs/resources')}`], cpOpts);
            status = status | childProcess.status;
        }

        const processTime = (Math.round((new Date - startDate) * 100) / 100000).toFixed(2);
        console.log(`\nTotal time for ${programName}: ${processTime}s`);

        process.exit(status);
    });
}
