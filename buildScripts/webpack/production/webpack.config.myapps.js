const fs                = require('fs'),
      path              = require('path'),
      buildTarget       = require('./buildTarget.json'),
      HtmlWebpackPlugin = require('html-webpack-plugin'),
      processRoot       = process.cwd(),
      configPath        = path.resolve(processRoot, 'buildScripts/myApps.json'),
      packageJson       = require(path.resolve(processRoot, 'package.json')),
      neoPath           = packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/',
      plugins           = [],
      webpack           = require('webpack');

let basePath, config, i, indexPath, treeLevel, workerBasePath;

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
    buildTarget.folder = 'dist/production';
}

module.exports = env => {
    const apps      = env.apps.split(','),
          insideNeo = env.insideNeo == 'true',
          buildAll  = apps.includes('all'),
          choices   = [];

    if (config.apps) {
        Object.keys(config.apps).forEach(key => {
            choices.push(key);
        });

        Object.entries(config.apps).forEach(([key, value]) => {
            if (buildAll || choices.length < 2 || apps.includes(key)) {
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
                        appPath         : value.output + 'app.mjs',
                        basePath,
                        bodyTag         : value.bodyTag || config.bodyTag,
                        environment     : 'production',
                        mainPath        : workerBasePath + 'main.js',
                        mainThreadAddons: value.mainThreadAddons || "'Stylesheet'",
                        themes          : value.themes           || "'neo-theme-light', 'neo-theme-dark'",
                        title           : value.title,
                        useSharedWorkers: value.useSharedWorkers || false,
                        workerBasePath
                    }
                }));
            }
        });
    }

    return {
        mode  : 'production',
        entry : {app: path.resolve(neoPath, './src/worker/App.mjs')},
        target: 'webworker',

        plugins: [
            new webpack.ContextReplacementPlugin(/.*/, context => {
                if (!insideNeo && context.context.includes('/src/worker')) {
                    context.request = '../../' + context.request;
                }
            }),
            ...plugins
        ],

        output: {
            chunkFilename: 'chunks/[id].js', // would default to '[id].js': src/main/lib/AmCharts => 1.js
            filename     : 'appworker.js',
            path         : path.resolve(processRoot, buildTarget.folder)
        }
    }
};