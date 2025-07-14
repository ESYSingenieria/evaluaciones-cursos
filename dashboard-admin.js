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
// 2) Referencias DOM
const searchInput    = document.getElementById('searchName');
const courseFilter   = document.getElementById('filterCourse');
const companyFilter  = document.getElementById('filterCompany');
const sortSelect     = document.getElementById('sortSelect');
const usersContainer = document.getElementById('usersList');

// Datos cargados en memoria
let allData = []; // { uid, userData, evId, evName, validAttempts, surveyExists, locked }

// ————————————————————————————————————————————————
// 3) Protector de ruta y redirección según rol
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
    bindFilters();
  }
});
// ————————————————————————————————————————————————

// ————————————————————————————————————————————————
// 4) Carga de toda la data y cacheo de nombres de curso
async function loadAllUsers() {
  usersContainer.textContent = 'Cargando usuarios…';
  // 4.a) Traer usuarios con role=='user'
  const usersSnap = await db.collection('users')
                            .where('role','==','user')
                            .get();
  if (usersSnap.empty) {
    usersContainer.textContent = 'No hay usuarios normales.';
    return;
  }

  // 4.b) Para cada usuario y cada evaluación asignada, construimos una entrada
  allData = [];
  const evalNameCache = {}; // evita múltiples lecturas de Firestore
  for (const uDoc of usersSnap.docs) {
    const u = uDoc.data();
    const uid = uDoc.id;
    for (const evId of (u.assignedEvaluations||[])) {
      // nombre del curso
      if (!evalNameCache[evId]) {
        const eSnap = await db.collection('evaluations').doc(evId).get();
        evalNameCache[evId] = eSnap.exists
                           ? eSnap.data().name
                           : evId;
      }
      // respuestas válidas
      const respSnap = await db.collection('responses')
        .where('userId','==',uid)
        .where('evaluationId','==',evId)
        .get();
      const validAttempts = respSnap.docs
        .filter(d => {
          const r = d.data().result;
          return r && typeof r.score==='number' && r.grade;
        })
        .sort((a,b)=>
          a.data().timestamp.toDate() - b.data().timestamp.toDate()
        );
      // encuesta existe?
      const surveySnap = await db.collection('surveys')
        .where('userId','==',uid)
        .where('evaluationId','==',evId)
        .limit(1)
        .get();
      // locked?
      const lockedArr = u.lockedEvaluations||[];

      allData.push({
        uid, userData: u,
        evId, evName: evalNameCache[evId],
        validAttempts, surveyExists: !surveySnap.empty,
        locked: lockedArr.includes(evId)
      });
    }
  }

  // 4.c) Poblamos el selector de cursos y empresas
  populateFilterOptions(evalNameCache, usersSnap.docs.map(d=>d.data().company));

  // 4.d) Primer render (con orden por defecto: fecha desc)
  applyFilters();
}

// Llena cursos y empresas en los <select>
function populateFilterOptions(evalMap, companies){
  // Cursos
  const courseKeys = Object.values(evalMap).sort();
  courseFilter.innerHTML = `<option value="">Todos los cursos</option>` +
    courseKeys.map(n=>`<option value="${n}">${n}</option>`).join('');
  // Empresas (únicas)
  const uniqCo = Array.from(new Set(companies)).sort();
  companyFilter.innerHTML = `<option value="">Todas las empresas</option>` +
    uniqCo.map(c=>`<option value="${c}">${c}</option>`).join('');
}

// ————————————————————————————————————————————————
// 5) Bindeo de eventos de filtro / búsqueda / orden
function bindFilters(){
  [ searchInput, courseFilter, companyFilter, sortSelect ]
    .forEach(el => el.addEventListener('change', applyFilters));
  searchInput.addEventListener('input', applyFilters);
}

// Aplica búsqueda, filtro y orden, luego renderiza
function applyFilters(){
  let list = allData.slice();

  // 5.a) Búsqueda por nombre
  const term = searchInput.value.trim().toLowerCase();
  if (term) {
    list = list.filter(item =>
      item.userData.name.toLowerCase().includes(term)
    );
  }

  // 5.b) Filtrar por curso
  const cSel = courseFilter.value;
  if (cSel) {
    list = list.filter(item => item.evName === cSel);
  }

  // 5.c) Filtrar por empresa
  const coSel = companyFilter.value;
  if (coSel) {
    list = list.filter(item => item.userData.company === coSel);
  }

  // 5.d) Ordenar
  const sortVal = sortSelect.value;
  list.sort((a,b) => {
    if (sortVal === 'fecha_desc') {
      // tomo la última respuesta como timestamp
      const at = a.validAttempts.slice(-1)[0]?.data().timestamp.toDate() || new Date(0);
      const bt = b.validAttempts.slice(-1)[0]?.data().timestamp.toDate() || new Date(0);
      return bt - at;
    }
    if (sortVal === 'fecha_asc') {
      const at = a.validAttempts.slice(-1)[0]?.data().timestamp.toDate() || new Date(0);
      const bt = b.validAttempts.slice(-1)[0]?.data().timestamp.toDate() || new Date(0);
      return at - bt;
    }
    if (sortVal === 'id_asc') {
      return (a.userData.customID||0) - (b.userData.customID||0);
    }
    if (sortVal === 'id_desc') {
      return (b.userData.customID||0) - (a.userData.customID||0);
    }
    return 0;
  });

  renderList(list);
}

// ————————————————————————————————————————————————
// 6) Renderizado final
function renderList(list){
  usersContainer.innerHTML = ''; // limpio
  list.forEach(item => {
    const { uid,u:userData, evId, evName, validAttempts, surveyExists, locked } = item;
    const divU = document.createElement('div');
    divU.className = 'user-item';
    divU.innerHTML = `
      <strong>${userData.name}</strong><br>
      RUT: ${userData.rut}<br>
      CustomID: ${userData.customID}<br>
      Empresa: ${userData.company}<br>
      <em>Evaluación:</em> <strong>${evName}</strong><br>
    `;
    // botones intentos
    validAttempts.forEach((docSnap,i) => {
      const btn = document.createElement('button');
      btn.textContent = `Respuestas Intento ${i+1}`;
      btn.onclick = ()=> downloadResponsePDFForAttempt(uid, evId, i);
      divU.appendChild(btn);
    });
    // reiniciar
    const btnR = document.createElement('button');
    btnR.textContent = 'Reiniciar Intentos';
    btnR.onclick = ()=> resetAttemptsForEvaluation(uid, evId);
    divU.appendChild(btnR);
    // encuesta
    if (surveyExists) {
      const btnS = document.createElement('button');
      btnS.textContent = 'Encuesta de Satisfacción';
      btnS.onclick = ()=> downloadSurveyPDF(uid, evId);
      divU.appendChild(btnS);
    }
    // lock
    const btnL = document.createElement('button');
    btnL.textContent = locked ? 'Permitir evaluación' : 'Bloquear evaluación';
    btnL.onclick = async () => {
      await toggleEvaluationAccess(uid, evId);
      applyFilters();
    };
    divU.appendChild(btnL);
    // certificado
    const passSnap = validAttempts.find(d=>d.data().result.grade==='Aprobado');
    if (passSnap) {
      const { score } = passSnap.data().result;
      const dateStr   = passSnap.data().timestamp.toDate().toLocaleDateString();
      const btnC = document.createElement('button');
      btnC.textContent = 'Certificado de Aprobación';
      btnC.onclick = ()=> generateCertificateForUser(uid, evId, score, dateStr);
      divU.appendChild(btnC);
    }
    usersContainer.appendChild(divU);
  });
}

// ————————————————————————————————————————————————
// 7) Resto de helpers (igual que antes)…
// 7.a) Descargar respuestas
async function downloadResponsePDFForAttempt(uid, evId, idx) {
  const snap = await db.collection('responses')
    .where('userId','==',uid)
    .where('evaluationId','==',evId)
    .get();
  const docs = snap.docs
    .filter(d => {
      const r = d.data().result;
      return r && typeof r.score==='number' && r.grade;
    })
    .sort((a,b)=>
      a.data().timestamp.toDate() - b.data().timestamp.toDate()
    );
  if (!docs[idx]) return alert('Intento no encontrado.');
  await createSingleAttemptPDF(uid, evId, idx+1, docs[idx].data());
}

// 7.b) Crear PDF de intento (incluye puntaje y estado)
async function createSingleAttemptPDF(uid, evId, intentoNum, r) {
  const [uSnap,eSnap] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('evaluations').doc(evId).get()
  ]);
  const userName = uSnap.data().name;
  const qs       = eSnap.data().questions||[];

  const pdf = new jsPDF();
  let y = 10;
  pdf.setFontSize(14);
  pdf.text(`Nombre: ${userName}`,10,y); y+=10;
  pdf.text(`Curso: ${qs.length?evName:evId}`,10,y); y+=10;
  pdf.text(`Intento: ${intentoNum}`,10,y); y+=12;
  pdf.setFontSize(12);
  pdf.text(`Puntaje: ${r.result.score}`,10,y);   y+=8;
  pdf.text(`Estado: ${r.result.grade}`,10,y);    y+=12;
  Object.entries(r.answers||{})
    .sort((a,b)=>+a[0].match(/\d+/)[0]-+b[0].match(/\d+/)[0])
    .forEach(([k,ans])=>{
      const i = +k.match(/\d+/)[0];
      const txt = qs[i]?.text||`Pregunta ${i+1}`;
      pdf.text(`${i+1}. ${txt}`,10,y); y+=7;
      pdf.text(`→ ${ans}`,12,y);      y+=8;
      if (y>280) { pdf.addPage(); y=10; }
    });
  pdf.save(`Respuestas_${userName}_${evId}_intento${intentoNum}.pdf`);
}

// 7.c) Reiniciar
async function resetAttemptsForEvaluation(uid, evId) {
  if (!confirm(`¿Reiniciar intentos de ${evId}?`)) return;
  const snap = await db.collection('responses')
    .where('userId','==',uid)
    .where('evaluationId','==',evId)
    .get();
  const batch = db.batch();
  snap.docs.forEach(d=>batch.delete(d.ref));
  await batch.commit();
  alert('Intentos reiniciados.');
}

// 7.d) Encuesta
async function downloadSurveyPDF(uid, evId) {
  const [uSnap, sRaw, sqSnap] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('surveys')
      .where('userId','==',uid)
      .where('evaluationId','==',evId)
      .get(),
    db.collection('surveyQuestions').doc(evId).get()
  ]);
  if (sRaw.empty) {
    alert('Sin encuestas.');
    return;
  }
  const s = sRaw.docs
    .sort((a,b)=>a.data().timestamp.toDate()-b.data().timestamp.toDate())[0]
    .data();
  const userName = uSnap.data().name;
  const qs       = sqSnap.data()?.questions||[];

  const pdf = new jsPDF();
  let y = 10;
  pdf.setFontSize(14);
  pdf.text(`Nombre: ${userName}`,10,y); y+=10;
  pdf.text(`Encuesta: ${evId}`,10,y);   y+=12;
  pdf.setFontSize(12);
  Object.entries(s.surveyData||{})
    .sort((a,b)=>+a[0].match(/\d+/)[0]-+b[0].match(/\d+/)[0])
    .forEach(([k,ans])=>{
      const i = +k.match(/\d+/)[0];
      const txt = qs[i]?.text||`Pregunta ${i+1}`;
      pdf.text(`${i+1}. ${txt}`,10,y); y+=7;
      pdf.text(`→ ${ans}`,12,y);      y+=8;
      if (y>280) { pdf.addPage(); y=10; }
    });
  pdf.save(`Encuesta_${userName}_${evId}.pdf`);
}

// 7.e) Bloquear/permitir
async function toggleEvaluationAccess(uid, evId) {
  const ref = db.collection('users').doc(uid);
  const u   = (await ref.get()).data()||{};
  const locked = u.lockedEvaluations||[];
  const next   = locked.includes(evId)
    ? locked.filter(x=>x!==evId)
    : [...locked,evId];
  await ref.update({ lockedEvaluations: next });
}

// 7.f) Generar certificado **idéntica** a tu función original en app (4).js, salvo el nombre de la descarga
async function generateCertificateForUser(uid, evaluationID, score, approvalDate) {
  try {
    // --- 1) Leer datos del usuario
    const uS = await db.collection('users').doc(uid).get();
    if (!uS.exists) throw new Error("Usuario no encontrado");
    const { name:userNameDB, rut, company, customID } = uS.data();

    // --- 2) Leer datos de la evaluación
    const eS = await db.collection('evaluations').doc(evaluationID).get();
    if (!eS.exists) throw new Error("Evaluación no encontrada");
    const ed = eS.data();
    const tpl = ed.certificateTemplate;
    const IDnum = ed.ID;
    const [d,m,y] = approvalDate.split('-');
    const certID = `${IDnum}${customID}${new Date(`${y}-${m}-${d}`).getFullYear()}`;

    // --- 3) Cargar plantilla
    const tplBytes = await fetch(tpl).then(r=>r.arrayBuffer());
    const pdfDoc   = await PDFLib.PDFDocument.load(tplBytes);
    pdfDoc.registerFontkit(fontkit);

    // --- 4) Incrustar fuentes
    const [monoB, perpB, perpItB] = await Promise.all([
      fetch("fonts/MonotypeCorsiva.ttf").then(r=>r.arrayBuffer()),
      fetch("fonts/Perpetua.ttf").then(r=>r.arrayBuffer()),
      fetch("fonts/PerpetuaItalic.ttf").then(r=>r.arrayBuffer()),
    ]);
    const monoF = await pdfDoc.embedFont(monoB);
    const perpF = await pdfDoc.embedFont(perpB);
    const itF   = await pdfDoc.embedFont(perpItB);

    // --- 5) Preparar página
    const page = pdfDoc.getPages()[0];
    const { width, height } = page.getSize();
    const centerText = (txt,yPos,font,size)=>{
      const w = font.widthOfTextAtSize(txt,size);
      page.drawText(txt,{ x:(width-w)/2, y:yPos, font, size, color:PDFLib.rgb(0,0,0) });
    };
    const wrapText = (txt,font,size,maxW)=>{
      const ws=txt.split(' '), lines=[],cur='';
      for(const w of ws){
        const test=cur?`${cur} ${w}`:w;
        if(font.widthOfTextAtSize(test,size)<=maxW) cur=test;
        else{ lines.push(cur); cur=w; }
      }
      if(cur) lines.push(cur);
      return lines;
    };

    // --- 6) Pintar campos
    centerText(userNameDB,           height-295, monoF, 35);
    centerText(`RUT: ${rut}`,        height-340, itF,   19);
    centerText(`Empresa: ${company}`,height-360, itF,   19);
    const lines = wrapText(ed.name, monoF, 34, width-100);
    let y0 = height-448;
    for(const l of lines) {
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

    // --- 7) Descargar con nombre personalizado
    const pdfBytes = await pdfDoc.save();
    const blob     = new Blob([pdfBytes], { type: "application/pdf" });
    const link     = document.createElement("a");
    link.href      = URL.createObjectURL(blob);
    link.download  = `Certificado Curso "${ed.name}" - "${userNameDB}".pdf`;
    link.click();

  } catch (error) {
    console.error("Error generando certificado:", error);
    alert("No se pudo generar el certificado. Revisa la consola.");
  }
}
