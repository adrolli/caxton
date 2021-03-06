const fs = require( 'fs' );
const browserify = require( 'browserify' );

browserify( './assets/blocks.es6' )
	.transform( 'babelify', {presets: ['@babel/preset-env']} )
	.transform( 'uglifyify' )
	.bundle()
	.pipe( fs.createWriteStream( './assets/blocks.js' ) );

browserify( './assets/caxton.es6' )
	.transform( 'babelify', {presets: ['@babel/preset-env']} )
	.transform( 'uglifyify' )
	.bundle()
	.pipe( fs.createWriteStream( './assets/caxton.js' ) );

console.log( 'Compiled' );