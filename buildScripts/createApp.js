const chalk       = require('chalk'),
      { program } = require('commander'),
      cp          = require('child_process'),
      envinfo     = require('envinfo'),
      fs          = require('fs'),
      inquirer    = require('inquirer'),
      path        = require('path'),
      packageJson = require(path.resolve(process.cwd(), 'package.json')),
      neoPath     = packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/',
      programName = `${packageJson.name} create-app`,
      questions   = [];

program
    .name(programName)
    .version(packageJson.version)
    .option('-i, --info',                    'print environment debug info')
    .option('-a, --appName <name>')
    .option('-m, --mainThreadAddons <name>', 'Comma separated list of AmCharts, AnalyticsByGoogle, HighlightJS, LocalStorage, MapboxGL, Markdown, Siesta, Stylesheet\n Defaults to Stylesheet')
    .option('-t, --themes <name>',           '"all", "dark", "light"')
    .option('-u, --useSharedWorkers <name>', '"yes", "no"')
    .allowUnknownOption()
    .on('--help', () => {
        console.log('\nIn case you have any issues, please create a ticket here:');
        console.log(chalk.cyan(packageJson.bugs.url));
    })
    .parse(process.argv);

if (program.info) {
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

if (program.mainThreadAddons) {
    program.mainThreadAddons = program.mainThreadAddons.split(',');
}

if (!program.appName) {
    questions.push({
        type   : 'input',
        name   : 'appName',
        message: 'Please choose a name for your neo app:',
        default: 'MyApp'
    });
}

if (!program.themes) {
    questions.push({
        type   : 'list',
        name   : 'themes',
        message: 'Please choose a theme for your neo app:',
        choices: ['neo-theme-dark', 'neo-theme-light', 'both'],
        default: 'both'
    });
}

if (!program.mainThreadAddons) {
    questions.push({
        type   : 'checkbox',
        name   : 'mainThreadAddons',
        message: 'Please choose your main thread addons:',
        choices: ['AmCharts', 'AnalyticsByGoogle', 'HighlightJS', 'LocalStorage', 'MapboxGL', 'Markdown', 'Siesta', 'Stylesheet'],
        default: ['Stylesheet']
    });
}

if (!program.useSharedWorkers) {
    questions.push({
        type   : 'list',
        name   : 'useSharedWorkers',
        message: 'Do you want to use SharedWorkers? Pick yes for multiple main threads (Browser Windows):',
        choices: ['yes', 'no'],
        default: 'no'
    });
}

inquirer.prompt(questions).then(answers => {
    const appName          = answers.appName          || program['appName'],
          mainThreadAddons = answers.mainThreadAddons || program['mainThreadAddons'],
          useSharedWorkers = answers.useSharedWorkers || program['useSharedWorkers'],
          lAppName         = appName.toLowerCase(),
          appPath          = 'apps/' + lAppName + '/',
          dir              = '../apps/' + lAppName,
          folder           = path.resolve(__dirname, dir),
          startDate        = new Date();

    let themes = answers.themes || program['themes'];

    if (!Array.isArray(themes)) {
        themes = [themes];
    }

    if (themes.length > 0 && !mainThreadAddons.includes('Stylesheet')) {
        console.error('ERROR! The Stylesheet mainThreadAddon is mandatory in case you are using themes');
        console.log('Exiting with error.');
        process.exit(1);
    }

    fs.mkdir(folder, { recursive: true }, (err) => {
        if (err) {
            throw err;
        }

        const appContent = [
            "import MainContainer from './MainContainer.mjs';",
            "",
            "const onStart = () => Neo.app({",
            "    appPath : '" + appPath + "',",
            "    mainView: MainContainer,",
            "    name    : '" + appName + "'",
            "});",
            "",
            "export {onStart as onStart};"
        ].join('\n');

        fs.writeFileSync(folder + '/app.mjs', appContent);

        const indexContent = [
            "<!DOCTYPE HTML>",
            "<html>",
            "<head>",
            '    <meta name="viewport" content="width=device-width, initial-scale=1">',
            '    <meta charset="UTF-8">',
            "    <title>" + appName + "</title>",
            "</head>",
            "<body>",
            "    <script>",
            "        Neo = self.Neo || {}; Neo.config = Neo.config || {};",
            "",
            "        Object.assign(Neo.config, {",
            "            appPath         : '" + appPath + "app.mjs',",
            "            basePath        : '../../',",
            "            environment     : 'development',",
        ];

        if (!(mainThreadAddons.includes('Stylesheet') && mainThreadAddons.length === 1)) {
            indexContent[indexContent.length -1] += ',';
            indexContent.push("            mainThreadAddons: [" + mainThreadAddons.map(e => "'" + e +"'").join(', ') + "]");
        }

        if (!themes.includes('both')) {
            indexContent[indexContent.length -1] += ',';
            indexContent.push("            themes          : [" + themes.map(e => "'" + e +"'").join(', ') + "]");
        }

        if (useSharedWorkers !== 'no') {
            indexContent[indexContent.length -1] += ',';
            indexContent.push("            useSharedWorkers: true");
        }

        indexContent.push(
            "        });",
            "    </script>",
            "",
            '    <script src="../../src/Main.mjs" type="module"></script>',
            "</body>",
            "</html>",
        );

        fs.writeFileSync(folder + '/index.html', indexContent.join('\n'));

        const mainContainerContent = [
            "import {default as Component}    from '../../src/component/Base.mjs';",
            "import {default as TabContainer} from '../../src/tab/Container.mjs';",
            "import Viewport                  from '../../src/container/Viewport.mjs';",
            "",
            "/**",
            " * @class " + appName + ".MainContainer",
            " * @extends Neo.container.Viewport",
            " */",
            "class MainContainer extends Viewport {",
            "    static getConfig() {return {",
            "        className: '" + appName + ".MainContainer',",
            "        ntype    : 'main-container',",
            "",
            "        autoMount: true,",
            "        layout   : {ntype: 'fit'},",
            "",
            "        items: [{",
            "            module: TabContainer,",
            "            height: 300,",
            "            width : 500,",
            "            style : {flex: 'none', margin: '20px'},",
            "",
            "            itemDefaults: {",
            "                module: Component,",
            "                cls   : ['neo-examples-tab-component'],",
            "                style : {padding: '20px'},",
            "            },",
            "",
            "            items: [{",
            "                tabButtonConfig: {",
            "                    iconCls: 'fa fa-home',",
            "                    text   : 'Tab 1'",
            "                },",
            "                vdom: {innerHTML: 'Welcome to your new Neo App.'}",
            "            }, {",
            "                tabButtonConfig: {",
            "                    iconCls: 'fa fa-play-circle',",
            "                    text   : 'Tab 2'",
            "                },",
            "                vdom: {innerHTML: 'Have fun creating something awesome!'}",
            "            }]",
            "        }]",
            "    }}",
            "}",
            "",
            "Neo.applyClassConfig(MainContainer);",
            "",
            "export {MainContainer as default};"
        ].join('\n');

        fs.writeFileSync(folder + '/MainContainer.mjs', mainContainerContent);

        let appJsonPath = path.resolve(__dirname, '../buildScripts/webpack/json/myApps.json'),
            appJson;

        if (fs.existsSync(appJsonPath)) {
            appJson = require(appJsonPath);
        } else {
            appJson = require(path.resolve(__dirname, '../buildScripts/webpack/json/myApps.template.json'));
        }

        appJson.apps[appName] = {
            input : `./${appPath}app.mjs`,
            output: `/${appPath}`,
            title : appName
        };

        if (!(mainThreadAddons.includes('Stylesheet') && mainThreadAddons.length === 1)) {
            appJson.apps[appName].mainThreadAddons = mainThreadAddons.map(e => "'" + e + "'").join(', ');
        }

        if (!themes.includes('both')) {
            appJson.apps[appName].themes = themes.map(e => "'" + e + "'").join(', ');
        }

        if (useSharedWorkers !== 'no') {
            appJson.apps[appName].useSharedWorkers = true;
        }

        fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 4));

        if (mainThreadAddons.includes('HighlightJS')) {
            cp.spawnSync('node', [
                './buildScripts/copyFolder.js',
                '-s',
                path.resolve(neoPath, 'docs/resources'),
                '-t',
                path.resolve(folder, 'resources'),
            ], { env: process.env, cwd: process.cwd(), stdio: 'inherit' });
        }

        const processTime = (Math.round((new Date - startDate) * 100) / 100000).toFixed(2);
        console.log(`\nTotal time for ${programName}: ${processTime}s`);

        process.exit();
    });
});