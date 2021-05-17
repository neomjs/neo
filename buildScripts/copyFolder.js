'use strict';

const commander = require('commander'),
      fs        = require('fs-extra');

const program = new commander.Command('copyFolder')
    .version('1.0.0')
    .option('-s, --source <value>', 'path to the source folder')
    .option('-t, --target <value>', 'path to the target folder')
    .allowUnknownOption()
    .parse(process.argv);

const programOpts = program.opts();

if (!programOpts.source) {
    throw new Error('Missing -s param');
}

if (!programOpts.target) {
    throw new Error('Missing -t param');
}

fs.mkdirpSync(programOpts.target);
fs.copySync(programOpts.source, programOpts.target);
