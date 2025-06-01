import {minify} from 'html-minifier-terser';

const
    regexBlankAfterColon  = /: /g,
    regexBlankAfterComma  = /, /g,
    regexIndexNodeModules = /node_modules/g;

export async function minifyHtml(content) {
    const minifiedContent = await minify(content, {
        collapseWhitespace           : true,
        minifyCSS                    : true,
        minifyJS                     : true,
        processScripts               : ['application/ld+json'],
        removeComments               : true,
        removeEmptyAttributes        : true,
        removeRedundantAttributes    : true,
        removeScriptTypeAttributes   : true,
        removeStyleLinkTypeAttributes: true,
        useShortDoctype              : true
    });

    return minifiedContent
        .replace(regexBlankAfterColon,  ':')
        .replace(regexBlankAfterComma,  ',')
        .replace(regexIndexNodeModules, '../../node_modules')
}
