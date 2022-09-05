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
    programName = `${packageJson.name} add-config`;

/**
 * Adds a comma to the last element of the contentArray
 * @param {String[]} contentArray
 * @param {Number} index=contentArray.length - 1
 * @returns {String[]}
 */
function addComma(contentArray, index=contentArray.length - 1) {
    contentArray[index] += ',';
    return contentArray;
}

/**
 * Adds a config to the given index of the contentArray
 * @param {Object} opts
 * @param {String} opts.configName
 * @param {String} opts.defaultValue
 * @param {String[]} opts.contentArray
 * @param {Boolean} opts.isLastConfig
 * @param {Number} opts.index
 * @param {String} opts.type
 * @returns {String[]}
 */
function addConfig(opts) {
    if (opts.type === 'String' && opts.defaultValue !== 'null') {
        opts.defaultValue = `'${opts.defaultValue}'`;
    }

    const config = [
        '        /**',
        `         * @member {${opts.type}} ${opts.configName}_=${opts.defaultValue}`,
        '         */',
        `        ${opts.configName}_: ${opts.defaultValue}`
    ];

    !opts.isLastConfig && addComma(config);

    opts.contentArray.splice(opts.index, 0, config.join(os.EOL));
    return opts.contentArray;
}

/**
 * Adds a config hook at the matching index
 * @param {Object} opts
 * @param {String} opts.comment
 * @param {String[]} opts.contentArray
 * @param {String} opts.name
 * @param {Boolean} opts.oldValueParam
 * @param {Boolean} opts.returnValue
 * @param {String} opts.type
 * @returns {String[]}
 */
function addHook(opts) {
    let contentArray = opts.contentArray,
        i            = 0,
        inserted     = false,
        name         = opts.name,
        len          = contentArray.length,
        j, methodName, nextLine,

    method = [
        '',
        '    /**',
        `     * ${opts.comment}`,
        `     * @param {${opts.type}} value`
    ];

    if (opts.oldValueParam) {
        method.push(
        `     * @param {${opts.type}} oldValue`
        );
    }

    if (opts.returnValue) {
        method.push(
        `     * @returns {${opts.type}}`
        );
    }

    method.push(
        '     * @protected',
        '     */'
    );

    if (opts.oldValueParam) {
        method.push(
        `    ${name}(value, oldValue) {`
        );
    } else {
        method.push(
        `    ${name}(value) {`
        );
    }

    if (opts.returnValue) {
        method.push(
        '        return value;'
        );
    } else {
        method.push(
        '        '
        );
    }

    method.push(
        '    }'
    );

    for (; i < len; i++) {
        if (contentArray[i].includes('}}')) {
            break;
        }
    }

    for (; i < len; i++) {
        if (contentArray[i].includes('*/')) {
            nextLine   = contentArray[i + 1]
            methodName = nextLine.substring(0, nextLine.indexOf('(')).trim();

            if (methodName === 'construct') {
                continue;
            }

            if (methodName > name) {
                for (j=i; j > 0; j--) {
                    if (contentArray[j].includes('/**')) {
                        contentArray.splice(j - 1, 0, method.join(os.EOL));
                        inserted = true;
                        break;
                    }
                }
                break;
            }
        }
    }

    if (!inserted) {
        for (i=contentArray.length - 1; i > 0; i--) {
            if (contentArray[i].includes('}')) {
                contentArray.splice(i, 0, method.join(os.EOL));
                break;
            }
        }
    }

    return contentArray;
}


/**
 * Makes the first character of a string uppercase
 * @param {String} value
 * @returns {Boolean|String} Returns false for non string inputs
 */
function capitalize(value) {
    return value[0].toUpperCase() + value.slice(1);
}

program
    .name(programName)
    .version(packageJson.version)
    .option('-i, --info', 'print environment debug info')
    .option('-c, --className <value>')
    .option('-d, --defaultValue <value>')
    .option('-h, --hooks <value>')
    .option('-n, --configName <value>')
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

    if (!programOpts.className) {
        answer = await inquirer.prompt({
            type   : 'input',
            name   : 'className',
            message: 'Please choose the namespace of your class:',
            default: 'Covid.view.MainContainer'
        });

        Object.assign(answers, answer);
    }

    let className = programOpts.className || answers.className,
        ns        = className.split('.'),
        root      = ns.shift().toLowerCase(),
        classPath = path.resolve(cwd, root === 'neo' ? 'src' : `apps/${root}`, `${ns.join('/')}.mjs`);

    if (!fs.existsSync(path.resolve(classPath))) {
        console.log(chalk.red(`File not found for ${className} => ${classPath}`));
        process.exit(1);
    }

    if (!programOpts.configName) {
        answer = await inquirer.prompt({
            type   : 'input',
            name   : 'configName',
            message: 'Please enter a name for your class config:'
        });

        Object.assign(answers, answer);
    }

    let configName = programOpts.configName || answers.configName;

    if (configName.endsWith('_')) {
        configName = configName.slice(0, -1);
    }

    let uConfigName = capitalize(configName);

    if (!programOpts.type) {
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

    if (!programOpts.defaultValue) {
        answer = await inquirer.prompt({
            type   : 'input',
            name   : 'defaultValue',
            message: 'Please enter a defaultValue:',
            default: 'null'
        });

        Object.assign(answers, answer);
    }

    if (!programOpts.hooks) {
        answer = await inquirer.prompt({
            type   : 'checkbox',
            name   : 'hooks',
            message: 'Please choose the hooks for your class config:',
            choices: [`afterSet${uConfigName}()`, `beforeGet${uConfigName}()`, `beforeSet${uConfigName}()`],
            default: [`afterSet${uConfigName}()`]
        });

        Object.assign(answers, answer);
    }

    let defaultValue = programOpts.defaultValue || answers.defaultValue,
        hooks        = programOpts.hooks        || answers.hooks,
        type         = programOpts.type         || answers.type,
        contentArray = fs.readFileSync(classPath).toString().split(os.EOL),
        i            = 0,
        len          = contentArray.length,
        codeLine, existingConfigName, j, nextLine;

    for (; i < len; i++) {
        if (contentArray[i].includes('static getConfig')) {
            break;
        }
    }

    for (; i < len; i++) {
        codeLine = contentArray[i];

        if (codeLine.includes('}}')) {
            addComma(contentArray, i - 1);
            addConfig({
                configName,
                defaultValue,
                contentArray,
                index       : i,
                isLastConfig: true,
                type
            });
            break;
        }

        if (codeLine.includes('*/')) {
            nextLine           = contentArray[i + 1]
            existingConfigName = nextLine.substring(0, nextLine.indexOf(':')).trim();

            if (existingConfigName === 'className' || existingConfigName === 'ntype') {
                continue;
            }

            if (existingConfigName > configName) {
                for (j=i; j > 0; j--) {
                    if (contentArray[j].includes('/**')) {
                        addConfig({
                            configName,
                            contentArray,
                            defaultValue,
                            index       : j,
                            isLastConfig: false,
                            type
                        });
                        break;
                    }
                }
                break;
            }
        }
    }

    if (hooks.includes(`afterSet${uConfigName}()`)) {
        addHook({
            comment      : `Triggered after the ${configName} config got changed`,
            contentArray,
            name         : `afterSet${uConfigName}`,
            oldValueParam: true,
            returnValue  : false,
            type
        });
    }

    if (hooks.includes(`beforeGet${uConfigName}()`)) {
        addHook({
            comment      : `Gets triggered when accessing the value of the ${configName} config`,
            contentArray,
            name         : `beforeGet${uConfigName}`,
            oldValueParam: false,
            returnValue  : true,
            type
        });
    }

    if (hooks.includes(`beforeSet${uConfigName}()`)) {
        addHook({
            comment      : `Triggered before the ${configName} config gets changed`,
            contentArray,
            name         : `beforeSet${uConfigName}`,
            oldValueParam: true,
            returnValue  : true,
            type
        });
    }

    fs.writeFileSync(classPath, contentArray.join(os.EOL));
}
