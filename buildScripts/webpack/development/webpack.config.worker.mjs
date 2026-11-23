import fs                        from 'fs-extra';
import path                      from 'path';
import canvasModuleContextPlugin from '../canvasModuleContextPlugin.mjs';
import workerContextRebasePlugin from '../workerContextRebasePlugin.mjs';

const cwd            = process.cwd(),
      requireJson    = path => JSON.parse(fs.readFileSync((path))),
      packageJson    = requireJson(path.resolve(cwd, 'package.json')),
      neoPath        = packageJson.name.includes('neo.mjs') ? './' : './node_modules/neo.mjs/',
      buildTarget    = requireJson(path.resolve(neoPath, 'buildScripts/webpack/development/buildTarget.json')),
      filenameConfig = requireJson(path.resolve(neoPath, 'buildScripts/webpack/json/build.json')),
      entry          = {};

export default env => {
    let insideNeo = env.insideNeo == 'true';

    if (filenameConfig.workers) {
        Object.entries(filenameConfig.workers).forEach(([key, value]) => {
            // Inside a neo workspace, we want to use the SW inside the top level folder,
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

        experiments: {
            outputModule: true
        },

        // The rebase runs first, so the Canvas admission sees the workspace's app-space root
        plugins: [
            workerContextRebasePlugin(insideNeo, cwd),
            ...env.worker === 'canvas' ? [canvasModuleContextPlugin(insideNeo, cwd)] : []
        ],

        output: {
            chunkFilename: `chunks/${env.worker}/[id].js`,

            filename: chunkData => {
                let name = chunkData.chunk.name;

                if (Object.hasOwn(filenameConfig.workers, name)) {
                    return filenameConfig.workers[name].output;
                }
            },

            library   : {type: 'module'},
            path      : path.resolve(cwd, buildTarget.folder),
            publicPath: 'auto'
        }
    }
};
