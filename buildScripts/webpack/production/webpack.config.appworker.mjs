import fs                from 'fs-extra';
import path              from 'path';
import webpack           from 'webpack';
import WebpackHookPlugin from 'webpack-hook-plugin';

const cwd                   = process.cwd(),
      configPath            = path.resolve(cwd, 'buildScripts/myApps.json'),
      requireJson           = path => JSON.parse(fs.readFileSync((path))),
      packageJson           = requireJson(path.resolve(cwd, 'package.json')),
      neoPath               = packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/',
      buildTarget           = requireJson(path.resolve(neoPath, 'buildScripts/webpack/production/buildTarget.json')),
      filenameConfig        = requireJson(path.resolve(neoPath, 'buildScripts/webpack/json/build.json')),
      plugins               = [],
      regexIndexNodeModules = /node_modules/g,
      regexLineBreak        = /(\r\n|\n|\r)/gm,
      regexTopLevel         = /\.\.\//g,
      regexTrimEnd          = /\s+$/gm,
      regexTrimStart        = /^\s+/gm;

let config, examplesPath;

if (fs.existsSync(configPath)) {
    config = requireJson(configPath);
} else {
    const myAppsPath = path.resolve(neoPath, 'buildScripts/webpack/json/myApps.json');

    if (fs.existsSync(myAppsPath)) {
        config = requireJson(myAppsPath);
    } else {
        config = requireJson(path.resolve(neoPath, 'buildScripts/webpack/json/myApps.template.json'));
    }
}

if (!buildTarget.folder) {
    buildTarget.folder = 'dist/production';
}

export default env => {
    let examples  = [],
        insideNeo = env.insideNeo == 'true',
        content, inputPath, outputPath;

    // MicroLoader.mjs
    inputPath  = path.resolve(cwd, 'src/MicroLoader.mjs');
    outputPath = path.resolve(cwd, buildTarget.folder, 'src/MicroLoader.mjs');

    content = fs.readFileSync(inputPath).toString().replace(/\s/gm, '');
    fs.mkdirpSync(path.resolve(cwd, buildTarget.folder, 'src/'));
    fs.writeFileSync(outputPath, content);

    const createStartingPoint = (key, folder) => {
        let basePath       = '',
            workerBasePath = '',
            treeLevel      = key.replace('.', '/').split('/').length + (key === 'Docs' ? 2 : 3),
            i, lAppName;

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

        content = requireJson(inputPath);
        delete content.environment;

        content.appPath = content.appPath.replace(regexTopLevel, '');

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
            .replace(regexIndexNodeModules, '../../node_modules')
            .replace(regexTrimStart, '')
            .replace(regexTrimEnd, '')
            .replace(', ', ',')
            .replace(regexLineBreak, '');

        fs.writeFileSync(outputPath, content);
    };

    const isFile = fileName => fs.lstatSync(fileName).isFile();

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

    config.apps?.forEach(key => {
        createStartingPoint(key, key === 'Docs' ? '' : 'apps');
    });

    examplesPath = path.join(cwd, 'examples');

    if (fs.existsSync(examplesPath)) {
        parseFolder(examplesPath, 0, '');

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
                onBuildEnd: ['node '+path.resolve(neoPath, 'buildScripts/copyFolder.mjs')+' -s '+path.resolve(neoPath, 'docs/resources')+' -t '+path.resolve(cwd, buildTarget.folder, 'docs/resources')]
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
