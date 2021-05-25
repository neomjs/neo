const path        = require('path'),
      buildTarget = require('./buildTarget.json'),
      processRoot = process.cwd(),
      packageJson = require(path.resolve(processRoot, 'package.json')),
      neoPath     = packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/';

module.exports = {
    mode   : 'development',
    devtool: 'inline-source-map',
    entry  : {main: path.resolve(neoPath, './src/Main.mjs')},
    target : 'web',

    output: {
        chunkFilename: 'chunks/main/[id].js',
        filename     : 'main.js',
        path         : path.resolve(processRoot, buildTarget.folder)
    }
};
