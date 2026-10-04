// Pure logic: what a page weighs, what the plugin or theme adds, and whether that fits the budget.

// [ key, label, unit ]: byte metrics are shown with " B".
export const METRICS = [
	[ 'js', 'JavaScript', ' B' ],
	[ 'css', 'CSS', ' B' ],
	[ 'requests', 'Requests', '' ],
	[ 'html', 'Markup', ' B' ],
	[ 'a11y', 'Accessibility issues', '' ],
];

// European number format: dot between thousands, also for four-digit numbers (1.234).
const NUMBER = new Intl.NumberFormat( 'it-IT', { useGrouping: 'always' } );

/**
 * A number in European format with its unit, optionally signed ("+2.690 B").
 *
 * @param {number|null} value
 * @param {string} unit
 * @param {boolean} signed
 */
export function formatNumber( value, unit = '', signed = false ) {
	if ( null === value ) {
		return '';
	}
	return ( signed && value > 0 ? '+' : '' ) + NUMBER.format( value ) + unit;
}

/**
 * Accessibility issues the plugin adds, as "rule: target" strings. Compared by count per rule,
 * not by selector: the same element can get a different selector when classes change order.
 *
 * @param {string[]} withIssues
 * @param {string[]} withoutIssues
 */
export function addedIssues( withIssues, withoutIssues ) {
	const rule = ( issue ) => issue.slice( 0, issue.indexOf( ':' ) );
	const before = {};
	for ( const issue of withoutIssues ) {
		before[ rule( issue ) ] = ( before[ rule( issue ) ] || 0 ) + 1;
	}
	return withIssues.filter( ( issue ) => {
		const left = before[ rule( issue ) ] || 0;
		before[ rule( issue ) ] = left - 1;
		return left <= 0;
	} );
}

/**
 * Compare one page measured with and without the plugin against the budget.
 * Budget keys are optional; a missing key means no limit for that metric.
 *
 * @param {{js:number,css:number,requests:number,html:number}} withIt
 * @param {{js:number,css:number,requests:number,html:number}} without
 * @param {string[]} issues Accessibility issues added by the plugin.
 * @param {Record<string, number>} budget
 */
export function evaluate( withIt, without, issues, budget = {} ) {
	return METRICS.map( ( [ key, label, unit ] ) => {
		const added = 'a11y' === key ? issues.length : withIt[ key ] - without[ key ];
		const limit = budget[ key ];
		return {
			key,
			label,
			unit,
			without: 'a11y' === key ? null : without[ key ],
			with: 'a11y' === key ? null : withIt[ key ],
			added,
			limit: undefined === limit ? null : limit,
			ok: undefined === limit || added <= limit,
		};
	} );
}

/**
 * Markdown report for all pages; returns the text and whether every row passed.
 *
 * @param {{path:string, rows:ReturnType<typeof evaluate>, issues:string[]}[]} pages
 * @param {string} name Plugin or theme slug.
 */
export function report( pages, name ) {
	const lines = [ `## wp-lean-check: ${ name }`, '' ];
	let pass = true;
	for ( const page of pages ) {
		lines.push( `### \`${ page.path }\``, '', '| Metric | Without | With | Added | Budget | |', '| --- | ---: | ---: | ---: | ---: | --- |' );
		for ( const row of page.rows ) {
			pass = pass && row.ok;
			const added = formatNumber( row.added, row.unit, 'a11y' !== row.key );
			const cells = [ row.label, formatNumber( row.without, row.unit ), formatNumber( row.with, row.unit ), `**${ added }**`, formatNumber( row.limit, row.unit ), row.ok ? '✅ pass' : '❌ over' ];
			lines.push( `| ${ cells.join( ' | ' ) } |` );
		}
		if ( page.issues.length ) {
			lines.push( '', 'Accessibility issues added:', '', ...page.issues.map( ( issue ) => `- ${ issue }` ) );
		}
		lines.push( '' );
	}
	lines.push( pass ? 'Result: ✅ **within budget**' : 'Result: ❌ **over budget**' );
	return { text: lines.join( '\n' ), pass };
}
