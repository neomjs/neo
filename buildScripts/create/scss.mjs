#!/usr/bin/env node

import {Command}           from 'commander';
import fs                  from 'fs-extra';
import os                  from 'os';
import path                from 'path';
import {fileURLToPath}     from 'url';
import {sanitizeInput}     from '../util/sanitizer.mjs';
import {getThemeNamespace} from '../../src/util/Theme.mjs';

const
    __dirname   = fileURLToPath(new URL('../', import.meta.url)),
    cwd         = process.cwd(),
    requireJson = path => JSON.parse(fs.readFileSync((path))),
    packageJson = requireJson(path.join(__dirname, '../package.json')),
    program     = new Command();

program
    .version(packageJson.version)
    .option('-b, --baseClass <value>', 'The base class to extend', sanitizeInput)
    .option('-c, --className <value>', 'The class name',           sanitizeInput)
    .allowUnknownOption()
    .parse(process.argv);

const programOpts = program.opts();

const className = programOpts.className,
      namespace = getThemeNamespace(className).split('.'),
      file      = namespace.pop();

if (namespace[0] === 'Neo') namespace.shift();

const relative    = path.join(...namespace);
let   classFolder = path.join(cwd, 'resources/scss/src', relative);

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
    classFolder = path.join(cwd, 'resources/scss', theme, relative);
    if (!fs.existsSync(classFolder)) {
        fs.mkdirpSync(classFolder, {recursive: true});
    }
    const exampleColor  = theme.includes('dark') ? 'darkgreen' : 'green';
    const themeTemplate = `:root .neo-${theme} { // .${scssClassName}
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
