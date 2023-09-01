#!/usr/bin/env node

import chalk           from 'chalk';
import {spawnSync}     from 'child_process';
import {Command}       from 'commander/esm.mjs';
import envinfo         from 'envinfo';
import fs              from 'fs-extra';
import inquirer        from 'inquirer';
import path            from 'path';
import {fileURLToPath} from 'url';

const
    __dirname   = fileURLToPath(new URL('../', import.meta.url)),
    cwd         = process.cwd(),
    requireJson = path => JSON.parse(fs.readFileSync((path))),
    packageJson = requireJson(path.join(__dirname, 'package.json')),
    program     = new Command(),
    programName = `${packageJson.name} create-class`,
    questions   = [],
    /**
     * Maintain a list of dir-names recognized as source root directories.
     * When not using dot notation with a class-name, the program assumes
     * that we want to create the class inside the cwd. The proper namespace
     * is then looked up by traversing the directory path up to the first
     * folder that matches an entry in "sourceRootDirs". The owning
     * folder (parent of cwd, child of sourceRootDirs[n]) will then be used as the
     * namespace for this created class.
     * Can be overwritten with the -s option.
     * @type {String[]}
     */
    sourceRootDirs = ['apps'];

program
    .name(programName)
    .version(packageJson.version)
    .option('-i, --info', 'print environment debug info')
    .option('-n, --singleton <value>', 'Create a singleton? Pick "yes" or "no"')
    .option('-s, --source <value>', `name of the folder containing the project. Defaults to any of ${sourceRootDirs.join(',')}`)
    .option('-b, --baseClass <value>')
    .option('-c, --className <value>')
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

    if (!programOpts.className) {
        answer = await inquirer.prompt({
            type   : 'input',
            name   : 'className',
            message: 'Please choose the namespace for your class:',
            default: 'Covid.view.MyContainer'
        });

        Object.assign(answers, answer);
    }

    if (!programOpts.baseClass) {
        questions.push({
            type   : 'list',
            name   : 'baseClass',
            message: 'Please pick the base class, which you want to extend:',
            default: guessBaseClass(programOpts.className || answers.className),

            choices: [
                'component.Base',
                'container.Base',
                'container.Viewport',
                'controller.Component',
                'core.Base',
                'data.Model',
                'data.Store',
                'model.Component',
                'tab.Container',
                'table.Container'
            ]
        });
    }


    if (!programOpts.singleton) {
        questions.push({
            type   : 'list',
            name   : 'singleton',
            message: 'Singleton?',
            default: 'no',
            choices: ['yes', 'no']
        });
    }

    answer = await inquirer.prompt(questions);

    Object.assign(answers, answer);

    let baseClass = programOpts.baseClass || answers.baseClass,
        className = programOpts.className || answers.className,
        singleton = programOpts.singleton || answers.singleton || 'no';

    let ns = className.split('.');
    ns.pop();
    let root          = ns.shift();
    let rootLowerCase = root.toLowerCase();


    if (!baseClass && !className) {
        console.error(chalk.red('className and baseClass must be defined'));
        process.exit(1);
    }

    const scssClassName = getScssClassName(className, rootLowerCase);

    let childProcess = spawnSync('node', [
        './buildScripts/createClass.mjs',
        '-c',
        className,
        '-b',
        baseClass,
        '-n',
        singleton,
        '-r',
        scssClassName
    ], {env: process.env, cwd: process.cwd(), stdio: 'inherit'});
    childProcess.status && process.exit(childProcess.status);


    //create scss stubs only if it is a NEO component or a view component
    const resultView = ns.filter(f => f === 'view');
    if (rootLowerCase === 'neo' || resultView.length > 0) {
        let childProcess = spawnSync('node', [
            './buildScripts/tools/createScss.mjs',
            '-c',
            className,
            '-b',
            baseClass
        ], {env: process.env, cwd: process.cwd(), stdio: 'inherit'});
        childProcess.status && process.exit(childProcess.status);
    }

    // create only example stub when it is a NEO component
    if (rootLowerCase === 'neo') {
        let childProcess = spawnSync('node', [
            './buildScripts/tools/createExample.mjs',
            //        '--',
            '-c',
            className
        ], {env: process.env, cwd: process.cwd(), stdio: 'inherit'});
        childProcess.status && process.exit(childProcess.status);
    }

    //re-build the themes
    let buildThemes = spawnSync('node', [
        './buildScripts/buildThemes.mjs',
        //        '--',
        '-f',
        '-e',
        'all',
        '-n'
    ], {env: process.env, cwd: process.cwd(), stdio: 'inherit'});
    buildThemes.status && process.exit(buildThemes.status);


    // start the dev server
    if (rootLowerCase === 'neo') {
        let temp = className.split('.');
        temp.splice(0, 1); //remove Neo namespace
        let componentPath = `/examples/${temp.join('/')}`;
        componentPath     = componentPath.toLowerCase();

        let startServer = spawnSync('webpack', [
            'serve',
            '-c',
            './buildScripts/webpack/webpack.server.config.mjs',
            '--open',
            componentPath
        ], {env: process.env, cwd: process.cwd(), stdio: 'inherit'});
        startServer.status && process.exit(startServer.status);
    }
}

function guessBaseClass(className) {
    className = className.toLowerCase();

    if (className.includes('.model.')) {
        return 'data.Model';
    }

    if (className.includes('.store.')) {
        return 'data.Store';
    }

    if (className.endsWith('component')) {
        return 'component.Base';
    }

    if (className.endsWith('controller')) {
        return 'controller.Component';
    }

    if (className.endsWith('model')) {
        return 'model.Component';
    }

    if (className.includes('table')) {
        return 'table.Container';
    }

    if (className.includes('tab')) {
        return 'tab.Container';
    }

    return 'container.Base';
}

function getScssClassName(className) {
    //template
    let classItems = className.split('.');
    let result     = [];

    classItems.forEach(item => {
        let temp = item.split(/(?=[A-Z])/);
        result.push(temp.join('-').toLowerCase());
    });

    return result.join('-');
}
