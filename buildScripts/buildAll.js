'use strict';

const chalk       = require('chalk'),
      { program } = require('commander'),
      cp          = require('child_process'),
      cwd         = process.cwd(),
      cpOpts      = {env: process.env, cwd: cwd, stdio: 'inherit', shell: true},
      envinfo     = require('envinfo'),
      inquirer    = require('inquirer'),
      os          = require('os'),
      npmCmd      = os.platform().startsWith('win') ? 'npm.cmd' : 'npm', // npm binary based on OS
      path        = require('path'),
      packageJson = require(path.resolve(cwd, 'package.json')),
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

    if (programOpts.noquestions) {
        cpArgs.push('-n');
    }

    if (insideNeo) {
        cpArgs.push('-f');
    }

    if (npminstall === 'yes') {
        cp.spawnSync(npmCmd, ['i'], cpOpts);
    }

    if (themes === 'yes') {
        cp.spawnSync('node', [`${neoPath}/buildScripts/buildThemes.js`].concat(cpArgs), cpOpts);
    }

    if (threads === 'yes') {
        cp.spawnSync('node', [`${webpackPath}/buildThreads.js`].concat(cpArgs), cpOpts);
    }

    if (parsedocs === 'yes') {
        cp.spawnSync(npmCmd, ['run', 'generate-docs-json'], cpOpts);
    }

    const processTime = (Math.round((new Date - startDate) * 100) / 100000).toFixed(2);
    console.log(`\nTotal time for ${programName}: ${processTime}s`);

    process.exit();
});
