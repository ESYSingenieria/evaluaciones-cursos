// dashboard-admin.js

// ───────────────────────────────────────────────────
// 1) Inicializar Firebase
// ───────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyBikggLtX1nwc1OXWUvDKXFm6P_hAdAe-Y",
  authDomain: "plataforma-de-cursos-esys.firebaseapp.com",
  projectId: "plataforma-de-cursos-esys",
  storageBucket: "plataforma-de-cursos-esys.firebasestorage.app",
  messagingSenderId: "950684050808",
  appId: "1:950684050808:web:33d2ef70f2343642f4548d"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();
const { jsPDF } = window.jspdf;  // Asegúrate de incluir jsPDF en el HTML

// ───────────────────────────────────────────────────
// 2) Estado global y caché
// ───────────────────────────────────────────────────
let allUsers           = [];
let allEvaluations     = {};
let allResponses       = [];
let allSurveys         = [];
let surveyQuestionsMap = {};

let searchName    = "";
let filterCourse  = "all";
let filterCompany = "all";
let sortBy        = "dateDesc";

// ───────────────────────────────────────────────────
// 3) Autenticación y carga inicial
// ───────────────────────────────────────────────────
auth.onAuthStateChanged(async user => {
  if (!user) {
    location.href = "index.html";
    return;
  }
  const roleSnap = await db.collection("users").doc(user.uid).get();
  const role     = roleSnap.data()?.role;
  if (role === "admin" && !location.pathname.includes("dashboard-admin.html")) {
    location.href = "dashboard-admin.html";
    return;
  }
  if (role !== "admin" && location.pathname.includes("dashboard-admin.html")) {
    location.href = "dashboard.html";
    return;
  }
  if (location.pathname.includes("dashboard-admin.html")) {
    await initializeData();
    setupFiltersUI();
    loadAllUsers();
  }
});

// ───────────────────────────────────────────────────
// 4) Precarga de datos desde Firestore
// ───────────────────────────────────────────────────
async function initializeData() {
  // Usuarios
  const usSnap = await db.collection("users").where("role", "==", "user").get();
  allUsers = usSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Evaluations
  const evSnap = await db.collection("evaluations").get();
  evSnap.docs.forEach(d => {
    allEvaluations[d.id] = d.data();
  });

  // Responses
  const rSnap = await db.collection("responses").get();
  allResponses = rSnap.docs.map(d => {
    const data = d.data();
    return {
      userId:       data.userId,
      evaluationId: data.evaluationId,
      timestamp:    data.timestamp?.toDate() || new Date(0),
      result:       data.result || {},
      answers:      data.answers || {}
    };
  });

  // Surveys + SurveyQuestions
  const sSnap = await db.collection("surveys").get();
  allSurveys = sSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const sqSnap = await db.collection("surveyQuestions").get();
  sqSnap.docs.forEach(d => {
    surveyQuestionsMap[d.id] = d.data().questions || [];
  });
}

// ───────────────────────────────────────────────────
// 5) Construir UI de filtros
// ───────────────────────────────────────────────────
function setupFiltersUI() {
  if (document.getElementById("filtersBar")) return;

  const bar = document.createElement("div");
  bar.id = "filtersBar";
  bar.style = "margin:16px 0; display:flex; gap:8px; flex-wrap:wrap;";
  bar.innerHTML = `
    <input id="f_search" placeholder="Buscar por nombre" />
    <select id="f_course"><option value="all">Todos los cursos</option></select>
    <select id="f_company"><option value="all">Todas las empresas</option></select>
    <select id="f_sort">
      <option value="dateDesc">Fecha (más nuevos primero)</option>
      <option value="dateAsc">Fecha (más antiguos primero)</option>
      <option value="customIdDesc">CustomID (mayor primero)</option>
      <option value="customIdAsc">CustomID (menor primero)</option>
    </select>
  `;
  document.querySelector("h1").insertAdjacentElement("afterend", bar);

  // Poblar cursos agrupando por nombre
  const seen = new Set();
  Object.values(allEvaluations).forEach(ev => {
    const name = ev.name || "";
    if (name && !seen.has(name)) {
      seen.add(name);
      bar.querySelector("#f_course").innerHTML += `<option value="${name}">${name}</option>`;
    }
  });

  // Poblar empresas
  [...new Set(allUsers.map(u => u.company).filter(Boolean))].forEach(company => {
    bar.querySelector("#f_company").innerHTML += `<option value="${company}">${company}</option>`;
  });

  // Listeners
  bar.querySelector("#f_search").addEventListener("input", e => {
    searchName = e.target.value.toLowerCase();
    loadAllUsers();
  });
  bar.querySelector("#f_course").addEventListener("change", e => {
    filterCourse = e.target.value;
    loadAllUsers();
  });
  bar.querySelector("#f_company").addEventListener("change", e => {
    filterCompany = e.target.value;
    loadAllUsers();
  });
  bar.querySelector("#f_sort").addEventListener("change", e => {
    sortBy = e.target.value;
    loadAllUsers();
  });
}

// ───────────────────────────────────────────────────
// 6) Renderizar usuarios con filtros y orden
// ───────────────────────────────────────────────────
function loadAllUsers() {
  const container = document.getElementById("usersList");
  container.innerHTML = "";

  let filtered = allUsers.filter(u => {
    if (searchName && !u.name.toLowerCase().includes(searchName)) return false;
    if (filterCompany !== "all" && u.company !== filterCompany) return false;
    if (filterCourse !== "all") {
      const names = (u.assignedEvaluations || [])
        .map(code => allEvaluations[code]?.name || "");
      if (!names.includes(filterCourse)) return false;
    }
    return true;
  });

  // Calcular última fecha de intento válido
  filtered.forEach(u => {
    const times = allResponses
      .filter(r => r.userId === u.id && typeof r.result?.score === "number")
      .map(r => r.timestamp.getTime());
    u._lastTime = times.length ? Math.max(...times) : 0;
  });

  // Ordenar
  filtered.sort((a, b) => {
    switch (sortBy) {
      case "dateDesc":     return b._lastTime - a._lastTime;
      case "dateAsc":      return a._lastTime - b._lastTime;
      case "customIdDesc": return (+b.customID || 0) - (+a.customID || 0);
      case "customIdAsc":  return (+a.customID || 0) - (+b.customID || 0);
      default: return 0;
    }
  });

  if (!filtered.length) {
    container.textContent = "No se encontraron usuarios.";
    return;
  }

  filtered.forEach(u => {
    const userDiv = document.createElement("div");
    userDiv.className = "user-item";
    userDiv.innerHTML = `
      <strong>${u.name}</strong><br>
      RUT: ${u.rut}<br>
      CustomID: ${u.customID}<br>
      Empresa: ${u.company}<br>
      <em>Evaluaciones asignadas:</em>
    `;

    (u.assignedEvaluations || []).forEach(code => {
      const evData = allEvaluations[code] || {};
      const evName = evData.name || code;

      const evalDiv = document.createElement("div");
      evalDiv.className = "eval-item";
      evalDiv.innerHTML = `<strong>${evName}</strong><br>`;

      // Intentos válidos
      const attempts = allResponses
        .filter(r => r.userId === u.id && r.evaluationId === code && typeof r.result?.score === "number")
        .sort((a, b) => a.timestamp - b.timestamp);

      attempts.forEach((r, idx) => {
        const btn = document.createElement("button");
        btn.textContent = `Intento ${idx+1}`;
        btn.onclick = () => downloadResponsePDFForAttempt(u.id, code, idx);
        evalDiv.appendChild(btn);
      });

      // Reiniciar intentos
      const btnReset = document.createElement("button");
      btnReset.textContent = "Reiniciar intentos";
      btnReset.onclick = () => resetAttemptsForEvaluation(u.id, code);
      evalDiv.appendChild(btnReset);

      // Encuesta
      const btnSurvey = document.createElement("button");
      btnSurvey.textContent = "Encuesta de satisfacción";
      btnSurvey.onclick = () => downloadSurveyPDF(u.id, code);
      evalDiv.appendChild(btnSurvey);

      // Certificado
      const passed = attempts.find(r => r.result.grade === "Aprobado");
      if (passed) {
        const btnCert = document.createElement("button");
        btnCert.textContent = "Certificado";
        btnCert.onclick = () => generateCertificateForUser(u.id, code, passed.result.score, passed.timestamp.toLocaleDateString());
        evalDiv.appendChild(btnCert);
      }

      userDiv.appendChild(evalDiv);
    });

    container.appendChild(userDiv);
  });
}

// ───────────────────────────────────────────────────
// 7) PDF de respuestas con wrap y limpieza de "!"
// ───────────────────────────────────────────────────
async function downloadResponsePDFForAttempt(uid, ev, idx) {
  const attempts = allResponses
    .filter(r => r.userId === uid && r.evaluationId === ev && typeof r.result?.score === "number")
    .sort((a, b) => a.timestamp - b.timestamp);
  if (!attempts[idx]) {
    alert("Intento no encontrado.");
    return;
  }
  await createSingleAttemptPDF(uid, ev, idx+1, attempts[idx]);
}

async function createSingleAttemptPDF(uid, ev, intentoNum, r) {
  const [uSnap, eSnap] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("evaluations").doc(ev).get()
  ]);
  const userName   = uSnap.data().name;
  const courseName = eSnap.data().name || ev;
  const qs         = eSnap.data().questions || [];

  const pdf     = new jsPDF();
  pdf.setFont("helvetica","normal");
  let y        = 10;
  const margin = 10;
  const maxW   = 190;
  const lh     = 7;
  const by     = 280;

  // Cabecera
  pdf.setFontSize(14);
  pdf.text(`Nombre: ${userName}`, margin, y);         y += lh;
  pdf.text(`Curso: ${courseName}`, margin, y);        y += lh;
  pdf.text(`Intento: ${intentoNum}`, margin, y);      y += lh;
  pdf.setFontSize(12);
  pdf.text(`Puntaje: ${r.result.score}`, margin, y);  y += lh;
  pdf.text(`Estado: ${r.result.grade}`, margin, y);   y += lh;

  // Preguntas y respuestas
  Object.entries(r.answers || {})
    .sort((a,b) => +a[0].match(/\d+/)[0] - +b[0].match(/\d+/)[0])
    .forEach(([key, ans]) => {
      const idxQ = +key.match(/\d+/)[0];
      const questionText = qs[idxQ]?.text || `Pregunta ${idxQ+1}`;
      const cleanAns     = String(ans).replace(/^[!'’\s]+/, "").trim();

      // Wrap pregunta
      const qLines = pdf.splitTextToSize(`${idxQ+1}. ${questionText}`, maxW);
      qLines.forEach(line => {
        if (y > by) { pdf.addPage(); y = 10; }
        pdf.text(line, margin, y);
        y += lh;
      });

      // Wrap respuesta
      const aLines = pdf.splitTextToSize(`→ ${cleanAns}`, maxW);
      aLines.forEach(line => {
        if (y > by) { pdf.addPage(); y = 10; }
        pdf.text(line, margin + 4, y);
        y += lh;
      });
    });

  pdf.save(`Respuestas_${userName}_${ev}_intento${intentoNum}.pdf`);
}

// ───────────────────────────────────────────────────
// 8) Reiniciar intentos
// ───────────────────────────────────────────────────
async function resetAttemptsForEvaluation(uid, ev) {
  if (!confirm(`¿Reiniciar intentos de ${ev}?`)) return;
  const snap = await db.collection("responses")
    .where("userId", "==", uid)
    .where("evaluationId", "==", ev)
    .get();
  const batch = db.batch();
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  alert("Intentos reiniciados.");
}

// ───────────────────────────────────────────────────
// 9) PDF de encuesta con wrap y sin duplicar numeración
// ───────────────────────────────────────────────────
async function downloadSurveyPDF(uid, ev) {
  const docs = allSurveys
    .filter(s => s.userId === uid && s.evaluationId === ev)
    .sort((a, b) => a.timestamp.toDate() - b.timestamp.toDate());
  if (!docs.length) {
    alert("Sin encuestas.");
    return;
  }
  const s        = docs[0];
  const userName = (await db.collection("users").doc(uid).get()).data().name;
  const qs       = surveyQuestionsMap[ev] || surveyQuestionsMap["defaultSurvey"] || [];

  const pdf     = new jsPDF();
  pdf.setFont("helvetica","normal");
  let y        = 10;
  const margin = 10;
  const maxW   = 190;
  const lh     = 7;
  const by     = 280;

  // Cabecera
  pdf.setFontSize(14);
  pdf.text(`Nombre: ${userName}`, margin, y);         y += lh;
  pdf.text(`Encuesta: ${allEvaluations[ev]?.name || ev}`, margin, y); y += lh;
  pdf.setFontSize(12);

  // Preguntas y respuestas de encuesta
  Object.entries(s.surveyData || {})
    .sort((a,b) => +a[0].match(/\d+/)[0] - +b[0].match(/\d+/)[0])
    .forEach(([key, ans]) => {
      const idxQ = +key.match(/\d+/)[0];
      const questionText = qs[idxQ]?.text || `Pregunta ${idxQ+1}`;
      const cleanAns     = String(ans).replace(/^[!'’\s]+/, "").trim();

      // Wrap pregunta (ya incluye su numeración en text)
      const qLines = pdf.splitTextToSize(questionText, maxW);
      qLines.forEach(line => {
        if (y > by) { pdf.addPage(); y = 10; }
        pdf.text(line, margin, y);
        y += lh;
      });

      // Wrap respuesta
      const aLines = pdf.splitTextToSize(`→ ${cleanAns}`, maxW);
      aLines.forEach(line => {
        if (y > by) { pdf.addPage(); y = 10; }
        pdf.text(line, margin + 4, y);
        y += lh;
      });
    });

  pdf.save(`Encuesta_${userName}_${ev}.pdf`);
}

// ───────────────────────────────────────────────────
// 10) Generar certificado (sin cambiar lógica original)
// ───────────────────────────────────────────────────
async function generateCertificateForUser(uid, evaluationID, score, approvalDate) {
  try {
    // 1) Leer usuario
    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists) throw new Error("Usuario no encontrado");
    const { name: userNameDB, rut, company, customID } = userSnap.data();

    // 2) Leer evaluación
    const evalSnap = await db.collection("evaluations").doc(evaluationID).get();
    if (!evalSnap.exists) throw new Error("Evaluación no encontrada");
    const { name: evaluationName, timeEvaluation: evaluationTime, certificateTemplate, ID: evaluationIDNumber } = evalSnap.data();

    // 3) Calcular ID dinámico
    const [d,m,y]    = approvalDate.split("-");
    const year       = new Date(`${y}-${m}-${d}`).getFullYear();
    const certificateID = `${evaluationIDNumber}${customID}${year}`;

    // 4) Cargar plantilla
    const tplBytes = await fetch(certificateTemplate).then(r => r.arrayBuffer());
    const pdfDoc   = await PDFLib.PDFDocument.load(tplBytes);
    pdfDoc.registerFontkit(fontkit);

    // 5) Cargar fonts
    const [monoBytes, perpBytes, perpItBytes] = await Promise.all([
      fetch("fonts/MonotypeCorsiva.ttf").then(r => r.arrayBuffer()),
      fetch("fonts/Perpetua.ttf").then(r => r.arrayBuffer()),
      fetch("fonts/PerpetuaItalic.ttf").then(r => r.arrayBuffer())
    ]);
    const [monoFont, perpFont, perpItFont] = await Promise.all([
      pdfDoc.embedFont(monoBytes),
      pdfDoc.embedFont(perpBytes),
      pdfDoc.embedFont(perpItBytes)
    ]);

    // 6) Preparar página
    const page = pdfDoc.getPages()[0];
    const { width, height } = page.getSize();

    // 7) Helpers para centrar y wrap
    const centerText = (txt, yPos, font, size) => {
      const wTxt = font.widthOfTextAtSize(txt, size);
      page.drawText(txt, { x: (width - wTxt) / 2, y: yPos, font, size, color: PDFLib.rgb(0,0,0) });
    };
    const wrapText = (txt, font, size, maxW) => {
      const words = txt.split(" ");
      const lines = [];
      let line = "";
      for (const w of words) {
        const test = line ? line + " " + w : w;
        if (font.widthOfTextAtSize(test, size) <= maxW) {
          line = test;
        } else {
          lines.push(line);
          line = w;
        }
      }
      if (line) lines.push(line);
      return lines;
    };

    // 8) Pintar campos
    centerText(userNameDB,             height - 295, monoFont,       35);
    centerText(`RUT: ${rut}`,          height - 340, perpItFont,    19);
    centerText(`Empresa: ${company}`,  height - 360, perpItFont,    19);

    const maxW2 = width - 100;
    let y0 = height - 448;
    for (const l of wrapText(evaluationName, monoFont, 34, maxW2)) {
      centerText(l, y0, monoFont, 34);
      y0 -= 40;
    }

    page.drawText(`Fecha de Aprobación: ${approvalDate}`, {
      x: 147, y: height - 548, size: 12, font: perpFont, color: PDFLib.rgb(0,0,0)
    });
    page.drawText(`Duración del Curso: ${evaluationTime}`, {
      x: 157, y: height - 562, size: 12, font: perpFont, color: PDFLib.rgb(0,0,0)
    });
    page.drawText(`ID: ${certificateID}`, {
      x: 184, y: height - 576, size: 12, font: perpFont, color: PDFLib.rgb(0,0,0)
    });

    // 9) Exportar
    const pdfBytes = await pdfDoc.save();
    const blob     = new Blob([pdfBytes], { type: "application/pdf" });
    const link     = document.createElement("a");
    link.href      = URL.createObjectURL(blob);
    link.download  = `Certificado ${evaluationName} - ${userNameDB}.pdf`;
    link.click();

  } catch (error) {
    console.error("Error generando certificado:", error);
    alert("No se pudo generar el certificado. Revisa la consola.");
  }
}
