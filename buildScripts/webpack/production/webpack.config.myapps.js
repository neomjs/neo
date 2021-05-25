const cwd            = process.cwd(),
      fs             = require('fs-extra'),
      path           = require('path'),
      buildTarget    = require('./buildTarget.json'),
      configPath     = path.resolve(cwd, 'buildScripts/myApps.json'),
      packageJson    = require(path.resolve(cwd, 'package.json')),
      neoPath        = packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/',
      plugins        = [],
      regexLineBreak = /(\r\n|\n|\r)/gm,
      regexTrimEnd   = /\s+$/gm,
      regexTrimStart = /^\s+/gm,
      webpack        = require('webpack');

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
        basePath, content, i, inputPath, outputPath, lAppName, treeLevel, workerBasePath;

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

                // neo-config.json
                inputPath  = path.resolve(cwd, 'apps', lAppName, 'neo-config.json');
                outputPath = path.resolve(cwd, buildTarget.folder, 'apps', lAppName, 'neo-config.json');

                content = require(inputPath);

                Object.assign(content, {
                    basePath      : basePath,
                    workerBasePath: workerBasePath
                });

                fs.writeFileSync(outputPath, JSON.stringify(content));

                // index.html
                inputPath  = path.resolve(cwd, 'apps', lAppName, 'index.html');
                outputPath = path.resolve(cwd, buildTarget.folder, 'apps', lAppName, 'index.html');

                content = fs.readFileSync(inputPath).toString()
                    .replace(regexTrimStart, '')
                    .replace(regexTrimEnd, '')
                    .replace(', ', ',')
                    .replace(regexLineBreak, '');

                fs.writeFileSync(outputPath, content);

                //fs.copySync(indexInputPath, indexOutputPath);
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
