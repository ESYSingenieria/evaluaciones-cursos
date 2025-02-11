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






document.addEventListener("DOMContentLoaded", () => {
    // ✅ Obtener los parámetros de la URL
    const urlParams = new URLSearchParams(window.location.search);
    const codigoCompra = urlParams.get("codigoCompra");

    if (!codigoCompra) {
        alert("No se encontró un código de compra en la URL.");
        return;
    }

    // ✅ Mostrar el código de compra en la página
    document.getElementById("codigo-compra-texto").textContent = `Código de Compra: ${codigoCompra}`;

    // ✅ Guardar en sessionStorage para evitar perderlo si la página se recarga
    sessionStorage.setItem("codigoCompra", codigoCompra);
});







document.addEventListener("DOMContentLoaded", async () => {
    let inscripcionConfirmada = sessionStorage.getItem("inscripcionConfirmada");
    let pagoConfirmado = JSON.parse(sessionStorage.getItem("pagoConfirmado"));

    if (inscripcionConfirmada === "true" && (!pagoConfirmado || pagoConfirmado.length === 0)) {
        // ❌ Solo bloquear si no hay datos de compra en sessionStorage
        window.location.replace("https://esysingenieria.github.io/evaluaciones-cursos/tienda_cursos.html");
    }
});


document.addEventListener("DOMContentLoaded", async () => {
    const formContainer = document.getElementById("inscription-fields");
    
    let pagoConfirmado = JSON.parse(sessionStorage.getItem("pagoConfirmado"));
    
    if (!pagoConfirmado || pagoConfirmado.length === 0) {
        console.error("No hay datos de compra en sessionStorage o el formato es incorrecto.");
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

if (pagoConfirmado.length > 1) {
    let copyButton = document.createElement("button");
    copyButton.innerText = "Copiar datos entre cursos";
    copyButton.id = "copy-data-button"; // Asigna un ID para manejarlo después
    copyButton.addEventListener("click", function (event) {
        event.preventDefault(); // ✅ Evita que el formulario se envíe automáticamente

        copyInscriptionData(pagoConfirmado[0].id, pagoConfirmado[1].id);
        alert("✅ Datos copiados entre cursos con éxito.");
    });
    formContainer.appendChild(copyButton);
}



// Función para cargar fechas de inscripción en el select
async function loadDates(courseId, selectId) {
    
    let selectedCourseId = courseId; // Ya lo recibimos como parámetro en la función
    let dateSelect = document.getElementById(`date-${selectedCourseId}`);
    if (!dateSelect) {
        console.error(`Error: No se encontró el elemento de fecha para el curso ${selectedCourseId}`);
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

        `;
        container.appendChild(div);
    }
}

function copyInscriptionData(fromCourseId, toCourseId) {
    let fromInputs = document.querySelectorAll(`[id^="name-${fromCourseId}-"], [id^="rut-${fromCourseId}-"], [id^="email-${fromCourseId}-"], [id^="company-${fromCourseId}-"]`);
    let toInputs = document.querySelectorAll(`[id^="name-${toCourseId}-"], [id^="rut-${toCourseId}-"], [id^="email-${toCourseId}-"], [id^="company-${toCourseId}-"]`);

    fromInputs.forEach((input, index) => {
        if (toInputs[index]) {
            toInputs[index].value = input.value;
        }
    });
}


    window.history.pushState(null, "", window.location.href);
window.onpopstate = function () {
    window.history.pushState(null, "", window.location.href);
};

});





let pagoConfirmado = JSON.parse(sessionStorage.getItem("pagoConfirmado")) || [];


document.getElementById("inscription-form").addEventListener("submit", async function (event) {
    event.preventDefault();

    let allCourses = document.querySelectorAll(".course-container");
    
    for (let course of allCourses) {
        let selectedCourseId = course.querySelector("select").id.replace("date-", "");
        let selectedDate = course.querySelector("select").value;
        
        if (!selectedCourseId || !selectedDate) {
            console.error(`Error: No se pudo determinar el curso seleccionado o la fecha.`);
            alert("Selecciona un curso y una fecha válida.");
            return;
        }

        let selectedCourse = pagoConfirmado.find(course => course.id === selectedCourseId);
        if (!selectedCourse) {
            console.error(`Error: No se encontró información para el curso ${selectedCourseId}`);
            return;
        }

        let inscriptions = [];
        for (let i = 0; i < selectedCourse.quantity; i++) {
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
                existingData.totalPagado += selectedCourse.price * selectedCourse.quantity;

                transaction.set(courseRef, existingData);
            });

    // ✅ Marcar la inscripción como confirmada en sessionStorage
    sessionStorage.setItem("inscripcionConfirmada", "true");

    // ✅ Borrar datos de los inscritos solo después de que la inscripción se confirme
    sessionStorage.removeItem("pagoConfirmado");

    alert("Inscripción confirmada con éxito.");
    window.location.href = "https://esysingenieria.github.io/evaluaciones-cursos/";
} catch (error) {
    console.error("Error al registrar la inscripción:", error);
    alert("Hubo un problema al registrar la inscripción.");
}
    }

    alert("Todas las inscripciones se han confirmado correctamente.");
    window.location.href = "https://esysingenieria.github.io/evaluaciones-cursos/";
});
