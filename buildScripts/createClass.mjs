#!/usr/bin/env node

import chalk           from 'chalk';
import { Command }     from 'commander/esm.mjs';
import envinfo         from 'envinfo';
import fs              from 'fs-extra';
import inquirer        from 'inquirer';
import os              from 'os';
import path            from 'path';
import {fileURLToPath} from 'url';

const
      __dirname   = fileURLToPath(new URL('../', import.meta.url)),
      cwd         = process.cwd(),
      requireJson = path => JSON.parse(fs.readFileSync((path))),
      packageJson = requireJson(path.join(__dirname, 'package.json')),
      insideNeo   = process.env.npm_package_name === 'neo.mjs',
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
    .option('-i, --info',              'print environment debug info')
    .option('-d, --drop',              'drops class in the currently selected folder')
    .option('-n, --singleton <value>', 'Create a singleton? Pick "yes" or "no"')
    .option('-s, --source <value>',    `name of the folder containing the project. Defaults to any of ${sourceRootDirs.join(',')}`)
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

    if (programOpts.drop) {
        // change source folder if the user wants to
        if (programOpts.source) {
            while (sourceRootDirs.length) {
                sourceRootDirs.pop();
            }
            sourceRootDirs.push(programOpts.source);
        }

        if (!programOpts.className || !programOpts.baseClass) {
            console.error(chalk.red('-d is non interactive. Please provide name base class, and optionally the source parent for the class to create'));
            console.info(chalk.bgCyan('Usage: createClass -d -c <className> -b <baseClass> [-s sourceParent]'));
            process.exit(1);
        }

        if (programOpts.className.indexOf('.') !== -1) {
            console.error(chalk.red('No .dot-notation available when -d option is selected.'));
            console.info(chalk.bgCyan('Usage: createClass -d -c <className> -b <baseClass> [-s sourceParent]'));
            process.exit(1);
        }
    }

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

    let baseClass   = programOpts.baseClass || answers.baseClass,
        className   = programOpts.className || answers.className,
        singleton   = programOpts.singleton || answers.singleton || 'no',
        isDrop      = programOpts.drop,
        isSingleton = singleton === 'yes',
        startDate   = new Date(),
        baseType, classFolder, configName, file, folderDelta, importName, importPath, index, ns, root, rootLowerCase, viewFile;

    if (className.endsWith('.mjs')) {
        className = className.slice(0, -4);
    }

    if (!isDrop) {
        ns            = className.split('.');
        file          = ns.pop();
        root          = ns.shift();
        rootLowerCase = root.toLowerCase();
    }

    if (root === 'Neo') {
        if (isDrop) {
            console.log(chalk.red('Drop mode not yet supported for the neo framework scope'));
            process.exit(1);
        } else {
            classFolder = path.join(cwd, className.startsWith('Neo.examples') ? '/' : '/src/', ns.join('/'));
            folderDelta = ns.length;
        }
    } else {
        if (isDrop) {
            ns = [];

            let pathInfo      = path.parse(cwd),
                sep           = path.sep,
                baseName, loc = baseName = '',
                tmpNs;

            sourceRootDirs.some(dir => {
                loc   = cwd;
                tmpNs = [];

                while (pathInfo.root !== loc) {
                    baseName = path.resolve(loc, './').split(sep).pop();

                    if (baseName === dir) {
                        ns          = tmpNs.reverse();
                        classFolder = path.resolve(loc, ns.join(sep));
                        file        = className;
                        className   = ns.concat(className).join('.');
                        loc         = path.resolve(loc, ns.join(sep));
                        return true;
                    }

                    tmpNs.push(baseName);
                    loc = path.resolve(loc, '../');
                }
            });

            if (!ns.length) {
                console.error(chalk.red(
                    'Could not determine namespace for application. Did you provide the ' +
                    `correct source parent with -s? (was: ${sourceRootDirs.join(',')}`));
                process.exit(1);
            }

            console.info(
                chalk.yellow(`Creating ${chalk.bgGreen(className)} extending ${chalk.bgGreen(baseClass)} in ${loc}${sep}${file}.mjs`)
            );

            let delta_l = path.normalize(__dirname),
                delta_r = path.normalize(loc);

            if (delta_r.indexOf(delta_l) !== 0) {
                console.error(chalk.red(`Could not determine ${loc} being a child of ${__dirname}`));
                process.exit(1);
            }

            let delta = delta_r.replace(delta_l, ''),
                parts = delta.split(sep);

            folderDelta = parts.length;
        } else {
            if (fs.existsSync(path.resolve(cwd, 'apps', rootLowerCase))) {
                classFolder = path.resolve(cwd, 'apps', rootLowerCase, ns.join('/'));
            } else {
                console.log('\nNon existing neo app name:', chalk.red(root));
                process.exit(1);
            }
        }
    }

    if (folderDelta === undefined) {
        folderDelta = ns.length + 2;
    }

    createClass({
        baseClass,
        className,
        isSingleton,
        file,
        folderDelta,
        ns,
        root
    });

    if (baseClass === 'data.Model') {
        // todo: add a question for auto-generating a matching store
    }

    const processTime = (Math.round((new Date - startDate) * 100) / 100000).toFixed(2);
    console.log(`\nTotal time for ${programName}: ${processTime}s`);

    process.exit();

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
     * @param {String} opts.baseType
     * @param {String} opts.className
     * @param {String} opts.configName
     * @param {String[]} opts.contentArray
     * @param {Boolean} opts.isLastConfig
     * @param {Number} opts.index
     * @returns {String[]}
     */
    function addConfig(opts) {
        const config = [
            '        /**',
            `         * @member {${opts.baseType}} ${opts.configName}=${opts.className}`,
            '         */',
            `        ${opts.configName}: ${opts.className}`
        ];

        !opts.isLastConfig && addComma(config);

        opts.contentArray.splice(opts.index, 0, config.join(os.EOL));
        return opts.contentArray;
    }

    /**
     * Adjusts the views related to controller.Component or model.Component
     * @param {Object} opts
     * @param {String} opts.baseType
     * @param {String} opts.configName
     * @param {String} opts.importName
     * @param {String} opts.importPath
     * @param {String} opts.viewFile
     */
    function adjustView(opts) {
        let baseType        = opts.baseType,
            configName      = opts.configName,
            importName      = opts.importName,
            viewFile        = opts.viewFile,
            content         = fs.readFileSync(viewFile).toString().split(os.EOL),
            fromMaxPosition = 0,
            i               = 0,
            len             = content.length,
            adjustSpaces, className, codeLine, existingImportName, fromPosition, importLength, j, nextLine, spaces;

        // find the index where we want to insert our import statement
        for (; i < len; i++) {
            codeLine = content[i];

            if (codeLine === '') {
                break;
            }

            existingImportName = codeLine.substr(7);
            existingImportName = existingImportName.substr(0, existingImportName.indexOf(' '));
            importLength       = existingImportName.length;

            if (existingImportName > importName) {
                break;
            }
        }

        content.splice(i, 0, `import ${importName} from '${opts.importPath}';`);

        // find the longest import module name
        for (i=0; i < len; i++) {
            codeLine = content[i];

            if (codeLine === '') {
                break;
            }

            fromMaxPosition = Math.max(fromMaxPosition, codeLine.indexOf('from'));
        }

        // adjust the block-formatting for imports
        for (i=0; i < len; i++) {
            codeLine = content[i];

            if (codeLine === '') {
                break;
            }

            fromPosition = codeLine.indexOf('from');
            adjustSpaces = fromMaxPosition - fromPosition;

            if (adjustSpaces > 0) {
                spaces = '';

                for (j=0; j < adjustSpaces; j++) {
                    spaces += ' ';
                }

                content[i] = codeLine.substr(0, fromPosition) + spaces + codeLine.substr(fromPosition);
            }
        }

        i   = 0;
        len = content.length;

        // find the starting point
        for (; i < len; i++) {
            if (content[i].includes('static config')) {
                break;
            }
        }

        for (; i < len; i++) {
            codeLine = content[i];

            if (codeLine.includes('    }')) {
                addComma(content, i - 1);
                addConfig({
                    baseType,
                    className   : importName,
                    configName,
                    contentArray: content,
                    index       : i,
                    isLastConfig: true
                });
                break;
            }

            if (codeLine.includes('*/')) {
                nextLine  = content[i + 1]
                className = nextLine.substring(0, nextLine.indexOf(':')).trim();

                if (className === 'className' || className === 'ntype') {
                    continue;
                }

                if (className > configName) {
                    for (j=i; j > 0; j--) {
                        if (content[j].includes('/**')) {
                            addConfig({
                                baseType,
                                className   : importName,
                                configName,
                                contentArray: content,
                                index       : j,
                                isLastConfig: false
                            });
                            break;
                        }
                    }
                    break;
                }
            }
        }

        fs.writeFileSync(viewFile, content.join(os.EOL));
    }

    /**
     * Makes the first character of a string uppercase
     * @param {String} value
     * @returns {Boolean|String} Returns false for non string inputs
     */
    function capitalize(value) {
        return typeof value === 'string' && value[0].toUpperCase() + value.slice(1);
    }

    /**
     * @param {Object} opts
     * @param {String} opts.baseClass
     * @param {String} opts.className
     * @param {Boolean} opts.isSingleton
     * @param {String} opts.file
     * @param {Number} opts.folderDelta
     * @param {String[]} opts.ns
     * @param {String} opts.root
     */
    function createClass(opts) {
        let {
            baseClass,
            className,
            isSingleton,
            file,
            folderDelta,
            ns,
            root
        } = opts, baseFileName;

        fs.mkdirpSync(classFolder, {recursive: true});

        baseFileName = baseClass.split('.').pop();

        if (baseFileName === file) {
            baseFileName = baseClass.split('.');
            baseFileName = baseFileName.map(e => capitalize(e)).join('');
        }

        fs.writeFileSync(path.join(classFolder, file + '.mjs'), createContent({
            baseClass,
            baseFileName,
            className,
            isSingleton,
            file,
            folderDelta,
            ns,
            root
        }));

        switch(baseClass) {
            case 'controller.Component': {
                baseType   = 'Neo.controller.Component';
                configName = 'controller';
                importName = file;
                importPath = `./${importName}.mjs`;
                index      = file.indexOf('Controller');

                if (index > 0) {
                    viewFile = path.join(classFolder, file.substr(0, index) + '.mjs');

                    if (fs.existsSync(viewFile)) {
                        adjustView({baseType, configName, importName, importPath, viewFile});
                    }
                }
                break;
            }

            case 'data.Store': {
                baseType   = 'Neo.data.Model';
                configName = 'model';
                importName = className.replace('.store.', '.model.');

                if (importName.endsWith('ies')) {
                    importName.replace(new RegExp('ies$'), 'y')
                } else {
                    importName = importName.slice(0, -1);
                }

                viewFile = importName.split('.');
                viewFile.shift();

                importPath = `../${viewFile.join('/')}.mjs`;
                viewFile   = path.join(classFolder, importPath);

                // checking for the data.Model file
                if (fs.existsSync(viewFile)) {
                    // adjusting the data.Store file
                    viewFile   = path.join(classFolder, file + '.mjs');
                    importName = importName.split('.');
                    importName = importName.pop();

                    adjustView({baseType, configName, importName, importPath, viewFile});
                }
                break;
            }

            case 'model.Component': {
                baseType   = 'Neo.model.Component';
                configName = 'model';
                importName = file;
                importPath = `./${importName}.mjs`;
                index      = file.indexOf('Model');

                if (index > 0) {
                    viewFile = path.join(classFolder, file.substr(0, index) + '.mjs');

                    if (fs.existsSync(viewFile)) {
                        adjustView({baseType, configName, importName, importPath, viewFile});
                    }
                }
                break;
            }
        }
    }

    /**
     * Creates the content of the neo-class .mjs file
     * @param {Object} opts
     * @param {String} opts.baseClass
     * @param {String} opts.baseFileName
     * @param {String} opts.className
     * @param {Boolean} opts.isSingleton
     * @param {String} opts.file
     * @param {Number} opts.folderDelta
     * @param {String} opts.ns
     * @param {String} opts.root
     * @returns {String}
     */
    function createContent(opts) {
        let baseClass     = opts.baseClass,
            baseFileName  = opts.baseFileName,
            baseClassPath = baseClass.split('.').join('/'),
            className     = opts.className,
            importSrc     = 'src/',
            isSingleton   = opts.isSingleton,
            file          = opts.file,
            i             = 0,
            importDelta   = '';

        if (root === 'Neo') {
            if (className.startsWith('Neo.examples')) {
                importSrc = 'src/';
            } else {
                importSrc = '';
            }
        }

        for (; i < opts.folderDelta; i++) {
            importDelta += '../';
        }

        let classContent = [
            `import ${baseFileName} from '${importDelta}${(insideNeo ? '' : 'node_modules/neo.mjs/')}${importSrc + baseClassPath}.mjs';`,
            "",
            "/**",
            ` * @class ${className}`,
            ` * @extends Neo.${baseClass}`
        ];

        isSingleton && classContent.push(
            " * @singleton"
        );

        classContent.push(
            " */",
            `class ${file} extends ${baseFileName} {`,
            "    static config = {",
            "        /**",
            `         * @member {String} className='${className}'`,
            "         * @protected",
            "         */",
            `        className: '${className}'`
        );

        baseClass === 'table.Container' && addComma(classContent).push(
            "        /**",
            "         * @member {Object[]} columns",
            "         */",
            "        columns: [{",
            "            dataField: 'id',",
            "            text     : 'Id'",
            "        }, {",
            "            dataField: 'name',",
            "            text     : 'Name'",
            "        }]"
        );

        baseClass === 'model.Component' && addComma(classContent).push(
            "        /**",
            "         * @member {Object} data",
            "         */",
            "        data: {}"
        );

        baseClass === 'data.Model' && addComma(classContent).push(
            "        /**",
            "         * @member {Object[]} fields",
            "         */",
            "        fields: [{",
            "            name: 'id',",
            "            type: 'String'",
            "        }]"
        );

        (baseClass === 'container.Base' || baseClass === 'container.Viewport') && addComma(classContent).push(
            "        /**",
            "         * @member {Object[]} items",
            "         */",
            "        items: []"
        );

        baseClass === 'tab.Container' && addComma(classContent).push(
            "        /**",
            "         * @member {Object[]} items",
            "         */",
            "        items: [{",
            "            ntype: 'component',",
            "",
            "            tabButtonConfig: {",
            "                iconCls: 'fa fa-home',",
            "                text   : 'Tab 1'",
            "            }",
            "        }, {",
            "            ntype: 'component',",
            "",
            "            tabButtonConfig: {",
            "                iconCls: 'fa fa-play-circle',",
            "                text   : 'Tab 2'",
            "            }",
            "        }]",
        );

        isSingleton && addComma(classContent).push(
            "        /**",
            "         * @member {Boolean} singleton=true",
            "         * @protected",
            "         */",
            "        singleton: true"
        );

        baseClass === 'model.Component' && addComma(classContent).push(
            "        /**",
            "         * @member {Object} stores",
            "         */",
            "        stores: {}",
        );

        baseClass === 'component.Base' && addComma(classContent).push(
            "        /**",
            "         * @member {Object} _vdom",
            "         */",
            "        _vdom:",
            "        {}"
        );

        classContent.push(
            "    }",
            "}",
            ""
        );

        if (isSingleton) {
            classContent.push(
                `let instance = Neo.applyClassConfig(${file});`,
                "",
                "export default instance;"
            );
        } else {
            classContent.push(
                `Neo.applyClassConfig(${file});`,
                "",
                `export default ${file};`
            );
        }

        classContent.push(
            ""
        );

        return classContent.join(os.EOL);
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
}
