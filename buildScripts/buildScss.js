'use strict';

const chalk       = require('chalk'),
      { program } = require('commander'),
      cp          = require('child_process'),
      cwd         = process.cwd(),
      cpOpts      = {env: process.env, cwd: cwd, stdio: 'inherit', shell: true},
      envinfo     = require('envinfo'),
      fs          = require('fs-extra'),
      inquirer    = require('inquirer'),
      os          = require('os'),
      path        = require('path'),
      packageJson = require(path.resolve(cwd, 'package.json')),
      neoPath     = packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/',
      sass        = require('sass'),
      scssPath    = path.resolve(neoPath, 'resources/scss_new/src'),
      programName = `${packageJson.name} buildThemes`,
      questions   = [];

const getAllScssFiles = function(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);

    arrayOfFiles = arrayOfFiles || [];

    files.forEach(file => {
        if (fs.statSync(dirPath + "/" + file).isDirectory()) {
            arrayOfFiles = getAllScssFiles(dirPath + "/" + file, arrayOfFiles);
        } else {
            if (!path.basename(file).startsWith('_')) {
                arrayOfFiles.push(path.join(dirPath, "/", file));
            }
        }
    });

    return arrayOfFiles;
}

const files      = getAllScssFiles(scssPath),
      useCssVars = true;

files.forEach(file => {
    fs.readFile(file).then(content => {
        sass.render({
            data: `
            $useCssVars: ${useCssVars};
            @import "${path.resolve(neoPath, 'resources/scss_new/mixins/_all.scss')}";
            ${content}`
        }, (err, result) => {
            if (err) {
                console.log(err);
            } else {
                console.log(result.css.toString());
            }
        });
    });
});

