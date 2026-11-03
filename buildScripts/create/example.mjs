#!/usr/bin/env node

import {Command}       from 'commander';
import fs              from 'fs-extra';
import os              from 'os';
import path            from 'path';
import {fileURLToPath} from 'url';
import isEntryModule   from '../util/isEntryModule.mjs';
import {sanitizeInput} from '../util/sanitizer.mjs';

const
    __dirname   = fileURLToPath(new URL('../', import.meta.url)),
    cwd         = process.cwd(),
    requireJson = path => JSON.parse(fs.readFileSync((path))),
    packageJson = requireJson(path.join(__dirname, '../package.json')),
    program     = new Command();

/**
 * @summary Generates a scaffolded example app (`app.mjs`, `index.html`, `neo-config.json`, `MainContainer.mjs`) for a Neo class.
 * @param {String} className Fully qualified Neo class name (e.g. `'Neo.form.field.Text'`)
 * @param {String} [targetCwd=cwd] Root directory under which `examples/<folderPath>` is created
 * @returns {String} Path to the generated example directory
 */
export function generateExample(className, targetCwd=cwd) {
    let ns = className.split('.');
    ns.splice(0, 1); //remove Neo namespace
    let componentPath = ns.join('/'),
        folderPath    = componentPath.toLowerCase();
    const
        componentChunk = ns.join('.'),
        examplesPrefix = '../'.repeat(ns.length),
        rootPrefix     = '../'.repeat(ns.length + 1),
        name           = ns.pop();
    let classFolder = path.join(targetCwd, 'examples', `/${folderPath}`);

    if (!fs.existsSync(classFolder)) {
        fs.mkdirpSync(classFolder, {recursive: true});
    }

    createAppMjs(classFolder, componentChunk);
    createIndexHtml(classFolder, name, rootPrefix);
    createNeoConfig(classFolder, folderPath, rootPrefix);
    createMainContainer(classFolder, componentPath, componentChunk, name, examplesPrefix, rootPrefix);

    return classFolder
}

if (isEntryModule(import.meta.url)) {
    program
        .version(packageJson.version)
        .option('-b, --baseClass <value>', 'The base class to extend', sanitizeInput)
        .option('-c, --className <value>', 'The class name',           sanitizeInput)
        .allowUnknownOption()
        .parse(process.argv);

    const programOpts = program.opts();

    if (programOpts.className) {
        generateExample(programOpts.className, cwd);
    }
}


function createAppMjs(classFolder, componentChunk) {
    let template = [];

    template.push(
        "import MainContainer from './MainContainer.mjs';",
        "",
        "export const onStart = () => Neo.app({",
        "   mainView: MainContainer,",
        `   name    : 'Neo.examples.${componentChunk}'`,
        "});");

    const file = `${classFolder}/app.mjs`;
    fs.writeFileSync(file, `${template.join(os.EOL)}${os.EOL}`);
}

function createIndexHtml(classFolder, title, rootPrefix='../../../') {
    const template = [];

    template.push(
        '<!DOCTYPE HTML>',
        '<html>',
        '<head>',
        '    <meta name="viewport" content="width=device-width, initial-scale=1">',
        '    <meta charset="UTF-8">',
        `    <title>Neo ${title}</title>`,
        '</head>',
        '<body>',
        `    <script src="${rootPrefix}src/MicroLoader.mjs" type="module"></script>`,
        '</body>',
        '</html>');

    const file = `${classFolder}/index.html`;
    fs.writeFileSync(file, `${template.join(os.EOL)}${os.EOL}`);
}

function createNeoConfig(classFolder, componentPath, rootPrefix='../../../') {
    const template = [];

    template.push(
        '{',
        `   "appPath"    : "examples/${componentPath}/app.mjs",`,
        `   "basePath"   : "${rootPrefix}",`,
        '   "environment": "development",',
        '   "mainPath"   : "./Main.mjs"',
        '}'
    );
    const file = `${classFolder}/neo-config.json`;
    fs.writeFileSync(file, `${template.join(os.EOL)}${os.EOL}`);

}


function createMainContainer(classFolder, componentPath, componentChunk, name, examplesPrefix='../../', rootPrefix='../../../') {
    const template = [];

    template.push(
        `import ConfigurationViewport from '${examplesPrefix}ConfigurationViewport.mjs';`,
        `import NumberField           from '${rootPrefix}src/form/field/Number.mjs';`,
        `import ${name}               from '${rootPrefix}src/${componentPath}.mjs';`,
        "",
        "/**",
        ` * @class Neo.examples.${componentChunk.toLowerCase()}.MainContainer`,
        " * @extends Neo.examples.ConfigurationViewport",
        " */",
        "class MainContainer extends ConfigurationViewport {",
        "    static config = {",
        `        className: 'Neo.examples.${componentChunk.toLowerCase()}.MainContainer',`,
        "        autoMount: true,",
        "        configItemLabelWidth: 110,",
        "        configItemWidth: 230,",
        "        layout: { ntype: 'hbox', align: 'stretch' }",
        "    }",
        "",
        "   createConfigurationComponents() {",
        "       let me = this;",
        "",
        "       return [{",
        "           module: NumberField,",
        "           clearable: true,",
        "           labelText: 'height',",
        "           listeners: { change: me.onConfigChange.bind(me, 'height') },",
        "           maxValue: 100,",
        "           minValue: 20,",
        "           stepSize: 2,",
        "           style: { marginTop: '10px' },",
        "           value: me.exampleComponent.height",
        "       }, {",
        "           module: NumberField,",
        "           clearable: true,",
        "           labelText: 'width',",
        "           listeners: { change: me.onConfigChange.bind(me, 'width') },",
        "           maxValue: 300,",
        "           minValue: 100,",
        "           stepSize: 5,",
        "           style: { marginTop: '10px' },",
        "           value: me.exampleComponent.width",
        "       }]",
        "   }",
        "",
        "   createExampleComponent() {",
        "       return Neo.create({",
        `           module: ${name},`,
        "           height: 30,",
        "           width:  100",
        "           // property_xy: <value>",
        "       })",
        "   }",
        "}",
        "",
        "export default Neo.setupClass(MainContainer);"
    );
    const file = `${classFolder}/MainContainer.mjs`;
    fs.writeFileSync(file, `${template.join(os.EOL)}${os.EOL}`);
}
