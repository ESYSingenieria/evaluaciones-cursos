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
    const evaluationsList = document.getElementById("evaluationsList");
    evaluationsList.innerHTML = ""; // Limpia la lista de evaluaciones

    try {
        const user = auth.currentUser;
        if (!user) throw new Error("Usuario no autenticado.");

        const evaluationsSnapshot = await db.collection("evaluations").get();
        const responsesSnapshot = await db.collection("responses")
            .where("userId", "==", user.uid)
            .get();

        const attemptsByEvaluation = {}; // Almacena los intentos por evaluación

        // Procesar intentos por evaluación
        responsesSnapshot.forEach((doc) => {
            const response = doc.data();
            const evaluationId = response.evaluationId;

            if (!attemptsByEvaluation[evaluationId]) {
                attemptsByEvaluation[evaluationId] = 0;
            }

            attemptsByEvaluation[evaluationId] += 1; // Incrementar intentos
        });

        // Mostrar evaluaciones disponibles según los intentos
        evaluationsSnapshot.forEach((evaluationDoc) => {
            const evaluationData = evaluationDoc.data();
            const evaluationId = evaluationDoc.id;
            const attempts = attemptsByEvaluation[evaluationId] || 0;

            // Mostrar evaluación si los intentos son menores a 3
            if (attempts < 3) {
                const li = document.createElement("li");
                li.innerHTML = `
                    <a href="evaluation.html?id=${evaluationId}">${evaluationData.name}</a>
                    <p>Intentos realizados: ${attempts}/3</p>
                `;
                evaluationsList.appendChild(li);
            }
        });
    } catch (error) {
        console.error("Error al cargar las evaluaciones:", error);
        evaluationsList.innerHTML = "<p>Hubo un problema al cargar las evaluaciones.</p>";
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
    responsesContainer.innerHTML = ""; // Limpia el contenedor de resultados

    try {
        const user = auth.currentUser;
        if (!user) throw new Error("Usuario no autenticado.");

        const responsesSnapshot = await db.collection("responses")
            .where("userId", "==", user.uid)
            .get();

        if (responsesSnapshot.empty) {
            responsesContainer.innerHTML = "<p>No tienes evaluaciones realizadas.</p>";
            return;
        }

        const highestScores = {}; // Almacena el mejor puntaje por evaluación

        // Procesar respuestas del usuario
        responsesSnapshot.forEach((doc) => {
            const response = doc.data();
            const evaluationId = response.evaluationId;

            // Calcular el puntaje usando `calculateResult`
            const result = calculateResult(evaluationId, response.answers);

            // Guardar el mejor puntaje
            if (!highestScores[evaluationId] || result.score > highestScores[evaluationId].score) {
                highestScores[evaluationId] = { ...result, timestamp: response.timestamp };
            }
        });

        // Mostrar los resultados
        Object.keys(highestScores).forEach((evaluationId) => {
            const { score, grade, timestamp } = highestScores[evaluationId];
            const div = document.createElement('div');
            div.className = "result-item";
            div.innerHTML = `
                <h3>Curso: ${evaluation.name}</h3>
                <p><strong>Puntaje:</strong> ${score}</p>
                <p><strong>Estado de Aprobación:</strong> ${grade}</p>
                <p><strong>Fecha del último intento:</strong> ${timestamp ? new Date(timestamp.toDate()).toLocaleDateString() : "No disponible"}</p>
            `;
            responsesContainer.appendChild(div);
        });
    } catch (error) {
        console.error("Error al cargar los resultados:", error);
        responsesContainer.innerHTML = "<p>Hubo un problema al cargar tus resultados.</p>";
    }
};

// Cargar preguntas y opciones en evaluation.html
const loadEvaluation = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const evaluationId = urlParams.get("id");
    const evaluationTitle = document.getElementById("evaluation-title");
    const questionsContainer = document.getElementById("questionsContainer");
    const form = document.getElementById("evaluationForm");

    try {
        const user = auth.currentUser;
        if (!user) {
            window.location.href = "index.html";
            return;
        }

        // Verificar intentos previos
        const snapshot = await db.collection("responses")
            .where("userId", "==", user.uid)
            .where("evaluationId", "==", evaluationId)
            .get();

        let attempts = 0;

        if (!snapshot.empty) {
            const responseDoc = snapshot.docs[0]; // Obtén el primer documento
            const responseData = responseDoc.data();
            attempts = responseData.attempts || 0;

            if (attempts >= 3) {
                alert("Has alcanzado el número máximo de intentos para esta evaluación.");
                window.location.href = "dashboard.html";
                return;
            }
        }

        // Incrementar el contador de intentos si aún no ha alcanzado el límite
        if (attempts < 3) {
            const responseDoc = snapshot.empty
                ? await db.collection("responses").add({
                    userId: user.uid,
                    evaluationId: evaluationId,
                    attempts: 1,
                    answers: {},
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                })
                : snapshot.docs[0].ref.update({
                    attempts: firebase.firestore.FieldValue.increment(1),
                });
        }

        // Cargar preguntas de la evaluación
        const doc = await db.collection("evaluations").doc(evaluationId).get();
        if (doc.exists) {
            evaluationTitle.innerText = doc.data().title;

            doc.data().questions.forEach((question, index) => {
                const questionDiv = document.createElement("div");
                questionDiv.innerHTML = `
                    <p>${index + 1}. ${question.text}</p>
                    ${question.options.map(option => `
                        <label>
                            <input type="radio" name="question${index}" value="${option}" required>
                            ${option}
                        </label>
                    `).join("")}
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
        const evaluationDoc = await db.collection('evaluations').doc(evaluationId).get();
        if (!evaluationDoc.exists) throw new Error("La evaluación no existe.");

        const questions = evaluationDoc.data().questions;
        let correctCount = 0;

        questions.forEach((question, index) => {
            const userAnswer = userAnswers[`question${index}`]?.trim().toLowerCase();
            const correctAnswer = question.correct?.trim().toLowerCase();

            if (userAnswer === correctAnswer) {
                correctCount++;
            }
        });

        const totalQuestions = questions.length;
        const score = Math.round((correctCount*4));
        const grade = score >= 80 ? "Aprobado" : "Reprobado";

        return { score, grade };
    } catch (error) {
        console.error("Error al calcular el resultado:", error);
        return { score: 0, grade: "No disponible" }; // Valores predeterminados
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
