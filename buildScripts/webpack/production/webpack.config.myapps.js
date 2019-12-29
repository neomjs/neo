const fs                = require('fs'),
      inquirer          = require('inquirer'),
      path              = require('path'),
      HtmlWebpackPlugin = require('html-webpack-plugin'),
      NodeExternals     = require('webpack-node-externals'),
      processRoot       = process.cwd(),
      packageJson       = JSON.parse(fs.readFileSync(path.resolve(processRoot, 'package.json'), 'utf8')),
      neoPath           = packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/',
      config            = require(path.resolve(neoPath, 'buildScripts/webpack/production/json/myApps.json')),
      entry             = {main: path.resolve(neoPath, config.mainInput)},
      plugins           = [];

let basePath, i, indexPath, treeLevel, workerBasePath;

if (config.workers) {
    Object.entries(config.workers).forEach(([key, value]) => {
        entry[key] = path.resolve(neoPath, value.input);
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
            entry[key] = path.resolve(neoPath, 'buildScripts/webpack/entrypoints/' + value.input);

            basePath       = '';
            workerBasePath = '';
            treeLevel      = value.output.split('/').length;

            for (i=0; i < treeLevel; i++)  {
                basePath += '../';

                if (i > 1) {
                    workerBasePath += '../';
                }
            }

            indexPath = path.resolve(processRoot, config.buildFolder) + value.output + 'index.html';

            if (!fs.existsSync(indexPath)) {
                plugins.push(new HtmlWebpackPlugin({
                    chunks  : ['main'],
                    filename: indexPath,
                    template: path.resolve(neoPath, value.indexPath || 'buildScripts/webpack/index.ejs'),
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
    mode     : 'production',
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
        path: path.resolve(processRoot, config.buildFolder)
    }
};