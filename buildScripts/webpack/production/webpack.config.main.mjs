import fs                from 'fs-extra';
import os                from 'os';
import path              from 'path';
import webpack           from 'webpack';
import WebpackHookPlugin from 'webpack-hook-plugin';

const cwd            = process.cwd(),
      requireJson    = path => JSON.parse(fs.readFileSync((path))),
      packageJson    = requireJson(path.resolve(cwd, 'package.json')),
      insideNeo      = packageJson.name.includes('neo.mjs'),
      neoPath        = insideNeo ? './' : './node_modules/neo.mjs/',
      buildTarget    = requireJson(path.resolve(neoPath, 'buildScripts/webpack/production/buildTarget.json')),
      filenameConfig = requireJson(path.resolve(neoPath, 'buildScripts/webpack/json/build.json')),
      entry          = {main: path.resolve(neoPath, filenameConfig.mainInput)},
      copyFolder     = path.resolve(neoPath, 'buildScripts/util/copyFolder.mjs'),
      defConfigFrom  = path.resolve(neoPath, 'src/DefaultConfig.mjs'),
      defConfigTo    = path.resolve(cwd, buildTarget.folder, 'DefaultConfig.mjs'),
      faFrom         = path.resolve(cwd, 'node_modules/@fortawesome/fontawesome-free'),
      faTo           = path.resolve(cwd, buildTarget.folder, 'resources/fontawesome-free'),
      minifyFile     = path.resolve(neoPath, 'buildScripts/util/minifyFile.mjs'),
      nodeCmd        = os.platform().startsWith('win') ? 'node.exe' : 'node',
      plugins        = [];

let contextAdjusted = false;

if (!insideNeo) {
    let resourcesPath = path.resolve(cwd, 'resources'),
        itemPath, target;

    fs.readdirSync(resourcesPath).forEach(itemName => {
        itemPath = path.resolve(resourcesPath, itemName);

        if (!fs.lstatSync(itemPath).isFile() && itemName !== 'scss') {
            target = path.resolve(cwd, buildTarget.folder, 'resources', itemName);

            fs.mkdirpSync(target);
            fs.copySync(path.join(resourcesPath, itemName), target);
        }
    });
}

export default {
    mode  : 'production',
    entry,
    target: 'web',

    experiments: {
        outputModule: true
    },

    externals: {
        './DefaultConfig.mjs': './DefaultConfig.mjs'
    },

    externalsType: 'module',

    plugins: [
        // Only for the non workspace based build scope, we have to ignore workspace related addons.
        // This might be a fit for webpack.ContextExclusionPlugin, but I did not get it working.
        new webpack.ContextReplacementPlugin(/.*/, context => {
            if (insideNeo && !contextAdjusted && path.join(context.request) === path.join('../../../src/main/addon')) {
                let req = context.request.split(path.sep);
                req.splice(0, 2);

                context.request = req.join(path.sep);
                contextAdjusted = true;
            }
        }),
        new WebpackHookPlugin({
            onBuildEnd: [
                `${nodeCmd} ${copyFolder} -s ${faFrom} -t ${faTo}`,
                `${nodeCmd} ${minifyFile} ${defConfigFrom} ${defConfigTo}`
            ]
        }),
        ...plugins
    ],

    output: {
        chunkFilename: 'chunks/main/[id].js',
        filename     : filenameConfig.mainOutput,
        library      : {type: 'module'},
        path         : path.resolve(cwd, buildTarget.folder),
        publicPath   : 'auto'
    }
};
