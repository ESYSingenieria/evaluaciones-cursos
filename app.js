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
        // Enviar correo de restablecimiento de contraseña directamente
        await firebase.auth().sendPasswordResetEmail(email.trim());
        alert(`Si su email ${email.trim()} se encuentra registrado en nuestra plataforma, se le enviará un correo con el enlace para redirigirse a la página donde podrá restablecer su contraseña.`);
    } catch (error) {
        console.error("Error al intentar cambiar la contraseña:", error);

        // Manejo de errores comunes
        if (error.code === 'auth/invalid-email') {
            alert("El correo ingresado no es válido.");
        } else {
            alert("Ocurrió un error inesperado. Inténtalo de nuevo.");
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










auth.onAuthStateChanged(async (user) => {
  if (!user) {
    console.log("No hay usuario autenticado.");
    if (
      !window.location.pathname.includes("index.html") &&
      !window.location.pathname.includes("verificar.html")
    ) {
      window.location.href = "index.html";
    }
    return;
  }

  console.log("Usuario autenticado:", user.uid);

  // 1) Leemos el perfil completo, que tu loadUserData debería devolver
  //    un objeto con al menos { name, rut, role, … }
  let userData;
  try {
    userData = await loadUserData();
    console.log("Datos del usuario cargados:", userData);
  } catch (err) {
    console.error("Error al cargar userData:", err);
    return;
  }

  // 2) Redirigir según role
  if (userData.role === "admin") {
    // si es admin y no está ya en dashboard-admin, vamos allí
    if (!window.location.pathname.includes("dashboard-admin.html")) {
      return (window.location.href = "dashboard-admin.html");
    }
  } else {
    // si NO es admin y está en dashboard-admin, lo mandamos al dashboard normal
    if (window.location.pathname.includes("dashboard-admin.html")) {
      return (window.location.href = "dashboard.html");
    }
  }

  // 3) A partir de aquí, sólo usuarios “correctos” se quedan en cada página
  if (window.location.pathname.includes("dashboard.html")) {
    const userNameElement = document.getElementById("userNameDisplay");
    const userRutElement = document.getElementById("userRutDisplay");

    if (userNameElement) {
      userNameElement.textContent = userData.name || "Nombre no disponible";
    }
    if (userRutElement) {
      userRutElement.textContent = userData.rut || "RUT no disponible";
    }

    await loadEvaluations();
    await loadResponses();
  }

  if (window.location.pathname.includes("manual.html")) {
    await loadPDF();
  }

  if (window.location.pathname.includes("evaluation.html")) {
    await loadEvaluation();
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
            // ────────────────────────────────────────────────
            // Después de autenticar, leemos su rol y redirigimos
            await auth.signInWithEmailAndPassword(email, password);
            const perfil = await db.collection('users')
                                   .doc(auth.currentUser.uid)
                                   .get();
            const rol = perfil.data()?.role;
            if (rol === 'admin') {
              window.location.href = "dashboard-admin.html";
            } else {
              window.location.href = "dashboard.html";
            }
            // ────────────────────────────────────────────────

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
        const meta = userDoc.data().assignedCoursesMeta || {};
        const myCID = userDoc.data().customID || "";
        const myRUT = userDoc.data().rut || "";


        const snapshot = await db.collection('evaluations').get();
        evaluationsList.innerHTML = '';

        for (const doc of snapshot.docs) {
          if (!assignedEvaluations.includes(doc.id)) continue;

          const evaluation = doc.data();

          // === Nuevo: bloqueo por usuario-curso leyendo inscripciones ===
          // Busca la meta que apunte a esta evaluación (por evaluationId o courseKey)
          const m = Object.values(meta).find(mm => mm?.evaluationId === doc.id || mm?.courseKey === doc.id) || null;
          let isLocked = true; // default: bloqueada

          if (m?.sessionId) {
            const sSnap = await db.collection('inscripciones').doc(m.sessionId).get();
            if (sSnap.exists) {
              const arr = Array.isArray(sSnap.data().inscriptions) ? sSnap.data().inscriptions : [];
              const me = arr.find(p => (myCID && p.customID === myCID) || (myRUT && p.rut === myRUT));
              if (me && me.evaluationLocked === false) {
                isLocked = false; // solo se desbloquea si explicitamente está en false
              }
            }
          }

          // === (lo demás de tu render queda igual, solo usa isLocked de arriba)
          const div = document.createElement('div');
          div.className = "evaluation-item";

          const img = document.createElement('img');
          img.src = evaluation.imageURL || 'default-image.jpg';
          img.alt = `Portada de ${evaluation.title}`;
          img.className = 'evaluation-image';
          img.style.borderRadius = "5px";
          img.style.marginBottom = "10px";

          const title = document.createElement('h3');
          title.textContent = evaluation.title;
          title.style.marginBottom = "10px";

          const buttonContainer = document.createElement('div');
          buttonContainer.style.display = "flex";
          buttonContainer.style.justifyContent = "center";
          buttonContainer.style.gap = "10px";
          buttonContainer.style.marginTop = "-6px";
          buttonContainer.style.position = "relative";
          buttonContainer.style.top = "-2px";

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

          const startButton = document.createElement('button');
          startButton.textContent = "Comenzar Evaluación";
          startButton.disabled = isLocked;
          startButton.style.padding = "10px 20px";
          startButton.style.backgroundColor = isLocked ? "#ccc" : "#28a745";
          startButton.style.color = isLocked ? "#666" : "white";
          startButton.style.border = "none";
          startButton.style.borderRadius = "5px";
          startButton.style.cursor = isLocked ? "not-allowed" : "pointer";

          if (!isLocked) {
            startButton.addEventListener("click", () => {
              window.location.href = `evaluation.html?id=${doc.id}`;
            });
          }

          buttonContainer.appendChild(manualButton);
          buttonContainer.appendChild(startButton);
          div.appendChild(img);
          div.appendChild(title);
          div.appendChild(buttonContainer);
          evaluationsList.appendChild(div);
        }

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
            const passingScore = evaluationDoc.data().puntajeAprobacion;

            const highestResult = resultsMap[evaluationId];
            const div = document.createElement('div');
            div.className = "result-item";
            div.innerHTML = `
                <h3>${evaluationTitle}</h3>
                <p><strong>Puntaje:</strong> ${highestResult.score}</p>
                <p><strong>Estado de Aprobación:</strong> ${highestResult.grade}</p>
            `;

            if (highestResult.score >= passingScore) {
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
                        // **Nueva lógica**: calcular fecha de expiración solo si `lastDate` existe
                        let expirationDate = null;
                        if (evaluationData.lastDate !== undefined && evaluationData.lastDate !== null) {
                            expirationDate = new Date(issuedDate);
                            expirationDate.setMonth(expirationDate.getMonth() + evaluationData.lastDate);
                        }

        // Construir URL de LinkedIn con formato correcto
        let linkedInUrl = "https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME" +
                          `&name=${encodeURIComponent(certificateData.courseName)}` +
                          `&organizationId=66227493` +  // ID de la empresa (ESYS) en LinkedIn
                          `&issueYear=${issuedDate.getFullYear()}` +
                          `&issueMonth=${issuedDate.getMonth() + 1}`;
        
        // Si hay fecha de expiración calculada, incluirla en la URL
        if (expirationDate) {
            linkedInUrl += `&expirationYear=${expirationDate.getFullYear()}` +
                           `&expirationMonth=${expirationDate.getMonth() + 1}`;
        }
        
        // Continuar construyendo la URL con el enlace de verificación y el ID
        linkedInUrl += `&certUrl=${encodeURIComponent(`https://esysingenieria.github.io/evaluaciones-cursos/verificar.html?id=${certificateID}`)}` +
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
    // Bloqueo por usuario-curso (evita apertura directa por URL)
    const userDoc = await db.collection('users').doc(user.uid).get();
    const meta = userDoc.data().assignedCoursesMeta || {};
    const myCID = userDoc.data().customID || "";
    const myRUT = userDoc.data().rut || "";

    const m = Object.values(meta).find(mm => mm?.evaluationId === evaluationId || mm?.courseKey === evaluationId) || null;
    let blocked = true;
    if (m?.sessionId) {
      const sSnap = await db.collection('inscripciones').doc(m.sessionId).get();
      if (sSnap.exists) {
        const arr = Array.isArray(sSnap.data().inscriptions) ? sSnap.data().inscriptions : [];
        const me = arr.find(p => (myCID && p.customID === myCID) || (myRUT && p.rut === myRUT));
        blocked = (me?.evaluationLocked !== false);
      }
    }
    if (blocked) {
      alert('Tu evaluación aún está bloqueada. Consulta con el instructor.');
      window.location.href = 'dashboard.html';
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
        
        const passingScore = doc.data().puntajeAprobacion;  // Obtener puntaje de aprobación dinámico
        let grade;
        if (score >= passingScore) {
            grade = "Aprobado";
        } else {
            grade = "Reprobado";
        }
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

        // Obtener puntaje de aprobación de Firestore
        const evaluationDoc = await db.collection('evaluations').doc(evaluationId).get();
        const passingScore = evaluationDoc.data().puntajeAprobacion;
        // Generar certificado solo si el puntaje alcanza o supera el mínimo de aprobación
        if (result.score >= passingScore) {
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
        pdfDoc.registerFontkit(fontkit);

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
// ——— DESCARGA CON NOTAS ———
// Botón para disparar la generación del PDF con notas
const downloadBtn = document.getElementById('download-notes');

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

// Al hacer clic, genera y descarga el PDF combinando manual + notas
downloadBtn.addEventListener('click', generatePDFWithNotes);

// Inicia la carga del PDF
loadPDF();

/**
 * Genera un PDF que copia cada página del manual,
 * añade un margen blanco abajo con líneas guía
 * y pinta las notas del usuario, envolviendo el texto
 * para que jamás se salga de ese espacio.
 */
async function generatePDFWithNotes() {
  // referencias al overlay y al texto de progreso
  const overlay  = document.getElementById('pdf-overlay');
  const statusEl = document.getElementById('pdf-progress');

  // mostrar overlay
  if (overlay) {
    overlay.style.display = 'flex';
    statusEl.textContent  = 'Iniciando generación…';
  }

  // 1) Guarda nota de la página actual
  await saveNotes();

  // 2) URL y carga de PDF original con PDF.js
  const manualUrl   = await getManualURL(evaluationId);
  const loadingTask = pdfjsLib.getDocument(manualUrl);
  const pdfJsDoc    = await loadingTask.promise;
  const pageCount   = pdfJsDoc.numPages;

  // 3) Prepara nuevo PDF con pdf-lib
  const pdfNew       = await PDFLib.PDFDocument.create();
  const helv         = await pdfNew.embedFont(PDFLib.StandardFonts.Helvetica);
  const fontSize     = 10;
  const marginHeight = 500;
  const marginLeft   = 40;
  const lineCount    = 25;
  const lineColor    = PDFLib.rgb(0.8, 0.8, 0.8);
  const spacing      = marginHeight / (lineCount + 1);

  // 4) Carga todas las notas de Firestore
  const snap = await db
    .collection('manual-notes')
    .doc(auth.currentUser.uid)
    .collection('notes')
    .where('manualId', '==', evaluationId)
    .get();
  const notesMap = {};
  snap.forEach(d => {
    const { page, notes } = d.data();
    notesMap[page] = notes;
  });

  // 5) Por cada página, renderiza y embebe como imagen
  for (let i = 1; i <= pageCount; i++) {
    // actualiza progreso
    if (statusEl) {
      statusEl.textContent = `Procesando página ${i}/${pageCount}…`;
    }

    // 5.1 renderizar con PDF.js a alta resolución
    const pageJs   = await pdfJsDoc.getPage(i);
    const scale    = 4;
    const viewport = pageJs.getViewport({ scale });
    const canvasTmp = document.createElement('canvas');
    canvasTmp.width  = Math.floor(viewport.width);
    canvasTmp.height = Math.floor(viewport.height);
    await pageJs.render({
      canvasContext: canvasTmp.getContext('2d'),
      viewport
    }).promise;

    // 5.2 embeder PNG en pdf-lib y escalar de vuelta
    const imgData = canvasTmp.toDataURL('image/png');
    const img     = await pdfNew.embedPng(imgData);
    const imgDims = img.scale(1 / scale);

    // 5.3 crear página nueva
    const page = pdfNew.addPage([ imgDims.width, imgDims.height + marginHeight ]);

    // 5.4 dibujar la imagen original
    page.drawImage(img, {
      x:      0,
      y:      marginHeight,
      width:  imgDims.width,
      height: imgDims.height,
    });

    // 5.5 dibujar líneas guía
    for (let ln = 1; ln <= lineCount; ln++) {
      const yLine = marginHeight - ln * spacing;
      page.drawLine({
        start:     { x: marginLeft,              y: yLine },
        end:       { x: imgDims.width - marginLeft, y: yLine },
        thickness: 0.5,
        color:     lineColor,
      });
    }

    // 5.6 escribir la nota
    let raw = notesMap[i] || '';
    raw = raw.replace(/\r+/g, '');            // quita CR
    raw = raw.replace(/[^\x00-\xFF]/g, '');   // quita chars fuera de WinAnsi
    const paras   = raw.split('\n');
    const maxWidth = imgDims.width - marginLeft * 2;
    const lines    = [];

    paras.forEach(para => {
      const words  = para.split(' ');
      let current  = '';
      for (const w of words) {
        const testLine = current ? current + ' ' + w : w;
        if (helv.widthOfTextAtSize(testLine, fontSize) <= maxWidth) {
          current = testLine;
        } else {
          lines.push(current);
          current = w;
        }
      }
      if (current) lines.push(current);
    });

    lines.forEach((txt, k) => {
      const yText = marginHeight - (k + 1) * spacing + 2;
      page.drawText(txt, {
        x:    marginLeft + 2,
        y:    yText,
        size: fontSize,
        font: helv,
        color: PDFLib.rgb(0, 0, 0),
      });
    });
  }

  // 6) Actualiza mensaje antes de guardar
  if (statusEl) {
    statusEl.textContent = 'Guardando PDF…';
  }

  // 7) Guarda y dispara descarga
  const pdfBytes = await pdfNew.save();
  const blob     = new Blob([pdfBytes], { type: 'application/pdf' });
  const a        = document.createElement('a');
  a.href         = URL.createObjectURL(blob);
  a.download     = 'Manual_con_Notas.pdf';
  a.click();

  // 8) ocultar overlay
  if (overlay) {
    overlay.style.display = 'none';
  }
}







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

// =============== BUSCADOR EN verificar.html =================
(function initVerifierSearch() {
  const input   = document.getElementById('globalSearch');
  const panel   = document.getElementById('searchResults');
  if (!input || !panel) return; // Sólo en verificar.html

  // Debounce simple
  let t = null;
  input.addEventListener('input', () => {
    clearTimeout(t);
    const q = input.value.trim();
    if (!q) { closePanel(); return; }
    t = setTimeout(() => doSearch(q), 260);
  });

  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target) && e.target !== input) closePanel();
  });

  panel.addEventListener('click', (e) => {
    const item = e.target.closest('.sr-item');
    if (!item || item.classList.contains('disabled')) return;
    const certId = item.dataset.id;
    if (certId) window.location.href = `verificar.html?id=${certId}`;
  });

  function openPanel()  { panel.classList.add('open'); }
  function closePanel() { panel.classList.remove('open'); panel.innerHTML = ''; }

  function render(items) {
    if (!items.length) {
      panel.innerHTML = `<div class="sr-item disabled">Sin resultados</div>`;
      openPanel();
      return;
    }
    panel.innerHTML = items.map(it => `
      <div class="sr-item ${it.disabled ? 'disabled' : ''}" ${it.id ? `data-id="${it.id}"` : ''}>
        <div class="sr-title">${it.title}</div>
        <div class="sr-sub">${it.sub}</div>
        ${it.meta ? `<div class="sr-meta">${it.meta}</div>` : ''}
      </div>
    `).join('');
    openPanel();
  }

  async function doSearch(raw) {
    const suggestions = [];
    panel.innerHTML = `<div class="sr-item disabled">Buscando…</div>`;
    openPanel();

    // ¿Parece búsqueda por CustomID?
    const onlyDigits = /^[0-9]+$/.test(raw.replace(/[^\d]/g, ''));
    if (onlyDigits) {
      // Normaliza: agrega guion final si no está
      let cid = raw.replace(/[^\d]/g, '');
      if (!cid.endsWith('-')) cid = cid + '-';

      try {
        // 1) Encuentra usuarios cuyo customID empiece por ese prefijo
        const usersSnap = await db.collection('users')
          .orderBy('customID')
          .startAt(cid)
          .endAt(cid + '\uf8ff')
          .limit(5)
          .get();

        if (usersSnap.empty) {
          suggestions.push({ disabled:true, title:`${cid}`, sub:'Sin usuarios con ese CustomID', meta:'' });
        } else {
          // 2) Por cada usuario, busca certificados por nombre
          for (const uDoc of usersSnap.docs) {
            const u = uDoc.data();
            const name = (u.name || '').trim();
            const customID = u.customID || cid;

            const certSnap = await db.collection('certificates')
              .orderBy('name')
              .startAt(name)
              .endAt(name + '\uf8ff')
              .limit(6)
              .get();

            if (certSnap.empty) {
              suggestions.push({
                disabled:true,
                title: `${customID} — ${name}`,
                sub: 'Sin certificados asociados',
                meta: ''
              });
            } else {
              certSnap.forEach(c => {
                const d = c.data();
                suggestions.push({
                  id:   c.id,
                  title: d.courseName || 'Curso',
                  sub:  `${customID} — ${d.name || name}`,
                  meta: `ID certificado: ${c.id}`
                });
              });
            }
          }
        }
      } catch (err) {
        console.error('Search customID error:', err);
        suggestions.push({ disabled:true, title:'Error de búsqueda', sub:'Intenta nuevamente', meta:'' });
      }
    }

    // Búsqueda por NOMBRE (si hay letras o también como fallback)
    try {
      const term = raw;
      const certByName = await db.collection('certificates')
        .orderBy('name')
        .startAt(term)
        .endAt(term + '\uf8ff')
        .limit(8)
        .get();

      certByName.forEach(doc => {
        const d = doc.data();
        suggestions.push({
          id:   doc.id,
          title: d.courseName || 'Curso',
          sub:  `${d.name || ''}`,
          meta: `ID certificado: ${doc.id}`
        });
      });
    } catch (err) {
      console.error('Search name error:', err);
    }

    // Quita duplicados por ID (si llegaron por ambas vías)
    const seen = new Set();
    const unique = [];
    for (const s of suggestions) {
      if (!s.id) { unique.push(s); continue; }
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      unique.push(s);
    }

    render(unique.slice(0, 12));
  }
})();

