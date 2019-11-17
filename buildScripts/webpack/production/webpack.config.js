const fs                     = require('fs'),
      path                   = require('path'),
      { CleanWebpackPlugin } = require('clean-webpack-plugin'),
      HtmlWebpackPlugin      = require('html-webpack-plugin'),
      NodeExternals          = require('webpack-node-externals'),
      config                 = JSON.parse(fs.readFileSync('./buildScripts/webpack/production/build.json')),
      entry                  = {main: config.mainInput},
      plugins                = [];

let basePath, i, treeLevel, workerBasePath;

if (config.workers) {
    Object.entries(config.workers).forEach(([key, value]) => {
        entry[key] = value.input;
    });
}

if (config.apps) {
    Object.entries(config.apps).forEach(([key, value]) => {
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
    });
}

module.exports = {
    mode     : 'production',
    entry    : entry,
    externals: [NodeExternals()], // in order to ignore all modules in node_modules folder
    target   : 'node',            // in order to ignore built-in modules like path, fs, etc.

    plugins: [
        new CleanWebpackPlugin({
            cleanOnceBeforeBuildPatterns: ['**/*.js', '**/*.mjs', '!apps/**/*.js', '!**/*highlight.pack.js'],
            root                        : path.resolve(__dirname, config.buildFolder),
            verbose                     : true
        }),
        ...plugins
    ],

    output: {
        filename: (chunkData) => {
            let name = chunkData.chunk.name;

            if (name === 'main') {
                return config.mainOutput;
            } else if (config.workers.hasOwnProperty(name)) {
                return config.workers[name].output;
            } else if (config.apps.hasOwnProperty(name)) {
                return config.apps[name].output + 'app.js';
            }
        },
        path: path.resolve(__dirname, config.buildFolder)
    }/*,

    optimization: {
        splitChunks: {
            chunks: 'all',

            cacheGroups: {
                collection: {
                    test (chunks) {
                        return true;
                    }
                }
            }
        }
    }*/
};