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

// Verificar autenticación en cada página
auth.onAuthStateChanged((user) => {
    if (!user) {
        console.log("No hay usuario autenticado.");
        if (
            document.body.contains(document.getElementById('evaluationsList')) || 
            document.body.contains(document.getElementById('evaluation-title'))
        ) {
            window.location.href = "index.html";
        }
    } else {
        console.log("Usuario autenticado:", user.uid);

        // Cargar evaluaciones si es dashboard.html
        if (document.body.contains(document.getElementById('evaluationsList'))) {
            loadEvaluations();
        }

        // Cargar respuestas en el dashboard
        if (document.body.contains(document.getElementById('responsesList'))) {
            loadResponses();
        }

        // Cargar evaluación si es evaluation.html
        if (document.body.contains(document.getElementById('evaluation-title'))) {
            loadEvaluation();
        }
    }
});

auth.onAuthStateChanged(async (user) => {
    if (user) {
        console.log("Usuario autenticado:", user.uid);

        // Verificar si ya existen datos del usuario en Firestore
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (!userDoc.exists) {
            // Guardar datos iniciales si no existen
            await db.collection('users').doc(user.uid).set({
                rut: "Sin definir", // Puedes personalizar esto
                name: "Nombre Predeterminado", // Cambia según tus necesidades
                company: "Empresa Predeterminada",
                customId: "ID-Predeterminado",
                email: user.email,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
            console.log("Datos iniciales del usuario guardados.");
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

// Cargar evaluaciones en dashboard.html
const loadEvaluations = async () => {
    const evaluationsList = document.getElementById('evaluationsList');
    try {
        const snapshot = await db.collection('evaluations').get();
        snapshot.forEach(doc => {
            const li = document.createElement('li');
            li.innerHTML = `<a href="evaluation.html?id=${doc.id}">${doc.data().title}</a>`;
            evaluationsList.appendChild(li);
        });
    } catch (error) {
        console.error("Error cargando evaluaciones:", error);
    }
};

// Enviar respuestas de evaluation.html
const submitEvaluation = async (event) => {
    event.preventDefault();

    // Mostrar confirmación al usuario
    const confirmSubmission = window.confirm("¿Estás seguro de que quieres enviar tus respuestas?");
    if (!confirmSubmission) {
        return; // Si cancela, no se envían las respuestas
    }

    const urlParams = new URLSearchParams(window.location.search);
    const evaluationId = urlParams.get('id');
    const form = document.getElementById('evaluationForm');
    const formData = new FormData(form);
    const answers = {};

    formData.forEach((value, key) => {
        answers[key] = value;
    });

    // Validar que se hayan respondido las preguntas
    if (Object.keys(answers).length === 0) {
        alert("Debes responder al menos una pregunta antes de enviar.");
        return;
    }

    try {
        const user = auth.currentUser;
        if (!user) throw new Error("Usuario no autenticado.");

        // Guardar las respuestas en Firestore
        await db.collection('responses').add({
            userId: user.uid,
            evaluationId: evaluationId,
            answers: answers,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        });

        form.innerHTML = `
            <p>Gracias por enviar tus respuestas. En el Dashboard puedes ver tus resultados.</p>
            <button id="backToDashboard" type="button">Volver al Dashboard</button>
        `;

        // Botón para volver al dashboard
        const backButton = document.getElementById('backToDashboard');
        backButton.addEventListener('click', () => {
            window.location.href = "dashboard.html";
        });

    } catch (error) {
        console.error("Error al enviar las respuestas:", error);
        alert("Hubo un error al enviar las respuestas. Por favor, inténtalo de nuevo.");
    }
};

// Vincular el evento de envío al formulario
const evaluationForm = document.getElementById('evaluationForm');
if (evaluationForm) {
    evaluationForm.addEventListener('submit', submitEvaluation);
}

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

        snapshot.forEach(async (doc) => {
            const response = doc.data();
            const result = await calculateResult(response.evaluationId, response.answers);

            if (result) {
                const div = document.createElement('div');
                div.className = "result-item";
                div.innerHTML = `
                    <h3>Curso: ${response.evaluationId}</h3>
                    <p><strong>Puntaje:</strong> ${result.score}</p>
                    <p><strong>Estado de Aprobación:</strong> ${result.grade}</p>
                `;

                // Verificar si el usuario aprobó
                if (result.score >= 80) {
                    const downloadButton = document.createElement("button");
                    downloadButton.textContent = "Descargar Certificado";
                    downloadButton.style.marginTop = "10px";

                    const approvalDate = response.timestamp ? new Date(response.timestamp.toDate()).toLocaleDateString() : "Fecha no disponible";

                    // Botón para generar el certificado
                    downloadButton.addEventListener("click", () => {
                        console.log("Intentando generar certificado para:", response.evaluationId);
                        generateCertificateFromPDF(auth.currentUser.email, response.evaluationId, result.score, approvalDate);
                    });

                    div.appendChild(downloadButton);
                }

                responsesContainer.appendChild(div);
            }
        });
    } catch (error) {
        console.error("Error cargando respuestas:", error);
        responsesContainer.innerHTML = "<p>Hubo un problema al cargar tus resultados.</p>";
    }
};

// Cargar preguntas y opciones en evaluation.html
const loadEvaluation = async () => {
    console.log("Iniciando carga de evaluación...");
    const urlParams = new URLSearchParams(window.location.search);
    const evaluationId = urlParams.get('id');
    const evaluationTitle = document.getElementById('evaluation-title');
    const questionsContainer = document.getElementById('questionsContainer');
    const form = document.getElementById('evaluationForm');
    const timerElement = document.getElementById('timer'); // Elemento para mostrar el temporizador

    try {
        const user = auth.currentUser;
        if (!user) {
            window.location.href = "index.html";
            return;
        }

        console.log("Usuario autenticado:", user.uid);

        // Verificar si el usuario ya respondió esta evaluación
        const snapshot = await db.collection('responses')
            .where('userId', '==', user.uid)
            .where('evaluationId', '==', evaluationId)
            .get();

        console.log("Consulta realizada. Resultados:", snapshot.size);

        if (!snapshot.empty) {
            console.log("El usuario ya respondió esta evaluación.");
            
            // Mostrar un modal flotante
            const modal = document.createElement('div');
            modal.id = 'responseModal';
            modal.style.position = 'fixed';
            modal.style.top = '50%';
            modal.style.left = '50%';
            modal.style.transform = 'translate(-50%, -50%)';
            modal.style.zIndex = '1000';
            modal.style.backgroundColor = '#fff';
            modal.style.padding = '20px';
            modal.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
            modal.style.borderRadius = '10px';
            modal.innerHTML = `
                <p style="color: red; font-weight: bold; text-align: center;">
                    No puedes realizar la evaluación más de una vez.
                </p>
                <button id="closeModal" style="padding: 10px 20px; background-color: #007bff; color: #fff; border: none; border-radius: 5px; cursor: pointer; margin: 0 auto; display: block;">
                    Volver al Dashboard
                </button>
            `;

            // Insertar el modal en el cuerpo del documento
            document.body.appendChild(modal);

            // Deshabilitar el contenido de la página detrás del modal
            form.style.display = "none";

            // Manejar clic en el botón del modal
            const closeModal = document.getElementById('closeModal');
            closeModal.addEventListener('click', () => {
                window.location.href = "dashboard.html";
            });

            return;
        }

        console.log("El usuario no ha respondido esta evaluación. Cargando preguntas...");

        // Si no respondió, cargar las preguntas
        const doc = await db.collection('evaluations').doc(evaluationId).get();
        if (doc.exists) {
            const evaluationData = doc.data();
            evaluationTitle.innerText = evaluationData.name; // Usar el nombre único de la evaluación

            // Iniciar temporizador si hay un tiempo límite
            if (evaluationData.timeLimit) {
                startTimer(evaluationData.timeLimit, form);
            }

            // Cargar preguntas
            evaluationData.questions.forEach((question, index) => {
                const questionDiv = document.createElement('div');
                questionDiv.innerHTML = `
                    <p>${index + 1}. ${question.text}</p>
                    ${question.options.map(option => `
                        <label>
                            <input type="radio" name="question${index}" value="${option}" required>
                            ${option}
                        </label>
                    `).join('')}
                `;
                questionsContainer.appendChild(questionDiv);
            });
        } else {
            console.error("La evaluación no existe.");
            alert("La evaluación no fue encontrada.");
        }
    } catch (error) {
        console.error("Error al cargar la evaluación:", error);
        alert("Ocurrió un error al cargar la evaluación. Por favor, inténtalo de nuevo.");
    }
};

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

        if (score >= 80) grade = "Aprobado";
        else grade = "Reprobado";

        return { score, grade };
    } catch (error) {
        console.error("Error al calcular el resultado:", error);
        return null;
    }
};

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

        // Obtener el nombre de la evaluación desde Firestore
        const evaluationDoc = await db.collection('evaluations').doc(evaluationID).get();
        if (!evaluationDoc.exists) throw new Error("La evaluación no existe.");
        
        const evaluationData = evaluationDoc.data();
        const evaluationName = evaluationData.name;
        const evaluationTime = evaluationData.timeEvaluation;

        console.log("Evaluación encontrada:", evaluationName);
        console.log("Tiempo de Evaluación:", evaluationTime);


        // Cargar el PDF base
        const existingPdfBytes = await fetch("plantilla.pdf").then(res => res.arrayBuffer());
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
            const textWidth = font.widthOfTextAtSize(text, size); // Calcula el ancho del texto con tamaño 12
            const x = (width - textWidth) / 2; // Calcula la posición X para centrar
            firstPage.drawText(text, { x, y, size, font, color: PDFLib.rgb(0, 0, 0) });
        };

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
        centerText(`${userNameDB}`, height - 295, monotypeFont, 35); // Centrar el nombre
        centerText(`RUT: ${rut}`, height - 340, perpetuaItalicFont, 19); // Centrar el puntaje
        centerText(`Empresa: ${company}`, height - 360, perpetuaItalicFont, 19); // Centrar el puntaje

        // Texto centrado con ajuste de líneas
        const lines = wrapText(evaluationName, monotypeFont, 34, maxWidth2);
        let yPosition = height - 448; // Posición inicial para el nombre
        
        lines.forEach(line => {
            centerText(line, yPosition, monotypeFont, 34);
            yPosition -= 40; // Ajusta el espaciado entre líneas
        });

        // Texto posicionado manualmente
        firstPage.drawText(`Fecha de Aprobación: ${approvalDate}`, {
            x: 147, // Posición fija en X
            y: height - 548, // Posición fija en Y
            size: 12,
            font: perpetuaFont,
            color: PDFLib.rgb(0, 0, 0),
        });

        // Texto posicionado manualmente
        firstPage.drawText(`Duración del Curso: ${evaluationTime}`, {
            x: 157, // Posición fija en X
            y: height - 562, // Posición fija en Y
            size: 12,
            font: perpetuaFont,
            color: PDFLib.rgb(0, 0, 0),
        });

        firstPage.drawText(`ID: 02${customID}2024`, {
            x: 184, // Posición fija en X
            y: height - 576, // Posición fija en Y
            size: 12,
            font: perpetuaFont,
            color: PDFLib.rgb(0, 0, 0),
        });

        // Exportar el PDF modificado
        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: "application/pdf" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `Certificado_${evaluationName}.pdf`;
        link.click();
        console.log("Evaluación encontrada:", evaluationName);
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
