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
      // ——— ASINCRÓNICO: precheck (valida/etiqueta; NO crea/NO asigna aquí) ———
      div.innerHTML = `
        <h3>Inscrito ${i + 1}</h3>

        <label for="email-${courseId}-${i}">Correo Electrónico:</label>
        <input type="email" id="email-${courseId}-${i}" required>

        <label for="password-${courseId}-${i}">Contraseña:</label>
        <input type="password" id="password-${courseId}-${i}" minlength="6" required>

        <button type="button" id="precheck-${courseId}-${i}" class="btn btn-primary" style="margin:8px 0;">Confirmar</button>

        <!-- Mensaje para cuenta EXISTENTE -->
        <div id="status-${courseId}-${i}" style="display:none; margin:6px 0; color:#0a7; font-weight:600;"></div>

        <!-- Bloque para CUENTA NUEVA (solo se muestra si no existe en Auth) -->
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

      setTimeout(() => {
        const btn        = div.querySelector(`#precheck-${courseId}-${i}`);
        const emailInput = div.querySelector(`#email-${courseId}-${i}`);
        const passInput  = div.querySelector(`#password-${courseId}-${i}`);
        const statusDiv  = div.querySelector(`#status-${courseId}-${i}`);
        const postBox    = div.querySelector(`#postconfirm-${courseId}-${i}`);
        const okMsg      = postBox.querySelector(".ok-msg");
        const nameInput  = postBox.querySelector(`#name-${courseId}-${i}`);
        const rutInput   = postBox.querySelector(`#rut-${courseId}-${i}`);

        // Formateo RUT en vivo solo si se muestra el bloque de nueva cuenta
        rutInput?.addEventListener("input", (e) => {
          e.target.value = formatRut(e.target.value);
        });

        btn?.addEventListener("click", async () => {
          // Normalización fuerte del email
          const email = (emailInput.value || "")
            .normalize("NFKC")
            .toLowerCase()
            .replace(/[\u200B-\u200D\uFEFF]/g, "") // zero-width
            .replace(/\s+/g, "")                   // espacios
            .trim();
          const pwd   = (passInput.value || "").trim();

          if (!isValidEmail(email)) {
            alert("Correo inválido.");
            return;
          }

          // === Paso A: consulta rápida a Authentication (principal y secundaria)
          let existsViaMethods = false;
          try {
            const m1 = await firebase.auth()
              .fetchSignInMethodsForEmail(email)
              .catch(() => []);
            const secApp =
              firebase.apps.find((a) => a.name === "secondary") ||
              firebase.initializeApp(firebase.app().options, "secondary");
            const m2 = await secApp
              .auth()
              .fetchSignInMethodsForEmail(email)
              .catch(() => []);
            existsViaMethods = (m1 && m1.length > 0) || (m2 && m2.length > 0);
          } catch (_) {
            // seguimos al probe
          }

          // === Paso B: “probe” de sign-in para distinguir user-not-found vs wrong-password
          // Si ya sabemos que existe por métodos, igual verificamos contraseña.
          try {
            const chkApp =
              firebase.apps.find((a) => a.name === "checkpass") ||
              firebase.initializeApp(firebase.app().options, "checkpass");
            const chkAuth = chkApp.auth();

            await chkAuth.signInWithEmailAndPassword(email, pwd);
            // Si llegó aquí: EXISTE y la contraseña es correcta
            await chkAuth.signOut();
            await chkApp.delete();

            // ✅ Cuenta EXISTENTE verificada (no crear ahora; se asignará en el submit)
            statusDiv.textContent =
              "✅ Cuenta verificada. El curso se asignará a esta cuenta al finalizar la inscripción.";
            statusDiv.style.display = "";
            btn.disabled = true;
            emailInput.readOnly = true;
            passInput.readOnly = true;
            passInput.dataset.needsAccount = "0";

            // Asegura que el bloque de 'nueva cuenta' NO exija datos
            postBox.style.display = "none";
            if (nameInput) nameInput.required = false;
            if (rutInput) rutInput.required = false;
            return;
          } catch (err) {
            const code = err?.code || "";
            if (existsViaMethods && code === "auth/wrong-password") {
              // Existe en Auth, pero contraseña incorrecta
              alert("La contraseña es incorrecta para esta cuenta existente.");
              return;
            }
            if (code !== "auth/user-not-found" && code !== "auth/wrong-password") {
              console.warn("Sign-in probe error:", err);
              alert("No se pudo verificar la cuenta. Intenta nuevamente.");
              return;
            }
            // Si cae aquí con user-not-found y tampoco había métodos → tratamos como NO existente
          }

          // === Paso C: cuenta NO existe → pedir datos para crear en el submit final
          if (pwd.length < 6) {
            alert(
              "Para crear una cuenta nueva, la contraseña debe tener al menos 6 caracteres."
            );
            return;
          }

          okMsg.textContent =
            "🆕 Cuenta nueva detectada: completa tus datos para crearla al finalizar la inscripción.";
          postBox.style.display = "";
          passInput.dataset.needsAccount = "1"; // el submit final CREARÁ la cuenta
          btn.disabled = true;
          emailInput.readOnly = true;
          passInput.readOnly = true;

          // Ahora sí, estos datos son obligatorios
          if (nameInput) nameInput.required = true;
          if (rutInput) rutInput.required = true;
        });
      }, 0);
    } else {
      // ——— NO asincrónico: formulario clásico ———
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

      setTimeout(() => {
        const rutInput = div.querySelector(`#rut-${courseId}-${i}`);
        rutInput?.addEventListener("input", (e) => {
          e.target.value = formatRut(e.target.value);
        });
      }, 0);
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

// Confirmar inscripción y actualizar Firestore
document.getElementById("inscription-form").addEventListener("submit", async function (event) {
    event.preventDefault();

    const urlParams = new URLSearchParams(window.location.search);
    const codigoCompra = urlParams.get("codigoCompra");

    if (!codigoCompra) {
        return;
    }

    try {
        // ✅ Validar el estado de la compra antes de inscribir
        const compraRef = db.collection("compras").doc(codigoCompra);
        const compraSnap = await compraRef.get();

        if (!compraSnap.exists || compraSnap.data().estado === "finalizada") {
            window.location.href = "https://esys.cl/";
            return;
        }

        const compraData = compraSnap.data();
        const items = compraData.items;

        if (!items || items.length === 0) {
            return;
        }

        for (const item of items) {
            const courseId = item.id;
            const coursePrice = item.price;
            const isAsync = /asincronico/i.test(item.id) || /asincronico/i.test(item.name || "");
            let selectedDate = "sin_fecha"; // marcador para asincrónicos

            if (!isAsync) {
              const ds = document.getElementById(`date-${courseId}`);
              selectedDate = ds ? ds.value : "";
              if (!selectedDate) {
                alert(`Selecciona una fecha válida para ${item.name}.`);
                return;
              }
            }

            const inscriptionDocId = `${courseId}_${selectedDate}`;
            const courseRef = db.collection("inscriptions").doc(inscriptionDocId);

            let inscriptions = [];
            let existingData = { inscriptions: [], totalInscritos: 0, totalPagado: 0 };

            await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(courseRef);
                if (doc.exists) {
                    existingData = doc.data();
                }
            });

            for (let i = 0; i < item.quantity; i++) {
                const email = (document.getElementById(`email-${courseId}-${i}`).value || "").trim().toLowerCase();
                const passEl = document.getElementById(`password-${courseId}-${i}`);
                const isAsync = /asincronico/i.test(item.id) || /asincronico/i.test(item.name || "");
                const needCreate = isAsync && passEl && passEl.dataset.needsAccount === "1";

                let name = "", rut = "", company = null;

                if (isAsync && !needCreate) {
                  // ✅ Asincrónico con cuenta existente verificada en el precheck:
                  // no obligamos nombre/rut aquí (se asigna al final).
                  // Puedes opcionalmente tomar valores si el admin los quiere registrar.
                  const nameEl = document.getElementById(`name-${courseId}-${i}`);
                  const rutEl  = document.getElementById(`rut-${courseId}-${i}`);
                  const compEl = document.getElementById(`company-${courseId}-${i}`);
                  name    = (nameEl?.value || "").trim();
                  rut     = (rutEl?.value  || "").trim();
                  company = (compEl?.value || "").trim() || null;

                  if (!email) {
                    alert(`Completa el correo para el inscrito ${i + 1} en ${item.name}.`);
                    return;
                  }

                } else {
                  // 🆕 Cuenta nueva (asincrónico) O curso NO asincrónico → datos obligatorios
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

            existingData.inscriptions.push(...inscriptions);
            existingData.totalInscritos += inscriptions.length;
            existingData.totalPagado += coursePrice;

            await courseRef.set(existingData, { merge: true });

            // === SOLO asincrónico ===
            if (/asincronico/i.test(item.id) || /asincronico/i.test(item.name || "")) {

                const latestEval = await findLatestAsyncEvaluationFor(item);
                if (!latestEval) {
                    console.warn("No se encontró evaluación asincrónica para", item.name);
                    continue;
                }

                for (let i = 0; i < item.quantity; i++) {
                    const emailEl = document.getElementById(`email-${item.id}-${i}`);
                    const passInp = document.getElementById(`password-${item.id}-${i}`);
                    if (!emailEl || !passInp) { continue; }

                    const email = (emailEl.value || "").trim().toLowerCase();
                    const password = (passInp.value || "").trim();
                    const needCreate = passInp.dataset.needsAccount === "1"; // set por el precheck

                    // Campos opcionales (si existen)
                    const nameEl = document.getElementById(`name-${item.id}-${i}`);
                    const rutEl  = document.getElementById(`rut-${item.id}-${i}`);
                    const compEl = document.getElementById(`company-${item.id}-${i}`);
                    const name    = (nameEl?.value || "").trim();
                    const rut     = formatRut((rutEl?.value || "").trim());
                    const company = (compEl?.value || "").trim();

                    // Helper asignar evaluación a un doc users (evita duplicar)
                    const assignEvalToUserDoc = async (userRef) => {
                        const snap = await userRef.get();
                        if (snap.exists) {
                            const data = snap.data() || {};
                            const setE = new Set(data.assignedEvaluations || []);
                            setE.add(latestEval.id);
                            await userRef.update({
                                assignedEvaluations: Array.from(setE),
                                rut: formatRut(data.rut || rut || ""),
                                company: data.company || company || ""
                            });
                        } else {
                            // si no existía el doc, créalo mínimo con el curso
                            await userRef.set({
                                email, name: name || "", rut: rut || "", company: company || "",
                                role: "user",
                                customID: await getNextCustomId(),
                                assignedEvaluations: [latestEval.id],
                                assignedCoursesMeta: {},
                                createdAt: firebase.firestore.FieldValue.serverTimestamp()
                            });
                        }
                    };

                    if (!needCreate) {
                        // ✅ CUENTA EXISTENTE (validada en precheck): asignar evaluación
                        // Intentamos encontrar users por email
                        const userSnap = await db.collection("users").where("email","==",email).limit(1).get();
                        if (!userSnap.empty) {
                            await assignEvalToUserDoc(userSnap.docs[0].ref);
                        } else {
                            // No hay doc en users → firmar con la contraseña validada (misma que se usó en precheck)
                            // para obtener el UID y crear el doc con ese UID
                            try {
                                const appX = firebase.apps.find(a => a.name === "assignExisting") ||
                                             firebase.initializeApp(firebase.app().options, "assignExisting");
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

                    // 🆕 CUENTA NUEVA: crear en Auth y users con UID real
                    if (!isValidEmail(email) || password.length < 6 || !name || !rut) {
                        alert("Completa todos los campos obligatorios y usa un correo/contraseña válidos.");
                        return;
                    }

                    const secondaryApp  = firebase.apps.find(a => a.name === "secondary") ||
                                          firebase.initializeApp(firebase.app().options, "secondary");
                    const secondaryAuth = secondaryApp.auth();

                    try {
                        const cred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
                        const uid  = cred.user.uid;

                        await db.collection("users").doc(uid).set({
                            email, name, rut, company,
                            customID: await getNextCustomId(),
                            role: "user",
                            assignedEvaluations: [latestEval.id],
                            assignedCoursesMeta: {},
                            createdAt: firebase.firestore.FieldValue.serverTimestamp()
                        });

                        console.log("🆕 Usuario creado en Auth + users, curso asignado:", email, latestEval.id);

                    } catch (err) {
                        if (err?.code === "auth/email-already-in-use") {
                            // Carrera: alguien lo creó entre el precheck y el submit.
                            // Iniciamos sesión con la contraseña ingresada para obtener UID real y asignar.
                            try {
                                const cred = await secondaryAuth.signInWithEmailAndPassword(email, password);
                                const uid  = cred.user.uid;

                                await assignEvalToUserDoc(db.collection("users").doc(uid));

                                console.log(`⚠️ Email ya existía; se usó UID real y se asignó curso: ${email}`);

                                await secondaryAuth.signOut();
                            } catch (e) {
                                console.error("El email existe pero la contraseña no coincide:", e);
                                alert(`El correo ${email} ya existe y la contraseña no coincide. Corrige en el precheck.`);
                                return;
                            }
                        } else {
                            console.error("❌ Error creando usuario asincrónico:", err);
                            alert("No se pudo crear la cuenta. Intenta nuevamente.");
                            return;
                        }
                    } finally {
                        try { await secondaryAuth.signOut(); } catch {}
                    }
                }
            }
        }

        // ✅ Cambiar el estado de la compra a "finalizada"
        await compraRef.update({ estado: "finalizada" });

        alert("Inscripción confirmada con éxito.");
        window.location.href = "https://esys.cl/";

    } catch (error) {
        console.error("Error al registrar la inscripción:", error);
        alert("Hubo un problema al registrar la inscripción.");
    }
});
