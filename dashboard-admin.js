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

 // Delegación para editar/guardar/cancelar inline
  document.body.addEventListener('click', async e => {
    const btn = e.target;
    const uid = btn.dataset.uid;
    if (!uid) return;
    const row = btn.closest('.user-item');

    // 1) ✏️ Editar: por cada field-container, oculta el span y añade un input
    if (btn.matches('.edit-user-btn')) {
      row.querySelectorAll('.field-container').forEach(fc => {
        const span = fc.querySelector('.field');
        const val  = span.textContent;
        span.style.display = 'none';
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'inline-input';
        inp.name = span.dataset.field;
        inp.value = val;
        fc.appendChild(inp);
      });
      btn.style.display                   = 'none';
      row.querySelector('.save-user-btn').style.display   = '';
      row.querySelector('.cancel-user-btn').style.display = '';
    }

    // 2) ✖️ Cancelar: elimina inputs, muestra spans originales
    if (btn.matches('.cancel-user-btn')) {
      row.querySelectorAll('.field-container').forEach(async fc => {
        const key = fc.querySelector('.field').dataset.field;
        const data = (await db.collection('users').doc(uid).get()).data();
        fc.querySelector('.field').textContent = data[key] || '';
        fc.querySelector('.field').style.display = '';
        const inp = fc.querySelector('.inline-input');
        if (inp) inp.remove();
      });
      row.querySelector('.edit-user-btn').style.display   = '';
      btn.style.display                                   = 'none';
      row.querySelector('.save-user-btn').style.display   = 'none';
    }

    // 3) ✔️ Guardar: toma valores de inputs, actualiza Firestore y reconstruye spans
    if (btn.matches('.save-user-btn')) {
      const updates = {};
      row.querySelectorAll('.inline-input').forEach(inp => {
        updates[inp.name] = inp.value.trim();
      });
      await db.collection('users').doc(uid).update(updates);
      row.querySelectorAll('.field-container').forEach(fc => {
        const key = fc.querySelector('.field').dataset.field;
        fc.querySelector('.field').textContent = updates[key];
        fc.querySelector('.field').style.display = '';
        const inp = fc.querySelector('.inline-input');
        if (inp) inp.remove();
      });
      row.querySelector('.edit-user-btn').style.display   = '';
      btn.style.display                                   = 'none';
      row.querySelector('.cancel-user-btn').style.display = 'none';
      alert('Usuario actualizado');
    }
  });

    // 3) Mostrar/ocultar el formulario
  const btnCreate    = document.getElementById('createUserBtn');
  const formCreate   = document.getElementById('createUserForm');
  const btnCancel    = document.getElementById('cancelCreateUser');
  const btnSave      = document.getElementById('saveCreateUser');

  btnCreate.addEventListener('click', () => {
    formCreate.style.display = 'block';
  });
  btnCancel.addEventListener('click', () => {
    formCreate.style.display = 'none';
  });

    // Devuelve el próximo CustomID: número mayor + 1 y un guion
  function generateNextCustomID() {
    let max = 0;
    allUsers.forEach(u => {
      const cid = String(u.customID||'').replace(/[^0-9]/g, '');
      const n = parseInt(cid, 10);
      if (!isNaN(n) && n > max) max = n;
    });
    return (max + 1) + '-';
  }

  btnCreate.addEventListener('click', () => {
    // 1) Generar el próximo CustomID y rellenar el input
    document.getElementById('newCustomId').value = generateNextCustomID();

    // 2) Poblar el multi-select con todas las evaluaciones
    const sel = document.getElementById('newAssignedEvals');
    sel.innerHTML = Object.entries(allEvaluations)
      .map(([id, ev]) => <option value="${id}">${ev.name}</option>)
      .join('');

    // 3) Mostrar el formulario
    formCreate.style.display = 'block';
  });

    // Formateo automático de RUT: miles con puntos y guion + dígito verificador
  const rutInput = document.getElementById('newRut');
  rutInput.addEventListener('input', e => {
    e.target.value = formatRut(e.target.value);
  });

  function formatRut(value) {
    // eliminamos todo menos dígitos y K
    let v = value.replace(/[^0-9kK]/g, '').toUpperCase();
    const dv = v.slice(-1);
    let nums = v.slice(0, -1);
    if (!v) return '';
    if (v.length === 1) {
      // aún solo dígito verificador
      return v;
    }
    // si no hay dv separado, suponemos último carácter como dv
    if (!/[0-9K]/.test(dv)) {
      nums = v;
    }
    // formatear miles: invertimos, agrupamos de a 3, volcamos
    const rev = nums.split('').reverse().join('');
    const groups = rev.match(/.{1,3}/g) || [];
    const formattedNums = groups.join('.').split('').reverse().join('');
    return formattedNums + (dv ? '-' + dv : '');
  }
  
  // 4) Crear usuario en Auth + Firestore
  btnSave.addEventListener('click', async () => {
    const email    = document.getElementById('newEmail').value.trim();
    const name     = document.getElementById('newName').value.trim();
    const rut      = document.getElementById('newRut').value.trim();
    const customID = document.getElementById('newCustomId').value;
    const company  = document.getElementById('newCompany').value.trim();
    const password = document.getElementById('newPassword').value.trim() || '123456';

    if (!email || !name || !rut || !company || !password) {
      return alert('Se tienen que llenar todos los campos.');
    }

      // dentro de btnSave… antes de auth.createUser…
    const assignedEvals = Array.from(
      document.getElementById('newAssignedEvals').selectedOptions
    ).map(o => o.value);

    try {
      // 4.1) crea en Auth
      // usa el auth secundario: la sesión principal (admin) NO cambia
      const cred = await secondaryAuth.createUserWithEmailAndPassword(email, password);

      // 4.2) usa el uid para crear el doc en Firestore
      await db.collection('users').doc(cred.user.uid).set({
        name,
        rut,
        customID,
        company,
        role: 'user',
        assignedEvaluations: assignedEvals
      });
      
      // 3) Limpiar la sesión secundaria
      await secondaryAuth.signOut();
      
      alert('Usuario creado correctamente.\nContraseña por defecto: 123456');
      formCreate.style.display = 'none';
      loadAllUsers();  // refresca la lista
    } catch (err) {
      console.error(err);
      alert('Error creando usuario: ' + err.message);
    }
  });
  
});  // <-- aquí

// Theme toggle
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

// ───────────────────────────────────────────────────
// 6) Render de usuarios con filtros + orden
function loadAllUsers() {
  const container = document.getElementById("usersList");
  container.innerHTML = "";

  let filtered = allUsers.filter(u=>{
    if (searchName && !u.name.toLowerCase().includes(searchName)) return false;
    if (filterCompany!=="all" && u.company!==filterCompany)        return false;
    if (filterCourse!=="all" && !u.assignedEvaluations.includes(filterCourse)) return false;
    return true;
  });

  // calcular última fecha de intento válido
  filtered.forEach(u=>{
    const times = allResponses
      .filter(r=>r.userId===u.id && typeof r.result?.score==="number")
      .map(r=>r.timestamp.getTime());
    u._lastTime = times.length ? Math.max(...times) : 0;
  });

  // ordenar
  filtered.sort((a,b)=>{
    switch(sortBy){
      case "dateDesc":      return b._lastTime - a._lastTime;
      case "dateAsc":       return a._lastTime - b._lastTime;
      case "customIdDesc":  return (+b.customID||0) - (+a.customID||0);
      case "customIdAsc":   return (+a.customID||0) - (+b.customID||0);
      default: return 0;
    }
  });

  // sin resultados
  if (!filtered.length) {
    container.textContent = "No se encontraron usuarios.";
    return;
  }

  // render
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
      <button class="edit-user-btn">✏️</button>
      <button class="save-user-btn" style="display:none;">✔️</button>
      <button class="cancel-user-btn" style="display:none;">✖️</button>
      <div class="edit-evals-container" style="display:none; margin:12px 0;">
        <select class="edit-assigned-evals" multiple
                style="width:100%;height:100px;padding:4px;">
          ${Object.entries(allEvaluations)
             .map(([id,ev])=>`<option value="${id}">${ev.name}</option>`)
             .join('')}
        </select>
      </div>
    `;
    u.assignedEvaluations.forEach(ev=>{
      const eData = allEvaluations[ev] || {};
      const eName = eData.name || ev;
      const evalDiv = document.createElement("div");
      evalDiv.className = "eval-item";
      evalDiv.innerHTML = `<strong>${eName}</strong><br>`;

      // respuestas válidas
      const valids = allResponses
        .filter(r=>r.userId===u.id && r.evaluationId===ev && typeof r.result?.score==="number")
        .sort((a,b)=>a.timestamp - b.timestamp);

      // botones intentos
      valids.forEach((r,i)=>{
        const btn = document.createElement("button");
        btn.textContent = `Respuestas Evaluación Intento ${i+1}`;
        btn.onclick = ()=> downloadResponsePDFForAttempt(u.id,ev,i);
        evalDiv.appendChild(btn);
      });

      // reiniciar
      const btnR = document.createElement("button");
      btnR.textContent = "Reiniciar Intentos";
      btnR.onclick = ()=> resetAttemptsForEvaluation(u.id,ev);
      evalDiv.appendChild(btnR);

      // encuesta
      const btnS = document.createElement("button");
      btnS.textContent = "Encuesta de Satisfacción";
      btnS.onclick = ()=> downloadSurveyPDF(u.id,ev);
      evalDiv.appendChild(btnS);

      // certificado
      const passed = valids.find(r=>r.result.grade==="Aprobado");
      if (passed) {
        const score   = passed.result.score;
        const dateStr = passed.timestamp.toLocaleDateString();
        const btnC = document.createElement("button");
        btnC.textContent = "Certificado de Aprobación";
        btnC.onclick = ()=> generateCertificateForUser(u.id,ev,score,dateStr);
        evalDiv.appendChild(btnC);
      }

      div.appendChild(evalDiv);
    });
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
