#!/usr/bin/env node

import {Command}       from 'commander/esm.mjs';
import fs              from 'fs-extra';
import os              from 'os';
import path            from 'path';
import {fileURLToPath} from 'url';

const
    __dirname   = fileURLToPath(new URL('../../', import.meta.url)),
    cwd         = process.cwd(),
    requireJson = path => JSON.parse(fs.readFileSync((path))),
    packageJson = requireJson(path.join(__dirname, 'package.json')),
    program     = new Command();

program
    .version(packageJson.version)
    .option('-b, --baseClass <value>')
    .option('-c, --className <value>')
    .allowUnknownOption()
    .parse(process.argv);

const programOpts = program.opts();
let className     = programOpts.className;

let ns = className.split('.');
ns.splice(0, 1); //remove Neo namespace
let componentPath    = ns.join('/');
componentPath        = componentPath.toLowerCase();
const componentChunk = ns.join('.')
const name           = ns.pop();
let classFolder      = path.join(cwd, 'examples', `/${componentPath}`);

if (!fs.existsSync(classFolder)) {
    fs.mkdirpSync(classFolder, {recursive: true});
}

createAppMjs(classFolder, componentChunk);
createIndexHtml(classFolder, name);
createNeoConfig(classFolder, componentPath);
createMainContainer(classFolder, componentPath, componentChunk, name);


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

function createIndexHtml(classFolder, title) {
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
        '    <script src="../../../src/MicroLoader.mjs" type="module"></script>',
        '</body>',
        '</html>`');

    const file = `${classFolder}/index.html`;
    fs.writeFileSync(file, `${template.join(os.EOL)}${os.EOL}`);
}

function createNeoConfig(classFolder, componentPath) {
    const template = [];

    template.push(
        '{',
        `   "appPath"    : "examples/${componentPath}/app.mjs",`,
        '   "basePath"   : "../../../",',
        '   "environment": "development",',
        '   "mainPath"   : "./Main.mjs"',
        '}'
    );
    const file = `${classFolder}/neo-config.json`;
    fs.writeFileSync(file, `${template.join(os.EOL)}${os.EOL}`);

}


function createMainContainer(classFolder, componentPath, componentChunk, name) {
    const template = [];

    template.push(
        "import ConfigurationViewport from '../../ConfigurationViewport.mjs';",
        "import NumberField           from '../../../src/form/field/Number.mjs';",
        `import ${name}               from '../../../src/${componentPath}.mjs';`,
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
