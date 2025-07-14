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
// 2) Estados globales de filtro/orden
let searchName    = "";
let filterCourse  = "all";
let filterCompany = "all";
let sortBy        = "dateDesc"; // dateDesc | dateAsc | customIdDesc | customIdAsc

// ───────────────────────────────────────────────────
// 3) Proteger la ruta y, si es admin, cargar filtros + usuarios
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
    await setupFiltersUI();
    await loadAllUsers();
  }
});

// ───────────────────────────────────────────────────
// 4) Insertar la barra de filtros debajo del <h1>
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

  // 4.a) Poblar cursos
  const evSnap = await db.collection("evaluations").get();
  for (const doc of evSnap.docs) {
    const code = doc.id;
    const name = doc.data().name || code;
    bar.querySelector("#f_course")
       .innerHTML += `<option value="${code}">${name}</option>`;
  }

  // 4.b) Poblar empresas
  const usersSnap = await db.collection("users").where("role","==","user").get();
  const companies = new Set(usersSnap.docs.map(d=>d.data().company).filter(Boolean));
  for (const co of companies) {
    bar.querySelector("#f_company")
       .innerHTML += `<option value="${co}">${co}</option>`;
  }

  // 4.c) Listeners
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
// 5) Cargar & renderizar usuarios según filtros/orden
async function loadAllUsers() {
  const container = document.getElementById("usersList");
  container.textContent = "Cargando usuarios…";

  // 5.a) Traer todos los user normales
  const usersSnap = await db.collection("users")
                            .where("role","==","user")
                            .get();
  const users = [];
  for (const doc of usersSnap.docs) {
    const u = { id: doc.id, ...doc.data() };
    const rSnap = await db.collection("responses")
                          .where("userId","==",u.id)
                          .get();
    const times = rSnap.docs.map(d=>d.data().timestamp?.toDate()?.getTime()||0);
    u._lastTime = times.length ? Math.max(...times) : 0;
    users.push(u);
  }
  if (!users.length) {
    container.textContent = "No hay usuarios normales.";
    return;
  }

  // 5.b) FILTRAR
  let filtered = users.filter(u=>{
    const okName = !searchName || u.name.toLowerCase().includes(searchName);
    const okCo   = filterCompany==="all" || u.company===filterCompany;
    const okCu   = filterCourse==="all"
      || (u.assignedEvaluations||[]).includes(filterCourse);
    return okName && okCo && okCu;
  });

  // 5.c) ORDENAR
  filtered.sort((a,b)=>{
    if (sortBy==="dateDesc")     return b._lastTime - a._lastTime;
    if (sortBy==="dateAsc")      return a._lastTime - b._lastTime;
    const ca = +a.customID||0, cb = +b.customID||0;
    if (sortBy==="customIdDesc") return cb - ca;
    if (sortBy==="customIdAsc")  return ca - cb;
    return 0;
  });

  // 5.d) Render
  container.innerHTML = "";
  for (const u of filtered) {
    const userDiv = document.createElement("div");
    userDiv.className = "user-item";
    userDiv.innerHTML = `
      <strong>${u.name}</strong><br>
      RUT: ${u.rut}<br>
      CustomID: ${u.customID}<br>
      Empresa: ${u.company}<br>
      <em>Evaluaciones asignadas:</em>
    `;

    for (const ev of u.assignedEvaluations||[]) {
      const eDoc = await db.collection("evaluations").doc(ev).get();
      const eName = eDoc.exists ? eDoc.data().name : ev;

      const evalDiv = document.createElement("div");
      evalDiv.className = "eval-item";
      evalDiv.innerHTML = `<strong>${eName}</strong><br>`;

      const rSnap = await db.collection("responses")
        .where("userId","==",u.id)
        .where("evaluationId","==",ev)
        .get();
      const valids = rSnap.docs
        .filter(d=>{
          const r = d.data().result;
          return r && typeof r.score==="number" && r.grade;
        })
        .sort((a,b)=>
          a.data().timestamp.toDate() - b.data().timestamp.toDate()
        );

      valids.forEach((d,i)=>{
        const btn = document.createElement("button");
        btn.textContent = `Respuestas Evaluación Intento ${i+1}`;
        btn.onclick = ()=>downloadResponsePDFForAttempt(u.id,ev,i);
        evalDiv.appendChild(btn);
      });

      const btnR = document.createElement("button");
      btnR.textContent = "Reiniciar Intentos";
      btnR.onclick = ()=>resetAttemptsForEvaluation(u.id,ev);
      evalDiv.appendChild(btnR);

      const btnS = document.createElement("button");
      btnS.textContent = "Encuesta de Satisfacción";
      btnS.onclick = ()=>downloadSurveyPDF(u.id,ev);
      evalDiv.appendChild(btnS);

      const passed = valids.find(d=>d.data().result.grade==="Aprobado");
      if (passed) {
        const { score } = passed.data().result;
        const dateStr   = passed.data().timestamp.toDate().toLocaleDateString();
        const btnC = document.createElement("button");
        btnC.textContent = "Certificado de Aprobación";
        btnC.onclick = ()=>generateCertificateForUser(u.id, ev, score, dateStr);
        evalDiv.appendChild(btnC);
      }

      userDiv.appendChild(evalDiv);
    }

    container.appendChild(userDiv);
  }
}

// ───────────────────────────────────────────────────
// 6) PDF de un solo intento
async function downloadResponsePDFForAttempt(uid,ev,idx) {
  const rSnap = await db.collection("responses")
    .where("userId","==",uid)
    .where("evaluationId","==",ev)
    .get();
  const valids = rSnap.docs
    .filter(d=>{
      const r=d.data().result;
      return r && typeof r.score==="number" && r.grade;
    })
    .sort((a,b)=>
      a.data().timestamp.toDate() - b.data().timestamp.toDate()
    );
  if (!valids[idx]) return alert("Intento no encontrado.");
  await createSingleAttemptPDF(uid,ev,idx+1,valids[idx].data());
}

async function createSingleAttemptPDF(uid,ev,intNum,r) {
  const [uSnap,eSnap] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("evaluations").doc(ev).get()
  ]);
  const userName = uSnap.data().name;
  const qs       = eSnap.data().questions||[];

  const pdf = new jsPDF();
  let y=10;
  pdf.setFontSize(14);
  pdf.text(`Nombre: ${userName}`,10,y);       y+=10;
  pdf.text(`Curso: ${eSnap.data().name}`,10,y);y+=10;
  pdf.text(`Intento: ${intNum}`,10,y);        y+=12;
  pdf.setFontSize(12);
  pdf.text(`Puntaje: ${r.result.score}`,10,y);y+=7;
  pdf.text(`Estado: ${r.result.grade}`,10,y); y+=12;

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
// 7) Reiniciar intentos
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
// 8) Descargar encuesta en PDF
async function downloadSurveyPDF(uid,ev) {
  const [uSnap,sRaw,sqSnap] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("surveys")
      .where("userId","==",uid)
      .where("evaluationId","==",ev)
      .get(),
    db.collection("surveyQuestions").doc(ev).get()
  ]);
  if (sRaw.empty) return alert("Sin encuestas.");
  const docs = sRaw.docs.sort((a,b)=>
    a.data().timestamp.toDate()-b.data().timestamp.toDate()
  );
  const s     = docs[0].data();
  const userName = uSnap.data().name;
  const qs       = sqSnap.data()?.questions||[];

  const pdf = new jsPDF();
  let y = 10;
  pdf.setFontSize(14);
  pdf.text(`Nombre: ${userName}`,10,y); y+=10;
  pdf.text(`Encuesta: ${sqSnap.data().evaluationId}`,10,y); y+=12;
  pdf.setFontSize(12);

  Object.entries(s.surveyData||{})
    .sort((a,b)=>+a[0].match(/\d+/)[0]-+b[0].match(/\d+/)[0])
    .forEach(([k,ans])=>{
      const i = +k.match(/\d+/)[0];
      const txt = qs[i]?.text||`Pregunta ${i+1}`;
      pdf.text(`${i+1}. ${txt}`,10,y); y+=7;
      pdf.text(`→ ${ans}`,12,y);      y+=8;
      if (y>280){pdf.addPage();y=10;}
    });

  pdf.save(`Encuesta_${userName}_${ev}.pdf`);
}

// ───────────────────────────────────────────────────
// 9) Generar certificado (función original + solo renombrado)
async function generateCertificateForUser(uid, evaluationID, score, approvalDate) {
  try {
    // 1) Leer datos del usuario
    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists) throw new Error("Usuario no encontrado");
    const { name: userNameDB, rut, company, customID } = userSnap.data();

    // 2) Leer datos de la evaluación
    const evalSnap = await db.collection("evaluations").doc(evaluationID).get();
    if (!evalSnap.exists) throw new Error("Evaluación no encontrada");
    const evalData           = evalSnap.data();
    const evaluationName     = evalData.name;
    const evaluationTime     = evalData.timeEvaluation;
    const certificateTemplate= evalData.certificateTemplate;
    const evaluationIDNumber = evalData.ID;

    // 3) Calcular año e ID dinámico
    const [d, m, y] = approvalDate.split("-");
    const year       = new Date(`${y}-${m}-${d}`).getFullYear();
    const certificateID = `${evaluationIDNumber}${customID}${year}`;

    // 4) Cargar plantilla base
    const tplBytes = await fetch(certificateTemplate).then(r=>r.arrayBuffer());
    const pdfDoc   = await PDFLib.PDFDocument.load(tplBytes);
    pdfDoc.registerFontkit(fontkit);

    // 5) Cargar e incrustar fuentes
    const monoBytes   = await fetch("fonts/MonotypeCorsiva.ttf").then(r=>r.arrayBuffer());
    const perpBytes   = await fetch("fonts/Perpetua.ttf").then(r=>r.arrayBuffer());
    const perpItBytes = await fetch("fonts/PerpetuaItalic.ttf").then(r=>r.arrayBuffer());
    const monotypeFont       = await pdfDoc.embedFont(monoBytes);
    const perpetuaFont       = await pdfDoc.embedFont(perpBytes);
    const perpetuaItalicFont = await pdfDoc.embedFont(perpItBytes);

    // 6) Preparar página
    const page  = pdfDoc.getPages()[0];
    const { width, height } = page.getSize();

    // 7) Centrar texto
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

    // 8) Wrap de líneas
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

    // 9) Pintar campos
    centerText(userNameDB,            height - 295, monotypeFont,       35);
    centerText(`RUT: ${rut}`,         height - 340, perpetuaItalicFont, 19);
    centerText(`Empresa: ${company}`, height - 360, perpetuaItalicFont, 19);

    const maxW2 = width - 100;
    const lines = wrapText(evaluationName, monotypeFont, 34, maxW2);
    let y0 = height - 448;
    for (const l of lines) {
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

    // 10) Descargar con nombre “Certificado Curso - Persona”
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
