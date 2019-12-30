const fs                     = require('fs'),
      path                   = require('path'),
      { CleanWebpackPlugin } = require('clean-webpack-plugin'),
      HtmlWebpackPlugin      = require('html-webpack-plugin'),
      NodeExternals          = require('webpack-node-externals'),
      processRoot            = process.cwd(),
      packageJson            = JSON.parse(fs.readFileSync(path.resolve(processRoot, 'package.json'), 'utf8')),
      neoPath                = packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/',
      config                 = JSON.parse(fs.readFileSync(path.resolve(neoPath, 'buildScripts/webpack/development/build.json')), 'utf8'),
      entry                  = {main: path.resolve(neoPath, config.mainInput)},
      plugins                = [];

let basePath, i, treeLevel, workerBasePath;

if (config.workers) {
    Object.entries(config.workers).forEach(([key, value]) => {
        entry[key] = path.resolve(neoPath, value.input);
    });
}

if (config.examples) {
    Object.entries(config.examples).forEach(([key, value]) => {
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

        plugins.push(new HtmlWebpackPlugin({
            chunks  : ['main'],
            filename: path.resolve(processRoot, config.buildFolder) + value.output + 'index.html',
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
    });
}

module.exports = {
    mode: 'development',

    // see: https://webpack.js.org/configuration/devtool/
    devtool: 'inline-source-map',
    //devtool: 'cheap-module-eval-source-map',

    entry    : entry,
    externals: [NodeExternals()], // in order to ignore all modules in node_modules folder
    target   : 'node',            // in order to ignore built-in modules like path, fs, etc.

    plugins: [
        new CleanWebpackPlugin({
            cleanOnceBeforeBuildPatterns: ['**/*.js', '**/*.mjs', '!apps/**/*.js', '!**/*highlight.pack.js'],
            root                        : path.resolve(processRoot, config.buildFolder),
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
            } else if (config.examples.hasOwnProperty(name)) {
                return config.examples[name].output + 'app.js';
            }
        },
        path: path.resolve(processRoot, config.buildFolder)
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