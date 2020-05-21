'use strict';

const cp        = require('child_process'),
      cpOpts    = { env: process.env, cwd: process.cwd(), stdio: 'inherit' },
      path      = './buildScripts/webpack/',
      startDate = new Date();

// dist/development
cp.spawnSync('webpack', ['--config', path + 'development/webpack.config.main.js'],                        cpOpts);
cp.spawnSync('webpack', ['--config', path + 'development/webpack.config.worker.js', '--env.worker=data'], cpOpts);
cp.spawnSync('webpack', ['--config', path + 'development/webpack.config.worker.js', '--env.worker=vdom'], cpOpts);

// dist/production
cp.spawnSync('webpack', ['--config', path + 'production/webpack.config.main.js'],                         cpOpts);
cp.spawnSync('webpack', ['--config', path + 'production/webpack.config.worker.js', '--env.worker=data'],  cpOpts);
cp.spawnSync('webpack', ['--config', path + 'production/webpack.config.worker.js', '--env.worker=vdom'],  cpOpts);

const processTime = (Math.round((new Date - startDate) * 100) / 100000).toFixed(2);
console.log(`Total time: ${processTime}s`);

process.exit();