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

let startDate            = new Date(),
    configPath           = path.join(__dirname, 'src/DefaultConfig.mjs'),
    contentArray         = fs.readFileSync(configPath).toString().split(os.EOL),
    i                    = 0,
    len                  = contentArray.length,
    serviceWorkerFolders = ['apps'],
    versionString        = `'${packageJson.version}'`,
    serviceContentArray, serviceWorkerPath

if (!insideNeo) {
    // todo
} else {
    serviceWorkerFolders.push('examples');
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

serviceWorkerFolders.forEach(folder => {
    serviceWorkerPath    = path.join(__dirname, folder, 'ServiceWorker.mjs');
    serviceContentArray  = fs.readFileSync(serviceWorkerPath).toString().split(os.EOL);

    i   = 0;
    len = serviceContentArray.length;

    for (; i < len; i++) {
        if (serviceContentArray[i].includes('version:')) {
            // we want to update the comment inside ServiceWorker.mjs as well
            serviceContentArray[i - 2] = serviceContentArray[i - 2].replace(/'\d.+'/, versionString);
            serviceContentArray[i]     = serviceContentArray[i]    .replace(/'\d.+'/, versionString);
            break;
        }
    }

    fs.writeFileSync(serviceWorkerPath, serviceContentArray.join(os.EOL));
});

// Update the version inside the Portal App Footer
if (insideNeo) {
    const footerPath = path.join(__dirname, 'apps/portal/view/home/FooterContainer.mjs');

    if (fs.existsSync(footerPath)) {
        const footerContentArray = fs.readFileSync(footerPath).toString().split(os.EOL);

        i   = 0;
        len = footerContentArray.length;

        for (; i < len; i++) {
            if (footerContentArray[i].includes('neo-version')) {
                // we want to update the comment inside ServiceWorker.mjs as well
                footerContentArray[i + 1] = footerContentArray[i + 1].replace(/'\w.+'/, `'v${packageJson.version}'`);
                break;
            }
        }

        fs.writeFileSync(footerPath, footerContentArray.join(os.EOL));
    }
}

const processTime = (Math.round((new Date - startDate) * 100) / 100000).toFixed(2);
console.log(`\nTotal time for ${programName}: ${processTime}s`);

process.exit(0);
