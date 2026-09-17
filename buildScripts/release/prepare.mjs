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
import rebuildContentIndexesAndSeo from '../docs/rebuildContentIndexesAndSeo.mjs';
import {composeNpmIgnore}          from '../util/npmIgnoreComposition.mjs';

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
                footerContentArray[i + 1] = footerContentArray[i + 1].replace(/v\d+\.\d+\.\d+/, `v${packageJson.version}`);
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

    // Keep the Neural Link guide's version proof line in sync with package.json.
    const neuralLinkPath = path.join(root, 'learn/agentos/NeuralLink.md');
    if (fs.existsSync(neuralLinkPath)) {
        const neuralLinkContent = fs.readFileSync(neuralLinkPath, 'utf-8')
            .replace(/Neo\.mjs v\d+\.\d+\.\d+\./, `Neo.mjs v${packageJson.version}.`);

        fs.writeFileSync(neuralLinkPath, neuralLinkContent);
        console.log('Updated learn/agentos/NeuralLink.md version');
    }

    // Sync .npmignore with .gitignore
    // This ensures that we don't accidentally publish files that should be ignored,
    // while maintaining the specific npm-only rules.
    const npmIgnorePath = path.join(root, '.npmignore');
    const gitIgnorePath = path.join(root, '.gitignore');

    if (fs.existsSync(npmIgnorePath) && fs.existsSync(gitIgnorePath)) {
        // The composition lives in buildScripts/util/npmIgnoreComposition.mjs, shared with the guard
        // that predicts it. A guard verifying its own restatement of this logic can be green against a
        // release step that behaves differently, which is the one failure a pre-release guard must not
        // have — so there is exactly one implementation and both sides import it.
        const {content, dropped, headerLines} = composeNpmIgnore(
            fs.readFileSync(npmIgnorePath, 'utf-8'),
            fs.readFileSync(gitIgnorePath, 'utf-8'),
            os.EOL
        );

        fs.writeFileSync(npmIgnorePath, content);

        console.log(`Synced .npmignore with .gitignore (${headerLines.length} header lines kept)`);

        // Named individually rather than counted: a dropped line is a `.gitignore` rule that does not
        // reach the package, so anyone adding one under an owned path has to see it disappear.
        dropped.forEach(({line, owner}) => {
            console.log(`  dropped from the copy: ${line}  (the header owns ${owner})`)
        })
    }
}

// Generate the Portal indexes and SEO files from the shared bundle used by sync paths.
await rebuildContentIndexesAndSeo({root, includeLabelIndex: true});

const processTime = (Math.round((new Date - startDate) * 100) / 100000).toFixed(2);
console.log(`\nTotal time for ${programName}: ${processTime}s`);

process.exit(0);
