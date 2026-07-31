const STORAGE_KEY = "bucketListNotebookStateV1";
const viewOrder = ["cosplays", "actividades", "localizaciones", "sonidos"];

const app = document.querySelector("#app");
const tabs = [...document.querySelectorAll(".tab")];
const activityFilter = document.querySelector("#activityFilter");
const placeFilter = document.querySelector("#placeFilter");
const backButton = document.querySelector("#backButton");
const addCosplayButton = document.querySelector("#addCosplayButton");
const addLocationButton = document.querySelector("#addLocationButton");
const addPlaceButton = document.querySelector("#addPlaceButton");
const reloadSoundsButton = document.querySelector("#reloadSoundsButton");
const previousButton = document.querySelector("#previousButton");
const nextButton = document.querySelector("#nextButton");
const pageNumber = document.querySelector("#pageNumber");
const globalProgressText = document.querySelector("#globalProgressText");
const globalProgressBar = document.querySelector("#globalProgressBar");
const exportButton = document.querySelector("#exportButton");
const importInput = document.querySelector("#importInput");
const dialog = document.querySelector("#formDialog");
const dynamicForm = document.querySelector("#dynamicForm");
const formFields = document.querySelector("#formFields");
const dialogTitle = document.querySelector("#dialogTitle");
const closeDialogButton = document.querySelector("#closeDialogButton");
const cancelDialogButton = document.querySelector("#cancelDialogButton");
const toast = document.querySelector("#toast");

let state = {
  currentView: "cosplays",
  selectedCosplayId: null,
  activityFilter: "todos",
  placeFilter: "todos",
  cosplays: [],
  ubicaciones: [],
  localizaciones: [],
  sonidos: []
};

let activeFormHandler = null;
const audioPlayer = new Audio();
let activeSoundId = null;

async function init() {
  try {
    await loadInitialState();
    normalizeState();
    bindEvents();
    render();
  } catch (error) {
    console.error("Error al iniciar Bucket List:", error);
    const serverHint = location.protocol === "file:"
      ? ' Abre el proyecto con un servidor local, por ejemplo: <code>python -m http.server</code>.'
      : "";
    app.innerHTML = `<p class="empty-note"><strong>No se pudo iniciar el cuaderno.</strong><br>${escapeHtml(error?.message || "Error desconocido.")}${serverHint}</p>`;
  }
}

async function loadInitialState() {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (saved) {
    try {
      state = { ...state, ...JSON.parse(saved) };
    } catch (error) {
      console.warn("El estado guardado no era válido; se cargarán los datos iniciales.", error);
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  const needsCosplays = !Array.isArray(state.cosplays) || state.cosplays.length === 0;
  const needsActivities = !Array.isArray(state.ubicaciones) || state.ubicaciones.length === 0;
  const needsPlaces = !Array.isArray(state.localizaciones) || state.localizaciones.length === 0;

  const requests = [];
  if (needsCosplays) requests.push(fetchJson("data/cosplays.json").then(data => { state.cosplays = data; }));
  if (needsActivities) requests.push(fetchJson("data/actividades.json").then(data => { state.ubicaciones = data; }));
  if (needsPlaces) requests.push(fetchJson("data/localizaciones.json").then(data => { state.localizaciones = data; }));

  await Promise.all(requests);
  await loadSoundsManifest();
  persist();
}

async function loadSoundsManifest() {
  try {
    const manifest = await fetchJson("media/sonidos.json");
    if (!Array.isArray(manifest)) throw new Error("media/sonidos.json debe contener un array.");
    state.sonidos = manifest
      .filter(item => item && typeof item.nombre === "string" && typeof item.archivo === "string")
      .map((item, index) => ({
        id: String(item.id || createId(item.nombre) || `sonido-${index + 1}`),
        nombre: item.nombre.trim(),
        archivo: item.archivo.trim(),
        emoji: String(item.emoji || "🔊")
      }));
  } catch (error) {
    console.warn("No se pudo cargar el panel de sonidos:", error);
    state.sonidos = [];
  }
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`No se pudo cargar ${path} (${response.status}).`);
  return response.json();
}

function normalizeState() {
  if (!viewOrder.includes(state.currentView)) state.currentView = "cosplays";
  if (!Array.isArray(state.cosplays)) state.cosplays = [];
  if (!Array.isArray(state.ubicaciones)) state.ubicaciones = [];
  if (!Array.isArray(state.localizaciones)) state.localizaciones = [];
  if (!Array.isArray(state.sonidos)) state.sonidos = [];
  if (typeof state.activityFilter !== "string") state.activityFilter = "todos";
  if (typeof state.placeFilter !== "string") state.placeFilter = "todos";

  state.cosplays.forEach(cosplay => {
    if (!Array.isArray(cosplay.outfit)) cosplay.outfit = [];
    if (!Array.isArray(cosplay.photoshoots)) cosplay.photoshoots = [];
  });

  state.ubicaciones.forEach(location => {
    if (!Array.isArray(location.actividades)) location.actividades = [];
  });
}

function bindEvents() {
  tabs.forEach(tab => tab.addEventListener("click", () => switchView(tab.dataset.view)));
  previousButton.addEventListener("click", navigatePrevious);
  nextButton.addEventListener("click", navigateNext);
  backButton.addEventListener("click", () => { state.selectedCosplayId = null; render(); });
  activityFilter.addEventListener("change", event => { state.activityFilter = event.target.value; persist(); render(); });
  placeFilter.addEventListener("change", event => { state.placeFilter = event.target.value; persist(); render(); });
  addCosplayButton.addEventListener("click", openCosplayForm);
  addLocationButton.addEventListener("click", openLocationForm);
  addPlaceButton.addEventListener("click", () => openPlaceForm());
  reloadSoundsButton.addEventListener("click", reloadSounds);
  exportButton.addEventListener("click", exportState);
  importInput.addEventListener("change", importState);
  closeDialogButton.addEventListener("click", closeDialog);
  cancelDialogButton.addEventListener("click", closeDialog);
  dynamicForm.addEventListener("submit", handleFormSubmit);
  dialog.addEventListener("click", event => { if (event.target === dialog) closeDialog(); });
}

function switchView(view) {
  if (state.currentView === "sonidos" && view !== "sonidos") stopSound();
  state.currentView = view;
  state.selectedCosplayId = null;
  persist();
  render();
}

function navigatePrevious() { const index = viewOrder.indexOf(state.currentView); switchView(viewOrder[(index - 1 + viewOrder.length) % viewOrder.length]); }
function navigateNext() { const index = viewOrder.indexOf(state.currentView); switchView(viewOrder[(index + 1) % viewOrder.length]); }

function render() {
  tabs.forEach(tab => {
    const active = tab.dataset.view === state.currentView;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });

  activityFilter.value = state.activityFilter;
  placeFilter.value = state.placeFilter;
  activityFilter.classList.toggle("hidden", state.currentView !== "actividades");
  placeFilter.classList.toggle("hidden", state.currentView !== "localizaciones");
  addCosplayButton.classList.toggle("hidden", state.currentView !== "cosplays" || Boolean(state.selectedCosplayId));
  addLocationButton.classList.toggle("hidden", state.currentView !== "actividades");
  addPlaceButton.classList.toggle("hidden", state.currentView !== "localizaciones");
  reloadSoundsButton.classList.toggle("hidden", state.currentView !== "sonidos");
  backButton.classList.toggle("hidden", !(state.currentView === "cosplays" && state.selectedCosplayId));
  pageNumber.textContent = `Página ${viewOrder.indexOf(state.currentView) + 1}/${viewOrder.length}`;

  app.classList.remove("page-turn");
  void app.offsetWidth;
  app.classList.add("page-turn");

  if (state.currentView === "cosplays") renderCosplays();
  else if (state.currentView === "actividades") renderActivities();
  else if (state.currentView === "localizaciones") renderPlaces();
  else renderSounds();

  renderGlobalProgress();
}

function renderCosplays() {
  if (state.selectedCosplayId) {
    const cosplay = state.cosplays.find(item => item.id === state.selectedCosplayId);
    if (cosplay) return renderCosplayDetail(cosplay);
    state.selectedCosplayId = null;
  }

  app.innerHTML = `
    <div class="section-heading">
      <div><h2>Cosplays</h2><p>Outfits pendientes, ideas y sesiones.</p></div>
    </div>
    <div class="card-grid">
      ${state.cosplays.map(cosplay => {
        const done = cosplay.outfit.filter(item => item.completado).length;
        const total = cosplay.outfit.length;
        const shootsDone = cosplay.photoshoots.filter(item => item.estado === "hecho").length;
        return `
          <article class="cosplay-card">
            <span class="stamp stamp-blue">CASE #${escapeHtml(cosplay.id.toUpperCase())}</span>
            <h3>${escapeHtml(cosplay.nombre)}</h3>
            <p class="card-meta">Outfit ${done}/${total} · Photoshoots hechos: ${shootsDone}</p>
            <div class="mini-progress" aria-label="${done} de ${total} piezas completadas"><span style="width:${percentage(done, total)}%"></span></div>
            <div class="card-actions">
              <button class="paper-button open-cosplay" data-id="${escapeAttr(cosplay.id)}" type="button">Abrir ficha →</button>
            </div>
          </article>`;
      }).join("")}
    </div>`;

  app.querySelectorAll(".open-cosplay").forEach(button => button.addEventListener("click", () => {
    state.selectedCosplayId = button.dataset.id;
    persist();
    render();
  }));
}

function renderCosplayDetail(cosplay) {
  const done = cosplay.outfit.filter(item => item.completado).length;
  app.innerHTML = `
    <article class="detail-sheet">
      <div class="section-heading">
        <div><h2>${escapeHtml(cosplay.nombre)}</h2><p>Outfit ${done}/${cosplay.outfit.length}</p></div>
        <div class="heading-actions">
          <button class="paper-button" id="addShootButton" type="button">+ Photoshoot</button>
          <button class="paper-button subtle danger-button" id="deleteCosplayButton" type="button">Eliminar cosplay</button>
        </div>
      </div>
      <div class="detail-columns">
        <section>
          <h3>Outfit checklist</h3>
          <ul class="check-list">
            ${cosplay.outfit.map(piece => `
              <li class="check-item ${piece.completado ? "completed" : ""}">
                <label>
                  <input class="outfit-check" type="checkbox" data-piece-id="${escapeAttr(piece.id)}" ${piece.completado ? "checked" : ""}>
                  <span class="item-name">${escapeHtml(piece.nombre)}</span>
                  <span class="done-stamp">DONE</span>
                </label>
              </li>`).join("")}
          </ul>
        </section>
        <section>
          <h3>Photoshoots</h3>
          ${cosplay.photoshoots.length ? `<ul class="shoot-list">${cosplay.photoshoots.map(shoot => `
            <li class="shoot-item">
              <div>
                <h4>${escapeHtml(shoot.titulo)}</h4>
                <span class="status status-${escapeAttr(shoot.estado)}">${escapeHtml(shoot.estado)}</span>
                <p>${escapeHtml(shoot.fecha || "pendiente")} · ${escapeHtml(shoot.ubicacion || "Sin ubicación")}</p>
                ${shoot.notas ? `<p>${escapeHtml(shoot.notas)}</p>` : ""}
                ${shoot.mapsUrl ? `
                  <div class="map-preview">
                    <iframe
                      src="${mapEmbedUrl(shoot)}"
                      title="Mapa de ${escapeAttr(shoot.ubicacion || shoot.titulo)}"
                      loading="lazy"
                      referrerpolicy="no-referrer-when-downgrade"
                      allowfullscreen>
                    </iframe>
                  </div>
                  <a class="activity-link" href="${safeUrl(shoot.mapsUrl)}" target="_blank" rel="noopener">Abrir mapa ↗</a>` : ""}
              </div>
              <div class="inline-actions">
                <button class="icon-button edit-shoot" data-id="${escapeAttr(shoot.id)}" aria-label="Editar photoshoot">✎</button>
                <button class="icon-button delete-shoot" data-id="${escapeAttr(shoot.id)}" aria-label="Eliminar photoshoot">×</button>
              </div>
            </li>`).join("")}</ul>` : `<p class="empty-note">Todavía no hay sesiones apuntadas.</p>`}
        </section>
      </div>
    </article>`;

  app.querySelectorAll(".outfit-check").forEach(input => input.addEventListener("change", () => {
    const piece = cosplay.outfit.find(item => item.id === input.dataset.pieceId);
    piece.completado = input.checked;
    piece.fechaCompletado = input.checked ? new Date().toISOString() : null;
    persist();
    render();
    showToast(input.checked ? "Pieza completada ✓" : "Pieza marcada como pendiente");
  }));

  document.querySelector("#addShootButton").addEventListener("click", () => openShootForm(cosplay));
  document.querySelector("#deleteCosplayButton").addEventListener("click", () => deleteCosplay(cosplay.id));
  app.querySelectorAll(".edit-shoot").forEach(button => button.addEventListener("click", () => openShootForm(cosplay, cosplay.photoshoots.find(item => item.id === button.dataset.id))));
  app.querySelectorAll(".delete-shoot").forEach(button => button.addEventListener("click", () => {
    cosplay.photoshoots = cosplay.photoshoots.filter(item => item.id !== button.dataset.id);
    persist();
    render();
    showToast("Photoshoot eliminado");
  }));
}

function renderActivities() {
  const allActivities = state.ubicaciones.flatMap(location => location.actividades);
  const done = allActivities.filter(item => item.completado).length;
  app.innerHTML = `
    <div class="section-heading">
      <div><h2>Actividades</h2><p>${done}/${allActivities.length} actividades completadas</p></div>
    </div>
    <div>
      ${state.ubicaciones.map(location => {
        const visibleActivities = location.actividades.filter(activity => state.activityFilter === "todos" || activity.tipo === state.activityFilter);
        const locationDone = location.actividades.filter(activity => activity.completado).length;
        return `
          <details class="location-card" open>
            <summary><span>${escapeHtml(location.nombre)}</span><small>${locationDone}/${location.actividades.length}</small></summary>
            <div class="location-body">
              <div class="location-tools">
                <span class="status">${escapeHtml(location.tipoUbicacion || "destino")}</span>
                <button class="paper-button add-activity" data-location-id="${escapeAttr(location.id)}">+ Actividad</button>
              </div>
              ${visibleActivities.length ? `<ul class="activity-list">${visibleActivities.map(activity => `
                <li class="activity-item ${activity.completado ? "completed" : ""}">
                  <div class="activity-main">
                    <input class="activity-check" type="checkbox" data-location-id="${escapeAttr(location.id)}" data-activity-id="${escapeAttr(activity.id)}" ${activity.completado ? "checked" : ""}>
                    <div class="activity-info">
                      <span class="item-name">${escapeHtml(activity.nombre)}</span>
                      <small>${escapeHtml(activity.tipo || "otro")}${activity.fecha ? ` · ${escapeHtml(activity.fecha)}` : ""}</small>
                      ${activity.notas ? `<small>${escapeHtml(activity.notas)}</small>` : ""}
                      ${activity.enlace ? `<a class="activity-link" href="${safeUrl(activity.enlace)}" target="_blank" rel="noopener">Abrir enlace ↗</a>` : ""}
                    </div>
                    <span class="done-stamp">DONE</span>
                    <div class="inline-actions">
                      <button class="icon-button edit-activity" data-location-id="${escapeAttr(location.id)}" data-activity-id="${escapeAttr(activity.id)}" aria-label="Editar actividad">✎</button>
                      <button class="icon-button delete-activity" data-location-id="${escapeAttr(location.id)}" data-activity-id="${escapeAttr(activity.id)}" aria-label="Eliminar actividad">×</button>
                    </div>
                  </div>
                </li>`).join("")}</ul>` : `<p class="empty-note">No hay actividades para este filtro.</p>`}
            </div>
          </details>`;
      }).join("")}
    </div>`;

  app.querySelectorAll(".activity-check").forEach(input => input.addEventListener("change", () => {
    const activity = findActivity(input.dataset.locationId, input.dataset.activityId);
    activity.completado = input.checked;
    activity.fecha = input.checked ? new Date().toISOString().slice(0, 10) : null;
    persist();
    render();
    showToast(input.checked ? "Actividad completada ✓" : "Actividad reabierta");
  }));

  app.querySelectorAll(".add-activity").forEach(button => button.addEventListener("click", () => openActivityForm(button.dataset.locationId)));
  app.querySelectorAll(".edit-activity").forEach(button => button.addEventListener("click", () => openActivityForm(button.dataset.locationId, findActivity(button.dataset.locationId, button.dataset.activityId))));
  app.querySelectorAll(".delete-activity").forEach(button => button.addEventListener("click", () => {
    const location = state.ubicaciones.find(item => item.id === button.dataset.locationId);
    location.actividades = location.actividades.filter(item => item.id !== button.dataset.activityId);
    persist();
    render();
    showToast("Actividad eliminada");
  }));
}

function renderPlaces() {
  const places = state.localizaciones.filter(place => {
    if (state.placeFilter === "todos") return true;
    if (state.placeFilter === "visitados") return place.visitado;
    return place.tipos.includes(state.placeFilter);
  });
  const visited = state.localizaciones.filter(place => place.visitado).length;
  app.innerHTML = `
    <div class="section-heading">
      <div><h2>Localizaciones</h2><p>${visited}/${state.localizaciones.length} lugares visitados · ideas para photoshoot y urbex en Asturias</p></div>
    </div>
    <div class="places-grid">
      ${places.map(place => `
        <details class="place-card ${place.visitado ? "completed" : ""}">
          <summary>
            <div><strong>${escapeHtml(place.nombre)}</strong><small>${escapeHtml(place.zona || "Asturias")}</small></div>
            <div class="place-tags">${place.tipos.map(type => `<span>${escapeHtml(type)}</span>`).join("")}</div>
          </summary>
          <div class="place-body">
            <div class="place-status-row">
              <label><input class="place-check" type="checkbox" data-id="${escapeAttr(place.id)}" ${place.visitado ? "checked" : ""}> Visitado</label>
              <span class="status">${escapeHtml(place.estado)}</span>
            </div>
            ${place.notas ? `<p><strong>Notas:</strong> ${escapeHtml(place.notas)}</p>` : ""}
            ${place.ideas ? `<p><strong>Ideas:</strong> ${escapeHtml(place.ideas)}</p>` : ""}
            ${place.advertencias ? `<p class="warning-note"><strong>Acceso y seguridad:</strong> ${escapeHtml(place.advertencias)}</p>` : ""}
            <div class="map-preview place-map"><iframe src="${safeUrl(place.embedUrl || `https://www.google.com/maps?q=${encodeURIComponent(place.nombre + ", " + place.zona + ", Asturias")}&output=embed`)}" title="Mapa de ${escapeAttr(place.nombre)}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>
            <div class="place-actions">
              <a class="paper-button map-button" href="${safeUrl(place.mapsUrl)}" target="_blank" rel="noopener">Abrir en Google Maps ↗</a>
              <button class="paper-button subtle edit-place" data-id="${escapeAttr(place.id)}" type="button">Editar</button>
              <button class="paper-button subtle delete-place" data-id="${escapeAttr(place.id)}" type="button">Eliminar</button>
            </div>
          </div>
        </details>`).join("")}
    </div>`;

  app.querySelectorAll(".place-check").forEach(input => input.addEventListener("change", () => {
    const place = state.localizaciones.find(item => item.id === input.dataset.id);
    place.visitado = input.checked;
    place.fechaVisita = input.checked ? new Date().toISOString().slice(0, 10) : null;
    place.estado = input.checked ? "visitado" : "pendiente";
    persist(); render(); showToast(input.checked ? "Localización visitada ✓" : "Localización reabierta");
  }));
  app.querySelectorAll(".edit-place").forEach(button => button.addEventListener("click", () => openPlaceForm(state.localizaciones.find(item => item.id === button.dataset.id))));
  app.querySelectorAll(".delete-place").forEach(button => button.addEventListener("click", () => {
    state.localizaciones = state.localizaciones.filter(item => item.id !== button.dataset.id);
    persist(); render(); showToast("Localización eliminada");
  }));
}

function renderSounds() {
  app.innerHTML = `
    <div class="section-heading">
      <div><h2>Sonidos</h2><p>Botonera meme cargada desde <code>media/sonidos.json</code>.</p></div>
    </div>
    ${state.sonidos.length ? `
      <div class="sound-toolbar">
        <p>Pulsa un botón para reproducirlo desde el principio.</p>
        <button class="paper-button subtle" id="stopSoundButton" type="button">■ Parar sonido</button>
      </div>
      <div class="soundboard">
        ${state.sonidos.map(sound => `
          <button class="sound-button" type="button" data-sound-id="${escapeAttr(sound.id)}" aria-label="Reproducir ${escapeAttr(sound.nombre)}">
            <span class="sound-icon" aria-hidden="true">${escapeHtml(sound.emoji)}</span>
            <span>${escapeHtml(sound.nombre)}</span>
          </button>`).join("")}
      </div>` : `
      <div class="empty-note sound-help">
        <strong>La botonera está preparada.</strong>
        <p>Mete tus archivos <code>.ogg</code>, <code>.mp3</code> o <code>.wav</code> dentro de <code>media/</code> y añádelos a <code>media/sonidos.json</code>.</p>
        <pre>[
  {
    "id": "mi-sonido",
    "nombre": "Mi sonido",
    "archivo": "mi-sonido.ogg",
    "emoji": "📢"
  }
]</pre>
      </div>`}`;

  app.querySelectorAll(".sound-button").forEach(button => button.addEventListener("click", () => {
    const sound = state.sonidos.find(item => item.id === button.dataset.soundId);
    if (sound) playSound(sound);
  }));
  document.querySelector("#stopSoundButton")?.addEventListener("click", stopSound);
}

async function reloadSounds() {
  await loadSoundsManifest();
  persist();
  render();
  showToast(state.sonidos.length ? "Sonidos recargados" : "No hay sonidos configurados");
}

function playSound(sound) {
  const source = soundFileUrl(sound.archivo);
  if (!source) {
    showToast("Ruta de sonido no válida");
    return;
  }

  audioPlayer.pause();
  audioPlayer.currentTime = 0;
  audioPlayer.src = source;
  activeSoundId = sound.id;
  updateSoundButtons();

  audioPlayer.play().catch(error => {
    console.error("No se pudo reproducir el sonido:", error);
    activeSoundId = null;
    updateSoundButtons();
    showToast("No se pudo reproducir el archivo");
  });
}

function stopSound() {
  audioPlayer.pause();
  audioPlayer.currentTime = 0;
  activeSoundId = null;
  updateSoundButtons();
}

function updateSoundButtons() {
  app.querySelectorAll(".sound-button").forEach(button => {
    const isPlaying = button.dataset.soundId === activeSoundId && !audioPlayer.paused;
    button.classList.toggle("playing", isPlaying);
    button.setAttribute("aria-pressed", String(isPlaying));
  });
}

function soundFileUrl(file) {
  try {
    const mediaRoot = new URL("media/", location.href);
    const cleanFile = String(file || "").replace(/^\/?media\//i, "");
    const url = new URL(cleanFile, mediaRoot);
    if (url.origin !== mediaRoot.origin || !url.href.startsWith(mediaRoot.href)) return "";
    return url.href;
  } catch {
    return "";
  }
}

audioPlayer.addEventListener("ended", () => {
  activeSoundId = null;
  updateSoundButtons();
});

audioPlayer.addEventListener("error", () => {
  activeSoundId = null;
  updateSoundButtons();
});

function deleteCosplay(cosplayId) {
  const cosplay = state.cosplays.find(item => item.id === cosplayId);
  if (!cosplay) return;
  const confirmed = window.confirm(`¿Eliminar el cosplay "${cosplay.nombre}"? También se borrarán su outfit y sus photoshoots.`);
  if (!confirmed) return;

  state.cosplays = state.cosplays.filter(item => item.id !== cosplayId);
  if (state.selectedCosplayId === cosplayId) state.selectedCosplayId = null;
  persist();
  render();
  showToast("Cosplay eliminado");
}

function renderGlobalProgress() {
  const outfit = state.cosplays.flatMap(item => item.outfit);
  const activities = state.ubicaciones.flatMap(item => item.actividades);
  const places = state.localizaciones || [];
  const done = outfit.filter(item => item.completado).length + activities.filter(item => item.completado).length + places.filter(item => item.visitado).length;
  const total = outfit.length + activities.length + places.length;
  globalProgressText.textContent = `${done} / ${total}`;
  globalProgressBar.style.width = `${percentage(done, total)}%`;
}

function openCosplayForm() {
  openForm("Nuevo cosplay", [
    field("nombre", "Nombre del cosplay", "text", "", true),
    textareaField("outfit", "Piezas del outfit, separadas por comas", "Peluca, Chaqueta, Camiseta, Pantalones, Botas")
  ], data => {
    const pieces = data.outfit
      .split(",")
      .map(value => value.trim())
      .filter(Boolean);

    const usedPieceIds = new Set();
    const outfit = pieces.map((nombre, index) => {
      const base = createId(nombre) || `pieza-${index + 1}`;
      let id = base;
      let suffix = 2;
      while (usedPieceIds.has(id)) id = `${base}-${suffix++}`;
      usedPieceIds.add(id);
      return { id, nombre, completado: false, fechaCompletado: null };
    });

    state.cosplays.push({
      id: uniqueCosplayId(createId(data.nombre)),
      nombre: data.nombre.trim(),
      outfit,
      photoshoots: []
    });
    persist();
    render();
    showToast("Cosplay añadido");
  });
}

function openShootForm(cosplay, shoot = null) {
  openForm(shoot ? "Editar photoshoot" : "Nuevo photoshoot", [
    field("titulo", "Título", "text", shoot?.titulo || "", true),
    field("fecha", "Fecha", "text", shoot?.fecha || "pendiente"),
    field("ubicacion", "Ubicación", "text", shoot?.ubicacion || ""),
    field("mapsUrl", "Google Maps / enlace", "url", shoot?.mapsUrl || ""),
    selectField("estado", "Estado", ["planificado", "hecho", "cancelado"], shoot?.estado || "planificado"),
    textareaField("notas", "Notas", shoot?.notas || "")
  ], data => {
    const record = {
      id: shoot?.id || createId(data.titulo),
      titulo: data.titulo,
      fecha: data.fecha || "pendiente",
      notas: data.notas,
      ubicacion: data.ubicacion,
      mapsUrl: data.mapsUrl || null,
      mapsEmbedUrl: shoot?.mapsEmbedUrl || null,
      estado: data.estado
    };
    if (shoot) Object.assign(shoot, record); else cosplay.photoshoots.push(record);
    persist(); render(); showToast("Photoshoot guardado");
  });
}

function openLocationForm() {
  openForm("Nueva ubicación", [
    field("nombre", "Nombre", "text", "", true),
    selectField("tipoUbicacion", "Tipo", ["ciudad", "parque", "destino", "otro"], "ciudad")
  ], data => {
    state.ubicaciones.push({ id: uniqueLocationId(createId(data.nombre)), nombre: data.nombre, tipoUbicacion: data.tipoUbicacion, actividades: [] });
    persist(); render(); showToast("Ubicación añadida");
  });
}

function openActivityForm(locationId, activity = null) {
  openForm(activity ? "Editar actividad" : "Nueva actividad", [
    field("nombre", "Nombre", "text", activity?.nombre || "", true),
    field("fecha", "Fecha", "date", activity?.fecha || ""),
    field("enlace", "Enlace", "url", activity?.enlace || ""),
    selectField("tipo", "Tipo", ["parque", "comics", "ciudad", "evento", "otro"], activity?.tipo || "otro"),
    textareaField("notas", "Notas", activity?.notas || "")
  ], data => {
    const location = state.ubicaciones.find(item => item.id === locationId);
    const record = {
      id: activity?.id || uniqueActivityId(location, createId(data.nombre)),
      nombre: data.nombre,
      completado: activity?.completado || false,
      fecha: data.fecha || null,
      notas: data.notas,
      enlace: data.enlace || null,
      tipo: data.tipo
    };
    if (activity) Object.assign(activity, record); else location.actividades.push(record);
    persist(); render(); showToast("Actividad guardada");
  });
}

function openPlaceForm(place = null) {
  openForm(place ? "Editar localización" : "Nueva localización", [
    field("nombre", "Nombre", "text", place?.nombre || "", true),
    field("zona", "Zona / municipio", "text", place?.zona || "Asturias"),
    field("tipos", "Tipos separados por comas", "text", place?.tipos?.join(", ") || "photoshoot"),
    selectField("estado", "Estado", ["por-investigar", "pendiente", "visitado", "descartado"], place?.estado || "por-investigar"),
    field("mapsUrl", "Enlace de Google Maps para el móvil", "url", place?.mapsUrl || ""),
    field("embedUrl", "URL embed de Google Maps", "url", place?.embedUrl || ""),
    textareaField("notas", "Notas", place?.notas || ""),
    textareaField("ideas", "Ideas de sesión", place?.ideas || ""),
    textareaField("advertencias", "Acceso y seguridad", place?.advertencias || "")
  ], data => {
    const record = {
      id: place?.id || uniquePlaceId(createId(data.nombre)),
      nombre: data.nombre, zona: data.zona,
      tipos: data.tipos.split(",").map(value => value.trim().toLowerCase()).filter(Boolean),
      estado: data.estado, visitado: data.estado === "visitado" || place?.visitado || false,
      fechaVisita: place?.fechaVisita || null, notas: data.notas, ideas: data.ideas, advertencias: data.advertencias,
      mapsUrl: data.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.nombre + " " + data.zona + " Asturias")}`,
      embedUrl: data.embedUrl || `https://www.google.com/maps?q=${encodeURIComponent(data.nombre + ", " + data.zona + ", Asturias")}&output=embed`
    };
    if (place) Object.assign(place, record); else state.localizaciones.push(record);
    persist(); render(); showToast("Localización guardada");
  });
}

function openForm(title, fields, handler) {
  dialogTitle.textContent = title;
  formFields.innerHTML = fields.join("");
  activeFormHandler = handler;
  dialog.showModal();
  formFields.querySelector("input, select, textarea")?.focus();
}

function handleFormSubmit(event) {
  event.preventDefault();
  if (!dynamicForm.reportValidity()) return;
  const data = Object.fromEntries(new FormData(dynamicForm).entries());
  activeFormHandler?.(data);
  closeDialog();
}

function closeDialog() {
  activeFormHandler = null;
  dynamicForm.reset();
  if (dialog.open) dialog.close();
}

function exportState() {
  const blob = new Blob([JSON.stringify({ version: 3, exportedAt: new Date().toISOString(), cosplays: state.cosplays, ubicaciones: state.ubicaciones, localizaciones: state.localizaciones }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `bucket-list-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast("Backup exportado");
}

async function importState(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (!Array.isArray(imported.cosplays) || !Array.isArray(imported.ubicaciones)) throw new Error("Formato de backup no válido.");
    state.cosplays = imported.cosplays;
    state.ubicaciones = imported.ubicaciones;
    if (Array.isArray(imported.localizaciones)) state.localizaciones = imported.localizaciones;
    state.selectedCosplayId = null;
    persist(); render(); showToast("Backup importado");
  } catch (error) {
    showToast(error.message);
  } finally {
    importInput.value = "";
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function findActivity(locationId, activityId) {
  return state.ubicaciones.find(item => item.id === locationId)?.actividades.find(item => item.id === activityId);
}

function field(name, label, type, value = "", required = false) {
  return `<label class="form-field"><span>${escapeHtml(label)}</span><input name="${escapeAttr(name)}" type="${escapeAttr(type)}" value="${escapeAttr(value)}" ${required ? "required" : ""}></label>`;
}

function textareaField(name, label, value = "") {
  return `<label class="form-field"><span>${escapeHtml(label)}</span><textarea name="${escapeAttr(name)}">${escapeHtml(value)}</textarea></label>`;
}

function selectField(name, label, options, selected) {
  return `<label class="form-field"><span>${escapeHtml(label)}</span><select name="${escapeAttr(name)}">${options.map(option => `<option value="${escapeAttr(option)}" ${option === selected ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select></label>`;
}

function createId(value) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `item-${Date.now()}`;
}

function uniqueCosplayId(base) {
  let id = base, suffix = 2;
  while (state.cosplays.some(item => item.id === id)) id = `${base}-${suffix++}`;
  return id;
}

function uniqueLocationId(base) {
  let id = base, suffix = 2;
  while (state.ubicaciones.some(item => item.id === id)) id = `${base}-${suffix++}`;
  return id;
}

function uniquePlaceId(base) { let id = base, suffix = 2; while (state.localizaciones.some(item => item.id === id)) id = `${base}-${suffix++}`; return id; }

function uniqueActivityId(location, base) {
  let id = base, suffix = 2;
  while (location.actividades.some(item => item.id === id)) id = `${base}-${suffix++}`;
  return id;
}

function percentage(done, total) { return total ? Math.round((done / total) * 100) : 0; }
function mapEmbedUrl(shoot) {
  const exactEmbeds = {
    "https://maps.app.goo.gl/ooeqZPKHsYCjRNAz9": "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d4011.701391010507!2d-5.614514!3d43.5243331!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0xd367b1a200bd50f%3A0x88711636275e0532!2sLaboral%20Ciudad%20de%20la%20Cultura!5e1!3m2!1sen!2ses!4v1785420544766!5m2!1sen!2ses"
  };

  const exactUrl = shoot.mapsEmbedUrl || exactEmbeds[shoot.mapsUrl];
  if (exactUrl) return safeUrl(exactUrl);

  const query = String(shoot.ubicacion || shoot.titulo || "").trim();
  return escapeAttr(`https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`);
}
function safeUrl(url) { try { const parsed = new URL(url, location.href); return ["http:", "https:"].includes(parsed.protocol) ? escapeAttr(parsed.href) : "#"; } catch { return "#"; } }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char])); }
function escapeAttr(value) { return escapeHtml(value).replace(/'/g, "&#39;"); }

let toastTimer;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
}


function bootstrap() {
  init();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
} else {
  bootstrap();
}
