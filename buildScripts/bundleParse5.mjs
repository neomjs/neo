import esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const build = async () => {
    try {
        await esbuild.build({
            entryPoints: ['node_modules/parse5/dist/index.js'],
            bundle: true,
            minify: true,
            format: 'esm',
            outfile: path.join(__dirname, '../dist/parse5.mjs'),
            banner: {
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
