'use strict';

const autoprefixer = require('autoprefixer'),
      chalk        = require('chalk'),
      { program }  = require('commander'),
      cp           = require('child_process'),
      cssnano      = require('cssnano'),
      cwd          = process.cwd(),
      cpOpts       = {env: process.env, cwd: cwd, stdio: 'inherit', shell: true},
      envinfo      = require('envinfo'),
      fs           = require('fs-extra'),
      inquirer     = require('inquirer'),
      os           = require('os'),
      path         = require('path'),
      packageJson  = require(path.resolve(cwd, 'package.json')),
      neoPath      = packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/',
      postcss      = require('postcss'),
      sass         = require('sass'),
      scssPath     = path.resolve(neoPath, 'resources/scss_new/src'),
      programName  = `${packageJson.name} buildThemes`,
      questions    = [];

function getAllScssFiles(dirPath, arrayOfFiles=[], relativePath='') {
    let files = fs.readdirSync(dirPath),
        fileInfo;

    files.forEach(file => {
        if (fs.statSync(dirPath + '/' + file).isDirectory()) {
            arrayOfFiles = getAllScssFiles(dirPath + '/' + file, arrayOfFiles, '/' + file);
        } else {
            fileInfo = path.parse(file);

            if (!fileInfo.name.startsWith('_')) {
                arrayOfFiles.push({
                    name        : fileInfo.name,
                    path        : path.join(dirPath, '/', file),
                    relativePath: relativePath
                });
            }
        }
    });

    return arrayOfFiles;
}

let files      = getAllScssFiles(scssPath),
    useCssVars = true;

files.forEach(file => {
    fs.readFile(file.path).then(content => {
        sass.render({
            data: `
            $useCssVars: ${useCssVars};
            @import "${path.resolve(neoPath, 'resources/scss_new/mixins/_all.scss')}";
            ${content}`
        }, (err, result) => {
            if (err) {
                console.log(err);
            } else {
                postcss([autoprefixer, cssnano]).process(result.css, {}).then(result => {
                    let folderPath = path.resolve(neoPath, `dist/production/css/${file.relativePath}`),
                        filePath   = path.resolve(folderPath, `${file.name}.css`);

                    fs.mkdirpSync(folderPath);

                    fs.writeFile(filePath, result.css, () => true)

                    if ( result.map ) {
                        fs.writeFile(filePath, result.map.toString(), () => true)
                    }
                });
            }
        });
    });
});

