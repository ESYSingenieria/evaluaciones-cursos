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

document.addEventListener("DOMContentLoaded", async () => {
    // ✅ Obtener los parámetros de la URL
    const urlParams = new URLSearchParams(window.location.search);
    const codigoCompra = urlParams.get("codigoCompra");

    if (!codigoCompra) {
        alert("No se encontró un código de compra en la URL.");
        window.location.href = "https://esysingenieria.github.io/evaluaciones-cursos/";
        return;
    }

    // ✅ Mostrar el código de compra en la página
    document.getElementById("codigo-compra-texto").textContent = `Código de Compra: ${codigoCompra}`;

    // ✅ Guardar en sessionStorage para evitar perderlo si la página se recarga
    sessionStorage.setItem("codigoCompra", codigoCompra);

    // ✅ Verificar si ya se usó el código de compra
    const esValido = await verificarCodigoCompra(codigoCompra);
    if (!esValido) return; // Bloquear si ya fue usado

    await cargarCursos();
});

// ✅ Verificar si el código de compra ya ha sido utilizado
async function verificarCodigoCompra(codigoCompra) {
    try {
        const compraRef = await db.collection("compras").doc(codigoCompra).get();

        if (!compraRef.exists) {
            alert("⚠️ No se encontró la compra en la base de datos.");
            window.location.href = "https://esysingenieria.github.io/evaluaciones-cursos/";
            return false;
        }

        const compraData = compraRef.data();

        if (compraData.inscripcionConfirmada) {
            alert("⚠️ Ya se han registrado los inscritos para este código de compra. No puedes volver a inscribir.");
            window.location.href = "https://esysingenieria.github.io/evaluaciones-cursos/";
            return false;
        }

        sessionStorage.setItem("pagoConfirmado", JSON.stringify(compraData.cursos));
        return true;
    } catch (error) {
        console.error("Error verificando el código de compra:", error);
        return false;
    }
}

// ✅ Cargar los cursos comprados y generar los formularios
async function cargarCursos() {
    let codigoCompra = sessionStorage.getItem("codigoCompra");

    if (!codigoCompra) {
        console.error("No se encontró un código de compra en sessionStorage.");
        return;
    }

    try {
        const compraRef = await firebase.firestore().collection("compras").doc(codigoCompra).get();

        if (!compraRef.exists) {
            console.error("No se encontró la compra en Firebase.");
            return;
        }

        let compraData = compraRef.data();

        if (!compraData || !compraData.cursosComprados) {
            console.error("Error: No hay cursos asociados a esta compra.");
            return;
        }

        let pagoConfirmado = compraData.cursosComprados;
        sessionStorage.setItem("pagoConfirmado", JSON.stringify(pagoConfirmado));

        console.log("Cursos cargados:", pagoConfirmado);
    } catch (error) {
        console.error("Error obteniendo la compra desde Firebase:", error);
    }
}


// ✅ Función para cargar fechas de inscripción en los selects
async function loadDates(courseId, selectId) {
    let dateSelect = document.getElementById(selectId);
    if (!dateSelect) {
        console.error(`Error: No se encontró el elemento de fecha para el curso ${courseId}`);
        return;
    }

    dateSelect.innerHTML = "";

    try {
        const doc = await firebase.firestore().collection("courses").doc(courseId).get();
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

// ✅ Generar los campos para la inscripción
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

// ✅ Función para confirmar la inscripción
document.getElementById("inscription-form").addEventListener("submit", async function (event) {
    event.preventDefault();
    let codigoCompra = sessionStorage.getItem("codigoCompra");

    if (!codigoCompra) {
        alert("Error: Código de compra no encontrado.");
        return;
    }

    let allCourses = document.querySelectorAll(".course-container");

    for (let course of allCourses) {
        let selectedCourseId = course.querySelector("select").id.replace("date-", "");
        let selectedDate = course.querySelector("select").value;
        
        if (!selectedCourseId || !selectedDate) {
            alert("Selecciona un curso y una fecha válida.");
            return;
        }

        let inscriptions = [];
        let quantity = document.querySelectorAll(`[id^="name-${selectedCourseId}-"]`).length;

        for (let i = 0; i < quantity; i++) {
            let name = document.getElementById(`name-${selectedCourseId}-${i}`).value.trim();
            let rut = document.getElementById(`rut-${selectedCourseId}-${i}`).value.trim();
            let email = document.getElementById(`email-${selectedCourseId}-${i}`).value.trim();
            let company = document.getElementById(`company-${selectedCourseId}-${i}`).value.trim() || null;

            if (!name || !rut || !email) {
                alert(`Completa todos los campos obligatorios para el inscrito ${i + 1}.`);
                return;
            }

            inscriptions.push({ name, rut, email, company });
        }

        await db.collection("compras").doc(codigoCompra).update({ inscripcionConfirmada: true });
    }

    alert("✅ Inscripción confirmada con éxito.");
    window.location.href = "https://esysingenieria.github.io/evaluaciones-cursos/";
});
