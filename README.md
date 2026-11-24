# Atomic Trello

A small Trello-style board app: boards, lists, cards, drag-and-drop, and data that is saved.
Bonus features: **role-based access** (owner / member / viewer) and an **AI board summary** (Google Gemini).

## Run it

```bash
npm install
cp .env.example .env   # then put your Gemini API key in .env (only needed for the AI summary)
npm start
```

Open http://localhost:3000.

## Try it step by step

1. You start as **Alok**, the owner of "Website Launch" (a ready-made demo board) and "Welcome board". Open one.
2. Drag a card from "To do" to "Done". A blue line shows where it will land.
3. Click a card to edit its title or description.
4. Add a list or a card with the "Add" boxes.
5. Refresh the page or restart the server. Your changes are still there (saved in `data.json`).
6. Switch the top-right user to **Ravi** (member). Ravi can edit cards and lists, but can't delete the board or manage members.
7. Switch to **Tina** (viewer). Tina sees the board as read-only: no dragging, no editing.
8. Back as Alok, use the **Members** panel to change anyone's role or add/remove them.
9. On any board, click **✨ AI summary**. A few seconds later a panel shows an overview, progress per list, anything to watch out for, and suggested next steps.

## AI board summary

- **What it does:** reads every list and card on the board and writes a short status report: *Overview, Progress, Watch out, Next steps*.
- **Why:** on a big board it's hard to see at a glance what's stuck or overloaded. The summary gives a quick catch-up for someone joining the project or preparing a stand-up.
- **How it works:** the browser calls `POST /api/boards/:id/summary`. The server checks the user is on the board (any role, viewers included), turns the board into plain text, and sends it to Gemini (`@google/genai`, model `gemini-flash-latest`, which you can change with `GEMINI_MODEL`) with instructions on the format. The answer is shown in a panel and is not saved.
- **Safety:** the API key stays on the server (in `.env`, which is not committed). Card text is passed to the model as data, not instructions. If no key is set, the button shows a friendly error instead of breaking the app.

## How it is built

| Part | File | What it does |
|------|------|--------------|
| Server | `server.js` | Express API. Saves everything to `data.json`. Checks roles on every request. Calls Gemini for the summary. |
| Page | `public/index.html`, `public/style.css` | Layout and styling. |
| Logic | `public/app.js` | Renders boards, handles drag-and-drop (native HTML5), calls the API. |

### Roles

| Action | Viewer | Member | Owner |
|--------|:-----:|:-----:|:----:|
| See the board | ✅ | ✅ | ✅ |
| Add / edit / move / delete lists and cards | | ✅ | ✅ |
| Rename / delete the board, manage members | | | ✅ |

Roles are checked **on the server**, not only hidden in the UI, so a viewer can't get around them with direct API calls.

### Saving data

All data lives in one JSON file. Every change is written to a temp file first and then renamed into place, so a crash can't leave a half-written file. To reset, delete `data.json` and restart.

 
