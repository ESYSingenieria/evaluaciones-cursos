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

    if (editProfileButton) {
      editProfileButton.addEventListener("click", () => {
        if (isEditing) { saveChanges(); } else { enableEditing(); }
      });
    }

    if (auth.currentUser) {
      await loadUserData();
    }
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

      // === Bloqueo por sesión/inscripciones (tu lógica original) ===
      const m = Object.values(meta).find(mm => mm?.evaluationId === doc.id || mm?.courseKey === doc.id) || null;
      let isLocked = true;

      if (m?.sessionId) {
        const sSnap = await db.collection('inscripciones').doc(m.sessionId).get();
        if (sSnap.exists) {
          const arr = Array.isArray(sSnap.data().inscriptions) ? sSnap.data().inscriptions : [];
          const me = arr.find(p => (myCID && p.customID === myCID) || (myRUT && p.rut === myRUT));
          if (me && me.evaluationLocked === false) {
            isLocked = false;
          }
        }
      }

      // === Card del curso ===
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

      // --- Abrir Manual (siempre visible) ---
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
      buttonContainer.appendChild(manualButton);

      // --- Ver Curso (solo si es asincrónico) ---
      const isAsync = doc.id.endsWith('_asincronico');
      if (isAsync) {
        const viewButton = document.createElement('button');
        viewButton.textContent = "Ver Curso";
        viewButton.style.padding = "10px 20px";
        viewButton.style.backgroundColor = "#0ea5e9"; // celeste
        viewButton.style.color = "white";
        viewButton.style.border = "none";
        viewButton.style.borderRadius = "5px";
        viewButton.style.cursor = "pointer";
        viewButton.addEventListener("click", () => {
          // Abre el visor de cursos grabados con el mismo identificador del curso
          window.location.href = `course-viewer.html?course=${encodeURIComponent(doc.id)}`;
        });
        buttonContainer.appendChild(viewButton);
      }

      // --- Comenzar Evaluación (respeta tu “isLocked”) ---
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
          const sid = (m && m.sessionId) ? `&sessionId=${encodeURIComponent(m.sessionId)}` : '';
          window.location.href = `evaluation.html?id=${encodeURIComponent(doc.id)}${sid}`;
        });
      }
      buttonContainer.appendChild(startButton);

      // Montaje de la card
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
const checkSurveyCompletion = async (evaluationId, userId, sessionId = '') => {
  const surveySnapshot = await db.collection('surveys')
    .where('userId', '==', userId)
    .where('evaluationId', '==', evaluationId)
    .get();

  if (surveySnapshot.empty) {
    alert('Debes completar la encuesta de satisfacción antes de realizar esta evaluación.');

    // Construye URL RELATIVA a la carpeta actual (mantiene /evaluaciones-cursos/)
    const base = window.location.pathname.replace(/[^/]+$/, '');
    // ej.: /evaluaciones-cursos/
    const url = `${base}survey.html?evaluationId=${encodeURIComponent(evaluationId)}${
      sessionId ? `&sessionId=${encodeURIComponent(sessionId)}` : ''
    }`;

    window.location.href = url;
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
    const sessionId = urlParams.get('sessionId') || '';   // << lee la sesión
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
          sessionId,                                         // << guarda la sesión
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
        await calculateAndHandleResult(userId, evaluationId, answers, sessionId);
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
                const sessionId    = response.sessionId || ""; // ⬅️ agrega esto

                // Si no existe una entrada para este evaluationId o el puntaje es mayor, actualizamos
                if (!resultsMap[evaluationId] || result.score > resultsMap[evaluationId].score) {
                    resultsMap[evaluationId] = {
                        score: result.score,
                        grade: result.grade,
                        timestamp: response.timestamp,
                        sessionId,                          // ⬅️ guarda la sesión del intento
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

                // === CONSULTA BLOQUEO POR ALUMNO/SESIÓN (justo antes de crear el downloadButton) ===
                let certLocked = false;

                // 1) Tomar el sessionId que guardaste en resultsMap
                const sessionId = highestResult.sessionId || "";

                // 2) Cargar identificadores del alumno (customID / rut) para buscarlo en la sesión
                const userDoc = await db.collection("users").doc(auth.currentUser.uid).get();
                const myCID = userDoc.exists ? (userDoc.data().customID || "") : "";  // ya usas customID arriba para LinkedIn
                const myRUT = userDoc.exists ? (userDoc.data().rut || "") : "";       // idem

                // 3) Si hay sesión, leer el doc de esa sesión y buscar a este alumno
                if (sessionId) {
                  const sSnap = await db.collection("inscripciones").doc(sessionId).get();
                  if (sSnap.exists) {
                    const arr = Array.isArray(sSnap.data().inscriptions) ? sSnap.data().inscriptions : [];
                    const me  = arr.find(p => (myCID && p.customID === myCID) || (myRUT && p.rut === myRUT));
                    certLocked = me?.certDownloadLocked === true;  // ← si true, está bloqueado
                  }
                }

                // 5) SOLO crear el botón de descarga si NO está bloqueado
                if (!certLocked) {
                  const downloadButton = document.createElement("button");
                  downloadButton.textContent = "Descargar Certificado";
                  downloadButton.className = "download-button";
                  downloadButton.addEventListener("click", () => {
                    console.log("Intentando generar certificado para:", evaluationId);
                    generateCertificateFromPDF(auth.currentUser.email, evaluationId, highestResult.score, approvalDate);
                  });
                  buttonContainer.appendChild(downloadButton);
                }

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
    const sessionId = urlParams.get('sessionId') || (m?.sessionId || '');  // <= USAR ESTE
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
        const surveyCompleted = await checkSurveyCompletion(evaluationId, user.uid, sessionId);
        if (!surveyCompleted) return;

        // Verificar intentos previos
        const snapshot = await db.collection('responses')
          .where('userId', '==', user.uid)
          .where('evaluationId', '==', evaluationId)
          .where('sessionId', '==', sessionId)   // << clave
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
                evaluationId,
                sessionId,
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

let surveyLoaded = false;

const loadSurveyQuestions = async (evaluationId, sessionId = '') => {
  const surveyForm = document.getElementById('surveyForm');
  if (!surveyForm) return;
  if (surveyLoaded) return;
  surveyLoaded = true;

  surveyForm.innerHTML = 'Cargando…';

  try {
    let surveyDoc = null;

    // 1) Si tenemos sessionId, leemos el doc en "inscripciones/{sessionId}" y tomamos surveyId
    if (sessionId) {
      const sess = await db.collection('inscripciones').doc(sessionId).get();
      if (sess.exists) {
        const sid = sess.data()?.surveyId || '';
        if (sid) {
          const d = await db.collection('surveyQuestions').doc(sid).get();
          if (d.exists) surveyDoc = d;  // ← encuesta asignada a ese curso-realizado
        }
      }
    }

    // 2) Si no hubo encuesta específica, intenta una ligada a la evaluación o default
    if (!surveyDoc) {
      const snap = await db.collection('surveyQuestions')
        .where('evaluationId', 'in', [evaluationId, 'default'])
        .limit(1)
        .get();
      if (!snap.empty) {
        surveyDoc = snap.docs[0];
      } else {
        // fallback final a un doc conocido; cambia "defaultSurvey" por el id que tengas para el default
        const def = await db.collection('surveyQuestions').doc('defaultSurvey').get();
        if (def.exists) surveyDoc = def;
      }
    }

    if (!surveyDoc) {
      surveyForm.innerHTML = '<p>No hay encuesta disponible.</p>';
      return;
    }

    const surveyData = surveyDoc.data();
    surveyForm.innerHTML = '';

    // Render clásico (respeta tus estructuras existentes)
    surveyData.questions.forEach((question, index) => {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = `
        <label for="question${index}">${question.text}</label>
        ${
          question.type === 'select'
          ? `<select name="question${index}" required>
               ${question.options.map(o => `<option value="${o}">${o}</option>`).join('')}
             </select>`
          : `<input type="${question.type}" name="question${index}" required>`
        }
      `;
      surveyForm.appendChild(wrapper);
    });

    // Botón de enviar si no existe
    if (!document.getElementById('submitSurveyButton')) {
      const submit = document.createElement('button');
      submit.type = 'submit';
      submit.id   = 'submitSurveyButton';
      submit.textContent = 'Enviar Encuesta';
      surveyForm.appendChild(submit);
    }

  } catch (err) {
    console.error(err);
    surveyForm.innerHTML = '<p>Error al cargar la encuesta. Intenta más tarde.</p>';
  }
};

// Llamada a la función SOLO si el formulario existe
document.addEventListener('DOMContentLoaded', () => {
    const surveyForm = document.getElementById('surveyForm');
    if (surveyForm) {
        const urlParams = new URLSearchParams(window.location.search);
        const evaluationId = urlParams.get('evaluationId') || 'default';
        const sessionId    = urlParams.get('sessionId') || '';
        loadSurveyQuestions(evaluationId, sessionId);
    }
});

const submitSurvey = async (event) => {
  event.preventDefault();

  const surveyForm = document.getElementById('surveyForm');
  const formData   = new FormData(surveyForm);

  const surveyData = {};
  formData.forEach((value, key) => { surveyData[key] = value; });

  const urlParams    = new URLSearchParams(window.location.search);
  const evaluationId = urlParams.get('evaluationId') || 'default';

  const user = auth.currentUser;
  if (!user) {
    alert('Usuario no autenticado. Por favor, inicia sesión nuevamente.');
    window.location.href = 'index.html';
    return;
  }

  try {
    // resolvemos sesión/encuesta (preferimos lo que venga por URL)
    let { sessionId, surveyId } = await getActiveSessionAndSurvey(evaluationId);
    const urlSessId = urlParams.get('sessionId');
    const urlSrvId  = urlParams.get('surveyId');
    if (urlSessId) sessionId = urlSessId;
    if (urlSrvId)  surveyId  = urlSrvId;

    // Guardar las respuestas de la encuesta
    await db.collection('surveys').add({
      userId:       user.uid,
      evaluationId: evaluationId,
      sessionId:    sessionId || null,  // <- clave para validar por sesión
      surveyId:     surveyId  || null,  // <- opcional, por trazabilidad
      surveyData:   surveyData,
      timestamp:    firebase.firestore.FieldValue.serverTimestamp()
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
            sessionId,     // << aquí también
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

// === Dashboard Usuario ===
// Generar certificado (sin requerir índice compuesto; con bloqueo por alumno/sesión + link clickeable)
const generateCertificateFromPDF = async (userName, evaluationID, score, approvalDate) => {
  try {
    console.log("Certificado solicitado para ID:", evaluationID);

    // ---------- 0) USUARIO ----------
    const user = auth.currentUser;
    if (!user) throw new Error("Usuario no autenticado.");

    const userDoc = await db.collection('users').doc(user.uid).get();
    if (!userDoc.exists) throw new Error("No se encontró el perfil del usuario.");
    const { name: userNameDB, rut, company, customID, assignedCoursesMeta } = userDoc.data() || {};

    // ---------- 1) OBTENER sessionId SIN ÍNDICE COMPUESTO ----------
    // 1.a) Primero, intenta por metadatos del usuario (más barato)
    let sessionId = null;
    if (assignedCoursesMeta && typeof assignedCoursesMeta === 'object') {
      for (const k of Object.keys(assignedCoursesMeta)) {
        const mm = assignedCoursesMeta[k];
        if (mm && (mm.evaluationId === evaluationID || mm.courseKey === evaluationID)) {
          sessionId = mm.sessionId || null;
          break;
        }
      }
    }

    // 1.b) Si no está en meta, consulta 'responses' SIN orderBy/limit y elige el último en memoria
    if (!sessionId) {
      const snap = await db.collection('responses')
        .where('userId', '==', user.uid)
        .where('evaluationId', '==', evaluationID)
        .get(); // <-- sin orderBy/limit => no requiere índice

      let latest = null;
      snap.forEach(d => {
        const r = d.data();
        const ts = r?.timestamp;
        // Soporta Timestamp de Firestore o número/ISO
        const ms = ts?.toMillis ? ts.toMillis() : (typeof ts === 'number' ? ts : (Date.parse(ts) || 0));
        if (!latest || ms > (latest.ms || 0)) latest = { ...r, ms };
      });
      sessionId = latest?.sessionId || null;
    }

    // ---------- 2) BLOQUEO DURO POR ALUMNO/SESIÓN ----------
    if (sessionId) {
      const sSnap = await db.collection('inscripciones').doc(sessionId).get();
      if (sSnap.exists) {
        const arr = Array.isArray(sSnap.data().inscriptions) ? sSnap.data().inscriptions : [];
        const me  = arr.find(p =>
          (customID && p.customID === customID) ||
          (rut && p.rut === rut)
        );
        if (me?.certDownloadLocked === true) {
          alert("Descarga de certificado bloqueada por el instructor.");
          return; // 🔒 bloqueo
        }
      }
    }

    // ---------- 3) DATOS DE LA EVALUACIÓN ----------
    const evaluationDoc = await db.collection('evaluations').doc(evaluationID).get();
    if (!evaluationDoc.exists) throw new Error("La evaluación no existe.");

    const evaluationData      = evaluationDoc.data();
    const evaluationName      = evaluationData.name;
    const evaluationTime      = evaluationData.timeEvaluation;
    const certificateTemplate = evaluationData.certificateTemplate || "plantilla.pdf";
    const evaluationIDNumber  = evaluationData.ID || "00";

    // ---------- 4) FECHA E ID DINÁMICO ----------
    const parseToDate = (d) => {
      if (d instanceof Date) return d;
      if (typeof d === "string") {
        if (/^\d{2}-\d{2}-\d{4}$/.test(d)) { const [dd, mm, yyyy] = d.split("-").map(Number); return new Date(yyyy, mm - 1, dd); }
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) { const [yyyy, mm, dd] = d.split("-").map(Number); return new Date(yyyy, mm - 1, dd); }
      }
      return new Date();
    };
    const pad2 = (n) => String(n).padStart(2, "0");
    const toDDMMYYYY = (d) => `${pad2(d.getDate())}-${pad2(d.getMonth()+1)}-${d.getFullYear()}`;

    const apDate  = parseToDate(approvalDate);
    const dateStr = toDDMMYYYY(apDate);
    const year    = apDate.getFullYear();

    const certificateID = `${evaluationIDNumber}${customID}${year}`;

    // ---------- 5) CARGA/EDICIÓN DEL PDF ----------
    const tplBytes = await fetch(certificateTemplate).then(r => r.arrayBuffer());
    const pdfDoc   = await PDFLib.PDFDocument.load(tplBytes);
    pdfDoc.registerFontkit(fontkit);

    const monoBytes   = await fetch("fonts/MonotypeCorsiva.ttf").then(r => r.arrayBuffer());
    const perpBytes   = await fetch("fonts/Perpetua.ttf").then(r => r.arrayBuffer());
    const perpItBytes = await fetch("fonts/PerpetuaItalic.ttf").then(r => r.arrayBuffer());

    const monotypeFont       = await pdfDoc.embedFont(monoBytes);
    const perpetuaFont       = await pdfDoc.embedFont(perpBytes);
    const perpetuaItalicFont = await pdfDoc.embedFont(perpItBytes);

    const page = pdfDoc.getPages()[0];
    const { width, height } = page.getSize();

    const centerText = (txt, yPos, font, size) => {
      const wTxt = font.widthOfTextAtSize(txt || "", size);
      page.drawText(txt || "", { x: (width - wTxt) / 2, y: yPos, font, size, color: PDFLib.rgb(0, 0, 0) });
    };

    const wrapText = (txt, font, size, maxW) => {
      const words = (txt || "").split(" ");
      const lines = [];
      let line = "";
      for (const w of words) {
        const test = line ? line + " " + w : w;
        if (font.widthOfTextAtSize(test, size) <= maxW) {
          line = test;
        } else {
          if (line) lines.push(line);
          line = w;
        }
      }
      if (line) lines.push(line);
      return lines;
    };

    // Campos
    centerText(`${userNameDB || ""}`,          height - 295, monotypeFont,       35);
    centerText(`RUT: ${rut || ""}`,            height - 340, perpetuaItalicFont, 19);
    centerText(`Empresa: ${company || ""}`,    height - 360, perpetuaItalicFont, 19);

    const maxW2 = width - 100;
    const lines = wrapText(evaluationName, monotypeFont, 34, maxW2);
    let y0 = height - 448;
    for (const l of lines) { centerText(l, y0, monotypeFont, 34); y0 -= 40; }

    page.drawText(`Fecha de Aprobación: ${dateStr}`, {
      x: 147, y: height - 534, size: 12, font: perpetuaFont, color: PDFLib.rgb(0, 0, 0)
    });
    page.drawText(`Duración del Curso: ${evaluationTime || ""}`, {
      x: 157, y: height - 548, size: 12, font: perpetuaFont, color: PDFLib.rgb(0, 0, 0)
    });
    page.drawText(`ID: ${certificateID}`, {
      x: 184, y: height - 562, size: 12, font: perpetuaFont, color: PDFLib.rgb(0, 0, 0)
    });

    // ---------- 6) ENLACE CLICKEABLE DE VERIFICACIÓN ----------
    const { PDFName, PDFArray, PDFNumber, PDFString } = PDFLib;

    const idX   = 144;
    const idY   = height - 562;
    const vGap  = 14;
    const linkX = idX;
    const linkY = idY - vGap;

    const verifyUrl = `https://esysingenieria.github.io/evaluaciones-cursos/verificar.html?id=${encodeURIComponent(certificateID)}`;
    const linkText  = `Verificar Autenticidad de Certificado`;
    const linkSize  = 12;
    const linkFont  = perpetuaFont;

    page.drawText(linkText, { x: linkX, y: linkY, size: linkSize, font: linkFont, color: PDFLib.rgb(0, 0, 1) });

    const linkWidth = linkFont.widthOfTextAtSize(linkText, linkSize);
    page.drawLine({
      start: { x: linkX, y: linkY - 1 }, end: { x: linkX + linkWidth, y: linkY - 1 },
      thickness: 0.5, color: PDFLib.rgb(0, 0, 1)
    });

    const urlAction = pdfDoc.context.obj({ Type: PDFName.of('Action'), S: PDFName.of('URI'), URI: PDFString.of(verifyUrl) });
    const rectArr   = pdfDoc.context.obj([ PDFNumber.of(linkX), PDFNumber.of(linkY - 2), PDFNumber.of(linkX + linkWidth), PDFNumber.of(linkY + linkSize + 2) ]);
    const borderArr = pdfDoc.context.obj([ PDFNumber.of(0), PDFNumber.of(0), PDFNumber.of(0) ]);

    const linkAnnotRef = pdfDoc.context.register(
      pdfDoc.context.obj({ Type: PDFName.of('Annot'), Subtype: PDFName.of('Link'), Rect: rectArr, Border: borderArr, A: urlAction })
    );

    let annots = page.node.lookup(PDFName.of('Annots'), PDFArray);
    if (annots) annots.push(linkAnnotRef); else page.node.set(PDFName.of('Annots'), pdfDoc.context.obj([linkAnnotRef]));

    // ---------- 7) DESCARGA ----------
    const pdfBytes = await pdfDoc.save();
    const blob     = new Blob([pdfBytes], { type: "application/pdf" });
    const a        = document.createElement("a");
    a.href         = URL.createObjectURL(blob);
    a.download     = `Certificado ${evaluationName} - ${userNameDB}.pdf`;
    a.click();

  } catch (error) {
    console.error("Error generando certificado (usuario):", error);
    alert("No se pudo generar el certificado. Revisa la consola.");
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


// --- Helper: obtiene la sesión (inscripción) y la encuesta seleccionada para este curso ---
async function getActiveSessionAndSurvey(evaluationId) {
  const user = auth.currentUser;
  if (!user) return { sessionId: null, surveyId: null };

  try {
    const uDoc = await db.collection('users').doc(user.uid).get();
    const meta = uDoc.exists ? (uDoc.data().assignedCoursesMeta || {}) : {};
    // Buscamos la meta cuyo evaluationId o courseKey coincida con el evaluationId
    const entry = Object.values(meta).find(m => m?.evaluationId === evaluationId || m?.courseKey === evaluationId) || null;
    const sessionId = entry?.sessionId || null;

    let surveyId = null;
    if (sessionId) {
      const sSnap = await db.collection('inscripciones').doc(sessionId).get().catch(() => null);
      if (sSnap && sSnap.exists) {
        const s = sSnap.data() || {};
        // Soportamos varios nombres posibles del campo
        surveyId = s.surveyDocId || s.surveyId || s.survey || s.encuestaId || null;
      }
    }
    return { sessionId, surveyId };
  } catch (e) {
    console.error('getActiveSessionAndSurvey error:', e);
    return { sessionId: null, surveyId: null };
  }
}













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

