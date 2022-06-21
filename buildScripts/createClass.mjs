import chalk       from 'chalk';
import { Command } from 'commander/esm.mjs';
import envinfo     from 'envinfo';
import fs          from 'fs-extra';
import inquirer    from 'inquirer';
import os          from 'os';
import path        from 'path';

const __dirname    = path.resolve(),
      cwd          = process.cwd(),
      requireJson  = path => JSON.parse(fs.readFileSync((path))),
      packageJson  = requireJson(path.join(__dirname, 'package.json')),
      program      = new Command(),
      programName  = `${packageJson.name} create-class`,
      questions    = [];

program
    .name(programName)
    .version(packageJson.version)
    .option('-i, --info',              'print environment debug info')
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

    if (!programOpts.className) {
        questions.push({
            type   : 'input',
            name   : 'className',
            message: 'Please choose the namespace for your class:',
            default: 'Covid.view.FooContainer'
        });
    }

    if (!programOpts.baseClass) {
        questions.push({
            type   : 'list',
            name   : 'baseClass',
            message: 'Please pick the base class, which you want to extend:',
            choices: ['component.Base', 'container.Base'],
            default: 'component.Base'
        });
    }

    inquirer.prompt(questions).then(answers => {
        let baseClass = programOpts.baseClass || answers.baseClass,
            className = programOpts.className || answers.className,
            startDate = new Date(),
            ns, root;

        if (className.endsWith('.mjs')) {
            className = className.slice(0, -4);
        }

        ns   = className.split('.');
        root = ns.shift();

        if (root === 'Neo') {
            console.log('todo: create the file inside the src folder');
        } else {
            if (fs.existsSync(path.resolve(cwd, 'apps', root.toLowerCase()))) {
                console.log('valid app folder');
            }
        }

        console.log(root, ns, className, baseClass);

        const processTime = (Math.round((new Date - startDate) * 100) / 100000).toFixed(2);
        console.log(`\nTotal time for ${programName}: ${processTime}s`);

        process.exit();
    });
}
