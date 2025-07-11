#!/usr/bin/env node

/**
 * @file checkReactiveTags.mjs
 * @description This script identifies and reports reactive configuration properties
 *              that are missing the `@reactive` JSDoc tag.
 *              It builds a class inheritance graph and determines reactivity based
 *              on direct definition (trailing underscore) or inheritance from a parent class.
 *
 *              This is a **diagnostic tool** used to verify documentation completeness.
 *
 * @usage `npm run check-reactive-tags`
 * @requires `docs/output/all.json` to be up-to-date (run `npm run generate-docs-json` first).
 * @author Gemini
 */

import fs from 'fs-extra';
import path from 'path';

const cwd = process.cwd();

const ALL_JSON_PATH = path.join(cwd, 'docs/output/all.json');
const MY_APPS_JSON_PATH = path.join(cwd, 'buildScripts/webpack/json/myApps.json');
const PROGRAM_NAME = 'check-reactive-tags';

const MY_APPS_JSON_PATH_CWD = path.join(cwd, 'buildScripts/myApps.json');
const MY_APPS_JSON_PATH_WEBPACK = path.join(cwd, 'buildScripts/webpack/json/myApps.json');
const MY_APPS_JSON_PATH_TEMPLATE = path.join(cwd, 'buildScripts/webpack/json/myApps.template.json');

async function checkReactiveTags() {
    const startDate = new Date();
    console.log(`
Starting ${PROGRAM_NAME}...`);

    try {
        const data = JSON.parse(fs.readFileSync(ALL_JSON_PATH, 'utf-8'));

        let appJson;

        if (fs.existsSync(MY_APPS_JSON_PATH_CWD)) {
            appJson = JSON.parse(fs.readFileSync(MY_APPS_JSON_PATH_CWD, 'utf-8'));
        } else if (fs.existsSync(MY_APPS_JSON_PATH_WEBPACK)) {
            appJson = JSON.parse(fs.readFileSync(MY_APPS_JSON_PATH_WEBPACK, 'utf-8'));
        } else {
            appJson = JSON.parse(fs.readFileSync(MY_APPS_JSON_PATH_TEMPLATE, 'utf-8'));
        }

        const myAppsData = appJson;


        const appNames = myAppsData.apps.filter(appName => appName !== 'Docs'); // Docs is handled separately or implicitly Neo.
        const validClassPrefixes = ['Neo.', ...appNames.map(name => `${name}.`)];

        const classMap = new Map(); // neoClassName -> class_entry
        const memberMap = new Map(); // neoClassName -> [member_entries]

        for (const entry of data) {
            if (entry.kind === 'class' && entry.neoClassName) {
                classMap.set(entry.neoClassName, entry);
            } else if (entry.kind === 'member' && entry.neoClassName) {
                if (!memberMap.has(entry.neoClassName)) {
                    memberMap.set(entry.neoClassName, []);
                }
                memberMap.get(entry.neoClassName).push(entry);
            }
        }

        const reactiveConfigsByClass = new Map(); // neoClassName -> Set<configNameWithoutUnderscore>

        // Recursive function to get all reactive configs for a class, including inherited ones
        function getAllReactiveConfigs(className) {
            if (reactiveConfigsByClass.has(className)) {
                return reactiveConfigsByClass.get(className);
            }

            const currentClassReactiveConfigs = new Set();

            // Add directly defined reactive configs (ending with '_')
            if (memberMap.has(className)) {
                for (const member of memberMap.get(className)) {
                    if (member.kind === 'member' && member.name.endsWith('_')) {
                        currentClassReactiveConfigs.add(member.name.slice(0, -1)); // Add without underscore
                    }
                }
            }

            // Add inherited reactive configs
            const classEntry = classMap.get(className);
            if (classEntry && classEntry.augments) {
                for (const parentClassName of classEntry.augments) {
                    // Only consider Neo.mjs or app-specific classes for inheritance
                    const isNeoOrAppClass = validClassPrefixes.some(prefix => parentClassName.startsWith(prefix));

                    if (isNeoOrAppClass) {
                        const inheritedReactive = getAllReactiveConfigs(parentClassName);
                        for (const configName of inheritedReactive) {
                            currentClassReactiveConfigs.add(configName);
                        }
                    }
                }
            }

            reactiveConfigsByClass.set(className, currentClassReactiveConfigs);
            return currentClassReactiveConfigs;
        }

        // Populate reactiveConfigsByClass for all classes
        for (const className of classMap.keys()) {
            getAllReactiveConfigs(className);
        }

        const missingTags = [];

        // Check for missing @reactive tags
        for (const [className, reactiveConfigNames] of reactiveConfigsByClass.entries()) {
            if (memberMap.has(className)) {
                for (const member of memberMap.get(className)) {
                    const baseName = member.name.endsWith('_') ? member.name.slice(0, -1) : member.name;

                    // Check if this member is a reactive config (either directly or inherited)
                    if (reactiveConfigNames.has(baseName)) {
                        // Heuristic: if it has a defaultvalue, it's likely a config.
                        // Or if it's directly defined with an underscore.
                        if (member.defaultvalue !== undefined || member.name.endsWith('_')) {
                            if (!member.comment || !member.comment.includes('@reactive')) {
                                missingTags.push({
                                    filePath: path.join(member.meta.path, member.meta.filename),
                                    className: className,
                                    configName: member.name,
                                    isDirectlyDefinedReactive: member.name.endsWith('_')
                                });
                            }
                        }
                    }
                }
            }
        }

        if (missingTags.length > 0) {
            console.log(`\nThe following ${missingTags.length} reactive configs are missing the @reactive JSDoc tag:`);
            for (const item of missingTags) {
                console.log(`- Class: ${item.className}, Config: ${item.configName} (Directly defined reactive: ${item.isDirectlyDefinedReactive})`);
                console.log(`  File: ${item.filePath}`);
            }
            process.exit(1); // Exit with error code if issues are found
        } else {
            console.log("\nAll reactive configs have the @reactive JSDoc tag. Well done!");
            process.exit(0);
        }

    } catch (error) {
        console.error(`\nError during ${PROGRAM_NAME}:`, error);
        process.exit(1);
    } finally {
        const processTime = (new Date() - startDate) / 1000;
        console.log(`Total time for ${PROGRAM_NAME}: ${processTime.toFixed(2)}s`);
    }
}

checkReactiveTags();
