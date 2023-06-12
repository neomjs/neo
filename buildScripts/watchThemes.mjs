import autoprefixer from 'autoprefixer';
import chalk        from 'chalk';
import fs           from 'fs-extra';
import path         from 'path';
import postcss      from 'postcss';
import * as sass    from 'sass';

let cwd             = process.cwd(),
    requireJson     = path => JSON.parse(fs.readFileSync((path))),
    packageJson     = requireJson(path.resolve(cwd, 'package.json')),
    neoPath         = packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/',
    mixinPath       = path.resolve(neoPath, 'resources/scss/mixins/_all.scss'),
    regexSassImport = /@import[^'"]+?['"](.+?)['"];?/g,
    scssPath        = path.resolve(cwd, 'resources/scss');

if (path.sep === '\\') {
    mixinPath = mixinPath.replace(/\\/g, '/');
}

fs.watch(scssPath, {
    recursive: true
}, (eventType, filename) => {
    if (filename.endsWith('.scss')) {
        switch(eventType) {
            case 'change': {
                buildFile(filename);
            }
        }
    }
});

function buildFile(filename) {
    console.log('start processing', filename);

    let filePath  = path.join(scssPath, filename),
        destPath  = path.join(cwd, 'dist/development/css', filename.replace('.scss', '.css')),
        startDate = new Date(),
        data, map;

    data = [
        `@use "sass:map";`,
        `@use "sass:math";`,
        `$neoMap: ();`,
        `$useCssVars: true;`,
        `@import "${mixinPath}";`
    ].join('');

    fs.readFile(filePath).then(content => {
        try {
            let result = sass.renderSync({
                data          : data + scssCombine(content.toString(), path.parse(filePath).dir),
                outFile       : destPath,
                sourceMap     : true,
                sourceMapEmbed: false
            });

            map = result.map?.toString();

            if (map) {
                // https://github.com/neomjs/neo/issues/1970
                map = JSON.parse(map);

                let filenameSlash = filename;

                if (path.sep === '\\') {
                    filenameSlash = filenameSlash.replace(/\\/g, '/');
                }

                let len = filenameSlash.split('/').length,
                    src = `/scss/${filenameSlash}`,
                    i   = 0;

                for (; i < len; i++) {
                    src = '../' + src;
                }

                map.sources = [src];
            }

            postcss([autoprefixer]).process(result.css, {
                from: filePath,
                to  : destPath,
                map : {
                    prev: map && JSON.stringify(map)
                }
            }).then(result => {
                fs.writeFileSync(destPath, result.css, () => true);

                if (result.map) {
                    fs.writeFileSync(result.opts.to + '.map', result.map.toString());
                }

                const processTime = (Math.round((new Date - startDate) * 100) / 100000).toFixed(2);
                console.log('Updated file:', (chalk.blue(`${processTime}s`)), destPath);
            });
        } catch(error) {
            console.log('SCSS build failed for', chalk.red(filename));
            console.log(error);
        }
    });
}

/**
 * @param {String} content
 * @param {String} baseDir
 * @returns {String}
 */
function scssCombine (content, baseDir) {
    if (regexSassImport.test(content)) {
        content = content.replace(regexSassImport, (m, capture) => {
            let parse = path.parse(path.resolve(baseDir, capture)),
                file  = path.resolve(`${parse.dir}/${parse.name}.scss`);

            if (!fs.existsSync(file)) {
                file = path.resolve(`${parse.dir}/_${parse.name}.scss`);

                if (!fs.existsSync(file)) {
                    return '';
                }
            }

            return scssCombine(fs.readFileSync(file).toString(), path.dirname(file));
        });
    }

    return content;
}
