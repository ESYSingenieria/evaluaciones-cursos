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

// Extraemos jsPDF
const { jsPDF } = window.jspdf;

// 2) Protector de ruta y redirección según rol
auth.onAuthStateChanged(async user => {
  if (!user) return location.href = 'index.html';
  const perfil = await db.collection('users').doc(user.uid).get();
  const role   = perfil.data()?.role;
  if (role === 'admin' && !location.pathname.includes('dashboard-admin.html')) {
    return location.href = 'dashboard-admin.html';
  }
  if (role !== 'admin' && location.pathname.includes('dashboard-admin.html')) {
    return location.href = 'dashboard.html';
  }
  if (location.pathname.includes('dashboard-admin.html')) {
    loadAllUsers();
  }
});

// 3) Listar usuarios “user” y sus cursos/intentos
async function loadAllUsers() {
  const container = document.getElementById('usersList');
  container.textContent = 'Cargando usuarios…';

  const usersSnap = await db.collection('users').where('role','==','user').get();
  if (usersSnap.empty) {
    container.textContent = 'No hay usuarios normales.';
    return;
  }
  container.innerHTML = '';

  for (const userDoc of usersSnap.docs) {
    const u   = userDoc.data();
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

    for (const ev of (u.assignedEvaluations||[])) {
      const evalDiv = document.createElement('div');
      evalDiv.className = 'eval-item';
      evalDiv.innerHTML = `<strong>${ev}</strong><br>`;

      // 3.1) Traer intentos y ordenarlos localmente
      const raw = await db.collection('responses')
        .where('userId','==',uid)
        .where('evaluationId','==',ev)
        .get();
      const respDocs = raw.docs.sort((a,b)=>
        a.data().timestamp.toDate() - b.data().timestamp.toDate()
      );

      // 3.2) Botón por intento de respuesta
      respDocs.forEach((d,i) => {
        const btn = document.createElement('button');
        btn.textContent = `Desc. respuestas intento ${i+1} (PDF)`;
        btn.onclick = () => downloadResponsePDFForAttempt(uid,ev,i);
        evalDiv.appendChild(btn);
      });

      // 3.3) Reiniciar intentos
      const btnReset = document.createElement('button');
      btnReset.textContent = 'Reiniciar intentos';
      btnReset.onclick = () => resetAttemptsForEvaluation(uid,ev);
      evalDiv.appendChild(btnReset);

      // 3.4) Descargar encuesta
      const btnSurvey = document.createElement('button');
      btnSurvey.textContent = 'Descargar encuesta (PDF)';
      btnSurvey.onclick = () => downloadSurveyPDF(uid,ev);
      evalDiv.appendChild(btnSurvey);

      // 3.5) Bloquear/permitir evaluación
      const locked = u.lockedEvaluations||[];
      const btnLock = document.createElement('button');
      btnLock.textContent = locked.includes(ev)
        ? 'Permitir evaluación'
        : 'Bloquear evaluación';
      btnLock.onclick = async () => {
        await toggleEvaluationAccess(uid,ev);
        loadAllUsers();
      };
      evalDiv.appendChild(btnLock);

      // 3.6) Botón de certificado si aprobó
      const passedDoc = respDocs.find(d=> d.data().result?.grade==='Aprobado');
      if (passedDoc) {
        const { score } = passedDoc.data().result;
        const dateStr   = passedDoc.data().timestamp
          .toDate().toLocaleDateString();
        const btnCert = document.createElement('button');
        btnCert.textContent = 'Descargar Certificado';
        btnCert.onclick = () =>
          generateCertificateForUser(uid,ev,score,dateStr);
        evalDiv.appendChild(btnCert);
      }

      userDiv.appendChild(evalDiv);
    }

    container.appendChild(userDiv);
  }
}

// 4.a) PDF de un solo intento
async function downloadResponsePDFForAttempt(uid,ev,idx) {
  const raw = await db.collection('responses')
    .where('userId','==',uid)
    .where('evaluationId','==',ev)
    .get();
  const docs = raw.docs.sort((a,b)=>
    a.data().timestamp.toDate() - b.data().timestamp.toDate()
  );
  if (!docs[idx]) return alert('Intento no encontrado.');
  await createSingleAttemptPDF(uid,ev,idx+1,docs[idx].data());
}

// 4.b) Crear PDF de intento
async function createSingleAttemptPDF(uid,ev,intentoNum,r) {
  const [uSnap,eSnap] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('evaluations').doc(ev).get()
  ]);
  const userName = uSnap.data().name;
  const qs       = eSnap.data().questions||[];

  const pdf = new jsPDF();
  let y = 10;
  pdf.setFontSize(14);
  pdf.text(`Nombre: ${userName}`,10,y);       y+=10;
  pdf.text(`Curso: ${ev}`,10,y);              y+=10;
  pdf.text(`Intento: ${intentoNum}`,10,y);    y+=12;
  pdf.setFontSize(12);

  Object.entries(r.answers||{})
    .sort((a,b)=>+a[0].match(/\d+/)[0]-+b[0].match(/\d+/)[0])
    .forEach(([k,ans])=>{
      const i = +k.match(/\d+/)[0];
      const txt = qs[i]?.text||`Pregunta ${i+1}`;
      pdf.text(`${i+1}. ${txt}`,10,y); y+=7;
      pdf.text(`→ ${ans}`,12,y);      y+=8;
      if (y>280){pdf.addPage();y=10;}
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

// 4.d) Descargar encuesta en PDF
async function downloadSurveyPDF(uid,ev) {
  const [uSnap,sRaw,sqSnap] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('surveys')
      .where('userId','==',uid)
      .where('evaluationId','==',ev)
      .get(),
    db.collection('surveyQuestions').doc(ev).get()
  ]);
  if (sRaw.empty) return alert('Sin encuestas.');
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
  pdf.text(`Encuesta: ${ev}`,10,y);   y+=12;
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

// 4.e) Bloquear/permitir evaluación
async function toggleEvaluationAccess(uid,ev) {
  const ref = db.collection('users').doc(uid);
  const u   = (await ref.get()).data()||{};
  const locked = u.lockedEvaluations||[];
  const next   = locked.includes(ev)
    ? locked.filter(x=>x!==ev)
    : [...locked,ev];
  await ref.update({ lockedEvaluations: next });
}

// 4.f) Generar certificado usando PDF-Lib
async function generateCertificateForUser(uid,evaluationID,score,approvalDate) {
  try {
    // 1) Datos usuario y evaluación
    const [uSnap,eSnap] = await Promise.all([
      db.collection('users').doc(uid).get(),
      db.collection('evaluations').doc(evaluationID).get()
    ]);
    const uData = uSnap.data();
    const eData = eSnap.data();
    // 2) Cargar plantilla y fuentes
    const bytes = await fetch(eData.certificateTemplate).then(r=>r.arrayBuffer());
    const pdfDoc = await PDFLib.PDFDocument.load(bytes);
    pdfDoc.registerFontkit(fontkit);
    const [b1,b2] = await Promise.all([
      fetch('/fuentes/PerpetuaStd-Bold.otf').then(r=>r.arrayBuffer()),
      fetch('/fuentes/TimesNewRomanPSMT.ttf').then(r=>r.arrayBuffer())
    ]);
    const fBold  = await pdfDoc.embedFont(b1);
    const fRoman = await pdfDoc.embedFont(b2);
    const page   = pdfDoc.getPages()[0];
    const { width, height } = page.getSize();
    // Helper centrado
    const center = (t,y,s,f)=>{
      const w = f.widthOfTextAtSize(t,s);
      page.drawText(t,{ x:(width-w)/2, y, size:s, font:f, color:PDFLib.rgb(0,0,0) });
    };
    // 3) Dibujar campos
    center(eData.name,      height-200, 20, fBold);
    center(uData.name,      height-230, 18, fRoman);
    center(`RUT: ${uData.rut}`,        height-260, 12, fRoman);
    center(`Empresa: ${uData.company}`,height-280, 12, fRoman);
    center(`Puntaje: ${score}`,        height-310, 14, fRoman);
    center(`Fecha: ${approvalDate}`,   height-330, 12, fRoman);
    // 4) Exportar
    const pdfBytes = await pdfDoc.save();
    const blob     = new Blob([pdfBytes],{type:'application/pdf'});
    const a        = document.createElement('a');
    a.href         = URL.createObjectURL(blob);
    a.download     = `Certificado_${evaluationID}_${uData.name}.pdf`;
    a.click();
  } catch (err) {
    console.error("Error generando certificado:",err);
    alert("No se pudo generar el certificado. Ver consola.");
  }
}
