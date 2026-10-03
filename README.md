# wp-lean-check

How much does your WordPress plugin or theme add to a page, and does it add accessibility issues?

wp-lean-check boots [WordPress Playground](https://wordpress.org/playground/) with your plugin or theme (no Docker, no local WordPress), loads each page **with and without it**, and reports the difference: JavaScript, CSS, requests, markup and WCAG 2.2 AA issues found by [axe-core](https://github.com/dequelabs/axe-core) on desktop and mobile. Set a budget and CI fails when you go over it.

Real output for [Mintchat](https://github.com/massimomazzariol/mintchat), a page with two chat buttons:

| Metric | Without | With | Added | Budget | |
| --- | ---: | ---: | ---: | ---: | --- |
| JavaScript (bytes) | 68944 | 68944 | 0 | 0 | pass |
| CSS (bytes) | 52894 | 55584 | +2690 | 3000 | pass |
| Requests | 5 | 5 | 0 | 0 | pass |
| Markup (bytes) | 11536 | 12406 | +870 | 2000 | pass |
| Accessibility issues |  |  | 0 | 0 | pass |

## Setup

Add `lean.json` to your plugin or theme:

```json
{
	"type": "plugin",
	"slug": "my-plugin",
	"blueprint": "lean/blueprint.json",
	"pages": [ "/" ],
	"budget": { "js": 0, "css": 3000, "requests": 0, "html": 2000, "a11y": 0 }
}
```

- `type`: `plugin` or `theme`. `slug`: the folder name.
- `blueprint` (optional): a [Playground blueprint](https://wordpress.github.io/wordpress-playground/blueprints/) that creates the demo content, for example a page using your block. Your plugin or theme is already mounted and active when it runs.
- `pages`: paths to measure.
- `budget`: the most each metric may grow, per page (bytes for `js`, `css` and `html`). Leave a key out for no limit.

"Without" means the plugin deactivated for that request, or, for a theme, Twenty Twenty-Five.

## Run

GitHub Actions:

```yaml
- uses: actions/checkout@v4
- uses: massimomazzariol/wp-lean-check@v0
```

The table also lands in the job summary. Locally (Node.js 20+):

```sh
npx wp-lean-check --dir path/to/my-plugin
```

Exit code 1 means over budget.

## What it does not do

It does not check WordPress.org rules or coding standards: run the official [Plugin Check action](https://github.com/WordPress/plugin-check-action) next to it. Automated accessibility testing finds part of the problems; keyboard and screen reader checks are still on you.

## License

GPL-2.0-or-later.
