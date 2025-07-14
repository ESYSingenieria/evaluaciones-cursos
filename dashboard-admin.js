// dashboard-admin.js

// 🔒 Panel de Administración
// ───────────────────────────────────────────────────
// 1) Init Firebase
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
// 2) Protección de ruta + redirección según rol
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
  // Si estamos en admin:
  if (location.pathname.includes('dashboard-admin.html')) {
    await insertFiltersUI();
    await loadAllUsers();
  }
});

// ───────────────────────────────────────────────────
// Estado de filtros y orden
let searchName    = '';
let filterCourse  = 'all';
let filterCompany = 'all';
let sortBy        = 'dateDesc'; // 'dateDesc' | 'dateAsc' | 'customIdDesc' | 'customIdAsc'

// ───────────────────────────────────────────────────
// 3) Insertar UI de filtros justo bajo el <h1>
async function insertFiltersUI() {
  if (document.getElementById('filtersBar')) return;  // sólo una vez

  // Crear barra
  const bar = document.createElement('div');
  bar.id = 'filtersBar';
  bar.style = 'margin:16px 0; display:flex; gap:8px; flex-wrap:wrap;';
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
  // Insertar tras el h1 (o al inicio del body si no hay h1)
  const h1 = document.querySelector('h1') || document.body;
  h1.insertAdjacentElement('afterend', bar);

  // 3.a) Rellenar cursos usando la colección "courses"
  const cSnap = await db.collection('courses').get();
  cSnap.docs.forEach(doc => {
    const code = doc.id;
    const name = doc.data().name;
    bar.querySelector('#f_course')
       .innerHTML += `<option value="${code}">${name}</option>`;
  });

  // 3.b) Rellenar empresas únicas de usuarios
  const uSnap = await db.collection('users').where('role','==','user').get();
  const companies = new Set(uSnap.docs.map(d=>d.data().company).filter(Boolean));
  companies.forEach(co => {
    bar.querySelector('#f_company')
       .innerHTML += `<option value="${co}">${co}</option>`;
  });

  // 3.c) Listeners de filtros
  bar.querySelector('#f_search').addEventListener('input', e=>{
    searchName = e.target.value.toLowerCase();
    loadAllUsers();
  });
  bar.querySelector('#f_course').addEventListener('change', e=>{
    filterCourse = e.target.value;
    loadAllUsers();
  });
  bar.querySelector('#f_company').addEventListener('change', e=>{
    filterCompany = e.target.value;
    loadAllUsers();
  });
  bar.querySelector('#f_sort').addEventListener('change', e=>{
    sortBy = e.target.value;
    loadAllUsers();
  });
}

// ───────────────────────────────────────────────────
// 4) Cargar y renderizar todos los usuarios “user”
async function loadAllUsers() {
  const container = document.getElementById('usersList');
  container.textContent = 'Cargando usuarios…';

  // 4.1) Traer usuarios con role == 'user'
  const usersSnap = await db.collection('users')
                            .where('role','==','user')
                            .get();
  const users = [];
  for (const doc of usersSnap.docs) {
    const u = { id: doc.id, ...doc.data() };
    // Calcular última respuesta
    const rSnap = await db.collection('responses')
      .where('userId','==',u.id)
      .get();
    const times = rSnap.docs.map(d=>
      d.data().timestamp?.toDate()?.getTime()||0
    );
    u._lastTime = times.length ? Math.max(...times) : 0;
    users.push(u);
  }
  if (!users.length) {
    container.textContent = 'No hay usuarios normales.';
    return;
  }

  // 4.2) FILTRAR por nombre, curso y empresa
  let filtered = users.filter(u => {
    const okName = !searchName || u.name.toLowerCase().includes(searchName);
    const okCo   = filterCompany==='all' || u.company===filterCompany;
    const assigned = u.assignedEvaluations||[];
    const okCu   = filterCourse==='all' || assigned.includes(filterCourse);
    return okName && okCo && okCu;
  });

  // 4.3) ORDENAR según sortBy
  filtered.sort((a,b) => {
    if (sortBy==='dateDesc')  return b._lastTime - a._lastTime;
    if (sortBy==='dateAsc')   return a._lastTime - b._lastTime;
    const ca = parseInt(a.customID) || 0;
    const cb = parseInt(b.customID) || 0;
    if (sortBy==='customIdDesc') return cb - ca;
    if (sortBy==='customIdAsc')  return ca - cb;
    return 0;
  });

  // 4.4) Render de cada usuario
  container.innerHTML = '';
  for (const u of filtered) {
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
      const evalDiv = document.createElement('div');
      evalDiv.className = 'eval-item';

      // Mostrar nombre real del curso
      const courseDoc = await db.collection('courses').doc(ev).get();
      const courseName = courseDoc.exists
        ? courseDoc.data().name
        : ev;

      evalDiv.innerHTML = `<strong>${courseName}</strong><br>`;

      // Respuestas válidas (con score y grade)
      const rSnap = await db.collection('responses')
        .where('userId','==',u.id)
        .where('evaluationId','==',ev)
        .get();
      const valids = rSnap.docs
        .filter(d=>{
          const r=d.data().result;
          return r && typeof r.score==='number' && r.grade;
        })
        .sort((a,b)=>
          a.data().timestamp.toDate() - b.data().timestamp.toDate()
        );

      // Botones de respuestas
      valids.forEach((d,i)=>{
        const btn = document.createElement('button');
        btn.textContent = `Respuestas Intento ${i+1}`;
        btn.onclick = ()=>downloadResponsePDFForAttempt(u.id,ev,i);
        evalDiv.appendChild(btn);
      });

      // Reiniciar intentos
      const btnR = document.createElement('button');
      btnR.textContent = 'Reiniciar Intentos';
      btnR.onclick = ()=>resetAttemptsForEvaluation(u.id,ev);
      evalDiv.appendChild(btnR);

      // Encuesta
      const btnS = document.createElement('button');
      btnS.textContent = 'Encuesta de Satisfacción';
      btnS.onclick = ()=>downloadSurveyPDF(u.id,ev);
      evalDiv.appendChild(btnS);

      // Certificado (si aprobó)
      const ok = valids.find(d=>d.data().result.grade==='Aprobado');
      if (ok) {
        const { score } = ok.data().result;
        const dateStr   = ok.data().timestamp
                           .toDate()
                           .toLocaleDateString();
        const btnC = document.createElement('button');
        btnC.textContent = 'Certificado de Aprobación';
        btnC.onclick = ()=>generateCertificateForUser(
          u.id, ev, score, dateStr
        );
        evalDiv.appendChild(btnC);
      }

      userDiv.appendChild(evalDiv);
    }
    container.appendChild(userDiv);
  }
}

// ───────────────────────────────────────────────────
// 5.a) Descargar respuestas de un intento
async function downloadResponsePDFForAttempt(uid,ev,idx) {
  const rSnap = await db.collection('responses')
    .where('userId','==',uid)
    .where('evaluationId','==',ev)
    .get();
  const valids = rSnap.docs
    .filter(d=>{
      const r=d.data().result;
      return r && typeof r.score==='number' && r.grade;
    })
    .sort((a,b)=>
      a.data().timestamp.toDate() - b.data().timestamp.toDate()
    );
  if (!valids[idx]) {
    alert('Intento no encontrado.');
    return;
  }
  await createSingleAttemptPDF(
    uid, ev, idx+1, valids[idx].data()
  );
}

// ───────────────────────────────────────────────────
// 5.b) Generar PDF de un intento (con puntaje y estado)
async function createSingleAttemptPDF(uid,ev,intNum,r) {
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
      if (y > 280) { pdf.addPage(); y = 10; }
    });

  pdf.save(`Respuestas_${userName}_${ev}_intento${intNum}.pdf`);
}

// ───────────────────────────────────────────────────
// 5.c) Reiniciar intentos
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

// ───────────────────────────────────────────────────
// 5.d) Descargar encuesta
async function downloadSurveyPDF(uid,ev) {
  const [uSnap,sSnap, sqSnap] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('surveys')
      .where('userId','==',uid)
      .where('evaluationId','==',ev)
      .get(),
    db.collection('surveyQuestions').doc(ev).get()
  ]);
  if (sSnap.empty) {
    alert('Sin encuestas.');
    return;
  }
  const docs = sSnap.docs
    .sort((a,b)=>
      a.data().timestamp.toDate() - b.data().timestamp.toDate()
    );
  const s  = docs[0].data();
  const userName = uSnap.data().name;
  const qs       = sqSnap.data()?.questions||[];

  const pdf = new jsPDF();
  let y=10;
  pdf.setFontSize(14);
  pdf.text(`Nombre: ${userName}`,10,y); y+=10;
  pdf.text(`Encuesta: ${ev}`,10,y);   y+=12;
  pdf.setFontSize(12);

  Object.entries(s.surveyData||{})
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

  pdf.save(`Encuesta_${userName}_${ev}.pdf`);
}

// ───────────────────────────────────────────────────
// 5.e) Bloquear/Permitir evaluación
async function toggleEvaluationAccess(uid,ev) {
  const ref = db.collection('users').doc(uid);
  const u   = (await ref.get()).data()||{};
  const locked = u.lockedEvaluations||[];
  const next   = locked.includes(ev)
    ? locked.filter(x=>x!==ev)
    : [...locked,ev];
  await ref.update({ lockedEvaluations: next });
}

// ───────────────────────────────────────────────────
// 5.f) Generar certificado (función tal cual, sólo filename)
async function generateCertificateForUser(uid, evaluationID, score, approvalDate) {
  try {
    // 1) Usuario
    const uS = await db.collection('users').doc(uid).get();
    if (!uS.exists) throw new Error("Usuario no encontrado");
    const { name:userNameDB, rut, company, customID } = uS.data();

    // 2) Evaluación
    const eS = await db.collection('evaluations').doc(evaluationID).get();
    if (!eS.exists) throw new Error("Evaluación no encontrada");
    const ed             = eS.data();
    const evaluationName = ed.name;
    const templateURL    = ed.certificateTemplate;
    const IDnum          = ed.ID;

    // 3) Fecha e ID
    const [d,m,y]   = approvalDate.split('-');
    const year      = new Date(`${y}-${m}-${d}`).getFullYear();
    const certificateID = `${IDnum}${customID}${year}`;

    // 4) Cargar plantilla
    const tplBytes = await fetch(templateURL).then(r=>r.arrayBuffer());
    const pdfDoc   = await PDFLib.PDFDocument.load(tplBytes);
    pdfDoc.registerFontkit(fontkit);

    // 5) Fuentes
    const [monoB, perpB, perpItB] = await Promise.all([
      fetch("fonts/MonotypeCorsiva.ttf").then(r=>r.arrayBuffer()),
      fetch("fonts/Perpetua.ttf").then(r=>r.arrayBuffer()),
      fetch("fonts/PerpetuaItalic.ttf").then(r=>r.arrayBuffer())
    ]);
    const monoF = await pdfDoc.embedFont(monoB);
    const perpF = await pdfDoc.embedFont(perpB);
    const itF   = await pdfDoc.embedFont(perpItB);

    // 6) Página
    const page = pdfDoc.getPages()[0];
    const { width, height } = page.getSize();

    // 7) Centrar
    function centerText(txt,yPos,font,size) {
      const wTxt = font.widthOfTextAtSize(txt,size);
      page.drawText(txt,{ x:(width-wTxt)/2, y:yPos, font, size, color: PDFLib.rgb(0,0,0) });
    }

    // 8) Wrap (no reasignable)
    function wrapText(txt,font,size,maxW) {
      const words = txt.split(' ');
      const lines = [];
      let line = '';
      for (const w of words) {
        const test = line ? line+' '+w : w;
        if (font.widthOfTextAtSize(test,size) <= maxW) {
          line = test;
        } else {
          lines.push(line);
          line = w;
        }
      }
      if (line) lines.push(line);
      return lines;
    }

    // 9) Pintar
    centerText(userNameDB, height-295, monoF, 35);
    centerText(`RUT: ${rut}`, height-340, itF,   19);
    centerText(`Empresa: ${company}`, height-360, itF, 19);

    const lines = wrapText(evaluationName, monoF, 34, width-100);
    let y0 = height-448;
    for (const l of lines) {
      centerText(l, y0, monoF, 34);
      y0 -= 40;
    }

    page.drawText(`Fecha de Aprobación: ${approvalDate}`, {
      x:147, y:height-548, size:12, font:perpF, color: PDFLib.rgb(0,0,0)
    });
    page.drawText(`Duración del Curso: ${ed.timeEvaluation}`, {
      x:157, y:height-562, size:12, font:perpF, color: PDFLib.rgb(0,0,0)
    });
    page.drawText(`ID: ${certificateID}`, {
      x:184, y:height-576, size:12, font:perpF, color: PDFLib.rgb(0,0,0)
    });

    // 10) Descargar con filename corregido
    const pdfBytes = await pdfDoc.save();
    const blob     = new Blob([pdfBytes],{type:"application/pdf"});
    const link     = document.createElement('a');
    link.href      = URL.createObjectURL(blob);
    link.download  = `Certificado Curso "${evaluationName}" - "${userNameDB}".pdf`;
    link.click();

  } catch (err) {
    console.error("Error generando certificado:", err);
    alert("No se pudo generar el certificado. Revisa la consola.");
  }
}
