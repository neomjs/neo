#!/usr/bin/env node

/**
 * @file addReactiveTags.mjs
 * @description This script automates the process of adding the `@reactive` JSDoc tag
 *              to reactive configuration properties in source files.
 *              It identifies reactive configs (considering inheritance) that are missing
 *              the tag and inserts it into their JSDoc comment blocks.
 *
 *              This is an **automation tool** used to fix documentation.
 *
 * @usage `npm run add-reactive-tags`
 * @requires `docs/output/all.json` to be up-to-date (run `npm run generate-docs-json` first).
 * @warning After running this script, you **must** re-run your documentation build script
 *          (`npm run generate-docs-json`) to update `docs/output/all.json`.
 * @author Gemini
 */

import fs   from 'fs-extra';
import path from 'path';

const cwd = process.cwd();

const ALL_JSON_PATH              = path.join(cwd, 'docs/output/all.json');
const MY_APPS_JSON_PATH_CWD      = path.join(cwd, 'buildScripts/myApps.json');
const MY_APPS_JSON_PATH_WEBPACK  = path.join(cwd, 'buildScripts/webpack/json/myApps.json');
const MY_APPS_JSON_PATH_TEMPLATE = path.join(cwd, 'buildScripts/webpack/json/myApps.template.json');
const PROGRAM_NAME               = 'add-reactive-tags';

async function addReactiveTags() {
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

        const appNames = myAppsData.apps.filter(appName => appName !== 'Docs');
        const validClassPrefixes = ['Neo.', ...appNames.map(name => `${name}.`)];

        const classMap = new Map();
        const memberMap = new Map();

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

        const reactiveConfigsByClass = new Map();

        function getAllReactiveConfigs(className) {
            if (reactiveConfigsByClass.has(className)) {
                return reactiveConfigsByClass.get(className);
            }

            const currentClassReactiveConfigs = new Set();
            if (memberMap.has(className)) {
                for (const member of memberMap.get(className)) {
                    if (member.kind === 'member' && member.name.endsWith('_')) {
                        currentClassReactiveConfigs.add(member.name.slice(0, -1));
                    }
                }
            }

            const classEntry = classMap.get(className);
            if (classEntry && classEntry.augments) {
                for (const parentClassName of classEntry.augments) {
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

        for (const className of classMap.keys()) {
            getAllReactiveConfigs(className);
        }

        const filesToModify = new Map(); // filePath -> Array<{configName, jsdocStartLine, jsdocEndLine}>;

        for (const [className, reactiveConfigNames] of reactiveConfigsByClass.entries()) {
            if (memberMap.has(className)) {
                for (const member of memberMap.get(className)) {
                    const baseName = member.name.endsWith('_') ? member.name.slice(0, -1) : member.name;

                    if (reactiveConfigNames.has(baseName)) {
                        if (member.defaultvalue !== undefined || member.name.endsWith('_')) {
                            if (!member.comment || !member.comment.includes('@reactive')) {
                                const filePath = path.join(member.meta.path, member.meta.filename);
                                if (!filesToModify.has(filePath)) {
                                    filesToModify.set(filePath, []);
                                }
                                filesToModify.get(filePath).push({
                                    configName: member.name,
                                    jsdocStartLine: member.meta.lineno - 1, // JSDoc starts one line before the member definition
                                    jsdocEndLine: member.meta.lineno - 1 + member.comment.split('\n').length // Approximate end line
                                });
                            }
                        }
                    }
                }
            }
        }

        let modifiedCount = 0;
        for (const [filePath, configs] of filesToModify.entries()) {
            let fileContent = fs.readFileSync(filePath, 'utf-8');
            let lines = fileContent.split('\n');

            // Sort configs by line number in descending order to avoid issues with line shifts
            configs.sort((a, b) => b.jsdocStartLine - a.jsdocStartLine);

            for (const config of configs) {
                // Find the start of the JSDoc block (line with '/**')
                let jsdocStartLine = -1;
                for (let i = config.jsdocStartLine; i >= 0; i--) { // Search upwards from member definition
                    if (lines[i].includes('/**')) {
                        jsdocStartLine = i;
                        break;
                    }
                }

                // Find the actual end of the JSDoc block (line with '*/')
                let actualJsdocEndLine = -1;
                if (jsdocStartLine !== -1) {
                    for (let i = jsdocStartLine; i < lines.length; i++) {
                        if (lines[i].includes('*/')) {
                            actualJsdocEndLine = i;
                            break;
                        }
                    }
                }

                if (actualJsdocEndLine !== -1) {
                    // Get the indentation (leading whitespace and the asterisk) from the '*/' line.
                    // Example: "     */" -> "     *"
                    const indentationMatch = lines[actualJsdocEndLine].match(/^(\s*\*)/);
                    const indentation = indentationMatch ? indentationMatch[1] : ' *';

                    // Insert the @reactive tag on the line *before* the '*/'
                    lines.splice(actualJsdocEndLine, 0, `${indentation} @reactive`);
                    modifiedCount++;
                } else {
                    console.warn(`Could not find JSDoc block for config ${config.configName} in ${filePath}`);
                }
            }
            fs.writeFileSync(filePath, lines.join('\n'));
        }

        if (modifiedCount > 0) {
            console.log(`\nSuccessfully added @reactive tag to ${modifiedCount} configs.`);
            console.log("Please run your documentation build script again to update all.json.");
            process.exit(0);
        } else {
            console.log("\nNo missing @reactive tags found. All reactive configs are already tagged. Well done!");
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

addReactiveTags();
