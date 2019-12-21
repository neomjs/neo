const fs                   = require('fs'),
      path                 = require('path'),
      MiniCssExtractPlugin = require("mini-css-extract-plugin"),
      processRoot          = process.cwd(),
      packageJson          = JSON.parse(fs.readFileSync(path.resolve(processRoot, 'package.json'), 'utf8')),
      neoPath              = packageJson.name === 'neo.mjs' ? './' : './node_modules/neo.mjs/';

module.exports = env => {
    const config = JSON.parse(fs.readFileSync(path.resolve(neoPath, 'buildScripts/webpack/production/json/', env.json_file)), 'utf8');

    return {
        mode : 'production',
        entry: config.entry,

        plugins: [
            new MiniCssExtractPlugin({filename: config.output}) // remove this one to directly insert the result into a style tag
        ],

        output: {
            path    : path.resolve(processRoot, config.buildFolder),
            filename: 'tmpWebpackCss.js'
        },

        module: {
            rules: [{
                test: /\.scss$/,
                use : [
                    'style-loader',
                    MiniCssExtractPlugin.loader,
                    {
                        loader : 'css-loader',
                        options: {
                            importLoaders: 2 // 0 => no loaders (default); 1 => postcss-loader; 2 => postcss-loader, sass-loader
                        }
                    },
                    {
                        loader : 'postcss-loader',
                        options: {
                            config: {
                                path: path.resolve(neoPath, 'buildScripts/webpack/production/')
                            }
                        }
                    },
                    'sass-loader'
                ]
            }]
        }
    }
};