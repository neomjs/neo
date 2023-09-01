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

let className = programOpts.className;

let ns            = className.split('.');
let file          = ns.pop();
let root          = ns.shift();
let rootLowerCase = root.toLowerCase();

// let classFolder = path.join(cwd,  '/src/', ns.join('/'));
const forNonNeoPathArray = ns.filter(f => f !== 'view');
let nonNeoPath           = `apps/${rootLowerCase}`;
if (forNonNeoPathArray.length > 0) {
    nonNeoPath = nonNeoPath.concat('/', forNonNeoPathArray.join('/'));
}

let classFolder = path.join(cwd, 'resources/scss/src/', rootLowerCase === 'neo' ? `/${ns.join('/')}` : nonNeoPath);

if (!fs.existsSync(classFolder)) {
    fs.mkdirpSync(classFolder, {recursive: true});
}

const scssClassName = getScssClassName(className);
const template      = `.${scssClassName} {
    // add css information here
    background-color: var(--${scssClassName.toLowerCase()}-background-color); // this is an example
}`;
createScssStub(classFolder, file, template);

// iterate over themes
let themeFoldersPath = path.join(cwd, 'resources/scss/');

const themeFolders = listDirectories(themeFoldersPath);

themeFolders.forEach(theme => {
    const forNonNeoPathArray = ns.filter(f => f !== 'view');
    let nonNeoPath           = `apps/${rootLowerCase}`;
    if (forNonNeoPathArray.length > 0) {
        nonNeoPath = nonNeoPath.concat('/', forNonNeoPathArray.join('/'));
    }
    classFolder = path.join(cwd, 'resources/scss/', theme, rootLowerCase === 'neo' ? `/${ns.join('/')}` : nonNeoPath);
    if (!fs.existsSync(classFolder)) {
        fs.mkdirpSync(classFolder, {recursive: true});
    }
    const exampleColor  = theme.includes('dark') ? 'darkgreen' : 'green';
    const themeTemplate = `:root .${rootLowerCase}-${theme} { // .${scssClassName}
        // add css theme information here
        --${scssClassName.toLowerCase()}-background-color: ${exampleColor}; //example
}`;
    createScssStub(classFolder, file, themeTemplate);
})

function listDirectories(path) {
    return fs.readdirSync(path, {withFileTypes: true})
        .filter(dirent => dirent.isDirectory() && dirent.name.startsWith('theme'))
        .map(dirent => dirent.name);
}

function createScssStub(classFolder, file, template) {
    const scssFile = `${classFolder}/${file}.scss`;

    fs.writeFileSync(scssFile, `${template}${os.EOL}`);
}

function getScssClassName(className) {
    let classItems = className.split('.');
    let result     = [];

    classItems.forEach(item => {
        let temp = item.split(/(?=[A-Z])/);
        result.push(temp.join('-').toLowerCase());
    });

    return result.join('-');
}

