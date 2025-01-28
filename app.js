// Configuración de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyBikggLtX1nwc1OXWUvDKXFm6P_hAdAe-Y",
    authDomain: "plataforma-de-cursos-esys.firebaseapp.com",
    projectId: "plataforma-de-cursos-esys",
    storageBucket: "plataforma-de-cursos-esys.firebasestorage.app",
    messagingSenderId: "950684050808",
    appId: "1:950684050808:web:33d2ef70f2343642f4548d"
};

const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

if (typeof pdfjsLib === 'undefined') {

} else {

    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/build/pdf.worker.min.js';
}


// Función para cambiar la contraseña mediante el correo electrónico
const changePassword = async () => {
    // Solicitar correo electrónico al usuario
    const email = prompt("Por favor, ingresa tu correo electrónico:");

    if (!email) {
        alert("No se ingresó ningún correo.");
        return;
    }

    try {
        // Verificar si el correo está registrado en Firebase
        const signInMethods = await auth.fetchSignInMethodsForEmail(email);

        if (signInMethods.length === 0) {
            alert("El correo ingresado no está registrado en la plataforma.");
            return;
        }

        // Enviar correo de restablecimiento de contraseña
        await auth.sendPasswordResetEmail(email);
        alert(`Se ha enviado un correo para restablecer tu contraseña a ${email}.`);
    } catch (error) {
        console.error("Error al intentar cambiar la contraseña:", error);

        // Manejo de errores comunes
        switch (error.code) {
            case 'auth/invalid-email':
                alert("El correo ingresado no es válido.");
                break;
            case 'auth/user-not-found':
                alert("El correo ingresado no está registrado en la plataforma.");
                break;
            default:
                alert("Ocurrió un error al intentar cambiar la contraseña. Inténtalo de nuevo.");
        }
    }
};

// Evento para el botón de cambiar contraseña
document.addEventListener("DOMContentLoaded", () => {
    const changePasswordButton = document.getElementById("changePasswordButton");

    if (changePasswordButton) {
        changePasswordButton.addEventListener("click", changePassword);
    }
});










// Consolidar autenticación en una única función
auth.onAuthStateChanged(async (user) => {
    if (!user) {
        console.log("No hay usuario autenticado.");

        // Redirigir al inicio de sesión solo si no estás ya en 'index.html'
        if (!window.location.pathname.includes("index.html")) {
            window.location.href = "index.html";
        }
    } else {
        console.log("Usuario autenticado:", user.uid);

        try {
            // Asegúrate de que todas las funciones relacionadas con datos de usuario se ejecuten aquí
            const userData = await loadUserData(); // Cargar datos del usuario de la base de datos
            console.log("Datos del usuario cargados:", userData);

            if (window.location.pathname.includes("dashboard.html")) {
                // Mostrar datos del usuario en el Dashboard
                const userNameElement = document.getElementById("userNameDisplay");
                const userRutElement = document.getElementById("userRutDisplay");

                if (userNameElement) {
                    userNameElement.textContent = userData.name || "Nombre no disponible";
                }

                if (userRutElement) {
                    userRutElement.textContent = userData.rut || "RUT no disponible";
                }

                // Cargar evaluaciones y respuestas
                await loadEvaluations();
                await loadResponses();
            }

            if (window.location.pathname.includes("manual.html")) {
                await loadPDF(); // Cargar el manual
            }

            if (window.location.pathname.includes("evaluation.html")) {
                await loadEvaluation(); // Cargar la evaluación
            }
        } catch (error) {
            console.error("Error al cargar los datos del usuario:", error);
        }
    }
});

// Manejo de inicio de sesión
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        try {
            await auth.signInWithEmailAndPassword(email, password);
            window.location.href = "dashboard.html";
        } catch (error) {
            document.getElementById('errorMessage').innerText = error.message;
        }
    });
}

// Lógica para editar y guardar datos del usuario
document.addEventListener("DOMContentLoaded", async () => {
    const userNameDisplay = document.getElementById("userNameDisplay");
    const userRutDisplay = document.getElementById("userRutDisplay");
    const editProfileButton = document.getElementById("editProfileButton");

    let isEditing = false;

    const loadUserData = async () => {
        try {
            const user = auth.currentUser;
            if (!user) throw new Error("Usuario no autenticado.");

            // Obtener datos del usuario desde Firestore
            const userDoc = await db.collection("users").doc(user.uid).get();
            if (!userDoc.exists) throw new Error("Datos del usuario no encontrados.");

            const userData = userDoc.data();

            // Asegurarse de que los campos name y rut existen
            const userName = userData.name || "Nombre no disponible";
            const userRut = userData.rut || "RUT no disponible";

            userNameDisplay.textContent = userName;
            userRutDisplay.textContent = userRut;
        } catch (error) {
            console.error("Error al cargar los datos del usuario:", error);
            userNameDisplay.textContent = "Error al cargar nombre.";
            userRutDisplay.textContent = "Error al cargar RUT.";
        }
    };

    const enableEditing = () => {
        // Cambiar los textos a inputs para edición
        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.id = "userNameInput";
        nameInput.value = userNameDisplay.textContent;

        const rutInput = document.createElement("input");
        rutInput.type = "text";
        rutInput.id = "userRutInput";
        rutInput.value = userRutDisplay.textContent;

        userNameDisplay.textContent = "";
        userRutDisplay.textContent = "";

        userNameDisplay.appendChild(nameInput);
        userRutDisplay.appendChild(rutInput);

        editProfileButton.textContent = "Guardar";
        isEditing = true;
    };

    const saveChanges = async () => {
        const user = auth.currentUser;
        if (!user) {
            alert("Usuario no autenticado.");
            return;
        }

        const updatedName = document.getElementById("userNameInput").value.trim();
        const updatedRut = document.getElementById("userRutInput").value.trim();

        if (!updatedName || !updatedRut) {
            alert("Por favor, completa todos los campos.");
            return;
        }

        try {
            // Actualizar en Firestore
            await db.collection("users").doc(user.uid).update({
                name: updatedName,
                rut: updatedRut,
            });

            // Actualizar la vista
            userNameDisplay.textContent = updatedName;
            userRutDisplay.textContent = updatedRut;

            editProfileButton.textContent = "Editar perfil";
            isEditing = false;
        } catch (error) {
            console.error("Error al guardar los cambios:", error);
            alert("Hubo un problema al guardar los cambios.");
        }
    };

    editProfileButton.addEventListener("click", () => {
        if (isEditing) {
            saveChanges();
        } else {
            enableEditing();
        }
    });

    // Cargar datos del usuario al iniciar
    await loadUserData();
});



























// Lógica para cargar evaluaciones asignadas específicamente a un usuario
const loadEvaluations = async () => {
    const evaluationsList = document.getElementById('evaluationsList');
    const user = auth.currentUser;
    if (!user) return;

    try {
        const userDoc = await db.collection('users').doc(user.uid).get();
        const assignedEvaluations = userDoc.data().assignedEvaluations || [];

        const snapshot = await db.collection('evaluations').get();
        evaluationsList.innerHTML = ''; // Limpiar la lista

        snapshot.forEach(doc => {
            if (assignedEvaluations.includes(doc.id)) {
                const evaluation = doc.data();
                console.log(`Evaluación: ${evaluation.title}, isLocked: ${evaluation.isLocked}`); // Depuración

                // Asegurarse de que isLocked esté definido
                const isLocked = evaluation.isLocked === true;

                // Crear contenedor para la evaluación
                const div = document.createElement('div');
                div.className = "evaluation-item";

                // Imagen de portada
                const img = document.createElement('img');
                img.src = evaluation.imageURL || 'default-image.jpg'; // Imagen por defecto si no está configurada
                img.alt = `Portada de ${evaluation.title}`;
                img.className = 'evaluation-image';
                img.style.borderRadius = "5px";
                img.style.marginBottom = "10px";

                // Título del curso
                const title = document.createElement('h3');
                title.textContent = evaluation.title;
                title.style.marginBottom = "10px";

                // Crear un contenedor para los botones
                const buttonContainer = document.createElement('div');
                buttonContainer.style.display = "flex";
                buttonContainer.style.justifyContent = "center";
                buttonContainer.style.gap = "10px"; // Reduce la separación entre botones
                buttonContainer.style.marginTop = "-6px"; // Ajusta la posición más abajo
                buttonContainer.style.position = "relative";
                buttonContainer.style.top = "-2px"; // Mueve los botones ligeramente hacia abajo

                // Botón para abrir el manual
                const manualButton = document.createElement('button');
                manualButton.textContent = "Abrir Manual";
                manualButton.style.padding = "10px 20px";
                manualButton.style.backgroundColor = "#007BFF";
                manualButton.style.color = "white";
                manualButton.style.border = "none";
                manualButton.style.borderRadius = "5px";
                manualButton.style.cursor = "pointer";
                manualButton.addEventListener("click", () => {
                    const manualUrl = `manual.html?evaluationId=${doc.id}`;
                    window.open(manualUrl, "_blank");
                });

                // Botón para iniciar evaluación
                const startButton = document.createElement('button');
                startButton.textContent = "Comenzar Evaluación";
                startButton.disabled = isLocked; // Deshabilitar si está bloqueada
                startButton.style.padding = "10px 20px";
                startButton.style.backgroundColor = isLocked ? "#ccc" : "#28a745"; // Gris si está bloqueada
                startButton.style.color = isLocked ? "#666" : "white";
                startButton.style.border = "none";
                startButton.style.borderRadius = "5px";
                startButton.style.cursor = isLocked ? "not-allowed" : "pointer";

                if (!isLocked) {
                    startButton.addEventListener("click", () => {
                        window.location.href = `evaluation.html?id=${doc.id}`;
                    });
                }

                // Agregar los botones al contenedor
                buttonContainer.appendChild(manualButton);
                buttonContainer.appendChild(startButton);

                // Agregar elementos al contenedor principal
                div.appendChild(img); // Imagen
                div.appendChild(title); // Título
                div.appendChild(buttonContainer); // Contenedor de botones

                // Agregar el contenedor al listado
                evaluationsList.appendChild(div);
            }
        });

        if (evaluationsList.innerHTML === '') {
            evaluationsList.innerHTML = '<p>No tienes evaluaciones asignadas.</p>';
        }
    } catch (error) {
        console.error('Error cargando evaluaciones:', error);
    }
};


// Verificar encuesta de satisfacción antes de realizar la evaluación
const checkSurveyCompletion = async (evaluationId, userId) => {
    const surveySnapshot = await db.collection('surveys')
        .where('userId', '==', userId)
        .where('evaluationId', '==', evaluationId)
        .get();

    if (surveySnapshot.empty) {
        alert('Debes completar la encuesta de satisfacción antes de realizar esta evaluación.');
        window.location.href = `survey.html?evaluationId=${evaluationId}`;
        return false;
    }
    return true;
};

// Enviar respuestas de evaluation.html
let isSubmitting = false; // Control para evitar envíos múltiples

const submitEvaluation = async (event) => {
    event.preventDefault(); // Evitar el envío predeterminado

    const confirmSubmission = window.confirm("¿Estás seguro de que quieres enviar tus respuestas?");
    if (!confirmSubmission) return;

    const urlParams = new URLSearchParams(window.location.search);
    const evaluationId = urlParams.get('id');
    const form = document.getElementById('evaluationForm');
    const formData = new FormData(form);
    const answers = {};

    formData.forEach((value, key) => {
        answers[key] = value;
    });

    if (Object.keys(answers).length === 0) {
        alert("Debes responder al menos una pregunta antes de enviar.");
        return;
    }

    try {
        const user = auth.currentUser;
        if (!user) throw new Error("Usuario no autenticado.");

        const userId = user.uid; // Define `userId` correctamente aquí

        // Guardar respuestas reales en Firestore
        await db.collection('responses').add({
            userId: userId,
            evaluationId: evaluationId,
            answers: answers,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        });

        form.innerHTML = `
            <p>Gracias por enviar tus respuestas. En el Dashboard puedes ver tus resultados.</p>
            <button id="backToDashboard" type="button">Volver al Dashboard</button>
        `;

        document.getElementById('backToDashboard').addEventListener('click', () => {
            window.location.href = "dashboard.html";
        });

        // Llamar a `calculateAndHandleResult` con `userId` correctamente definido
        await calculateAndHandleResult(userId, evaluationId, answers);
        console.log("Evaluación procesada correctamente.");

    } catch (error) {
        console.error("Error al enviar las respuestas:", error);
        alert("Hubo un error al enviar las respuestas. Por favor, inténtalo de nuevo.");
    }
};


// Vincular el evento de envío al formulario
// Asegúrate de que el evento se registre solo una vez
document.addEventListener('DOMContentLoaded', () => {
    const evaluationForm = document.getElementById('evaluationForm');
    if (evaluationForm && !evaluationForm.dataset.listenerAttached) {
        evaluationForm.addEventListener('submit', submitEvaluation);
        evaluationForm.dataset.listenerAttached = true; // Marca que el listener ya fue agregado
    }
});

// Cargar respuestas en dashboard.html
const loadResponses = async () => {
    const responsesContainer = document.getElementById('responsesList');
    responsesContainer.innerHTML = ""; // Limpia el contenedor

    try {
        const user = auth.currentUser;
        if (!user) throw new Error("Usuario no autenticado.");

        // Obtener respuestas del usuario desde Firestore
        const snapshot = await db.collection('responses')
            .where('userId', '==', user.uid)
            .get();

        if (snapshot.empty) {
            responsesContainer.innerHTML = "<p>No tienes evaluaciones realizadas.</p>";
            return;
        }

        const resultsMap = {};

        for (const doc of snapshot.docs) {
            const response = doc.data();
            const result = await calculateResult(response.evaluationId, response.answers);

            if (result) {
                const evaluationId = response.evaluationId;

                // Si no existe una entrada para este evaluationId o el puntaje es mayor, actualizamos
                if (!resultsMap[evaluationId] || result.score > resultsMap[evaluationId].score) {
                    resultsMap[evaluationId] = {
                        score: result.score,
                        grade: result.grade,
                        timestamp: response.timestamp,
                    };
                }
            }
        }

        // Mostrar los resultados con el puntaje más alto
        for (const evaluationId in resultsMap) {
            const evaluationDoc = await db.collection('evaluations').doc(evaluationId).get();
            const evaluationTitle = evaluationDoc.exists ? evaluationDoc.data().title : "Nombre no disponible";

            const highestResult = resultsMap[evaluationId];
            const div = document.createElement('div');
            div.className = "result-item";
            div.innerHTML = `
                <h3>${evaluationTitle}</h3>
                <p><strong>Puntaje:</strong> ${highestResult.score}</p>
                <p><strong>Estado de Aprobación:</strong> ${highestResult.grade}</p>
            `;

            if (highestResult.score >= 92) {
                const approvalDate = highestResult.timestamp 
                    ? new Date(highestResult.timestamp.toDate()).toLocaleDateString()
                    : "Fecha no disponible";

                // Crear contenedor para los botones
                const buttonContainer = document.createElement("div");
                buttonContainer.className = "button-container"; // Clase del CSS para diseño

                // Botón para descargar el certificado
                const downloadButton = document.createElement("button");
                downloadButton.textContent = "Descargar Certificado";
                downloadButton.className = "download-button"; // Clase CSS para diseño
                downloadButton.addEventListener("click", () => {
                    console.log("Intentando generar certificado para:", evaluationId);
                    generateCertificateFromPDF(auth.currentUser.email, evaluationId, highestResult.score, approvalDate);
                });

                // Botón de añadir a LinkedIn
                const linkedInButton = document.createElement("button");
                linkedInButton.textContent = "Añadir a LinkedIn";
                linkedInButton.className = "linkedin-button"; // Clase CSS para diseño
                linkedInButton.addEventListener("click", async () => {
                    try {
                        const userDoc = await db.collection("users").doc(auth.currentUser.uid).get();
                        const customID = userDoc.exists ? userDoc.data().customID : "defaultID";

                        const evaluationDoc = await db.collection("evaluations").doc(evaluationId).get();
                        const evaluationData = evaluationDoc.exists ? evaluationDoc.data() : null;

                        if (!evaluationData) {
                            alert("No se pudo encontrar la evaluación asociada.");
                            return;
                        }

                        const year = new Date(highestResult.timestamp.toDate()).getFullYear();
                        const certificateID = `${evaluationData.ID}${customID}${year}`;

                        // Buscar el certificado por su ID
                        const certificateDoc = await db.collection("certificates").doc(certificateID).get();
                        if (!certificateDoc.exists) {
                            alert("Certificado no encontrado.");
                            return;
                        }

                        const certificateData = certificateDoc.data();

                        // Obtener fechas de expedición y caducidad
                        const issuedDate = new Date(certificateData.issuedDate); // Fecha de expedición
                        const expirationDate = new Date(issuedDate);
                        expirationDate.setFullYear(issuedDate.getFullYear() + 3); // Añadir 3 años

                        // Construir URL de LinkedIn con formato correcto
                        const linkedInUrl = `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME` +
                            `&name=${encodeURIComponent(certificateData.courseName)}` +
                            `&organizationId=66227493` + // ID de la empresa ESYS en LinkedIn
                            `&issueYear=${issuedDate.getFullYear()}` +
                            `&issueMonth=${issuedDate.getMonth() + 1}` +
                            `&expirationYear=${expirationDate.getFullYear()}` +
                            `&expirationMonth=${expirationDate.getMonth() + 1}` +
                            `&certUrl=${encodeURIComponent(`https://esysingenieria.github.io/evaluaciones-cursos/verificar.html?id=${certificateID}`)}` +
                            `&certId=${encodeURIComponent(certificateID)}`;

                        // Redirigir a LinkedIn con el enlace generado
                        window.open(linkedInUrl, "_blank");
                    } catch (error) {
                        console.error("Error al añadir a LinkedIn:", error);
                        alert("Hubo un problema al intentar añadir el certificado a LinkedIn.");
                    }
                });

                // Añadir botones al contenedor
                buttonContainer.appendChild(downloadButton);
                buttonContainer.appendChild(linkedInButton);
                div.appendChild(buttonContainer);
            }

            responsesContainer.appendChild(div);
        }

    } catch (error) {
        console.error("Error cargando respuestas:", error);
        responsesContainer.innerHTML = "<p>Hubo un problema al cargar tus resultados.</p>";
    }
};





// Cargar preguntas y opciones en evaluation.html
const loadEvaluation = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const evaluationId = urlParams.get('id');
    const evaluationTitle = document.getElementById('evaluation-title');
    const questionsContainer = document.getElementById('questionsContainer');
    const form = document.getElementById('evaluationForm');
    const user = auth.currentUser;

    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    try {
        const surveyCompleted = await checkSurveyCompletion(evaluationId, user.uid);
        if (!surveyCompleted) return;

        // Verificar intentos previos
        const snapshot = await db.collection('responses')
            .where('userId', '==', user.uid)
            .where('evaluationId', '==', evaluationId)
            .get();

        let attempts = 0;
        if (!snapshot.empty) {
            attempts = snapshot.docs[0].data().attempts || 0;
            if (attempts >= 2) {
                alert('Has alcanzado el número máximo de intentos para esta evaluación.');
                window.location.href = 'dashboard.html';
                return;
            }
        }

        // Incrementar intentos
        if (!snapshot.empty) {
            await snapshot.docs[0].ref.update({
                attempts: firebase.firestore.FieldValue.increment(1),
            });
        } else {
            await db.collection('responses').add({
                userId: user.uid,
                evaluationId: evaluationId,
                attempts: 1,
                answers: {},
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            });
        }

        // Cargar preguntas
        const doc = await db.collection('evaluations').doc(evaluationId).get();
        if (doc.exists) {
            evaluationTitle.innerText = doc.data().title;
            doc.data().questions.forEach((question, index) => {
                const questionDiv = document.createElement('div');
                questionDiv.innerHTML = `
                    <p>${index + 1}. ${question.text}</p>
                    ${question.options.map(option => `
                        <div>
                            <label>
                                <input type="radio" name="question${index}" value="${option}" required>
                                ${option}
                            </label>
                        </div>
                    `).join('')}
                `;
                questionsContainer.appendChild(questionDiv);
            });
        } else {
            console.error('La evaluación no existe.');
            alert('La evaluación no fue encontrada.');
        }
    } catch (error) {
        console.error('Error al cargar la evaluación:', error);
        alert('Ocurrió un error al cargar la evaluación. Por favor, inténtalo de nuevo.');
    }
};

let surveyLoaded = false; // Flag para evitar duplicaciones

const loadSurveyQuestions = async (evaluationId) => {
    const surveyForm = document.getElementById('surveyForm');

    // Validar si el formulario existe
    if (!surveyForm) {

        return;
    }

    // Evitar que la función se ejecute más de una vez
    if (surveyLoaded) {
        console.warn("Las preguntas de la encuesta ya se han cargado. Evitando duplicación.");
        return;
    }

    surveyLoaded = true; // Activar la bandera para bloquear futuras ejecuciones

    try {
        console.log("Cargando preguntas para la encuesta...");
        surveyForm.innerHTML = ''; // Limpiar el formulario antes de cargar

        const surveySnapshot = await db.collection('surveyQuestions')
            .where('evaluationId', 'in', [evaluationId, 'default'])
            .limit(1)
            .get();

        if (surveySnapshot.empty) {
            surveyForm.innerHTML = '<p>No hay preguntas disponibles en este momento.</p>';
            console.warn("No se encontraron preguntas en Firestore.");
            return;
        }

        const surveyData = surveySnapshot.docs[0].data();
        surveyData.questions.forEach((question, index) => {
            const questionDiv = document.createElement('div');
            questionDiv.innerHTML = `
                <label for="question${index}">${question.text}</label>
                ${question.type === 'select' ? `
                    <select name="question${index}" required>
                        ${question.options.map(option => `<option value="${option}">${option}</option>`).join('')}
                    </select>
                ` : `
                    <input type="${question.type}" name="question${index}" required>
                `}
            `;
            surveyForm.appendChild(questionDiv);
        });

        // Agregar el botón de envío si no existe
        if (!document.getElementById('submitSurveyButton')) {
            const submitButton = document.createElement('button');
            submitButton.type = 'submit';
            submitButton.id = 'submitSurveyButton';
            submitButton.textContent = 'Enviar Encuesta';
            surveyForm.appendChild(submitButton);
        }

        console.log("Preguntas de la encuesta cargadas exitosamente.");
    } catch (error) {
        console.error('Error al cargar las preguntas de la encuesta:', error);
        surveyForm.innerHTML = '<p>Error al cargar la encuesta. Intenta nuevamente más tarde.</p>';
    }
};

// Llamada a la función SOLO si el formulario existe
document.addEventListener('DOMContentLoaded', () => {
    const surveyForm = document.getElementById('surveyForm');
    if (surveyForm) {
        const urlParams = new URLSearchParams(window.location.search);
        const evaluationId = urlParams.get('evaluationId') || 'default';
        loadSurveyQuestions(evaluationId);
    }
});

const submitSurvey = async (event) => {
    event.preventDefault(); // Evitar el comportamiento predeterminado del formulario

    const surveyForm = document.getElementById('surveyForm');
    const formData = new FormData(surveyForm);

    const surveyData = {};
    formData.forEach((value, key) => {
        surveyData[key] = value; // Recopilar todas las respuestas
    });

    const urlParams = new URLSearchParams(window.location.search);
    const evaluationId = urlParams.get('evaluationId') || 'default';
    const user = auth.currentUser;

    if (!user) {
        alert('Usuario no autenticado. Por favor, inicia sesión nuevamente.');
        window.location.href = 'index.html';
        return;
    }

    try {
        // Guardar las respuestas de la encuesta en Firestore
        await db.collection('surveys').add({
            userId: user.uid,
            evaluationId: evaluationId,
            surveyData: surveyData,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        alert('Encuesta completada con éxito. Redirigiendo a la evaluación...');
        window.location.href = `evaluation.html?id=${evaluationId}`;
    } catch (error) {
        console.error('Error al guardar la encuesta:', error);
        alert('Hubo un problema al enviar la encuesta. Por favor, inténtalo de nuevo.');
    }
};

// Vincular la función al formulario
document.addEventListener('DOMContentLoaded', () => {
    const surveyForm = document.getElementById('surveyForm');
    if (surveyForm) {
        surveyForm.addEventListener('submit', submitSurvey);
    }
});

// Llamar a la función al cargar la página
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const evaluationId = urlParams.get('evaluationId') || 'default';
    loadSurveyQuestions(evaluationId);
});

const startTimer = (timeLimit) => {
    const timerElement = document.getElementById("timer");
    let remainingTime = timeLimit;

    const updateTimer = () => {
        const minutes = Math.floor(remainingTime / 60);
        const seconds = remainingTime % 60;
        timerElement.textContent = `${minutes}:${seconds.toString().padStart(2, "0")}`;

        if (remainingTime > 0) {
            remainingTime--;
        } else {
            alert("El tiempo se ha acabado. Se enviarán tus respuestas automáticamente.");
            document.getElementById("evaluationForm").submit();
            clearInterval(timerInterval);
        }
    };

    updateTimer();
    const timerInterval = setInterval(updateTimer, 1000);
};

const calculateResult = async (evaluationId, userAnswers) => {
    try {
        const doc = await db.collection('evaluations').doc(evaluationId).get();
        if (!doc.exists) throw new Error("La evaluación no existe.");

        const questions = doc.data().questions;
        let correctCount = 0;

        questions.forEach((question, index) => {
            const userAnswer = (userAnswers[`question${index}`] || "").trim().toLowerCase();
            const correctAnswer = question.correct.trim().toLowerCase();

            if (userAnswer === correctAnswer) {
                correctCount++;
            }
        });

        const totalQuestions = questions.length;
        const score = Math.round((correctCount*4)); // Porcentaje
        let grade;

        if (score >= 92) grade = "Aprobado";
        else grade = "Reprobado";

        return { score, grade };
    } catch (error) {
        console.error("Error al calcular el resultado:", error);
        return null;
    }
};








async function calculateAndHandleResult(userId, evaluationId, answers) {
    try {
        // Llamar a calculateResult para calcular el puntaje
        const result = await calculateResult(evaluationId, answers);

        // Registra el resultado en la colección `responses`
        const timestamp = new Date();
        await db.collection("responses").add({
            userId,
            evaluationId,
            answers,
            result,
            timestamp,
        });

        // Si el puntaje es suficiente para aprobar, genera el certificado
        if (result.score >= 92) {
            console.log(`El usuario ${userId} aprobó la evaluación ${evaluationId}. Generando certificado...`);
            await handleEvaluationApproval(userId, evaluationId, result, timestamp);
        } else {
            console.log(`El usuario ${userId} no aprobó la evaluación ${evaluationId}.`);
        }
    } catch (error) {
        console.error("Error al manejar el resultado de la evaluación:", error);
    }
}

async function handleEvaluationApproval(userId, evaluationId, result, timestamp) {
    try {
        // Obtener datos del usuario
        const userDoc = await db.collection("users").doc(userId).get();
        if (!userDoc.exists) {
            console.warn(`Usuario con ID ${userId} no encontrado.`);
            return;
        }
        const { name, customID } = userDoc.data();

        // Obtener datos de la evaluación
        const evaluationDoc = await db.collection("evaluations").doc(evaluationId).get();
        if (!evaluationDoc.exists) {
            console.warn(`Evaluación con ID ${evaluationId} no encontrada.`);
            return;
        }
        const evaluationData = evaluationDoc.data();

        // Generar el ID del certificado
        const year = new Date(timestamp).getFullYear();
        const certificateID = `${evaluationData.ID}${customID}${year}`;

        // Verificar si el certificado ya existe
        const existingCertificate = await db.collection("certificates").doc(certificateID).get();
        if (existingCertificate.exists) {
            console.log(`Certificado con ID ${certificateID} ya existe.`);
            return;
        }

        // Crear el documento en la colección `certificates`
        await db.collection("certificates").doc(certificateID).set({
            name: name,
            courseName: evaluationData.name,
            issuedDate: timestamp.toISOString(),
            description: evaluationData.description,
            criteria: evaluationData.criteria,
            standards: evaluationData.standards,
            imageURL_badge: evaluationData.imageURL_badge || "default-badge.png",
        });

        console.log(`Certificado creado para ${name} con ID ${certificateID}.`);
    } catch (error) {
        console.error("Error al manejar la aprobación de la evaluación:", error);
    }
}












const logoutUser = () => {
    auth.signOut()
        .then(() => {
            // Redirigir directamente al inicio de sesión
            window.location.href = "index.html";
        })
        .catch((error) => {
            console.error("Error al cerrar sesión:", error);
        });
};

const logoutButton = document.getElementById('logoutButton');
if (logoutButton) {
    logoutButton.addEventListener('click', logoutUser);
}

const generateCertificateFromPDF = async (userName, evaluationID, score, approvalDate) => {
    try {
        console.log("Certificado solicitado para ID:", evaluationID); // Verificar el ID recibido

        const userData = await loadUserData();
        if (!userData) throw new Error("Datos del usuario no disponibles.");

        const { name: userNameDB, rut, company, customID } = userData;

        // Obtener el nombre de la evaluación, plantilla y campo ID desde Firestore
        const evaluationDoc = await db.collection('evaluations').doc(evaluationID).get();
        if (!evaluationDoc.exists) throw new Error("La evaluación no existe.");
        
        const evaluationData = evaluationDoc.data();
        const evaluationName = evaluationData.name;
        const evaluationTime = evaluationData.timeEvaluation;
        const certificateTemplate = evaluationData.certificateTemplate || "plantilla.pdf"; // Plantilla por defecto
        const evaluationIDNumber = evaluationData.ID || "00"; // Campo 'ID' específico de la evaluación

        console.log("Evaluación encontrada:", evaluationName);
        console.log("Plantilla utilizada:", certificateTemplate);

        // Convertir approvalDate a un formato válido y extraer el año
        const convertDateToValidFormat = (dateString) => {
            const [day, month, year] = dateString.split('-');
            return `${year}-${month}-${day}`;
        };

        let year;
        if (approvalDate) {
            const validDate = convertDateToValidFormat(approvalDate);
            year = new Date(validDate).getFullYear();
        } else {
            year = new Date().getFullYear(); // Año actual como respaldo
        }

        console.log("Año de Aprobación:", year);

        // Generar el ID del certificado dinámico
        const certificateID = `${evaluationIDNumber}${customID}${year}`;
        console.log("ID del Certificado:", certificateID);

        // Cargar el PDF base (plantilla específica o por defecto)
        const existingPdfBytes = await fetch(certificateTemplate).then(res => res.arrayBuffer());
        const pdfDoc = await PDFLib.PDFDocument.load(existingPdfBytes);
        const pages = pdfDoc.getPages();
        const firstPage = pages[0];

        // Dimensiones de la página
        const { width, height } = firstPage.getSize();

        // Registrar fontkit
        pdfDoc.registerFontkit(window.fontkit);

        // Cargar fuentes personalizadas
        const monotypeFontBytes = await fetch("fonts/MonotypeCorsiva.ttf").then(res => res.arrayBuffer());
        const perpetuaFontBytes = await fetch("fonts/Perpetua.ttf").then(res => res.arrayBuffer());
        const perpetuaItalicFontBytes = await fetch("fonts/PerpetuaItalic.ttf").then(res => res.arrayBuffer());

        const monotypeFont = await pdfDoc.embedFont(monotypeFontBytes);
        const perpetuaFont = await pdfDoc.embedFont(perpetuaFontBytes);
        const perpetuaItalicFont = await pdfDoc.embedFont(perpetuaItalicFontBytes);

        // Función para centrar texto
        const centerText = (text, y, font, size) => {
            const textWidth = font.widthOfTextAtSize(text, size);
            const x = (width - textWidth) / 2;
            firstPage.drawText(text, { x, y, size, font, color: PDFLib.rgb(0, 0, 0) });
        };

        // Función para ajustar texto a líneas
        const maxWidth2 = width - 100; // Márgenes de 50 px a cada lado
        const wrapText = (text, font, fontSize, maxWidth) => {
            const words = text.split(' ');
            const lines = [];
            let currentLine = '';
        
            words.forEach(word => {
                const testLine = currentLine ? `${currentLine} ${word}` : word;
                const textWidth = font.widthOfTextAtSize(testLine, fontSize);
        
                if (textWidth <= maxWidth) {
                    currentLine = testLine;
                } else {
                    lines.push(currentLine);
                    currentLine = word;
                }
            });
        
            if (currentLine) lines.push(currentLine);
            return lines;
        };

        // Texto centrado
        centerText(`${userNameDB}`, height - 295, monotypeFont, 35);
        centerText(`RUT: ${rut}`, height - 340, perpetuaItalicFont, 19);
        centerText(`Empresa: ${company}`, height - 360, perpetuaItalicFont, 19);

        // Texto centrado con ajuste de líneas
        const lines = wrapText(evaluationName, monotypeFont, 34, maxWidth2);
        let yPosition = height - 448;

        lines.forEach(line => {
            centerText(line, yPosition, monotypeFont, 34);
            yPosition -= 40;
        });

        // Texto posicionado manualmente
        firstPage.drawText(`Fecha de Aprobación: ${approvalDate}`, {
            x: 147, y: height - 548, size: 12, font: perpetuaFont, color: PDFLib.rgb(0, 0, 0),
        });

        firstPage.drawText(`Duración del Curso: ${evaluationTime}`, {
            x: 157, y: height - 562, size: 12, font: perpetuaFont, color: PDFLib.rgb(0, 0, 0),
        });

        // Texto ID dinámico del certificado
        firstPage.drawText(`ID: ${certificateID}`, {
            x: 184, y: height - 576, size: 12, font: perpetuaFont, color: PDFLib.rgb(0, 0, 0),
        });

        // Exportar el PDF modificado
        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: "application/pdf" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `Certificado_${evaluationName}.pdf`;
        link.click();
        console.log("Certificado generado con éxito:", evaluationName);

    } catch (error) {
        console.error("Error al generar el certificado:", error);
        alert("Hubo un problema al generar el certificado. Por favor, inténtalo nuevamente.");
    }
};

const loadUserData = async () => {
    const user = auth.currentUser;
    if (!user) {
        console.error("Usuario no autenticado.");
        return;
    }

    try {
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            console.log("Datos del usuario:", userData);

            // Aquí puedes usar los datos del usuario en tu lógica
            return userData;
        } else {
            console.error("No se encontraron datos para este usuario.");
            return null;
        }
    } catch (error) {
        console.error("Error al cargar datos del usuario:", error);
        return null;
    }
};















// Variables globales
let pdfDoc = null; // Documento PDF
let currentPage = 1; // Página actual
let isRendering = false; // Bandera para evitar renderizados múltiples
const pdfContainer = document.getElementById('pdf-container');
const notesField = document.getElementById('notes');
const saveStatus = document.getElementById('save-status'); // Elemento para mostrar estado de guardado

// Obtener la URL del manual desde Firestore
const getManualURL = async (evaluationId) => {
    const doc = await db.collection('evaluations').doc(evaluationId).get();
    if (doc.exists) {
        return doc.data().manualURL; // Devuelve la URL del manual
    } else {
        return null;
    }
};

// Renderizar una página específica del PDF
const renderPage = async (pageNum, scale = 5) => {
    if (isRendering) return; // Si ya está renderizando, no continuar
    isRendering = true; // Establecer la bandera como true

    try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale });

        const canvas = document.getElementById("pdf-renderer");
        const context = canvas.getContext("2d");

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: context, viewport }).promise;
    } catch (error) {
        console.error("Error al renderizar la página:", error);
    } finally {
        isRendering = false; // Liberar la bandera después de completar
    }
};

// Cargar el PDF desde Firebase Storage
const loadPDF = async () => {
    try {
        const url = await getManualURL(evaluationId); // Obtener la URL desde Firestore
        if (!url) {
            console.warn("No se encontró la URL del manual.");
            return;
        }

        pdfDoc = await pdfjsLib.getDocument(url).promise; // Intenta cargar el PDF
        renderPage(currentPage); // Renderiza la primera página
        loadNotes(); // Cargar notas de la primera página
    } catch (error) {
        console.error("Error al cargar el PDF:", error);
    }
};

// Guardar notas en Firestore automáticamente
const saveNotes = async () => {
    const notes = notesField.value;
    const user = auth.currentUser;
    if (!user) {
        console.warn("Usuario no autenticado. No se pueden guardar notas.");
        return;
    }

    try {
        await db.collection('manual-notes')
            .doc(user.uid)
            .collection('notes')
            .doc(`${evaluationId}_page_${currentPage}`)
            .set({
                manualId: evaluationId,
                page: currentPage,
                notes,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            });

        // Actualizar estado de guardado
        saveStatus.textContent = "Notas guardadas automáticamente";
        setTimeout(() => (saveStatus.textContent = ""), 2000); // Ocultar estado después de 2 segundos
    } catch (error) {
        console.error("Error al guardar notas automáticamente:", error);
        saveStatus.textContent = "Error al guardar notas";
    }
};

// Cargar notas guardadas para la página actual
const loadNotes = async () => {
    const user = auth.currentUser;
    if (!user) return;

    try {
        const doc = await db.collection('manual-notes')
            .doc(user.uid)
            .collection('notes')
            .doc(`${evaluationId}_page_${currentPage}`)
            .get();

        if (doc.exists) {
            notesField.value = doc.data().notes || '';
        } else {
            notesField.value = ''; // Sin notas guardadas
        }
    } catch (error) {
        console.error("Error al cargar notas:", error);
    }
};

// Cambiar de página en el visor del PDF
const changePage = (pageNum) => {
    if (pageNum > 0 && pageNum <= pdfDoc.numPages) {
        saveNotes(); // Guardar notas automáticamente antes de cambiar de página
        currentPage = pageNum;
        renderPage(currentPage);
        loadNotes(); // Cargar las notas de la nueva página
    }
};

// Evento para guardar notas automáticamente cuando se escriben
notesField.addEventListener('input', () => {
    saveNotes();
});

// Botones para cambiar de página
document.getElementById('prev-page').addEventListener('click', () => {
    changePage(currentPage - 1);
});

document.getElementById('next-page').addEventListener('click', () => {
    changePage(currentPage + 1);
});

// Inicia la carga del PDF
loadPDF();











async function loadBadgeData() {
    const queryParams = new URLSearchParams(window.location.search);
    const certificateID = queryParams.get("id");

    if (!certificateID) {
        document.body.innerHTML = "<h1>Insignia no encontrada</h1>";
        return;
    }

    try {
        const certificateDoc = await db.collection("certificates").doc(certificateID).get();

        if (!certificateDoc.exists) {
            document.body.innerHTML = "<h1>Insignia no encontrada</h1>";
            return;
        }

        const {
            name,
            courseName,
            issuedDate,
            description,
            criteria,
            standards,
            imageURL_badge
        } = certificateDoc.data();

        document.getElementById("courseName").textContent = courseName;
        document.getElementById("badgeImage").src = imageURL_badge;
        document.getElementById("issuedTo").textContent = `Esta insignia fue otorgada a ${name} el ${new Date(issuedDate).toLocaleDateString()}.`;
        document.getElementById("description").textContent = description;

// Agregar criterios
const criteriaList = document.getElementById("criteriaList");
criteriaList.innerHTML = ""; // Limpia la lista antes de agregar nuevos elementos
if (Array.isArray(criteria)) {
    criteria.forEach(criterion => {
        const li = document.createElement("li");
        li.textContent = criterion;
        criteriaList.appendChild(li);
    });
} else {
    const li = document.createElement("li");
    li.textContent = "Criterios no disponibles.";
    criteriaList.appendChild(li);
}

// Agregar estándares
const standardsList = document.getElementById("standardsList");
standardsList.innerHTML = ""; // Limpia la lista antes de agregar nuevos elementos
if (Array.isArray(standards)) {
    standards.forEach(standard => {
        const li = document.createElement("li");
        li.textContent = standard;
        standardsList.appendChild(li);
    });
} else {
    const li = document.createElement("li");
    li.textContent = "Estándares no disponibles.";
    standardsList.appendChild(li);
}

    } catch (error) {
        console.error("Error al cargar los datos del certificado:", error);
        document.body.innerHTML = "<h1>Hubo un error al cargar los datos.</h1>";
    }
}
