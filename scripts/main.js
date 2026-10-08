/**
 * Lecteur Canva — Foundry VTT v13 / v14
 * Affiche des tableaux Canva (lien d'intégration) dans une fenêtre Foundry.
 * La modification se fait dans Canva (nouvel onglet), puis « Rafraîchir ».
 */

const MODULE_ID = "lecteur-canva";
const SOCKET = `module.${MODULE_ID}`;
const { ApplicationV2 } = foundry.applications.api;

/* -------------------------------------------- */
/*  Utilitaires                                 */
/* -------------------------------------------- */

/** Accepte un lien brut OU le code d'intégration complet copié depuis Canva. */
function extractUrl(input) {
  if (!input) return null;
  let s = String(input).trim();
  const m = s.match(/src\s*=\s*["']([^"']+)["']/i);
  if (m) s = m[1];
  s = s.replace(/&amp;/g, "&");
  // Collage en double (« https:/https://… ») : garder le dernier lien complet
  const last = s.lastIndexOf("https://");
  if (last > 0) s = s.slice(last);
  try { return new URL(s); } catch { return null; }
}

function isCanva(url) {
  return /(^|\.)canva\.(com|site|link)$/i.test(url.hostname);
}

/** Construit l'URL affichable dans l'iframe (ou renvoie une erreur lisible). */
function toViewUrl(input) {
  const url = extractUrl(input);
  if (!url) return { error: "Le lien de lecture est vide ou invalide." };
  if (url.protocol !== "https:") return { error: "Le lien de lecture doit commencer par https://" };
  if (/(^|\.)canva\.link$/i.test(url.hostname)) {
    return { error: "Ce lien est un lien raccourci canva.link : il ne peut pas s'afficher dans Foundry. "
      + "Utilise le lien d'intégration (Canva → Partager → Intégrer)." };
  }
  if (isCanva(url) && /\/edit\/?$/.test(url.pathname)) {
    return { error: "Ce lien est un lien d'édition : Canva refuse de l'afficher dans Foundry. "
      + "Utilise le lien d'intégration (Canva → Partager → Intégrer)." };
  }
  // Lien de visionnage Canva → forcer le mode intégration
  if (/(^|\.)canva\.com$/i.test(url.hostname) && /\/view\/?$/.test(url.pathname)) url.search = "?embed";
  return { url: url.href };
}

function toEditUrl(input) {
  const url = extractUrl(input);
  if (!url || url.protocol !== "https:") return null;
  return url.href;
}

function getBoards() {
  const raw = game.settings.get(MODULE_ID, "boards");
  return Array.isArray(raw) ? raw.filter(b => b && b.id) : [];
}

function newBoard() {
  return { id: foundry.utils.randomID(), name: "Timeline & indices", viewUrl: "", editUrl: "" };
}

function makeButton(action, icon, label, title) {
  const b = document.createElement("button");
  b.type = "button";
  b.dataset.action = action;
  b.innerHTML = `<i class="${icon}"></i> `;
  if (label) b.append(label);
  if (title) b.title = title;
  return b;
}

function makeMessage(text) {
  const p = document.createElement("p");
  p.className = "lc-message";
  p.textContent = text;
  return p;
}

/* -------------------------------------------- */
/*  Fenêtre de lecture                          */
/* -------------------------------------------- */

class CanvaViewer extends ApplicationV2 {
  constructor({ boardId, ...options } = {}) {
    super(options);
    this.boardId = boardId ?? null;
  }

  static DEFAULT_OPTIONS = {
    id: "lecteur-canva-viewer",
    classes: ["lecteur-canva"],
    window: { title: "Lecteur Canva", icon: "fa-solid fa-palette", resizable: true },
    position: { width: 1100, height: 750 },
    actions: {
      refresh: CanvaViewer._onRefresh,
      edit: CanvaViewer._onEdit,
      openTab: CanvaViewer._onOpenTab,
      share: CanvaViewer._onShare,
      configure: CanvaViewer._onConfigure
    }
  };

  get currentBoard() {
    const boards = getBoards();
    return boards.find(b => b.id === this.boardId) ?? boards[0] ?? null;
  }

  async _prepareContext() {
    const boards = getBoards();
    const board = this.currentBoard;
    const view = board ? toViewUrl(board.viewUrl) : null;
    const canEdit = !!toEditUrl(board?.editUrl)
      && (game.user.isGM || game.settings.get(MODULE_ID, "allowPlayerEdit"));
    return { boards, board, view, canEdit, isGM: game.user.isGM };
  }

  async _renderHTML(ctx) {
    const root = document.createElement("div");
    root.className = "lc-root";

    // --- Barre d'outils
    const bar = document.createElement("div");
    bar.className = "lc-toolbar";

    if (ctx.boards.length > 1) {
      const select = document.createElement("select");
      select.className = "lc-board-select";
      for (const b of ctx.boards) {
        const opt = document.createElement("option");
        opt.value = b.id;
        opt.textContent = b.name || "Sans nom";
        if (b.id === ctx.board?.id) opt.selected = true;
        select.append(opt);
      }
      bar.append(select);
    } else if (ctx.board) {
      const title = document.createElement("span");
      title.className = "lc-title";
      title.textContent = ctx.board.name || "Tableau Canva";
      bar.append(title);
    }

    const spacer = document.createElement("span");
    spacer.className = "lc-spacer";
    bar.append(spacer);

    if (ctx.board && ctx.view?.url) {
      bar.append(makeButton("refresh", "fa-solid fa-rotate", "Rafraîchir", "Recharger le tableau après une modification"));
      if (ctx.canEdit) bar.append(makeButton("edit", "fa-solid fa-pen", "Modifier", "Ouvrir le tableau dans Canva (nouvel onglet)"));
      bar.append(makeButton("openTab", "fa-solid fa-up-right-from-square", "", "Ouvrir la lecture dans un onglet"));
      if (ctx.isGM) bar.append(makeButton("share", "fa-solid fa-users", "Montrer à tous", "Ouvrir ce tableau chez tous les joueurs"));
    }
    if (ctx.isGM) bar.append(makeButton("configure", "fa-solid fa-gear", "", "Configurer les tableaux"));

    // --- Zone d'affichage
    const stage = document.createElement("div");
    stage.className = "lc-stage";

    if (!ctx.board) {
      stage.append(makeMessage(ctx.isGM
        ? "Aucun tableau configuré. Clique sur l'engrenage pour ajouter ton Canva."
        : "Aucun tableau n'a encore été configuré par le MJ."));
    } else if (ctx.view?.error) {
      stage.append(makeMessage(ctx.view.error));
    } else {
      const iframe = document.createElement("iframe");
      iframe.src = ctx.view.url;
      iframe.setAttribute("allowfullscreen", "");
      iframe.setAttribute("allow", "fullscreen");
      iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
      stage.append(iframe);
    }

    root.append(bar, stage);
    return root;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this.element.querySelector(".lc-board-select")?.addEventListener("change", ev => {
      this.boardId = ev.currentTarget.value;
      this.render();
    });
  }

  /* --- Actions (this = l'application) --- */

  static _onRefresh() {
    const iframe = this.element.querySelector(".lc-stage iframe");
    if (iframe) iframe.src = iframe.src;
  }

  static _onEdit() {
    const url = toEditUrl(this.currentBoard?.editUrl);
    if (!url) return;
    window.open(url, "_blank", "noopener");
    ui.notifications.info("Canva s'ouvre dans un nouvel onglet. Une fois ta modification faite, reviens ici et clique sur « Rafraîchir ».");
  }

  static _onOpenTab() {
    const view = toViewUrl(this.currentBoard?.viewUrl);
    if (view.url) window.open(view.url, "_blank", "noopener");
  }

  static _onShare() {
    const board = this.currentBoard;
    if (!board) return;
    game.socket.emit(SOCKET, { action: "show", boardId: board.id });
    ui.notifications.info(`« ${board.name || "Tableau Canva"} » affiché chez tous les joueurs connectés.`);
  }

  static _onConfigure() {
    new CanvaConfig().render({ force: true });
  }
}

/* -------------------------------------------- */
/*  Fenêtre de configuration (MJ)               */
/* -------------------------------------------- */

class CanvaConfig extends ApplicationV2 {
  constructor(options = {}) {
    super(options);
    this.boards = foundry.utils.deepClone(getBoards());
    if (!this.boards.length) this.boards.push(newBoard());
  }

  static DEFAULT_OPTIONS = {
    id: "lecteur-canva-config",
    tag: "form",
    classes: ["lecteur-canva-config"],
    window: { title: "Lecteur Canva — Tableaux", icon: "fa-solid fa-palette", resizable: true },
    position: { width: 720, height: "auto" },
    form: { handler: CanvaConfig._onSubmit, closeOnSubmit: true },
    actions: {
      addBoard: CanvaConfig._onAdd,
      removeBoard: CanvaConfig._onRemove
    }
  };

  _readForm() {
    if (!this.element) return this.boards;
    return [...this.element.querySelectorAll(".lc-row")].map(row => ({
      id: row.dataset.id,
      name: row.querySelector('[data-field="name"]').value.trim(),
      viewUrl: row.querySelector('[data-field="viewUrl"]').value.trim(),
      editUrl: row.querySelector('[data-field="editUrl"]').value.trim()
    }));
  }

  async _renderHTML() {
    const root = document.createElement("div");
    root.className = "lc-config";

    const hint = document.createElement("p");
    hint.className = "hint";
    hint.innerHTML = "<b>Lien de lecture</b> : Canva → Partager → Intégrer (colle le lien ou tout le code d'intégration).<br>"
      + "<b>Lien d'édition</b> : Canva → Partager → accès « Toute personne disposant du lien » en <i>Peut modifier</i> → Copier le lien.";
    root.append(hint);

    const field = (row, key, label, placeholder, value) => {
      const lab = document.createElement("label");
      lab.textContent = label;
      const input = document.createElement("input");
      input.type = "text";
      input.dataset.field = key;
      input.placeholder = placeholder;
      input.value = value ?? "";
      row.append(lab, input);
    };

    for (const b of this.boards) {
      const row = document.createElement("fieldset");
      row.className = "lc-row";
      row.dataset.id = b.id;
      field(row, "name", "Nom", "Timeline & indices", b.name);
      field(row, "viewUrl", "Lien de lecture", "https://www.canva.com/design/…/view?embed", b.viewUrl);
      field(row, "editUrl", "Lien d'édition", "https://www.canva.com/design/…/edit", b.editUrl);
      const del = makeButton("removeBoard", "fa-solid fa-trash", "Supprimer ce tableau");
      del.dataset.id = b.id;
      del.classList.add("lc-remove");
      row.append(del);
      root.append(row);
    }

    const footer = document.createElement("div");
    footer.className = "lc-footer";
    footer.append(makeButton("addBoard", "fa-solid fa-plus", "Ajouter un tableau"));
    const save = document.createElement("button");
    save.type = "submit";
    save.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Enregistrer';
    footer.append(save);
    root.append(footer);

    return root;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  static _onAdd() {
    this.boards = this._readForm();
    this.boards.push(newBoard());
    this.render();
  }

  static _onRemove(event, target) {
    this.boards = this._readForm().filter(b => b.id !== target.dataset.id);
    this.render();
  }

  static async _onSubmit() {
    const boards = this._readForm()
      .filter(b => b.viewUrl || b.editUrl)
      .map(b => ({ ...b, name: b.name || "Tableau Canva" }));
    for (const b of boards) {
      const view = toViewUrl(b.viewUrl);
      if (view.error) ui.notifications.warn(`« ${b.name} » : ${view.error}`);
    }
    await game.settings.set(MODULE_ID, "boards", boards);
    ui.notifications.info("Tableaux Canva enregistrés.");
  }
}

/* -------------------------------------------- */
/*  Ouverture                                   */
/* -------------------------------------------- */

let viewer = null;

async function openViewer(boardId = null) {
  viewer ??= new CanvaViewer();
  if (boardId) viewer.boardId = boardId;
  await viewer.render({ force: true });
  if (viewer.rendered && viewer.element) viewer.bringToFront?.();
  return viewer;
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "boards", {
    scope: "world",
    config: false,
    type: Array,
    default: [],
    onChange: () => { if (viewer?.rendered) viewer.render(); }
  });

  game.settings.register(MODULE_ID, "allowPlayerEdit", {
    name: "Les joueurs peuvent modifier",
    hint: "Affiche le bouton « Modifier » (ouverture de Canva) aux joueurs. Sinon, seul le MJ le voit.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => { if (viewer?.rendered) viewer.render(); }
  });

  game.settings.registerMenu(MODULE_ID, "config", {
    name: "Tableaux Canva",
    label: "Configurer les tableaux",
    hint: "Ajoute les liens de lecture et d'édition de tes tableaux Canva.",
    icon: "fa-solid fa-palette",
    type: CanvaConfig,
    restricted: true
  });

  game.keybindings.register(MODULE_ID, "open", {
    name: "Ouvrir le Lecteur Canva",
    editable: [],
    onDown: () => { openViewer(); return true; }
  });

  game.modules.get(MODULE_ID).api = {
    open: openViewer,
    configure: () => new CanvaConfig().render({ force: true })
  };
});

Hooks.once("ready", () => {
  game.socket.on(SOCKET, data => {
    if (data?.action === "show") openViewer(data.boardId);
  });
});

// Bouton dans les outils de jetons (barre de gauche)
Hooks.on("getSceneControlButtons", controls => {
  const tokens = controls?.tokens ?? controls?.token;
  if (!tokens?.tools || Array.isArray(tokens.tools)) return;
  tokens.tools[MODULE_ID] = {
    name: MODULE_ID,
    title: "Tableau Canva",
    icon: "fa-solid fa-palette",
    order: Object.keys(tokens.tools).length,
    button: true,
    visible: true,
    onChange: () => openViewer()
  };
});

// Bouton dans l'onglet Journal
Hooks.on("renderJournalDirectory", (app, html) => {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root || root.querySelector(".lc-open-btn")) return;
  const target = root.querySelector(".header-actions") ?? root.querySelector(".directory-header");
  if (!target) return;
  const b = document.createElement("button");
  b.type = "button";
  b.className = "lc-open-btn";
  b.innerHTML = '<i class="fa-solid fa-palette"></i> Tableau Canva';
  b.addEventListener("click", ev => { ev.preventDefault(); openViewer(); });
  target.append(b);
});
