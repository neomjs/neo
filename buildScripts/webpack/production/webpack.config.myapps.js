const fs                = require('fs'),
      inquirer          = require('inquirer'),
      path              = require('path'),
      buildTarget       = require('./buildTarget.json'),
      HtmlWebpackPlugin = require('html-webpack-plugin'),
      processRoot       = process.cwd(),
      configPath        = path.resolve(processRoot, 'buildScripts/myApps.json'),
      packageJson       = require(path.resolve(processRoot, 'package.json')),
      neoPath           = packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/',
      plugins           = [];

let basePath, config, entryPath, i, indexPath, treeLevel, workerBasePath;

if (fs.existsSync(configPath)) {
    config = require(configPath);
} else {
    const myAppsPath = path.resolve(neoPath, 'buildScripts/webpack/production/json/myApps.json');

    if (fs.existsSync(myAppsPath)) {
        config = require(myAppsPath);
    } else {
        config = require(path.resolve(neoPath, 'buildScripts/webpack/production/json/myApps.template.json'));
    }
}

if (!buildTarget.folder) {
    buildTarget.folder = 'dist/production';
}

module.exports = env => {
    let buildAll = env && env.build_all,
        choices  = [],
        entry    = {},
        inquirerAnswers;

    if (config.apps) {
        Object.entries(config.apps).forEach(([key, value]) => {
            choices.push(key);
        });

        if (!buildAll && choices.length > 1) {
            let questions = [{
                type   : 'checkbox',
                name   : 'apps',
                message: 'Please choose which apps you want to build:',
                choices
            }];

            let done = false;

            inquirer.prompt(questions).then(answers => {
                inquirerAnswers = answers;
                done            = true;
            });

            require('deasync').loopWhile(function(){return !done;});
        }

        Object.entries(config.apps).forEach(([key, value]) => {
            if (buildAll || choices.length < 2 || inquirerAnswers.apps.includes(key)) {
                entryPath = path.resolve(processRoot, value.input);

                if (fs.existsSync(entryPath)) {
                    entry[key] = entryPath;
                } else {
                    entry[key] = path.resolve(neoPath, 'buildScripts/webpack/entrypoints/' + value.input);
                }

                basePath       = '';
                workerBasePath = '';
                treeLevel      = value.output.split('/').length;

                for (i=0; i < treeLevel; i++)  {
                    basePath += '../';

                    if (i > 1) {
                        workerBasePath += '../';
                    }
                }

                indexPath = path.resolve(processRoot, buildTarget.folder) + value.output + 'index.html';

                plugins.push(new HtmlWebpackPlugin({
                    chunks  : [],
                    filename: indexPath,
                    template: value.indexPath ? path.resolve(processRoot, value.indexPath) : path.resolve(neoPath, 'buildScripts/webpack/index.ejs'),
                    templateParameters: {
                        appPath         : value.output + 'app.js',
                        basePath,
                        bodyTag         : value.bodyTag || config.bodyTag,
                        environment     : 'production',
                        mainPath        : workerBasePath + 'main.js',
                        mainThreadAddons: value.mainThreadAddons || "'Stylesheet'",
                        themes          : value.themes           || "'neo-theme-light', 'neo-theme-dark'",
                        title           : value.title,
                        workerBasePath
                    }
                }));
            }
        });
    }

    return {
        mode  : 'production',
        entry,
        plugins,
        target: 'webworker',

        output: {
            chunkFilename: '[name].js', // would default to '[id].js': src/main/lib/AmCharts => 1.js

            filename: chunkData => {
                let name = chunkData.chunk.name;

                if (config.apps.hasOwnProperty(name)) {
                    if (buildAll || choices.length < 2 || inquirerAnswers.apps.includes(name)) {
                        return config.apps[name].output + 'app.js';
                    }
                }
            },
            path: path.resolve(processRoot, buildTarget.folder)
        }
    }
};