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
let   classFolder = path.join(cwd, 'resources/css/src', relative);

if (!fs.existsSync(classFolder)) {
    fs.mkdirpSync(classFolder, {recursive: true});
}

const cssClassName = getCssClassName(className);
const template     = `.${cssClassName} {
    /* add css information here */
    background-color: var(--${cssClassName.toLowerCase()}-background-color); /* this is an example */
}`;
createCssStub(classFolder, file, template);

// iterate over themes
let themeFoldersPath = path.join(cwd, 'resources/css/');

const themeFolders = listDirectories(themeFoldersPath);

themeFolders.forEach(theme => {
    classFolder = path.join(cwd, 'resources/css', theme, relative);
    if (!fs.existsSync(classFolder)) {
        fs.mkdirpSync(classFolder, {recursive: true});
    }
    const exampleColor  = theme.includes('dark') ? 'darkgreen' : 'green';
    const themeTemplate = `:root .neo-${theme} { /* .${cssClassName} */
        /* add css theme information here */
        --${cssClassName.toLowerCase()}-background-color: ${exampleColor}; /* example */
}`;
    createCssStub(classFolder, file, themeTemplate);
})

function listDirectories(path) {
    return fs.readdirSync(path, {withFileTypes: true})
        .filter(dirent => dirent.isDirectory() && dirent.name.startsWith('theme'))
        .map(dirent => dirent.name);
}

function createCssStub(classFolder, file, template) {
    fs.writeFileSync(`${classFolder}/${file}.css`, `${template}${os.EOL}`);
}

function getCssClassName(className) {
    let classItems = className.split('.');
    let result     = [];

    classItems.forEach(item => {
        let temp = item.split(/(?=[A-Z])/);
        result.push(temp.join('-').toLowerCase());
    });

    return result.join('-');
}
