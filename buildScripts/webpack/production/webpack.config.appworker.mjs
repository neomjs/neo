import fs           from 'fs-extra';
import path         from 'path';
import {spawnSync}  from 'child_process';
import {minifyHtml} from '../../util/minifyHtml.mjs';
import webpack      from 'webpack';

const
    cwd            = process.cwd(),
    cpOpts         = {env: process.env, cwd: cwd, stdio: 'inherit', shell: true},
    requireJson    = path => JSON.parse(fs.readFileSync((path))),
    packageJson    = requireJson(path.resolve(cwd, 'package.json')),
    neoPath        = packageJson.name.includes('neo.mjs') ? './' : './node_modules/neo.mjs/',
    buildTarget    = requireJson(path.resolve(neoPath, 'buildScripts/webpack/production/buildTarget.json')),
    filenameConfig = requireJson(path.resolve(neoPath, 'buildScripts/webpack/json/build.json')),
    plugins        = [],
    regexTopLevel  = /\.\.\//g;

let contextAdjusted = false,
    examplesPath;

if (!buildTarget.folder) {
    buildTarget.folder = 'dist/production';
}

export default async function(env) {
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

    const copyResources = resourcesPath => {
        let inputPath  = path.resolve(cwd, resourcesPath),
            outputPath = path.resolve(cwd, buildTarget.folder, resourcesPath),
            childProcess, content, filePath;

        if (fs.existsSync(inputPath)) {
            childProcess = spawnSync('node', [`${neoPath}/buildScripts/util/copyFolder.mjs -s ${inputPath} -t ${outputPath}`], cpOpts);
            childProcess.status && process.exit(childProcess.status);

            // Exception for devindex app: Do not deploy the data folder.
            if (resourcesPath.replace(/\\/g, '/').includes('apps/devindex/resources')) {
                fs.removeSync(path.join(outputPath, 'data'));
            }

            // Minify all json files inside the copied resources folder
            fs.readdirSync(outputPath, {recursive: true}).forEach(fileOrFolder => {
                if (fileOrFolder.endsWith('.json')) {
                    filePath = path.join(outputPath, fileOrFolder);
                    content  = requireJson(filePath);

                    fs.writeFileSync(filePath, JSON.stringify(content));
                }
            });
        }
    };

    const createStartingPoint = async (key, folder) => {
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

        // remotes-api.json
        if (content.remotesApiUrl) {
            inputPath  = path.resolve(cwd, folder, lAppName, content.remotesApiUrl);
            outputPath = path.resolve(cwd, buildTarget.folder, folder, lAppName, content.remotesApiUrl);
            content    = requireJson(inputPath);

            fs.writeFileSync(outputPath, JSON.stringify(content));
        }

        // index.html
        inputPath  = path.resolve(cwd, folder, lAppName, 'index.html');
        outputPath = path.resolve(cwd, buildTarget.folder, folder, lAppName, 'index.html');
        content    = await minifyHtml(fs.readFileSync(inputPath, 'utf-8'));

        fs.writeFileSync(outputPath, content)
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

    for (const key of apps) {
        copyResources(path.join('apps', key, '/resources'));
        await createStartingPoint(key.substr(1), 'apps');
    }

    if (fs.existsSync(path.join(cwd, 'docs/app'))) {
        await createStartingPoint('Docs', '');
    }

    examplesPath = path.join(cwd, 'examples');

    if (fs.existsSync(examplesPath)) {
        parseFolder(examples, examplesPath, 0, '');

        for (const key of examples) {
            copyResources(path.join('examples', key, '/resources'));
            await createStartingPoint(key.substr(1), 'examples');
        }
    }

    return {
        mode  : 'production',
        entry : {app: path.resolve(neoPath, './src/worker/App.mjs')},
        target: 'webworker',

        experiments: {
            outputModule: true
        },

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
            library      : {type: 'module'},
            path         : path.resolve(cwd, buildTarget.folder),
            publicPath   : 'auto'
        },

        module: {
            rules: [
                {
                    test: /\.mjs$/,
                    use: [{
                        loader: path.resolve(neoPath, 'buildScripts/webpack/loader/template-loader.mjs')
                    }]
                }
            ]
        }
    }
};
