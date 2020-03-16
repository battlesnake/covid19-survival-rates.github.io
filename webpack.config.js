const path = require('path');

module.exports = {
	entry: {
		index: './src/script.ts',
		vendor: ['d3', 'moment', 'lodash'],
	},
	devtool: 'inline-source-map',
	module: {
		rules: [
			{
				test: /\.ts$/,
				use: 'ts-loader',
				exclude: /node_modules\//,
			},
		],
	},
	resolve: {
		extensions: ['.ts', '.js'],
	},
	output: {
		filename: '[name].js',
		path: path.resolve(__dirname, 'bin'),
	},
};
