const path           = require('path'),
      buildTarget    = require('./buildTarget.json'),
      processRoot    = process.cwd(),
      packageJson    = require(path.resolve(processRoot, 'package.json')),
      neoPath        = packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/',
      filenameConfig = require(path.resolve(neoPath, 'buildScripts/webpack/json/build.json')),
      entry          = {},
      webpack        = require('webpack');

module.exports = env => {
    let insideNeo = env.insideNeo == 'true';

    if (filenameConfig.workers) {
        Object.entries(filenameConfig.workers).forEach(([key, value]) => {
            if (key === env.worker) {
                entry[key] = path.resolve(neoPath, value.input);
            }
        });
    }

    return {
        mode   : 'development',
        devtool: 'inline-source-map', // see: https://webpack.js.org/configuration/devtool/
        entry,
        target : 'webworker',

        plugins: [
            new webpack.ContextReplacementPlugin(/.*/, context => {
                if (!insideNeo && context.context.includes('/src/worker')) {
                    context.request = '../../' + context.request;
                }
            })
        ],

        output: {
            chunkFilename: `chunks/${env.worker}/[id].js`,

            filename: chunkData => {
                let name = chunkData.chunk.name;

                if (filenameConfig.workers.hasOwnProperty(name)) {
                    return filenameConfig.workers[name].output;
                }
            },

            path: path.resolve(processRoot, buildTarget.folder)
        }
    }
};
