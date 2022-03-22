import fs      from 'fs-extra';
import path    from 'path';
import webpack from 'webpack';

const cwd            = process.cwd(),
      requireJson    = path => JSON.parse(fs.readFileSync((path))),
      packageJson    = requireJson(path.resolve(cwd, 'package.json')),
      neoPath        = packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/',
      buildTarget    = requireJson(path.resolve(neoPath, 'buildScripts/webpack/development/buildTarget.json')),
      filenameConfig = requireJson(path.resolve(neoPath, 'buildScripts/webpack/json/build.json')),
      entry          = {};

export default env => {
    let insideNeo = env.insideNeo == 'true';

    if (filenameConfig.workers) {
        Object.entries(filenameConfig.workers).forEach(([key, value]) => {
            // Inside a neo workspace, we want to use the SW inside the top level apps folder,
            // to allow overriding its logic
            if (key === env.worker) {
                entry[key] = path.resolve(key === 'service' && !insideNeo ? cwd : neoPath, value.input);
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

            path: path.resolve(cwd, buildTarget.folder)
        }
    }
};
