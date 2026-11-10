import {Command}       from 'commander';
import fs              from 'fs-extra';
import path            from 'path';
import {sanitizeInput} from './sanitizer.mjs';

const program = new Command('copyFolder')
    .version('1.0.0')
    .option('-s, --source <value>', 'path to the source folder', sanitizeInput)
    .option('-t, --target <value>', 'path to the target folder', sanitizeInput)
    .option('-i, --include <value>', 'comma-separated paths, relative to the source, to copy instead of the whole folder')
    .allowUnknownOption()
    .parse(process.argv);

const programOpts = program.opts();

if (!programOpts.source) {
    throw new Error('Missing -s param');
}

if (!programOpts.target) {
    throw new Error('Missing -t param');
}

fs.mkdirpSync(programOpts.target, {recursive: true});

if (programOpts.include) {
    // Copy only the listed files and folders, keeping their relative paths
    programOpts.include.split(',').map(item => item.trim()).filter(Boolean).forEach(item => {
        fs.copySync(path.join(programOpts.source, item), path.join(programOpts.target, item))
    })
} else {
    fs.copySync(programOpts.source, programOpts.target)
}

