const fs                 = require('fs'),
      path               = require('path'),
      buildTarget        = require('./buildTarget.json'),
      HtmlWebpackPlugin  = require('html-webpack-plugin'),
      WebpackHookPlugin  = require('webpack-hook-plugin'),
      processRoot        = process.cwd(),
      configPath         = path.resolve(processRoot, 'buildScripts/myApps.json'),
      packageJson        = require(path.resolve(processRoot, 'package.json')),
      neoPath            = packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/',
      examplesConfig     = require(path.resolve(neoPath, 'buildScripts/webpack/json/build.json')),
      plugins            = [],
      webpack            = require('webpack');

let excludeExamples = false,
    config, i;

if (fs.existsSync(configPath)) {
    config          = require(configPath);
    excludeExamples = true;
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

function createHtmlWebpackPlugin(value) {
    let basePath       = '',
        workerBasePath = '',
        treeLevel      = value.output.split('/').length,
        indexPath;

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
            environment     : 'dist/production',
            mainPath        : workerBasePath + 'main.js',
            mainThreadAddons: value.mainThreadAddons || "'Stylesheet'",
            themes          : value.themes           || "'neo-theme-light', 'neo-theme-dark'",
            title           : value.title,
            useSharedWorkers: value.useSharedWorkers || false,
            workerBasePath
        }
    }));
}

function createHtmlWebpackPlugins(config) {
    let firstProperty;

    Object.entries(config).forEach(([key, value]) => {
        firstProperty = value[Object.keys(value)[0]];

        if (typeof firstProperty === 'object') {
            createHtmlWebpackPlugins(value);
        } else {
            createHtmlWebpackPlugin(value);
        }
    });
}

module.exports = env => {
    const insideNeo = env.insideNeo == 'true';

    if (config.apps) {
        Object.entries(config.apps).forEach(([key, value]) => {
            createHtmlWebpackPlugin(value);
        });
    }

    if (!excludeExamples && examplesConfig.examples) {
        createHtmlWebpackPlugins(examplesConfig.examples);
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
            new WebpackHookPlugin({
                onBuildEnd: ['node '+path.resolve(neoPath, 'buildScripts/copyFolder.js')+' -s '+path.resolve(neoPath, 'docs/resources')+' -t '+path.resolve(processRoot, buildTarget.folder, 'docs/resources')]
            }),
            ...plugins
        ],

        output: {
            chunkFilename: 'chunks/app/[id].js',
            filename     : 'appworker.js',
            path         : path.resolve(processRoot, buildTarget.folder)
        }
    }
};