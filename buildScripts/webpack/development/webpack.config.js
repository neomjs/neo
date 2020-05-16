const fs                     = require('fs-extra'),
      path                   = require('path'),
      { CleanWebpackPlugin } = require('clean-webpack-plugin'),
      HtmlWebpackPlugin      = require('html-webpack-plugin'),
      WebpackShellPlugin     = require('webpack-shell-plugin'),
      processRoot            = process.cwd(),
      packageJson            = JSON.parse(fs.readFileSync(path.resolve(processRoot, 'package.json'), 'utf8')),
      neoPath                = packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/',
      config                 = JSON.parse(fs.readFileSync(path.resolve(neoPath, 'buildScripts/webpack/development/build.json')), 'utf8'),
      entry                  = {},
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
            chunks  : [],
            filename: path.resolve(processRoot, config.buildFolder) + value.output + 'index.html',
            template: path.resolve(neoPath, value.indexPath || 'buildScripts/webpack/index.ejs'),
            templateParameters: {
                appPath         : value.output + 'app.js',
                bodyTag         : value.bodyTag || config.bodyTag,
                basePath,
                environment     : config.environment,
                mainPath        : workerBasePath + 'main.js',
                mainThreadAddons: value.mainThreadAddons || "'Stylesheet'",
                themes          : value.themes           || "'neo-theme-light', 'neo-theme-dark'",
                title           : value.title,
                useAmCharts     : value.hasOwnProperty('useAmCharts') ? value.useAmCharts : false,
                useMapboxGL     : value.hasOwnProperty('useMapboxGL') ? value.useMapboxGL : false,
                workerBasePath
            }
        }));
    });
}

module.exports = {
    mode: 'development',

    // see: https://webpack.js.org/configuration/devtool/
    devtool: 'inline-source-map',
    //devtool: 'cheap-module-eval-source-map',

    entry,
    target: 'webworker',

    plugins: [
        new CleanWebpackPlugin({
            cleanOnceBeforeBuildPatterns: ['**/*.js', '**/*.mjs', '!apps/**/*.js', '!**/*highlight.pack.js', '!main.js'],
            root                        : path.resolve(processRoot, config.buildFolder),
            verbose                     : true
        }),
        new WebpackShellPlugin({
            onBuildExit: ['node '+path.resolve(neoPath, 'buildScripts/copyFolder.js')+' -s '+path.resolve(neoPath, 'docs/resources')+' -t '+path.resolve(processRoot, config.buildFolder, 'docs/resources')]
        }),
        ...plugins
    ],

    output: {
        filename: (chunkData) => {
            let name = chunkData.chunk.name;

            if (config.workers.hasOwnProperty(name)) {
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