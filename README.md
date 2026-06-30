# life — study & work tracker

A local, matte-themed dashboard that breaks down school work and things to learn
into checkable tasks. All data lives in plain, hand-editable `.json` files in `data/`.

## Run

```bash
npm install
npm run dev
```

Then open http://localhost:5173

- `npm run dev` starts both the web app (Vite, port 5173) and a tiny data server
  (Express, port 5174) that reads/writes the JSON files.
- Edits in the UI are auto-saved back to the matching file in `data/`.
- You can also edit the `.json` files directly in your editor; refresh the page to load changes.

## Data format

Each track is one file: `data/<id>.json`. A track holds a recursive **tree of nodes**
that renders as a branching roadmap (central spine, topics branching left/right,
children nesting to any depth, with dependency arrows).

```jsonc
{
  "id": "python",            // must match the filename (no extension)
  "title": "Python",         // shown in the sidebar
  "order": 1,                 // sort order in the sidebar
  "accent": "#4f9d69",       // accent color for this track
  "info": "free notes / links",
  "nodes": [
    {
      "id": "py-fund",                  // unique within the file
      "title": "Language Fundamentals",
      "status": "todo",                // "todo" | "doing" | "done"
      "due": "",                        // "" or YYYY-MM-DD
      "notes": "",
      "link": "",                        // optional URL
      "side": "left",                   // top-level only: "left" | "right" of the spine
      "requires": [],                    // ids that must be complete before this unlocks
      "children": [                      // recurse to any depth — every node is checkable
        {
          "id": "py-1",
          "title": "Variables, data types, type conversion",
          "status": "todo", "due": "", "notes": "", "link": "",
          "requires": []
        },
        {
          "id": "py-2",
          "title": "Operators",
          "status": "todo", "due": "", "notes": "", "link": "",
          "priority": "p1",              // optional: "p0" | "p1" | "p2" | "p3"
          "tags": ["fundamentals"],      // optional free-form tags
          "requires": ["py-1"]          // unlocks once py-1 is done
        }
      ]
    }
  ]
}
```

Notes on the model:
- **Every node is checkable** and can have `children` to any depth.
- `side` (top-level nodes only) picks which side of the central spine the topic + its
  whole subtree sit on. Children inherit their topic's side.
- `requires` lists prerequisite node ids. A node is **"next up"** when all its
  prerequisites are complete but it isn't done yet — these glow with a *NEXT UP* badge
  and are collected on the Dashboard.
- `priority` (optional) is `p0`–`p3` and renders a color-coded pill; "next up" lists
  sort high-priority first. `tags` (optional) render as chips and are filterable.
- A branch counts as complete when every leaf under it is done (or you mark it done).
- Transient UI state (collapse/expand) lives in `localStorage`, never in these files.
  Run `npm run normalize` to canonicalize key order across all data files.
- Old `sections[].tasks[]` files still load — they're auto-migrated to `nodes` on read.

### Add a new track
Use the **+ Track** button in the sidebar, or drop a new `data/<id>.json` file
following the format above.

### Working with nodes
- Click the checkbox to cycle status: todo → doing → done → todo.
- Click **⋯** on a node for an anchored editor: set **priority**, add **tags**, set a
  due date / link, **+ child**, or delete it.
- Topics with children show a collapse arrow (▾ / ▸).
- Set a due date and it shows up under **Upcoming deadlines** on the Dashboard.
- Overdue / soon (within 3 days) dates are color-highlighted.
- The roadmap scrolls horizontally when deep subtrees extend past the viewport.

### Search & filters (filter bar above the tree)
- **Search** — text match across title, notes, and tags; non-matching nodes dim while
  the tree shape stays intact for context.
- **Status** — segmented All / Todo / Doing / Done.
- **Priority** / **Tags** — multi-select dropdowns.
- **Next up** — toggle to show only currently-unlocked, actionable nodes.
- **⊕ / ⊖** — expand-all / collapse-all.

### Collapse behavior
On first open, every topic collapses to its title **except** topics that contain a
"next up" node (those auto-expand to guide focus). Your expand/collapse choices persist
per track in `localStorage`. Active filters temporarily expand any branch on the path to
a match so results are always visible.

### Import / export (edit with an LLM)
- **Export JSON** (track header) downloads that one track as `<id>.json`.
- **Export all** (sidebar) downloads every track as `life-tracks.json`.
- **Import** (sidebar) uploads a `.json` file. It accepts either a bare track object or a
  single-track bundle (`{"tracks":[ ... ]}` with exactly one). If the `id` matches an
  existing track it **replaces** it; otherwise it creates a new one.
- Import is validated and forgiving: it repairs missing optional fields (e.g. defaults
  `status` to `todo`, generates a missing `id`) and rejects real problems with a clear
  message — bad JSON, missing title/nodes, an invalid priority, duplicate ids, or a
  `requires` pointing at a node that doesn't exist.

Typical workflow: **Export → hand the file (and the "Data format" section above) to an
LLM → ask it to reformat/expand → Import the result.**

## Seeded tracks
- **Python** — from roadmap.sh/python
- **Backend** — from roadmap.sh/backend
- **Summer Course** — fill in your units/assignments
- **Internship** — onboarding, goals, milestones

Light and dark matte themes — toggle in the sidebar. See `DESIGN.md` for the design system.
