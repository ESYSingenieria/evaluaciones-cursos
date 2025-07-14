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
// 2) Protector de ruta y redireccionamiento según rol
auth.onAuthStateChanged(async user => {
  if (!user) {
    location.href = 'index.html';
    return;
  }
  const perfil = await db.collection('users').doc(user.uid).get();
  const role   = perfil.data()?.role;
  if (role === 'admin' && !location.pathname.includes('dashboard-admin.html')) {
    location.href = 'dashboard-admin.html';
    return;
  }
  if (role !== 'admin' && location.pathname.includes('dashboard-admin.html')) {
    location.href = 'dashboard.html';
    return;
  }
  if (location.pathname.includes('dashboard-admin.html')) {
    await loadAllUsers();
  }
});
// ————————————————————————————————————————————————

// ————————————————————————————————————————————————
// 3) Carga y renderizado de usuarios “user”
async function loadAllUsers() {
  const container = document.getElementById('usersList');
  container.textContent = 'Cargando usuarios…';

  // 3.1) Solo usuarios con role == 'user'
  const usersSnap = await db.collection('users')
                            .where('role','==','user')
                            .get();
  if (usersSnap.empty) {
    container.textContent = 'No hay usuarios normales.';
    return;
  }
  container.innerHTML = '';

  // 3.2) Recorrer cada usuario
  for (const userDoc of usersSnap.docs) {
    const u = userDoc.data();
    const uid = userDoc.id;

    const userDiv = document.createElement('div');
    userDiv.className = 'user-item';
    userDiv.innerHTML = `
      <strong>${u.name}</strong><br>
      RUT: ${u.rut}<br>
      CustomID: ${u.customID}<br>
      Empresa: ${u.company}<br>
      <em>Evaluaciones asignadas:</em>
    `;

    // 3.3) Por cada curso asignado…
    for (const ev of (u.assignedEvaluations||[])) {
      const evalDiv = document.createElement('div');
      evalDiv.className = 'eval-item';
      evalDiv.innerHTML = `<strong>${ev}</strong><br>`;

      // 3.3.a) Traer T O D O S los documentos de "responses" para este usuario+curso
      const rawSnap = await db.collection('responses')
        .where('userId','==',uid)
        .where('evaluationId','==',ev)
        .get();
      // ordenar cronológicamente
      const allDocs = rawSnap.docs
        .map(d => d.data())
        .sort((a,b)=>a.timestamp.toDate() - b.timestamp.toDate());

      // 3.3.b) Filtrar solo intentos válidos: que tengan result.score y result.grade
      const validAttempts = rawSnap.docs
        .filter(d => {
          const r = d.data().result;
          return r && typeof r.score === 'number' && r.grade;
        })
        .sort((a,b)=>a.data().timestamp.toDate() - b.data().timestamp.toDate());

      // 3.3.c) Botón por CADA intento válido
      validAttempts.forEach((docSnap, i) => {
        const btn = document.createElement('button');
        btn.textContent = `Respuestas Intento ${i+1} (PDF)`;
        btn.onclick = () =>
          downloadResponsePDFForAttempt(uid, ev, i);
        evalDiv.appendChild(btn);
      });

      // 3.3.d) Reiniciar intentos
      const btnReset = document.createElement('button');
      btnReset.textContent = 'Reiniciar Intentos';
      btnReset.onclick = () =>
        resetAttemptsForEvaluation(uid, ev);
      evalDiv.appendChild(btnReset);

      // 3.3.e) Descargar encuesta (una única posible)
      const btnSurvey = document.createElement('button');
      btnSurvey.textContent = 'Encuesta de Satisfacción (PDF)';
      btnSurvey.onclick = () =>
        downloadSurveyPDF(uid, ev);
      evalDiv.appendChild(btnSurvey);

      // 3.3.g) Botón de CERTIFICADO por cada curso APROBADO
      //    buscamos en validAttempts algún objeto con grade==='Aprobado'
      const passedSnap = validAttempts.find(d => 
        d.data().result.grade === 'Aprobado'
      );
      if (passedSnap) {
        const { score } = passedSnap.data().result;
        const dateStr   = passedSnap.data().timestamp
                            .toDate()
                            .toLocaleDateString();
        const btnCert = document.createElement('button');
        btnCert.textContent = 'Descargar Certificado';
        btnCert.onclick = () =>
          generateCertificateForUser(uid, ev, score, dateStr);
        evalDiv.appendChild(btnCert);
      }

      userDiv.appendChild(evalDiv);
    }
    container.appendChild(userDiv);
  }
}
// ————————————————————————————————————————————————

// ————————————————————————————————————————————————
// 4) Funciones auxiliares

// 4.a) Descargar respuestas de un intento válido
async function downloadResponsePDFForAttempt(uid, ev, idx) {
  // Repetimos la lógica de filtro de validAttempts
  const rawSnap = await db.collection('responses')
    .where('userId','==',uid)
    .where('evaluationId','==',ev)
    .get();
  const validDocs = rawSnap.docs
    .filter(d => {
      const r = d.data().result;
      return r && typeof r.score==='number' && r.grade;
    })
    .sort((a,b)=>a.data().timestamp.toDate() - b.data().timestamp.toDate());
  if (!validDocs[idx]) {
    alert('Intento no encontrado.');
    return;
  }
  await createSingleAttemptPDF(
    uid, ev, idx+1,
    validDocs[idx].data()
  );
}

// 4.b) Crear PDF de intento (incluye puntaje y estado)
async function createSingleAttemptPDF(uid,ev,intentoNum,r) {
  const [ uSnap, eSnap ] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('evaluations').doc(ev).get()
  ]);
  const userName = uSnap.data().name;
  const qs       = eSnap.data().questions||[];

  const pdf = new jsPDF();
  let y = 10;
  pdf.setFontSize(14);
  pdf.text(`Nombre: ${userName}`,10,y); y+=10;
  pdf.text(`Curso: ${ev}`,10,y);        y+=10;
  pdf.text(`Intento: ${intentoNum}`,10,y); y+=12;
  
  // **Agregamos puntaje y grade**
  pdf.setFontSize(12);
  pdf.text(`Puntaje: ${r.result.score}`, 10, y);    y+=8;
  pdf.text(`Estado: ${r.result.grade}`, 10, y);     y+=12;
  pdf.setFontSize(12);

  Object.entries(r.answers||{})
    .sort((a,b)=> +a[0].match(/\d+/)[0] - +b[0].match(/\d+/)[0])
    .forEach(([k,ans])=>{
      const i = +k.match(/\d+/)[0];
      const txt = qs[i]?.text||`Pregunta ${i+1}`;
      pdf.text(`${i+1}. ${txt}`,10,y); y+=7;
      pdf.text(`→ ${ans}`,12,y);      y+=8;
      if (y>280){pdf.addPage(); y=10;}
    });

  pdf.save(`Respuestas_${userName}_${ev}_intento${intentoNum}.pdf`);
}

// 4.c) Reiniciar intentos
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

// 4.d) Descargar encuesta
async function downloadSurveyPDF(uid, ev) {
  const [ uSnap, sRaw, sqSnap ] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('surveys')
      .where('userId','==',uid)
      .where('evaluationId','==',ev)
      .get(),
    db.collection('surveyQuestions').doc(ev).get()
  ]);
  if (sRaw.empty) {
    alert('Sin encuestas.');
    return;
  }
  const docs = sRaw.docs
    .sort((a,b)=>a.data().timestamp.toDate() - b.data().timestamp.toDate());
  const s     = docs[0].data();
  const userName = uSnap.data().name;
  const qs       = sqSnap.data()?.questions||[];

  const pdf = new jsPDF();
  let y = 10;
  pdf.setFontSize(14);
  pdf.text(`Nombre: ${userName}`,10,y); y+=10;
  pdf.text(`Encuesta: ${ev}`,10,y);   y+=12;
  pdf.setFontSize(12);

  Object.entries(s.surveyData||{})
    .sort((a,b)=> +a[0].match(/\d+/)[0] - +b[0].match(/\d+/)[0])
    .forEach(([k,ans])=>{
      const i = +k.match(/\d+/)[0];
      const txt = qs[i]?.text||`Pregunta ${i+1}`;
      pdf.text(`${i+1}. ${txt}`,10,y); y+=7;
      pdf.text(`→ ${ans}`,12,y);      y+=8;
      if (y>280){pdf.addPage();y=10;}
    });

  pdf.save(`Encuesta_${userName}_${ev}.pdf`);
}

// 4.f) Generar certificado (tu función original adaptada)
async function generateCertificateForUser(uid, evaluationID, score, approvalDate) {
  try {
    // 1) Datos de usuario
    const uS = await db.collection('users').doc(uid).get();
    if (!uS.exists) throw new Error("Usuario no encontrado");
    const { name:userNameDB, rut, company, customID } = uS.data();

    // 2) Datos de evaluación
    const eS = await db.collection('evaluations').doc(evaluationID).get();
    if (!eS.exists) throw new Error("Evaluación no encontrada");
    const ed = eS.data();
    const tpl = ed.certificateTemplate;
    const IDnum = ed.ID;
    const [d,m,y] = approvalDate.split('-');
    const certID = `${IDnum}${customID}${new Date(`${y}-${m}-${d}`).getFullYear()}`;

    // 3) Carga plantilla y librerías
    const tplBytes = await fetch(tpl).then(r=>r.arrayBuffer());
    const pdfDoc   = await PDFLib.PDFDocument.load(tplBytes);
    pdfDoc.registerFontkit(fontkit);

    // 4) Incrustar fuentes
    const [monoB, perpB, perpItB] = await Promise.all([
      fetch("fonts/MonotypeCorsiva.ttf").then(r=>r.arrayBuffer()),
      fetch("fonts/Perpetua.ttf").then(r=>r.arrayBuffer()),
      fetch("fonts/PerpetuaItalic.ttf").then(r=>r.arrayBuffer()),
    ]);
    const monoF = await pdfDoc.embedFont(monoB);
    const perpF = await pdfDoc.embedFont(perpB);
    const itF   = await pdfDoc.embedFont(perpItB);

    // 5) Preparar y pintar
    const page = pdfDoc.getPages()[0];
    const { width, height } = page.getSize();
    const centerText = (txt, yPos, font, size) => {
      const wTxt = font.widthOfTextAtSize(txt, size);
      page.drawText(txt, {
        x: (width - wTxt)/2,
        y: yPos,
        font, size,
        color: PDFLib.rgb(0,0,0)
      });
    };
    const wrapText = (txt,font,size,maxW)=>{
      const ws=txt.split(' '), lines=[],cur='';
      for(const w of ws){
        const test = cur?`${cur} ${w}`:w;
        if(font.widthOfTextAtSize(test,size)<=maxW) cur=test;
        else{ lines.push(cur); cur=w; }
      }
      if(cur) lines.push(cur);
      return lines;
    };

    // 6) Pintado de campos
    centerText(userNameDB, height-295, monoF, 35);
    centerText(`RUT: ${rut}`, height-340, itF, 19);
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

    // 7) Exportar y disparar descarga
    const bytes = await pdfDoc.save();
    const blob  = new Blob([bytes],{type:"application/pdf"});
    const link  = document.createElement('a');
    link.href   = URL.createObjectURL(blob);
    link.download = `Certificado_${evaluationID}.pdf`;
    link.click();

  } catch(err) {
    console.error("Error generando certificado:", err);
    alert("No se pudo generar el certificado. Revisa la consola.");
  }
}
