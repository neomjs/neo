import autoprefixer from 'autoprefixer';
import chalk        from 'chalk';
import fs           from 'fs-extra';
import path         from 'path';
import postcss      from 'postcss';
import * as sass    from 'sass';

let cwd         = process.cwd(),
    requireJson = path => JSON.parse(fs.readFileSync((path))),
    packageJson = requireJson(path.resolve(cwd, 'package.json')),
    neoPath     = packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/',
    mixinPath   = path.resolve(neoPath, 'resources/scss/mixins/_all.scss'),
    scssPath    = path.resolve(cwd, 'resources/scss');

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
        map;

    try {
        let result = sass.compile(filePath, {
            outFile                : destPath,
            sourceMap              : true,
            sourceMapIncludeSources: true
        });

        map = result.sourceMap;

        postcss([autoprefixer]).process(result.css, {
            from: filePath,
            to  : destPath,
            map : {
                inline: false,
                prev  : map && JSON.stringify(map)
            }
        }).then(postcssResult => {
            map = postcssResult.map;

            fs.writeFileSync(destPath, postcssResult.css, () => true);

            if (map) {
                let mapString = map.toString(),
                    jsonMap   = JSON.parse(mapString),
                    sources   = jsonMap.sources;

                // Somehow files contain both: a relative & an absolute file url
                // We only want to keep the relative ones.
                [...sources].forEach((item, index) => {
                    if (!item.startsWith('../')) {
                        sources.splice(index, 1);
                    }
                });

                map = JSON.stringify(jsonMap);

                fs.writeFileSync(postcssResult.opts.to + '.map', map);
            }

            const processTime = (Math.round((new Date - startDate) * 100) / 100000).toFixed(2);
            console.log('Updated file:', (chalk.blue(`${processTime}s`)), destPath);
        });
    } catch(error) {
        console.log('SCSS build failed for', chalk.red(filename));
        console.log(error);
    }
}
