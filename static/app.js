let user = window.INITIAL_USER || null;
let timer = null;
let lastLogId = null;

const $ = (id) => document.getElementById(id);

function showToast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => {
    t.style.display = "none";
  }, 3000);
}

function mostrarEstado(msg, tipo = "error") {
  const box = $("estadoCarga");
  box.innerHTML = `<div class="msg ${tipo}">${escapeHtml(msg)}</div>`;
}

function limpiarEstado() {
  $("estadoCarga").innerHTML = "";
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.innerText = text == null ? "" : text;
  return div.innerHTML;
}

function traducirAccion(accion) {
  if (accion === "agregar") return "agregó";
  if (accion === "eliminar") return "eliminó";
  if (accion === "cambiar_estado") return "cambió estado";
  return accion || "";
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...options
  });
  return res.json();
}

async function hacerLogin() {
  const username = $("usuario").value.trim();
  const password = $("clave").value;
  const loginMsg = $("loginMsg");
  loginMsg.className = "msg";
  loginMsg.textContent = "";

  const r = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });

  if (!r.ok) {
    loginMsg.className = "msg error";
    loginMsg.textContent = r.message || "No se pudo iniciar sesión";
    return;
  }

  user = r.user;
  $("nombreUsuario").innerText = user.nombre;
  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  $("mobileNav").classList.remove("hidden");
  $("fabBtn").classList.remove("hidden");
  restaurarPreferencias();
  tab("compras");
  await load();

  if (timer) clearInterval(timer);
  timer = setInterval(load, 4000);
}

async function load() {
  const d = await api("/api/items");
  if (!d.ok) {
    mostrarEstado(d.message || "Error al cargar");
    return;
  }

  limpiarEstado();
  renderItems("listaCompras", d.compras || [], "compras");
  renderItems("listaTareas", d.tareas || [], "tareas");
  renderActividad(d.logs || []);
  renderAvisos(d.logs || []);
  renderUsuarios(d.users || []);
  actualizarContadores(d);
  revisarNuevosLogs(d.logs || []);
}

function renderItems(container, arr, tipo) {
  const div = $(container);
  div.innerHTML = "";

  if (!arr.length) {
    div.innerHTML = '<div class="empty">No hay datos</div>';
    return;
  }

  const pendientes = arr.filter(x => x.estado !== "hecho");
  const hechos = arr.filter(x => x.estado === "hecho");

  if (pendientes.length) {
    const title = document.createElement("div");
    title.className = "section-title";
    title.textContent = "Pendientes";
    div.appendChild(title);
    pendientes.forEach(i => div.appendChild(crearTarjetaItem(i, tipo)));
  }

  if (hechos.length) {
    const title = document.createElement("div");
    title.className = "section-title";
    title.textContent = "Hechos";
    div.appendChild(title);
    hechos.forEach(i => div.appendChild(crearTarjetaItem(i, tipo)));
  }
}

function crearTarjetaItem(i, tipo) {
  const el = document.createElement("div");
  el.className = "item " + (i.estado === "hecho" ? "done" : "");
  el.innerHTML = `
    <strong>${escapeHtml(i.texto)}</strong>
    <div class="muted">Creado por ${escapeHtml(i.creado_por)} · Estado: ${escapeHtml(i.estado)} · ${escapeHtml(i.fecha_creacion)}</div>
    <div class="actions">
      <button class="btn btn-success" onclick="toggleItem('${tipo}', ${i.id})">${i.estado === "hecho" ? "Marcar pendiente" : "Marcar hecho"}</button>
      <button class="btn btn-danger" onclick="deleteItem('${tipo}', ${i.id})">Eliminar</button>
    </div>
  `;
  return el;
}

function renderActividad(logs) {
  const div = $("listaActividad");
  div.innerHTML = "";

  if (!logs.length) {
    div.innerHTML = '<div class="empty">Sin actividad todavía</div>';
    return;
  }

  logs.forEach(log => {
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <strong>${escapeHtml(log.usuario)}</strong>
      <div>${traducirAccion(log.accion)} en ${escapeHtml(log.tipo)}: ${escapeHtml(log.texto)}</div>
      <div class="muted">${escapeHtml(log.fecha)}</div>
    `;
    div.appendChild(el);
  });
}

function renderAvisos(logs) {
  const div = $("chatAvisos");
  div.innerHTML = "";

  if (!logs.length) {
    div.innerHTML = '<div class="empty">Todavía no hay avisos</div>';
    return;
  }

  logs.slice(0, 20).reverse().forEach(log => {
    const mio = user && String(log.usuario).toLowerCase() === String(user.nombre).toLowerCase();
    const bubble = document.createElement("div");
    bubble.className = "chat-bubble " + (mio ? "chat-right" : "chat-left");
    bubble.innerHTML = `
      <div><strong>${escapeHtml(log.usuario)}</strong></div>
      <div>${traducirAccion(log.accion)} ${escapeHtml(log.tipo)}: ${escapeHtml(log.texto)}</div>
      <div class="chat-time">${escapeHtml(log.fecha)}</div>
    `;
    div.appendChild(bubble);
  });
}

function renderUsuarios(users) {
  const div = $("listaUsuarios");
  div.innerHTML = "";

  if (!users.length) {
    div.innerHTML = '<div class="empty">No hay usuarios</div>';
    return;
  }

  users.forEach(u => {
    const card = document.createElement("div");
    card.className = "user-card";
    card.innerHTML = `
      <strong>${escapeHtml(u.display_name)}</strong>
      <div class="muted" style="margin-top:6px;">Usuario: ${escapeHtml(u.username)}</div>
      <div class="input-row" style="margin-top:10px;">
        <input id="name_${u.id}" value="${escapeHtml(u.display_name)}" placeholder="Nombre visible">
        <input id="pass_${u.id}" type="password" placeholder="Nueva clave (opcional)">
      </div>
      <div class="actions">
        <button class="btn btn-success" onclick="updateUser(${u.id})">Guardar cambios</button>
        <button class="btn btn-danger" onclick="deleteUser(${u.id})">Eliminar</button>
      </div>
    `;
    div.appendChild(card);
  });
}

function actualizarContadores(d) {
  $("countCompras").innerText = (d.compras || []).filter(x => x.estado !== "hecho").length;
  $("countTareas").innerText = (d.tareas || []).filter(x => x.estado !== "hecho").length;
  $("countLogs").innerText = (d.logs || []).length;
}

function revisarNuevosLogs(logs) {
  if (!logs.length) return;
  if (lastLogId === null) {
    lastLogId = logs[0].id;
    return;
  }
  if (logs[0].id !== lastLogId) {
    lastLogId = logs[0].id;
    showToast(`${logs[0].usuario} ${traducirAccion(logs[0].accion)}: ${logs[0].texto}`);
  }
}

async function addItem(tipo) {
  const input = tipo === "compras" ? $("txtCompra") : $("txtTarea");
  const texto = input.value.trim();
  if (!texto) return;

  const r = await api("/api/items/add", {
    method: "POST",
    body: JSON.stringify({ tipo, texto })
  });

  if (!r.ok) {
    mostrarEstado(r.message || "No se pudo guardar");
    return;
  }

  input.value = "";
  await load();
  showToast(`${user.nombre} agregó: ${texto}`);
}

async function toggleItem(tipo, id) {
  const r = await api("/api/items/toggle", {
    method: "POST",
    body: JSON.stringify({ tipo, id })
  });
  if (!r.ok) return mostrarEstado(r.message || "No se pudo actualizar");
  await load();
}

async function deleteItem(tipo, id) {
  const r = await api("/api/items/delete", {
    method: "POST",
    body: JSON.stringify({ tipo, id })
  });
  if (!r.ok) return mostrarEstado(r.message || "No se pudo eliminar");
  await load();
}

async function addUser() {
  const username = $("nuevoUsername").value.trim();
  const display_name = $("nuevoNombre").value.trim();
  const password = $("nuevoPassword").value;

  const r = await api("/api/users/add", {
    method: "POST",
    body: JSON.stringify({ username, display_name, password })
  });

  if (!r.ok) return mostrarEstado(r.message || "No se pudo crear el usuario");
  $("nuevoUsername").value = "";
  $("nuevoNombre").value = "";
  $("nuevoPassword").value = "";
  await load();
  showToast("Usuario creado");
}

async function updateUser(id) {
  const display_name = $(`name_${id}`).value.trim();
  const password = $(`pass_${id}`).value;

  const r = await api("/api/users/update", {
    method: "POST",
    body: JSON.stringify({ id, display_name, password })
  });

  if (!r.ok) return mostrarEstado(r.message || "No se pudo actualizar el usuario");
  await load();
  showToast("Usuario actualizado");
}

async function deleteUser(id) {
  const ok = confirm("¿Seguro que deseas eliminar este usuario?");
  if (!ok) return;

  const r = await api("/api/users/delete", {
    method: "POST",
    body: JSON.stringify({ id })
  });

  if (!r.ok) return mostrarEstado(r.message || "No se pudo eliminar el usuario");
  await load();
  showToast("Usuario eliminado");
}

function tab(t) {
  $("comprasTab").classList.add("hidden");
  $("tareasTab").classList.add("hidden");
  $("actividadTab").classList.add("hidden");
  $("usuariosTab").classList.add("hidden");
  $("avisosTab").classList.add("hidden");

  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));

  if (t === "compras") $("comprasTab").classList.remove("hidden");
  if (t === "tareas") $("tareasTab").classList.remove("hidden");
  if (t === "actividad") $("actividadTab").classList.remove("hidden");
  if (t === "usuarios") $("usuariosTab").classList.remove("hidden");
  if (t === "avisos") $("avisosTab").classList.remove("hidden");

  const btn = document.querySelector(`.nav-btn[data-tab="${t}"]`);
  if (btn) btn.classList.add("active");
}

function restaurarPreferencias() {
  const dark = localStorage.getItem("lista_dark_mode") === "1";
  if (dark) document.body.classList.add("dark");
  actualizarBotonDark();
}

function toggleDarkMode() {
  document.body.classList.toggle("dark");
  localStorage.setItem("lista_dark_mode", document.body.classList.contains("dark") ? "1" : "0");
  actualizarBotonDark();
}

function actualizarBotonDark() {
  $("darkBtn").innerText = document.body.classList.contains("dark") ? "☀️ Modo claro" : "🌙 Modo oscuro";
}

function accionRapida() {
  const comprasVisible = !$("comprasTab").classList.contains("hidden");
  const tareasVisible = !$("tareasTab").classList.contains("hidden");
  const usuariosVisible = !$("usuariosTab").classList.contains("hidden");

  if (comprasVisible) return $("txtCompra").focus();
  if (tareasVisible) return $("txtTarea").focus();
  if (usuariosVisible) return $("nuevoUsername").focus();

  tab("compras");
  $("txtCompra").focus();
}

document.addEventListener("DOMContentLoaded", async () => {
  $("btnLogin")?.addEventListener("click", hacerLogin);
  $("darkBtn")?.addEventListener("click", toggleDarkMode);
  $("fabBtn")?.addEventListener("click", accionRapida);

  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => tab(btn.dataset.tab));
  });

  document.addEventListener("keydown", (e) => {
    const active = document.activeElement;
    if (e.key === "Enter" && active?.id === "clave") hacerLogin();
    if (e.key === "Enter" && active?.id === "txtCompra") addItem("compras");
    if (e.key === "Enter" && active?.id === "txtTarea") addItem("tareas");
  });

  if (user) {
    restaurarPreferencias();
    $("mobileNav").classList.remove("hidden");
    $("fabBtn").classList.remove("hidden");
    tab("compras");
    await load();
    if (timer) clearInterval(timer);
    timer = setInterval(load, 4000);
  }
});

window.addItem = addItem;
window.toggleItem = toggleItem;
window.deleteItem = deleteItem;
window.addUser = addUser;
window.updateUser = updateUser;
window.deleteUser = deleteUser;
window.tab = tab;
