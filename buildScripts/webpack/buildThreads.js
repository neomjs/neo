'use strict';

const cp        = require('child_process'),
      cpOpts    = { env: process.env, cwd: process.cwd(), stdio: 'inherit' },
      os        = require('os'),
      npmCmd    = os.platform().startsWith('win') ? 'npm.cmd' : 'npm', // npm binary based on OS
      startDate = new Date();

// dist/development
cp.spawnSync(npmCmd, ['run', 'dev-build-data'],  cpOpts);
cp.spawnSync(npmCmd, ['run', 'dev-build-main'],  cpOpts);
cp.spawnSync(npmCmd, ['run', 'dev-build-vdom'],  cpOpts);

// dist/production
cp.spawnSync(npmCmd, ['run', 'prod-build-data'], cpOpts);
cp.spawnSync(npmCmd, ['run', 'prod-build-main'], cpOpts);
cp.spawnSync(npmCmd, ['run', 'prod-build-vdom'], cpOpts);

const processTime = (Math.round((new Date - startDate) * 100) / 100000).toFixed(2);
console.log(`Total time: ${processTime}s`);

process.exit();