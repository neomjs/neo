import fs                from 'fs-extra';
import path              from 'path';
import WebpackHookPlugin from 'webpack-hook-plugin';

const cwd            = process.cwd(),
      requireJson    = path => JSON.parse(fs.readFileSync((path))),
      packageJson    = requireJson(path.resolve(cwd, 'package.json')),
      insideNeo      = packageJson.name === 'neo.mjs',
      neoPath        = insideNeo ? './' : './node_modules/neo.mjs/',
      buildTarget    = requireJson(path.resolve(neoPath, 'buildScripts/webpack/production/buildTarget.json')),
      filenameConfig = requireJson(path.resolve(neoPath, 'buildScripts/webpack/json/build.json')),
      entry          = {main: path.resolve(neoPath, filenameConfig.mainInput)},
      copyFolder     = path.resolve(neoPath, 'buildScripts/copyFolder.mjs'),
      faFrom         = path.resolve(cwd, 'node_modules/@fortawesome/fontawesome-free'),
      faTo           = path.resolve(cwd, buildTarget.folder, 'resources/fontawesome-free'),
      plugins        = [];

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

    plugins: [
        new WebpackHookPlugin({
            onBuildEnd: [`node ${copyFolder} -s ${faFrom} -t ${faTo}`]
        }),
        ...plugins
    ],

    output: {
        chunkFilename: 'chunks/main/[id].js',
        filename     : filenameConfig.mainOutput,
        path         : path.resolve(cwd, buildTarget.folder),
        publicPath   : ''
    }
};
