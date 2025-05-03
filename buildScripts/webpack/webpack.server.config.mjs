export default {
    mode: 'production',

    devServer: {
        static: {
            directory: process.cwd(),
            watch    : false
        }
    }
};
