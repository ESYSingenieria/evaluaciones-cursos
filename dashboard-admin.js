// ————————————————————————————————————————————————
// 1) Inicialización de Firebase (igual que tu app original) :contentReference[oaicite:0]{index=0}
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

// Cargamos jsPDF desde el HTML
const { jsPDF } = window.jspdf;
// ————————————————————————————————————————————————

// ————————————————————————————————————————————————
// 2) Protegemos la ruta y redirigimos según role
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    return window.location = 'index.html';
  }

  // Leemos role desde tu colección users
  const perfil = await db.collection('users').doc(user.uid).get();
  const role   = perfil.data()?.role;

  // Si es admin y no estamos en su panel → redirigimos
  if (role === 'admin' && !location.pathname.includes('dashboard-admin.html')) {
    return location.href = 'dashboard-admin.html';
  }
  // Si NO es admin y estamos en el panel admin → mandamos al normal
  if (role !== 'admin' && location.pathname.includes('dashboard-admin.html')) {
    return location.href = 'dashboard.html';
  }

  // Si es admin y en su panel, cargamos los usuarios
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

    // Contenedor de usuario
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

      // 3.1) Traer todos los intentos de este usuario en este curso
      const respSnap = await db.collection('responses')
        .where('userId', '==', uid)
        .where('evaluationId', '==', ev)
        .orderBy('timestamp', 'asc')
        .get();

      // 3.2) Botones individuales por cada intento
      respSnap.docs.forEach((d, i) => {
        const btn = document.createElement('button');
        btn.textContent = `Desc. respuestas intento ${i+1} (PDF)`;
        btn.addEventListener('click', () =>
          downloadResponsePDFForAttempt(uid, ev, i)
        );
        evalDiv.appendChild(btn);
      });

      // 3.3) Reiniciar todos los intentos de este curso
      const btnReset = document.createElement('button');
      btnReset.textContent = 'Reiniciar intentos';
      btnReset.addEventListener('click', () =>
        resetAttemptsForEvaluation(uid, ev)
      );
      evalDiv.appendChild(btnReset);

      // 3.4) Descargar encuesta (solo 1 posible)
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

      // 3.6) Si aprobó al menos un intento, botón de certificado
      const passed = respSnap.docs.some(d =>
        d.data().result.grade === 'Aprobado'
      );
      if (passed) {
        const passDoc = respSnap.docs.find(d =>
          d.data().result.grade === 'Aprobado'
        ).data();
        const score   = passDoc.result.score;
        const dateStr = passDoc.timestamp.toDate().toLocaleDateString();
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
async function downloadResponsePDFForAttempt(uid, ev, attemptIndex) {
  const respSnap = await db.collection('responses')
    .where('userId', '==', uid)
    .where('evaluationId', '==', ev)
    .orderBy('timestamp', 'asc')
    .get();
  if (respSnap.empty || attemptIndex >= respSnap.size) {
    return alert('Intento no encontrado.');
  }
  const r = respSnap.docs[attemptIndex].data();
  await createSingleAttemptPDF(uid, ev, attemptIndex + 1, r);
}

// 4.b) Generar PDF de un solo intento
async function createSingleAttemptPDF(uid, ev, intentoNum, r) {
  // Traer nombre y preguntas
  const [ userSnap, evalSnap ] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('evaluations').doc(ev).get()
  ]);
  const userName   = userSnap.data().name;
  const questions  = evalSnap.data().questions || [];

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
      const idx = +qKey.match(/\d+/)[0];
      const txt = questions[idx]?.text || `Pregunta ${idx+1}`;
      pdf.text(`${idx+1}. ${txt}`, 10, y); y += 7;
      pdf.text(`→ ${ans}`,         12, y); y += 8;
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
  snap.forEach(d => batch.delete(d.ref));
  await batch.commit();
  alert('Intentos reiniciados.');
}

// 4.d) Descargar encuesta en PDF
async function downloadSurveyPDF(uid, ev) {
  const [ userSnap, surveySnap, sqSnap ] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('surveys')
      .where('userId','==',uid)
      .where('evaluationId','==',ev)
      .orderBy('timestamp','asc')
      .get(),
    db.collection('surveyQuestions').doc(ev).get()
  ]);
  if (surveySnap.empty) return alert('Sin encuestas.');
  const s     = surveySnap.docs[0].data();
  const userName = userSnap.data().name;
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
      const idx = +qKey.match(/\d+/)[0];
      const txt = questions[idx]?.text || `Pregunta ${idx+1}`;
      pdf.text(`${idx+1}. ${txt}`, 10, y); y += 7;
      pdf.text(`→ ${ans}`,         12, y); y += 8;
      if (y > 280) { pdf.addPage(); y = 10; }
    });

  pdf.save(`Encuesta_${userName}_${ev}.pdf`);
}

// 4.e) Bloquear/Permitir evaluación en el perfil de usuario
async function toggleEvaluationAccess(uid, ev) {
  const ref = db.collection('users').doc(uid);
  const u   = (await ref.get()).data();
  const locked = u.lockedEvaluations||[];
  const next   = locked.includes(ev)
    ? locked.filter(x=>x!==ev)
    : [...locked, ev];
  await ref.update({ lockedEvaluations: next });
}

// 4.f) Generar certificado (se utiliza tu función original) :contentReference[oaicite:1]{index=1}
//    generateCertificateFromPDF(userName, evaluationID, score, approvalDate);
