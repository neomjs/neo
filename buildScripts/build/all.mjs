import chalk                     from 'chalk';
import {spawnSync}               from 'child_process';
import {Command}                 from 'commander';
import envinfo                   from 'envinfo';
import fs                        from 'fs-extra';
import inquirer                  from 'inquirer';
import os                        from 'os';
import path                      from 'path';
import * as BuildId              from '../util/buildId.mjs';
import {assertInteractivePrompt} from '../util/assertInteractivePrompt.mjs';
import {esmOutputRoot}           from '../util/esmDistTransforms.mjs';
import {runSteps}                from '../util/runSteps.mjs';
import {sanitizeInput}           from '../util/sanitizer.mjs';


const __dirname   = path.resolve(),
      cwd         = process.cwd(),
      cpOpts      = {env: process.env, cwd: cwd, stdio: 'inherit', shell: true},
      nodeCmd     = os.platform().startsWith('win') ? 'node.exe' : 'node', // node binary based on OS
      npmCmd      = os.platform().startsWith('win') ? 'npm.cmd'  : 'npm',  // npm binary based on OS
      requireJson = path => JSON.parse(fs.readFileSync((path))),
      packageJson = requireJson(path.join(__dirname, 'package.json')),
      program     = new Command(),
      neoPath     = path.resolve(packageJson.name.includes('neo.mjs') ? './' : './node_modules/neo.mjs/'),
      webpackPath = path.resolve(neoPath, 'buildScripts/webpack'),
      programName = `${packageJson.name} buildAll`,
      questions   = [];

program
    .name(programName)
    .version(packageJson.version)
    .option('-i, --info',               'print environment debug info')
    .option('-e, --env <value>',        '"all", "dev", "esm", "prod"', sanitizeInput)
    .option('-l, --npminstall <value>', '"yes", "no"', sanitizeInput)
    .option('-f, --framework')
    .option('-n, --noquestions')
    .option('-p, --parsedocs <value>',  '"yes", "no"', sanitizeInput)
    .option('-t, --themes <value>',     '"yes", "no"', sanitizeInput)
    .option('-w, --threads <value>',    '"yes", "no"', sanitizeInput)
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
        if (!programOpts.npminstall) {
            questions.push({
                type   : 'select',
                name   : 'npminstall',
                message: 'Run npm install?:',
                choices: ['yes', 'no'],
                default: 'all'
            });
        }

        if (!programOpts.env) {
            questions.push({
                type   : 'select',
                name   : 'env',
                message: 'Please choose the environment:',
                choices: ['all', 'dev', 'esm', 'prod'],
                default: 'all'
            });
        }

        if (!programOpts.themes) {
            questions.push({
                type   : 'select',
                name   : 'themes',
                message: 'Build the themes?',
                choices: ['yes', 'no'],
                default: 'yes'
            });
        }

        if (!programOpts.threads) {
            questions.push({
                type   : 'select',
                name   : 'threads',
                message: 'Build the threads?',
                choices: ['yes', 'no'],
                default: 'yes'
            });
        }

        if (!programOpts.parsedocs) {
            questions.push({
                type   : 'select',
                name   : 'parsedocs',
                message: 'Trigger the docs-json parsing?',
                choices: ['yes', 'no'],
                default: 'yes'
            });
        }
    }

    assertInteractivePrompt({
        command: 'npm run build-all -- -e dev -l no -t yes -w yes -p no',
        questions
    });

    (questions.length ? inquirer.prompt(questions) : Promise.resolve({})).then(async answers => {
        const env        = answers.env        || programOpts.env        || 'all',
              npminstall = answers.npminstall || programOpts.npminstall || 'yes',
              parsedocs  = answers.parsedocs  || programOpts.parsedocs  || 'yes',
              themes     = answers.themes     || programOpts.themes     || 'yes',
              threads    = answers.threads    || programOpts.threads    || 'yes',
              insideNeo  = !!programOpts.framework || false,
              cpArgs     = ['-e', env],
              startDate  = new Date();
        let   childProcess;

        programOpts.noquestions && cpArgs.push('-n');
        insideNeo               && cpArgs.push('-f');

        // One id for the whole run: every build step below inherits it through process.env
        console.log(chalk.green(`Build id: ${BuildId.getBuildId()}`));

        if (npminstall === 'yes') {
            childProcess = spawnSync(npmCmd, ['i'], cpOpts);
            childProcess.status && process.exit(childProcess.status);
        }

        console.log(chalk.blue('Bundling parse5...'));
        childProcess = spawnSync(nodeCmd, [`${neoPath}/buildScripts/build/parse5.mjs`], cpOpts);
        childProcess.status && process.exit(childProcess.status);

        console.log(chalk.blue('Copying marked...'));
        childProcess = spawnSync(nodeCmd, [`${neoPath}/buildScripts/build/marked.mjs`], cpOpts);
        childProcess.status && process.exit(childProcess.status);

        console.log(chalk.blue('Bundling mermaid...'));
        childProcess = spawnSync(nodeCmd, [`${neoPath}/buildScripts/build/mermaid.mjs`], cpOpts);
        childProcess.status && process.exit(childProcess.status);

        console.log(chalk.blue('Bundling Monaco...'));
        childProcess = spawnSync(nodeCmd, [`${neoPath}/buildScripts/build/monaco.mjs`], cpOpts);
        childProcess.status && process.exit(childProcess.status);

        console.log(chalk.blue('Bundling highlight.js...'));
        childProcess = spawnSync(nodeCmd, [`${neoPath}/buildScripts/build/highlightJs.mjs`], cpOpts);
        childProcess.status && process.exit(childProcess.status);

        if (themes === 'yes') {
            childProcess = spawnSync(nodeCmd, [`${neoPath}/buildScripts/build/themes.mjs`].concat(cpArgs), cpOpts);
            childProcess.status && process.exit(childProcess.status);
        }

        // Each of these writes its own tree (a dist folder, `dist/esm`, `docs/output`) and reads only the sources, so
        // they run together; the steps after them read their output and wait
        const hasDocs = fs.existsSync(path.join(cwd, 'docs/app')),
              steps   = [];

        if (threads === 'yes') {
            // One run for both environments: its own pool spreads their fourteen webpack builds over the cores.
            // build-all builds every thread, so the run asks no thread question; `build-threads` keeps that choice
            env !== 'esm' && steps.push(['threads', nodeCmd, [`${webpackPath}/buildThreads.mjs`, '-e', env, '-t', 'all', ...cpArgs.slice(2), '--no-stamp']]);

            (env === 'all' || env === 'esm') && steps.push(['esmodules', nodeCmd, [`${neoPath}/buildScripts/build/esmodules.mjs`, '--no-stamp', '--no-docs-output']])
        }

        hasDocs && parsedocs === 'yes' && steps.push(['docs json', npmCmd, ['run', 'generate-docs-json']]);

        const failed = (await runSteps(steps, cpOpts)).find(result => result.status);

        if (failed) {
            console.error(chalk.red(`${failed.label} failed`));
            process.exit(failed.status)
        }

        // `dist/esm` takes its copy of the docs JSON only now, once `generate-docs-json` has stopped writing it
        if (threads === 'yes' && (env === 'all' || env === 'esm') && fs.existsSync(path.join(cwd, 'docs/output'))) {
            fs.copySync(path.join(cwd, 'docs/output'), path.join(cwd, esmOutputRoot, 'docs/output'))
        }

        if (threads === 'yes' && (env === 'all' || env === 'prod')) {
            childProcess = spawnSync(nodeCmd, [`${neoPath}/buildScripts/util/check-dist-paths.mjs`, path.resolve(cwd, 'dist/production')], cpOpts);
            childProcess.status && process.exit(childProcess.status);
        }

        if (hasDocs) {
            if (parsedocs === 'yes' && (env === 'all' || env === 'dev')) {
                childProcess = spawnSync(nodeCmd, [`${neoPath}/buildScripts/util/copyFolder.mjs -s ${path.resolve(cwd, 'docs/output')   } -t ${path.resolve(cwd, 'dist/development/docs/output')}`],    cpOpts);
                childProcess.status && process.exit(childProcess.status);
                childProcess = spawnSync(nodeCmd, [`${neoPath}/buildScripts/util/copyFolder.mjs -s ${path.resolve(cwd, 'docs/resources')} -t ${path.resolve(cwd, 'dist/development/docs/resources')}`], cpOpts);
                childProcess.status && process.exit(childProcess.status);
            }

            if (parsedocs === 'yes' && (env === 'all' || env === 'prod')) {
                childProcess = spawnSync(nodeCmd, [`${neoPath}/buildScripts/util/copyFolder.mjs -s ${path.resolve(cwd, 'docs/output')   } -t ${path.resolve(cwd, 'dist/production/docs/output')}`],    cpOpts);
                childProcess.status && process.exit(childProcess.status);
                childProcess = spawnSync(nodeCmd, [`${neoPath}/buildScripts/util/copyFolder.mjs -s ${path.resolve(cwd, 'docs/resources')} -t ${path.resolve(cwd, 'dist/production/docs/resources')}`], cpOpts);
                childProcess.status && process.exit(childProcess.status);
            }
        }

        // Call the new script to copy SEO files
        childProcess = spawnSync(nodeCmd, [`${neoPath}/buildScripts/docs/seo/copy.mjs`, '-e', env], cpOpts);
        childProcess.status && process.exit(childProcess.status);

        // Only a run whose every step succeeded publishes its id: its build steps ran with `--no-stamp`
        if (threads === 'yes') {
            const stamp = dist => BuildId.stampBuildId({buildId: BuildId.getBuildId(), distPath: path.resolve(cwd, dist)});

            (env === 'all' || env === 'dev')  && stamp('dist/development');
            (env === 'all' || env === 'prod') && stamp('dist/production');
            (env === 'all' || env === 'esm')  && stamp(esmOutputRoot)
        }

        const processTime = (Math.round((new Date - startDate) * 100) / 100000).toFixed(2);
        console.log(`\nTotal time for ${programName}: ${processTime}s`);

        process.exit();
    });
}
