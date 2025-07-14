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

async function loadAllUsers() {
  const container = document.getElementById('usersList');
  container.textContent = 'Cargando usuarios…';

  // 1) Traer solo usuarios normales
  const usersSnap = await db.collection('users')
                            .where('role','==','user')
                            .get();
  if (usersSnap.empty) {
    container.textContent = 'No hay usuarios normales.';
    return;
  }
  container.innerHTML = '';

  // 2) Por cada usuario
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

    // 3) Por cada curso asignado a este usuario
    for (const ev of (u.assignedEvaluations||[])) {
      const evalDiv = document.createElement('div');
      evalDiv.className = 'eval-item';
      evalDiv.innerHTML = `<strong>${ev}</strong><br>`;

      // 3.1) Traer **todos** los intentos de este usuario en este curso
      const rawSnap = await db.collection('responses')
        .where('userId','==',uid)
        .where('evaluationId','==',ev)
        .get();

      // Ordenar localmente por timestamp
      const respDocs = rawSnap.docs.sort((a,b) =>
        a.data().timestamp.toDate() - b.data().timestamp.toDate()
      );

      // 3.2) Botón **por cada** intento de respuesta
      respDocs.forEach((docR, idx) => {
        const btn = document.createElement('button');
        btn.textContent = `Desc. respuestas intento ${idx+1} (PDF)`;
        btn.onclick    = () => downloadResponsePDFForAttempt(uid, ev, idx);
        evalDiv.appendChild(btn);
      });

      // 3.3) Botón “Reiniciar intentos”
      const btnReset = document.createElement('button');
      btnReset.textContent = 'Reiniciar intentos';
      btnReset.onclick     = () => resetAttemptsForEvaluation(uid, ev);
      evalDiv.appendChild(btnReset);

      // 3.4) Botón “Descargar encuesta (PDF)”
      const btnSurvey = document.createElement('button');
      btnSurvey.textContent = 'Descargar encuesta (PDF)';
      btnSurvey.onclick     = () => downloadSurveyPDF(uid, ev);
      evalDiv.appendChild(btnSurvey);

      // 3.5) Botón “Bloquear/Permitir evaluación”
      const locked = u.lockedEvaluations || [];
      const btnLock = document.createElement('button');
      btnLock.textContent = locked.includes(ev)
        ? 'Permitir evaluación'
        : 'Bloquear evaluación';
      btnLock.onclick = async () => {
        await toggleEvaluationAccess(uid, ev);
        await loadAllUsers();
      };
      evalDiv.appendChild(btnLock);

      // ─────────────────────────────────────
      // 3.6) **CERTIFICADO**: botón por **cada** curso APROBADO
      // Comprobar si **algún** intento tiene result.grade === 'Aprobado'
      const passedDoc = respDocs.find(d =>
        d.data().result?.grade === 'Aprobado'
      );
      if (passedDoc) {
        // Si hay al menos uno aprobado, pintamos el botón
        const { score } = passedDoc.data().result;
        const dateStr   = passedDoc.data().timestamp
                            .toDate()
                            .toLocaleDateString();
        const btnCert = document.createElement('button');
        btnCert.textContent = 'Descargar Certificado';
        btnCert.onclick = () =>
          generateCertificateForUser(uid, ev, score, dateStr);
        evalDiv.appendChild(btnCert);
      }
      // ─────────────────────────────────────

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

// 4.f) Generar certificado con tu función original
async function generateCertificateForUser(uid, evaluationID, score, approvalDate) {
    try {
        // 1) Leer datos del usuario desde Firestore
        const userSnap = await db.collection('users').doc(uid).get();
        if (!userSnap.exists) throw new Error("Usuario no encontrado");
        const { name: userNameDB, rut, company, customID } = userSnap.data();

        // 2) Leer datos de la evaluación
        const evalSnap = await db.collection('evaluations').doc(evaluationID).get();
        if (!evalSnap.exists) throw new Error("Evaluación no encontrada");
        const evalData       = evalSnap.data();
        const evaluationName = evalData.name;
        const evaluationTime = evalData.timeEvaluation;
        const certificateTemplate = evalData.certificateTemplate;
        const evaluationIDNumber  = evalData.ID;

        // 3) Calcular año e ID dinámico
        const [d, m, y] = approvalDate.split('-');
        const year       = new Date(`${y}-${m}-${d}`).getFullYear();
        const certificateID = `${evaluationIDNumber}${customID}${year}`;

        // 4) Cargar plantilla base
        const tplBytes = await fetch(certificateTemplate).then(r => r.arrayBuffer());
        const pdfDoc   = await PDFLib.PDFDocument.load(tplBytes);
        pdfDoc.registerFontkit(fontkit);

        // 5) Cargar e incrustar fuentes
        const monoBytes    = await fetch("fonts/MonotypeCorsiva.ttf").then(r=>r.arrayBuffer());
        const perpBytes    = await fetch("fonts/Perpetua.ttf").then(r=>r.arrayBuffer());
        const perpItBytes  = await fetch("fonts/PerpetuaItalic.ttf").then(r=>r.arrayBuffer());

        const monotypeFont       = await pdfDoc.embedFont(monoBytes);
        const perpetuaFont       = await pdfDoc.embedFont(perpBytes);
        const perpetuaItalicFont = await pdfDoc.embedFont(perpItBytes);

        // 6) Preparar página y dimensiones
        const page  = pdfDoc.getPages()[0];
        const { width, height } = page.getSize();

        // 7) Auxiliar: centrar texto
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

        // 8) Auxiliar: envolver líneas
        const wrapText = (txt, font, size, maxW) => {
            const words = txt.split(' ');
            const lines = [];
            let line = '';
            for (const w of words) {
                const test = line ? line + ' ' + w : w;
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

        // 9) Pintar todos los campos
        centerText(userNameDB,           height - 295, monotypeFont,       35);
        centerText(`RUT: ${rut}`,        height - 340, perpetuaItalicFont, 19);
        centerText(`Empresa: ${company}`,height - 360, perpetuaItalicFont, 19);

        // Nombre de la evaluación con wrap
        const maxW2 = width - 100;
        const lines = wrapText(evaluationName, monotypeFont, 34, maxW2);
        let y0 = height - 448;
        for (const l of lines) {
            centerText(l, y0, monotypeFont, 34);
            y0 -= 40;
        }

        // Campos fijos
        page.drawText(`Fecha de Aprobación: ${approvalDate}`, {
            x: 147, y: height - 548, size: 12, font: perpetuaFont, color: PDFLib.rgb(0,0,0)
        });
        page.drawText(`Duración del Curso: ${evaluationTime}`, {
            x: 157, y: height - 562, size: 12, font: perpetuaFont, color: PDFLib.rgb(0,0,0)
        });
        page.drawText(`ID: ${certificateID}`, {
            x: 184, y: height - 576, size: 12, font: perpetuaFont, color: PDFLib.rgb(0,0,0)
        });

        // 10) Exportar y disparar descarga
        const pdfBytes = await pdfDoc.save();
        const blob     = new Blob([pdfBytes], { type: "application/pdf" });
        const link     = document.createElement("a");
        link.href      = URL.createObjectURL(blob);
        link.download  = `Certificado_${evaluationName}.pdf`;
        link.click();

    } catch (error) {
        console.error("Error generando certificado:", error);
        alert("No se pudo generar el certificado. Revisa la consola.");
    }
}
