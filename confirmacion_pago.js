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
    // ✅ Obtener el código de compra desde la URL
    const urlParams = new URLSearchParams(window.location.search);
    const codigoCompra = urlParams.get("codigoCompra");

    if (!codigoCompra) {
        alert("No se encontró un código de compra en la URL.");
        return;
    }

    // ✅ Mostrar el código de compra en la página
    document.getElementById("codigo-compra-texto").textContent = `Código de Compra: ${codigoCompra}`;

    // ✅ Buscar en Firebase la compra asociada
    try {
        const compraRef = await db.collection("compras").doc(codigoCompra).get();

        if (!compraRef.exists) {
            alert("No se encontró la compra en la base de datos.");
            return;
        }

        const compraData = compraRef.data();

        // 🔹 Verificar si la compra ya tiene inscripciones en Firestore
        const inscripcionRef = await db.collection("inscriptions").doc(codigoCompra).get();
        if (inscripcionRef.exists) {
            alert("Ya se realizó la inscripción para esta compra.");
            window.location.href = "https://esysingenieria.github.io/evaluaciones-cursos/";
            return;
        }

        // ✅ Extraer cursos comprados y generar los contenedores
        const items = compraData.items || [];
        if (items.length === 0) {
            alert("No hay cursos asociados a esta compra.");
            return;
        }

        const formContainer = document.getElementById("inscription-fields");

        items.forEach(course => {
            let courseContainer = document.createElement("div");
            courseContainer.className = "course-container";

            courseContainer.innerHTML = `
                <h2>${course.name}</h2>
                <label for="date-${course.id}">Fecha de Inscripción:</label>
                <select id="date-${course.id}" required></select>
                <div id="inscriptions-${course.id}"></div>
            `;

            formContainer.appendChild(courseContainer);
            loadDates(course.id, `date-${course.id}`);

            let inscriptionsContainer = document.getElementById(`inscriptions-${course.id}`);
            generateInscriptionFields(course.id, course.quantity, inscriptionsContainer);
        });

    } catch (error) {
        console.error("Error obteniendo la compra desde Firebase:", error);
    }
});

// ✅ Función para cargar las fechas disponibles en el select
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

// ✅ Función para generar los campos de inscripción según la cantidad comprada
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

// ✅ Función para confirmar la inscripción y guardarla en Firestore
document.getElementById("inscription-form").addEventListener("submit", async function (event) {
    event.preventDefault();

    let codigoCompra = new URLSearchParams(window.location.search).get("codigoCompra");
    if (!codigoCompra) {
        alert("Error: No se encontró un código de compra.");
        return;
    }

    let allCourses = document.querySelectorAll(".course-container");
    let allInscriptions = [];

    for (let course of allCourses) {
        let selectedCourseId = course.querySelector("select").id.replace("date-", "");
        let selectedDate = course.querySelector("select").value;

        if (!selectedCourseId || !selectedDate) {
            alert("Selecciona un curso y una fecha válida.");
            return;
        }

        let inscriptions = [];
        let inputs = course.querySelectorAll("input");

        for (let i = 0; i < inputs.length; i += 4) {
            let name = inputs[i].value.trim();
            let rut = inputs[i + 1].value.trim();
            let email = inputs[i + 2].value.trim();
            let company = inputs[i + 3].value.trim() || null;

            if (!name || !rut || !email) {
                alert(`Completa todos los campos obligatorios.`);
                return;
            }

            inscriptions.push({ name, rut, email, company });
        }

        allInscriptions.push({ courseId: selectedCourseId, selectedDate, inscriptions });
    }

    try {
        await db.collection("inscriptions").doc(codigoCompra).set({
            inscripciones: allInscriptions,
            codigoCompra: codigoCompra,
            timestamp: new Date()
        });

        alert("Inscripción confirmada con éxito.");
        window.location.href = "https://esysingenieria.github.io/evaluaciones-cursos/";
    } catch (error) {
        console.error("Error al registrar la inscripción:", error);
        alert("Hubo un problema al registrar la inscripción.");
    }
});
