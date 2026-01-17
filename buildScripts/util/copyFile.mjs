import {Command}       from 'commander/esm.mjs';
import fs              from 'fs-extra';
import path            from 'path';
import {sanitizeInput} from './Sanitizer.mjs';

const program = new Command('copyFile')
    .version('1.0.0')
    .option('-s, --source <value>', 'path to the source file', sanitizeInput)
    .option('-t, --target <value>', 'path to the target file', sanitizeInput)
    .allowUnknownOption()
    .parse(process.argv);

const programOpts = program.opts();

if (!programOpts.source) {
    throw new Error('Missing -s param');
}

if (!programOpts.target) {
    throw new Error('Missing -t param');
}

fs.mkdirpSync(path.dirname(programOpts.target));
fs.copySync(programOpts.source, programOpts.target);