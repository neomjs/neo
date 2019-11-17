const inquirer         = require('inquirer'),
     path              = require('path'),
     HtmlWebpackPlugin = require('html-webpack-plugin'),
     NodeExternals     = require('webpack-node-externals'),
     config            = require(path.resolve(__dirname, '../../webpack/development/json/myApps.json')),
     entry             = {main: config.mainInput},
     plugins           = [];

let basePath, i, treeLevel, workerBasePath;

if (config.workers) {
    Object.entries(config.workers).forEach(([key, value]) => {
        entry[key] = value.input;
    });
}

let choices = [],
    inquirerAnswers;

if (config.apps) {
    Object.entries(config.apps).forEach(([key, value]) => {
        choices.push(key);
    });

    if (choices.length > 1) {
        let questions = [{
            type   : 'checkbox',
            name   : 'apps',
            message: 'Please choose which apps you want to build:',
            choices: choices
        }];

        let done = false;

        inquirer.prompt(questions).then(answers => {
            inquirerAnswers = answers;
            done            = true;
        });

        require('deasync').loopWhile(function(){return !done;});
    }

    Object.entries(config.apps).forEach(([key, value]) => {
        if (choices.length < 2 || inquirerAnswers.apps.includes(key)) {
            entry[key] = './buildScripts/webpack/entrypoints/' + value.input;

            basePath       = '';
            workerBasePath = '';
            treeLevel      = value.output.split('/').length;

            for (i=0; i < treeLevel; i++)  {
                basePath += '../';

                if (i > 1) {
                    workerBasePath += '../';
                }
            }

            if (key !== 'docs') {
                plugins.push(new HtmlWebpackPlugin({
                    chunks  : ['main'],
                    filename: path.resolve(__dirname, config.buildFolder) + value.output + 'index.html',
                    template: 'buildScripts/webpack/index.ejs',
                    templateParameters: {
                        appPath       : value.output + 'app.js',
                        bodyTag       : value.bodyTag || config.bodyTag,
                        basePath      : basePath,
                        environment   : config.environment,
                        title         : value.title,
                        workerBasePath: workerBasePath
                    }
                }));
            }
        }
    });
}

module.exports = {
    mode: 'development',

    // see: https://webpack.js.org/configuration/devtool/
    devtool: 'inline-source-map',
    //devtool: 'cheap-module-eval-source-map',

    entry    : entry,
    externals: [NodeExternals()], // in order to ignore all modules in node_modules folder
    plugins  : plugins,
    target   : 'node',            // in order to ignore built-in modules like path, fs, etc.

    output: {
        filename: (chunkData) => {
            let name = chunkData.chunk.name;

            if (name === 'main') {
                return config.mainOutput;
            } else if (config.workers.hasOwnProperty(name)) {
                return config.workers[name].output;
            } else if (config.apps.hasOwnProperty(name)) {
                if (choices.length < 2 || inquirerAnswers.apps.includes(name)) {
                    return config.apps[name].output + 'app.js';
                }
            }
        },
        path: path.resolve(__dirname, config.buildFolder)
    }
};