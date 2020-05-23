const fs                = require('fs'),
      buildTarget       = require('./buildTarget.json'),
      path              = require('path'),
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
    const myAppsPath = path.resolve(neoPath, 'buildScripts/webpack/json/myApps.json');

    if (fs.existsSync(myAppsPath)) {
        config = require(myAppsPath);
    } else {
        config = require(path.resolve(neoPath, 'buildScripts/webpack/json/myApps.template.json'));
    }
}

if (!buildTarget.folder) {
    buildTarget.folder = 'dist/development';
}

module.exports = env => {console.log(env);
    const apps     = env.apps.split(','),
          buildAll = apps.includes('all'),
          choices  = [],
          entry    = {};

    if (config.apps) {
        Object.entries(config.apps).forEach(([key, value]) => {
            choices.push(key);
        });

        Object.entries(config.apps).forEach(([key, value]) => {
            if (buildAll || choices.length < 2 || apps.includes(key)) {
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
                        environment     : 'development',
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
        mode: 'development',

        // see: https://webpack.js.org/configuration/devtool/
        devtool: 'inline-source-map',
        //devtool: 'cheap-module-eval-source-map',

        entry,
        plugins,
        target: 'webworker',

        output: {
            filename: (chunkData) => {
                let name = chunkData.chunk.name;

                if (config.apps.hasOwnProperty(name)) {
                    return config.apps[name].output + 'app.js';
                }
            },
            path: path.resolve(processRoot, buildTarget.folder)
        }
    }
};