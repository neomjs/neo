const fs       = require('fs'),
      inquirer = require('inquirer'),
      path     = require('path');

let questions = [{
    type   : 'input',
    name   : 'appName',
    message: 'Please choose a name for your neo app:',
    default: 'MyApp'
}, {
    type   : 'list',
    name   : 'theme',
    message: 'Please choose a theme for your neo app:',
    choices: ['neo-theme-dark', 'neo-theme-light', 'both'],
    default: 'both'
}];

console.log('Welcome to the neo app generator!');

inquirer.prompt(questions).then(answers => {
    const appName  = answers['appName'],
          lAppName = appName.toLowerCase(),
          appPath  = 'apps/' + lAppName + '/',
          dir      = '../apps/' + lAppName,
          folder   = path.resolve(__dirname, dir);

    fs.mkdir(folder, { recursive: true }, (err) => {
        if (err) {
            throw err;
        }

        const appContent = [
            "import MainContainer from './MainContainer.mjs';",
            "",
            "Neo.onStart = function() {",
            "    Neo.app({",
            "        appPath : '" + appPath + "',",
            "        mainView: MainContainer,",
            "        name    : '" + appName + "'",
            "    });",
            "};"
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
            "            appPath       : '" + appPath + "app.mjs',",
            "            basePath      : '../../',",
            "            environment   : 'development',",
            "            isExperimental: true",
            "        });",
            "    </script>",
            "",
            '    <script src="../../src/Main.mjs" type="module"></script>',
            "</body>",
            "</html>",
        ];

        if (answers['theme'] !== 'both') {
            console.log('add theme');
            indexContent[15] += ',';
            const themeContent = "            themes        : ['" + answers['theme'] + "']";
            indexContent.splice(16, 0, themeContent);
        }

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

        let appDevJsonPath = path.resolve(__dirname, '../buildScripts/webpack/development/json/myApps.json'),
            appDevJson;

        if (fs.existsSync(appDevJsonPath)) {
            appDevJson = require(appDevJsonPath);
        } else {
            appDevJson = require(path.resolve(__dirname, '../buildScripts/webpack/development/json/myApps.template.json'));
        }

        appDevJson.apps[appName] = {
            input : 'myApps/' + appName + '.mjs',
            output: '/' + appPath,
            title : appName
        };

        fs.writeFileSync(appDevJsonPath, JSON.stringify(appDevJson));

        let appJsonProdPath = path.resolve(__dirname, '../buildScripts/webpack/production/json/myApps.json'),
            appProdJson;

        if (fs.existsSync(appJsonProdPath)) {
            appProdJson = require(appJsonProdPath);
        } else {
            appProdJson = require(path.resolve(__dirname, '../buildScripts/webpack/production/json/myApps.template.json'));
        }

        appProdJson.apps[appName] = {
            input : 'myApps/' + appName + '.mjs',
            output: '/' + appPath,
            title : appName
        };

        fs.writeFileSync(appJsonProdPath, JSON.stringify(appProdJson));

        const entryPoint = [
            "import '../App.mjs';",
            "import '../../../../" + appPath + "app.mjs';"
        ].join('\n');

        fs.writeFileSync(path.resolve(__dirname, '../buildScripts/webpack/entrypoints/myApps/' + appName + '.mjs'), entryPoint);
    });
});