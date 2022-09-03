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
}
