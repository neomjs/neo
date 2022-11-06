#!/usr/bin/env node

import chalk   from 'chalk';
import envinfo from 'envinfo';
import fs      from 'fs-extra';
import os      from 'os';
import path    from 'path';

const
    __dirname   = path.resolve(),
    cwd         = process.cwd(),
    requireJson = path => JSON.parse(fs.readFileSync((path))),
    packageJson = requireJson(path.join(__dirname, 'package.json')),
    insideNeo   = packageJson.name === 'neo.mjs',
    neoPath     = insideNeo ? './' : './node_modules/neo.mjs/',
    programName = `${packageJson.name} inject-package-version`;

let startDate    = new Date(),
    configPath   = path.join(__dirname, 'src/DefaultConfig.mjs'),
    contentArray = fs.readFileSync(configPath).toString().split(os.EOL),
    i            = 0,
    len          = contentArray.length,
    versionString = `'${packageJson.version}'`;

if (!insideNeo) {
    // todo
}

for (; i < len; i++) {
    if (contentArray[i].includes('version:')) {
        // we want to update the comment inside the DefaultConfig.mjs as well
        contentArray[i - 5] = contentArray[i - 5].replace(/'\d.+'/, versionString);
        contentArray[i]     = contentArray[i]    .replace(/'\d.+'/, versionString);
        break;
    }
}

fs.writeFileSync(configPath, contentArray.join(os.EOL));

const processTime = (Math.round((new Date - startDate) * 100) / 100000).toFixed(2);
console.log(`\nTotal time for ${programName}: ${processTime}s`);

process.exit(0);
