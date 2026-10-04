import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addedIssues, evaluate, formatNumber, report } from './lib.js';

const without = { js: 1000, css: 2000, requests: 5, html: 9000 };
const withIt = { js: 1000, css: 3100, requests: 5, html: 9500 };

test( 'only issues that appear with the plugin count, compared per rule', () => {
	assert.deepEqual( addedIssues( [ 'a: #x', 'b: #y' ], [ 'a: #x' ] ), [ 'b: #y' ] );
	// Same violation, selector with classes in another order: not added.
	assert.deepEqual( addedIssues( [ 'list: .a.b' ], [ 'list: .b.a' ] ), [] );
	// One more occurrence of a rule than before: one added.
	assert.deepEqual( addedIssues( [ 'list: .a', 'list: .c' ], [ 'list: .b' ] ), [ 'list: .c' ] );
} );

test( 'budget: added bytes within limits pass, over limits fail, missing keys are unlimited', () => {
	const rows = evaluate( withIt, without, [], { js: 0, css: 1000 } );
	const byKey = Object.fromEntries( rows.map( ( row ) => [ row.key, row ] ) );
	assert.equal( byKey.js.added, 0 );
	assert.equal( byKey.js.ok, true );
	assert.equal( byKey.css.added, 1100 );
	assert.equal( byKey.css.ok, false );
	assert.equal( byKey.html.ok, true );
	assert.equal( byKey.a11y.added, 0 );
} );

test( 'report fails when any page is over budget', () => {
	const ok = report( [ { path: '/', rows: evaluate( withIt, without, [], { css: 2000 } ), issues: [] } ], 'demo' );
	const over = report( [ { path: '/', rows: evaluate( withIt, without, [ 'image-alt: img' ], { a11y: 0 } ), issues: [ 'image-alt: img' ] } ], 'demo' );
	assert.equal( ok.pass, true );
	assert.equal( over.pass, false );
	assert.match( over.text, /image-alt: img/ );
} );

test( 'numbers use the European format: dot for thousands, signed when added', () => {
	assert.equal( formatNumber( 68944, ' B' ), '68.944 B' );
	assert.equal( formatNumber( 2690, ' B', true ), '+2.690 B' );
	assert.equal( formatNumber( -1234, ' B', true ), '-1.234 B' );
	assert.equal( formatNumber( 0, '', true ), '0' );
	assert.equal( formatNumber( 1234567 ), '1.234.567' );
	assert.equal( formatNumber( null ), '' );
} );

test( 'report shows formatted bytes', () => {
	const { text } = report( [ { path: '/', rows: evaluate( withIt, without, [], { css: 3000 } ), issues: [] } ], 'demo' );
	assert.match( text, /\| CSS \| 2\.000 B \| 3\.100 B \| \*\*\+1\.100 B\*\* \| 3\.000 B \| ✅ pass \|/ );
} );
