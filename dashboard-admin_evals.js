// ===== Utilitarios =====
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };

function sanitizeDocId(s=''){
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9._-]+/g,'_')
    .replace(/_{2,}/g,'_').replace(/^_+|_+$/g,'');
}
function fmtDate(d){
  if(!d) return 's/f';
  try { return new Date(d).toLocaleDateString(); } catch { return 's/f'; }
}
function parseDateAny(v){
  if(!v) return null;
  if (v.toDate) return v.toDate();
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
    if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`);
    const d = new Date(v);
    if (!isNaN(d)) return d;
  }
  return null;
}
function versionFromDocId(docId){ const m = /\.v(\d+)$/i.exec(docId || ''); return m ? parseInt(m[1],10) : 1; }
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
function stripPrefixAndExt(url, prefix, ext){
  if(!url) return '';
  let s = url;
  if(prefix && s.startsWith(prefix)) s = s.slice(0+prefix.length);
  if(ext && s.toLowerCase().endsWith(ext.toLowerCase())) s = s.slice(0, -ext.length);
  return s;
}

// === NUEVO: helpers de fechas / días curso (para asistencia de 2 días, etc.)
function addDaysStr(yyyyMmDd, days){
  const d = new Date(`${yyyyMmDd}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0,10);
}
function getCourseDaysFromKey(courseKey){
  const found = (allEvaluations || []).find(x => x.docId === courseKey);
  const raw = found?.data?.timeEvaluation || '';
  const m = /(\d+)/.exec(raw);
  const hours = m ? parseInt(m[1],10) : 16;  // por defecto 16h => 2 días
  return Math.max(1, Math.ceil(hours / 8));
}
function firstDateFromAttendance(att = {}){
  const dates = Object.keys(att)
    .map(k => (k.match(/^(\d{4}-\d{2}-\d{2})_/)||[])[1])
    .filter(Boolean).sort();
  return dates[0] || null;
}
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
function historyCardHTML(item){
  return `
    <div class="course-card" data-hdoc="${item.docId}">
      <div class="actions">
        <button class="btn btn-sm btn-primary act-h-edit">Editar</button>
        <button class="btn btn-sm btn-danger act-h-del">Eliminar</button>
      </div>
      <div class="course-title">${item.courseName || '(Curso desconocido)'}</div>
      <div class="meta">
        <span class="tag">${fmtDate(item.date)}</span>
        <span class="tag">Forma: ${item.forma || 'abierto'}</span>
        ${item.empresa ? `<span class="tag">Empresa: ${item.empresa}</span>` : ''}
        ${item.surveyTitle ? `<span class="tag">Encuesta: ${item.surveyTitle}</span>` : ''}
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
let allEvaluations = [];         // [{docId, data}]
let evalNameByKey = {};          // { courseKey: name }
let allHistory = [];             // realizados
let editingHistoryId = null;

let isSurveyMode = false;        // modo encuestas
let allSurveys = [];             // [{docId, title, evaluationId, questions}]
let surveyNameById = {};         // { surveyDocId: title }

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
    renderCreatedOrSurveys(); // decide según modo
    await loadHistoryCourses();
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

// ===== ENCUESTAS =====
async function loadSurveys(){
  const list = $('#createdList'); list.innerHTML = 'Cargando...';
  try{
    const snap = await firebase.firestore().collection('surveyQuestions').get();
    allSurveys = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
    surveyNameById = {};
    allSurveys.forEach(s => surveyNameById[s.docId] = s.title || s.docId);
    renderSurveyList();
  }catch(e){
    console.error(e); list.innerHTML = 'Error al cargar encuestas.';
  }
}
function renderSurveyList(){
  const q = ($('#searchCreated')?.value || '').toLowerCase().trim();
  const list = $('#createdList');
  const rows = (allSurveys || [])
    .filter(s => {
      if(!q) return true;
      const inDoc = (s.docId||'').toLowerCase().includes(q);
      const inEval = (s.evaluationId||'').toLowerCase().includes(q);
      const inTitle = (s.title||'').toLowerCase().includes(q);
      const inQuestions = Array.isArray(s.questions) && s.questions.some(x => (x.text||'').toLowerCase().includes(q));
      return inDoc || inEval || inTitle || inQuestions;
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
  $('#createdTitle').textContent = isSurveyMode ? 'Encuestas de Satisfacción' : 'Cursos Ofertados';
  $('#btnNewCourse').style.display = isSurveyMode ? 'none' : '';
  $('#btnNewSurvey').style.display = isSurveyMode ? '' : 'none';
  $('#searchCreated')?.setAttribute('placeholder',
    isSurveyMode ? 'Buscar por nombre, curso base o texto...' : 'Buscar por nombre o ID...'
  );
  if (isSurveyMode) await loadSurveys(); else renderCreatedList();
}

// ===== Cargar CURSOS REALIZADOS =====
async function loadHistoryCourses(){
  const list = $('#doneList'); list.innerHTML = 'Cargando...';
  const items = [];
  try{
    const snap = await firebase.firestore().collection('inscripciones').get().catch(()=>null);
    if (snap && !snap.empty){
      snap.forEach(d=>{
        const r = d.data() || {};
        const courseKey = r.courseKey || r.courseId || r.course || '';
        const date = parseDateAny(r.courseDate) || parseDateAny(r.date);
        const forma = r.formaCurso || r.forma || r.mode || 'abierto';
        const empresa = r.empresaSolicitante || r.empresa || r.company || '';
        const surveyId = r.surveyId || r.surveyDocId || ''; // campo que guardaremos

        let participants = r.inscriptions || r.participants || r.users || r.alumnos || [];
        if (participants && !Array.isArray(participants) && typeof participants === 'object') {
          participants = Object.values(participants);
        }
        const participantsCount = Array.isArray(participants) ? participants.length : 0;
        const courseName = evalNameByKey[courseKey] || '(Curso desconocido)';

        items.push({
          docId: d.id, courseKey, courseName, date, forma, empresa, participants, participantsCount,
          surveyId, surveyTitle: surveyNameById[surveyId] || (surveyId || '')
        });
      });
    }
    // Ordenar por fecha
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
             fmtDate(it.date).toLowerCase().includes(q) ||
             (it.surveyTitle||'').toLowerCase().includes(q);
    })
    .map(historyCardHTML)
    .join('');
  list.innerHTML = rows || '<div class="meta">No hay cursos realizados aún.</div>';
}

// ===== Editor de cursos (creados) — (tus funciones existentes, intactas) =====
// ... (todo tu bloque de editor de cursos se mantiene igual: makeQuestion, renumberQuestions, rowChip, clearForm, fillForm, collectArrayFrom, collectQuestions, saveEvaluation)
// === Pegamos aquí el mismo código que ya tenías para editor de cursos ===
// === (omitido por brevedad; usa tu bloque original sin cambios) ===

/* ==== INICIO: BLOQUE ORIGINAL DEL EDITOR DE CURSOS (COPIADO DE TU ARCHIVO) ==== */
// (Pegue aquí exactamente tus funciones makeQuestion, renumberQuestions, rowChip, clearForm, fillForm,
//  collectArrayFrom, collectQuestions, saveEvaluation, y los handlers de .act-edit/.act-copy/.act-delete)
// Para no inundar: como ya lo tenías arriba en tu archivo, déjalo tal cual.
/* ==== FIN: BLOQUE ORIGINAL DEL EDITOR DE CURSOS ==== */

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
  const sel = $('#historyCourseKey'); sel.innerHTML = '';
  allEvaluations
    .map(x => x.docId)
    .sort((a,b) => a.localeCompare(b))
    .forEach(docId => {
      const opt = document.createElement('option');
      opt.value = docId; opt.textContent = docId;
      if (docId === selectedKey) opt.selected = true;
      sel.appendChild(opt);
    });
  sel.disabled = !!disabled;
}
function populateSurveySelect(selectedId=''){
  const sel = $('#historySurveySelect'); sel.innerHTML = '';
  // opción por defecto (vacío)
  const o0 = document.createElement('option');
  o0.value = ''; o0.textContent = 'Usar predeterminada';
  sel.appendChild(o0);
  // encuestas por nombre
  (allSurveys || []).sort((a,b)=> (a.title||a.docId).localeCompare(b.title||b.docId))
    .forEach(s=>{
      const opt = document.createElement('option');
      opt.value = s.docId;
      opt.textContent = s.title || s.docId;
      if (s.docId === selectedId) opt.selected = true;
      sel.appendChild(opt);
    });
}
function fillHistoryEditor(item, isEdit){
  populateCourseSelect(item.courseKey || '', false);
  const yyyyMMdd = item.date ? new Date(item.date).toISOString().slice(0,10) : '';
  setVal('historyDate', yyyyMMdd);
  setVal('historyForma', item.forma || 'abierto');
  setVal('historyEmpresa', item.empresa || '');

  // Asegura encuestas cargadas antes de llenar
  const ensureSurveys = async () => { if (!allSurveys.length) await loadSurveys(); populateSurveySelect(item.surveyId || ''); };
  ensureSurveys();

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

// ===== Guardar REALIZADOS (con migración de asistencia y encuesta asignada) =====
async function saveHistory(){
  const courseKey = $('#historyCourseKey').value;
  const dateStr   = $('#historyDate').value;
  const forma     = $('#historyForma').value;
  const empresa   = $('#historyEmpresa').value.trim();
  const surveyId  = $('#historySurveySelect').value || ''; // ← nuevo

  if (!courseKey || !dateStr){ alert('Selecciona curso y fecha.'); return; }

  const newDocId = buildHistoryDocId(courseKey, dateStr, forma, empresa);
  const col      = firebase.firestore().collection('inscripciones');
  const numDays  = getCourseDaysFromKey(courseKey);

  try {
    // Crear
    if (!editingHistoryId){
      await col.doc(newDocId).set({
        courseKey,
        courseDate: dateStr,
        formaCurso: forma,
        empresaSolicitante: (forma === 'cerrado') ? empresa : '',
        surveyId, // <-- guardar encuesta elegida
        inscriptions: [],
        totalInscritos: 0,
        totalPagado: 0
      }, { merge:false });
      alert('✅ Realizado creado: ' + newDocId);
      closeHistoryEditor();
      await loadHistoryCourses();
      return;
    }

    // Editar
    const oldRef  = col.doc(editingHistoryId);
    const oldSnap = await oldRef.get();
    if (!oldSnap.exists) throw new Error('No se encontró el curso a editar.');
    const oldData = oldSnap.data() || {};
    let oldDate = oldData.courseDate || '';
    if (!oldDate) {
      const m = /_(\d{4}-\d{2}-\d{2})_/.exec(editingHistoryId);
      if (m) oldDate = m[1];
    }
    let participants = oldData.inscriptions || oldData.participants || oldData.users || [];
    if (participants && !Array.isArray(participants) && typeof participants === 'object') {
      participants = Object.values(participants);
    }
    if (!Array.isArray(participants)) participants = [];

    if (newDocId !== editingHistoryId){
      const remapped = participants.map(p=>{
        const att = p.attendance || {};
        return { ...p, attendance: remapAttendanceRange(att, oldDate, dateStr, numDays) };
      });
      const base = {
        courseKey,
        courseDate: dateStr,
        formaCurso: forma,
        empresaSolicitante: (forma === 'cerrado') ? empresa : '',
        surveyId,
        inscriptions: remapped,
        totalInscritos: remapped.length,
        totalPagado: (forma === 'cerrado')
          ? (oldData.totalPagado || 0)
          : remapped.reduce((s,p)=> s + (Number(p.price)||0), 0)
      };
      await col.doc(newDocId).set(base, { merge:false });
      await oldRef.delete();

      await propagateCourseMetaToUsers(remapped, {
        courseKey, date: dateStr, sessionId: newDocId, forma, empresa
      });

      alert('✅ Realizado actualizado (renombrado) y asistencias migradas.');
    } else {
      const payload = {
        courseKey,
        courseDate: dateStr,
        formaCurso: forma,
        empresaSolicitante: (forma === 'cerrado') ? empresa : '',
        surveyId
      };
      await oldRef.set(payload, { merge:true });

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

// ===== Propagar meta a usuarios (igual que tenías) =====
async function propagateCourseMetaToUsers(participants, { courseKey, date, sessionId, forma, empresa }) {
  if (!Array.isArray(participants)) return;
  for (const p of participants) {
    const customID = p.customID || p.customId || p.cid || '';
    const rut      = p.rut || '';
    let q = null;
    if (customID) {
      q = await firebase.firestore().collection('users').where('customID','==', customID).limit(1).get().catch(()=>null);
    }
    if ((!q || q.empty) && rut) {
      q = await firebase.firestore().collection('users').where('rut','==', rut).limit(1).get().catch(()=>null);
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
      date,
      formaCurso: forma,
      empresaSolicitante: (forma === 'cerrado') ? (empresa || '') : ''
    };
    await uref.update({ assignedCoursesMeta: meta });
  }
}

// ====== ENCUESTAS: Editor ======
let editingSurveyId = null;

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
  // volver a dejar "default" seleccionado
  populateSurveyEvalDefault('default');
}
function populateSurveyEvalDefault(selected='default'){
  const sel = $('#surveyEvalDefault'); sel.innerHTML = '';
  const o0 = document.createElement('option'); o0.value = 'default'; o0.textContent = 'default';
  sel.appendChild(o0);
  (allEvaluations || []).map(x=>x.docId).sort((a,b)=>a.localeCompare(b)).forEach(docId=>{
    const o = document.createElement('option');
    o.value = docId; o.textContent = docId;
    if (docId === selected) o.selected = true;
    sel.appendChild(o);
  });
}
function surveyQuestionCard(q = { text:'', type:'select', options:[''] }){
  const qid = 'sq' + Math.random().toString(36).slice(2,9);
  const wrap = document.createElement('div');
  wrap.className = 'q-card';
  wrap.dataset.qid = qid;
  wrap.innerHTML = `
    <div class="q-head">
      <div class="q-title"><span class="q-number">#</span> Texto de la pregunta</div>
      <button type="button" class="small-btn q-del">Eliminar</button>
    </div>

    <div class="field"><input class="q-text" type="text" placeholder="Escribe la pregunta..." value="${(q.text||'').replace(/"/g,'&quot;')}"></div>

    <div class="row">
      <div>
        <label>Tipo</label>
        <select class="q-type">
          <option value="select">Selección</option>
          <option value="text">Respuesta abierta</option>
        </select>
      </div>
      <div class="alt-box" style="flex:2">
        <label>Alternativas</label>
        <div class="alt-list"></div>
        <button type="button" class="small-btn alt-add">+ Alternativa</button>
      </div>
    </div>
  `;
  const typeSel = wrap.querySelector('.q-type');
  const altList = wrap.querySelector('.alt-list');

  function addAlt(val=''){
    const r = document.createElement('div');
    r.className = 'q-row';
    r.innerHTML = `
      <input class="alt-text" type="text" placeholder="Texto de alternativa" value="${(val||'').replace(/"/g,'&quot;')}">
      <button type="button" class="small-btn alt-del">Quitar</button>
    `;
    r.querySelector('.alt-del').addEventListener('click', ()=> r.remove());
    altList.appendChild(r);
  }
  // init from q
  typeSel.value = q.type || 'select';
  const opts = Array.isArray(q.options) && q.options.length ? q.options : [''];
  opts.forEach(addAlt);

  function updateAltVisibility(){
    wrap.querySelector('.alt-box').style.display = (typeSel.value === 'select') ? '' : 'none';
  }
  updateAltVisibility();
  typeSel.addEventListener('change', updateAltVisibility);

  wrap.querySelector('.alt-add').addEventListener('click', ()=> addAlt(''));
  wrap.querySelector('.q-del').addEventListener('click', ()=> wrap.remove());
  return wrap;
}
function renumberSurveyQuestions(){
  $$('#surveyQuestionsList .q-card').forEach((card, idx)=>{
    const n = card.querySelector('.q-number');
    if(n) n.textContent = (idx+1)+'.';
  });
}
function fillSurveyForm(docId, data){
  editingSurveyId = docId || null;
  setVal('surveyNameInput', data.title || '');
  populateSurveyEvalDefault(data.evaluationId || 'default');
  const box = $('#surveyQuestionsList'); box.innerHTML = '';
  (data.questions || []).forEach(q => box.appendChild(surveyQuestionCard(q)));
  renumberSurveyQuestions();
}
function collectSurveyQuestions(){
  const out = [];
  $$('#surveyQuestionsList .q-card').forEach(card=>{
    const text = card.querySelector('.q-text').value.trim();
    const type = card.querySelector('.q-type').value;
    let options = [];
    if (type === 'select'){
      options = Array.from(card.querySelectorAll('.alt-text'))
        .map(i => i.value.trim()).filter(Boolean);
      if (!options.length) options = ['Sí','No']; // fallback mínimo
    }
    if(!text) return;
    const q = { text, type };
    if (type === 'select') q.options = options;
    out.push(q);
  });
  return out;
}
async function saveSurvey(){
  const title = $('#surveyNameInput').value.trim();
  const evalDefault = $('#surveyEvalDefault').value || 'default';
  if (!title){ alert('Escribe el nombre de la encuesta.'); return; }
  const docId = sanitizeDocId(title);
  const questions = collectSurveyQuestions();

  const payload = {
    title,                          // nombre visible
    evaluationId: evalDefault,      // base por defecto
    questions                       // preguntas (con alternativas si aplica)
  };

  const col = firebase.firestore().collection('surveyQuestions');

  try{
    if (!editingSurveyId){
      // Crear nuevo
      const exists = await col.doc(docId).get();
      if (exists.exists) {
        // si existe, le agregamos sufijo de tiempo
        const altId = `${docId}_${Date.now().toString(36)}`;
        await col.doc(altId).set(payload, { merge:false });
      } else {
        await col.doc(docId).set(payload, { merge:false });
      }
      alert('✅ Encuesta creada.');
    } else {
      // Editar (si cambió el nombre -> renombrar)
      if (editingSurveyId !== docId){
        const oldSnap = await col.doc(editingSurveyId).get();
        const oldData = oldSnap.data() || {};
        await col.doc(docId).set({ ...oldData, ...payload }, { merge:false });
        await col.doc(editingSurveyId).delete();
      } else {
        await col.doc(docId).set(payload, { merge:true });
      }
      alert('✅ Encuesta guardada.');
    }
    closeSurveyEditor();
    await loadSurveys();
    await loadHistoryCourses(); // refresca nombres en historial
  }catch(err){
    console.error(err); alert('❌ Error al guardar encuesta: '+err.message);
  }
}
async function copySurvey(docId){
  try{
    const col = firebase.firestore().collection('surveyQuestions');
    const snap = await col.doc(docId).get();
    if (!snap.exists) { alert('No se encontró la encuesta.'); return; }
    const data = snap.data();
    const base = sanitizeDocId((data.title || docId) + '_copia');
    let target = base, n=2;
    // evitar choque
    while (true){
      /* eslint-disable no-await-in-loop */
      const s = await col.doc(target).get();
      if (!s.exists) break;
      target = `${base}_${n++}`;
    }
    await col.doc(target).set(data, { merge:false });
    alert('✅ Copiada como ' + target);
    await loadSurveys();
  }catch(err){
    console.error(err); alert('❌ Error al copiar: '+err.message);
  }
}

// ===== Acciones (delegación global) =====
document.addEventListener('click', async (e)=>{
  // Cursos (creados) — (tus handlers existentes)
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
    if(!confirm(`Vas a eliminar el curso:\n\n${name}\n(ID: ${docId})\n\nEsta acción no se puede deshacer. ¿Continuar?`)) return;
    try{
      await firebase.firestore().collection('evaluations').doc(docId).delete();
      alert('🗑️ Curso eliminado.');
      await loadCreatedCourses();
    }catch(err){ console.error(err); alert('❌ Error al eliminar: '+err.message); }
  }

  // ENCUESTAS
  const btnSEdit = e.target.closest('.act-survey-edit');
  const btnSCopy = e.target.closest('.act-survey-copy');
  const btnSDel  = e.target.closest('.act-survey-delete');

  if (btnSEdit){
    const card = btnSEdit.closest('.course-card');
    const id   = card.getAttribute('data-survey');
    const s    = allSurveys.find(x=>x.docId===id);
    if (!s){ alert('No se encontró la encuesta.'); return; }
    fillSurveyForm(id, s);
    $('#surveyTitle').textContent = 'Editar encuesta';
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
    const s    = allSurveys.find(x=>x.docId===id);
    const name = s?.title || id;
    if(!confirm(`Vas a eliminar esta encuesta:\n\n${name}\n(ID: ${id})\n\n¿Continuar?`)) return;
    try{
      await firebase.firestore().collection('surveyQuestions').doc(id).delete();
      alert('🗑️ Encuesta eliminada.');
      await loadSurveys();
    }catch(err){ console.error(err); alert('❌ Error al eliminar: '+err.message); }
  }

  // REALIZADOS
  const btnHEdit = e.target.closest('.act-h-edit');
  const btnHDel  = e.target.closest('.act-h-del');

  if (btnHEdit){
    const card = btnHEdit.closest('.course-card');
    const id   = card.getAttribute('data-hdoc');
    const item = allHistory.find(h=>h.docId===id);
    if (!item){ alert('No se encontró el realizado.'); return; }
    editingHistoryId = id;
    fillHistoryEditor(item, true);
    openHistoryEditor('Editar realizado');
  }
  if (btnHDel){
    const card = btnHDel.closest('.course-card');
    const id   = card.getAttribute('data-hdoc');
    const item = allHistory.find(h=>h.docId===id);
    const name = item?.courseName || id;
    if(!confirm(`Vas a eliminar este curso realizado:\n\n${name}\n(ID: ${id})\n\n¿Continuar?`)) return;
    try{
      await firebase.firestore().collection('inscripciones').doc(id).delete();
      alert('🗑️ Realizado eliminado.');
      await loadHistoryCourses();
    }catch(err){ console.error(err); alert('❌ Error al eliminar: '+err.message); }
  }
});

// ===== Wire-up =====
document.addEventListener('DOMContentLoaded', ()=>{
  // Botones globales
  $('#btnToggleSurveys')?.addEventListener('click', ()=> toggleSurveyMode());
  $('#btnNewCourse')?.addEventListener('click', ()=>{
    clearForm(); $('#editorTitle').textContent = 'Nuevo curso'; openEditor('Nuevo curso');
  });
  $('#btnSave')?.addEventListener('click', saveEvaluation);
  $('#btnClose')?.addEventListener('click', closeEditor);

  // Encuestas
  $('#btnNewSurvey')?.addEventListener('click', ()=>{
    editingSurveyId = null;
    setVal('surveyNameInput',''); populateSurveyEvalDefault('default');
    $('#surveyQuestionsList').innerHTML = '';
    $('#surveyTitle').textContent = 'Nueva encuesta';
    openSurveyEditor('Nueva encuesta');
  });
  $('#btnSurveyAddQuestion')?.addEventListener('click', ()=>{
    $('#surveyQuestionsList').appendChild(surveyQuestionCard({ text:'', type:'select', options:['Muy satisfecho','Satisfecho','Neutral','Insatisfecho','Muy insatisfecho'] }));
    renumberSurveyQuestions();
  });
  $('#btnSurveySave')?.addEventListener('click', saveSurvey);
  $('#btnSurveyClose')?.addEventListener('click', closeSurveyEditor);

  // Historial
  $('#btnNewHistory')?.addEventListener('click', async ()=>{
    editingHistoryId = null;
    populateCourseSelect('', false);
    const ensureSurveys = async () => { if (!allSurveys.length) await loadSurveys(); populateSurveySelect(''); };
    await ensureSurveys();
    fillHistoryEditor({ participants:[] }, false);
    openHistoryEditor('Nuevo realizado');
  });
  $('#btnHistorySave')?.addEventListener('click', saveHistory);
  $('#btnHistoryClose')?.addEventListener('click', closeHistoryEditor);

  // Buscadores
  $('#searchCreated')?.addEventListener('input', ()=>{ renderCreatedOrSurveys(); });
  $('#searchDone')?.addEventListener('input', renderHistoryList);

  // Carga inicial
  loadCreatedCourses(); // también carga realizados luego
});
