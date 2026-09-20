# @vladcealicu/ui

Native component examples for the main application. Components use browser-standard HTML, CSS, and JavaScript; Storybook is used only for local development and documentation.

## Viewing

Open `index.html` directly, or launch the component catalog with:

```powershell
npm run storybook
```

Then visit `http://localhost:6006`.

## Usage

Use semantic HTML with a component class and import JavaScript only when a component needs behavior:

```html
<button class="btn btn-primary" type="button">Deploy component</button>
```

Add `.btn` and one variant: `.btn-primary`, `.btn-secondary`, `.btn-success`, `.btn-danger`, or `.btn-outline-primary`. Use `.btn-sm` or `.btn-lg` for size.

Keep each reusable component's markup, styles, and optional behavior near one another under `src/`. Prefer a normal HTML pattern first; introduce a custom element only when the same interactive widget must be embedded independently across different pages or applications.
