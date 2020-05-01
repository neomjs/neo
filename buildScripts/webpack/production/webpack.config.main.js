const fs          = require('fs-extra'),
      path        = require('path'),
      processRoot = process.cwd(),
      packageJson = JSON.parse(fs.readFileSync(path.resolve(processRoot, 'package.json'), 'utf8')),
      neoPath     = packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/',
      config      = JSON.parse(fs.readFileSync(path.resolve(neoPath, 'buildScripts/webpack/production/build.json')), 'utf8'),
      entry       = {main: path.resolve(neoPath, config.mainInput)};

module.exports = {
    mode  : 'production',
    entry,
    target: 'web',

    output: {
        chunkFilename: '[name].js', // would default to '[id].js': src/main/lib/AmCharts => 1.js

        filename: (chunkData) => {
            if (chunkData.chunk.name === 'main') {
                return config.mainOutput;
            }
        },

        path      : path.resolve(processRoot, config.buildFolder),
        publicPath: '../../'
    }
};