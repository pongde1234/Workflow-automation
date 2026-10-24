# iosense Workflow Automation

A high-fidelity, interactive prototype of workflow automation for the iosense IoT platform, built on the Faclon Design System (`@faclon-labs/fds`). Plant teams build a flow on a canvas: a trigger (a form, a schedule or a device alert), then switches, delays and actions (email, SMS, work orders, reports). They then validate it, test it with sample data, publish it and look back through its run history.

Everything runs in the browser. Workflows are stored in localStorage and run history in IndexedDB. Nothing is sent and no server is involved.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 (or pass --port)
npm test           # engine unit tests (vitest)
npm run build      # typecheck + production build
```

The first load seeds a sample workspace with seven workflows and their run history. To start over, clear the site's storage in the browser.

## What you can do

- **Workflows list** (`/iosense/workflows`): search, filter by status, sort, and switch between a table and cards. Create, rename, duplicate and delete workflows.
- **Nodes**, picked for plant use cases:

  | Kind | Nodes |
  |---|---|
  | Triggers | IO Forms (a form is submitted), Scheduler (a set time), Device alert (a sensor reading crosses a limit, optionally for a few minutes) |
  | Flow control | Switch (conditions checked top to bottom, first match wins, plus Default), Delay (wait before the next node) |
  | Notify people | Email, SMS (people's mobile numbers or typed numbers) |
  | Maintenance and reports | Work order (title, priority, assignee), Report (energy, OEE, shift or quality report as PDF or Excel, emailed) |

- **Adding a node:** every **+** opens the *Add a node* window. It has a search (Enter picks the first match) and the node types under section headings.
- **Canvas** (built on [React Flow](https://reactflow.dev)):
  - Nodes are FDS Cards.
  - Pan, zoom (Ctrl/⌘ + wheel, pinch or the buttons) and fit to view.
  - Drag a node to move it; this works on touch too.
  - To connect, drag from either dot onto another node.
  - Every connection has a **+** to insert a node in between, and clicking a line shows **×** to remove it.
  - Every drag action also has a non-drag route in the node's ⋯ menu.
- **Configuring a node:** click it to open its drawer. Fields validate as you go, and **{ }** (or typing `/`) inserts a value from the trigger, such as a form field.
- **Validation:** issues are listed in the toolbar. Errors block Test and Publish; warnings don't.
- **Test runs:** the logs panel docks under the canvas and can be resized up to half the screen.
  - The left side shows each node's result and timing; the right side shows its Output / Input.
  - Links animate while a test runs, and the path taken stays solid.
- **History:** a drawer lists every run, with All / Failed tabs.
  - Picking a run shows it on the canvas and opens the node that failed.
  - **Back to current run** returns to your latest test.
- **Lifecycle:** Draft → Active ⇄ Paused. Changes to a published workflow wait for **Publish changes**, or you can discard them.
- **Keyboard:**
  - Tab walks the flow; ←/→ follow connections; ↑/↓ move between Switch outputs.
  - Enter opens a node; Shift+F10 opens its menu; Delete removes it.
  - Ctrl/⌘+Z and Shift+Z undo and redo.

| Real in the browser | Simulated |
|---|---|
| Workflows saved to localStorage (`iosense-workflows`), runs to IndexedDB (`iosense-executions`) | Emails, texts, work orders and reports: nothing is sent or created |
| Validation, Switch evaluation, recipient and phone-number resolution, test runs | Schedules, form listeners and device readings: active workflows don't run on their own (a test asks for a sample submission or reading); sample history is seeded. Delays don't really wait. |

**Prototype URL flags** (no extra UI):
- On the listing, add `?demo=empty`, `?demo=loading` or `?demo=error` to see those states.
- On any workflow page, add `?demo=save-error` to see a failed save.

## Layout

```
src/
  App.tsx              the app shell (FDS AppShell): sidebar, breadcrumb, routes
  main.tsx             entry point; loads FDS styles and fonts
  iosense/             the workflow automation module
    module.tsx         its nav, pages, breadcrumb and layout, read by App.tsx
    domain/            data model, node types, trigger variables
    engine/            graph rules, validation, simulation, schedules (+ unit tests)
    store/             zustand stores (workflows, run history, session state)
    canvas/            React Flow canvas, node cards, edges, node picker
    nodes/             the node drawer and one form per node type
    pages/             list page, editor, toolbar, logs panel, history drawer
    seed/              sample workspace and run history
    ui/                small shared pieces (status labels, tiles, tables)
  lib/, engine/, catalog/   small shared helpers (ids and formatting, value templates, cron)
```

## Design system

The UI uses FDS components and tokens only: no raw colours, spacing or z-indexes. Each component is used the way its guard file (`node_modules/@faclon-labs/fds/dist/components/**/*.guard.json`) prescribes.

**FDS gaps and the fallbacks used:**

| Not built in FDS | Fallback |
|---|---|
| Canvas / graph component | React Flow underneath; FDS Card, Button and tokens on top |
| Time input | An AutoComplete of 15-minute steps |
| Segmented control | Filled Tabs where a choice swaps the region below; RadioGroup elsewhere |
| In-page z-index token | Canvas layers follow DOM order |
| Breakpoint tokens | FDS's own 480 / 768 / 1024 |
| Exported reduced-motion helper | Checked with `matchMedia` |
