#!/usr/bin/env node

/**
 * @file This script automates critical tasks required before a new Neo.mjs release.
 * It ensures that the package version is consistently updated across key framework files
 * and generates up-to-date SEO-related files (sitemap.xml and llm.txt) for deployment.
 * This consolidation streamlines the release process and prevents manual errors.
 */

import fs                          from 'fs-extra';
import os                          from 'os';
import path                        from 'path';
import createReleaseIndex          from './createReleaseIndex.mjs';
import {getLlmsTxt, getSitemapXml} from './generateSeoFiles.mjs';

const
    root        = path.resolve(),
    requireJson = path => JSON.parse(fs.readFileSync((path))),
    packageJson = requireJson(path.join(root, 'package.json')),
    insideNeo   = packageJson.name.includes('neo.mjs'),
    programName = `${packageJson.name} prepare-release`;

let startDate     = new Date(),
    configPath    = path.join(root, 'src/DefaultConfig.mjs'),
    contentArray  = fs.readFileSync(configPath).toString().split(os.EOL),
    i             = 0,
    len           = contentArray.length,
    versionString = `'${packageJson.version}'`,
    serviceContentArray, serviceWorkerPath;

// Ensure the framework's core configuration reflects the new package version.
// This is crucial for internal version checks and consistency.
for (; i < len; i++) {
    if (contentArray[i].includes('version:')) {
        // Update the comment above the version config as well for clarity.
        contentArray[i - 5] = contentArray[i - 5].replace(/'\d.+'/, versionString);
        contentArray[i]     = contentArray[i]    .replace(/'\d.+'/, versionString);
        break;
    }
}

fs.writeFileSync(configPath, contentArray.join(os.EOL));

// Update the ServiceWorker to ensure it uses the correct version string.
// This is important for cache busting and proper service worker registration.
serviceWorkerPath    = path.join(root, 'ServiceWorker.mjs');
serviceContentArray  = fs.readFileSync(serviceWorkerPath, 'utf-8').toString().split(os.EOL);

i   = 0;
len = serviceContentArray.length;

for (; i < len; i++) {
    if (serviceContentArray[i].includes('version:')) {
        // Update the comment above the version config for clarity.
        serviceContentArray[i - 2] = serviceContentArray[i - 2].replace(/'\d.+'/, versionString);
        serviceContentArray[i]     = serviceContentArray[i]    .replace(/'\d.+'/, versionString);
        break;
    }
}

fs.writeFileSync(serviceWorkerPath, serviceContentArray.join(os.EOL));

// If within the main Neo.mjs repository, update the version displayed in the Portal App's footer.
// This provides visual confirmation of the deployed framework version.
if (insideNeo) {
    const footerPath = path.join(root, 'apps/portal/view/home/FooterContainer.mjs');

    if (fs.existsSync(footerPath)) {
        const footerContentArray = fs.readFileSync(footerPath).toString().split(os.EOL);

        i   = 0;
        len = footerContentArray.length;

        for (; i < len; i++) {
            if (footerContentArray[i].includes('neo-version')) {
                // Update the version string displayed in the UI.
                footerContentArray[i + 1] = footerContentArray[i + 1].replace(/'\w.+'/, `'v${packageJson.version}'`);
                break;
            }
        }

        fs.writeFileSync(footerPath, footerContentArray.join(os.EOL));
    }

    // Update the datePublished in apps/portal/index.html for SEO purposes.
    // This ensures the structured data reflects the latest publication date.
    const indexPath = path.join(root, 'apps/portal/index.html');
    if (fs.existsSync(indexPath)) {
        let indexContent = fs.readFileSync(indexPath, 'utf-8');
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD format
        indexContent = indexContent.replace(/"datePublished": "\d{4}-\d{2}-\d{2}"/, `"datePublished": "${today}"`);
        fs.writeFileSync(indexPath, indexContent);
        console.log('Updated apps/portal/index.html datePublished');
    }

    // Sync .npmignore with .gitignore
    // This ensures that we don't accidentally publish files that should be ignored,
    // while maintaining the specific npm-only rules.
    const npmIgnorePath = path.join(root, '.npmignore');
    const gitIgnorePath = path.join(root, '.gitignore');

    if (fs.existsSync(npmIgnorePath) && fs.existsSync(gitIgnorePath)) {
        const npmIgnoreContent = fs.readFileSync(npmIgnorePath, 'utf-8').split(os.EOL);
        const gitIgnoreContent = fs.readFileSync(gitIgnorePath, 'utf-8');
        const splitString      = '# Original content of the .gitignore file';
        const splitIndex       = npmIgnoreContent.indexOf(splitString);
        let   headerLines;

        if (splitIndex !== -1) {
            headerLines = npmIgnoreContent.slice(0, splitIndex + 1);
        } else {
            // Fallback to the default 7 lines if the marker is missing
            headerLines = npmIgnoreContent.slice(0, 7);
        }

        const newNpmIgnoreContent = headerLines.join(os.EOL) + os.EOL + gitIgnoreContent;

        fs.writeFileSync(npmIgnorePath, newNpmIgnoreContent);
        console.log('Synced .npmignore with .gitignore');
    }
}

// Generate the release index JSON before SEO files
await createReleaseIndex();

// Generate sitemap.xml and llms.txt to ensure SEO files are up-to-date with the latest content and routes.
// This is crucial for search engine discoverability and AI model consumption.
const baseUrl = 'https://neomjs.com'; // Hardcode canonical base URL

const sitemapXml = await getSitemapXml({baseUrl});
fs.writeFileSync(path.join(root, 'apps/portal/sitemap.xml'), sitemapXml);
console.log('Generated apps/portal/sitemap.xml');

const llmsTxt = await getLlmsTxt({baseUrl});
fs.writeFileSync(path.join(root, 'apps/portal/llms.txt'), llmsTxt);
console.log('Generated apps/portal/llms.txt');

const processTime = (Math.round((new Date - startDate) * 100) / 100000).toFixed(2);
console.log(`\nTotal time for ${programName}: ${processTime}s`);

process.exit(0);
