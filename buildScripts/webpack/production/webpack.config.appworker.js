const cwd               = process.cwd(),
      fs                = require('fs-extra'),
      path              = require('path'),
      buildTarget       = require('./buildTarget.json'),
      WebpackHookPlugin = require('webpack-hook-plugin'),
      configPath        = path.resolve(cwd, 'buildScripts/myApps.json'),
      packageJson       = require(path.resolve(cwd, 'package.json')),
      neoPath           = packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/',
      examplesConfig    = require(path.resolve(neoPath, 'buildScripts/webpack/json/build.json')),
      plugins           = [],
      webpack           = require('webpack');

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

    indexPath = path.resolve(cwd, buildTarget.folder) + value.output + 'index.html';
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
    const examples  = [],
          insideNeo = env.insideNeo == 'true';

    if (config.apps) {
        config.apps.forEach(key => {
            //console.log(key);
        });
    }

    const isFile = fileName => {
        return fs.lstatSync(fileName).isFile()
    };

    const parseFolder = (folderPath, index, relativePath) => {
        let itemPath;

        fs.readdirSync(folderPath).forEach(itemName => {
            itemPath = path.join(folderPath, itemName);

            if (isFile(itemPath)) {
                if (itemName === 'app.mjs') {
                    examples.push(relativePath);
                }
            } else {
                parseFolder(itemPath, index + 1, relativePath + `/${itemName}`);
            }
        });
    };

    parseFolder(path.join(cwd, 'examples'), 0, '');
    console.log(examples);

    if (!excludeExamples && examplesConfig.examples) {
        //createHtmlWebpackPlugins(examplesConfig.examples);
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
                onBuildEnd: ['node '+path.resolve(neoPath, 'buildScripts/copyFolder.js')+' -s '+path.resolve(neoPath, 'docs/resources')+' -t '+path.resolve(cwd, buildTarget.folder, 'docs/resources')]
            }),
            ...plugins
        ],

        output: {
            chunkFilename: 'chunks/app/[id].js',
            filename     : 'appworker.js',
            path         : path.resolve(cwd, buildTarget.folder)
        }
    }
};
