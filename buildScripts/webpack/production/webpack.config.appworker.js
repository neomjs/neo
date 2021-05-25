const cwd               = process.cwd(),
      fs                = require('fs-extra'),
      path              = require('path'),
      buildTarget       = require('./buildTarget.json'),
      WebpackHookPlugin = require('webpack-hook-plugin'),
      configPath        = path.resolve(cwd, 'buildScripts/myApps.json'),
      packageJson       = require(path.resolve(cwd, 'package.json')),
      neoPath           = packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/',
      plugins           = [],
      regexLineBreak    = /(\r\n|\n|\r)/gm,
      regexTrimEnd      = /\s+$/gm,
      regexTrimStart    = /^\s+/gm,
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

function createStartingPoint(key, folder) {
    let basePath       = '',
        workerBasePath = '',
        treeLevel      = key.split('.').length + 3,
        content, i, inputPath, outputPath, lAppName;

        for (i=0; i < treeLevel; i++)  {
            basePath += '../';

            if (i > 1) {
                workerBasePath += '../';
            }
        }

        lAppName = folder === 'examples' ? key : key.toLowerCase();
        fs.mkdirpSync(path.resolve(cwd, buildTarget.folder, folder, lAppName));

        // neo-config.json
        inputPath  = path.resolve(cwd, folder, lAppName, 'neo-config.json');
        outputPath = path.resolve(cwd, buildTarget.folder, folder, lAppName, 'neo-config.json');

        content = require(inputPath);
        delete content.environment;

        Object.assign(content, {
            basePath      : basePath,
            mainPath      : '../main.js',
            workerBasePath: workerBasePath
        });

        fs.writeFileSync(outputPath, JSON.stringify(content));

        // index.html
        inputPath  = path.resolve(cwd, folder, lAppName, 'index.html');
        outputPath = path.resolve(cwd, buildTarget.folder, folder, lAppName, 'index.html');

        content = fs.readFileSync(inputPath).toString()
            .replace(regexTrimStart, '')
            .replace(regexTrimEnd, '')
            .replace(', ', ',')
            .replace(regexLineBreak, '');

        fs.writeFileSync(outputPath, content);
}

module.exports = env => {
    const examples  = [],
          insideNeo = env.insideNeo == 'true';

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

    if (config.apps) {
        config.apps.forEach(key => {
            createStartingPoint(key, 'apps');
        });
    }

    if (insideNeo && !excludeExamples) {
        parseFolder(path.join(cwd, 'examples'), 0, '');

        examples.forEach(key => {
            createStartingPoint(key.substr(1), 'examples');
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
