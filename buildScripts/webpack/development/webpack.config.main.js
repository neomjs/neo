const fs          = require('fs-extra'),
      path        = require('path'),
      processRoot = process.cwd(),
      packageJson = JSON.parse(fs.readFileSync(path.resolve(processRoot, 'package.json'), 'utf8')),
      neoPath     = packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/',
      config      = JSON.parse(fs.readFileSync(path.resolve(neoPath, 'buildScripts/webpack/development/build.json')), 'utf8'),
      entry       = {main: path.resolve(neoPath, config.mainInput)};

module.exports = {
    mode   : 'development',
    devtool: 'inline-source-map',
    entry  : entry,
    target : 'web',

    output: {
        filename: (chunkData) => {
            if (chunkData.chunk.name === 'main') {
                return config.mainOutput;
            }
        },
        path: path.resolve(processRoot, config.buildFolder)
    }
};