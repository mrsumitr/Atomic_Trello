// Front end for Atomic Trello. Plain JavaScript, no framework.

const app = document.getElementById("app");
const userSelect = document.getElementById("userSelect");

let users = [];
let userId = localStorage.getItem("userId") || "u1";
let board = null; // the board currently open

// ---------- Small helpers ----------

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", "x-user-id": userId },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

// Build an element: el("div", { class: "x", onclick: fn }, child1, "text", ...)
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (key === "class") node.className = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    if (child == null || child === false) continue;
    node.append(child);
  }
  return node;
}

function toast(message) {
  const box = document.getElementById("toast");
  box.textContent = message;
  box.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => box.classList.remove("show"), 2500);
}

// Run an action and show any error as a toast instead of crashing.
async function attempt(fn) {
  try {
    await fn();
  } catch (err) {
    toast(err.message);
  }
}

// A one-line "type something + button" form.
function addForm(placeholder, buttonText, onSubmit) {
  const input = el("input", { placeholder });
  const form = el("form", { class: "add-form" }, input, el("button", { class: "primary" }, buttonText));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const value = input.value.trim();
    if (!value) return;
    attempt(async () => {
      await onSubmit(value);
    });
  });
  return form;
}

function canEdit() {
  return board && (board.myRole === "owner" || board.myRole === "member");
}

function isOwner() {
  return board && board.myRole === "owner";
}

// ---------- User picker ----------

async function setupUsers() {
  users = await api("GET", "/api/users");
  userSelect.innerHTML = "";
  for (const u of users) {
    userSelect.append(el("option", { value: u.id }, u.name));
  }
  userSelect.value = userId;
  updateAvatar();
  userSelect.addEventListener("change", () => {
    userId = userSelect.value;
    localStorage.setItem("userId", userId);
    updateAvatar();
    route();
  });
}

// Show the first letter of the signed-in user's name in the round badge.
function updateAvatar() {
  const user = users.find((u) => u.id === userId);
  document.getElementById("userAvatar").textContent = user ? user.name[0].toUpperCase() : "?";
}

// ---------- Home page: list of boards ----------

async function showHome() {
  board = null;
  const boards = await api("GET", "/api/boards");

  const grid = el("div", { class: "board-grid" });
  for (const b of boards) grid.append(boardTile(b));
  grid.append(newBoardTile());

  app.replaceChildren(el("h2", { class: "page-title" }, "Your boards"), grid);
}

// A few muted colors for the strip on top of each board tile.
const ACCENTS = ["#0c66e4", "#22a06b", "#e2b203", "#c9372c", "#8f7ee7", "#1d7f8c", "#e56910"];

// Same board id always gets the same color.
function accentFor(id) {
  let sum = 0;
  for (const ch of id) sum += ch.charCodeAt(0);
  return ACCENTS[sum % ACCENTS.length];
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function boardTile(b) {
  return el(
    "a",
    { class: "board-tile", href: `#/board/${b.id}`, style: `--accent: ${accentFor(b.id)}` },
    el(
      "div",
      { class: "tile-top" },
      el("span", { class: "tile-title" }, b.title),
      el("span", { class: `role-badge ${b.myRole}` }, b.myRole)
    ),
    el("div", { class: "tile-stats" }, `${plural(b.listCount, "list")} · ${plural(b.cardCount, "card")}`)
  );
}

// Dashed tile at the end of the grid. Clicking it turns it into a small form.
function newBoardTile() {
  const tile = el("button", { class: "board-tile new-tile", type: "button" }, "+ Create new board");

  tile.addEventListener("click", () => {
    const form = addForm("Board name", "Create board", async (title) => {
      const created = await api("POST", "/api/boards", { title });
      location.hash = `#/board/${created.id}`;
    });
    const editing = el("div", { class: "board-tile new-tile editing" }, form);

    // Escape puts the dashed tile back.
    const input = form.querySelector("input");
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") editing.replaceWith(newBoardTile());
    });

    tile.replaceWith(editing);
    input.focus();
  });

  return tile;
}

// ---------- Board page ----------

async function showBoard(id) {
  try {
    board = await api("GET", `/api/boards/${id}`);
  } catch (err) {
    toast(err.message);
    location.hash = "#/";
    return;
  }
  renderBoard();
}

// Every API call that changes the board returns the new board; save it and redraw.
function update(newBoard) {
  board = newBoard;
  renderBoard();
}

function renderBoard() {
  const header = el(
    "div",
    { class: "board-header" },
    el("a", { href: "#/" }, "← Boards"),
    el("h1", {}, board.title),
    el("span", { class: `role-badge ${board.myRole}` }, board.myRole),
    el("button", { class: "ai-button", onclick: summarizeBoard }, "✨ AI summary"),
    isOwner() &&
      el("button", { class: "link", onclick: renameBoard }, "Rename"),
    isOwner() &&
      el("button", { class: "danger", onclick: deleteBoard }, "Delete board")
  );

  const lists = el("div", { class: "lists" });
  for (const list of board.lists) lists.append(renderList(list));

  if (canEdit()) {
    const addList = el("div", { class: "list add-list" });
    addList.append(
      addForm("Add a list…", "Add", async (title) => {
        update(await api("POST", `/api/boards/${board.id}/lists`, { title }));
      })
    );
    lists.append(addList);
  }

  // Leave out the parts that don't apply (they come through as `false`).
  const parts = [
    header,
    !canEdit() && el("p", { class: "muted" }, "You can view this board but not change it."),
    renderSummary(),
    isOwner() && renderMembers(),
    lists,
  ].filter(Boolean);
  app.replaceChildren(...parts);
}

function renderList(list) {
  let header;
  if (canEdit()) {
    const titleInput = el("input", { value: list.title });
    titleInput.addEventListener("change", () =>
      attempt(async () => {
        update(await api("PATCH", `/api/boards/${board.id}/lists/${list.id}`, { title: titleInput.value }));
      })
    );
    const remove = el("button", { class: "link", title: "Delete list" }, "✕");
    remove.addEventListener("click", () => {
      if (!confirm(`Delete list "${list.title}" and its cards?`)) return;
      attempt(async () => update(await api("DELETE", `/api/boards/${board.id}/lists/${list.id}`)));
    });
    header = el("div", { class: "list-header" }, titleInput, remove);
  } else {
    header = el("div", { class: "list-header" }, el("h3", {}, list.title));
  }

  const cards = el("div", { class: "cards" });
  cards.dataset.listId = list.id;
  for (const card of list.cards) cards.append(renderCard(card));

  const box = el("div", { class: "list" }, header, cards);
  if (canEdit()) setupDropZone(box, cards);
  if (canEdit()) {
    box.append(
      addForm("Add a card…", "Add", async (title) => {
        update(await api("POST", `/api/boards/${board.id}/lists/${list.id}/cards`, { title }));
      })
    );
  }
  return box;
}

function renderCard(card) {
  const node = el(
    "div",
    { class: "card" },
    card.title,
    card.description && el("div", { class: "has-desc" }, "≡ has description")
  );
  node.dataset.cardId = card.id;
  node.addEventListener("click", () => openCard(card));

  if (canEdit()) {
    node.draggable = true;
    node.addEventListener("dragstart", (e) => {
      // Custom type (not "text/plain") so text boxes don't paste the id into themselves.
      e.dataTransfer.setData(CARD_TYPE, card.id);
      e.dataTransfer.effectAllowed = "move";
      node.classList.add("dragging");
    });
    node.addEventListener("dragend", () => {
      node.classList.remove("dragging");
      removeMarker();
    });
  }
  return node;
}

// ---------- Drag and drop ----------
// While dragging over a list, a blue line shows where the card will land.

const marker = el("div", { class: "drop-marker" });
const CARD_TYPE = "application/x-trello-card";

// Is the thing being dragged one of our cards (and not, say, selected text)?
function isCardDrag(e) {
  return [...e.dataTransfer.types].includes(CARD_TYPE);
}

function removeMarker() {
  marker.remove();
}

// Which position in this list is the mouse over?
function dropIndex(container, mouseY) {
  const cards = [...container.querySelectorAll(".card:not(.dragging)")];
  for (let i = 0; i < cards.length; i++) {
    const box = cards[i].getBoundingClientRect();
    if (mouseY < box.top + box.height / 2) return i;
  }
  return cards.length;
}

// The whole list column accepts drops (so empty lists work too);
// `container` is the inner box that holds the cards.
function setupDropZone(listBox, container) {
  listBox.addEventListener("dragover", (e) => {
    if (!isCardDrag(e)) return;
    e.preventDefault(); // needed to allow a drop
    e.dataTransfer.dropEffect = "move";
    const index = dropIndex(container, e.clientY);
    const cards = container.querySelectorAll(".card:not(.dragging)");
    if (index < cards.length) container.insertBefore(marker, cards[index]);
    else container.append(marker);
  });

  listBox.addEventListener("dragleave", (e) => {
    if (!listBox.contains(e.relatedTarget)) removeMarker();
  });

  listBox.addEventListener("drop", (e) => {
    if (!isCardDrag(e)) return;
    e.preventDefault();
    const cardId = e.dataTransfer.getData(CARD_TYPE);
    const toIndex = dropIndex(container, e.clientY);
    removeMarker();
    attempt(async () => {
      update(
        await api("POST", `/api/boards/${board.id}/cards/${cardId}/move`, {
          toListId: container.dataset.listId,
          toIndex,
        })
      );
    });
  });
}

// ---------- Card popup ----------

const dialog = document.getElementById("cardDialog");
const cardTitle = document.getElementById("cardTitle");
const cardDesc = document.getElementById("cardDesc");
let openCardId = null;

function openCard(card) {
  openCardId = card.id;
  cardTitle.value = card.title;
  cardDesc.value = card.description || "";

  const editable = canEdit();
  cardTitle.readOnly = !editable;
  cardDesc.readOnly = !editable;
  document.getElementById("cardSave").hidden = !editable;
  document.getElementById("cardDelete").hidden = !editable;

  dialog.showModal();
}

document.getElementById("cardForm").addEventListener("submit", (e) => {
  e.preventDefault();
  attempt(async () => {
    update(
      await api("PATCH", `/api/boards/${board.id}/cards/${openCardId}`, {
        title: cardTitle.value,
        description: cardDesc.value,
      })
    );
    dialog.close();
  });
});

document.getElementById("cardDelete").addEventListener("click", () => {
  if (!confirm("Delete this card?")) return;
  attempt(async () => {
    update(await api("DELETE", `/api/boards/${board.id}/cards/${openCardId}`));
    dialog.close();
  });
});

document.getElementById("cardCancel").addEventListener("click", () => dialog.close());

// ---------- AI summary ----------
// Kept outside `board` so it survives redraws (e.g. after dragging a card).
let summary = null; // { boardId, text, loading }

function summarizeBoard() {
  summary = { boardId: board.id, text: "", loading: true };
  renderBoard();
  const boardId = board.id;
  api("POST", `/api/boards/${boardId}/summary`)
    .then((data) => {
      summary = { boardId, text: data.summary, loading: false };
    })
    .catch((err) => {
      summary = null;
      toast(err.message);
    })
    .finally(() => {
      if (board && board.id === boardId) renderBoard(); // still on that board?
    });
}

function renderSummary() {
  if (!summary || summary.boardId !== board.id) return null;
  const close = el("button", { class: "link", title: "Close", onclick: () => { summary = null; renderBoard(); } }, "✕");
  return el(
    "div",
    { class: "summary" },
    el("div", { class: "summary-head" }, el("strong", {}, "✨ AI board summary"), close),
    summary.loading
      ? el("p", { class: "muted" }, "Reading the board…")
      : el("div", { class: "summary-text" }, summary.text),
    !summary.loading &&
      el("p", { class: "summary-note" }, "Written by AI from this board's cards. It can make mistakes.")
  );
}

// ---------- Board actions (owner only) ----------

function renameBoard() {
  const title = prompt("New board name", board.title);
  if (!title) return;
  attempt(async () => update(await api("PATCH", `/api/boards/${board.id}`, { title })));
}

function deleteBoard() {
  if (!confirm(`Delete board "${board.title}"? This can't be undone.`)) return;
  attempt(async () => {
    await api("DELETE", `/api/boards/${board.id}`);
    location.hash = "#/";
  });
}

// ---------- Members panel (owner only) ----------

function roleSelect(current) {
  const select = el("select");
  for (const role of ["owner", "member", "viewer"]) {
    const option = el("option", { value: role }, role);
    if (role === current) option.selected = true;
    select.append(option);
  }
  return select;
}

function renderMembers() {
  const panel = el("div", { class: "members" }, el("h3", {}, "Members"));

  for (const user of users) {
    const role = board.members[user.id];
    const row = el("div", { class: "member-row" }, el("span", {}, user.name));

    if (role) {
      const select = roleSelect(role);
      select.addEventListener("change", () =>
        attempt(async () => {
          update(await api("PUT", `/api/boards/${board.id}/members/${user.id}`, { role: select.value }));
        }).then(() => renderBoard()) // redraw to reset the dropdown if it failed
      );
      row.append(select);
      if (user.id !== userId) {
        row.append(
          el(
            "button",
            {
              class: "link",
              onclick: () =>
                attempt(async () => update(await api("DELETE", `/api/boards/${board.id}/members/${user.id}`))),
            },
            "Remove"
          )
        );
      }
    } else {
      const select = roleSelect("member");
      row.append(
        select,
        el(
          "button",
          {
            onclick: () =>
              attempt(async () => {
                update(await api("PUT", `/api/boards/${board.id}/members/${user.id}`, { role: select.value }));
              }),
          },
          "Add"
        )
      );
    }
    panel.append(row);
  }
  return panel;
}

// ---------- Simple hash router ----------

function route() {
  const match = location.hash.match(/^#\/board\/(.+)$/);
  attempt(() => (match ? showBoard(match[1]) : showHome()));
}

window.addEventListener("hashchange", route);

setupUsers().then(route).catch((err) => toast(err.message));
