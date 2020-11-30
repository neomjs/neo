const fs                   = require('fs'),
      path                 = require('path'),
      buildTarget          = require('./buildTarget.json'),
      MiniCssExtractPlugin = require('mini-css-extract-plugin'),
      processRoot          = process.cwd(),
      packageJson          = require(path.resolve(processRoot, 'package.json')),
      neoPath              = packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/';

module.exports = env => {
    const config    = require(path.resolve(neoPath, 'buildScripts/webpack/json/', env.json_file)),
          insideNeo = env.insideNeo == 'true',
          entryPath = path.resolve(processRoot, config.entry);

    let entry;

    if (!insideNeo && fs.existsSync(entryPath)) {
        entry = entryPath;
    } else {
        entry = path.resolve(neoPath, config.entry);
    }

    return {
        mode   : 'development',
        devtool: 'inline-source-map',
        entry,

        plugins: [
            new MiniCssExtractPlugin({filename: config.output}) // remove this one to directly insert the result into a style tag
        ],

        output: {
            path    : path.resolve(processRoot, buildTarget.folder),
            filename: 'tmpWebpackCss.js'
        },

        module: {
            rules: [{
                test: /\.scss$/,
                use : [
                    'style-loader',
                    {
                        loader: MiniCssExtractPlugin.loader,
                        options: { esModule: false },
                    },
                    {
                        loader : 'css-loader',
                        options: {
                            importLoaders: 2, // 0 => no loaders (default); 1 => postcss-loader; 2 => postcss-loader, sass-loader
                            sourceMap    : true
                        }
                    },
                    {
                        loader : 'postcss-loader',
                        options: {
                            postcssOptions : {
                                config: path.resolve(neoPath, 'buildScripts/webpack/development/')
                            },
                            sourceMap: true
                        }
                    },
                    'sass-loader'
                ]
            }]
        }
    }
};