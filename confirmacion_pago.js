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

// Email válido (evita auth/invalid-email)
function isValidEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || "").trim());
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

// Comprobar existencia en Auth (principal y secundario)
async function emailExistsInAuth(email) {
  try {
    const m1 = await firebase.auth().fetchSignInMethodsForEmail(email);
    const secondaryApp = firebase.apps.find(a => a.name === "secondary") ||
                         firebase.initializeApp(firebase.app().options, "secondary");
    const m2 = await secondaryApp.auth().fetchSignInMethodsForEmail(email);
    return (m1 && m1.length > 0) || (m2 && m2.length > 0);
  } catch(e) {
    console.warn("fetchSignInMethods error:", e);
    // si falla la red no asumimos existencia (el submit volverá a verificar)
    return false;
  }
}

function generateInscriptionFields(courseId, quantity, container, itemMeta = {}) {
  container.innerHTML = "";
  const isAsync = /asincronico/i.test(courseId);

  for (let i = 0; i < quantity; i++) {
    const div = document.createElement("div");
    div.className = "inscription-container";

    if (isAsync) {
      // ——— ASINCRÓNICO: primero correo + contraseña + Confirmar ———
      div.innerHTML = `
        <h3>Inscrito ${i + 1}</h3>

        <label for="email-${courseId}-${i}">Correo Electrónico:</label>
        <input type="email" id="email-${courseId}-${i}" required>

        <label for="password-${courseId}-${i}">Contraseña:</label>
        <input type="password" id="password-${courseId}-${i}" minlength="6" required>

        <button type="button" id="precheck-${courseId}-${i}" class="btn btn-primary" style="margin:8px 0;">Confirmar</button>

        <div id="postconfirm-${courseId}-${i}" style="display:none; margin-top:8px;">
          <div class="ok-msg" style="color:#0a7; font-weight:600; margin-bottom:8px;"></div>

          <label for="name-${courseId}-${i}">Nombre:</label>
          <input type="text" id="name-${courseId}-${i}" required>

          <label for="rut-${courseId}-${i}">RUT:</label>
          <input type="text" id="rut-${courseId}-${i}" required>

          <label for="company-${courseId}-${i}">Empresa (Opcional):</label>
          <input type="text" id="company-${courseId}-${i}">
        </div>
      `;

      setTimeout(() => {
        const btn = div.querySelector(`#precheck-${courseId}-${i}`);
        const emailInput = div.querySelector(`#email-${courseId}-${i}`);
        const passInput  = div.querySelector(`#password-${courseId}-${i}`);
        const postBox    = div.querySelector(`#postconfirm-${courseId}-${i}`);
        const okMsg      = postBox.querySelector(".ok-msg");
        const rutInput   = postBox.querySelector(`#rut-${courseId}-${i}`);

        rutInput?.addEventListener("input", e => { e.target.value = formatRut(e.target.value); });

        btn?.addEventListener("click", async () => {
          const email = (emailInput.value || "").trim().toLowerCase();
          const pwd   = (passInput.value || "").trim();
          if (!isValidEmail(email)) { alert("Correo inválido."); return; }
          if (pwd.length < 6) { alert("La contraseña debe tener mínimo 6 caracteres."); return; }

          const latestEval = await findLatestAsyncEvaluationFor(itemMeta || { id: courseId });
          if (!latestEval) { alert("No hay versión asincrónica disponible por ahora."); return; }

          const exists = await emailExistsInAuth(email);

          if (exists) {
            // Asignar curso y enviar a login
            const userSnap = await db.collection("users").where("email","==",email).limit(1).get();
            if (!userSnap.empty) {
              const ref = userSnap.docs[0].ref;
              const data = userSnap.docs[0].data();
              const setE = new Set(data.assignedEvaluations || []);
              setE.add(latestEval.id);

              if (!data.customID) {
                const cid = await getNextCustomId();
                await ref.update({ assignedEvaluations: Array.from(setE), customID: cid });
              } else {
                await ref.update({ assignedEvaluations: Array.from(setE) });
              }
            } else {
              const cid = await getNextCustomId();
              await db.collection("users").add({
                email, name: "", rut: "", company: "",
                customID: cid, role: "user",
                assignedEvaluations: [latestEval.id],
                assignedCoursesMeta: {},
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
              });
            }

            alert("Curso asociado a tu cuenta. Inicia sesión para acceder.");
            window.location.href = "https://esysingenieria.github.io/evaluaciones-cursos/index.html";
            return;
          }

          // NO existe → muestra los otros campos (Nombre/RUT/Empresa) y marca que debe crear cuenta
          okMsg.textContent = "Cuenta nueva: completa tus datos para crearla.";
          postBox.style.display = "";
          passInput.dataset.needsAccount = "1"; // lo leerá el submit
          btn.disabled = true;
          emailInput.readOnly = true;
          passInput.readOnly  = true;
        });
      }, 0);

    } else {
      // ——— NO asincrónico: tu forma estándar ———
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
        rutInput?.addEventListener("input", e => e.target.value = formatRut(e.target.value));
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
                let name = document.getElementById(`name-${courseId}-${i}`).value.trim();
                let rut = document.getElementById(`rut-${courseId}-${i}`).value.trim();
                let email = document.getElementById(`email-${courseId}-${i}`).value.trim();
                let company = document.getElementById(`company-${courseId}-${i}`).value.trim() || null;

                if (!name || !rut || !email) {
                    alert(`Completa todos los campos para el inscrito ${i + 1} en ${item.name}.`);
                    return;
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
                    // Aun así continúa con inscriptions y el resto de items
                    continue;
                }

                for (let i = 0; i < item.quantity; i++) {
                    const emailEl = document.getElementById(`email-${item.id}-${i}`);
                    const passInp = document.getElementById(`password-${item.id}-${i}`);
                    if (!emailEl || !passInp) { continue; }

                    const email = (emailEl.value || "").trim().toLowerCase();
                    const needCreate = passInp.dataset.needsAccount === "1"; // ← lo setea el precheck

                    // Si NO hay que crear (porque el precheck detectó cuenta existente y ya asignó/redirigió),
                    // aquí no hacemos nada y seguimos con el siguiente inscrito.
                    if (!needCreate) {
                        continue;
                    }

                    // Crear CUENTA NUEVA (correo no existía) con los campos revelados tras el precheck
                    const nameEl = document.getElementById(`name-${item.id}-${i}`);
                    const rutEl  = document.getElementById(`rut-${item.id}-${i}`);
                    const compEl = document.getElementById(`company-${item.id}-${i}`);

                    const name    = (nameEl?.value || "").trim();
                    const rut     = formatRut((rutEl?.value || "").trim());
                    const company = (compEl?.value || "").trim();
                    const password = (passInp.value || "").trim();

                    if (!name || !rut || !isValidEmail(email) || password.length < 6) {
                        alert("Completa todos los campos obligatorios y usa un correo/contraseña válidos.");
                        return;
                    }

                    const customID = await getNextCustomId();
                    const secondaryApp  = firebase.apps.find(a => a.name === "secondary") || firebase.initializeApp(firebase.app().options, "secondary");
                    const secondaryAuth = secondaryApp.auth();

                    try {
                        const cred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
                        const uid  = cred.user.uid;

                        await db.collection("users").doc(uid).set({
                            email, name, rut, company,
                            customID,
                            role: "user",
                            assignedEvaluations: [latestEval.id],
                            assignedCoursesMeta: {},
                            createdAt: firebase.firestore.FieldValue.serverTimestamp()
                        });

                        console.log("🆕 Usuario creado y curso asignado:", email, latestEval.id);
                    } catch (err) {
                        if (err?.code === "auth/email-already-in-use") {
                            // Carrera: alguien creó justo antes → tratar como existente y asignar
                            const userSnap = await db.collection("users").where("email","==",email).limit(1).get();
                            if (!userSnap.empty) {
                                const ref  = userSnap.docs[0].ref;
                                const data = userSnap.docs[0].data();
                                const setE = new Set(data.assignedEvaluations || []);
                                setE.add(latestEval.id);
                                if (!data.customID) {
                                    const cid = await getNextCustomId();
                                    await ref.update({ assignedEvaluations: Array.from(setE), customID: cid });
                                } else {
                                    await ref.update({ assignedEvaluations: Array.from(setE) });
                                }
                                console.log(`✅ Cuenta ya existía; curso asignado: ${email}`);
                            } else {
                                // Existe en Auth pero no hay doc 'users' → crear doc espejo con customID
                                const cid = await getNextCustomId();
                                await db.collection("users").add({
                                    email, name, rut, company,
                                    customID: cid,
                                    role: "user",
                                    assignedEvaluations: [latestEval.id],
                                    assignedCoursesMeta: {},
                                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                                });
                                console.warn(`⚠️ Auth existía sin doc users; creado doc espejo para ${email}`);
                            }
                        } else {
                            console.error("❌ Error creando usuario asincrónico:", err);
                        }
                    } finally {
                        try { await secondaryAuth.signOut(); } catch {}
                    }
                }

                // Importante: si el usuario EXISTÍA, ya se asignó y se redirigió en el precheck
                // (en generateInscriptionFields → botón Confirmar). Aquí solo se crean cuentas nuevas.
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
