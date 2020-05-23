const path        = require('path'),
      buildTarget = require('./buildTarget.json'),
      processRoot = process.cwd(),
      packageJson = require(path.resolve(processRoot, 'package.json')),
      neoPath     = packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/',
      config      = require(path.resolve(neoPath, 'buildScripts/webpack/json/build.json')),
      entry       = {main: path.resolve(neoPath, config.mainInput)};

module.exports = {
    mode   : 'development',
    devtool: 'inline-source-map',
    entry,
    target : 'web',

    output: {
        filename: (chunkData) => {
            if (chunkData.chunk.name === 'main') {
                return config.mainOutput;
            }
        },

        path: path.resolve(processRoot, buildTarget.folder)
    }
};