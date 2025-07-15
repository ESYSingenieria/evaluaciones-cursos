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
const { jsPDF } = window.jspdf;  // respuestas y encuestas

// Debes incluir en tu HTML:
// <script src="https://unpkg.com/pdf-lib/dist/pdf-lib.min.js"></script>
// <script src="https://unpkg.com/fontkit"></script>

// ───────────────────────────────────────────────────
// 2) Caché y estados de filtros/orden
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
// 3) Auth & carga inicial
auth.onAuthStateChanged(async user => {
  if (!user) {
    location.href = "index.html";
    return;
  }
  const role = (await db.collection("users").doc(user.uid).get()).data()?.role;
  if (role === "admin" && !location.pathname.includes("dashboard-admin.html")) {
    location.href = "dashboard-admin.html"; return;
  }
  if (role !== "admin" && location.pathname.includes("dashboard-admin.html")) {
    location.href = "dashboard.html"; return;
  }
  if (location.pathname.includes("dashboard-admin.html")) {
    await initializeData();
    setupFiltersUI();
    loadAllUsers();
  }
});

// ───────────────────────────────────────────────────
// 4) Precarga de datos
async function initializeData() {
  // usuarios
  allUsers = (await db.collection("users").where("role", "==", "user").get())
    .docs.map(d => ({ id: d.id, ...d.data() }));

  // evaluations
  (await db.collection("evaluations").get())
    .docs.forEach(d => allEvaluations[d.id] = d.data());

  // responses
  allResponses = (await db.collection("responses").get())
    .docs.map(d => {
      const data = d.data();
      return {
        userId:       data.userId,
        evaluationId: data.evaluationId,
        timestamp:    data.timestamp?.toDate() || new Date(0),
        result:       data.result || {},
        answers:      data.answers || {}
      };
    });

  // surveys + preguntas encuesta
  allSurveys = (await db.collection("surveys").get())
    .docs.map(d => ({ id: d.id, ...d.data() }));
  (await db.collection("surveyQuestions").get())
    .docs.forEach(d => surveyQuestionsMap[d.id] = d.data().questions || []);
}

// ───────────────────────────────────────────────────
// 5) UI de filtros
function setupFiltersUI() {
  if (document.getElementById("filtersBar")) return;
  const bar = document.createElement("div");
  bar.id = "filtersBar";
  bar.style = "margin:16px 0; display:flex;gap:8px;flex-wrap:wrap;";
  bar.innerHTML = `
    <input id="f_search" placeholder="Buscar por nombre" />
    <select id="f_course"><option value="all">Todos los cursos</option></select>
    <select id="f_company"><option value="all">Todas las empresas</option></select>
    <select id="f_sort">
      <option value="dateDesc">Fecha (más recientes primero)</option>
      <option value="dateAsc">Fecha (más antiguos primero)</option>
      <option value="customIdDesc">CustomID (mayor primero)</option>
      <option value="customIdAsc">CustomID (menor primero)</option>
    </select>
  `;
  document.querySelector("h1").insertAdjacentElement("afterend", bar);

  // Agrupar cursos por nombre
  const courseSelect = bar.querySelector("#f_course");
  const nameToCodes = {};
  Object.entries(allEvaluations).forEach(([code,data]) => {
    const name = data.name || code;
    (nameToCodes[name] = nameToCodes[name]||[]).push(code);
  });
  Object.keys(nameToCodes).sort().forEach(name => {
    courseSelect.innerHTML += `<option value="${name}">${name}</option>`;
  });

  // empresas
  const companies = [...new Set(allUsers.map(u=>u.company).filter(Boolean))].sort();
  const companySelect = bar.querySelector("#f_company");
  companies.forEach(co => {
    companySelect.innerHTML += `<option value="${co}">${co}</option>`;
  });

  // listeners
  bar.querySelector("#f_search")
     .addEventListener("input", e => {
       searchName = e.target.value.toLowerCase();
       loadAllUsers();
     });
  courseSelect.addEventListener("change", e => {
    filterCourse = e.target.value;
    loadAllUsers();
  });
  companySelect.addEventListener("change", e => {
    filterCompany = e.target.value;
    loadAllUsers();
  });
  bar.querySelector("#f_sort")
     .addEventListener("change", e => {
       sortBy = e.target.value;
       loadAllUsers();
     });
}

// ───────────────────────────────────────────────────
// 6) Render de usuarios con filtros + orden
function loadAllUsers() {
  const container = document.getElementById("usersList");
  container.innerHTML = "";

  let filtered = allUsers.filter(u => {
    if (searchName && !u.name.toLowerCase().includes(searchName)) return false;
    if (filterCompany!=="all" && u.company!==filterCompany) return false;
    if (filterCourse!=="all") {
      // buscar por nombre agrupado
      if (!u.assignedEvaluations.some(ev => (allEvaluations[ev].name||ev) === filterCourse))
        return false;
    }
    return true;
  });

  // calcular última fecha válida
  filtered.forEach(u => {
    const times = allResponses
      .filter(r=>r.userId===u.id && typeof r.result?.score==="number")
      .map(r=>r.timestamp.getTime());
    u._lastTime = times.length ? Math.max(...times) : 0;
  });

  // ordenar
  filtered.sort((a,b) => {
    switch(sortBy){
      case "dateDesc":     return b._lastTime - a._lastTime;
      case "dateAsc":      return a._lastTime - b._lastTime;
      case "customIdDesc": return (+b.customID||0) - (+a.customID||0);
      case "customIdAsc":  return (+a.customID||0) - (+b.customID||0);
      default: return 0;
    }
  });

  if (!filtered.length) {
    container.textContent = "No se encontraron usuarios.";
    return;
  }

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
    u.assignedEvaluations.forEach(ev => {
      const eData = allEvaluations[ev]||{};
      const eName = eData.name || ev;
      const evalDiv = document.createElement("div");
      evalDiv.className = "eval-item";
      evalDiv.innerHTML = `<strong>${eName}</strong><br>`;

      // respuestas válidas
      const valids = allResponses
        .filter(r=>r.userId===u.id && r.evaluationId===ev && typeof r.result?.score==="number")
        .sort((a,b)=>a.timestamp - b.timestamp);

      valids.forEach((r,i) => {
        const btn = document.createElement("button");
        btn.textContent = `Respuestas Evaluación Intento ${i+1}`;
        btn.onclick = () => downloadResponsePDFForAttempt(u.id,ev,i);
        evalDiv.appendChild(btn);
      });

      const btnR = document.createElement("button");
      btnR.textContent = "Reiniciar Intentos";
      btnR.onclick = () => resetAttemptsForEvaluation(u.id,ev);
      evalDiv.appendChild(btnR);

      const btnS = document.createElement("button");
      btnS.textContent = "Encuesta de Satisfacción";
      btnS.onclick = () => downloadSurveyPDF(u.id,ev);
      evalDiv.appendChild(btnS);

      const passed = valids.find(r=>r.result.grade==="Aprobado");
      if (passed) {
        const btnC = document.createElement("button");
        btnC.textContent = "Certificado de Aprobación";
        btnC.onclick = () =>
          generateCertificateForUser(u.id,ev,passed.result.score, passed.timestamp.toLocaleDateString());
        evalDiv.appendChild(btnC);
      }

      div.appendChild(evalDiv);
    });
    container.appendChild(div);
  });
}

// ───────────────────────────────────────────────────
// 7) PDF de un solo intento (wrap + limpieza de "!'" )
async function downloadResponsePDFForAttempt(uid,ev,idx) {
  const valids = allResponses
    .filter(r=>r.userId===uid && r.evaluationId===ev && typeof r.result?.score==="number")
    .sort((a,b)=>a.timestamp - b.timestamp);
  if (!valids[idx]) { alert("Intento no encontrado."); return; }
  await createSingleAttemptPDF(uid,ev,idx+1,valids[idx]);
}
async function createSingleAttemptPDF(uid,ev,intNum,r) {
  const [uSnap,eSnap] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("evaluations").doc(ev).get()
  ]);
  const userName = uSnap.data().name;
  const qs       = eSnap.data().questions || [];

  const pdf = new jsPDF();
  let y = 10;
  pdf.setFontSize(14);
  pdf.text(`Nombre: ${userName}`,10,y);        y+=10;
  pdf.text(`Curso: ${eSnap.data().name}`,10,y); y+=10;
  pdf.text(`Intento: ${intNum}`,10,y);         y+=12;
  pdf.text(`Puntaje: ${r.result.score}`,10,y); y+=7;
  pdf.text(`Estado: ${r.result.grade}`,10,y);  y+=12;

  const maxWidth   = 180;
  const lineHeight = 7;
  const bottomY    = 280;

  Object.entries(r.answers||{})
    .sort((a,b)=>+a[0].match(/\d+/)[0] - +b[0].match(/\d+/)[0])
    .forEach(([k,ans])=>{
      const i  = +k.match(/\d+/)[0];
      const q  = qs[i]?.text || `Pregunta ${i+1}`;
      const cl = String(ans).replace(/^[!'’\s]+/, "");
      pdf.splitTextToSize(`${i+1}. ${q}`, maxWidth)
         .forEach(line => {
           pdf.text(line,10,y); y+=lineHeight;
           if (y>bottomY){ pdf.addPage(); y=10; }
         });
      pdf.splitTextToSize(`→ ${cl}`, maxWidth)
         .forEach(line => {
           pdf.text(line,12,y); y+=lineHeight;
           if (y>bottomY){ pdf.addPage(); y=10; }
         });
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
// 9) PDF de encuesta (idem wrap + limpieza)
async function downloadSurveyPDF(uid,ev) {
  const docs = allSurveys
    .filter(s=>s.userId===uid && s.evaluationId===ev)
    .sort((a,b)=>a.timestamp.toDate() - b.timestamp.toDate());
  if (!docs.length) { alert("Sin encuestas."); return; }
  const s        = docs[0];
  const userName = (await db.collection("users").doc(uid).get()).data().name;
  const qs       = surveyQuestionsMap[ev] || surveyQuestionsMap["defaultSurvey"] || [];

  const pdf = new jsPDF();
  let y = 10;
  pdf.setFontSize(14);
  pdf.text(`Nombre: ${userName}`,10,y); y+=10;
  pdf.text(`Encuesta: ${allEvaluations[ev]?.name||ev}`,10,y); y+=12;
  pdf.setFontSize(12);

  const maxWidth   = 180;
  const lineHeight = 7;
  const bottomY    = 280;

  Object.entries(s.surveyData||{})
    .sort((a,b)=>+a[0].match(/\d+/)[0] - +b[0].match(/\d+/)[0])
    .forEach(([k,ans])=>{
      const i  = +k.match(/\d+/)[0];
      const q  = qs[i]?.text || `Pregunta ${i+1}`;
      const cl = String(ans).replace(/^[!'’\s]+/, "");
      pdf.splitTextToSize(`${i+1}. ${q}`, maxWidth)
         .forEach(line => {
           pdf.text(line,10,y); y+=lineHeight;
           if (y>bottomY){ pdf.addPage(); y=10; }
         });
      pdf.splitTextToSize(`→ ${cl}`, maxWidth)
         .forEach(line => {
           pdf.text(line,12,y); y+=lineHeight;
           if (y>bottomY){ pdf.addPage(); y=10; }
         });
    });

  pdf.save(`Encuesta_${userName}_${ev}.pdf`);
}

// ───────────────────────────────────────────────────
// 10) Generar certificado (igual al original)
async function generateCertificateForUser(uid, evaluationID, score, approvalDate) {
  try {
    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists) throw new Error("Usuario no encontrado");
    const { name: userNameDB, rut, company, customID } = userSnap.data();

    const evalSnap = await db.collection("evaluations").doc(evaluationID).get();
    if (!evalSnap.exists) throw new Error("Evaluación no encontrada");
    const evalData            = evalSnap.data();
    const evaluationName      = evalData.name;
    const evaluationTime      = evalData.timeEvaluation;
    const certificateTemplate = evalData.certificateTemplate;
    const evaluationIDNumber  = evalData.ID;

    const [d,m,y]  = approvalDate.split('-');
    const year     = new Date(`${y}-${m}-${d}`).getFullYear();
    const certID   = `${evaluationIDNumber}${customID}${year}`;

    const tplBytes = await fetch(certificateTemplate).then(r=>r.arrayBuffer());
    const pdfDoc   = await PDFLib.PDFDocument.load(tplBytes);
    pdfDoc.registerFontkit(fontkit);

    const monoBytes   = await fetch("fonts/MonotypeCorsiva.ttf").then(r=>r.arrayBuffer());
    const perpBytes   = await fetch("fonts/Perpetua.ttf").then(r=>r.arrayBuffer());
    const perpItBytes = await fetch("fonts/PerpetuaItalic.ttf").then(r=>r.arrayBuffer());

    const monoFont = await pdfDoc.embedFont(monoBytes);
    const perpFont = await pdfDoc.embedFont(perpBytes);
    const perpIt   = await pdfDoc.embedFont(perpItBytes);

    const page = pdfDoc.getPages()[0];
    const { width, height } = page.getSize();

    const centerText = (txt, yPos, font, size) => {
      const wtxt = font.widthOfTextAtSize(txt, size);
      page.drawText(txt, { x:(width-wtxt)/2, y:yPos, font, size, color:PDFLib.rgb(0,0,0) });
    };

    const wrapText = (txt, font, size, maxW) => {
      const words = txt.split(' ');
      const lines = []; let line = '';
      for (const w of words) {
        const test = line? line+' '+w : w;
        if (font.widthOfTextAtSize(test, size) <= maxW) line = test;
        else { lines.push(line); line = w; }
      }
      if (line) lines.push(line);
      return lines;
    };

    centerText(userNameDB,      height-295, monoFont, 35);
    centerText(`RUT: ${rut}`,   height-340, perpIt,   19);
    centerText(`Empresa: ${company}`, height-360, perpIt, 19);

    const maxW = width - 100;
    let y0 = height - 448;
    for (const l of wrapText(evaluationName, monoFont,34, maxW)) {
      centerText(l, y0, monoFont, 34);
      y0 -= 40;
    }

    page.drawText(`Fecha de Aprobación: ${approvalDate}`, {
      x:147, y:height-548, size:12, font:perpFont, color:PDFLib.rgb(0,0,0)
    });
    page.drawText(`Duración del Curso: ${evaluationTime}`, {
      x:157, y:height-562, size:12, font:perpFont, color:PDFLib.rgb(0,0,0)
    });
    page.drawText(`ID: ${certID}`, {
      x:184, y:height-576, size:12, font:perpFont, color:PDFLib.rgb(0,0,0)
    });

    const pdfBytes = await pdfDoc.save();
    const blob     = new Blob([pdfBytes], { type:"application/pdf" });
    const link     = document.createElement("a");
    link.href      = URL.createObjectURL(blob);
    link.download  = `Certificado ${evaluationName} - ${userNameDB}.pdf`;
    link.click();
  } catch(error) {
    console.error("Error generando certificado:", error);
    alert("No se pudo generar el certificado. Revisa la consola.");
  }
}
