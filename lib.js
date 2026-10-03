// Pure logic: what a page weighs, what the plugin or theme adds, and whether that fits the budget.

export const METRICS = [
	[ 'js', 'JavaScript (bytes)' ],
	[ 'css', 'CSS (bytes)' ],
	[ 'requests', 'Requests' ],
	[ 'html', 'Markup (bytes)' ],
	[ 'a11y', 'Accessibility issues' ],
];

/**
 * Accessibility issues present with the plugin and absent without it, as "rule: target" strings.
 *
 * @param {string[]} withIssues
 * @param {string[]} withoutIssues
 */
export function addedIssues( withIssues, withoutIssues ) {
	const before = new Set( withoutIssues );
	return [ ...new Set( withIssues ) ].filter( ( issue ) => ! before.has( issue ) );
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
	return METRICS.map( ( [ key, label ] ) => {
		const added = 'a11y' === key ? issues.length : withIt[ key ] - without[ key ];
		const limit = budget[ key ];
		return {
			key,
			label,
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
	const show = ( value ) => ( null === value ? '' : String( value ) );
	const lines = [ `## wp-lean-check: ${ name }`, '' ];
	let pass = true;
	for ( const page of pages ) {
		lines.push( `### \`${ page.path }\``, '', '| Metric | Without | With | Added | Budget | |', '| --- | ---: | ---: | ---: | ---: | --- |' );
		for ( const row of page.rows ) {
			pass = pass && row.ok;
			const added = 'a11y' === row.key ? row.added : `${ row.added > 0 ? '+' : '' }${ row.added }`;
			lines.push( `| ${ row.label } | ${ show( row.without ) } | ${ show( row.with ) } | ${ added } | ${ show( row.limit ) } | ${ row.ok ? 'pass' : '**over**' } |` );
		}
		if ( page.issues.length ) {
			lines.push( '', 'Accessibility issues added:', '', ...page.issues.map( ( issue ) => `- ${ issue }` ) );
		}
		lines.push( '' );
	}
	lines.push( pass ? 'Result: **pass**' : 'Result: **over budget**' );
	return { text: lines.join( '\n' ), pass };
}
