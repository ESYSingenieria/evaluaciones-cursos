const firebaseConfig = {
    apiKey: "AIzaSyBikggLtX1nwc1OXWUvDKXFm6P_hAdAe-Y",
    authDomain: "plataforma-de-cursos-esys.firebaseapp.com",
    projectId: "plataforma-de-cursos-esys",
    storageBucket: "plataforma-de-cursos-esys.firebasestorage.app",
    messagingSenderId: "950684050808",
    appId: "1:950684050808:web:33d2ef70f2343642f4548d"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Obtener código de compra desde la URL
document.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const codigoCompra = urlParams.get("codigoCompra");
    const tokenWs = urlParams.get("token_ws");

    // ✅ Llamar a `verificarEstadoPago` después de validar en Firestore
    await verificarEstadoPago(tokenWs, codigoCompra);
    
    if (!tokenWs) {
        window.location.href = "https://esys.cl";
        return;
    }
    
    if (!codigoCompra) {
        window.location.href = "https://esys.cl";
        return;
    }

    // ✅ Consultar la compra en Firestore ANTES de verificar el pago
    const compraRef = db.collection("compras").doc(codigoCompra);
    const compraSnap = await compraRef.get();

    if (!compraSnap.exists) {
        window.location.href = "https://esys.cl";
        return;
    }

    const compraData = compraSnap.data();

    // ✅ Bloquear si el estado es "finalizada"
    if (compraData.estado === "finalizada") {
        window.location.href = "https://esys.cl";
        return;
    }

    // ✅ Mostrar código de compra en la página
    document.getElementById("codigo-compra-texto").textContent = `Código de Compra: ${codigoCompra}`;

});



async function verificarEstadoPago(tokenWs, codigoCompra) {
    console.log("📌 Token a verificar:", tokenWs);
    
    try {
        const response = await fetch(`https://us-central1-plataforma-de-cursos-esys.cloudfunctions.net/consultarEstadoPago?token_ws=${tokenWs}`, {
            method: "GET",
        });

        const data = await response.json();
        console.log("📌 Respuesta del servidor:", data);

        // ✅ Verificar explícitamente si el pago fue aprobado
        if (data.success === true && data.estado === "pagado") {
            console.log("✅ Pago aprobado.");
            // 🚨 Verificar si la compra está en Firestore antes de cargar cursos
            const compraRef = db.collection("compras").doc(codigoCompra);
            const compraSnap = await compraRef.get();
            
            if (!compraSnap.exists) {
                return;
            }
            cargarCursos(codigoCompra);
        } else {
            console.log("❌ Pago rechazado:", data);

            // 🚨 Eliminar la compra de Firebase si el pago fue rechazado
            const compraRef = db.collection("compras").doc(codigoCompra);
            await compraRef.delete()
                .then(() => console.log(`🚨 Compra ${codigoCompra} eliminada de Firebase por pago rechazado.`))
                .catch((error) => console.error("❌ Error eliminando la compra:", error));

            window.location.href = "https://esysingenieria.github.io/evaluaciones-cursos/tienda_cursos.html";
        }
    } catch (error) {
        console.error("🚨 Error al verificar el estado del pago:", error);
        window.location.href = "https://esysingenieria.github.io/evaluaciones-cursos/tienda_cursos.html";
    }
}




async function cargarCursos(codigoCompra) {
  try {
    const compraDoc = await db.collection("compras").doc(codigoCompra).get();
    if (!compraDoc.exists) return;

    const compraData = compraDoc.data();
    const formContainer = document.getElementById("inscription-fields");
    if (!compraData.items || compraData.items.length === 0) return;

    compraData.items.forEach(async (course) => {
      const isAsync = /asincronico/i.test(course.id) || /asincronico/i.test(course.name || "");
      const courseContainer = document.createElement("div");
      courseContainer.className = "course-container";

      courseContainer.innerHTML = `
        <h2>${course.name}</h2>
        ${isAsync ? "" : `
          <label for="date-${course.id}">Fecha de Inscripción:</label>
          <select id="date-${course.id}" required></select>
        `}
        <div id="inscriptions-${course.id}"></div>
      `;

      formContainer.appendChild(courseContainer);

      if (!isAsync) await loadDates(course.id, `date-${course.id}`);

      const inscriptionsContainer = document.getElementById(`inscriptions-${course.id}`);
      generateInscriptionFields(course.id, course.quantity, inscriptionsContainer, course); // ← pasamos course
    });
  } catch (error) {
    console.error("Error al obtener los cursos de la compra:", error);
  }
}

// Función para cargar fechas de inscripción
async function loadDates(courseId, selectId) {
    let dateSelect = document.getElementById(selectId);
    if (!dateSelect) {
        console.error(`Error: No se encontró el elemento de fecha para el curso ${courseId}`);
        return;
    }

    dateSelect.innerHTML = "";

    try {
        const doc = await db.collection("courses").doc(courseId).get();
        if (doc.exists) {
            const courseData = doc.data();
            if (courseData.availableDates && courseData.availableDates.length > 0) {
                courseData.availableDates.forEach(date => {
                    let dateOption = document.createElement("option");
                    dateOption.value = date;
                    dateOption.textContent = date;
                    dateSelect.appendChild(dateOption);
                });
            } else {
                console.warn("El curso no tiene fechas disponibles.");
            }
        } else {
            console.error("El curso no existe en Firebase.");
        }
    } catch (error) {
        console.error("Error obteniendo fechas:", error);
    }
}

// === Helpers iguales al admin ===

// Formatear RUT: "11111111-1" -> "11.111.111-1"
function formatRut(rut) {
  const clean = (rut || "").toUpperCase().replace(/[^0-9K]/g, "");
  const cuerpo = clean.slice(0, -1);
  const dv     = clean.slice(-1);
  const withDots = cuerpo.split("").reverse().join("")
    .match(/.{1,3}/g)?.join(".")?.split("").reverse().join("") || "";
  return withDots + (withDots ? "-" : "") + dv;
}

// Siguiente customID como en el admin: "001-", "002-", ...
async function getNextCustomId() {
  const snap = await db.collection("users").where("role", "==", "user").get();
  let maxN = 0;
  snap.forEach(d => {
    const cid = (d.data().customID || "").trim();
    const n = parseInt(cid, 10);
    if (!isNaN(n) && n > maxN) maxN = n;
  });
  const next = (maxN + 1);
  return String(next).padStart(3, "0") + "-"; // igual que admin
}

// Email válido (evita auth/invalid-email): sanea y valida
function isValidEmail(s) {
  const e = (s || "")
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // caracteres invisibles
    .replace(/\s+/g, "")                   // espacios
    .trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}


// Última evaluación asincrónica por familia (70E/70B/SF6)
async function findLatestAsyncEvaluationFor(item) {
  const idLower = (item.id || "").toLowerCase();
  const family =
    idLower.includes("70e") ? "70e" :
    idLower.includes("70b") ? "70b" :
    (idLower.includes("sf6") || idLower.includes("gas")) ? "sf6" : null;

  const evalsSnap = await db.collection("evaluations").get();
  let latest = null;
  evalsSnap.forEach(doc => {
    const nm  = (doc.data()?.name || "").toLowerCase();
    const idl = (doc.id || "").toLowerCase();
    const isAsyncEval = nm.includes("asincronico") || idl.includes("asincronico");
    if (!isAsyncEval) return;

    const sameFamily =
      (family === "70e" && (nm.includes("70e") || idl.includes("70e"))) ||
      (family === "70b" && (nm.includes("70b") || idl.includes("70b"))) ||
      (family === "sf6" && (nm.includes("sf6") || nm.includes("gas") || idl.includes("sf6") || idl.includes("gas"))) ||
      (family === null);
    if (!sameFamily) return;

    const m = nm.match(/\.v(\d+)\b/) || idl.match(/\.v(\d+)\b/);
    const v = m ? parseInt(m[1], 10) : 1;
    if (!latest || v > latest.version) latest = { id: doc.id, version: v, name: doc.data()?.name || doc.id };
  });
  return latest;
}

// Comprobar existencia en Auth (principal y secundario) y también en 'users'
async function emailExistsInAuth(email) {
  try {
    const e = (email || "")
      .toLowerCase()
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/\s+/g, "")
      .trim();

    if (!isValidEmail(e)) return false;

    const m1 = await firebase.auth().fetchSignInMethodsForEmail(e).catch(() => []);
    const secondaryApp = firebase.apps.find(a => a.name === "secondary") ||
                         firebase.initializeApp(firebase.app().options, "secondary");
    const m2 = await secondaryApp.auth().fetchSignInMethodsForEmail(e).catch(() => []);

    // chequeo adicional en la colección 'users'
    const usersSnap = await db.collection("users").where("email", "==", e).limit(1).get();
    const inUsers = !usersSnap.empty;

    return (m1 && m1.length > 0) || (m2 && m2.length > 0) || inUsers;
  } catch(e) {
    console.warn("emailExistsInAuth error:", e);
    return false;
  }
}

function generateInscriptionFields(courseId, quantity, container, itemMeta = {}) {
  // ——— CSS para el selector y el tooltip (se inyecta una sola vez) ———
  if (!document.getElementById("confirm-ux-css")) {
    const css = document.createElement("style");
    css.id = "confirm-ux-css";
    css.textContent = `
      .mode-toggle { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
      .mode-option {
        display:flex; align-items:center; gap:8px;
        background:#f3f6fb; color:#1f2937;
        border:1px solid #e5e7eb; border-radius:9999px;
        padding:6px 12px; cursor:pointer; user-select:none; transition:all .15s ease;
      }
      .mode-option:hover { background:#eef2ff; border-color:#d1d5db; }
      .mode-option.is-active { background:#2563eb; color:#fff; border-color:#2563eb; }
      .mode-option input[type="radio"] { position:absolute; opacity:0; width:1px; height:1px; pointer-events:none; }

      .info-badge {
        position:relative; display:inline-flex; width:22px; height:22px;
        align-items:center; justify-content:center;
        border-radius:9999px; background:#0ea5e9; color:#fff;
        font-weight:700; font-size:13px; cursor:help;
      }
      .info-badge::after{
        content:attr(data-tip);
        position:absolute; left:50%; transform:translateX(-50%) translateY(8px);
        bottom:-8px; opacity:0; pointer-events:none;
        white-space:pre-line; text-align:left;
        background:#111827; color:#fff; font-size:12px; line-height:1.25;
        padding:8px 10px; border-radius:8px; width:min(320px, 86vw);
        box-shadow:0 10px 20px rgba(0,0,0,.18);
        transition:opacity .15s ease, transform .15s ease;
      }
      .info-badge:hover::after{ opacity:1; transform:translateX(-50%) translateY(12px); }
    `;
    document.head.appendChild(css);
  }

  container.innerHTML = "";
  const isAsync =
    /asincronico/i.test(courseId) || /asincronico/i.test(itemMeta?.name || "");

  for (let i = 0; i < quantity; i++) {
    const div = document.createElement("div");
    div.className = "inscription-container";

    if (isAsync) {
      // ——— ASINCRÓNICO ———
      div.innerHTML = `
        <h3>Inscrito ${i + 1}</h3>

        <div class="mode-toggle">
          <label class="mode-option is-active" id="pill-existing-${courseId}-${i}">
            <input type="radio" name="acctmode-${courseId}-${i}" id="mode-existing-${courseId}-${i}" value="existing" checked>
            <span>Cuenta existente</span>
          </label>

        <label class="mode-option" id="pill-new-${courseId}-${i}">
            <input type="radio" name="acctmode-${courseId}-${i}" id="mode-new-${courseId}-${i}" value="new">
            <span>Cuenta nueva</span>
          </label>

          <span class="info-badge"
                id="info-${courseId}-${i}"
                data-tip="Si escoges 'Cuenta nueva' pero el correo ya está registrado, la contraseña válida seguirá siendo la original.\nPara recuperarla ve a la página de inicio de sesión y usa '¿Olvidaste tu contraseña?'">
            ℹ
          </span>
        </div>

        <label for="email-${courseId}-${i}">Correo Electrónico:</label>
        <input type="email" id="email-${courseId}-${i}" required>

        <label for="password-${courseId}-${i}">Contraseña:</label>
        <input type="password" id="password-${courseId}-${i}" minlength="6" required>

        <button type="button" id="precheck-${courseId}-${i}" class="btn btn-primary" style="margin:8px 0;">Confirmar</button>

        <div id="status-${courseId}-${i}" style="display:none; margin:6px 0; color:#0a7; font-weight:600;"></div>

        <div id="postconfirm-${courseId}-${i}" style="display:none; margin-top:8px;">
          <div class="ok-msg" style="display:none;"></div>

          <label for="name-${courseId}-${i}">Nombre:</label>
          <input type="text" id="name-${courseId}-${i}">

          <label for="rut-${courseId}-${i}">RUT:</label>
          <input type="text" id="rut-${courseId}-${i}">

          <label for="company-${courseId}-${i}">Empresa (Opcional):</label>
          <input type="text" id="company-${courseId}-${i}">
        </div>
      `;
      container.appendChild(div);

      // —— listeners y precheck ——
      setTimeout(() => {
        const modeExisting = div.querySelector(`#mode-existing-${courseId}-${i}`);
        const modeNew      = div.querySelector(`#mode-new-${courseId}-${i}`);
        const pillExisting = div.querySelector(`#pill-existing-${courseId}-${i}`);
        const pillNew      = div.querySelector(`#pill-new-${courseId}-${i}`);

        const btn        = div.querySelector(`#precheck-${courseId}-${i}`);
        const emailInput = div.querySelector(`#email-${courseId}-${i}`);
        const passInput  = div.querySelector(`#password-${courseId}-${i}`);
        const statusDiv  = div.querySelector(`#status-${courseId}-${i}`);
        const postBox    = div.querySelector(`#postconfirm-${courseId}-${i}`);
        const okMsg      = postBox.querySelector(".ok-msg");
        const nameInput  = postBox.querySelector(`#name-${courseId}-${i}`);
        const rutInput   = postBox.querySelector(`#rut-${courseId}-${i}`);

        rutInput?.addEventListener("input", (e) => { e.target.value = formatRut(e.target.value); });

        // helpers UI
        const showNewBox = () => {
          postBox.style.display = "";
          // sin mensajes ni badge, solo campos
          okMsg.style.display = "none";
          if (nameInput) nameInput.required = true;
          if (rutInput)  rutInput.required  = true;
          passInput.dataset.needsAccount = "1";
        };
        const hideNewBox = () => {
          postBox.style.display = "none";
          okMsg.style.display = "none";
          if (nameInput) nameInput.required = false;
          if (rutInput)  rutInput.required  = false;
          passInput.dataset.needsAccount = "0";
        };
        const clearStatus = () => {
          statusDiv.style.display = "none";
          statusDiv.textContent = "";
        };
        const refreshPills = () => {
          pillExisting.classList.toggle("is-active", modeExisting.checked);
          pillNew.classList.toggle("is-active", modeNew.checked);
        };

        // estado inicial → EXISTENTE
        hideNewBox(); clearStatus(); refreshPills();
        btn.style.display = ""; // visible para EXISTENTE

        modeExisting.addEventListener("change", () => {
          // mostrar botón y limpiar mensajes / campos extra
          btn.style.display = "";
          hideNewBox();
          clearStatus();
          refreshPills();
        });

        modeNew.addEventListener("change", () => {
          // ocultar botón y mensajes; mostrar solo los campos
          btn.style.display = "none";
          clearStatus();
          showNewBox();
          refreshPills();
        });

        // ——— PRECHECK: SOLO para CUENTA EXISTENTE ———
        btn.addEventListener("click", async () => {
          if (modeNew.checked) return; // por si acaso

          const email = (emailInput.value || "")
            .normalize("NFKC").toLowerCase()
            .replace(/[\u200B-\u200D\uFEFF]/g, "")
            .replace(/\s+/g, "")
            .trim();
          const pwd   = (passInput.value || "").trim();

          clearStatus();

          if (!isValidEmail(email)) { alert("Correo inválido."); return; }

          try {
            const app  = firebase.apps.find(a => a.name === "checkpass")
                       || firebase.initializeApp(firebase.app().options, "checkpass");
            const auth = app.auth();

            await auth.signInWithEmailAndPassword(email, pwd);
            await auth.signOut();
            try { await app.delete(); } catch {}

            statusDiv.textContent = "✅ Cuenta verificada. El curso se asignará a esta cuenta al finalizar la inscripción.";
            statusDiv.style.display = "";
            passInput.dataset.needsAccount = "0";
            hideNewBox(); // no pedimos nombre/rut

          } catch (err) {
            const code = err?.code || "";
            if (code === "auth/wrong-password" || code === "auth/invalid-login-credentials") {
              alert("La contraseña es incorrecta para esta cuenta existente.");
            } else if (code === "auth/user-not-found") {
              alert("El correo ingresado no está registrado en la plataforma.");
            } else {
              console.warn("Sign-in probe error:", err);
              alert("No se pudo verificar la cuenta. Intenta nuevamente.");
            }
          }
        });

        // limpiar mensajes si editan
        const resetOnEdit = () => { clearStatus(); };
        emailInput.addEventListener("input", resetOnEdit);
        passInput.addEventListener("input", resetOnEdit);
      }, 0);

    } else {
      // ——— NO ASINCRÓNICO (campos simples como antes) ———
      div.innerHTML = `
        <h3>Inscrito ${i + 1}</h3>
        <label for="name-${courseId}-${i}">Nombre:</label>
        <input type="text" id="name-${courseId}-${i}" required>

        <label for="rut-${courseId}-${i}">RUT:</label>
        <input type="text" id="rut-${courseId}-${i}" required>

        <label for="email-${courseId}-${i}">Correo Electrónico:</label>
        <input type="email" id="email-${courseId}-${i}" required>

        <label for="company-${courseId}-${i}">Empresa (Opcional):</label>
        <input type="text" id="company-${courseId}-${i}">
      `;
      container.appendChild(div);
      setTimeout(() => {
        const rutInput = div.querySelector(`#rut-${courseId}-${i}`);
        rutInput?.addEventListener("input", (e) => { e.target.value = formatRut(e.target.value); });
      }, 0);
    }
  }
}

// === Detectar si el correo ya existe y mostrar/ocultar contraseña (con defensas y reintento) ===
function setupPasswordWatcher(courseId, i) {
    const emailInput = document.getElementById(`email-${courseId}-${i}`);
    const passWrap   = document.getElementById(`passwrap-${courseId}-${i}`);
    const passInput  = document.getElementById(`password-${courseId}-${i}`);
    const hint       = document.getElementById(`passhint-${courseId}-${i}`);

    // Si aún no está montado (por timing), reintenta una vez más
    if (!emailInput || !passWrap || !passInput) {
        setTimeout(() => setupPasswordWatcher(courseId, i), 50);
        return;
    }

    async function checkEmail() {
        const email = (emailInput.value || "").trim().toLowerCase();

        // Sin correo → mostramos password y lo requerimos por defecto
        if (!email) {
            passWrap.style.display = "";
            passInput.required = true;
            passInput.dataset.skip = "0";
            if (hint) hint.textContent = "";
            return;
        }

        try {
            const methods = await firebase.auth().fetchSignInMethodsForEmail(email);
            const exists = methods && methods.length > 0;

            if (exists) {
                // ✅ Ya existe → ocultar password y NO exigirlo
                passWrap.style.display = "none";
                passInput.required = false;
                passInput.value = "";
                passInput.dataset.skip = "1"; // lo leerá el submit para no crear Auth
                if (hint) hint.textContent = "";
            } else {
                // 🚀 No existe → mostrar y exigir password
                passWrap.style.display = "";
                passInput.required = true;
                passInput.dataset.skip = "0";
                if (hint) hint.textContent = "Será tu contraseña para ingresar a la plataforma (mínimo 6 caracteres).";
            }
        } catch (e) {
            console.error("Error verificando email:", e);
            // En caso de error de red, mantenemos el campo visible y requerido para no bloquear el flujo
            passWrap.style.display = "";
            passInput.required = true;
            passInput.dataset.skip = "0";
        }
    }

    // Debounce para no spamear a Auth
    const debounced = debounce(checkEmail, 400);

    // 🚦 Enlazar eventos solo si el nodo existe
    emailInput.addEventListener("input", debounced);
    emailInput.addEventListener("blur", checkEmail);

    // Chequeo inicial (autocompletado/navegadores)
    setTimeout(checkEmail, 150);
}

function debounce(fn, ms=350) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
}

document.getElementById("inscription-form").addEventListener("submit", async function (event) {
  event.preventDefault();

  const urlParams = new URLSearchParams(window.location.search);
  const codigoCompra = urlParams.get("codigoCompra");
  if (!codigoCompra) return;

  const purchaseDateYMD = () =>
    new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Santiago" }).format(new Date());

  try {
    // validar compra
    const compraRef = db.collection("compras").doc(codigoCompra);
    const compraSnap = await compraRef.get();
    if (!compraSnap.exists || compraSnap.data().estado === "finalizada") {
      window.location.href = "https://esys.cl/";
      return;
    }

    const compraData = compraSnap.data();
    const items = compraData.items || [];
    if (items.length === 0) return;

    // Helper local: upsert en 'inscripciones' (ES) con el formato correcto:
    // inscriptions: { "0": { email, name, rut, company, customID, price, evaluationLocked, createdAt }, ... }
    const upsertInscripcionES = async ({ courseKey, dateStr, attendee }) => {
      const sessionId = `${courseKey}_${dateStr}_abierto`;
      const sessRef = db.collection("inscripciones").doc(sessionId);

      await db.runTransaction(async (tx) => {
        const snap = await tx.get(sessRef);
        const base = snap.exists ? (snap.data() || {}) : {
          courseDate: dateStr,
          courseKey,
          empresaSolicitante: "",
          formaCurso: "abierto",
          inscriptions: {}
        };

        const insc = Object.assign({}, base.inscriptions || {});
        // Buscar duplicado por email / customID / rut
        let foundKey = Object.keys(insc).find(k => {
          const e = (insc[k]?.email || "").toLowerCase();
          const cid = (insc[k]?.customID || "");
          const r = (insc[k]?.rut || "");
          return (e && e === (attendee.email || "").toLowerCase()) ||
                 (cid && attendee.customID && cid === attendee.customID) ||
                 (r && attendee.rut && r === attendee.rut);
        });

        if (foundKey === undefined) {
          // nuevo índice -> usar longitud actual como clave
          const keys = Object.keys(insc);
          const next = keys.length ? String(Math.max(...keys.map(k => parseInt(k,10).isNaN ? 0 : parseInt(k,10))) + 1) : "0";
          insc[next] = Object.assign({}, attendee);
        } else {
          // ya existe -> actualizar algunos campos y forzar evaluationLocked:false
          insc[foundKey] = Object.assign({}, insc[foundKey], attendee, { evaluationLocked: false });
        }

        const newBase = Object.assign({}, base, { inscriptions: insc, courseKey, courseDate: dateStr, formaCurso: "abierto" });
        tx.set(sessRef, newBase, { merge: true });
      });

      return sessionId;
    };

    // Recorremos items y recolectamos todas las acciones
    for (const item of items) {
      const courseId = item.id;
      const coursePrice = item.price || 0;
      const isAsyncItem = /asincronico/i.test(item.id) || /asincronico/i.test(item.name || "");
      let selectedDate = "sin_fecha"; // asincrónicos: fecha de compra; no se selecciona

      if (!isAsyncItem) {
        const ds = document.getElementById(`date-${courseId}`);
        selectedDate = ds ? ds.value : "";
        if (!selectedDate) { alert(`Selecciona una fecha válida para ${item.name}.`); return; }
      }

      // --- GUARDA en `inscriptions` (EN) como antes (colección inglesa) ---
      const inscriptionDocIdEN = `${courseId}_${selectedDate}`;
      const courseRefEN = db.collection("inscriptions").doc(inscriptionDocIdEN);
      // Leemos snapshot inicial para agregar abajo (merge)
      const existingEN = (await courseRefEN.get()).exists ? (await courseRefEN.get()).data() : { inscriptions: [], totalInscritos: 0, totalPagado: 0 };

      // Recolectar inscritos temporales para EN
      const inscriptionsEN = [];

      // Si es asincrónico, necesitamos la evaluación más reciente
      let latestEval = null;
      if (isAsyncItem) {
        latestEval = await findLatestAsyncEvaluationFor(item);
        if (!latestEval) { console.warn("No se encontró evaluación asincrónica para", item.name); }
      }

      // Recolectar datos de cada inscrito en el item
      for (let i = 0; i < item.quantity; i++) {
        const email = (document.getElementById(`email-${courseId}-${i}`)?.value || "").trim().toLowerCase();
        const passEl = document.getElementById(`password-${courseId}-${i}`);
        const needCreate = isAsyncItem && passEl && passEl.dataset.needsAccount === "1";

        let name = "", rut = "", company = null;
        if (isAsyncItem && !needCreate) {
          // cuenta existente (prechequeada) => no exigimos nombre/rut en precheck
          name    = (document.getElementById(`name-${courseId}-${i}`)?.value || "").trim();
          rut     = (document.getElementById(`rut-${courseId}-${i}`)?.value || "").trim();
          company = (document.getElementById(`company-${courseId}-${i}`)?.value || "").trim() || null;
          if (!email) { alert(`Completa el correo para el inscrito ${i + 1} en ${item.name}.`); return; }
        } else {
          // nueva cuenta (asincrónico) o curso NO asincrónico -> datos obligatorios
          name    = (document.getElementById(`name-${courseId}-${i}`)?.value || "").trim();
          rut     = (document.getElementById(`rut-${courseId}-${i}`)?.value || "").trim();
          company = (document.getElementById(`company-${courseId}-${i}`)?.value || "").trim() || null;
          if (!name || !rut || !email) {
            alert(`Completa todos los campos para el inscrito ${i + 1} en ${item.name}.`);
            return;
          }
        }

        // Normaliza rut
        try { rut = formatRut(rut); } catch(e){}

        inscriptionsEN.push({ name, rut, email, company });
      } // end loop quantity

      // Guardar EN (inscriptions)
      const prevENsnap = await courseRefEN.get();
      const prevEN = prevENsnap.exists ? prevENsnap.data() : { inscriptions: [], totalInscritos:0, totalPagado:0 };
      const mergedEN = {
        ...prevEN,
        inscriptions: (prevEN.inscriptions || []).concat(inscriptionsEN),
        totalInscritos: (prevEN.totalInscritos || 0) + inscriptionsEN.length,
        totalPagado: (prevEN.totalPagado || 0) + (coursePrice * inscriptionsEN.length)
      };
      await courseRefEN.set(mergedEN, { merge: true });

      // --- Manejo ASINCRÓNICO: asignaciones, crear usuarios si corresponde, y escribir en 'inscripciones' (ES) ---
      if (isAsyncItem && latestEval) {
        const courseKey = latestEval.id;
        const purchaseDate = purchaseDateYMD();

        // Procesa cada inscrito de este item
        for (let i = 0; i < item.quantity; i++) {
          const emailEl = document.getElementById(`email-${item.id}-${i}`);
          const passInp = document.getElementById(`password-${item.id}-${i}`);
          if (!emailEl || !passInp) continue;

          const email = (emailEl.value || "").trim().toLowerCase();
          const password = (passInp.value || "").trim();
          const needCreate = passInp.dataset.needsAccount === "1";

          const nameEl = document.getElementById(`name-${item.id}-${i}`);
          const rutEl  = document.getElementById(`rut-${item.id}-${i}`);
          const compEl = document.getElementById(`company-${item.id}-${i}`);
          const name    = (nameEl?.value || "").trim();
          const rut     = formatRut((rutEl?.value || "").trim() || "");
          const company = (compEl?.value || "").trim() || "";

          // Construye el objeto attendee **al nivel correcto** (NO dentro de attendance)
          const attendee = {
            email,
            name,
            rut,
            company: company || null,
            price: 0,
            evaluationLocked: false,
            certDownloadLocked: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          };

          // Helper para asignar evaluación al documento de usuario
          const assignEvalToUserDocRef = async (userDocRef) => {
            const snap = await userDocRef.get();
            const data = snap.exists ? (snap.data() || {}) : {};

            // assignedEvaluations: añadir si no existe
            const assignedEvaluations = Array.isArray(data.assignedEvaluations) ? [...data.assignedEvaluations] : [];
            if (!assignedEvaluations.includes(courseKey)) assignedEvaluations.push(courseKey);

            // build/update assignedCoursesMeta
            const prevMeta = data.assignedCoursesMeta || {};
            const newMeta = Object.assign({}, prevMeta, {
              [courseKey]: Object.assign({}, prevMeta[courseKey] || {}, {
                evaluationId: courseKey,
                courseKey,
                date: purchaseDate,
                formaCurso: "abierto",
                empresaSolicitante: "",
                priceParticipant: null,
                precioTotalCerrado: null,
                sessionId: null // se actualizará después de upsertInscripcionES
              })
            });

            await userDocRef.set({
              email: data.email || attendee.email,
              name: data.name || attendee.name,
              rut: data.rut || attendee.rut,
              company: data.company || attendee.company,
              customID: data.customID || null,
              role: data.role || "user",
              assignedEvaluations,
              assignedCoursesMeta: newMeta,
              createdAt: data.createdAt || firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
          };

          if (!needCreate) {
            // Cuenta existente: localizar user doc por email
            const userSnap = await db.collection("users").where("email", "==", email).limit(1).get();
            if (!userSnap.empty) {
              const uRef = userSnap.docs[0].ref;
              // asignar meta preliminar
              await assignEvalToUserDocRef(uRef);
              // upsert en inscripciones ES y recuperar sessionId
              const sessionId = await upsertInscripcionES({ courseKey, dateStr: purchaseDate, attendee });
              // ahora actualizamos assignedCoursesMeta[courseKey].sessionId
              await uRef.update({
                [`assignedCoursesMeta.${courseKey}.sessionId`]: sessionId
              });
            } else {
              // Si no existe doc en users: intentamos obtener UID con signIn (app temporal)
              try {
                const appX = firebase.apps.find(a => a.name === "assignExisting") || firebase.initializeApp(firebase.app().options, "assignExisting");
                const authX = appX.auth();
                const cred = await authX.signInWithEmailAndPassword(email, password);
                const uid = cred.user.uid;
                // aseguramos doc users con uid
                const uRef = db.collection("users").doc(uid);
                await assignEvalToUserDocRef(uRef);
                const sessionId = await upsertInscripcionES({ courseKey, dateStr: purchaseDate, attendee });
                await uRef.update({
                  [`assignedCoursesMeta.${courseKey}.sessionId`]: sessionId
                });
                await authX.signOut();
                try { await appX.delete(); } catch(e){}
              } catch (e) {
                console.warn("No se pudo obtener UID para cuenta existente:", e);
                alert(`No se pudo asignar el curso a ${email}. Verifica la contraseña en el precheck.`);
                return;
              }
            }
            continue; // siguiente inscrito
          }

          // needCreate === true -> crear cuenta nueva en Auth (secondary) Y doc en users
          if (!isValidEmail(email) || password.length < 6 || !name || !rut) {
            alert("Completa todos los campos obligatorios y usa un correo/contraseña válidos.");
            return;
          }

          const secondaryApp  = firebase.apps.find(a => a.name === "secondary") || firebase.initializeApp(firebase.app().options, "secondary");
          const secondaryAuth = secondaryApp.auth();

          try {
            // Crear usuario en Auth
            const cred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
            const uid  = cred.user.uid;

            // Obtener next customID similar al admin
            const cid = await getNextCustomId();

            // Añadir customID a attendee
            attendee.customID = cid;

            // Crear session ES (desbloqueada)
            const sessionId = await upsertInscripcionES({ courseKey, dateStr: purchaseDate, attendee });

            // Crear doc en users con assignedEvaluations y assignedCoursesMeta
            const userObj = {
              email,
              name,
              rut,
              company: company || null,
              customID: cid,
              role: "user",
              assignedEvaluations: [courseKey],
              assignedCoursesMeta: {
                [courseKey]: {
                  evaluationId: courseKey,
                  courseKey,
                  date: purchaseDate,
                  formaCurso: "abierto",
                  empresaSolicitante: "",
                  priceParticipant: null,
                  precioTotalCerrado: null,
                  sessionId
                }
              },
              createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            await db.collection("users").doc(uid).set(userObj, { merge: true });

            // cerrar sesión secundaria si quedó abierta
            try { await secondaryAuth.signOut(); } catch(e){}
          } catch (err) {
            // Si el email ya existe por race condition
            if (err?.code === "auth/email-already-in-use") {
              // Intentar sign-in para recuperar UID y asignar
              try {
                const cred = await secondaryAuth.signInWithEmailAndPassword(email, password);
                const uid = cred.user.uid;
                const uRef = db.collection("users").doc(uid);
                await assignEvalToUserDocRef(uRef);
                const sessionId = await upsertInscripcionES({ courseKey, dateStr: purchaseDate, attendee });
                await uRef.update({
                  [`assignedCoursesMeta.${courseKey}.sessionId`]: sessionId
                });
                await secondaryAuth.signOut();
              } catch (e) {
                console.error("Email existe pero contraseña no coincide:", e);
                alert(`El correo ${email} ya existe y la contraseña no coincide. Corrige en el precheck.`);
                return;
              }
            } else {
              console.error("Error creando usuario asincrónico:", err);
              alert("No se pudo crear la cuenta. Intenta nuevamente.");
              try { await secondaryAuth.signOut(); } catch(e){}
              return;
            }
          } finally {
            try { await secondaryAuth.signOut(); } catch(e) {}
          }
        } // end loop each attendee for this async item
      } // end if isAsyncItem

    } // end for items

    // cerrar compra
    await compraRef.update({ estado: "finalizada" });
    alert("Inscripción confirmada con éxito.");
    window.location.href = "https://esys.cl/";
  } catch (error) {
    console.error("Error al registrar la inscripción:", error);
    alert("Hubo un problema al registrar la inscripción.");
  }
});
