#!/usr/bin/env node

import chalk       from 'chalk';
import { Command } from 'commander/esm.mjs';
import envinfo     from 'envinfo';
import fs          from 'fs-extra';
import inquirer    from 'inquirer';
import os          from 'os';
import path        from 'path';

const
    __dirname   = path.resolve(),
    cwd         = process.cwd(),
    requireJson = path => JSON.parse(fs.readFileSync((path))),
    packageJson = requireJson(path.join(__dirname, 'package.json')),
    program     = new Command(),
    programName = `${packageJson.name} add-config`,
    questions   = [];

program
    .name(programName)
    .version(packageJson.version)
    .option('-i, --info', 'print environment debug info')
    .option('-c, --configName <value>')
    .option('-h, --hooks <value>')
    .option('-t, --type <value>')
    .allowUnknownOption()
    .on('--help', () => {
        console.log('\nIn case you have any issues, please create a ticket here:');
        console.log(chalk.cyan(process.env.npm_package_bugs_url));
    })
    .parse(process.argv);

const programOpts = program.opts();

if (programOpts.info) {
    console.log(chalk.bold('\nEnvironment Info:'));
    console.log(`\n  current version of ${packageJson.name}: ${packageJson.version}`);
    console.log(`  running from ${cwd}`);

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

    let answers = {},
        answer;

    if (!programOpts.configName) {
        answer = await inquirer.prompt({
            type   : 'input',
            name   : 'configName',
            message: 'Please enter a name for your class config:'
        });

        Object.assign(answers, answer);
    }

    if (!programOpts.configName) {
        answer = await inquirer.prompt({
            type   : 'list',
            name   : 'type',
            message: 'Please choose a type for your class config:',
            default: 'Custom',
            choices: [
                'Custom',
                'Object',
                'Object[]',
                'Number',
                'Number[]',
                'String',
                'String[]'
            ]
        });

        Object.assign(answers, answer);
    }

    if (answers.type === 'Custom') {
        answer = await inquirer.prompt({
            type   : 'input',
            name   : 'type',
            message: 'Please enter the type for your class config:'
        });

        Object.assign(answers, answer);
    }

    if (!programOpts.hooks) {
        answer = await inquirer.prompt({
            type   : 'checkbox',
            name   : 'hooks',
            message: 'Please choose the hooks for your class config:',
            choices: [`afterSet`, `beforeGet`, `beforeSet`],
            default: [`afterSet`]
        });

        Object.assign(answers, answer);
    }

    console.log(answers);
}
