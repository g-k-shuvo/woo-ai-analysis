const defaultConfig = require('@wordpress/scripts/config/webpack.config');
const path = require('path');

module.exports = {
  ...defaultConfig,
  entry: {
    admin: path.resolve(__dirname, 'admin/src/index.js'),
  },
  output: {
    ...defaultConfig.output,
    path: path.resolve(__dirname, 'assets/js'),
    filename: '[name].js',
  },
};
