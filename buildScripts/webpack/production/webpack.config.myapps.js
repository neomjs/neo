const cwd         = process.cwd(),
      fs          = require('fs'),
      path        = require('path'),
      buildTarget = require('./buildTarget.json'),
      configPath  = path.resolve(cwd, 'buildScripts/myApps.json'),
      packageJson = require(path.resolve(cwd, 'package.json')),
      neoPath     = packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/',
      plugins     = [],
      webpack     = require('webpack');

let config;

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
    let apps      = env.apps.split(','),
        insideNeo = env.insideNeo == 'true',
        buildAll  = apps.includes('all'),
        choices   = [],
        basePath, i, indexInputPath, indexOutputPath, lAppName, treeLevel, workerBasePath;

    if (config.apps) {
        config.apps.forEach(key => {
            choices.push(key);
        });

        config.apps.forEach(key => {
            if (buildAll || choices.length < 2 || apps.includes(key)) {
                basePath       = '';
                workerBasePath = '';
                treeLevel      = key.split('.').length + 3;

                for (i=0; i < treeLevel; i++)  {
                    basePath += '../';

                    if (i > 1) {
                        workerBasePath += '../';
                    }
                }

                lAppName = key.toLowerCase();

                indexInputPath  = path.resolve(cwd, 'apps', lAppName, 'index.html');
                indexOutputPath = path.resolve(cwd, buildTarget.folder, 'apps', lAppName, 'index.html');



                console.log(basePath);
                console.log(workerBasePath);
                console.log(indexInputPath);
                console.log(indexOutputPath);

                /*plugins.push(new HtmlWebpackPlugin({
                    chunks  : [],
                    filename: indexPath,
                    template: value.indexPath ? path.resolve(cwd, value.indexPath) : path.resolve(neoPath, 'buildScripts/webpack/index.ejs'),
                    templateParameters: {
                        appPath          : value.output + 'app.mjs',
                        basePath,
                        bodyTag          : value.bodyTag || config.bodyTag,
                        environment      : 'dist/production',
                        mainPath         : workerBasePath + 'main.js',
                        mainThreadAddons : value.mainThreadAddons  || "'Stylesheet'",
                        renderCountDeltas: value.renderCountDeltas || false,
                        themes           : value.themes            || "'neo-theme-light', 'neo-theme-dark'",
                        title            : value.title,
                        useSharedWorkers : value.useSharedWorkers  || false,
                        workerBasePath
                    }
                }));*/
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
            chunkFilename: 'chunks/app/[id].js',
            filename     : 'appworker.js',
            path         : path.resolve(cwd, buildTarget.folder)
        }
    }
};
