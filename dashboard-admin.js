// dashboard-admin.js

// 1) Inicializar Firebase
const firebaseConfig = {
  apiKey:    "AIzaSyBikggLtX1nwc1OXWUvDKXFm6P_hAdAe-Y",
  authDomain:"plataforma-de-cursos-esys.firebaseapp.com",
  projectId: "plataforma-de-cursos-esys",
  storageBucket:"plataforma-de-cursos-esys.firebasestorage.app",
  messagingSenderId:"950684050808",
  appId:      "1:950684050808:web:33d2ef70f2343642f4548d"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
// App secundaria para crear usuarios sin afectar el auth principal
const secondaryApp  = firebase.initializeApp(firebaseConfig, "Secondary");
const secondaryAuth = secondaryApp.auth();
const db   = firebase.firestore();
const { jsPDF } = window.jspdf;

// 2) Caché y estados
let allUsers = [], allEvaluations = {}, allResponses = [], allSurveys = [], surveyQuestionsMap = {};
let searchName = "", filterCourse = "all", filterCompany = "all", sortBy = "dateDesc";

// 3) Auth & carga inicial
auth.onAuthStateChanged(async user => {
  if (!user) return location.href = "index.html";
  const perfilSnap = await db.collection("users").doc(user.uid).get();
  const role       = perfilSnap.data()?.role;
  if (role !== "admin") return location.href = "dashboard.html";
  // si es admin:
  await initializeData();
  setupFiltersUI();
  loadAllUsers();
});

// 4) Listener general
document.addEventListener('DOMContentLoaded', () => {
  // Logout
  document.getElementById('logoutButton').addEventListener('click', async () => {
    await auth.signOut();
    location.href = 'index.html';
  });

  // Inline edit / save / cancel con evaluaciones
  document.body.addEventListener('click', async e => {
    const btn = e.target;
    const uid = btn.dataset.uid;
    if (!uid) return;
    const row = btn.closest('.user-item');

    // EDIT
    if (btn.matches('.edit-user-btn')) {
      // convertir spans en inputs
      row.querySelectorAll('.field-container').forEach(fc => {
        const span = fc.querySelector('.field');
        const val  = span.textContent;
        span.style.display = 'none';
        const inp = document.createElement('input');
        inp.type = 'text'; inp.className = 'inline-input';
        inp.name = span.dataset.field; inp.value = val;
        fc.appendChild(inp);
      });
      // mostrar multi-select
      const selDiv = row.querySelector('.edit-evals-container');
      const sel    = selDiv.querySelector('.edit-assigned-evals');
      const current= allUsers.find(u => u.id === uid).assignedEvaluations || [];
      Array.from(sel.options).forEach(o => o.selected = current.includes(o.value));
      selDiv.style.display = '';
      // ajustar botones
      btn.style.display = 'none';
      row.querySelector('.save-user-btn'  ).style.display = '';
      row.querySelector('.cancel-user-btn').style.display = '';
    }

    // CANCEL
    if (btn.matches('.cancel-user-btn')) {
      const snap = await db.collection('users').doc(uid).get();
      const data = snap.data() || {};
      ['name','rut','customID','company'].forEach(key => {
        const fc = row.querySelector(`.field-container [data-field="${key}"]`).parentNode;
        fc.querySelector('.field').textContent = data[key] || '';
        const inp = fc.querySelector('.inline-input');
        if (inp) inp.remove();
        fc.querySelector('.field').style.display = '';
      });
      row.querySelector('.edit-evals-container').style.display = 'none';
      row.querySelector('.edit-user-btn'  ).style.display = '';
      btn.style.display = 'none';
      row.querySelector('.save-user-btn').style.display = 'none';
    }

    // SAVE
    if (btn.matches('.save-user-btn')) {
      const updates = {};
      row.querySelectorAll('.inline-input').forEach(inp => {
        updates[inp.name] = inp.value.trim();
      });
      updates.assignedEvaluations = Array.from(
        row.querySelector('.edit-assigned-evals').selectedOptions
      ).map(o => o.value);
      await db.collection('users').doc(uid).update(updates);
      ['name','rut','customID','company'].forEach(key => {
        const fc = row.querySelector(`.field-container [data-field="${key}"]`).parentNode;
        fc.querySelector('.field').textContent = updates[key];
        const inp = fc.querySelector('.inline-input'); if (inp) inp.remove();
        fc.querySelector('.field').style.display = '';
      });
      row.querySelector('.edit-evals-container').style.display = 'none';
      row.querySelector('.edit-user-btn'  ).style.display = '';
      btn.style.display = 'none';
      row.querySelector('.cancel-user-btn').style.display = 'none';
      alert('Usuario actualizado');
      loadAllUsers();
    }
  });

  // Helper: próximo CustomID
  function generateNextCustomID() {
    let max = 0;
    allUsers.forEach(u => {
      const n = parseInt((u.customID||'').replace(/[^0-9]/g,''),10);
      if (!isNaN(n) && n > max) max = n;
    });
    return (max + 1) + '-';
  }

  // Crear usuario: mostrar form
  const btnCreate  = document.getElementById('createUserBtn');
  const formCreate = document.getElementById('createUserForm');
  const btnCancel  = document.getElementById('cancelCreateUser');
  const btnSave    = document.getElementById('saveCreateUser');

  btnCreate.addEventListener('click', () => {
    // Autogenerar CustomID
    document.getElementById('newCustomId').value = generateNextCustomID();
    // Poblar evaluaciones
    const sel = document.getElementById('newAssignedEvals');
    sel.innerHTML = Object.entries(allEvaluations)
      .map(([id,ev]) => `<option value="${id}">${ev.name}</option>`).join('');
    formCreate.style.display = 'block';
  });
  btnCancel.addEventListener('click', () => formCreate.style.display = 'none');

  btnSave.addEventListener('click', async () => {
    const email    = document.getElementById('newEmail').value.trim();
    const name     = document.getElementById('newName').value.trim();
    const rut      = document.getElementById('newRut').value.trim();
    const customID = document.getElementById('newCustomId').value.trim();
    const company  = document.getElementById('newCompany').value.trim();
    const password = document.getElementById('newPassword').value.trim() || '123456';
    if (!email||!name||!rut||!customID||!company) {
      return alert('Todos los campos son obligatorios.');
    }
    const assignedEvals = Array.from(
      document.getElementById('newAssignedEvals').selectedOptions
    ).map(o => o.value);

    try {
      const cred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
      await db.collection('users').doc(cred.user.uid).set({
        name, rut, customID, company,
        role: 'user',
        assignedEvaluations: assignedEvals
      });
      await secondaryAuth.signOut();
      alert(`Usuario creado.\nContraseña: ${password}`);
      formCreate.style.display = 'none';
      loadAllUsers();
    } catch (err) {
      console.error(err);
      alert('Error creando usuario: ' + err.message);
    }
  });
});

// 5) Theme toggle
const themeToggle = document.getElementById('themeToggle');
themeToggle.addEventListener('click', () => {
  const dark = document.body.classList.toggle('dark');
  themeToggle.textContent = dark ? '☀️' : '🌙';
  localStorage.setItem('darkMode', dark);
});
if (localStorage.getItem('darkMode') === 'true') {
  document.body.classList.add('dark');
  themeToggle.textContent = '☀️';
}

// 6) Precarga de datos
async function initializeData() {
  const usSnap = await db.collection("users").where("role","==","user").get();
  allUsers = usSnap.docs.map(d=>({ id:d.id, ...d.data() }));
  const evSnap = await db.collection("evaluations").get();
  evSnap.docs.forEach(d=> allEvaluations[d.id] = d.data());
  const rSnap = await db.collection("responses").get();
  allResponses = rSnap.docs.map(d=> {
    const data = d.data();
    return {
      userId: data.userId,
      evaluationId: data.evaluationId,
      timestamp: data.timestamp?.toDate() || new Date(0),
      result: data.result || {}, answers: data.answers || {}
    };
  });
  const sSnap = await db.collection("surveys").get();
  allSurveys = sSnap.docs.map(d=>({ id:d.id, ...d.data() }));
  const sqSnap = await db.collection("surveyQuestions").get();
  sqSnap.docs.forEach(d=> surveyQuestionsMap[d.id] = d.data().questions || []);
}

// 7) Filtros UI
function setupFiltersUI() {
  if (document.getElementById("filtersBar").textContent !== "Cargando filtros…") return;
  const bar = document.getElementById("filtersBar");
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
  // poblar cursos
  const seen = new Set();
  Object.entries(allEvaluations).forEach(([code,data])=>{
    if (!seen.has(data.name)) {
      seen.add(data.name);
      bar.querySelector("#f_course")
         .innerHTML += `<option value="${code}">${data.name}</option>`;
    }
  });
  // poblar empresas
  [...new Set(allUsers.map(u=>u.company))].forEach(co=>{
    bar.querySelector("#f_company")
       .innerHTML += `<option value="${co}">${co}</option>`;
  });
  // listeners
  bar.querySelector("#f_search").addEventListener("input", e=>{
    searchName = e.target.value.toLowerCase(); loadAllUsers();
  });
  bar.querySelector("#f_course").addEventListener("change", e=>{
    filterCourse = e.target.value; loadAllUsers();
  });
  bar.querySelector("#f_company").addEventListener("change", e=>{
    filterCompany = e.target.value; loadAllUsers();
  });
  bar.querySelector("#f_sort").addEventListener("change", e=>{
    sortBy = e.target.value; loadAllUsers();
  });
}

// 8) Render usuarios
function loadAllUsers() {
  const container = document.getElementById("usersList");
  container.innerHTML = "";
  let filtered = allUsers.filter(u=>{
    if (searchName && !u.name.toLowerCase().includes(searchName)) return false;
    if (filterCompany!=="all" && u.company!==filterCompany) return false;
    if (filterCourse!=="all" && !u.assignedEvaluations.includes(filterCourse)) return false;
    return true;
  });
  // ordenar…
  filtered.sort((a,b)=>{
    switch(sortBy){
      case "dateDesc": return b._lastTime - a._lastTime;
      case "dateAsc":  return a._lastTime - b._lastTime;
      case "customIdDesc": return (+b.customID||0) - (+a.customID||0);
      case "customIdAsc":  return (+a.customID||0) - (+b.customID||0);
      default: return 0;
    }
  });
  if (!filtered.length) {
    container.textContent = "No se encontraron usuarios.";
    return;
  }
  filtered.forEach(u=>{
    const div = document.createElement("div");
    div.className = "user-item";
    div.innerHTML = `
      <div class="field-container">
        <strong>Nombre:</strong>
        <span class="field" data-field="name">${u.name}</span>
      </div>
      <div class="field-container">
        <strong>RUT:</strong>
        <span class="field" data-field="rut">${u.rut}</span>
      </div>
      <div class="field-container">
        <strong>CustomID:</strong>
        <span class="field" data-field="customID">${u.customID}</span>
      </div>
      <div class="field-container">
        <strong>Empresa:</strong>
        <span class="field" data-field="company">${u.company}</span>
      </div>
      <button class="edit-user-btn" data-uid="${u.id}">✏️</button>
      <button class="save-user-btn"   data-uid="${u.id}">✔️</button>
      <button class="cancel-user-btn" data-uid="${u.id}">✖️</button>
      <div class="edit-evals-container" style="display:none; margin:12px 0;">
        <select class="edit-assigned-evals" multiple
                style="width:100%;height:100px;padding:4px;">
          ${Object.entries(allEvaluations)
             .map(([id,ev])=>`<option value="${id}">${ev.name}</option>`)
             .join('')}
        </select>
      </div>
    `;
    // render de eval-items idéntico al resto de tu código…
    container.appendChild(div);
  });
}

// ───────────────────────────────────────────────────
// 7) PDF de un solo intento (wrap + limpiar símbolos)
async function downloadResponsePDFForAttempt(uid,ev,idx) {
  const valids = allResponses
    .filter(r=>r.userId===uid && r.evaluationId===ev && typeof r.result?.score==="number")
    .sort((a,b)=>a.timestamp - b.timestamp);
  if (!valids[idx]) {
    alert("Intento no encontrado."); return;
  }
  await createSingleAttemptPDF(uid,ev,idx+1,valids[idx]);
}

async function createSingleAttemptPDF(uid,ev,intNum,r) {
  const [uSnap,eSnap] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("evaluations").doc(ev).get()
  ]);
  const userName = uSnap.data().name;
  const qs       = eSnap.data().questions || [];

  const pdf = new jsPDF();
  let y = 10;
  pdf.setFont("helvetica"); pdf.setFontSize(14);
  pdf.text(`Nombre: ${userName}`,10,y);        y+=10;
  pdf.text(`Curso: ${eSnap.data().name}`,10,y); y+=10;
  pdf.text(`Intento: ${intNum}`,10,y);         y+=12;
  pdf.setFontSize(12);
  pdf.text(`Puntaje: ${r.result.score}`,10,y); y+=7;
  pdf.text(`Estado: ${r.result.grade}`,10,y);  y+=12;

  pdf.setFont("helvetica"); pdf.setFontSize(12);
  const maxWidth = pdf.internal.pageSize.getWidth() - 20;
  Object.entries(r.answers||{})
    .sort((a,b)=>+a[0].match(/\d+/)[0]-+b[0].match(/\d+/)[0])
    .forEach(([k,ans])=>{
      const i        = +k.match(/\d+/)[0];
      const question = qs[i]?.text || `Pregunta ${i+1}`;
      const cleanAns = String(ans).replace(/^[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ]+/, '');
      const linesQ = pdf.splitTextToSize(`${i+1}. ${question}`, maxWidth);
      linesQ.forEach(line=>{
        pdf.text(line,10,y); y+=7;
        if (y>pdf.internal.pageSize.getHeight()-10){ pdf.addPage(); y=10; }
      });
      const linesA = pdf.splitTextToSize(cleanAns, maxWidth-80);
      linesA.forEach(line=>{
        pdf.text(`→ ${line}`,12,y); y+=7;
        if (y>pdf.internal.pageSize.getHeight()-10){ pdf.addPage(); y=10; }
      });
    });

  pdf.save(`Respuestas_${userName}_${ev}_intento${intNum}.pdf`);
}

// ───────────────────────────────────────────────────
// 8) Reiniciar intentos
async function resetAttemptsForEvaluation(uid,ev) {
  if (!confirm(`¿Reiniciar intentos de ${ev}?`)) return;
  const snap = await db.collection("responses")
    .where("userId","==",uid)
    .where("evaluationId","==",ev)
    .get();
  const batch = db.batch();
  snap.docs.forEach(d=>batch.delete(d.ref));
  await batch.commit();
  alert("Intentos reiniciados.");
}

// ───────────────────────────────────────────────────
// 9) PDF de encuesta (wrap + limpiar + numeración única)
async function downloadSurveyPDF(uid,ev) {
  const docs = allSurveys
    .filter(s=>s.userId===uid && s.evaluationId===ev)
    .sort((a,b)=>a.timestamp.toDate() - b.timestamp.toDate());
  if (!docs.length) {
    alert("Sin encuestas."); return;
  }
  const s        = docs[0];
  const userName = (await db.collection("users").doc(uid).get()).data().name;
  const qs = surveyQuestionsMap[ev]
          || surveyQuestionsMap["defaultSurvey"]
          || Object.values(surveyQuestionsMap)[0]
          || [];

  const pdf = new jsPDF();
  let y = 10;
  pdf.setFont("helvetica"); pdf.setFontSize(14);
  pdf.text(`Nombre: ${userName}`,10,y);                      y+=10;
  pdf.text(`Encuesta: ${allEvaluations[ev]?.name||ev}`,10,y); y+=12;
  pdf.setFont("helvetica"); pdf.setFontSize(12);

  const maxWidth = pdf.internal.pageSize.getWidth() - 20;
  Object.entries(s.surveyData||{})
    .sort((a,b)=>+a[0].match(/\d+/)[0]-+b[0].match(/\d+/)[0])
    .forEach(([k,ans])=>{
      const idx = +k.match(/\d+/)[0];
      // eliminamos número repetido en texto de pregunta
      const rawQ = qs[idx]?.text || `Pregunta ${idx+1}`;
      const questionClean = rawQ.replace(/^\d+\.\s*/, '');
      const linesQ = pdf.splitTextToSize(`${idx+1}. ${questionClean}`, maxWidth);
      linesQ.forEach(line=>{
        pdf.text(line,10,y); y+=7;
        if (y>pdf.internal.pageSize.getHeight()-10){ pdf.addPage(); y=10; }
      });
      const cleanAns = String(ans).replace(/^[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ]+/, '');
      const linesA = pdf.splitTextToSize(cleanAns, maxWidth-80);
      linesA.forEach(line=>{
        pdf.text(`→ ${line}`,12,y); y+=7;
        if (y>pdf.internal.pageSize.getHeight()-10){ pdf.addPage(); y=10; }
      });
    });

  pdf.save(`Encuesta_${userName}_${ev}.pdf`);
}

// ───────────────────────────────────────────────────
// 10) Generar certificado (solo cambia nombre de archivo)
async function generateCertificateForUser(uid, evaluationID, score, approvalDate) {
  try {
    // datos usuario
    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists) throw new Error("Usuario no encontrado");
    const { name: userNameDB, rut, company, customID } = userSnap.data();
    // datos evaluación
    const evalSnap = await db.collection("evaluations").doc(evaluationID).get();
    if (!evalSnap.exists) throw new Error("Evaluación no encontrada");
    const evalData           = evalSnap.data();
    const evaluationName     = evalData.name;
    const evaluationTime     = evalData.timeEvaluation;
    const certificateTemplate= evalData.certificateTemplate;
    const evaluationIDNumber = evalData.ID;
    // ID dinámico
    const [d,m,y]    = approvalDate.split('-');
    const year       = new Date(`${y}-${m}-${d}`).getFullYear();
    const certificateID = `${evaluationIDNumber}${customID}${year}`;

    // carga plantilla
    const tplBytes = await fetch(certificateTemplate).then(r=>r.arrayBuffer());
    const pdfDoc   = await PDFLib.PDFDocument.load(tplBytes);
    pdfDoc.registerFontkit(fontkit);

    // fuentes
    const monoBytes   = await fetch("fonts/MonotypeCorsiva.ttf").then(r=>r.arrayBuffer());
    const perpBytes   = await fetch("fonts/Perpetua.ttf").then(r=>r.arrayBuffer());
    const perpItBytes = await fetch("fonts/PerpetuaItalic.ttf").then(r=>r.arrayBuffer());
    const monotypeFont       = await pdfDoc.embedFont(monoBytes);
    const perpetuaFont       = await pdfDoc.embedFont(perpBytes);
    const perpetuaItalicFont = await pdfDoc.embedFont(perpItBytes);

    // página
    const page  = pdfDoc.getPages()[0];
    const { width, height } = page.getSize();
    const centerText = (txt, yPos, font, size) => {
      const wTxt = font.widthOfTextAtSize(txt, size);
      page.drawText(txt, { x:(width-wTxt)/2, y:yPos, font, size, color:PDFLib.rgb(0,0,0) });
    };
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

    // pintar campos
    centerText(userNameDB,           height-295, monotypeFont,       35);
    centerText(`RUT: ${rut}`,        height-340, perpetuaItalicFont, 19);
    centerText(`Empresa: ${company}`,height-360, perpetuaItalicFont, 19);

    const maxW2 = width-100;
    const lines = wrapText(evaluationName, monotypeFont, 34, maxW2);
    let y0 = height-448;
    for (const l of lines) {
      centerText(l, y0, monotypeFont, 34);
      y0 -= 40;
    }

    page.drawText(`Fecha de Aprobación: ${approvalDate}`, {
      x:147, y:height-548, size:12, font:perpetuaFont, color:PDFLib.rgb(0,0,0)
    });
    page.drawText(`Duración del Curso: ${evaluationTime}`, {
      x:157, y:height-562, size:12, font:perpetuaFont, color:PDFLib.rgb(0,0,0)
    });
    page.drawText(`ID: ${certificateID}`, {
      x:184, y:height-576, size:12, font:perpetuaFont, color:PDFLib.rgb(0,0,0)
    });

    // descargar
    const pdfBytes = await pdfDoc.save();
    const blob     = new Blob([pdfBytes], { type:"application/pdf" });
    const link     = document.createElement("a");
    link.href      = URL.createObjectURL(blob);
    link.download  = `Certificado ${evaluationName} - ${userNameDB}.pdf`;
    link.click();

  } catch (error) {
    console.error("Error generando certificado:", error);
    alert("No se pudo generar el certificado. Revisa la consola.");
  }
}

