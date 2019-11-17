const Markdown = require('markdown-to-html').Markdown, // see https://github.com/cwjohan/markdown-to-html
      md       = new Markdown(),
      fs       = require('fs');

md.bufmax = 2048;

let fileName = './docs/tutorials/10_BuildScripts.md',
    opts     = {title: 'File $BASENAME in $DIRNAME', stylesheet: 'test/style.css'};

const access = fs.createWriteStream('./docs/tutorials/10_BuildScripts.html');
process.stdout.write = process.stderr.write = access.write.bind(access);

md.render(fileName, opts, function(err) {
    if (err) {
        console.error('>>>' + err);
        process.exit();
    }

    md.pipe(process.stdout);
});