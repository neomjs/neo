import fs      from 'fs-extra';
import path    from 'path';
import webpack from 'webpack';

const cwd                   = process.cwd(),
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

let contextAdjusted = false,
    examplesPath;

if (!buildTarget.folder) {
    buildTarget.folder = 'dist/production';
}

export default env => {
    let apps      = [],
        examples  = [],
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
            basePath,
            mainPath: '../main.js',
            workerBasePath
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

    const parseFolder = (apps, folderPath, index, relativePath) => {
        let itemPath;

        fs.readdirSync(folderPath).forEach(itemName => {
            itemPath = path.join(folderPath, itemName);

            if (isFile(itemPath)) {
                if (itemName === 'app.mjs') {
                    apps.push(relativePath);
                }
            } else {
                parseFolder(apps, itemPath, index + 1, relativePath + `/${itemName}`);
            }
        });
    };

    parseFolder(apps, path.join(cwd, 'apps'), 0, '');

    apps.forEach(key => {
        createStartingPoint(key.substr(1), 'apps');
    });

    createStartingPoint('Docs', '');

    examplesPath = path.join(cwd, 'examples');

    if (fs.existsSync(examplesPath)) {
        parseFolder(examples, examplesPath, 0, '');

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
                let con = context.context;

                if (!insideNeo && !contextAdjusted && (con.includes('/src/worker') || con.includes('\\src\\worker'))) {
                    context.request = path.join('../../', context.request);
                    contextAdjusted = true;
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
