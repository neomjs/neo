const fs                   = require('fs'),
      path                 = require('path'),
      MiniCssExtractPlugin = require("mini-css-extract-plugin");

module.exports = env => {
    const config = JSON.parse(fs.readFileSync('./buildScripts/webpack/production/json/' + env.json_file));

    return {
        mode : 'production',
        entry: config.entry,

        plugins: [
            new MiniCssExtractPlugin({filename: config.output}) // remove this one to directly insert the result into a style tag
        ],

        output: {
            path    : path.resolve(__dirname, config.buildFolder),
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
                                path: './buildScripts/webpack/production'
                            }
                        }
                    },
                    'sass-loader'
                ]
            }]
        }
    }
};