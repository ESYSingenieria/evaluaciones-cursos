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
    const formContainer = document.getElementById("inscription-fields");
    
    let pagoConfirmado = JSON.parse(localStorage.getItem("pagoConfirmado"));
    
    if (!pagoConfirmado || pagoConfirmado.length === 0) {
        console.error("No hay datos de compra en localStorage o el formato es incorrecto.");
        return;
    }

    pagoConfirmado.forEach(async (course) => {
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

// Función para cargar fechas de inscripción en el select
async function loadDates(courseId, selectId) {
    let dateSelect = document.getElementById(selectId);
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









    
function generateInscriptionFields(courseId, quantity, container) {
    container.innerHTML = ""; // Limpiar campos previos

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

            <div class="copy-checkbox">
                <input type="checkbox" id="copy-${courseId}-${i}" onchange="copyPrevious(${i}, '${courseId}')">
                <label for="copy-${courseId}-${i}">Usar los mismos datos del anterior</label>
            </div>
        `;
        container.appendChild(div);
    }
}

// Función para copiar datos del inscrito anterior
function copyPrevious(index, courseId) {
    if (index === 0) return; // No se puede copiar en el primero
    
    const prevIndex = index - 1;
    
    document.getElementById(`name-${courseId}-${index}`).value = document.getElementById(`name-${courseId}-${prevIndex}`).value;
    document.getElementById(`rut-${courseId}-${index}`).value = document.getElementById(`rut-${courseId}-${prevIndex}`).value;
    document.getElementById(`email-${courseId}-${index}`).value = document.getElementById(`email-${courseId}-${prevIndex}`).value;
    document.getElementById(`company-${courseId}-${index}`).value = document.getElementById(`company-${courseId}-${prevIndex}`).value;
}


// Ejecutar cuando se seleccione un curso
courseSelect.addEventListener("change", () => {
    let selectedCourseId = courseSelect.value;
    let selectedCourse = pagoConfirmado.find(course => course.id === selectedCourseId);
    if (selectedCourse) {
        generateInscriptionFields(selectedCourseId, selectedCourse.quantity);
    }
});

// Generar automáticamente los campos para el primer curso
if (pagoConfirmado.length > 0) {
    generateInscriptionFields(pagoConfirmado[0].id, pagoConfirmado[0].quantity);
}

});









    document.getElementById("inscription-form").addEventListener("submit", async function (event) {
    event.preventDefault();

    let selectedCourseId = courseSelect.value;
    let selectedDate = dateSelect.value;
    let selectedCourse = pagoConfirmado.find(course => course.id === selectedCourseId);

    if (!selectedCourseId || !selectedDate || !selectedCourse) {
        alert("Selecciona un curso y una fecha válida.");
        return;
    }

    let inscriptions = [];
    for (let i = 0; i < selectedCourse.quantity; i++) {
        let name = document.getElementById(`name-${i}`).value.trim();
        let rut = document.getElementById(`rut-${i}`).value.trim();
        let email = document.getElementById(`email-${i}`).value.trim();
        let company = document.getElementById(`company-${i}`).value.trim() || null; // Empresa opcional

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
            existingData.totalPagado += selectedCourse.price * selectedCourse.quantity;

            transaction.set(courseRef, existingData);
        });

        alert("Inscripción confirmada con éxito.");
        window.location.href = "https://esysingenieria.github.io/evaluaciones-cursos/"; // Redirigir a la página principal
    } catch (error) {
        console.error("Error al registrar la inscripción:", error);
        alert("Hubo un problema al registrar la inscripción.");
    }
});


