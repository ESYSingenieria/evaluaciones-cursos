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




// Cargar los cursos desde Firestore según el código de compra
async function cargarCursos(codigoCompra) {
    try {
        const compraDoc = await db.collection("compras").doc(codigoCompra).get();

        if (!compraDoc.exists) {
            return;
        }

        const compraData = compraDoc.data();
        const formContainer = document.getElementById("inscription-fields");

        if (!compraData.items || compraData.items.length === 0) {
            return;
        }

        compraData.items.forEach(async (course) => {
            let courseContainer = document.createElement("div");
            courseContainer.className = "course-container";

            courseContainer.innerHTML = `
                <h2>${course.name}</h2>
                <label for="date-${course.id}">Fecha de Inscripción:</label>
                <select id="date-${course.id}" required></select>
                <div id="inscriptions-${course.id}"></div>
            `;

            formContainer.appendChild(courseContainer);

            await loadDates(course.id, `date-${course.id}`);

            let inscriptionsContainer = document.getElementById(`inscriptions-${course.id}`);
            generateInscriptionFields(course.id, course.quantity, inscriptionsContainer);
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

// === Generar campos de inscripción dinámicos ===
function generateInscriptionFields(courseId, quantity, container) {
    container.innerHTML = "";

    const isAsync = /asincronico/i.test(courseId);

    for (let i = 0; i < quantity; i++) {
        const div = document.createElement("div");
        div.className = "inscription-container";
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

        // 👉 Solo para asincrónicos: agregar campo de contraseña (visible solo si no existe cuenta)
        if (isAsync) {
            const passWrap = document.createElement("div");
            passWrap.id = `passwrap-${courseId}-${i}`;
            passWrap.innerHTML = `
              <label for="password-${courseId}-${i}">Crea una contraseña para acceder a la plataforma:</label>
              <input type="password" id="password-${courseId}-${i}" minlength="6" required>
              <small id="passhint-${courseId}-${i}" style="display:block;color:#666;margin-top:6px;"></small>
            `;
            div.appendChild(passWrap);
            setupPasswordWatcher(courseId, i); // Detecta si el correo ya tiene cuenta
        }

        container.appendChild(div);
    }
}

// === Detectar si el correo ya existe y mostrar/ocultar contraseña ===
function setupPasswordWatcher(courseId, i) {
    const emailInput = document.getElementById(`email-${courseId}-${i}`);
    const passWrap   = document.getElementById(`passwrap-${courseId}-${i}`);
    const passInput  = document.getElementById(`password-${courseId}-${i}`);
    const hint       = document.getElementById(`passhint-${courseId}-${i}`);

    async function checkEmail() {
        const email = (emailInput.value || "").trim().toLowerCase();
        if (!email) {
            passWrap.style.display = "";
            passInput.required = true;
            passInput.dataset.skip = "0";
            hint.textContent = "";
            return;
        }

        try {
            const methods = await firebase.auth().fetchSignInMethodsForEmail(email);
            if (methods && methods.length > 0) {
                // ✅ Ya existe → ocultar campo de contraseña
                passWrap.style.display = "none";
                passInput.required = false;
                passInput.value = "";
                passInput.dataset.skip = "1";
                hint.textContent = "";
            } else {
                // 🚀 No existe → mostrar y exigir contraseña
                passWrap.style.display = "";
                passInput.required = true;
                passInput.dataset.skip = "0";
                hint.textContent = "Será tu contraseña para ingresar a la plataforma.";
            }
        } catch (e) {
            console.error("Error verificando email:", e);
        }
    }

    emailInput.addEventListener("input", debounce(checkEmail, 400));
    emailInput.addEventListener("blur", checkEmail);
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
            const selectedDate = document.getElementById(`date-${courseId}`).value;

            if (!selectedDate) {
                alert(`Selecciona una fecha válida para ${item.name}.`);
                return;
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

            // ✅ Crear usuario o asignar evaluación si el curso es asincrónico
            if (/asincronico/i.test(item.id) || /asincronico/i.test(item.name || "")) {
                console.log(`🔁 Curso asincrónico detectado: ${item.name}`);

                // Buscar la última versión asincrónica según familia
                const idLower = item.id.toLowerCase();
                const family =
                    idLower.includes("70e") ? "70e" :
                    idLower.includes("70b") ? "70b" :
                    (idLower.includes("sf6") || idLower.includes("gas")) ? "sf6" : null;

                const evalsSnap = await db.collection("evaluations").get();
                let latestEval = null;

                evalsSnap.forEach(doc => {
                    const nm = (doc.data()?.name || "").toLowerCase();
                    const idl = (doc.id || "").toLowerCase();

                    const isAsyncEval = nm.includes("asincronico") || idl.includes("asincronico");
                    if (!isAsyncEval) return;

                    const sameFamily =
                        (family === "70e" && (nm.includes("70e") || idl.includes("70e"))) ||
                        (family === "70b" && (nm.includes("70b") || idl.includes("70b"))) ||
                        (family === "sf6" && (nm.includes("sf6") || nm.includes("gas"))) ||
                        (family === null);

                    if (!sameFamily) return;

                    const matchVer = nm.match(/\.v(\d+)/) || idl.match(/\.v(\d+)/);
                    const version = matchVer ? parseInt(matchVer[1]) : 1;
                    if (!latestEval || version > latestEval.version) {
                        latestEval = { id: doc.id, name: doc.data().name, version };
                    }
                });

                if (!latestEval) {
                    console.warn("⚠️ No se encontró evaluación asincrónica para", item.name);
                } else {
                    for (let i = 0; i < item.quantity; i++) {
                        const name    = document.getElementById(`name-${item.id}-${i}`).value.trim();
                        const rut     = document.getElementById(`rut-${item.id}-${i}`).value.trim();
                        const email   = document.getElementById(`email-${item.id}-${i}`).value.trim().toLowerCase();
                        const company = document.getElementById(`company-${item.id}-${i}`).value.trim();
                        const passField = document.getElementById(`password-${item.id}-${i}`);
                        const needPassword = passField && passField.dataset.skip !== "1";

                        // Buscar si ya tiene Auth
                        const methods = await firebase.auth().fetchSignInMethodsForEmail(email);
                        const existsInAuth = methods && methods.length > 0;

                        if (!existsInAuth && needPassword) {
                            const password = (passField.value || "").trim();
                            if (password.length < 6) {
                                alert(`La contraseña debe tener al menos 6 caracteres para ${name}.`);
                                return;
                            }

                            // Crear cuenta en Auth
                            try {
                                const secondaryApp = firebase.initializeApp(firebase.app().options, "secondary");
                                const secondaryAuth = secondaryApp.auth();
                                const cred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
                                const uid = cred.user.uid;

                                await db.collection("users").doc(uid).set({
                                    email, name, rut, company,
                                    role: "user",
                                    assignedEvaluations: [latestEval.id],
                                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                                });

                                console.log(`🆕 Usuario asincrónico creado: ${email}`);
                                await secondaryAuth.signOut();
                                await secondaryApp.delete();

                            } catch (err) {
                                console.error("❌ Error creando usuario:", err);
                            }
                        } else {
                            // Ya existe → asignar curso asincrónico
                            const userSnap = await db.collection("users").where("email", "==", email).limit(1).get();
                            if (!userSnap.empty) {
                                const ref = userSnap.docs[0].ref;
                                const data = userSnap.docs[0].data();
                                const setEval = new Set(data.assignedEvaluations || []);
                                setEval.add(latestEval.id);
                                await ref.update({ assignedEvaluations: Array.from(setEval) });
                                console.log(`✅ Curso asincrónico asignado a usuario existente: ${email}`);
                            }
                        }
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
