// ————————————————————————————————————————————————
// 1) Inicialización Firebase
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
const { jsPDF } = window.jspdf;  // extraído de jspdf.umd.min.js
// ————————————————————————————————————————————————

// 2) Protección de ruta: solo admin
auth.onAuthStateChanged(async user => {
  if (!user) return window.location = 'index.html';
  const perfil = await db.collection('users').doc(user.uid).get();
  if (!perfil.exists || perfil.data().role !== 'admin') {
    return window.location = 'dashboard.html';
  }
  loadAllUsers();
});

// 3) Listar usuarios “user”
async function loadAllUsers() {
  const div = document.getElementById('usersList');
  const snap = await db.collection('users')
                       .where('role','==','user')
                       .get();
  if (snap.empty) {
    div.textContent = 'No hay usuarios normales.';
    return;
  }
  div.innerHTML = '';
  snap.forEach(doc => {
    const u = doc.data();
    const lockedArr = u.lockedEvaluations || [];
    const item = document.createElement('div');
    item.className = 'user-item';
    item.innerHTML = `
      <strong>${u.name}</strong><br>
      RUT: ${u.rut}<br>
      CustomID: ${u.customID}<br>
      Empresa: ${u.company}<br>
      <button onclick="viewCertificates('${doc.id}')">
        Ver & descargar certificados aprobados
      </button>
      <div><em>Evaluaciones asignadas:</em></div>
    `;
    (u.assignedEvaluations||[]).forEach(ev => {
      const ei = document.createElement('div');
      ei.className = 'eval-item';
      const isLocked = lockedArr.includes(ev);
      ei.innerHTML = `
        <strong>${ev}</strong><br>
        <button onclick="viewScores('${doc.id}','${ev}')">Ver puntajes</button>
        <button onclick="resetAttempts('${doc.id}','${ev}')">Reiniciar intentos</button>
        <button onclick="downloadResponses('${doc.id}','${ev}')">
          Descargar respuestas (PDF)
        </button>
        <button onclick="downloadSurveys('${doc.id}','${ev}')">
          Descargar encuestas (PDF)
        </button>
        <button onclick="toggleEvaluationAccess('${doc.id}','${ev}')">
          ${isLocked ? 'Permitir' : 'Bloquear'} evaluación
        </button>
      `;
      item.appendChild(ei);
    });
    div.appendChild(item);
  });
}

// 4.a) Ver certificados aprobados
async function viewCertificates(uid) {
  const certs = await db
    .collection('users').doc(uid)
    .collection('certificates')
    .where('status','==','approved')
    .get();
  if (certs.empty) return alert('No hay certificados aprobados.');
  certs.forEach(d => window.open(d.data().url, '_blank'));
}

// 4.b) Ver puntajes
async function viewScores(uid, ev) {
  const snap = await db
    .collection('users').doc(uid)
    .collection('responses')
    .where('evaluationId','==',ev)
    .orderBy('timestamp','asc')
    .get();
  if (snap.empty) return alert('Sin intentos para '+ev);
  let txt = '';
  snap.forEach(d => {
    const r = d.data();
    txt += `• ${r.timestamp.toDate().toLocaleString()}: ${r.result.score} pts\n`;
  });
  alert(`Puntajes de ${ev}:\n\n`+txt);
}

// 4.c) Reiniciar intentos
async function resetAttempts(uid, ev) {
  if (!confirm(`¿Reiniciar intentos de ${ev}?`)) return;
  const snap = await db
    .collection('users').doc(uid)
    .collection('responses')
    .where('evaluationId','==',ev)
    .get();
  const batch = db.batch();
  snap.forEach(d => batch.delete(d.ref));
  await batch.commit();
  alert(`Intentos de ${ev} reiniciados.`);
}

// 4.d) Descargar respuestas en PDF con texto de preguntas
async function downloadResponses(uid, ev) {
  const userRef = db.collection('users').doc(uid);
  // 1) Traer nombre, puntaje y respuestas
  const [ userSnap, respSnap, evalSnap ] = await Promise.all([
    userRef.get(),
    userRef.collection('responses')
           .where('evaluationId','==',ev)
           .orderBy('timestamp','asc')
           .get(),
    db.collection('evaluations').doc(ev).get()
  ]);
  const userName = userSnap.data().name || '—';
  if (!respSnap.size) return alert('No hay respuestas para '+ev);

  // Tomamos el primer intento para el puntaje
  const score = respSnap.docs[0].data().result.score;
  // Preguntas definidas en el evaluation doc
  const questionsArr = (evalSnap.exists && evalSnap.data().questions) || [];

  // 2) Crear PDF
  const pdf = new jsPDF();
  let y = 10;
  pdf.setFontSize(14);
  pdf.text(`Nombre: ${userName}`, 10, y);  y += 10;
  pdf.text(`Puntaje: ${score}`,    10, y);  y += 12;
  pdf.setFontSize(12);

  // 3) Por cada intento:
  respSnap.docs.forEach((docR, idx) => {
    const r = docR.data();
    pdf.text(`--- Intento ${idx+1} (${r.timestamp.toDate().toLocaleString()}) ---`, 10, y);
    y += 8;

    // Ordenar y mostrar cada pregunta con su texto real:
    Object.entries(r.answers || {})
      .sort((a,b)=>{
        const ia = +a[0].match(/\d+/)[0], ib = +b[0].match(/\d+/)[0];
        return ia - ib;
      })
      .forEach(([qKey, answer]) => {
        const qIndex = +qKey.match(/\d+/)[0];
        const questionText = questionsArr[qIndex]?.text || `Pregunta ${qIndex+1}`;
        pdf.text(`${qIndex+1}. ${questionText}`, 10, y);
        y += 7;
        pdf.text(`   → ${answer}`, 12, y);
        y += 8;
        if (y > 280) { pdf.addPage(); y = 10; }
      });

    y += 6;
    if (y > 280) { pdf.addPage(); y = 10; }
  });

  pdf.save(`Respuestas_${userName}_${ev}.pdf`);
}

// 4.e) Descargar encuestas en PDF con texto de preguntas
async function downloadSurveys(uid, ev) {
  const userRef = db.collection('users').doc(uid);
  // 1) Traer nombre, encuestas y preguntas de encuesta
  const [ userSnap, surveySnap, sqSnap ] = await Promise.all([
    userRef.get(),
    userRef.collection('surveys')
           .where('evaluationId','==',ev)
           .orderBy('timestamp','asc')
           .get(),
    db.collection('surveyQuestions').doc(ev).get()
  ]);
  const userName = userSnap.data().name || '—';
  if (!surveySnap.size) return alert('No hay encuestas para '+ev);
  const surveyQs = (sqSnap.exists && sqSnap.data().questions) || [];

  // 2) Crear PDF
  const pdf = new jsPDF();
  let y = 10;
  pdf.setFontSize(14);
  pdf.text(`Nombre: ${userName}`, 10, y);  y += 10;
  pdf.text(`Encuesta: ${ev}`,     10, y);  y += 12;
  pdf.setFontSize(12);

  // 3) Por cada respuesta de encuesta:
  surveySnap.docs.forEach((docS, idx) => {
    const s = docS.data();
    pdf.text(`--- Respuesta ${idx+1} (${s.timestamp.toDate().toLocaleString()}) ---`, 10, y);
    y += 8;

    Object.entries(s.surveyData || {})
      .sort((a,b)=>{
        const ia = +a[0].match(/\d+/)[0], ib = +b[0].match(/\d+/)[0];
        return ia - ib;
      })
      .forEach(([qKey, answer])=>{
        const qIndex = +qKey.match(/\d+/)[0];
        const questionText = surveyQs[qIndex]?.text || `Pregunta ${qIndex+1}`;
        pdf.text(`${qIndex+1}. ${questionText}`, 10, y);
        y += 7;
        pdf.text(`   → ${answer}`, 12, y);
        y += 8;
        if (y > 280) { pdf.addPage(); y = 10; }
      });

    y += 6;
    if (y > 280) { pdf.addPage(); y = 10; }
  });

  pdf.save(`Encuesta_${userName}_${ev}.pdf`);
}

// 4.f) Bloquear/permitir evaluación (sin cambios)
async function toggleEvaluationAccess(uid, ev) {
  const ref = db.collection('users').doc(uid);
  const doc = await ref.get();
  const locked = doc.data().lockedEvaluations || [];
  const next = locked.includes(ev)
             ? locked.filter(x=>x!==ev)
             : [...locked, ev];
  await ref.update({ lockedEvaluations: next });
  alert(`Evaluación ${ev} ${locked.includes(ev)? 'permitida':'bloqueada'}.`);
  loadAllUsers();
}