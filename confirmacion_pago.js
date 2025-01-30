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

    // Cargar fechas cuando se seleccione un curso
    courseSelect.addEventListener("change", (event) => {
        let selectedCourseId = event.target.value;
        if (selectedCourseId) {
            loadDates(selectedCourseId);
        }
    });

    // Cargar las fechas para el primer curso automáticamente
    if (pagoConfirmado.length > 0) {
        loadDates(pagoConfirmado[0].id);
    }
});
