const path           = require('path'),
      buildTarget    = require('./buildTarget.json'),
      processRoot    = process.cwd(),
      packageJson    = require(path.resolve(processRoot, 'package.json')),
      neoPath        = packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/',
      filenameConfig = require(path.resolve(neoPath, 'buildScripts/webpack/json/build.json')),
      entry          = {main: path.resolve(neoPath, filenameConfig.mainInput)};

module.exports = {
    mode  : 'production',
    entry,
    target: 'web',

    output: {
        chunkFilename: 'chunks/main/[id].js',
        filename     : filenameConfig.mainOutput,
        path         : path.resolve(processRoot, buildTarget.folder),
        publicPath   : ''
    }
};
