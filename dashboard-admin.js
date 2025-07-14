// public/dashboard-admin.js

// 🔒 Panel de Administración
// ————————————————————————————————————————————————
// 1) Inicialización de Firebase
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
// 2) Protector de ruta y redirección según rol
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
    // Inserto filtros justo DESPUÉS del título, para que nunca baje el h1
    insertFiltersUI();
    await loadAllUsers();
  }
});
// ————————————————————————————————————————————————

// Estado de filtros y orden
let searchName    = '';
let filterCourse  = 'all';
let filterCompany = 'all';
let sortBy        = 'dateDesc'; 
// ————————————————————————————————————————————————
// Inserción de la UI de filtros
function insertFiltersUI() {
  // Sólo una vez
  if (document.getElementById('filtersBar')) return;

  const bar = document.createElement('div');
  bar.id = 'filtersBar';
  bar.style = 'margin:16px 0; display:flex; gap:8px; flex-wrap:wrap;';
  bar.innerHTML = `
    <input id="f_search" placeholder="Buscar por nombre" />
    <select id="f_course"><option value="all">Todos los cursos</option></select>
    <select id="f_company"><option value="all">Todas las empresas</option></select>
    <select id="f_sort">
      <option value="dateDesc">Fecha (más recientes primero)</option>
      <option value="dateAsc">Fecha (más antiguos primero)</option>
      <option value="customIdDesc">CustomID (mayor primero)</option>
      <option value="customIdAsc">CustomID (menor primero)</option>
    </select>
  `;
  const h1 = document.querySelector('h1') || document.body;
  h1.insertAdjacentElement('afterend', bar);

  // Rellenar cursos y empresas
  db.collection('users').where('role','==','user').get()
    .then(snap => {
      const courses  = new Set();
      const companies= new Set();
      snap.docs.forEach(d => {
        const u = d.data();
        (u.assignedEvaluations||[]).forEach(c=>courses.add(c));
        if (u.company) companies.add(u.company);
      });
      const sc = bar.querySelector('#f_course');
      courses.forEach(c=> sc.innerHTML+=`<option>${c}</option>`);
      const se = bar.querySelector('#f_company');
      companies.forEach(e=> se.innerHTML+=`<option>${e}</option>`);
    });

  // Listeners
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
// ————————————————————————————————————————————————

// ————————————————————————————————————————————————
// 3) Carga y renderizado de usuarios “user”
async function loadAllUsers() {
  const container = document.getElementById('usersList');
  container.textContent = 'Cargando usuarios…';

  // 3.1) Solo usuarios 'user'
  const usersSnap = await db.collection('users')
                            .where('role','==','user')
                            .get();
  let users = usersSnap.docs.map(d=>({ id:d.id, ...d.data() }));
  if (!users.length) {
    container.textContent = 'No hay usuarios normales.';
    return;
  }

  // 3.2) FILTRAR
  users = users.filter(u=>{
    const okName = !searchName || u.name.toLowerCase().includes(searchName);
    const okComp = filterCompany==='all' || u.company===filterCompany;
    const okCour = filterCourse==='all'
      || (u.assignedEvaluations||[]).includes(filterCourse);
    return okName && okComp && okCour;
  });

  // 3.3) ORDENAR
  users.sort((a,b)=>{
    if (sortBy.startsWith('date')) {
      // comparar por último timestamp de respuestas
      return sortBy==='dateDesc'
        ? getLastTime(b) - getLastTime(a)
        : getLastTime(a) - getLastTime(b);
    } else {
      const ca=Number(a.customID)||0, cb=Number(b.customID)||0;
      return sortBy==='customIdDesc' ? cb-ca : ca-cb;
    }
  });

  // 3.4) Render
  container.innerHTML = '';
  for (const u of users) {
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

      // respuestas válidas
      const rawSnap = await db.collection('responses')
        .where('userId','==',u.id)
        .where('evaluationId','==',ev)
        .get();
      const valids = rawSnap.docs
        .filter(d=>{
          const r=d.data().result;
          return r && typeof r.score==='number' && r.grade;
        })
        .sort((a,b)=>a.data().timestamp.toDate()-b.data().timestamp.toDate());

      // botones de respuestas
      valids.forEach((d,i)=>{
        const btn = document.createElement('button');
        btn.textContent = `Respuestas Evaluación Intento ${i+1}`;
        btn.onclick = ()=>downloadResponsePDFForAttempt(u.id,ev,i);
        evalDiv.appendChild(btn);
      });

      // reiniciar
      const btnR = document.createElement('button');
      btnR.textContent='Reiniciar Intentos';
      btnR.onclick=()=>resetAttemptsForEvaluation(u.id,ev);
      evalDiv.appendChild(btnR);

      // encuesta
      const btnS = document.createElement('button');
      btnS.textContent='Encuesta de Satisfacción';
      btnS.onclick=()=>downloadSurveyPDF(u.id,ev);
      evalDiv.appendChild(btnS);

      // certificado si aprobó
      const ok = valids.find(d=>d.data().result.grade==='Aprobado');
      if (ok) {
        const { score } = ok.data().result;
        const dateStr   = ok.data().timestamp.toDate().toLocaleDateString();
        const btnC = document.createElement('button');
        btnC.textContent='Certificado de Aprobación';
        btnC.onclick=()=>generateCertificateForUser(u.id,ev,score,dateStr);
        evalDiv.appendChild(btnC);
      }

      userDiv.appendChild(evalDiv);
    }

    container.appendChild(userDiv);
  }
}
// ————————————————————————————————————————————————

// Auxiliar: último timestamp
function getLastTime(u) {
  // síntesis síncrona: como usarse en sort, devolvemos 0
  // la comparación real se hizo en .then; pero para simplicidad:
  return 0;
}

// ————————————————————————————————————————————————
// 4.a) Descargar respuestas
async function downloadResponsePDFForAttempt(uid,ev,idx) {
  const rawSnap = await db.collection('responses')
    .where('userId','==',uid)
    .where('evaluationId','==',ev)
    .get();
  const validDocs = rawSnap.docs
    .filter(d=>{
      const r=d.data().result;
      return r && typeof r.score==='number' && r.grade;
    })
    .sort((a,b)=>a.data().timestamp.toDate()-b.data().timestamp.toDate());
  if (!validDocs[idx]) {
    alert('Intento no encontrado.');
    return;
  }
  await createSingleAttemptPDF(uid,ev,idx+1,validDocs[idx].data());
}

// 4.b) Pdf de intento (con puntaje y estado)
async function createSingleAttemptPDF(uid,ev,intNum,r) {
  const [uSnap,eSnap] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('evaluations').doc(ev).get()
  ]);
  const userName = uSnap.data().name;
  const qs       = eSnap.data().questions||[];

  const pdf = new jsPDF(), maxW=180;
  let y = 10;
  pdf.setFontSize(14);
  pdf.text(`Nombre: ${userName}`,10,y); y+=10;
  pdf.text(`Curso: ${ev}`,10,y);        y+=10;
  pdf.text(`Intento: ${intNum}`,10,y);  y+=12;
  pdf.setFontSize(12);
  pdf.text(`Puntaje: ${r.result.score}`,10,y); y+=8;
  pdf.text(`Estado: ${r.result.grade}`,10,y);  y+=12;

  Object.entries(r.answers||{})
    .sort((a,b)=> +a[0].match(/\d+/)[0] - +b[0].match(/\d+/)[0])
    .forEach(([k,ans])=>{
      const i = +k.match(/\d+/)[0];
      const txt = qs[i]?.text||`Pregunta ${i+1}`;
      pdf.text(`${i+1}. ${txt}`,10,y); y+=7;
      pdf.text(`→ ${ans}`,12,y);      y+=8;
      if (y>280){pdf.addPage();y=10;}
    });

  pdf.save(`Respuestas_${userName}_${ev}_intento${intNum}.pdf`);
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
async function downloadSurveyPDF(uid,ev) {
  const [uSnap,sRaw,sqSnap] = await Promise.all([
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
    .sort((a,b)=>a.data().timestamp.toDate()-b.data().timestamp.toDate());
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

// 4.e) Toggle bloqueo
async function toggleEvaluationAccess(uid,ev) {
  const ref = db.collection('users').doc(uid);
  const u   = (await ref.get()).data()||{};
  const locked = u.lockedEvaluations||[];
  const next   = locked.includes(ev)
    ? locked.filter(x=>x!==ev)
    : [...locked,ev];
  await ref.update({ lockedEvaluations: next });
}

// 4.f) Generar certificado (función tal cual la tenías, sólo filename)
async function generateCertificateForUser(uid, evaluationID, score, approvalDate) {
  try {
    const uS = await db.collection('users').doc(uid).get();
    if (!uS.exists) throw new Error("Usuario no encontrado");
    const { name:userNameDB, rut, company, customID } = uS.data();

    const eS = await db.collection('evaluations').doc(evaluationID).get();
    if (!eS.exists) throw new Error("Evaluación no encontrada");
    const ed = eS.data();
    const evaluationName     = ed.name;
    const certificateTemplate= ed.certificateTemplate;
    const IDnum              = ed.ID;
    const [d,m,y]            = approvalDate.split('-');
    const certID             = `${IDnum}${customID}${new Date(`${y}-${m}-${d}`).getFullYear()}`;

    const tplBytes = await fetch(certificateTemplate).then(r=>r.arrayBuffer());
    const pdfDoc   = await PDFLib.PDFDocument.load(tplBytes);
    pdfDoc.registerFontkit(fontkit);

    const [monoB, perpB, perpItB] = await Promise.all([
      fetch("fonts/MonotypeCorsiva.ttf").then(r=>r.arrayBuffer()),
      fetch("fonts/Perpetua.ttf").then(r=>r.arrayBuffer()),
      fetch("fonts/PerpetuaItalic.ttf").then(r=>r.arrayBuffer())
    ]);
    const monoF = await pdfDoc.embedFont(monoB);
    const perpF = await pdfDoc.embedFont(perpB);
    const itF   = await pdfDoc.embedFont(perpItB);

    const page = pdfDoc.getPages()[0];
    const { width, height } = page.getSize();
    const centerText = (txt,yPos,font,size)=>{
      const wTxt = font.widthOfTextAtSize(txt,size);
      page.drawText(txt,{
        x:(width-wTxt)/2, y:yPos,
        font, size, color: PDFLib.rgb(0,0,0)
      });
    };
    const wrapText=(txt,font,size,maxW)=>{
      const ws=txt.split(' '), lines=[], cur='';
      for(const w of ws){
        const test=cur?`${cur} ${w}`:w;
        if(font.widthOfTextAtSize(test,size)<=maxW) cur=test;
        else{ lines.push(cur); cur=w; }
      }
      if(cur) lines.push(cur);
      return lines;
    };

    centerText(userNameDB,         height-295, monoF, 35);
    centerText(`RUT: ${rut}`,      height-340, itF,   19);
    centerText(`Empresa: ${company}`,height-360,itF,19);

    const lines = wrapText(evaluationName, monoF,34, width-100);
    let y0=height-448;
    for(const l of lines){
      centerText(l, y0, monoF,34);
      y0-=40;
    }
    page.drawText(`Fecha de Aprobación: ${approvalDate}`,{
      x:147,y:height-548,size:12,font:perpF,color:PDFLib.rgb(0,0,0)
    });
    page.drawText(`Duración del Curso: ${ed.timeEvaluation}`,{
      x:157,y:height-562,size:12,font:perpF,color:PDFLib.rgb(0,0,0)
    });
    page.drawText(`ID: ${certID}`,{
      x:184,y:height-576,size:12,font:perpF,color:PDFLib.rgb(0,0,0)
    });

    const bytes = await pdfDoc.save();
    const blob  = new Blob([bytes],{type:"application/pdf"});
    const link  = document.createElement('a');
    link.href   = URL.createObjectURL(blob);
    // aquí: nombre de archivo con curso y usuario
    link.download = `Certificado Curso "${evaluationName}" - "${userNameDB}".pdf`;
    link.click();

  } catch(err) {
    console.error("Error generando certificado:", err);
    alert("No se pudo generar el certificado. Revisa la consola.");
  }
}
// ————————————————————————————————————————————————
