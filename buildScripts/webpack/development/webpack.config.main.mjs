import fs                from 'fs-extra';
import path              from 'path';
import WebpackHookPlugin from 'webpack-hook-plugin';

const cwd            = process.cwd(),
      requireJson    = path => JSON.parse(fs.readFileSync((path))),
      packageJson    = requireJson(path.resolve(cwd, 'package.json')),
      neoPath        = packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/',
      buildTarget    = requireJson(path.resolve(neoPath, 'buildScripts/webpack/development/buildTarget.json')),
      filenameConfig = requireJson(path.resolve(neoPath, 'buildScripts/webpack/json/build.json')),
      entry          = {main: path.resolve(neoPath, filenameConfig.mainInput)},
      copyFolder     = path.resolve(neoPath, 'buildScripts/copyFolder.mjs'),
      faFrom         = path.resolve(cwd, 'node_modules/@fortawesome/fontawesome-free'),
      faTo           = path.resolve(cwd, buildTarget.folder, 'resources/fontawesome-free');

export default {
    mode   : 'development',
    devtool: 'inline-source-map',
    entry,
    target : 'web',

    plugins: [
        new WebpackHookPlugin({
            onBuildEnd: [`node ${copyFolder} -s ${faFrom} -t ${faTo}`]
        })
    ],

    output: {
        chunkFilename: 'chunks/main/[id].js',
        filename     : filenameConfig.mainOutput,
        path         : path.resolve(cwd, buildTarget.folder),
        publicPath   : ''
    }
};
