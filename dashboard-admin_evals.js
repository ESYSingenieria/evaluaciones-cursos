// ===== Utilitarios =====
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };

function sanitizeDocId(s=''){
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9._-]+/g,'_')
    .replace(/_{2,}/g,'_').replace(/^_+|_+$/g,'');
}
async function nextVersionFromExact(docIdExact){
  const m = /\.v(\d+)$/i.exec(docIdExact);
  const base = m ? docIdExact.replace(/\.v\d+$/i,'') : docIdExact;
  let current = m ? parseInt(m[1],10) : 1;
  while(true){
    const candidate = `${base}.v${current+1}`;
    /* eslint-disable no-await-in-loop */
    const snap = await firebase.firestore().collection('evaluations').doc(candidate).get();
    if(!snap.exists) return candidate;
    current++;
  }
}
function versionFromDocId(docId){
  const m = /\.v(\d+)$/i.exec(docId || ''); return m ? parseInt(m[1],10) : 1;
}
function stripPrefixAndExt(url, prefix, ext){
  if(!url) return '';
  let s = url;
  if(prefix && s.startsWith(prefix)) s = s.slice(0+prefix.length);
  if(ext && s.toLowerCase().endsWith(ext.toLowerCase())) s = s.slice(0, -ext.length);
  return s;
}
function fmtDate(d){
  if(!d) return 's/f';
  try { return new Date(d).toLocaleDateString(); } catch { return 's/f'; }
}
function parseDateAny(v){
  if(!v) return null;
  if (v.toDate) return v.toDate();      // Firestore Timestamp
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string') {
    // "YYYY-MM-DD"
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
    if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`);
    const d = new Date(v);
    if (!isNaN(d)) return d;
  }
  return null;
}
function addDaysStr(yyyyMmDd, days){
  const d = new Date(`${yyyyMmDd}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0,10);
}

function getCourseDaysFromKey(courseKey){
  // lee horas declaradas en evaluations.timeEvaluation (p.ej. "16 HRS.")
  const found = (allEvaluations || []).find(x => x.docId === courseKey);
  const raw = found?.data?.timeEvaluation || '';
  const m = /(\d+)/.exec(raw);
  const hours = m ? parseInt(m[1],10) : 16;    // por defecto 16h
  return Math.max(1, Math.ceil(hours / 8));    // 8h por día → 16h => 2 días
}

function firstDateFromAttendance(att = {}){
  const dates = Object.keys(att)
    .map(k => (k.match(/^(\d{4}-\d{2}-\d{2})_/)||[])[1])
    .filter(Boolean)
    .sort();
  return dates[0] || null;
}

/**
 * Remapea asistencia para N días (cada día AM/PM).
 * - Usa oldStart si existe; si no, infiere del primer día presente en las claves.
 * - Devuelve SOLO las nuevas claves (no deja “basura” de fechas viejas).
 */
function remapAttendanceRange(att = {}, oldStart, newStart, numDays){
  const baseOld = oldStart || firstDateFromAttendance(att) || newStart;
  const out = {};
  for (let i = 0; i < numDays; i++){
    const oldDay = addDaysStr(baseOld, i);
    const newDay = addDaysStr(newStart, i);
    for (const suf of ['_AM','_PM']){
      const oldKey = `${oldDay}${suf}`;
      const newKey = `${newDay}${suf}`;
      const v = Object.prototype.hasOwnProperty.call(att, oldKey) ? !!att[oldKey] : false;
      out[newKey] = v;
    }
  }
  return out;
}

// ===== Render de tarjetas =====
function courseCardHTML({ docId, id, name, title, puntajeAprobacion, version }){
  return `
    <div class="course-card" data-doc="${docId}">
      <div class="actions">
        <button class="btn btn-sm btn-primary act-edit">Editar</button>
        <button class="btn btn-sm btn-neutral act-copy">Copiar</button>
        <button class="btn btn-sm btn-danger act-delete">Eliminar</button>
      </div>
      <div class="course-title">${title || name || '(Sin título)'}</div>
      <div class="meta">
        <span class="tag">ID: ${id || '-'}</span>
        <span class="tag">Aprobación: ${puntajeAprobacion || '-'}</span>
        <span class="tag">Versión: ${version}</span>
      </div>
    </div>
  `;
}

function surveyCardHTML({ docId, title, evaluationId, questions }){
  const qLen = Array.isArray(questions) ? questions.length : 0;
  return `
    <div class="course-card" data-survey="${docId}">
      <div class="actions">
        <button class="btn btn-sm btn-primary act-survey-edit">Editar</button>
        <button class="btn btn-sm btn-neutral act-survey-copy">Copiar</button>
        <button class="btn btn-sm btn-danger act-survey-delete">Eliminar</button>
      </div>
      <div class="course-title">${title || docId}</div>
      <div class="meta">
        <span class="tag">Base: ${evaluationId || 'default'}</span>
        <span class="tag">Preguntas: ${qLen}</span>
      </div>
    </div>
  `;
}

async function loadSurveys(){
  const snap = await firebase.firestore().collection('surveyQuestions').get().catch(()=>null);
  allSurveys = snap?.docs.map(d => ({ docId: d.id, ...d.data() })) || [];
  surveyNameById = {}; allSurveys.forEach(s=> surveyNameById[s.docId] = s.title || s.docId);
}

function renderSurveyList(){
  const q = ($('#searchCreated')?.value || '').toLowerCase().trim();
  const list = $('#createdList');
  const rows = (allSurveys || [])
    .filter(s=>{
      if(!q) return true;
      const inDoc = (s.docId||'').toLowerCase().includes(q);
      const inTitle = (s.title||'').toLowerCase().includes(q);
      const inEval = (s.evaluationId||'').toLowerCase().includes(q);
      const inQs = Array.isArray(s.questions) && s.questions.some(x => (x.text||'').toLowerCase().includes(q));
      return inDoc || inTitle || inEval || inQs;
    })
    .sort((a,b)=> (a.title||a.docId).localeCompare(b.title||b.docId))
    .map(surveyCardHTML)
    .join('');
  list.innerHTML = rows || '<div class="meta">No hay encuestas.</div>';
}

function renderCreatedOrSurveys(){
  if (isSurveyMode) renderSurveyList(); else renderCreatedList();
}

async function toggleSurveyMode(force){
  isSurveyMode = (typeof force === 'boolean') ? force : !isSurveyMode;
  // Título/botones
  const titleH2 = document.querySelector('.panel-card h2');
  if (titleH2) titleH2.firstChild.nodeValue = isSurveyMode ? 'Encuestas de Satisfacción' : 'Cursos Ofertados';
  $('#btnNewCourse').style.display = isSurveyMode ? 'none' : '';
  $('#btnNewSurvey').style.display = isSurveyMode ? '' : 'none';
  $('#searchCreated')?.setAttribute('placeholder',
    isSurveyMode ? 'Buscar por nombre, curso base o texto...' : 'Buscar por nombre o ID...'
  );
  // Datos
  if (isSurveyMode){ await loadSurveys(); renderSurveyList(); } else { renderCreatedList(); }
}

function historyCardHTML(item){
  return `
    <div class="course-card history-card" data-hdoc="${item.docId}">
      <div class="actions">
        <button class="btn btn-sm btn-primary act-h-edit">Editar</button>
        <button class="btn btn-sm btn-neutral act-h-stats">Estadísticas</button>
        <button class="btn btn-sm btn-danger act-h-del">Eliminar</button>
      </div>
      <div class="course-title">${item.courseName || '(Curso desconocido)'}</div>
      <div class="meta">
        <span class="tag">${fmtDate(item.date)}</span>
        <span class="tag">Forma: ${item.forma || 'abierto'}</span>
        ${item.empresa ? `<span class="tag">Empresa: ${item.empresa}</span>` : ''}
        <span class="tag">Participantes: ${item.participantsCount ?? 0}</span>
      </div>
    </div>
  `;
}

function buildHistoryDocId(courseKey, dateStr, forma, empresa){
  const empresaSlug = (forma === 'cerrado' && empresa) ? '_' + sanitizeDocId(empresa) : '';
  return `${courseKey}_${dateStr}_${forma}${empresaSlug}`;
}

// ===== Estado =====
let allEvaluations = [];     // [{docId, data}]
let evalNameByKey = {};      // { courseKey: name }
let allHistory = [];         // realizados (inscripciones)
let editingHistoryId = null; // id doc edicion o null si nuevo
// Encuestas
let isSurveyMode = false;
let allSurveys = [];             // [{docId, title, evaluationId, questions}]
let surveyNameById = {};         // { surveyDocId: title }
let editingSurveyId = null;

// ===== Cargar cursos creados =====
async function loadCreatedCourses(){
  const list = $('#createdList'); list.innerHTML = 'Cargando...';
  try{
    const snap = await firebase.firestore().collection('evaluations').get();
    allEvaluations = snap.docs.map(d => ({ docId: d.id, data: d.data() }));
    evalNameByKey = {};
    allEvaluations.forEach(({docId, data})=>{
      evalNameByKey[docId] = data.title || data.name || docId;
    });
    renderCreatedList();
    await loadHistoryCourses(); // ahora que tenemos el mapa, traemos realizados
  }catch(e){
    console.error(e); list.innerHTML = 'Error al cargar evaluaciones.';
  }
}
function renderCreatedList(){
  const q = ($('#searchCreated')?.value || '').toLowerCase().trim();
  const list = $('#createdList');
  const rows = allEvaluations
    .filter(({ docId, data }) => {
      if(!q) return true;
      return (docId||'').toLowerCase().includes(q) ||
             (data.name||'').toLowerCase().includes(q) ||
             (data.title||'').toLowerCase().includes(q) ||
             (data.ID||'').toLowerCase().includes(q);
    })
    .map(({ docId, data }) => courseCardHTML({
      docId,
      id: data.ID || '',
      name: data.name || '',
      title: data.title || data.name || '',
      puntajeAprobacion: data.puntajeAprobacion || '',
      version: versionFromDocId(docId)
    }))
    .join('');
  list.innerHTML = rows || '<div class="meta">No hay cursos creados.</div>';
}

// ===== Cargar CURSOS REALIZADOS (inscripciones) =====
async function loadHistoryCourses(){
  const list = $('#doneList'); list.innerHTML = 'Cargando...';
  const items = [];
  try{
    // Trae de 'inscripciones' y también de 'inscriptions' si existiera
    const colNames = ['inscripciones'];
    for (const col of colNames){
      /* eslint-disable no-await-in-loop */
      const snap = await firebase.firestore().collection(col).get().catch(()=>null);
      if(!snap || snap.empty) continue;
      snap.forEach(d=>{
        const r = d.data() || {};

        // --- NOMBRES que maneja tu BD (ES) y fallback (EN) ---
        const courseKey = r.courseKey || r.courseId || r.course || '';
        const date = parseDateAny(r.courseDate) || parseDateAny(r.date);
        const forma = r.formaCurso || r.forma || r.mode || 'abierto';
        const empresa = r.empresaSolicitante || r.empresa || r.company || '';

        // participantes: 'inscriptions' (array) o variantes
        let participants = r.inscriptions || r.participants || r.users || r.alumnos || [];
        if (participants && !Array.isArray(participants) && typeof participants === 'object') {
          participants = Object.values(participants);
        }
        const participantsCount = Array.isArray(participants) ? participants.length : 0;

        const courseName = evalNameByKey[courseKey] || '(Curso desconocido)';
        const surveyId = r.surveyId || ''; // toma la clave de encuesta si existe

        items.push({
          docId: d.id, courseKey, courseName, date, forma, empresa, participants, participantsCount, surveyId
        });
      });
    }

    // Ordenar por fecha desc si la hubiera
    items.sort((a,b)=> (b.date?.getTime?.()||0) - (a.date?.getTime?.()||0));

    allHistory = items;
    renderHistoryList();
  }catch(e){
    console.error(e); list.innerHTML = 'Error al cargar cursos realizados.';
  }
}
function renderHistoryList(){
  const q = ($('#searchDone')?.value || '').toLowerCase().trim();
  const list = $('#doneList');
  const rows = allHistory
    .filter(it=>{
      if(!q) return true;
      return (it.courseName||'').toLowerCase().includes(q) ||
             (it.empresa||'').toLowerCase().includes(q) ||
             fmtDate(it.date).toLowerCase().includes(q);
    })
    .map(historyCardHTML)
    .join('');
  list.innerHTML = rows || '<div class="meta">No hay cursos realizados aún.</div>';
}

// ===== Editor de cursos creados =====
function makeQuestion(q={ text:'', options:[''], correct:'' }){
  const qid = 'q' + Math.random().toString(36).slice(2,9);
  const wrap = document.createElement('div');
  wrap.className = 'q-card';
  wrap.dataset.qid = qid;

  wrap.innerHTML = `
    <div class="q-head">
      <div class="q-title"><span class="q-number">#</span> Enunciado de Pregunta</div>
      <button type="button" class="small-btn q-del">Eliminar pregunta</button>
    </div>

    <div class="field">
      <input class="q-text" type="text" placeholder="Escribe la pregunta..." value="${(q.text||'').replace(/"/g,'&quot;')}">
    </div>

    <div class="q-sub">Alternativas:</div>
    <div class="q-options"></div>
    <div class="q-add-wrap" style="margin-top:8px"></div>
  `;

  const optBox = wrap.querySelector('.q-options');
  const addWrap = wrap.querySelector('.q-add-wrap');

  function addOption(val='', isCorrect=false){
    const r = document.createElement('div');
    r.className = 'q-row';
    r.innerHTML = `
      <input class="opt-text" type="text" placeholder="Texto de la opción" value="${(val||'').replace(/"/g,'&quot;')}">
      <label class="correct-wrap" style="display:flex;align-items:center;gap:6px;white-space:nowrap;">
        <input type="radio" class="opt-correct" name="correct-${qid}"> Correcta
      </label>
      <button type="button" class="small-btn q-del-opt">Quitar</button>
    `;
    const radio = r.querySelector('.opt-correct');
    radio.checked = !!isCorrect;
    r.querySelector('.q-del-opt').addEventListener('click', ()=> r.remove());
    optBox.appendChild(r);
  }
  const opts = Array.isArray(q.options) && q.options.length ? q.options : [''];
  opts.forEach(v => addOption(v, v === q.correct));

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'small-btn q-add';
  addBtn.textContent = '+ Opción';
  addBtn.addEventListener('click', ()=> addOption('', false));
  addWrap.appendChild(addBtn);

  wrap.querySelector('.q-del').addEventListener('click', ()=>{
    wrap.remove();
    renumberQuestions();
  });

  return wrap;
}
function renumberQuestions(){
  $$('#questionsList .q-card').forEach((card, idx)=>{
    const n = card.querySelector('.q-number');
    if(n) n.textContent = (idx+1)+'.';
  });
}
function rowChip(value=''){
  const wrap = document.createElement('div');
  wrap.className = 'chip-row';
  wrap.innerHTML = `
    <input type="text" placeholder="Escribe aquí..." value="${(value||'').replace(/"/g,'&quot;')}">
    <button type="button" class="small-btn small-del">Eliminar</button>
  `;
  wrap.querySelector('button').addEventListener('click', ()=>wrap.remove());
  return wrap;
}
function clearForm(){
  ['docIdInput','idInput','nameInput','descInput','manualUrlInput',
   'certificateTmplInput','imageUrlInput','imageBadgeInput','timeHoursInput','scoreInput']
   .forEach(id => setVal(id,''));
  $('#criteriaList').innerHTML = '';
  $('#standardsList').innerHTML = '';
  $('#questionsList').innerHTML = '';
}
function fillForm(docId, data){
  setVal('docIdInput', docId || '');
  setVal('idInput', data.ID ?? '');
  setVal('nameInput', data.name ?? '');
  setVal('descInput', data.description ?? '');
  setVal('scoreInput', data.puntajeAprobacion ?? '');

  const manualPrefix = 'https://esysingenieria.github.io/evaluaciones-cursos/manuales-cursos/';
  setVal('manualUrlInput', stripPrefixAndExt(data.manualURL || '', manualPrefix, '.pdf'));
  setVal('certificateTmplInput', stripPrefixAndExt(data.certificateTemplate || '', '', '.pdf'));
  setVal('imageUrlInput', stripPrefixAndExt(data.imageURL || '', '', '.jpg'));
  setVal('imageBadgeInput', stripPrefixAndExt(data.imageURL_badge || '', '', '.png'));

  const hrs = /(\d+)\s*hrs?\.?/i.exec(data.timeEvaluation || '');
  setVal('timeHoursInput', hrs ? parseInt(hrs[1],10) : '');

  const cL = $('#criteriaList'); cL.innerHTML = '';
  (data.criteria || []).forEach(s => cL.appendChild(rowChip(s)));
  const sL = $('#standardsList'); sL.innerHTML = '';
  (data.standards || []).forEach(s => sL.appendChild(rowChip(s)));

  const qL = $('#questionsList'); qL.innerHTML = '';
  (data.questions || []).forEach(q => qL.appendChild(makeQuestion(q)));
  renumberQuestions();
}
function collectArrayFrom(sel){
  const out = [];
  $$(sel+' input[type="text"]').forEach(i=>{ const v=i.value.trim(); if(v) out.push(v); });
  return out;
}
function collectQuestions(){
  const out = [];
  $$('#questionsList .q-card').forEach(card=>{
    const text = card.querySelector('.q-text').value.trim();
    const options = [];
    let correct = '';
    card.querySelectorAll('.q-row').forEach(r=>{
      const txt = r.querySelector('.opt-text')?.value.trim() || '';
      if (txt) {
        options.push(txt);
        const picked = r.querySelector('.opt-correct')?.checked;
        if (picked) correct = txt;
      }
    });
    if(!text || !options.length) return;
    out.push({ text, options, correct });
  });
  return out;
}

// ===== Acciones (creados) =====
document.addEventListener('click', async (e)=>{
  const btnEdit = e.target.closest('.act-edit');
  const btnCopy = e.target.closest('.act-copy');
  const btnDel  = e.target.closest('.act-delete');

  if(btnEdit){
    const card = btnEdit.closest('.course-card');
    const docId = card.getAttribute('data-doc');
    const found = allEvaluations.find(x=>x.docId===docId);
    fillForm(docId, found?.data || {});
    $('#editorTitle').textContent = 'Editar curso';
    openEditor('Editar curso');
  }
  if(btnCopy){
    const card = btnCopy.closest('.course-card');
    const originalId = card.getAttribute('data-doc');
    try{
      const snap = await firebase.firestore().collection('evaluations').doc(originalId).get();
      if(!snap.exists){ alert('No se encontró el curso a copiar.'); return; }
      const data = snap.data();
      const newId = await nextVersionFromExact(originalId);
      await firebase.firestore().collection('evaluations').doc(newId).set(data, { merge:false });
      alert('✅ Copiado como '+newId);
      await loadCreatedCourses();
    }catch(err){ console.error(err); alert('❌ Error al copiar: '+err.message); }
  }
  if(btnDel){
    const card = btnDel.closest('.course-card');
    const docId = card.getAttribute('data-doc');
    const found = allEvaluations.find(x=>x.docId===docId);
    const name  = found?.data?.title || found?.data?.name || docId;
    if(!confirm(`Vas a eliminar el curso:\n\n${name}\n(ID de documento: ${docId})\n\nEsta acción no se puede deshacer. ¿Continuar?`)) return;
    try{
      await firebase.firestore().collection('evaluations').doc(docId).delete();
      alert('🗑️ Curso eliminado.');
      await loadCreatedCourses();
    }catch(err){ console.error(err); alert('❌ Error al eliminar: '+err.message); }
  }
});

document.addEventListener('click', async (e)=>{
  // === Cursos (YA LO TIENES) ===
  const btnEdit = e.target.closest('.act-edit');
  const btnCopy = e.target.closest('.act-copy');
  const btnDel  = e.target.closest('.act-delete');
  // ...tus handlers de cursos...

  // ⬇⬇⬇ PÉGALO AQUÍ ⬇⬇⬇
  // === Encuestas: acciones en lista ===
  const btnSEdit = e.target.closest('.act-survey-edit');
  const btnSCopy = e.target.closest('.act-survey-copy');
  const btnSDel  = e.target.closest('.act-survey-delete');

  if (btnSEdit){
    const card = btnSEdit.closest('.course-card');
    const id   = card.getAttribute('data-survey');
    const s    = (allSurveys || []).find(x => x.docId === id);
    if (!s){ alert('No se encontró la encuesta.'); return; }
    fillSurveyForm(id, s);
    openSurveyEditor('Editar encuesta');
  }

  if (btnSCopy){
    const card = btnSCopy.closest('.course-card');
    const id   = card.getAttribute('data-survey');
    await copySurvey(id);
  }

  if (btnSDel){
    const card = btnSDel.closest('.course-card');
    const id   = card.getAttribute('data-survey');
    const s    = (allSurveys || []).find(x => x.docId === id);
    const name = s?.title || id;
    if(!confirm(`Vas a eliminar esta encuesta:\n\n${name}\n(ID: ${id})\n\n¿Continuar?`)) return;
    await firebase.firestore().collection('surveyQuestions').doc(id).delete();
    await loadSurveys();
    renderSurveyList();
  }
  // ⬆⬆⬆ AQUÍ TERMINA EL BLOQUE DE ENCUESTAS ⬆⬆⬆

  // === Historial (YA LO TIENES) ===
  const btnHEdit = e.target.closest('.act-h-edit');
  const btnHDel  = e.target.closest('.act-h-del');
  // ...tus handlers de historial...
});

// ===== Guardar (creados) =====
async function saveEvaluation(){
  let docId = $('#docIdInput').value.trim();
  if(!docId){
    const baseFrom = $('#nameInput').value || 'curso';
    docId = sanitizeDocId(baseFrom);
  }else{
    docId = sanitizeDocId(docId);
  }

  const ID = $('#idInput').value.trim();
  const name = $('#nameInput').value.trim();
  const title = name;
  const description = $('#descInput').value.trim();

  const manualPrefix = 'https://esysingenieria.github.io/evaluaciones-cursos/manuales-cursos/';
  const manualBase = $('#manualUrlInput').value.trim().replace(/\.pdf$/i,'');
  const certificateBase = $('#certificateTmplInput').value.trim().replace(/\.pdf$/i,'');
  const coverBase = $('#imageUrlInput').value.trim().replace(/\.jpg$/i,'');
  const badgeBase = $('#imageBadgeInput').value.trim().replace(/\.png$/i,'');

  const manualURL = manualBase ? `${manualPrefix}${manualBase}.pdf` : '';
  const certificateTemplate = certificateBase ? `${certificateBase}.pdf` : '';
  const imageURL = coverBase ? `${coverBase}.jpg` : '';
  const imageURL_badge = badgeBase ? `${badgeBase}.png` : '';

  const puntajeAprobacion = $('#scoreInput').value.trim();
  const timeHours = $('#timeHoursInput').value.trim();
  const timeEvaluation = timeHours ? `${timeHours} HRS.` : '';
  const isLocked = false; const lastDate = 36; const timelimit = 3600;

  if(!ID || !name || !certificateTemplate){
    alert('Faltan campos obligatorios: Identificador de Curso / Nombre de Curso / Plantilla Certificado');
    return;
  }

  const criteria = collectArrayFrom('#criteriaList');
  const standards = collectArrayFrom('#standardsList');
  const questions = collectQuestions();

  const payload = {
    ID, certificateTemplate, criteria, description,
    imageURL, imageURL_badge, isLocked, lastDate, manualURL,
    name, puntajeAprobacion, questions, standards, timeEvaluation, timelimit, title
  };

  try{
    await firebase.firestore().collection('evaluations').doc(docId).set(payload, { merge:false });
    alert('✅ Guardado en evaluations/'+docId);
    closeEditor();
    await loadCreatedCourses();
  }catch(err){ console.error(err); alert('❌ Error al guardar: '+err.message); }
}

// ===== Editor de REALIZADOS =====
function openEditor(title='Nuevo curso'){ $('#editor').classList.add('open'); $('#editor').setAttribute('aria-hidden','false'); }
function closeEditor(){ $('#editor').classList.remove('open'); $('#editor').setAttribute('aria-hidden','true'); clearForm(); }

function openHistoryEditor(title='Nuevo realizado'){
  $('#historyTitle').textContent = title;
  $('#historyEditor').classList.add('open');
  $('#historyEditor').setAttribute('aria-hidden','false');
}
function closeHistoryEditor(){
  $('#historyEditor').classList.remove('open');
  $('#historyEditor').setAttribute('aria-hidden','true');
  editingHistoryId = null;
  setVal('historyCourseKey',''); setVal('historyDate',''); setVal('historyForma','abierto'); setVal('historyEmpresa','');
  $('#historyParticipants').innerHTML = '<div class="meta">Sin participantes (se asignan en el Panel de Usuarios).</div>';
}
function populateCourseSelect(selectedKey = '', disabled = false){
  const sel = $('#historyCourseKey');
  sel.innerHTML = '';

  // mostramos y ordenamos por NOMBRE DE DOCUMENTO (docId)
  allEvaluations
    .map(x => x.docId)
    .sort((a,b) => a.localeCompare(b))
    .forEach(docId => {
      const opt = document.createElement('option');
      opt.value = docId;        // value = docId (clave real del curso)
      opt.textContent = docId;  // visible = docId (NFPA_70E.v2, NFPA_70B, ...)
      if (docId === selectedKey) opt.selected = true;
      sel.appendChild(opt);
    });

  sel.disabled = !!disabled;     // al editar: deshabilitado
}
function fillHistoryEditor(item, isEdit){
  populateCourseSelect(item.courseKey || '', false);
  // item.date puede ser Date, string o timestamp -> formateo a YYYY-MM-DD
  const yyyyMMdd = item.date ? new Date(item.date).toISOString().slice(0,10) : '';
  setVal('historyDate', yyyyMMdd);
  setVal('historyForma', item.forma || 'abierto');
  setVal('historyEmpresa', item.empresa || '');
  // Llenar el combo de encuestas (si hay una ya asignada, mostrarla seleccionada)
  populateSurveySelect(item.surveyId || '')
  const box = $('#historyParticipants');
  if (item.participants && item.participants.length){
    box.innerHTML = item.participants.map(p=>{
      const name = p.name || p.nombre || p.fullname || 'Sin nombre';
      const cid  = p.customID || p.customId || p.customid || p.cid || '';
      const ok = (p.aprobado ?? p.aprobo ?? p.passed ?? p.approved);
      return `<div class="meta" style="display:flex;gap:8px;"><span>${name}</span><span>(${cid})</span>${(ok!==undefined)?`<span>• ${ok? 'Aprobó' : 'No aprobó'}</span>`:''}</div>`;
    }).join('');
  }else{
    box.innerHTML = '<div class="meta">Sin participantes (se asignan en el Panel de Usuarios).</div>';
  }
}
// Llena el <select id="historySurveySelect"> con todas las encuestas
async function populateSurveySelect(selectedId=''){
  // si aún no se han cargado, tráelas
  if (!allSurveys || !allSurveys.length) {
    await loadSurveys();   // usa la que agregamos antes
  }
  const sel = document.getElementById('historySurveySelect');
  if (!sel) return;

  sel.innerHTML = '<option value="">Usar la predeterminada</option>';
  (allSurveys || [])
    .sort((a,b) => (a.title||a.docId).localeCompare(b.title||b.docId))
    .forEach(s => {
      const o = document.createElement('option');
      o.value = s.docId;
      o.textContent = s.title || s.docId;
      if (s.docId === selectedId) o.selected = true;
      sel.appendChild(o);
    });
}
// ===== Reemplazar COMPLETO saveHistory por esto =====
async function saveHistory(){
  const courseKey = $('#historyCourseKey').value;     // docId en evaluations (p.ej. NFPA_70E.v3)
  const dateStr   = $('#historyDate').value;          // YYYY-MM-DD (día 1)
  const forma     = $('#historyForma').value;         // 'abierto' | 'cerrado'
  const empresa   = $('#historyEmpresa').value.trim();
  const surveyId = (document.getElementById('historySurveySelect')?.value || '').trim();

  if (!courseKey || !dateStr){
    alert('Selecciona curso y fecha.');
    return;
  }

  const newDocId = buildHistoryDocId(courseKey, dateStr, forma, empresa);
  const col      = firebase.firestore().collection('inscripciones');
  const numDays  = getCourseDaysFromKey(courseKey);   // ← 8h por día → 16h => 2 días

  try {
    // --- CREAR ---
    if (!editingHistoryId){
      await col.doc(newDocId).set({
        courseKey,
        courseDate: dateStr,
        formaCurso: forma,
        empresaSolicitante: (forma === 'cerrado') ? empresa : '',
        inscriptions: [],
        totalInscritos: 0,
        totalPagado: 0,
        surveyId
      }, { merge:false });

      alert('✅ Realizado creado: ' + newDocId);
      closeHistoryEditor();
      await loadHistoryCourses();
      return;
    }

    // --- EDITAR existente ---
    const oldRef  = col.doc(editingHistoryId);
    const oldSnap = await oldRef.get();
    if (!oldSnap.exists) throw new Error('No se encontró el curso a editar.');
    const oldData = oldSnap.data() || {};

    // fecha anterior (si no está en campo, la saco del ID)
    let oldDate = oldData.courseDate || '';
    if (!oldDate) {
      const m = /_(\d{4}-\d{2}-\d{2})_/.exec(editingHistoryId);
      if (m) oldDate = m[1];
    }

    // normalizar participantes
    let participants = oldData.inscriptions || oldData.participants || oldData.users || [];
    if (participants && !Array.isArray(participants) && typeof participants === 'object') {
      participants = Object.values(participants);
    }
    if (!Array.isArray(participants)) participants = [];

    // ¿Cambia el ID (fecha/forma/empresa/curso)?
    if (newDocId !== editingHistoryId){
      // remapear asistencia para TODOS los días esperados (AM/PM)
      const remapped = participants.map(p=>{
        const att = p.attendance || {};
        return { ...p, attendance: remapAttendanceRange(att, oldDate, dateStr, numDays) };
      });

      const base = {
        courseKey,
        courseDate: dateStr,
        formaCurso: forma,
        empresaSolicitante: (forma === 'cerrado') ? empresa : '',
        inscriptions: remapped,
        totalInscritos: remapped.length,
        totalPagado: (forma === 'cerrado')
          ? (oldData.totalPagado || 0)
          : remapped.reduce((s,p)=> s + (Number(p.price)||0), 0),
        surveyId
      };

      await col.doc(newDocId).set(base, { merge:false });
      await oldRef.delete();

      await propagateCourseMetaToUsers(remapped, {
        courseKey, date: dateStr, sessionId: newDocId, forma, empresa
      });

      alert('✅ Realizado actualizado (renombrado) y asistencias migradas.');
    } else {
      // mismo ID: actualizar campos principales
      const payload = {
        courseKey,
        courseDate: dateStr,
        formaCurso: forma,
        empresaSolicitante: (forma === 'cerrado') ? empresa : '',
        surveyId
      };
      await oldRef.set(payload, { merge:true });

      // si cambió la fecha interna con el mismo ID, remapear en sitio
      if (oldDate && oldDate !== dateStr && participants.length){
        const remapped = participants.map(p=>{
          const att = p.attendance || {};
          return { ...p, attendance: remapAttendanceRange(att, oldDate, dateStr, numDays) };
        });
        await oldRef.update({ inscriptions: remapped });
      }

      await propagateCourseMetaToUsers(participants, {
        courseKey, date: dateStr, sessionId: editingHistoryId, forma, empresa
      });

      alert('✅ Realizado actualizado.');
    }

    closeHistoryEditor();
    await loadHistoryCourses();

  } catch (err) {
    console.error(err);
    alert('❌ Error al guardar: ' + err.message);
  }
}

// ===== Agregar debajo (helper para actualizar usuarios) =====
function remapAttendance(att = {}, oldDate, newDate){
  if (!att || typeof att !== 'object' || oldDate === newDate) return att;
  const out = {};
  Object.entries(att).forEach(([k, v])=>{
    if (typeof k === 'string' && k.startsWith(oldDate)) {
      const newKey = k.replace(oldDate, newDate); // 2025-07-24_AM -> 2025-07-27_AM
      out[newKey] = v;
    } else {
      out[k] = v; // conserva cualquier otra clave
    }
  });
  return out;
}

async function propagateCourseMetaToUsers(participants, { courseKey, date, sessionId, forma, empresa }) {
  if (!Array.isArray(participants)) return;

  for (const p of participants) {
    const customID = p.customID || p.customId || p.cid || '';
    const rut      = p.rut || '';

    let q = null;
    if (customID) {
      q = await firebase.firestore().collection('users')
            .where('customID','==', customID).limit(1).get().catch(()=>null);
    }
    if ((!q || q.empty) && rut) {
      q = await firebase.firestore().collection('users')
            .where('rut','==', rut).limit(1).get().catch(()=>null);
    }
    if (!q || q.empty) continue;

    const uref = q.docs[0].ref;
    const u    = q.docs[0].data() || {};
    const meta = u.assignedCoursesMeta || {};
    const prev = meta[courseKey] || {};

    meta[courseKey] = {
      ...prev,
      evaluationId: courseKey,
      courseKey,
      sessionId,
      date,                               // <- usado por Panel de Usuarios y asistencia
      formaCurso: forma,
      empresaSolicitante: (forma === 'cerrado') ? (empresa || '') : ''
    };

    await uref.update({ assignedCoursesMeta: meta });
  }
}
// ===== Acciones (realizados) =====
document.addEventListener('click', async (e) => {
  const btnHEdit  = e.target.closest('.act-h-edit');
  const btnHDel   = e.target.closest('.act-h-del');
  const btnHStats = e.target.closest('.act-h-stats');

  if (btnHStats) {
    const card = btnHStats.closest('.course-card');
    const id   = card.getAttribute('data-hdoc');      // id del doc en "inscripciones"
    const item = allHistory.find(h => h.docId === id);
    if (!item) { alert('No se encontró el realizado.'); return; }
    // ÚNICO modal de estadísticas (con pestañas Encuesta/Evaluación)
    openStatsModal(item);
  }

  if (btnHEdit) {
    const card = btnHEdit.closest('.course-card');
    const id   = card.getAttribute('data-hdoc');
    const item = allHistory.find(h => h.docId === id);
    if (!item) { alert('No se encontró el realizado.'); return; }
    editingHistoryId = id;
    fillHistoryEditor(item, true);
    openHistoryEditor('Editar realizado');
  }

  if (btnHDel) {
    const card = btnHDel.closest('.course-card');
    const id   = card.getAttribute('data-hdoc');
    const item = allHistory.find(h => h.docId === id);
    const name = item?.courseName || id;
    if (!confirm(`Vas a eliminar este curso realizado:\n\n${name}\n(ID: ${id})\n\n¿Continuar?`)) return;
    try {
      await firebase.firestore().collection('inscripciones').doc(id).delete();
      alert('🗑️ Realizado eliminado.');
      await loadHistoryCourses();
    } catch (err) {
      console.error(err); alert('❌ Error al eliminar: ' + err.message);
    }
  }
});

// =============== ESTADÍSTICAS (por curso del HISTORIAL / documento de 'inscripciones') ===============
let _statsCharts = []; // limpiar instancias al cerrar/cambiar vista

// Mapear participantes (customID / rut) a uids de 'users'
async function userIdsFromParticipants(participants = []){
  const out = new Set();
  for (const p of (participants || [])){
    const cid = p.customID || p.customId || '';
    const rut = p.rut || '';
    if (cid){
      const s = await firebase.firestore().collection('users').where('customID','==',cid).limit(1).get().catch(()=>null);
      if (s && !s.empty) out.add(s.docs[0].id);
    } else if (rut){
      const s = await firebase.firestore().collection('users').where('rut','==',rut).limit(1).get().catch(()=>null);
      if (s && !s.empty) out.add(s.docs[0].id);
    }
  }
  return out;
}

function openStatsModal(sessionItem){
  // Crea modal si no existe
  let modal = document.getElementById('statsModal');
  if (!modal){
    modal = document.createElement('div');
    modal.id = 'statsModal';
    modal.style.cssText = `
      position:fixed; inset:0; background:rgba(0,0,0,.4); z-index:2000;
      display:flex; align-items:flex-start; justify-content:center; padding:24px;
    `;
    modal.innerHTML = `
      <div style="background:#fff; width:min(1100px,100%); max-height:90vh; overflow:auto; border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,.25)">
        <div id="statsHeader" style="position:sticky; top:0; background:#fff; padding:12px 14px; border-bottom:1px solid #eee; display:flex; align-items:center; gap:8px;">
          <strong style="flex:1">Estadísticas • ${sessionItem.courseKey} • ${fmtDate(sessionItem.date)}</strong>
          <button id="btnStatsSurvey" class="btn btn-outline" style="border:1px solid #ddd">Encuesta</button>
          <button id="btnStatsEval"   class="btn btn-outline" style="border:1px solid #ddd">Evaluación</button>
          <button id="btnStatsClose"  class="btn btn-outline">Cerrar</button>
        </div>
        <div id="statsBody" style="padding:14px;"></div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (ev)=>{
      if (ev.target.id==='btnStatsClose' || ev.target===modal){
        _statsCharts.forEach(ch => { try{ ch.destroy(); }catch{} });
        _statsCharts = [];
        modal.remove();
      }
    });
  } else {
    modal.querySelector('#statsHeader strong').textContent =
      `Estadísticas • ${sessionItem.courseKey} • ${fmtDate(sessionItem.date)}`;
  }

  const btnSurvey = modal.querySelector('#btnStatsSurvey');
  const btnEval   = modal.querySelector('#btnStatsEval');
  const body      = modal.querySelector('#statsBody');

  function setActive(btnA, btnB){
    btnA.style.background = '#0d6efd'; btnA.style.color = '#fff';
    btnB.style.background = '';        btnB.style.color = '';
  }

  async function renderSurvey(){
    setActive(btnSurvey, btnEval);
    body.innerHTML = '';
    _statsCharts.forEach(ch => { try{ ch.destroy(); }catch{} }); _statsCharts = [];
    await renderSurveyStatsInto(body, sessionItem);
  }
  async function renderEvaluation(){
    setActive(btnEval, btnSurvey);
    body.innerHTML = '';
    _statsCharts.forEach(ch => { try{ ch.destroy(); }catch{} }); _statsCharts = [];
    await renderEvaluationStatsInto(body, sessionItem);
  }

  btnSurvey.onclick = renderSurvey;
  btnEval.onclick   = renderEvaluation;

  // por defecto: encuesta
  renderSurvey();
}

// ======== ENCUESTA: promedios 1–7 por pregunta + promedio global + desviación estándar ========
async function renderSurveyStatsInto(container, sessionItem){
  const insRef  = firebase.firestore().collection('inscripciones').doc(sessionItem.docId);
  const insSnap = await insRef.get();
  if (!insSnap.exists){ container.innerHTML = '<div class="meta">No se encontró la sesión.</div>'; return; }
  const insData = insSnap.data() || {};
  const participants = Array.isArray(insData.inscriptions) ? insData.inscriptions : [];
  const allowedUIDs  = await userIdsFromParticipants(participants);

  // Encuesta usada: docId guardado (si lo guardas) o fallback por evaluationId/default
  let surveyDoc = null;
  if (insData.surveyId){
    const s = await firebase.firestore().collection('surveyQuestions').doc(insData.surveyId).get();
    if (s.exists) surveyDoc = s;
  }
  if (!surveyDoc){
    const q = await firebase.firestore().collection('surveyQuestions')
      .where('evaluationId','in',[sessionItem.courseKey,'default']).limit(1).get();
    surveyDoc = q.docs[0];
  }
  if (!surveyDoc){ container.innerHTML = '<div class="meta">Sin encuesta.</div>'; return; }

  const sData = surveyDoc.data();
  const questions = (sData.questions || []).slice(0,10);

  // Respuestas de esta evaluación PERO filtrando a los usuarios de esta sesión
  const respSnap = await firebase.firestore().collection('surveys')
      .where('evaluationId','==', sessionItem.courseKey).get();

  const summaries = questions.map(()=>({ sum:0, n:0, vals:[] }));

  respSnap.forEach(r=>{
    const d  = r.data() || {};
    const uid= d.userId || '';
    if (!allowedUIDs.has(uid)) return;  // <-- SOLO los de este curso del historial
    const sd = d.surveyData || {};
    questions.forEach((q, idx)=>{
      const v = Number(sd[`question${idx}`]);
      if (!isNaN(v) && v>=1 && v<=7){
        summaries[idx].sum += v;
        summaries[idx].n   += 1;
        summaries[idx].vals.push(v);
      }
    });
  });

  // Nota global y desviación estándar
  const all = summaries.flatMap(s=>s.vals);
  const mean = all.length ? (all.reduce((a,b)=>a+b,0)/all.length) : 0;
  const std  = all.length ? Math.sqrt(all.reduce((a,b)=>a+(b-mean)**2,0)/all.length) : 0;

  const resume = document.createElement('div');
  resume.style.margin = '6px 0 12px';
  resume.innerHTML = `
    <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
      <div class="tag">Respuestas: ${new Set(respSnap.docs
        .map(d=>d.data()?.userId)
        .filter(uid=>allowedUIDs.has(uid))).size}</div>
      <div class="tag">Promedio global: ${mean.toFixed(2)}</div>
      <div class="tag">Desv. estándar: ${std.toFixed(2)}</div>
    </div>`;
  container.appendChild(resume);

  questions.forEach((q, idx)=>{
    // Quita numeración que ya viene en el enunciado
    const cleanTitle = String(q.text||'').replace(/^\s*\d+[\.)]\s*/,'');
    const card = document.createElement('div');
    card.className = 'panel-card';
    card.style.margin = '10px 0';
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
        <div style="font-weight:700">${idx+1}. ${cleanTitle}</div>
        <span class="tag">Promedio: ${(summaries[idx].n? summaries[idx].sum/summaries[idx].n : 0).toFixed(2)}</span>
      </div>
      <canvas id="chart_s_${idx}" height="120"></canvas>
    `;
    container.appendChild(card);

    // Frecuencia de 1..7
    const freq = [1,2,3,4,5,6,7].map(v => summaries[idx].vals.filter(x=>x===v).length);
    const ctx  = card.querySelector(`#chart_s_${idx}`).getContext('2d');
    _statsCharts.push(new Chart(ctx,{
      type:'bar',
      data:{ labels:[1,2,3,4,5,6,7], datasets:[{ data: freq }] },
      options:{ responsive:true, plugins:{ legend:{display:false} },
        scales:{ y:{ beginAtZero:true, ticks:{ precision:0 } } } }
    }));
  });
}

// ======== EVALUACIÓN: barras (multilínea con alto dinámico) + dona ========
async function renderEvaluationStatsInto(container, sessionItem){
  // ------------- CONFIG editable -------------
  const MAX_CHARS_PER_LINE = 30;   // ancho “virtual” de línea para envolver
  const LINE_HEIGHT_PX     = 18;   // alto por línea de texto
  const CAT_PADDING_PX     = 10;   // separación vertical entre categorías
  const MIN_BARS_HEIGHT    = 180;  // alto mínimo del canvas de barras
  const DONUT_COL_WIDTH    = 340;  // ancho fijo de la columna de dona
  const DONUT_HEIGHT       = 220;  // alto de la dona
  // ------------------------------------------

  // Rompe texto por palabras en varias líneas
  function wrapText(str = '', maxChars = MAX_CHARS_PER_LINE){
    const words = String(str).split(/\s+/);
    const lines = [];
    let line = '';
    for (const w of words){
      const test = line ? line + ' ' + w : w;
      if (test.length <= maxChars) line = test;
      else { if (line) lines.push(line); line = w; }
    }
    if (line) lines.push(line);
    return lines;
  }

  // Sesión → UIDs permitidos
  const insRef  = firebase.firestore().collection('inscripciones').doc(sessionItem.docId);
  const insSnap = await insRef.get();
  if (!insSnap.exists){ container.innerHTML = '<div class="meta">No se encontró la sesión.</div>'; return; }
  const participants = Array.isArray(insSnap.data()?.inscriptions) ? insSnap.data().inscriptions : [];
  const allowedUIDs  = await userIdsFromParticipants(participants);

  // Preguntas
  const evSnap = await firebase.firestore().collection('evaluations').doc(sessionItem.courseKey).get();
  if (!evSnap.exists){ container.innerHTML = '<div class="meta">No se encontró la evaluación.</div>'; return; }
  const ev = evSnap.data() || {};
  const questions = Array.isArray(ev.questions) ? ev.questions : [];

  // Respuestas (cuentan todos los intentos), filtradas por esta sesión
  const respSnap = await firebase.firestore().collection('responses')
                    .where('evaluationId','==', sessionItem.courseKey).get();

  const counts = questions.map(q => new Array((q.options||[]).length).fill(0));
  const oknok  = questions.map(_ => ({ok:0, bad:0}));

  respSnap.forEach(r=>{
    const d   = r.data() || {};
    const uid = d.userId || '';
    if (!allowedUIDs.has(uid)) return;
    const a = d.answers || {};
    questions.forEach((q, idx)=>{
      const val = a[`question${idx}`];
      if (val==null) return;
      const pos = (q.options||[]).indexOf(val);
      if (pos>=0) counts[idx][pos]++;
      if (q.correct){
        const isOk = String(val).trim().toLowerCase() === String(q.correct).trim().toLowerCase();
        if (isOk) oknok[idx].ok++; else oknok[idx].bad++;
      }
    });
  });

  // --- CORRECCIÓN GLOBAL: partir TODO por la mitad ---
  counts = counts.map(arr => arr.map(v => Math.round(v / 2)));  // barras por opción (todas las preguntas)
  oknok.forEach(o => {                                           // dona correctas/incorrectas
    o.ok  = Math.round(o.ok  / 2);
    o.bad = Math.round(o.bad / 2);
  });
  
  // Render
  questions.forEach((q, idx)=>{
    const cleanTitle = String(q.text||'').replace(/^\s*\d+\s*[\.\)]\s*/,'');
    const optionsArr = Array.isArray(q.options) ? q.options : [];

    // Etiquetas multilínea + cálculo de alto por cantidad real de líneas
    const wrappedLabels   = optionsArr.map(t => wrapText(t));
    const linesPerLabel   = wrappedLabels.map(l => Math.max(1, l.length));
    const estimatedHeight =
      linesPerLabel.reduce((sum, nLines) => sum + (nLines * LINE_HEIGHT_PX + CAT_PADDING_PX), 0) + 30;
    const barHeightPx = Math.max(MIN_BARS_HEIGHT, estimatedHeight);

    const card = document.createElement('div');
    card.className = 'panel-card';
    card.style.margin = '10px 0';
    card.innerHTML = `
      <div style="font-weight:700; margin-bottom:6px;">${idx+1}. ${cleanTitle}</div>
      <div style="
        display:grid;
        grid-template-columns:minmax(0,1fr) ${DONUT_COL_WIDTH}px;
        gap:12px; align-items:center;
      ">
        <div style="min-width:0; overflow:hidden;">
          <canvas id="chart_b_${idx}" style="height:${barHeightPx}px; width:100%; display:block;"></canvas>
        </div>
        <div style="width:${DONUT_COL_WIDTH}px; min-width:${DONUT_COL_WIDTH}px;">
          <canvas id="chart_p_${idx}" style="height:${DONUT_HEIGHT}px; width:100%; display:block;"></canvas>
        </div>
      </div>
    `;
    container.appendChild(card);

    // BARRAS horizontales
    const bctx = card.querySelector(`#chart_b_${idx}`).getContext('2d');
    _statsCharts.push(new Chart(bctx,{
      type:'bar',
      data:{ labels: wrappedLabels, datasets:[{ data: counts[idx] }] },
      options:{
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins:{ legend:{ display:false }, tooltip:{ enabled:true } },
        layout:{ padding:{ right:8, left:8 } },
        // un poco más de grosor de categoría para que “respire”
        categoryPercentage: 0.9,
        barPercentage: 0.9,
        scales:{
          x:{ beginAtZero:true, ticks:{ precision:0 } },
          y:{
            ticks:{ autoSkip:false, padding:4, crossAlign:'center' }
          }
        }
      }
    }));

    // DONA
    const pctx = card.querySelector(`#chart_p_${idx}`).getContext('2d');
    _statsCharts.push(new Chart(pctx,{
      type:'doughnut',
      data:{
        labels:['Correctas','Incorrectas'],
        datasets:[{ data:[ Math.round(oknok[idx].ok/2), Math.round(oknok[idx].bad/2) ] }]
      },
      options:{
        responsive:true,
        maintainAspectRatio:false,
        plugins:{ legend:{ position:'bottom' } },
        cutout: '55%'
      }
    }));
  });
}

// ===== Wire-up =====
document.addEventListener('DOMContentLoaded', ()=>{
  $('#btnGoUsers')?.addEventListener('click', ()=>{ location.href='dashboard-admin.html'; });
  $('#btnSignOutFixed')?.addEventListener('click', async ()=>{
    try{ await firebase.auth().signOut(); location.href='index.html'; }catch(e){ alert(e.message); }
  });

  loadCreatedCourses(); // también carga realizados cuando termina

  $('#searchCreated')?.addEventListener('input', ()=>{
    if (isSurveyMode) renderSurveyList(); else renderCreatedList();
  });
  $('#searchDone')?.addEventListener('input', renderHistoryList);

  $('#btnNewCourse')?.addEventListener('click', ()=>{
    clearForm();
    $('#editorTitle').textContent = 'Nuevo curso';
    openEditor('Nuevo curso');
  });
  $('#btnSave')?.addEventListener('click', saveEvaluation);
  $('#btnClose')?.addEventListener('click', ()=>{ closeEditor(); });

  $('#btnAddCriterion')?.addEventListener('click', ()=>{
    $('#criteriaList').appendChild(rowChip(''));
  });
  $('#btnAddStandard')?.addEventListener('click', ()=>{
    $('#standardsList').appendChild(rowChip(''));
  });
  $('#btnAddQuestion')?.addEventListener('click', ()=>{
    $('#questionsList').appendChild(makeQuestion({ text:'', options:[''], correct:'' }));
    renumberQuestions();
  });

  $('#btnNewHistory')?.addEventListener('click', ()=>{
    editingHistoryId = null;
    populateCourseSelect('', false);
    fillHistoryEditor({ participants:[] }, false);
    openHistoryEditor('Nuevo realizado');
  });
  $('#btnHistorySave')?.addEventListener('click', saveHistory);
  $('#btnHistoryClose')?.addEventListener('click', closeHistoryEditor);

  // Toggle: Cursos ↔ Encuestas
  $('#btnToggleSurveys')?.addEventListener('click', ()=> toggleSurveyMode());

  // (si ya agregaste el botón y modal de encuestas)
  $('#btnNewSurvey')?.addEventListener('click', ()=>{
    editingSurveyId = null;
    setVal('surveyNameInput','');
    populateSurveyEvalDefault('default');
    $('#surveyQuestionsList').innerHTML = '';
    openSurveyEditor('Nueva encuesta');
  });
  $('#btnSurveyAddQuestion')?.addEventListener('click', ()=>{
    $('#surveyQuestionsList').appendChild(
      surveyQuestionCard({
        text:'',
        type:'select',
        options:['Muy satisfecho','Satisfecho','Neutral','Insatisfecho','Muy insatisfecho']
      })
    );
    renumberSurveyQuestions();
  });
  $('#btnSurveySave')?.addEventListener('click', saveSurvey);
  $('#btnSurveyClose')?.addEventListener('click', closeSurveyEditor);
});

function openSurveyEditor(title='Nueva encuesta'){
  $('#surveyTitle').textContent = title;
  $('#surveyEditor').classList.add('open');
  $('#surveyEditor').setAttribute('aria-hidden','false');
}
function closeSurveyEditor(){
  $('#surveyEditor').classList.remove('open');
  $('#surveyEditor').setAttribute('aria-hidden','true');
  editingSurveyId = null;
  setVal('surveyNameInput','');
  $('#surveyQuestionsList').innerHTML = '';
  populateSurveyEvalDefault('default');
}
function populateSurveyEvalDefault(selected='default'){
  const sel = $('#surveyEvalDefault'); if (!sel) return;
  sel.innerHTML = '';
  const o0 = document.createElement('option'); o0.value = 'default'; o0.textContent = 'default';
  sel.appendChild(o0);
  (allEvaluations||[]).map(x=>x.docId).sort((a,b)=>a.localeCompare(b)).forEach(docId=>{
    const o = document.createElement('option'); o.value = docId; o.textContent = docId;
    if (docId === selected) o.selected = true; sel.appendChild(o);
  });
}
function surveyQuestionCard(q = { text:'', type:'select', options:[''] }){
  const wrap = document.createElement('div'); wrap.className='q-card';
  wrap.innerHTML = `
    <div class="q-head">
      <div class="q-title"><span class="q-number">#</span> Texto de la pregunta</div>
      <button type="button" class="small-btn q-del">Eliminar</button>
    </div>
    <div class="field"><input class="q-text" type="text" placeholder="Escribe la pregunta..." value="${(q.text||'').replace(/"/g,'&quot;')}"></div>
    <div class="grid">
      <div class="field">
        <label>Tipo</label>
        <select class="q-type">
          <option value="select">Selección</option>
          <option value="text">Respuesta abierta</option>
        </select>
      </div>
      <div class="field full alt-box">
        <label>Alternativas</label>
        <div class="alt-list"></div>
        <button type="button" class="small-btn small-add alt-add">+ Alternativa</button>
      </div>
    </div>
  `;
  const typeSel = wrap.querySelector('.q-type'); typeSel.value = q.type || 'select';
  const altBox = wrap.querySelector('.alt-box'); const altList = wrap.querySelector('.alt-list');
  function addAlt(v=''){ const r=document.createElement('div'); r.className='q-row';
    r.innerHTML=`<input class="alt-text" type="text" placeholder="Texto de alternativa" value="${(v||'').replace(/"/g,'&quot;')}">
                 <button type="button" class="small-btn q-del-opt">Quitar</button>`;
    r.querySelector('.q-del-opt').addEventListener('click',()=>r.remove()); altList.appendChild(r);
  }
  (Array.isArray(q.options)&&q.options.length?q.options:['']).forEach(addAlt);
  function sync(){ altBox.style.display = (typeSel.value === 'select') ? '' : 'none'; }
  sync(); typeSel.addEventListener('change', sync);
  wrap.querySelector('.alt-add').addEventListener('click', ()=> addAlt(''));
  wrap.querySelector('.q-del').addEventListener('click', ()=> wrap.remove());
  return wrap;
}
function renumberSurveyQuestions(){
  $$('#surveyQuestionsList .q-card').forEach((card, idx)=>{
    const n = card.querySelector('.q-number'); if(n) n.textContent = (idx+1)+'.';
  });
}
function fillSurveyForm(docId, data){
  editingSurveyId = docId || null;
  setVal('surveyNameInput', data.title || '');
  populateSurveyEvalDefault(data.evaluationId || 'default');
  const box = $('#surveyQuestionsList'); box.innerHTML='';
  (data.questions || []).forEach(q => box.appendChild(surveyQuestionCard(q)));
  renumberSurveyQuestions();
}
function collectSurveyQuestions(){
  const out = [];
  $$('#surveyQuestionsList .q-card').forEach(card=>{
    const text = card.querySelector('.q-text').value.trim();
    const type = card.querySelector('.q-type').value;
    let options=[];
    if (type==='select'){
      options = Array.from(card.querySelectorAll('.alt-text')).map(i=>i.value.trim()).filter(Boolean);
      if(!options.length) options=['Sí','No'];
    }
    if(!text) return; const q={ text, type }; if(type==='select') q.options=options; out.push(q);
  });
  return out;
}
async function saveSurvey(){
  const title = $('#surveyNameInput').value.trim();
  const evalDefault = $('#surveyEvalDefault').value || 'default';
  if(!title){ alert('Escribe el nombre de la encuesta.'); return; }
  const docId = sanitizeDocId(title);
  const questions = collectSurveyQuestions();
  const payload = { title, evaluationId: evalDefault, questions };

  const col = firebase.firestore().collection('surveyQuestions');
  if(!editingSurveyId){
    const exists = await col.doc(docId).get();
    const id = exists.exists ? `${docId}_${Date.now().toString(36)}` : docId;
    await col.doc(id).set(payload, { merge:false });
  }else{
    if (editingSurveyId !== docId){
      const old = await col.doc(editingSurveyId).get();
      const oldData = old.data() || {};
      await col.doc(docId).set({ ...oldData, ...payload }, { merge:false });
      await col.doc(editingSurveyId).delete();
    }else{
      await col.doc(docId).set(payload, { merge:true });
    }
  }
  closeSurveyEditor(); await loadSurveys(); renderSurveyList();
}
async function copySurvey(docId){
  const col = firebase.firestore().collection('surveyQuestions');
  const snap = await col.doc(docId).get(); if(!snap.exists) return alert('No se encontró la encuesta.');
  const data = snap.data(); const base = sanitizeDocId((data.title||docId)+'_copia');
  let target = base, n=2;
  while((await col.doc(target).get()).exists) target = `${base}_${n++}`;
  await col.doc(target).set(data, { merge:false });
  await loadSurveys(); renderSurveyList();
}

async function openSurveyStats(sessionId){
  try{
    // 1) Traer el realizado
    const insRef = firebase.firestore().collection('inscripciones').doc(sessionId);
    const insSnap = await insRef.get();
    if(!insSnap.exists){ alert('No se encontró este curso del historial.'); return; }
    const ins = insSnap.data() || {};
    const courseKey = ins.courseKey || '';
    const surveyId  = ins.surveyId || ''; // puede venir vacío si usa default

    // 2) Traer el cuestionario (para textos de preguntas)
    let qSnap = null;
    if (surveyId) {
      qSnap = await firebase.firestore().collection('surveyQuestions').doc(surveyId).get();
    } 
    if (!qSnap || !qSnap.exists) {
      // fallback: busca por evaluationId o default
      const alt = await firebase.firestore().collection('surveyQuestions')
        .where('evaluationId','in',[courseKey,'default'])
        .limit(1).get();
      if (!alt.empty) qSnap = alt.docs[0];
    }
    if (!qSnap || !qSnap.exists){ alert('No hay encuesta asociada.'); return; }
    const survey = qSnap.data();
    const questions = Array.isArray(survey.questions) ? survey.questions : [];

    // 3) Traer todas las respuestas de "surveys" para ESTE realizado
    //    (evaluationId = courseKey) AND (sessionId = el del historial)
    let q = firebase.firestore().collection('surveys')
      .where('evaluationId','==', courseKey)
      .where('sessionId','==', sessionId);

    const respSnap = await q.get();
    const responses = respSnap.docs.map(d => d.data().surveyData || {});

    // 4) Calcular promedios y distribuciones (escala 1..7)
    //    y limpiar numeración inicial ya presente en el texto.
    const stats = questions.map((qObj, idx) => {
      const key = `question${idx}`;

      // limpia prefijos tipo "1. ", "2) ", "03. " etc.
      const cleanText = String(qObj.text || `Pregunta ${idx+1}`)
        .replace(/^\s*\d+\s*[\.\)]\s*/, '')  // 1. ó 2) ó 03.
        .trim();

      const vals = responses
        .map(r => parseInt(r[key], 10))
        .filter(n => Number.isFinite(n) && n >= 1 && n <= 7);

      const counts = Array(7).fill(0);
      vals.forEach(n => counts[n - 1]++);
      const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length) : 0;

      return { text: cleanText, counts, avg: avg.toFixed(2) };
    });

    // 4.1) Resumen global: promedio y desviación estándar sobre TODAS las notas
    let totalNotas = 0;   // número total de valores (todas las respuestas de todas las preguntas)
    let sumaPonderada = 0;

    stats.forEach(s => {
      s.counts.forEach((c, idx) => {
        const x = idx + 1;          // valor 1..7
        totalNotas += c;            // cuántas veces aparece ese valor
        sumaPonderada += c * x;     // suma total de valores
      });
    });

    const promGlobal = totalNotas ? (sumaPonderada / totalNotas) : 0;

    // Desviación estándar muestral (divide por N-1)
    let varAcum = 0;
    if (totalNotas > 1) {
      stats.forEach(s => {
        s.counts.forEach((c, idx) => {
          const x = idx + 1;
          varAcum += c * Math.pow(x - promGlobal, 2);
        });
      });
    }
    const desvEstandar = (totalNotas > 1) ? Math.sqrt(varAcum / (totalNotas - 1)) : 0;

    // 5) Renderizar modal con gráficos
    const box = document.getElementById('statsContent');

    const headerCard = `
      <div class="stat-card" style="border:1px solid #e5e7eb;border-radius:10px;padding:12px;margin:10px 0;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <strong>Resumen general</strong>
          <div>
            <span class="tag" style="background:#eef2ff;color:#1e40af;padding:2px 8px;border-radius:999px;">Nota final: ${promGlobal.toFixed(2)}</span>
            <span class="tag" style="background:#eef2ff;color:#1e40af;padding:2px 8px;border-radius:999px;margin-left:6px;">Desv. estándar: ${desvEstandar.toFixed(2)}</span>
            <span class="tag" style="background:#eef2ff;color:#1e40af;padding:2px 8px;border-radius:999px;margin-left:6px;">Encuestas: ${responses.length}</span>
          </div>
        </div>
      </div>
    `;

    const chartsHTML = stats.map((s,i)=>`
      <div class="stat-card" style="border:1px solid #e5e7eb;border-radius:10px;padding:12px;margin:10px 0;">
        <div class="stat-head" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <strong>${s.text}</strong>
          <span class="tag" style="background:#eef2ff;color:#1e40af;padding:2px 8px;border-radius:999px;">Promedio: ${s.avg}</span>
        </div>
        <canvas id="chartQ${i}" height="120"></canvas>
      </div>
    `).join('');

    box.innerHTML = headerCard + chartsHTML;

    stats.forEach((s,i)=>{
      const ctx = document.getElementById('chartQ'+i).getContext('2d');
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['1','2','3','4','5','6','7'],
          datasets: [{ data: s.counts, backgroundColor: '#3b82f6' }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display:false } },
          scales: { y: { beginAtZero:true, ticks: { precision:0 } } }
        }
      });
    });

    // título
    document.getElementById('statsTitle').textContent =
      `Estadísticas • ${ins.courseKey || ''} • ${ins.courseDate || ''}`;

    // abrir modal
    document.getElementById('surveyStatsModal').classList.add('open');
    document.getElementById('surveyStatsModal').setAttribute('aria-hidden','false');

  }catch(err){
    console.error(err);
    alert('No fue posible cargar las estadísticas.');
  }
}

// Cerrar modal
document.getElementById('btnStatsClose')?.addEventListener('click', ()=>{
  const m = document.getElementById('surveyStatsModal');
  m.classList.remove('open');
  m.setAttribute('aria-hidden','true');
});




