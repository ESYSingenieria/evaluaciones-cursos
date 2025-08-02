// dashboard-admin.js

// ───────────────────────────────────────────────────
// 🔒 Panel de Administración
// ───────────────────────────────────────────────────

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
// App secundaria para crear usuarios sin afectar el auth principal
const secondaryApp  = firebase.initializeApp(firebaseConfig, "Secondary");
const secondaryAuth = secondaryApp.auth();

const db   = firebase.firestore();
const { jsPDF } = window.jspdf;
// (Asegúrate de incluir en tu HTML PDF-Lib y fontkit si usas certificados)

// ───────────────────────────────────────────────────
// 2) Caché y estados de filtros/orden
let allUsers           = [];
let allEvaluations     = {};
let allResponses       = [];
let allSurveys         = [];
let surveyQuestionsMap = {};

let searchName    = "";
let filterCourse  = "all";
let filterCompany = "all";
let sortBy        = "dateDesc";

// ───────────────────────────────────────────────────
// 3) Auth & carga inicial
auth.onAuthStateChanged(async user => {
  if (!user) {
    location.href = "index.html";
    return;
  }
  const perfilSnap = await db.collection("users").doc(user.uid).get();
  const role       = perfilSnap.data()?.role;
  if (role === "admin" && !location.pathname.includes("dashboard-admin.html")) {
    location.href = "dashboard-admin.html"; return;
  }
  if (role !== "admin" && location.pathname.includes("dashboard-admin.html")) {
    location.href = "dashboard.html"; return;
  }
  if (location.pathname.includes("dashboard-admin.html")) {
    await initializeData();
    setupFiltersUI();
    loadAllUsers();
  }
});

// ───────────────────────────────────────────────────
// AGREGAR: listener para cierre de sesión
document.addEventListener('DOMContentLoaded', () => {
  const btnLogout = document.getElementById('logoutButton');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      await auth.signOut();
      location.href = 'index.html';
    });
  }

  // Delegación para editar/guardar/cancelar inline con asignación de evaluaciones
  document.body.addEventListener('click', async e => {
    // 1) Asegurarnos de que click viene de un <button>
    const btn = e.target.closest('button');
    if (!btn) return;

    // 2) Buscar la fila de usuario
    const row = btn.closest('.user-item');
    if (!row) return;

    // 3) Leer el UID del row (ahí sí existe)
    const uid = row.dataset.uid;

    // — EDITAR:
    if (btn.matches('.edit-user-btn')) {
      // 1) Mostrar contenedor de edición
      const editCont = row.querySelector('.edit-container');
      editCont.style.display = 'block';

      // 2) Ocultar vista estática (los field-container que NO están dentro de edit-container)
      row.querySelectorAll('.field-container').forEach(fc => {
        if (!fc.closest('.edit-container')) {
          fc.style.display = 'none';
        }
      });

      // 3) Ajustar botones
      btn.style.display                         = 'none';
      row.querySelector('.save-user-btn').style.display   = 'inline-block';
      row.querySelector('.cancel-user-btn').style.display = 'inline-block';

      // 4) Marcar checkboxes según lo que tenga el usuario
      const current = allUsers.find(u => u.id === uid).assignedEvaluations || [];
      editCont.querySelectorAll('input[name="assignedEvals"]').forEach(cb => {
        cb.checked = current.includes(cb.value);
      });

      return;
    }

    // — CANCELAR:
    if (btn.matches('.cancel-user-btn')) {
      // 1) Ocultar edición
      const editCont = row.querySelector('.edit-container');
      editCont.style.display = 'none';

      // 2) Mostrar vista estática
      row.querySelectorAll('.field-container').forEach(fc => {
        if (!fc.closest('.edit-container')) {
          fc.style.display = '';
        }
      });

      // 3) Restaurar botones
      row.querySelector('.edit-user-btn').style.display   = 'inline-block';
      row.querySelector('.save-user-btn').style.display   = 'none';
      btn.style.display                                   = 'none';

      return;
    }

    // — GUARDAR:
    if (btn.matches('.save-user-btn')) {
      const editCont = row.querySelector('.edit-container');
      const updates = {};

      // 1) Leer inputs de texto (.edit-field)
      editCont.querySelectorAll('input.edit-field').forEach(inp => {
        updates[inp.name] = inp.value.trim();
      });

      // 2) Leer checkboxes marcados
      updates.assignedEvaluations = Array.from(
        editCont.querySelectorAll('input[name="assignedEvals"]:checked')
      ).map(cb => cb.value);

      // 3) Persistir
      await db.collection('users').doc(uid).update(updates);

      // 4) Volver a cargar la lista completa
      alert('Usuario actualizado');
      loadAllUsers();
      return;
    }

      row.querySelector('.edit-evals-container').style.display = 'none';

      // 5) Restaurar botones y recargar lista
      row.querySelector('.edit-user-btn'  ).style.display = '';
      btn.style.display                             = 'none';
      row.querySelector('.cancel-user-btn').style.display = 'none';
      alert('Usuario actualizado');
      loadAllUsers();
    
  });
  
  // 1) Mostrar formulario y poblar select de evaluaciones
  const createBtn = document.getElementById('createUserBtn');
  const form      = document.getElementById('createUserForm');
  const cancelBtn = document.getElementById('cancelCreateUser');
  const saveBtn   = document.getElementById('saveCreateUser');
  const selEvals  = document.getElementById('newAssignedEvals');

  createBtn.addEventListener('click', () => {
  // PARA CREACIÓN
  const newContainer = document.getElementById('newEvalsContainer');
  newContainer.innerHTML = Object.entries(allEvaluations)
    .map(([id, ev]) => `
      <label class="eval-option">
      <input type="checkbox" name="newAssignedEvals" value="${id}">
        <span>${id}</span>
      </label>
    `).join('');
    form.style.display = 'block';
  });

  // 2) Cancelar creación
  cancelBtn.addEventListener('click', () => {
    form.style.display = 'none';
  });

  // 3) Guardar nuevo usuario
  saveBtn.addEventListener('click', async () => {
    const email    = document.getElementById('newEmail').value.trim();
    const pwd      = document.getElementById('newPassword').value.trim();
    const name     = document.getElementById('newName').value.trim();
    const rut      = document.getElementById('newRut').value.trim();
    const company  = document.getElementById('newCompany').value.trim();
    // Crear usuario:
    const evs = Array.from(
      document.querySelectorAll('input[name="newAssignedEvals"]:checked')
    ).map(cb => cb.value);

    try {
      // 1) Crear usuario en App secundaria
      const { user } = await secondaryAuth
                             .createUserWithEmailAndPassword(email, pwd);

      // 2) Guardar datos en Firestore
      await db.collection('users').doc(user.uid).set({
        name,
        rut,
        company,
        customID: '',       // genera o asigna aquí tu lógica
        role: 'user',
        assignedEvaluations: evs
      });

      // 3) Cerrar sesión de la App secundaria
      await secondaryAuth.signOut();

      // 4) Refrescar lista y ocultar formulario
      await initializeData();
      loadAllUsers();
      form.style.display = 'none';
      alert('Usuario creado correctamente');
    } catch (err) {
      console.error(err);
      alert('Error al crear usuario: ' + err.message);
    }
  });
});  // <-- aquí

const themeToggle = document.getElementById('themeToggle');
if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const dark = document.body.classList.toggle('dark');
    themeToggle.textContent = dark ? '☀️' : '🌙';
    localStorage.setItem('darkMode', dark);
  });
  if (localStorage.getItem('darkMode') === 'true') {
    document.body.classList.add('dark');
    themeToggle.textContent = '☀️';
  }
}

// ───────────────────────────────────────────────────
// 4) Precarga de datos
async function initializeData() {
  // usuarios
  const usSnap = await db.collection("users").where("role","==","user").get();
  allUsers = usSnap.docs.map(d=>({ id:d.id, ...d.data() }));

  // evaluations
  const evSnap = await db.collection("evaluations").get();
  evSnap.docs.forEach(d=> allEvaluations[d.id] = d.data());

  // responses
  const rSnap = await db.collection("responses").get();
  allResponses = rSnap.docs.map(d=>{
    const data = d.data();
    return {
      userId:       data.userId,
      evaluationId: data.evaluationId,
      timestamp:    data.timestamp?.toDate() || new Date(0),
      result:       data.result || {},
      answers:      data.answers || {}
    };
  });

  // surveys + surveyQuestions
  const sSnap  = await db.collection("surveys").get();
  allSurveys   = sSnap.docs.map(d=>({ id:d.id, ...d.data() }));
  const sqSnap = await db.collection("surveyQuestions").get();
  sqSnap.docs.forEach(d=>{
    surveyQuestionsMap[d.id] = d.data().questions || [];
  });
}

// ───────────────────────────────────────────────────
// 5) UI de filtros
function setupFiltersUI() {
  if (document.getElementById("filtersBar")) return;
  const bar = document.createElement("div");
  bar.id = "filtersBar";
  bar.style = "margin:16px 0; display:flex; justify-content:center; align-items:center; gap:12px; flex-wrap:wrap; padding:12px 0; background:#f9f9f9; border-bottom:1px solid #e0e0e0;";
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
  document.querySelector("h1").insertAdjacentElement("afterend", bar);

  // poblar cursos (por nombre único)
  const seenNames = new Set();
  Object.entries(allEvaluations).forEach(([code,data])=>{
    const name = data.name || code;
    if (!seenNames.has(name)) {
      seenNames.add(name);
      bar.querySelector("#f_course")
         .innerHTML += `<option value="${code}">${name}</option>`;
    }
  });

  // poblar empresas
  [...new Set(allUsers.map(u=>u.company).filter(Boolean))]
    .forEach(co=>{
      bar.querySelector("#f_company")
         .innerHTML += `<option value="${co}">${co}</option>`;
    });

  // listeners
  bar.querySelector("#f_search")
     .addEventListener("input", e=>{
       searchName = e.target.value.toLowerCase();
       loadAllUsers();
     });
  bar.querySelector("#f_course")
     .addEventListener("change", e=>{
       filterCourse = e.target.value;
       loadAllUsers();
     });
  bar.querySelector("#f_company")
     .addEventListener("change", e=>{
       filterCompany = e.target.value;
       loadAllUsers();
     });
  bar.querySelector("#f_sort")
     .addEventListener("change", e=>{
       sortBy = e.target.value;
       loadAllUsers();
     });
}

function loadAllUsers() {
  const container = document.getElementById("usersList");
  container.innerHTML = "";

  // 1) Filtrar
  const filtered = allUsers.filter(u => {
    if (searchName && !u.name.toLowerCase().includes(searchName)) return false;
    if (filterCompany !== "all" && u.company !== filterCompany) return false;
    if (filterCourse  !== "all" && !u.assignedEvaluations.includes(filterCourse)) return false;
    return true;
  });

  // 2) Calcular última fecha válida
  filtered.forEach(u => {
    const times = allResponses
      .filter(r => r.userId === u.id && typeof r.result?.score === "number")
      .map(r => r.timestamp.getTime());
    u._lastTime = times.length ? Math.max(...times) : 0;
  });

  // 3) Ordenar
  filtered.sort((a, b) => {
    switch (sortBy) {
      case "dateDesc":     return b._lastTime - a._lastTime;
      case "dateAsc":      return a._lastTime - b._lastTime;
      case "customIdDesc": return (+b.customID||0) - (+a.customID||0);
      case "customIdAsc":  return (+a.customID||0) - (+b.customID||0);
      default:             return 0;
    }
  });

  // 4) Sin resultados
  if (!filtered.length) {
    container.textContent = "No se encontraron usuarios.";
    return;
  }

  // 5) Renderizar cada usuario
  filtered.forEach(u => {
    // Fila contenedora
    const row = document.createElement("div");
    row.className = "user-item";
    row.dataset.uid = u.id;

    // ==== HTML estático (modo “view”) ====
    const staticHtml = `
      <div class="field-container"><strong>Nombre:</strong> <span class="field">${u.name}</span></div>
      <div class="field-container"><strong>RUT:</strong>    <span class="field">${u.rut}</span></div>
      <div class="field-container"><strong>CustomID:</strong><span class="field">${u.customID}</span></div>
      <div class="field-container"><strong>Empresa:</strong> <span class="field">${u.company}</span></div>

      <div class="buttons" style="margin:8px 0;">
        <button class="edit-user-btn">✏️</button>
        <button class="save-user-btn" style="display:none;">✔️</button>
        <button class="cancel-user-btn" style="display:none;">✖️</button>
      </div>
    `;

    // ==== HTML edición (modo “edit”), parte oculta inicialmente ====
    // 5.1) Inputs para campos
    const inputsHtml = `
      <div class="field-container"><input type="text" name="name"     value="${u.name}"     class="edit-field" /></div>
      <div class="field-container"><input type="text" name="rut"      value="${u.rut}"      class="edit-field" /></div>
      <div class="field-container"><input type="text" name="customID" value="${u.customID}" class="edit-field" /></div>
      <div class="field-container"><input type="text" name="company"  value="${u.company}"  class="edit-field" /></div>
    `;

    // 5.2) Checkboxes solo con el ID de documento
    const checkedSet = new Set(u.assignedEvaluations || []);
    const checkboxesHtml = Object.entries(allEvaluations)
      .map(([id]) => `
        <label class="eval-option" style="display:flex;align-items:center;margin:4px 0;cursor:pointer;">
          <input type="checkbox"
                 name="assignedEvals"
                 value="${id}"
                 ${checkedSet.has(id) ? "checked" : ""}
                 style="margin-right:8px;">
          <span>${id}</span>
        </label>
      `).join("");

    const editHtml = `
      <div class="edit-container" style="display:none; padding-top:12px; border-top:1px solid #eee;">
        ${inputsHtml}
        <div class="evals-container" style="max-height:150px; overflow-y:auto; border:1px solid #ddd; padding:4px; border-radius:4px;">
          ${checkboxesHtml}
        </div>
      </div>
    `;

    // 5.3) Placeholder para el resumen de evaluaciones (modo “view”)
    const summaryHtml = `<div class="eval-summary" style="margin-top:12px;"></div>`;

    // Juntamos todo e inyectamos
    row.innerHTML = staticHtml + editHtml + summaryHtml;
    container.appendChild(row);

    // ==== Llenar el resumen de evaluación (botones) ====
    const summaryContainer = row.querySelector(".eval-summary");
    u.assignedEvaluations.forEach(ev => {
      const eData = allEvaluations[ev] || {};
      const eName = eData.name || ev;
      const evalDiv = document.createElement("div");
      evalDiv.className = "eval-item";
      evalDiv.style.marginBottom = "8px";
      evalDiv.innerHTML = `<strong>${eName}</strong><br>`;

      // 1) Botones de intento
      const valids = allResponses
        .filter(r => r.userId===u.id && r.evaluationId===ev && typeof r.result?.score==="number")
        .sort((a,b)=>a.timestamp - b.timestamp);
      valids.forEach((r,i) => {
        const btn = document.createElement("button");
        btn.textContent = `Respuestas Intento ${i+1}`;
        btn.onclick = () => downloadResponsePDFForAttempt(u.id, ev, i);
        evalDiv.appendChild(btn);
      });

      // 2) Reiniciar
      const btnR = document.createElement("button");
      btnR.textContent = "Reiniciar Intentos";
      btnR.onclick = () => resetAttemptsForEvaluation(u.id, ev);
      evalDiv.appendChild(btnR);

      // 3) Encuesta
      const btnS = document.createElement("button");
      btnS.textContent = "Encuesta de Satisfacción";
      btnS.onclick = () => downloadSurveyPDF(u.id, ev);
      evalDiv.appendChild(btnS);

      // 4) Certificado si aprobó
      const passed = valids.find(r => r.result.grade==="Aprobado");
      if (passed) {
        const score   = passed.result.score;
        const dateStr = new Date(passed.timestamp).toLocaleDateString();
        const btnC = document.createElement("button");
        btnC.textContent = "Certificado de Aprobación";
        btnC.onclick = () => generateCertificateForUser(u.id, ev, score, dateStr);
        evalDiv.appendChild(btnC);
      }

      summaryContainer.appendChild(evalDiv);
    });
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


