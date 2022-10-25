#!/usr/bin/env node

import chalk       from 'chalk';
import { Command } from 'commander/esm.mjs';
import envinfo     from 'envinfo';
import fs          from 'fs-extra';
import inquirer    from 'inquirer';
import os          from 'os';
import path        from 'path';
import {spawnSync} from "child_process";

const
    __dirname   = path.resolve(),
    cwd         = process.cwd(),
    requireJson = path => JSON.parse(fs.readFileSync((path))),
    packageJson = requireJson(path.join(__dirname, 'package.json')),
    insideNeo   = packageJson.name === 'neo.mjs',
    neoPath     = insideNeo ? './' : './node_modules/neo.mjs/',
    program     = new Command(),
    programName = `${packageJson.name} add-config`,
    questions   = [];

program
    .name(programName)
    .version(packageJson.version)
    .option('-e, --env <value>', '"all", "dev", "prod"')
    .option('-i, --info', 'print environment debug info')
    .option('-n, --noquestions')
    .option('-t, --threads <value>', '"all", "app", "data", "main", "vdom"')
    .allowUnknownOption()
    .on('--help', () => {
        console.log('\nIn case you have any issues, please create a ticket here:');
        console.log(chalk.cyan(process.env.npm_package_bugs_url));
    })
    .parse(process.argv);

const programOpts = program.opts();

if (!programOpts.noquestions && !programOpts.env) {
    questions.push({
        type   : 'list',
        name   : 'env',
        message: 'Please choose the environment:',
        choices: ['all', 'dev', 'prod'],
        default: 'all'
    });
}

inquirer.prompt(questions).then(answers => {
    const env       = answers.env || programOpts.env || 'all',
          startDate = new Date();

    const processTime = (Math.round((new Date - startDate) * 100) / 100000).toFixed(2);
    console.log(`\nTotal time for ${programName}: ${processTime}s`);

    process.exit();
});
