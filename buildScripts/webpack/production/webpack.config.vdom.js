const fs          = require('fs'),
      path        = require('path'),
      processRoot = process.cwd(),
      packageJson = JSON.parse(fs.readFileSync(path.resolve(processRoot, 'package.json'), 'utf8')),
      neoPath     = packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/',
      config      = require(path.resolve(neoPath, 'buildScripts/webpack/production/build.json')),
      entry       = {};

if (config.workers) {
    Object.entries(config.workers).forEach(([key, value]) => {
        if (key === 'vdom') {
            entry[key] = path.resolve(neoPath, value.input);
        }
    });
}

module.exports = env => {
    return {
        mode: 'production',
        entry,
        target: 'webworker',

        output: {
            filename: chunkData => {
                let name = chunkData.chunk.name;

                if (config.workers.hasOwnProperty(name)) {
                    return config.workers[name].output;
                }
            },
            path: path.resolve(processRoot, 'dist/production')
        }
    }
};