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
      scssPath           = 'resources/scss/',
      themeMapFile       = 'resources/theme-map.json',
      themeMapFileNoVars = 'resources/theme-map-no-vars.json';

fs.watch(path.resolve(neoPath, 'resources/scss'), {
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
}
