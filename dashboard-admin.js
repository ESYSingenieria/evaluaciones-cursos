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
const { jsPDF } = window.jspdf; // desde jspdf.umd.min.js
// ————————————————————————————————————————————————

// ————————————————————————————————————————————————
// 2) Protegemos la ruta y redirigimos según role
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    return window.location = 'index.html';
  }
  const perfil = await db.collection('users').doc(user.uid).get();
  const role   = perfil.data()?.role;
  if (role === 'admin' && !location.pathname.includes('dashboard-admin.html')) {
    return location.href = 'dashboard-admin.html';
  }
  if (role !== 'admin' && location.pathname.includes('dashboard-admin.html')) {
    return location.href = 'dashboard.html';
  }
  if (location.pathname.includes('dashboard-admin.html')) {
    await loadAllUsers();
  }
});
// ————————————————————————————————————————————————

// ————————————————————————————————————————————————
// 3) Carga y renderizado de todos los usuarios “user”
async function loadAllUsers() {
  const container = document.getElementById('usersList');
  container.textContent = 'Cargando usuarios…';

  const snap = await db.collection('users')
                       .where('role', '==', 'user')
                       .get();
  if (snap.empty) {
    container.textContent = 'No hay usuarios normales.';
    return;
  }

  container.innerHTML = '';
  for (const docUser of snap.docs) {
    const u   = docUser.data();
    const uid = docUser.id;

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
    for (const ev of (u.assignedEvaluations || [])) {
      const evalDiv = document.createElement('div');
      evalDiv.className = 'eval-item';
      evalDiv.innerHTML = `<strong>${ev}</strong><br>`;

      // 3.1) Traer todos los intentos (sin orderBy)
      const respSnapRaw = await db.collection('responses')
        .where('userId','==',uid)
        .where('evaluationId','==',ev)
        .get();
      // ordenar localmente
      const respDocs = respSnapRaw.docs.sort((a,b)=>
        a.data().timestamp.toDate() - b.data().timestamp.toDate()
      );

      // 3.2) Botones individuales por intento
      respDocs.forEach((d, i) => {
        const btn = document.createElement('button');
        btn.textContent = `Desc. respuestas intento ${i+1} (PDF)`;
        btn.addEventListener('click', () =>
          downloadResponsePDFForAttempt(uid, ev, i)
        );
        evalDiv.appendChild(btn);
      });

      // 3.3) Reiniciar intentos
      const btnReset = document.createElement('button');
      btnReset.textContent = 'Reiniciar intentos';
      btnReset.addEventListener('click', () =>
        resetAttemptsForEvaluation(uid, ev)
      );
      evalDiv.appendChild(btnReset);

      // 3.4) Descargar encuesta (sin orderBy)
      const btnSurvey = document.createElement('button');
      btnSurvey.textContent = 'Descargar encuesta (PDF)';
      btnSurvey.addEventListener('click', () =>
        downloadSurveyPDF(uid, ev)
      );
      evalDiv.appendChild(btnSurvey);

      // 3.5) Bloquear/Permitir evaluación
      const lockedArr = u.lockedEvaluations || [];
      const isLocked  = lockedArr.includes(ev);
      const btnLock   = document.createElement('button');
      btnLock.textContent = isLocked
        ? 'Permitir evaluación'
        : 'Bloquear evaluación';
      btnLock.addEventListener('click', async () => {
        await toggleEvaluationAccess(uid, ev);
        await loadAllUsers();
      });
      evalDiv.appendChild(btnLock);

      // 3.6) Botón de certificado si aprobó algún intento
      const passedDoc = respDocs.find(d =>
        d.data().result?.grade === 'Aprobado'
      );
      if (passedDoc) {
        const passData = passedDoc.data();
        const score   = passData.result?.score ?? 'N/A';
        const dateStr = passData.timestamp
          ? passData.timestamp.toDate().toLocaleDateString()
          : '';
        const btnCert = document.createElement('button');
        btnCert.textContent = 'Descargar Certificado';
        btnCert.addEventListener('click', () =>
          generateCertificateFromPDF(u.name, ev, score, dateStr)
        );
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

// 4.a) Descargar respuestas de UN solo intento en PDF
async function downloadResponsePDFForAttempt(uid, ev, idx) {
  const snapRaw = await db.collection('responses')
    .where('userId','==',uid)
    .where('evaluationId','==',ev)
    .get();
  const docs = snapRaw.docs.sort((a,b)=>
    a.data().timestamp.toDate() - b.data().timestamp.toDate()
  );
  if (!docs[idx]) return alert('Intento no encontrado.');
  await createSingleAttemptPDF(uid, ev, idx+1, docs[idx].data());
}

// 4.b) Generar PDF de un solo intento
async function createSingleAttemptPDF(uid, ev, intentoNum, r) {
  const [ userSnap, evalSnap ] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('evaluations').doc(ev).get()
  ]);
  const userName  = userSnap.data().name;
  const questions = evalSnap.data().questions || [];

  const pdf = new jsPDF();
  let y = 10;
  pdf.setFontSize(14);
  pdf.text(`Nombre: ${userName}`, 10, y);           y += 10;
  pdf.text(`Curso: ${ev}`,           10, y);           y += 10;
  pdf.text(`Intento: ${intentoNum}`, 10, y);           y += 12;
  pdf.setFontSize(12);

  Object.entries(r.answers || {})
    .sort((a,b)=>
      +a[0].match(/\d+/)[0] - +b[0].match(/\d+/)[0]
    )
    .forEach(([qKey, ans]) => {
      const idxQ = +qKey.match(/\d+/)[0];
      const txt  = questions[idxQ]?.text || `Pregunta ${idxQ+1}`;
      pdf.text(`${idxQ+1}. ${txt}`, 10, y); y += 7;
      pdf.text(`→ ${ans}`,           12, y); y += 8;
      if (y > 280) { pdf.addPage(); y = 10; }
    });

  pdf.save(`Respuestas_${userName}_${ev}_intento${intentoNum}.pdf`);
}

// 4.c) Reiniciar intentos de un curso
async function resetAttemptsForEvaluation(uid, ev) {
  if (!confirm(`¿Reiniciar intentos de ${ev}?`)) return;
  const snap = await db.collection('responses')
    .where('userId','==',uid)
    .where('evaluationId','==',ev)
    .get();
  const batch = db.batch();
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  alert('Intentos reiniciados.');
}

// 4.d) Descargar encuesta en PDF
async function downloadSurveyPDF(uid, ev) {
  const [ userSnap, surveySnapRaw, sqSnap ] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('surveys')
      .where('userId','==',uid)
      .where('evaluationId','==',ev)
      .get(),
    db.collection('surveyQuestions').doc(ev).get()
  ]);
  const userName  = userSnap.data().name;
  if (surveySnapRaw.empty) return alert('Sin encuestas.');
  // ordenar manualmente
  const surveyDocs = surveySnapRaw.docs.sort((a,b)=>
    a.data().timestamp.toDate() - b.data().timestamp.toDate()
  );
  const s         = surveyDocs[0].data(); // primer registro
  const questions = sqSnap.data()?.questions || [];

  const pdf = new jsPDF();
  let y = 10;
  pdf.setFontSize(14);
  pdf.text(`Nombre: ${userName}`, 10, y); y += 10;
  pdf.text(`Encuesta: ${ev}`,     10, y); y += 12;
  pdf.setFontSize(12);

  Object.entries(s.surveyData || {})
    .sort((a,b)=>
      +a[0].match(/\d+/)[0] - +b[0].match(/\d+/)[0]
    )
    .forEach(([qKey, ans]) => {
      const idxQ = +qKey.match(/\d+/)[0];
      const txt  = questions[idxQ]?.text || `Pregunta ${idxQ+1}`;
      pdf.text(`${idxQ+1}. ${txt}`, 10, y); y += 7;
      pdf.text(`→ ${ans}`,           12, y); y += 8;
      if (y > 280) { pdf.addPage(); y = 10; }
    });

  pdf.save(`Encuesta_${userName}_${ev}.pdf`);
}

// 4.e) Bloquear/Permitir evaluación
async function toggleEvaluationAccess(uid, ev) {
  const ref    = db.collection('users').doc(uid);
  const u      = (await ref.get()).data();
  const locked = u.lockedEvaluations || [];
  const next   = locked.includes(ev)
    ? locked.filter(x=>x!==ev)
    : [...locked, ev];
  await ref.update({ lockedEvaluations: next });
}

// 4.f) Generar certificado con tu función original
//    generateCertificateFromPDF(userName, evaluationID, score, approvalDate);
