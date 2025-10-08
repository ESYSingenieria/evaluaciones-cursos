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
  container.innerHTML = "";
  const isAsync =
    /asincronico/i.test(courseId) || /asincronico/i.test(itemMeta?.name || "");

  for (let i = 0; i < quantity; i++) {
    const div = document.createElement("div");
    div.className = "inscription-container";

    if (isAsync) {
      // === ASINCRÓNICO: selector de cuenta + precheck ===
      div.innerHTML = `
        <h3>Inscrito ${i + 1}</h3>

        <div style="margin:6px 0 10px 0; display:flex; gap:16px; align-items:center; flex-wrap:wrap;">
          <label style="display:flex; align-items:center; gap:6px;">
            <input type="radio" name="acctmode-${courseId}-${i}" id="mode-existing-${courseId}-${i}" value="existing" checked>
            Cuenta existente
          </label>
          <label style="display:flex; align-items:center; gap:6px;">
            <input type="radio" name="acctmode-${courseId}-${i}" id="mode-new-${courseId}-${i}" value="new">
            Cuenta nueva
          </label>

          <button type="button"
                  id="info-${courseId}-${i}"
                  title="Si escoges 'Cuenta nueva' pero el correo ya está registrado, la clave válida seguirá siendo la original. Si olvidaste tu clave, ve a la página de inicio de sesión y usa 'Cambiar contraseña'."
                  style="border:1px solid #ccc; background:#f7f7f7; border-radius:8px; padding:2px 8px; cursor:help;">
            i
          </button>
        </div>

        <label for="email-${courseId}-${i}">Correo Electrónico:</label>
        <input type="email" id="email-${courseId}-${i}" required>

        <label for="password-${courseId}-${i}">Contraseña:</label>
        <input type="password" id="password-${courseId}-${i}" minlength="6" required>

        <button type="button" id="precheck-${courseId}-${i}" class="btn btn-primary" style="margin:8px 0;">Confirmar</button>

        <div id="status-${courseId}-${i}" style="display:none; margin:6px 0; color:#0a7; font-weight:600;"></div>

        <div id="postconfirm-${courseId}-${i}" style="display:none; margin-top:8px;">
          <div class="ok-msg" style="color:#0a7; font-weight:600; margin-bottom:8px;"></div>

          <label for="name-${courseId}-${i}">Nombre:</label>
          <input type="text" id="name-${courseId}-${i}">

          <label for="rut-${courseId}-${i}">RUT:</label>
          <input type="text" id="rut-${courseId}-${i}">

          <label for="company-${courseId}-${i}">Empresa (Opcional):</label>
          <input type="text" id="company-${courseId}-${i}">
        </div>
      `;
      container.appendChild(div);

      setTimeout(() => {
        // refs
        const modeExisting = div.querySelector(`#mode-existing-${courseId}-${i}`);
        const modeNew      = div.querySelector(`#mode-new-${courseId}-${i}`);
        const btnInfo      = div.querySelector(`#info-${courseId}-${i}`);

        const btn        = div.querySelector(`#precheck-${courseId}-${i}`);
        const emailInput = div.querySelector(`#email-${courseId}-${i}`);
        const passInput  = div.querySelector(`#password-${courseId}-${i}`);
        const statusDiv  = div.querySelector(`#status-${courseId}-${i}`);
        const postBox    = div.querySelector(`#postconfirm-${courseId}-${i}`);
        const okMsg      = postBox.querySelector(".ok-msg");
        const nameInput  = postBox.querySelector(`#name-${courseId}-${i}`);
        const rutInput   = postBox.querySelector(`#rut-${courseId}-${i}`);

        rutInput?.addEventListener("input",(e)=>{ e.target.value = formatRut(e.target.value); });

        // helpers de UI
        const showNewBox = () => {
          postBox.style.display = "";
          okMsg.textContent = "🆕 Cuenta nueva: completa tus datos. Esta cuenta se creará al finalizar la inscripción.";
          if (nameInput) nameInput.required = true;
          if (rutInput)  rutInput.required  = true;
          passInput.dataset.needsAccount = "1"; // crear luego en submit
        };
        const hideNewBox = () => {
          postBox.style.display = "none";
          okMsg.textContent = "";
          if (nameInput) nameInput.required = false;
          if (rutInput)  rutInput.required  = false;
          passInput.dataset.needsAccount = "0"; // no crear
        };
        const clearStatus = () => {
          statusDiv.style.display = "none";
          statusDiv.textContent = "";
        };

        // por defecto: EXISTING
        hideNewBox();
        clearStatus();

        // cambio de modo
        modeExisting.addEventListener("change", () => {
          if (modeExisting.checked) { hideNewBox(); clearStatus(); }
        });
        modeNew.addEventListener("change", () => {
          if (modeNew.checked) { showNewBox(); clearStatus(); }
        });

        // info
        btnInfo.addEventListener("click", () => {
          alert("Si escoges 'Cuenta nueva' pero el correo ya está registrado, la clave válida seguirá siendo la original. Para recuperar tu clave, ve a la página de inicio de sesión y usa 'Cambiar contraseña'.");
        });

        // PRECHECK (solo verifica y marca; NO crea ni asigna aquí)
        btn.addEventListener("click", async () => {
          const mode  = modeNew.checked ? "new" : "existing";
          const email = (emailInput.value || "")
            .normalize("NFKC").toLowerCase()
            .replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g,"").trim();
          const pwd   = (passInput.value || "").trim();

          clearStatus();

          if (!isValidEmail(email)) { alert("Correo inválido."); return; }
          if (mode === "new" && pwd.length < 6) {
            alert("Para crear una cuenta nueva, la contraseña debe tener al menos 6 caracteres.");
            return;
          }

          try {
            const methods = await firebase.auth().fetchSignInMethodsForEmail(email);
            const exists  = Array.isArray(methods) && methods.length > 0;

            if (mode === "existing") {
              if (!exists) {
                alert("Ese correo no tiene cuenta en la plataforma. Cambia a 'Cuenta nueva' para crearla.");
                return;
              }
              // probe de contraseña
              try {
                const app = firebase.apps.find(a=>a.name==="checkpass") || firebase.initializeApp(firebase.app().options,"checkpass");
                const auth = app.auth();
                await auth.signInWithEmailAndPassword(email, pwd);
                await auth.signOut();
                try { await app.delete(); } catch {}

                statusDiv.textContent = "✅ Cuenta verificada. El curso se asignará a esta cuenta al finalizar la inscripción.";
                statusDiv.style.display = "";
                passInput.dataset.needsAccount = "0"; // no crear
              } catch (err) {
                const code = err?.code || "";
                if (code === "auth/wrong-password" || code === "auth/invalid-login-credentials") {
                  alert("La contraseña es incorrecta para esta cuenta existente.");
                  return;
                }
                alert("No se pudo verificar la cuenta. Intenta nuevamente.");
              }
              return;
            }

            // mode === "new"
            if (exists) {
              alert("Este correo ya está registrado. Si es tu cuenta, cambia a 'Cuenta existente' y valida tu contraseña.");
              hideNewBox();
              return;
            }

            // correo no existe → OK para crear en el submit
            showNewBox();
            statusDiv.textContent = "✅ Datos listos. Esta cuenta se creará al finalizar la inscripción.";
            statusDiv.style.display = "";
          } catch (e) {
            console.warn("Precheck error:", e);
            alert("No se pudo verificar el correo ahora. Vuelve a intentar.");
          }
        });

        // Reset si el usuario edita
        const resetOnEdit = () => {
          clearStatus();
          // no bloqueamos nada
        };
        emailInput.addEventListener("input", resetOnEdit);
        passInput.addEventListener("input", resetOnEdit);

      }, 0);

    } else {
      // === NO asincrónico: formulario clásico ===
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
        rutInput?.addEventListener("input",(e)=>{ e.target.value = formatRut(e.target.value); });
      }, 0);
      continue;
    }

    container.appendChild(div);
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

    for (const item of items) {
      const courseId = item.id;
      const coursePrice = item.price;
      const isAsyncItem = /asincronico/i.test(item.id) || /asincronico/i.test(item.name || "");
      let selectedDate = "sin_fecha"; // asincrónicos: fecha de compra; no se selecciona

      if (!isAsyncItem) {
        const ds = document.getElementById(`date-${courseId}`);
        selectedDate = ds ? ds.value : "";
        if (!selectedDate) { alert(`Selecciona una fecha válida para ${item.name}.`); return; }
      }

      // doc en "inscriptions" (EN)
      const inscriptionDocId = `${courseId}_${selectedDate}`;
      const courseRef = db.collection("inscriptions").doc(inscriptionDocId);

      let inscriptions = [];
      let existingData = { inscriptions: [], totalInscritos: 0, totalPagado: 0 };

      await db.runTransaction(async (tx) => {
        const snap = await tx.get(courseRef);
        if (snap.exists) existingData = snap.data() || {};
      });

      // recolecta datos de cada inscrito
      for (let i = 0; i < item.quantity; i++) {
        const email = (document.getElementById(`email-${courseId}-${i}`)?.value || "")
                        .trim().toLowerCase();
        const passEl = document.getElementById(`password-${courseId}-${i}`);
        const needCreate = isAsyncItem && passEl && passEl.dataset.needsAccount === "1";

        let name = "", rut = "", company = null;

        if (isAsyncItem && !needCreate) {
          // cuenta existente (validada en precheck)
          const nameEl = document.getElementById(`name-${courseId}-${i}`);
          const rutEl  = document.getElementById(`rut-${courseId}-${i}`);
          const compEl = document.getElementById(`company-${courseId}-${i}`);
          name    = (nameEl?.value || "").trim();
          rut     = (rutEl?.value  || "").trim();
          company = (compEl?.value || "").trim() || null;

          if (!email) { alert(`Completa el correo para el inscrito ${i + 1} en ${item.name}.`); return; }
        } else {
          // nueva cuenta (asincrónico) o curso NO asincrónico
          const nameEl = document.getElementById(`name-${courseId}-${i}`);
          const rutEl  = document.getElementById(`rut-${courseId}-${i}`);
          const compEl = document.getElementById(`company-${courseId}-${i}`);

          name    = (nameEl?.value || "").trim();
          rut     = (rutEl?.value  || "").trim();
          company = (compEl?.value || "").trim() || null;

          if (!name || !rut || !email) {
            alert(`Completa todos los campos para el inscrito ${i + 1} en ${item.name}.`);
            return;
          }
        }

        inscriptions.push({ name, rut, email, company });
      }

      // guardar lista de inscritos del "inscriptions" (EN)
      existingData.inscriptions.push(...inscriptions);
      existingData.totalInscritos += inscriptions.length;
      existingData.totalPagado += coursePrice;
      await courseRef.set(existingData, { merge: true });

      // === manejo asincrónico (evaluación + meta + inscripciones (ES)) ===
      if (isAsyncItem) {
        const latestEval = await findLatestAsyncEvaluationFor(item);
        if (!latestEval) { console.warn("No se encontró evaluación asincrónica para", item.name); continue; }

        // helper: upsert en "inscripciones" (ES) con evaluationLocked:false
        const upsertInscripcion = async ({ courseKey, dateStr, attendee }) => {
          const sessionId = `${courseKey}_${dateStr}_abierto`;
          const sessRef   = db.collection("inscripciones").doc(sessionId);

          await db.runTransaction(async (tx) => {
            const snap = await tx.get(sessRef);
            const base = snap.exists ? (snap.data() || {}) : {
              courseDate: "",
              courseKey,
              empresaSolicitante: "",
              formaCurso: "abierto",
              inscriptions: {}
            };

            const insc = base.inscriptions || {};
            let idx = Object.keys(insc).find(k =>
              (insc[k]?.attendance?.email || "").toLowerCase() === (attendee.email || "").toLowerCase()
            );
            if (idx === undefined) idx = String(Object.keys(insc).length);

            insc[idx] = { attendance: attendee };
            tx.set(sessRef, { ...base, inscriptions: insc }, { merge: true });
          });

          return sessionId;
        };

        // procesa cada inscrito asincrónico
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
          const rut     = formatRut((rutEl?.value || "").trim());
          const company = (compEl?.value || "").trim();

          const courseKey    = latestEval.id;
          const purchaseDate = purchaseDateYMD();

          const assignEvalToUserDoc = async (userRef) => {
            const snap = await userRef.get();
            let data = snap.exists ? (snap.data() || {}) : {};

            // assignedEvaluations
            const setE = new Set(data.assignedEvaluations || []);
            setE.add(courseKey);
            await userRef.update({
              assignedEvaluations: Array.from(setE),
              rut: formatRut(data.rut || rut || ""),
              company: data.company || company || ""
            });

            // sesión en "inscripciones" (ES), desbloqueada
            const attendee = {
              name:    name || data.name || "",
              rut:     formatRut(rut || data.rut || ""),
              company: company || data.company || "",
              customID: data.customID || "",
              email,
              price: 0,
              evaluationLocked: false
            };
            const sessionId = await upsertInscripcion({ courseKey, dateStr: purchaseDate, attendee });

            // meta
            const prevMeta = data.assignedCoursesMeta || {};
            await userRef.update({
              assignedCoursesMeta: {
                ...prevMeta,
                [courseKey]: {
                  ...(prevMeta[courseKey] || {}),
                  evaluationId: courseKey,
                  courseKey,
                  date: purchaseDate,
                  formaCurso: "abierto",
                  empresaSolicitante: "",
                  priceParticipant: null,
                  precioTotalCerrado: null,
                  sessionId
                }
              }
            });
          };

          if (!needCreate) {
            // cuenta existente (prechequeada)
            const userSnap = await db.collection("users").where("email","==",email).limit(1).get();
            if (!userSnap.empty) {
              await assignEvalToUserDoc(userSnap.docs[0].ref);
            } else {
              // no hay doc en users: obtener UID con login y asignar
              try {
                const appX = firebase.apps.find(a=>a.name==="assignExisting") || firebase.initializeApp(firebase.app().options,"assignExisting");
                const authX = appX.auth();
                const cred  = await authX.signInWithEmailAndPassword(email, password);
                const uid   = cred.user.uid;
                await assignEvalToUserDoc(db.collection("users").doc(uid));
                await authX.signOut();
                await appX.delete();
              } catch (e) {
                console.warn("No se pudo obtener UID para cuenta existente:", e);
                alert(`No se pudo asignar el curso a ${email}. Verifica la contraseña en el precheck.`);
                return;
              }
            }
            continue;
          }

          // crear cuenta nueva
          if (!isValidEmail(email) || password.length < 6 || !name || !rut) {
            alert("Completa todos los campos obligatorios y usa un correo/contraseña válidos.");
            return;
          }

          const secondaryApp  = firebase.apps.find(a=>a.name==="secondary") || firebase.initializeApp(firebase.app().options,"secondary");
          const secondaryAuth = secondaryApp.auth();

          try {
            const cred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
            const uid  = cred.user.uid;
            const cid  = await getNextCustomId();

            // sesión (ES) desbloqueada
            const attendee = { name, rut: formatRut(rut), company, customID: cid, email, price:0, evaluationLocked:false };
            const sessionId = await upsertInscripcion({ courseKey, dateStr: purchaseDate, attendee });

            // doc usuario con meta
            await db.collection("users").doc(uid).set({
              email, name, rut: formatRut(rut), company,
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
            });

          } catch (err) {
            if (err?.code === "auth/email-already-in-use") {
              // carrera
              try {
                const cred = await secondaryAuth.signInWithEmailAndPassword(email, password);
                const uid  = cred.user.uid;
                await assignEvalToUserDoc(db.collection("users").doc(uid));
                await secondaryAuth.signOut();
              } catch (e) {
                console.error("Email existe pero contraseña no coincide:", e);
                alert(`El correo ${email} ya existe y la contraseña no coincide. Corrige en el precheck.`);
                return;
              }
            } else {
              console.error("Error creando usuario asincrónico:", err);
              alert("No se pudo crear la cuenta. Intenta nuevamente.");
              return;
            }
          } finally {
            try { await secondaryAuth.signOut(); } catch {}
          }
        }
      }
    }

    // cerrar compra
    await compraRef.update({ estado: "finalizada" });
    alert("Inscripción confirmada con éxito.");
    window.location.href = "https://esys.cl/";
  } catch (error) {
    console.error("Error al registrar la inscripción:", error);
    alert("Hubo un problema al registrar la inscripción.");
  }
});
