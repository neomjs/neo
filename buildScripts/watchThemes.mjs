import autoprefixer from 'autoprefixer';
import chalk        from 'chalk';
import envinfo      from 'envinfo';
import fs           from 'fs-extra';
import path         from 'path';
import postcss      from 'postcss';
import sass         from 'sass';

const __dirname          = path.resolve(),
      cwd                = process.cwd(),
      requireJson        = path => JSON.parse(fs.readFileSync((path))),
      packageJson        = requireJson(path.resolve(cwd, 'package.json')),
      neoPath            = packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/',
      regexComments      = /\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm,
      regexLineBreak     = /(\r\n|\n|\r)/gm,
      regexSassImport    = /@import[^'"]+?['"](.+?)['"];?/g,
      scssFolders        = fs.readdirSync(path.join(neoPath, '/resources/scss')),
      scssPath           = path.resolve(neoPath, 'resources/scss'),
      themeMapFile       = 'resources/theme-map.json',
      themeMapFileNoVars = 'resources/theme-map-no-vars.json';

fs.watch(scssPath, {
    recursive: true
}, (eventType, filename) => {
    if (filename.endsWith('.scss')) {
        switch (eventType) {
            case 'change': {
                buildFile(filename);
            }
        }
    }
});

function buildFile(filename) {
    console.log('buildFile', filename);

    fs.readFile(path.join(scssPath, filename)).then(content => {
        let result = sass.render({
            data          : data + scssCombine(content.toString(), path.resolve(neoPath, scssPath, target, file.relativePath)),
            outFile       : destPath,
            sourceMap     : true,
            sourceMapEmbed: false
        });

        const plugins = [autoprefixer];

        map = result.map?.toString();

        if (map) {
            // https://github.com/neomjs/neo/issues/1970
            map = JSON.parse(map);
            let len = file.relativePath.split('/').length,
                src = `${target}${file.relativePath}/${file.name}.scss`,
                i   = 0;

            for (; i < len; i++) {
                src = '../' + src;
            }

            map.sources = [src];
        }

        postcss(plugins).process(result.css, {
            from: file.path,
            to  : destPath,
            map : !devMode ? null : {
                prev: map && JSON.stringify(map)
            }
        }).then(result => {
            fs.mkdirpSync(folderPath);
            fileCount[mode][varsFlag]++;

            const processTime = (Math.round((new Date - startDate) * 100) / 100000).toFixed(2);
            console.log('Writing file:', (fileCount[mode].vars + fileCount[mode].noVars), chalk.blue(`${processTime}s`), destPath);
            fs.writeFileSync(destPath, result.css, () => true);

            if (result.map) {
                fs.writeFileSync(result.opts.to + '.map', result.map.toString());
            }

            if (fileCount[mode][varsFlag] === totalFiles[mode][varsFlag]) {
                fs.writeFileSync(
                    path.resolve(cwd, useCssVars ? themeMapFile : themeMapFileNoVars),
                    JSON.stringify(useCssVars ? themeMap : themeMapNoVars, null, 0)
                );

                fs.mkdirpSync(path.join(cwd, '/dist/', mode, '/resources'), {
                    recursive: true
                });

                fs.writeFileSync(
                    path.join(cwd, '/dist/', mode, useCssVars ? themeMapFile : themeMapFileNoVars),
                    JSON.stringify(useCssVars ? themeMap : themeMapNoVars, null, 0)
                );
            }
        });
    });

    console.log(file);
}
