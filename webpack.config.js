const path = require('path');

module.exports = {
	entry: {
		index: './src/script.ts',
		vendor: ['d3', 'd3-time', 'd3-color', 'lodash'],
	},
	devtool: 'source-map',
	module: {
		rules: [
			{
				test: /\.ts$/,
				use: 'ts-loader',
				exclude: /node_modules/,
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
	optimization: {
		splitChunks: {
			cacheGroups: {
				vendor: {
					test: /node_modules/,
					name: 'vendor',
					enforce: true,
					chunks: 'all',
				},
			},
		},
	},
};
