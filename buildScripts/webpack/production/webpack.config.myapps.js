const cwd            = process.cwd(),
      fs             = require('fs-extra'),
      path           = require('path'),
      buildTarget    = require('./buildTarget.json'),
      configPath     = path.resolve(cwd, 'buildScripts/myApps.json'),
      packageJson    = require(path.resolve(cwd, 'package.json')),
      neoPath        = packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/',
      filenameConfig = require(path.resolve(neoPath, 'buildScripts/webpack/json/build.json')),
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

let index = config.apps.indexOf('Docs');

if (index > -1) {
    config.apps.splice(index, 1);
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

    // MicroLoader.mjs
    inputPath  = path.resolve(cwd, 'src/MicroLoader.mjs');
    outputPath = path.resolve(cwd, buildTarget.folder, 'src/MicroLoader.mjs');

    content = fs.readFileSync(inputPath).toString().replace(/\s/gm, '');
    fs.mkdirpSync(path.resolve(cwd, buildTarget.folder, 'src/'));
    fs.writeFileSync(outputPath, content);



    if (config.apps) {
        config.apps.forEach(key => {
            choices.push(key);
        });

        config.apps.forEach(key => {
            if (buildAll || choices.length < 2 || apps.includes(key)) {
                basePath       = '';
                workerBasePath = '';
                treeLevel      = key.replace('.', '/').split('/').length + 3;

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
                delete content.environment;

                Object.assign(content, {
                    basePath      : basePath,
                    mainPath      : '../main.js',
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
            filename     : filenameConfig.workers.app.output,
            path         : path.resolve(cwd, buildTarget.folder)
        }
    }
};
