const fs          = require('fs-extra'),
      path        = require('path'),
      processRoot = process.cwd(),
      packageJson = JSON.parse(fs.readFileSync(path.resolve(processRoot, 'package.json'), 'utf8')),
      neoPath     = packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/',
      config      = JSON.parse(fs.readFileSync(path.resolve(neoPath, 'buildScripts/webpack/development/build.json')), 'utf8'),
      entry       = {main: path.resolve(neoPath, config.mainInput)};

module.exports = {
    mode: 'development',

    // see: https://webpack.js.org/configuration/devtool/
    devtool: 'inline-source-map',
    //devtool: 'cheap-module-eval-source-map',

    entry    : entry,
    target   : 'web',

    output: {
        filename: (chunkData) => {
            let name = chunkData.chunk.name;

            if (name === 'main') {
                return config.mainOutput;
            } else if (config.workers.hasOwnProperty(name)) {
                return config.workers[name].output;
            } else if (config.examples.hasOwnProperty(name)) {
                return config.examples[name].output + 'app.js';
            }
        },
        path: path.resolve(processRoot, config.buildFolder)
    }/*,

    optimization: {
        splitChunks: {
            chunks: 'all',

            cacheGroups: {
                collection: {
                    test (chunks) {
                        return true;
                    }
                }
            }
        }
    }*/
};