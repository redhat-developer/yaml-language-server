'use strict';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');

/**@type {import('webpack').Configuration}*/
const config = {
  target: 'node',
  node: {
    __dirname: false,
    __filename: false,
  },
  entry: './src/server.ts',
  output: {
    path: path.resolve(__dirname, 'out', 'server'),
    filename: 'language_server.js',
  },
  externals: {
    prettier: 'commonjs prettier',
  },
  devtool: 'source-map',
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: [/node_modules/, path.resolve(__dirname, 'test')],
        include: path.resolve(__dirname, 'src'),
        use: [
          {
            loader: 'ts-loader',
          },
        ],
      },
      {
        test: /node_modules[\\|/](vscode-json-languageservice)/,
        use: { loader: 'umd-compat-loader' },
      },
    ],
  },
};
module.exports = config;
