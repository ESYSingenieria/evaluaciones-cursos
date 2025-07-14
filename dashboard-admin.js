// public/dashboard-admin.js

// ————————————————————————————————————————————————
// 1) Inicialización de Firebase (idéntica a tu app original)
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
// ————————————————————————————————————————————————

// ————————————————————————————————————————————————
// 2) Preparamos los controles de filtro/búsqueda/orden
let searchInput, filterCourseSelect, sortSelect;
function setupControls() {
  const ctrlHTML = `
    <div style="margin-bottom:1em;">
      <input type="text" id="searchName" placeholder="Buscar por nombre">
      <select id="filterCourse"><option value="all">Todos los cursos</option></select>
      <select id="sortOption">
        <option value="time_desc">Fecha (más recientes primero)</option>
        <option value="time_asc">Fecha (más antiguas primero)</option>
        <option value="name_asc">Nombre A→Z</option>
        <option value="name_desc">Nombre Z→A</option>
      </select>
    </div>
    <div id="usersList">Cargando usuarios…</div>
  `;
  document.body.innerHTML = ctrlHTML + document.body.innerHTML;
  searchInput         = document.getElementById('searchName');
  filterCourseSelect  = document.getElementById('filterCourse');
  sortSelect          = document.getElementById('sortOption');
  [searchInput, filterCourseSelect, sortSelect]
    .forEach(el => el.addEventListener('input', loadAllUsers));
}
// ————————————————————————————————————————————————

// ————————————————————————————————————————————————
// 3) Protector de ruta y redireccionamiento según rol
auth.onAuthStateChanged(async user => {
  if (!user) {
    location.href = 'index.html';
    return;
  }
  const perfil = await db.collection('users').doc(user.uid).get();
  const role   = perfil.data()?.role;
  if (role === 'admin'
      && !location.pathname.includes('dashboard-admin.html')) {
    location.href = 'dashboard-admin.html';
    return;
  }
  if (role !== 'admin'
      && location.pathname.includes('dashboard-admin.html')) {
    location.href = 'dashboard.html';
    return;
  }
  if (location.pathname.includes('dashboard-admin.html')) {
    setupControls();
    await loadAllUsers();
  }
});
// ————————————————————————————————————————————————

// ————————————————————————————————————————————————
// 4) Carga, filtrado, orden y renderizado de usuarios “user”
async function loadAllUsers() {
  const container = document.getElementById('usersList');
  container.textContent = 'Cargando usuarios…';

  // 4.1) Traer solo usuarios normales
  const usersSnap = await db.collection('users')
                            .where('role','==','user')
                            .get();
  if (usersSnap.empty) {
    container.textContent = 'No hay usuarios normales.';
    return;
  }

  // 4.2) Reunir datos + último timestamp de respuesta
  const users = [];
  for (const doc of usersSnap.docs) {
    const u   = doc.data();
    const uid = doc.id;
    // hallar último timestamp de any response
    const respSnap = await db.collection('responses')
      .where('userId','==',uid).get();
    let lastTS = null;
    respSnap.docs.forEach(d => {
      const t = d.data().timestamp?.toDate();
      if (t && (!lastTS || t > lastTS)) lastTS = t;
    });
    users.push({ uid, data: u, lastTS });
  }

  // 4.3) Poblar opciones de filtro de curso
  const allCodes = new Set();
  users.forEach(uObj =>
    (uObj.data.assignedEvaluations||[])
      .forEach(ev => allCodes.add(ev))
  );
  filterCourseSelect.innerHTML =
    `<option value="all">Todos los cursos</option>` +
    Array.from(allCodes)
      .map(ev => `<option value="${ev}">${ev}</option>`)
      .join('');

  // 4.4) Filtrar por nombre y curso
  let filtered = users;
  const nameTerm = searchInput.value.trim().toLowerCase();
  if (nameTerm) {
    filtered = filtered.filter(uObj =>
      uObj.data.name.toLowerCase().includes(nameTerm)
    );
  }
  const fc = filterCourseSelect.value;
  if (fc !== 'all') {
    filtered = filtered.filter(uObj =>
      (uObj.data.assignedEvaluations||[]).includes(fc)
    );
  }

  // 4.5) Ordenar según sortSelect
  const sortVal = sortSelect.value;
  if (sortVal === 'time_desc') {
    filtered.sort((a,b)=>(b.lastTS||0)-(a.lastTS||0));
  } else if (sortVal === 'time_asc') {
    filtered.sort((a,b)=>(a.lastTS||0)-(b.lastTS||0));
  } else if (sortVal === 'name_asc') {
    filtered.sort((a,b)=>a.data.name.localeCompare(b.data.name));
  } else if (sortVal === 'name_desc') {
    filtered.sort((a,b)=>b.data.name.localeCompare(a.data.name));
  }

  // 4.6) Renderizar
  container.innerHTML = '';
  for (const { uid, data:u } of filtered) {
    const userDiv = document.createElement('div');
    userDiv.className = 'user-item';
    userDiv.innerHTML = `
      <strong>${u.name}</strong><br>
      RUT: ${u.rut}<br>
      CustomID: ${u.customID}<br>
      Empresa: ${u.company}<br>
      <em>Evaluaciones asignadas:</em>
    `;

    // Por cada curso asignado
    for (const ev of (u.assignedEvaluations||[])) {
      // obtener nombre del curso desde Firestore
      const eSnap = await db.collection('evaluations').doc(ev).get();
      const courseName = eSnap.exists
        ? eSnap.data().name
        : ev;

      const evalDiv = document.createElement('div');
      evalDiv.className = 'eval-item';
      evalDiv.innerHTML = `<strong>${courseName}</strong><br>`;

      // 4.6.a) Intentos válidos
      const rawSnap = await db.collection('responses')
        .where('userId','==',uid)
        .where('evaluationId','==',ev)
        .get();
      const validAttempts = rawSnap.docs
        .filter(d=>{
          const r = d.data().result;
          return r && typeof r.score==='number' && r.grade;
        })
        .sort((a,b)=>
          a.data().timestamp.toDate() - b.data().timestamp.toDate()
        );

      // botones de cada intento
      validAttempts.forEach((d,i)=>{
        const btn = document.createElement('button');
        btn.textContent = `Respuestas Evaluación Intento ${i+1}`;
        btn.onclick = ()=>downloadResponsePDFForAttempt(uid,ev,i);
        evalDiv.appendChild(btn);
      });

      // Reiniciar intentos
      const btnReset = document.createElement('button');
      btnReset.textContent = 'Reiniciar Intentos';
      btnReset.onclick = ()=>resetAttemptsForEvaluation(uid,ev);
      evalDiv.appendChild(btnReset);

      // Descargar encuesta
      const btnSurvey = document.createElement('button');
      btnSurvey.textContent = 'Encuesta de Satisfacción';
      btnSurvey.onclick = ()=>downloadSurveyPDF(uid,ev);
      evalDiv.appendChild(btnSurvey);

      // Certificado si aprobó
      const passed = validAttempts.find(d=>d.data().result.grade==='Aprobado');
      if (passed) {
        const { score } = passed.data().result;
        const dateStr   = passed.data().timestamp
                            .toDate()
                            .toLocaleDateString();
        const btnCert = document.createElement('button');
        btnCert.textContent = 'Certificado de Aprobación';
        btnCert.onclick = ()=>{
          generateCertificateForUser(uid,ev,score,dateStr,courseName,u.name);
        };
        evalDiv.appendChild(btnCert);
      }

      userDiv.appendChild(evalDiv);
    }

    container.appendChild(userDiv);
  }
}
// ————————————————————————————————————————————————

// ————————————————————————————————————————————————
// 5) Funciones auxiliares

// 5.a) Respuestas de un intento → PDF (ahora con score+estado)
async function downloadResponsePDFForAttempt(uid,ev,idx) {
  const raw = await db.collection('responses')
    .where('userId','==',uid)
    .where('evaluationId','==',ev)
    .get();
  const docs = raw.docs
    .filter(d => {
      const r = d.data().result;
      return r && typeof r.score==='number' && r.grade;
    })
    .sort((a,b)=>a.data().timestamp.toDate() - b.data().timestamp.toDate());
  if (!docs[idx]) {
    return alert('Intento no encontrado.');
  }
  await createSingleAttemptPDF(uid,ev,idx+1,docs[idx].data());
}

async function createSingleAttemptPDF(uid,ev,intentoNum,r) {
  const [uSnap,eSnap] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('evaluations').doc(ev).get()
  ]);
  const userName  = uSnap.data().name;
  const questions = eSnap.data().questions||[];

  const pdf = new jsPDF();
  let y = 10;
  pdf.setFontSize(14);
  pdf.text(`Nombre: ${userName}`, 10, y); y+=10;
  pdf.text(`Curso: ${ev}`,        10, y); y+=10;
  pdf.text(`Intento: ${intentoNum}`,10,y); y+=12;
  pdf.setFontSize(12);
  pdf.text(`Puntaje: ${r.result.score}`,10,y); y+=8;
  pdf.text(`Resultado: ${r.result.grade}`,10,y); y+=12;

  Object.entries(r.answers||{})
    .sort((a,b)=>+a[0].match(/\d+/)[0] - +b[0].match(/\d+/)[0])
    .forEach(([k,ans])=>{
      const i = +k.match(/\d+/)[0];
      const txt = questions[i]?.text||`Pregunta ${i+1}`;
      pdf.text(`${i+1}. ${txt}`,10,y); y+=7;
      pdf.text(`→ ${ans}`,12,y);      y+=8;
      if (y>280){ pdf.addPage(); y=10; }
    });

  pdf.save(`Respuestas_${userName}_${ev}_intento${intentoNum}.pdf`);
}

// 5.b) Reiniciar intentos
async function resetAttemptsForEvaluation(uid,ev) {
  if (!confirm(`¿Reiniciar intentos de ${ev}?`)) return;
  const snap = await db.collection('responses')
    .where('userId','==',uid)
    .where('evaluationId','==',ev)
    .get();
  const batch = db.batch();
  snap.docs.forEach(d=>batch.delete(d.ref));
  await batch.commit();
  alert('Intentos reiniciados.');
}

// 5.c) Encuesta → PDF con preguntas desde surveyQuestions (o default)
async function downloadSurveyPDF(uid,ev) {
  const [ uSnap, sSnap ] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('surveys')
      .where('userId','==',uid)
      .where('evaluationId','==',ev)
      .get()
  ]);
  if (sSnap.empty) {
    return alert('Sin encuestas.');
  }
  // elegimos la más reciente
  const surveyDoc = sSnap.docs
    .sort((a,b)=>a.data().timestamp.toDate() - b.data().timestamp.toDate())
    .pop();
  const surveyData = surveyDoc.data().surveyData || {};

  // obtener preguntas
  let sqSnap = await db.collection('surveyQuestions').doc(ev).get();
  if (!sqSnap.exists) {
    sqSnap = await db.collection('surveyQuestions').doc('defaultSurvey').get();
  }
  const questions = sqSnap.data()?.questions || {};

  const userName = uSnap.data().name;
  const pdf = new jsPDF();
  let y = 10;
  pdf.setFontSize(14);
  pdf.text(`Nombre: ${userName}`,10,y); y+=10;
  pdf.text(`Encuesta: ${ev}`,10,y);   y+=12;
  pdf.setFontSize(12);

  // iterar surveyData
  Object.entries(surveyData)
    .sort((a,b)=>+a[0].match(/\d+/)[0] - +b[0].match(/\d+/)[0])
    .forEach(([k,ans])=>{
      const i = +k.match(/\d+/)[0];
      const txt = questions[i]?.text||`Pregunta ${i+1}`;
      pdf.text(`${i+1}. ${txt}`,10,y); y+=7;
      pdf.text(`→ ${ans}`,12,y);      y+=8;
      if (y>280){ pdf.addPage(); y=10; }
    });

  pdf.save(`Encuesta_${userName}_${ev}.pdf`);
}

// 5.e) Generar certificado adaptado: nombre de archivo más descriptivo
async function generateCertificateForUser(
  uid, evaluationID, score, approvalDate, courseName, userName
) {
  try {
    // 1) Datos de usuario
    const uS = await db.collection('users').doc(uid).get();
    if (!uS.exists) throw new Error("Usuario no encontrado");
    const { rut, company, customID } = uS.data();

    // 2) Datos de evaluación
    const eS = await db.collection('evaluations').doc(evaluationID).get();
    if (!eS.exists) throw new Error("Evaluación no encontrada");
    const ed = eS.data();
    const tpl = ed.certificateTemplate;
    const IDnum = ed.ID;
    const [d,m,y] = approvalDate.split('-');
    const certID = `${IDnum}${customID}${new Date(`${y}-${m}-${d}`).getFullYear()}`;

    // 3) Carga plantilla + PDFLib
    const tplBytes = await fetch(tpl).then(r=>r.arrayBuffer());
    const pdfDoc   = await PDFLib.PDFDocument.load(tplBytes);
    pdfDoc.registerFontkit(fontkit);

    // 4) Fuentes
    const [monoB, perpB, perpItB] = await Promise.all([
      fetch("fonts/MonotypeCorsiva.ttf").then(r=>r.arrayBuffer()),
      fetch("fonts/Perpetua.ttf").then(r=>r.arrayBuffer()),
      fetch("fonts/PerpetuaItalic.ttf").then(r=>r.arrayBuffer()),
    ]);
    const monoF = await pdfDoc.embedFont(monoB);
    const perpF = await pdfDoc.embedFont(perpB);
    const itF   = await pdfDoc.embedFont(perpItB);

    // 5) Pintar
    const page = pdfDoc.getPages()[0];
    const { width, height } = page.getSize();
    const centerText = (txt,yPos,font,size)=>{
      const w=font.widthOfTextAtSize(txt,size);
      page.drawText(txt,{x:(width-w)/2,y:yPos,font,size,color:PDFLib.rgb(0,0,0)});
    };
    const wrapText = (txt,font,size,maxW)=>{/*...igual que antes...*/};

    centerText(userName,        height-295, monoF, 35);
    centerText(`RUT: ${rut}`,   height-340, itF,   19);
    centerText(`Empresa: ${company}`, height-360, itF, 19);
    const lines = wrapText(ed.name, monoF, 34, width-100);
    let y0 = height-448;
    for (const l of lines) {
      centerText(l, y0, monoF, 34);
      y0 -= 40;
    }
    page.drawText(`Fecha de Aprobación: ${approvalDate}`, {
      x:147, y:height-548, size:12, font:perpF, color:PDFLib.rgb(0,0,0)
    });
    page.drawText(`Duración del Curso: ${ed.timeEvaluation}`, {
      x:157, y:height-562, size:12, font:perpF, color:PDFLib.rgb(0,0,0)
    });
    page.drawText(`ID: ${certID}`, {
      x:184, y:height-576, size:12, font:perpF, color:PDFLib.rgb(0,0,0)
    });

    // 6) Descargar con nombre descriptivo
    const pdfBytes = await pdfDoc.save();
    const blob     = new Blob([pdfBytes],{type:"application/pdf"});
    const link     = document.createElement('a');
    link.href      = URL.createObjectURL(blob);
    link.download  = `Certificado Curso "${courseName}" - ${userName}.pdf`;
    link.click();

  } catch(err) {
    console.error("Error generando certificado:",err);
    alert("No se pudo generar el certificado. Revisa la consola.");
  }
}
