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

    if (!tokenWs) {
        alert("No se encontró el token de transacción en la URL.");
        window.location.href = "https://esysingenieria.github.io/evaluaciones-cursos/tienda_cursos.html";
        return;
    }

    verificarEstadoPago(tokenWs, codigoCompra);

    
    
    if (!codigoCompra) {
        alert("No se encontró un código de compra en la URL.");
        window.location.href = "https://esysingenieria.github.io/evaluaciones-cursos/tienda_cursos.html";
        return;
    }

    // ✅ Consultar la compra en Firestore
    const compraRef = db.collection("compras").doc(codigoCompra);
    const compraSnap = await compraRef.get();

    if (!compraSnap.exists) {
        alert("No se encontró la compra en la base de datos.");
        window.location.href = "https://esysingenieria.github.io/evaluaciones-cursos/tienda_cursos.html";
        return;
    }

    const compraData = compraSnap.data();

    // ✅ Bloquear si el estado es "finalizada"
    if (compraData.estado === "finalizada") {
        alert("Esta compra ya ha sido utilizada para inscribir personas.");
        window.location.href = "https://esysingenieria.github.io/evaluaciones-cursos/tienda_cursos.html";
        return;
    }

    // ✅ Mostrar código de compra en la página
    document.getElementById("codigo-compra-texto").textContent = `Código de Compra: ${codigoCompra}`;

    // ✅ Llamar a cargarCursos después de verificar que la compra es válida
    cargarCursos(codigoCompra);

});



async function verificarEstadoPago(tokenWs, codigoCompra) {
    try {
        const response = await fetch(`https://confirmarpagowebpay-wf5bhi5ova-uc.a.run.app?token_ws=${tokenWs}`);
        const data = await response.json();

        if (data.success && data.estado === "pagado") {
            console.log("✅ Pago verificado correctamente.");
            cargarCursos(codigoCompra);
        } else {
            alert("❌ El pago no fue aprobado. No puedes inscribir personas.");
            window.location.href = "https://esysingenieria.github.io/evaluaciones-cursos/tienda_cursos.html";
        }
    } catch (error) {
        console.error("🚨 Error al verificar el estado del pago:", error);
        alert("No se pudo verificar el pago. Intenta nuevamente.");
        window.location.href = "https://esysingenieria.github.io/evaluaciones-cursos/tienda_cursos.html";
    }
}



// Cargar los cursos desde Firestore según el código de compra
async function cargarCursos(codigoCompra) {
    try {
        const compraDoc = await db.collection("compras").doc(codigoCompra).get();

        if (!compraDoc.exists) {
            alert("No se encontró la compra en la base de datos.");
            return;
        }

        const compraData = compraDoc.data();
        const formContainer = document.getElementById("inscription-fields");

        if (!compraData.items || compraData.items.length === 0) {
            alert("No hay cursos asociados a esta compra.");
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

// Generar los campos de inscripción
function generateInscriptionFields(courseId, quantity, container) {
    container.innerHTML = "";

    for (let i = 0; i < quantity; i++) {
        let div = document.createElement("div");
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
        container.appendChild(div);
    }
}

// Confirmar inscripción y actualizar Firestore
document.getElementById("inscription-form").addEventListener("submit", async function (event) {
    event.preventDefault();

    const urlParams = new URLSearchParams(window.location.search);
    const codigoCompra = urlParams.get("codigoCompra");

    if (!codigoCompra) {
        alert("No se encontró un código de compra válido.");
        return;
    }

    try {
        // ✅ Validar el estado de la compra antes de inscribir
        const compraRef = db.collection("compras").doc(codigoCompra);
        const compraSnap = await compraRef.get();

        if (!compraSnap.exists || compraSnap.data().estado === "finalizada") {
            alert("Esta compra ya ha sido utilizada o no es válida.");
            window.location.href = "https://esysingenieria.github.io/evaluaciones-cursos/tienda_cursos.html";
            return;
        }

        const compraData = compraSnap.data();
        const items = compraData.items;

        if (!items || items.length === 0) {
            alert("No hay cursos asociados a esta compra.");
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
        }

        // ✅ Cambiar el estado de la compra a "finalizada"
        await compraRef.update({ estado: "finalizada" });

        alert("Inscripción confirmada con éxito.");
        window.location.href = "https://esysingenieria.github.io/evaluaciones-cursos/";

    } catch (error) {
        console.error("Error al registrar la inscripción:", error);
        alert("Hubo un problema al registrar la inscripción.");
    }
});
