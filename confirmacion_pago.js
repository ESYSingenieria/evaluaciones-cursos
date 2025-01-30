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
    const courseSelect = document.getElementById("course");
    const dateSelect = document.getElementById("date");

    // Recuperar los datos desde sessionStorage
    let pagoConfirmado = JSON.parse(sessionStorage.getItem("pagoConfirmado"));

    if (!pagoConfirmado || pagoConfirmado.length === 0) {
        console.error("⚠️ No hay datos de compra en sessionStorage o el formato es incorrecto.");
        return;
    }

    console.log("✅ Carrito recuperado después del pago:", pagoConfirmado);

    // Llenar el select con los cursos comprados
    pagoConfirmado.forEach(course => {
        let option = document.createElement("option");
        option.value = course.id;
        option.textContent = course.name;
        courseSelect.appendChild(option);
    });

    // Función para cargar fechas cuando se selecciona un curso
    async function loadDates(courseId) {
        dateSelect.innerHTML = ""; // Limpiar las fechas previas
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
                    console.warn("⚠️ El curso no tiene fechas disponibles.");
                }
            } else {
                console.error("⚠️ El curso no existe en Firebase.");
            }
        } catch (error) {
            console.error("❌ Error obteniendo fechas:", error);
        }
    }







    
    // Función para generar campos de inscripción según la cantidad de cursos comprados
function generateInscriptionFields(courseId, quantity) {
    const inscriptionFieldsContainer = document.getElementById("inscription-fields");
    inscriptionFieldsContainer.innerHTML = ""; // Limpiar campos previos

    for (let i = 0; i < quantity; i++) {
        let container = document.createElement("div");
        container.className = "inscription-container";
        container.innerHTML = `
            <h3>Inscrito ${i + 1}</h3>
            <label for="name-${i}">Nombre:</label>
            <input type="text" id="name-${i}" required>
            
            <label for="rut-${i}">RUT:</label>
            <input type="text" id="rut-${i}" required>
            
            <label for="email-${i}">Correo Electrónico:</label>
            <input type="email" id="email-${i}" required>
            
            <label for="company-${i}">Empresa (Opcional):</label>
            <input type="text" id="company-${i}">
        `;
        inscriptionFieldsContainer.appendChild(container);
    }
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


