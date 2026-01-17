import fs       from 'fs-extra';
import {minify} from 'terser';
import path     from 'path';

const [,, source, target] = process.argv;

if (!source || !target) {
    console.error('Usage: node minifyFile.mjs <source> <target>');
    process.exit(1);
}

(async () => {
    try {
        const code   = fs.readFileSync(source, 'utf8');
        const result = await minify(code, {module: true});

        fs.mkdirpSync(path.dirname(target));
        fs.outputFileSync(target, result.code);
    } catch (e) {
        console.error('Minification failed:', e);
        process.exit(1);
    }
})();