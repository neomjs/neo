import esbuild         from 'esbuild';
import path            from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/**
 * @summary Bundles the installed parse5 package for browser and build-time consumers.
 * @returns {Promise<void>}
 */
const build = async () => {
    try {
        await esbuild.build({
            entryPoints: [fileURLToPath(import.meta.resolve('parse5'))],
            bundle     : true,
            minify     : true,
            format     : 'esm',
            outfile    : path.join(__dirname, '../../dist/parse5.mjs'),
            banner     : {
                js: '/* eslint-disable */'
            }
        });
        console.log('Successfully bundled and minified parse5 to dist/parse5.mjs');
    } catch (error) {
        console.error('Error bundling parse5:', error);
        process.exit(1);
    }
};

build();
