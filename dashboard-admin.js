// dashboard-admin.js

// ───────────────────────────────────────────────────
// 🔒 Panel de Administración
// ───────────────────────────────────────────────────

// 1) Inicializar Firebase
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
const { jsPDF } = window.jspdf;

// ───────────────────────────────────────────────────
// 2) Variables globales: caché + filtros/orden
let allUsers        = [];
let allEvaluations  = {};   // { evalCode: data }
let allResponses    = [];   // [ { userId, evaluationId, timestamp, result, answers } ]
let allSurveys      = [];   // [ { id, ... } ]
let surveyQuestionsMap = {}; // { evalCode: [ questions ] }

let searchName    = "";
let filterCourse  = "all";
let filterCompany = "all";
let sortBy        = "dateDesc"; // dateDesc | dateAsc | customIdDesc | customIdAsc

// ───────────────────────────────────────────────────
// 3) Chequeo de auth/rol y carga inicial
auth.onAuthStateChanged(async user => {
  if (!user) {
    location.href = "index.html";
    return;
  }
  const perfil = await db.collection("users").doc(user.uid).get();
  const role   = perfil.data()?.role;
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
    await setupFiltersUI();
    loadAllUsers();
  }
});

// ───────────────────────────────────────────────────
// 4) Precarga de toda la data en memoria
async function initializeData() {
  const container = document.getElementById("usersList");
  if (container) container.textContent = "Cargando datos…";

  // Usuarios (role = user)
  const usSnap = await db.collection("users")
                         .where("role","==","user")
                         .get();
  allUsers = usSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Evaluations
  const evSnap = await db.collection("evaluations").get();
  evSnap.docs.forEach(d => allEvaluations[d.id] = d.data());

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

  // Surveys + surveyQuestions
  const sSnap  = await db.collection("surveys").get();
  allSurveys = sSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const sqSnap = await db.collection("surveyQuestions").get();
  sqSnap.docs.forEach(d => {
    surveyQuestionsMap[d.id] = d.data().questions || [];
  });
}

// ───────────────────────────────────────────────────
// 5) Construcción UI de filtros + selects
async function setupFiltersUI() {
  if (document.getElementById("filtersBar")) return;
  const bar = document.createElement("div");
  bar.id = "filtersBar";
  bar.style = "margin:16px 0; display:flex;gap:8px;flex-wrap:wrap;";

  bar.innerHTML = `
    <input id="f_search"    placeholder="Buscar por nombre" />
    <select id="f_course"><option value="all">Todos los cursos</option></select>
    <select id="f_company"><option value="all">Todas las empresas</option></select>
    <select id="f_sort">
      <option value="dateDesc">Fecha (más recientes primero)</option>
      <option value="dateAsc">Fecha (más antiguos primero)</option>
      <option value="customIdDesc">CustomID (mayor primero)</option>
      <option value="customIdAsc">CustomID (menor primero)</option>
    </select>
  `;
  const h1 = document.querySelector("h1") || document.body;
  h1.insertAdjacentElement("afterend", bar);

  // poblar cursos
  Object.entries(allEvaluations).forEach(([code,data])=>{
    const name = data.name || code;
    bar.querySelector("#f_course")
       .innerHTML += `<option value="${code}">${name}</option>`;
  });
  // poblar empresas
  const companies = new Set(allUsers.map(u=>u.company).filter(Boolean));
  companies.forEach(co => {
    bar.querySelector("#f_company")
       .innerHTML += `<option value="${co}">${co}</option>`;
  });

  // listeners
  bar.querySelector("#f_search").addEventListener("input", e=>{
    searchName = e.target.value.toLowerCase();
    loadAllUsers();
  });
  bar.querySelector("#f_course").addEventListener("change", e=>{
    filterCourse = e.target.value;
    loadAllUsers();
  });
  bar.querySelector("#f_company").addEventListener("change", e=>{
    filterCompany = e.target.value;
    loadAllUsers();
  });
  bar.querySelector("#f_sort").addEventListener("change", e=>{
    sortBy = e.target.value;
    loadAllUsers();
  });
}

// ───────────────────────────────────────────────────
// 6) Filtrado, orden y render en memoria
async function loadAllUsers() {
  const container = document.getElementById("usersList");
  container.innerHTML = "";

  // filtrar
  let filtered = allUsers.filter(u => {
    if (searchName && !u.name.toLowerCase().includes(searchName)) return false;
    if (filterCompany!=="all" && u.company!==filterCompany)        return false;
    if (filterCourse!=="all" && !u.assignedEvaluations.includes(filterCourse)) return false;
    return true;
  });

  // calcular última fecha por usuario
  filtered.forEach(u => {
    const userResps = allResponses
      .filter(r=>r.userId===u.id && r.result && typeof r.result.score==="number");
    u._lastTime = userResps.length
      ? Math.max(...userResps.map(r=>r.timestamp.getTime()))
      : 0;
  });

  // ordenar
  filtered.sort((a,b)=>{
    switch(sortBy){
      case "dateDesc":      return b._lastTime - a._lastTime;
      case "dateAsc":       return a._lastTime - b._lastTime;
      case "customIdDesc":  return (+b.customID||0) - (+a.customID||0);
      case "customIdAsc":   return (+a.customID||0) - (+b.customID||0);
      default: return 0;
    }
  });

  // render
  filtered.forEach(u => {
    const div = document.createElement("div");
    div.className = "user-item";
    div.innerHTML = `
      <strong>${u.name}</strong><br>
      RUT: ${u.rut}<br>
      CustomID: ${u.customID}<br>
      Empresa: ${u.company}<br>
      <em>Evaluaciones asignadas:</em>
    `;

    (u.assignedEvaluations||[]).forEach(ev => {
      const eData = allEvaluations[ev]||{};
      const eName = eData.name || ev;
      const evalDiv = document.createElement("div");
      evalDiv.className = "eval-item";
      evalDiv.innerHTML = `<strong>${eName}</strong><br>`;

      // sólo respuestas válidas
      const valids = allResponses
        .filter(r=>r.userId===u.id && r.evaluationId===ev && r.result && typeof r.result.score==="number")
        .sort((a,b)=>a.timestamp - b.timestamp);

      // botones intentos
      valids.forEach((r,i)=>{
        const btn = document.createElement("button");
        btn.textContent = `Respuestas Evaluación Intento ${i+1}`;
        btn.onclick = ()=>downloadResponsePDFForAttempt(u.id,ev,i);
        evalDiv.appendChild(btn);
      });

      // reiniciar
      const btnR = document.createElement("button");
      btnR.textContent = "Reiniciar Intentos";
      btnR.onclick = ()=>resetAttemptsForEvaluation(u.id,ev);
      evalDiv.appendChild(btnR);

      // encuesta
      const btnS = document.createElement("button");
      btnS.textContent = "Encuesta de Satisfacción";
      btnS.onclick = ()=>downloadSurveyPDF(u.id,ev);
      evalDiv.appendChild(btnS);

      // certificado
      const passed = valids.find(r=>r.result.grade==="Aprobado");
      if (passed) {
        const score   = passed.result.score;
        const dateStr = passed.timestamp.toLocaleDateString();
        const btnC = document.createElement("button");
        btnC.textContent = "Certificado de Aprobación";
        btnC.onclick = ()=>generateCertificateForUser(u.id,ev,score,dateStr);
        evalDiv.appendChild(btnC);
      }

      div.appendChild(evalDiv);
    });

    container.appendChild(div);
  });

  if (!filtered.length) {
    container.textContent = "No se encontraron usuarios.";
  }
}

// ───────────────────────────────────────────────────
// 7) PDF de un solo intento
async function downloadResponsePDFForAttempt(uid,ev,idx) {
  const valids = allResponses
    .filter(r=>r.userId===uid && r.evaluationId===ev && r.result && typeof r.result.score==="number")
    .sort((a,b)=>a.timestamp - b.timestamp);
  if (!valids[idx]) {
    alert("Intento no encontrado.");
    return;
  }
  await createSingleAttemptPDF(uid,ev,idx+1,valids[idx]);
}

async function createSingleAttemptPDF(uid,ev,intNum, r) {
  const [uSnap,eSnap] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("evaluations").doc(ev).get()
  ]);
  const userName = uSnap.data().name;
  const qs       = eSnap.data().questions||[];

  const pdf = new jsPDF();
  let y = 10;
  pdf.setFontSize(14);
  pdf.text(`Nombre: ${userName}`,10,y);        y+=10;
  pdf.text(`Curso: ${eSnap.data().name}`,10,y); y+=10;
  pdf.text(`Intento: ${intNum}`,10,y);         y+=12;
  pdf.setFontSize(12);
  pdf.text(`Puntaje: ${r.result.score}`,10,y); y+=7;
  pdf.text(`Estado: ${r.result.grade}`,10,y);  y+=12;

  Object.entries(r.answers||{})
    .sort((a,b)=>
      +a[0].match(/\d+/)[0] - +b[0].match(/\d+/)[0]
    )
    .forEach(([k,ans])=>{
      const i   = +k.match(/\d+/)[0];
      const txt = qs[i]?.text||`Pregunta ${i+1}`;
      pdf.text(`${i+1}. ${txt}`,10,y); y+=7;
      pdf.text(`→ ${ans}`,12,y);      y+=8;
      if (y>280){pdf.addPage();y=10;}
    });

  pdf.save(`Respuestas_${userName}_${ev}_intento${intNum}.pdf`);
}

// ───────────────────────────────────────────────────
// 8) Reiniciar intentos
async function resetAttemptsForEvaluation(uid,ev) {
  if (!confirm(`¿Reiniciar intentos de ${ev}?`)) return;
  const snap = await db.collection("responses")
    .where("userId","==",uid)
    .where("evaluationId","==",ev)
    .get();
  const batch = db.batch();
  snap.docs.forEach(d=>batch.delete(d.ref));
  await batch.commit();
  alert("Intentos reiniciados.");
}

// ───────────────────────────────────────────────────
// 9) PDF de encuesta
async function downloadSurveyPDF(uid,ev) {
  const docs = allSurveys
    .filter(s=>s.userId===uid && s.evaluationId===ev)
    .sort((a,b)=>a.timestamp.toDate() - b.timestamp.toDate());
  if (!docs.length) {
    alert("Sin encuestas.");
    return;
  }
  const s     = docs[0];
  const userName = (await db.collection("users").doc(uid).get()).data().name;
  const qs       = surveyQuestionsMap[ev]||[];

  const pdf = new jsPDF();
  let y = 10;
  pdf.setFontSize(14);
  pdf.text(`Nombre: ${userName}`,10,y); y+=10;
  pdf.text(`Encuesta: ${ev}`,10,y);   y+=12;
  pdf.setFontSize(12);

  Object.entries(s.surveyData||{})
    .sort((a,b)=>+a[0].match(/\d+/)[0] - +b[0].match(/\d+/)[0])
    .forEach(([k,ans])=>{
      const i   = +k.match(/\d+/)[0];
      const txt = qs[i]?.text||`Pregunta ${i+1}`;
      pdf.text(`${i+1}. ${txt}`,10,y); y+=7;
      pdf.text(`→ ${ans}`,12,y);      y+=8;
      if (y>280){pdf.addPage();y=10;}
    });

  pdf.save(`Encuesta_${userName}_${ev}.pdf`);
}

// ───────────────────────────────────────────────────
// 10) Generar certificado (idéntica a la original, solo rename descarga)
async function generateCertificateForUser(uid, evaluationID, score, approvalDate) {
  try {
    // 1) Usuario
    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists) throw new Error("Usuario no encontrado");
    const { name: userNameDB, rut, company, customID } = userSnap.data();

    // 2) Evaluación
    const evalSnap = await db.collection("evaluations").doc(evaluationID).get();
    if (!evalSnap.exists) throw new Error("Evaluación no encontrada");
    const evalData            = evalSnap.data();
    const evaluationName      = evalData.name;
    const evaluationTime      = evalData.timeEvaluation;
    const certificateTemplate = evalData.certificateTemplate;
    const evaluationIDNumber  = evalData.ID;

    // 3) Año + ID
    const [d,m,y] = approvalDate.split("-");
    const year      = new Date(`${y}-${m}-${d}`).getFullYear();
    const certificateID = `${evaluationIDNumber}${customID}${year}`;

    // 4) Plantilla + PDFLib
    const tplBytes = await fetch(certificateTemplate).then(r=>r.arrayBuffer());
    const pdfDoc   = await PDFLib.PDFDocument.load(tplBytes);
    pdfDoc.registerFontkit(fontkit);

    // 5) Fuentes
    const monoBytes   = await fetch("fonts/MonotypeCorsiva.ttf").then(r=>r.arrayBuffer());
    const perpBytes   = await fetch("fonts/Perpetua.ttf").then(r=>r.arrayBuffer());
    const perpItBytes = await fetch("fonts/PerpetuaItalic.ttf").then(r=>r.arrayBuffer());
    const monotypeFont       = await pdfDoc.embedFont(monoBytes);
    const perpetuaFont       = await pdfDoc.embedFont(perpBytes);
    const perpetuaItalicFont = await pdfDoc.embedFont(perpItBytes);

    // 6) Página
    const page  = pdfDoc.getPages()[0];
    const { width, height } = page.getSize();

    // 7) Helper centrar
    const centerText = (txt, yPos, font, size) => {
      const wTxt = font.widthOfTextAtSize(txt, size);
      page.drawText(txt, {
        x: (width - wTxt) / 2,
        y: yPos,
        font,
        size,
        color: PDFLib.rgb(0,0,0)
      });
    };

    // 8) Wrap
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

    // 9) Pintar
    centerText(userNameDB,            height - 295, monotypeFont,       35);
    centerText(`RUT: ${rut}`,         height - 340, perpetuaItalicFont, 19);
    centerText(`Empresa: ${company}`, height - 360, perpetuaItalicFont, 19);

    const maxW2 = width - 100;
    const linesArr = wrapText(evaluationName, monotypeFont, 34, maxW2);
    let y0 = height - 448;
    for (const l of linesArr) {
      centerText(l, y0, monotypeFont, 34);
      y0 -= 40;
    }

    page.drawText(`Fecha de Aprobación: ${approvalDate}`, {
      x: 147, y: height - 548, size: 12, font: perpetuaFont, color: PDFLib.rgb(0,0,0)
    });
    page.drawText(`Duración del Curso: ${evaluationTime}`, {
      x: 157, y: height - 562, size: 12, font: perpetuaFont, color: PDFLib.rgb(0,0,0)
    });
    page.drawText(`ID: ${certificateID}`, {
      x: 184, y: height - 576, size: 12, font: perpetuaFont, color: PDFLib.rgb(0,0,0)
    });

    // 10) Descargar con filename ajustado
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
