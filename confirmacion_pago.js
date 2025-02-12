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

    if (!codigoCompra) {
        alert("No se encontró un código de compra en la URL.");
        return;
    }

    // Mostrar el código de compra en la página
    document.getElementById("codigo-compra-texto").textContent = `Código de Compra: ${codigoCompra}`;

    // Guardar en sessionStorage
    sessionStorage.setItem("codigoCompra", codigoCompra);

    // Cargar cursos desde Firestore usando el código de compra
    await cargarCursos(codigoCompra);
});

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
    const codigoCompra = sessionStorage.getItem("codigoCompra");

    if (!codigoCompra) {
        alert("Error: Código de compra no encontrado.");
        return;
    }

    const compraDoc = await db.collection("compras").doc(codigoCompra).get();
    if (!compraDoc.exists) {
        alert("No se encontró la compra en la base de datos.");
        return;
    }

    const compraData = compraDoc.data();
    const allCourses = document.querySelectorAll(".course-container");

    for (let course of allCourses) {
        let selectedCourseId = course.querySelector("select").id.replace("date-", "");
        let selectedDate = course.querySelector("select").value;

        if (!selectedCourseId || !selectedDate) {
            alert("Selecciona un curso y una fecha válida.");
            return;
        }

        let courseData = compraData.items.find(item => item.id === selectedCourseId);
        if (!courseData) {
            console.error(`Error: No se encontró información para el curso ${selectedCourseId}`);
            return;
        }

        let inscriptions = [];
        for (let i = 0; i < courseData.quantity; i++) {
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

        let docId = `${selectedCourseId}_${selectedDate}`;
        let courseRef = db.collection("inscriptions").doc(docId);

        try {
            await db.runTransaction(async (transaction) => {
                let doc = await transaction.get(courseRef);
                let existingData = doc.exists ? doc.data() : { inscriptions: [], totalInscritos: 0, totalPagado: 0 };

                existingData.inscriptions.push(...inscriptions);
                existingData.totalInscritos += inscriptions.length;
                existingData.totalPagado += courseData.price; // ✅ Tomar el total pagado directamente del `price`

                transaction.set(courseRef, existingData);
            });

            await db.collection("compras").doc(codigoCompra).update({ estado: "finalizada" });

            alert("Inscripción confirmada con éxito.");
            window.location.href = "https://esysingenieria.github.io/evaluaciones-cursos/";
        } catch (error) {
            console.error("Error al registrar la inscripción:", error);
            alert("Hubo un problema al registrar la inscripción.");
        }
    }
});
