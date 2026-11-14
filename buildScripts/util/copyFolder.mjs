import {Command}       from 'commander';
import fs              from 'fs-extra';
import path            from 'path';
import {sanitizeInput} from './sanitizer.mjs';

const program = new Command('copyFolder')
    .version('1.0.0')
    .option('-s, --source <value>', 'path to the source folder', sanitizeInput)
    .option('-t, --target <value>', 'path to the target folder', sanitizeInput)
    .option('-i, --include <value>', 'comma-separated paths, relative to the source, to copy instead of the whole folder')
    .option('-x, --exclude <value>', 'comma-separated paths, relative to the source, to omit when copying the folder')
    .allowUnknownOption()
    .parse(process.argv);

const programOpts = program.opts();

if (!programOpts.source) {
    throw new Error('Missing -s param');
}

if (!programOpts.target) {
    throw new Error('Missing -t param');
}

const excluded = new Set(
    (programOpts.exclude || '')
        .split(',')
        .map(item => item.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))
        .filter(Boolean)
);

fs.mkdirpSync(programOpts.target, {recursive: true});

if (programOpts.include) {
    // Copy only the listed files and folders, keeping their relative paths
    programOpts.include.split(',').map(item => item.trim()).filter(Boolean).forEach(item => {
        const normalizedItem = item.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

        if (!excluded.has(normalizedItem)) {
            fs.copySync(path.join(programOpts.source, item), path.join(programOpts.target, item))
        }
    })
} else {
    fs.copySync(programOpts.source, programOpts.target, excluded.size ? {
        filter: src => {
            const rel = path.relative(programOpts.source, src).replace(/\\/g, '/');
            return !rel || !excluded.has(rel)
        }
    } : undefined)
}

for (const rel of excluded) {
    fs.removeSync(path.join(programOpts.target, rel))
}
