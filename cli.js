#!/usr/bin/env node
// wp-lean-check: boots WordPress Playground with your plugin or theme, loads each page with and
// without it, and reports the bytes, requests and accessibility issues it adds against a budget.

import { spawn, execSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { addedIssues, evaluate, report } from './lib.js';

const require = createRequire( import.meta.url );
const here = dirname( new URL( import.meta.url ).pathname.replace( /^\/([A-Za-z]:)/, '$1' ) );
const A11Y_TAGS = [ 'wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa' ];
const VIEWPORTS = { desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 } };

const { values: args } = parseArgs( {
	options: {
		dir: { type: 'string', default: '.' },
		config: { type: 'string', default: 'lean.json' },
		port: { type: 'string', default: '9450' },
	},
} );

const dir = resolve( args.dir );
const config = JSON.parse( readFileSync( join( dir, args.config ), 'utf8' ) );
if ( ! [ 'plugin', 'theme' ].includes( config.type ) || ! /^[a-z0-9-]+$/.test( config.slug || '' ) ) {
	fail( 'lean.json needs "type" ("plugin" or "theme") and a lowercase "slug".' );
}

const blueprint = config.blueprint ? JSON.parse( readFileSync( join( dir, config.blueprint ), 'utf8' ) ) : {};
const vfs = `/wordpress/wp-content/${ config.type }s/${ config.slug }`;
blueprint.steps = [
	{ step: 'defineWpConfigConsts', consts: { LEAN_SLUG: config.slug, LEAN_TYPE: config.type } },
	{ step: 'writeFile', path: '/wordpress/wp-content/mu-plugins/lean-toggle.php', data: readFileSync( join( here, 'lean-toggle.php' ), 'utf8' ) },
	'plugin' === config.type ? { step: 'activatePlugin', pluginPath: vfs } : { step: 'activateTheme', themeFolderName: config.slug },
	...( blueprint.steps || [] ),
];
const blueprintPath = join( mkdtempSync( join( tmpdir(), 'lean-' ) ), 'blueprint.json' );
writeFileSync( blueprintPath, JSON.stringify( blueprint ) );

const server = await startPlayground();
const browser = await chromium.launch();
const axeSource = readFileSync( require.resolve( 'axe-core/axe.min.js' ), 'utf8' );

try {
	const pages = [];
	for ( const path of config.pages || [ '/' ] ) {
		const url = new URL( path, server.url );
		const off = new URL( url );
		off.searchParams.set( 'lean', 'off' );

		const withIt = await measure( url );
		const without = await measure( off );
		const issues = [];
		for ( const viewport of Object.keys( VIEWPORTS ) ) {
			const added = addedIssues( await a11y( url, viewport ), await a11y( off, viewport ) );
			issues.push( ...added.map( ( issue ) => `${ issue } (${ viewport })` ) );
		}
		pages.push( { path, rows: evaluate( withIt, without, issues, config.budget ), issues } );
	}

	const { text, pass } = report( pages, config.slug );
	process.stdout.write( text + '\n' );
	if ( process.env.GITHUB_STEP_SUMMARY ) {
		appendFileSync( process.env.GITHUB_STEP_SUMMARY, text + '\n' );
	}
	process.exitCode = pass ? 0 : 1;
} finally {
	await browser.close();
	stop( server.child );
}

/** Weight of one page: external and inline JS and CSS, requests after the document, markup. */
async function measure( url ) {
	const page = await browser.newPage( { viewport: VIEWPORTS.desktop } );
	const responses = [];
	page.on( 'response', ( response ) => responses.push( response ) );
	await page.goto( url.href, { waitUntil: 'networkidle' } );

	const totals = { js: 0, css: 0, requests: 0, html: 0 };
	for ( const response of responses ) {
		const type = response.request().resourceType();
		const size = await response.body().then( ( body ) => body.length, () => 0 );
		if ( 'document' === type && response.frame() === page.mainFrame() ) {
			totals.html = size; // Last main-frame document wins, after any redirect.
			continue;
		}
		totals.requests++;
		if ( 'script' === type ) {
			totals.js += size;
		} else if ( 'stylesheet' === type ) {
			totals.css += size;
		}
	}
	const inline = await page.evaluate( () => {
		const length = ( selector, keep = () => true ) =>
			[ ...document.querySelectorAll( selector ) ].filter( keep ).reduce( ( sum, el ) => sum + el.textContent.length, 0 );
		return {
			js: length( 'script:not([src])', ( s ) => ! s.type || /javascript|module/.test( s.type ) ),
			css: length( 'style' ),
			code: length( 'script:not([src])' ) + length( 'style' ),
		};
	} );
	await page.close();
	// Inline JS and CSS are counted once, under js and css; markup is the rest of the document.
	return { ...totals, js: totals.js + inline.js, css: totals.css + inline.css, html: totals.html - inline.code };
}

/** WCAG 2.2 AA violations from axe-core, as "rule: selector" strings. */
async function a11y( url, viewport ) {
	const page = await browser.newPage( { viewport: VIEWPORTS[ viewport ] } );
	await page.goto( url.href, { waitUntil: 'networkidle' } );
	await page.addScriptTag( { content: axeSource } );
	const issues = await page.evaluate( async ( tags ) => {
		const result = await window.axe.run( document, { runOnly: { type: 'tag', values: tags } } );
		return result.violations.flatMap( ( v ) => v.nodes.map( ( n ) => `${ v.id }: ${ n.target.join( ' ' ) }` ) );
	}, A11Y_TAGS );
	await page.close();
	return issues;
}

/** Start `wp-playground server` with the project mounted and wait for its URL. */
function startPlayground() {
	const bin = join( dirname( require.resolve( '@wp-playground/cli/package.json' ) ), 'wp-playground.js' );
	const child = spawn( process.execPath, [ bin, 'server', `--port=${ args.port }`, '--mount-dir', dir, vfs, `--blueprint=${ blueprintPath }` ] );
	return new Promise( ( done, reject ) => {
		let log = '';
		const timer = setTimeout( () => reject( new Error( 'Playground did not start in 5 minutes:\n' + log ) ), 300000 );
		const read = ( chunk ) => {
			log += chunk;
			const match = log.match( /Ready!.*?(http:\/\/[\w.:]+)/ );
			if ( match ) {
				clearTimeout( timer );
				done( { child, url: match[ 1 ] + '/' } );
			}
		};
		child.stdout.on( 'data', read );
		child.stderr.on( 'data', read );
		child.on( 'exit', ( code ) => reject( new Error( `Playground exited (${ code }):\n` + log ) ) );
	} );
}

/** Stop Playground and its workers. */
function stop( child ) {
	if ( 'win32' === process.platform ) {
		execSync( `taskkill /pid ${ child.pid } /T /F`, { stdio: 'ignore' } );
	} else {
		child.kill();
	}
}

function fail( message ) {
	process.stderr.write( message + '\n' );
	process.exit( 2 );
}
