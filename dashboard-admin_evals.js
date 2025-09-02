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

        items.push({
          docId: d.id, courseKey, courseName, date, forma, empresa, participants, participantsCount
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
  populateCourseSelect(item.courseKey || '', isEdit);
  // item.date puede ser Date, string o timestamp -> formateo a YYYY-MM-DD
  const yyyyMMdd = item.date ? new Date(item.date).toISOString().slice(0,10) : '';
  setVal('historyDate', yyyyMMdd);
  setVal('historyForma', item.forma || 'abierto');
  setVal('historyEmpresa', item.empresa || '');
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
// ===== Reemplazar COMPLETO saveHistory por esto =====
async function saveHistory(){
  const courseKey = $('#historyCourseKey').value;     // docId en evaluations (p.ej. NFPA_70E.v3)
  const dateStr   = $('#historyDate').value;          // YYYY-MM-DD
  const forma     = $('#historyForma').value;         // 'abierto' | 'cerrado'
  const empresa   = $('#historyEmpresa').value.trim();

  if (!courseKey || !dateStr){
    alert('Selecciona curso y fecha.');
    return;
  }

  const empresaSlug = (forma === 'cerrado' && empresa) ? '_' + sanitizeDocId(empresa) : '';
  const newDocId    = `${courseKey}_${dateStr}_${forma}${empresaSlug}`;
  const col         = firebase.firestore().collection('inscripciones');

  try {
    if (editingHistoryId && editingHistoryId !== newDocId) {
      // === RENOMBRAR: copiar -> borrar -> propagar a usuarios ===
      const oldSnap = await col.doc(editingHistoryId).get();
      if (!oldSnap.exists) throw new Error('No se encontró el curso a editar.');

      const oldData = oldSnap.data() || {};
      // normalizamos array de participantes
      let participants = oldData.inscriptions || [];
      if (participants && !Array.isArray(participants) && typeof participants === 'object') {
        participants = Object.values(participants);
      }

      // base del nuevo documento
      const base = {
        courseKey,
        courseDate: dateStr,
        formaCurso: forma,
        empresaSolicitante: (forma === 'cerrado') ? empresa : '',
        inscriptions: participants,
        totalInscritos: Array.isArray(participants) ? participants.length : 0,
        totalPagado: (forma === 'cerrado')
          ? (oldData.totalPagado || 0)
          : (Array.isArray(participants) ? participants.reduce((s,p)=> s + (Number(p.price)||0), 0) : 0)
      };

      // crear nuevo doc con el ID correcto
      await col.doc(newDocId).set(base, { merge:false });
      // borrar el antiguo
      await col.doc(editingHistoryId).delete();

      // actualizar metas de usuarios
      await propagateCourseMetaToUsers(participants, {
        courseKey,
        date: dateStr,
        sessionId: newDocId,
        forma,
        empresa
      });

      alert('✅ Realizado actualizado (renombrado) y usuarios sincronizados.');
    } else {
      // === MISMO ID: actualizar y propagar cambios de meta a usuarios ===
      const payload = {
        courseKey,
        courseDate: dateStr,
        formaCurso: forma,
        empresaSolicitante: (forma === 'cerrado') ? empresa : ''
      };
      const targetId = editingHistoryId || newDocId;

      await col.doc(targetId).set(payload, { merge:true });

      // leer participantes actuales para propagar sus metas
      const snap = await col.doc(targetId).get();
      const data = snap.data() || {};
      let participants = data.inscriptions || [];
      if (participants && !Array.isArray(participants) && typeof participants === 'object') {
        participants = Object.values(participants);
      }

      await propagateCourseMetaToUsers(participants, {
        courseKey,
        date: dateStr,
        sessionId: targetId,
        forma,
        empresa
      });

      alert(editingHistoryId ? '✅ Realizado actualizado.' : ('✅ Realizado creado: ' + targetId));
    }

    closeHistoryEditor();
    await loadHistoryCourses();
  } catch (err) {
    console.error(err);
    alert('❌ Error al guardar: ' + err.message);
  }
}

// ===== Agregar debajo (helper para actualizar usuarios) =====
async function propagateCourseMetaToUsers(participants, { courseKey, date, sessionId, forma, empresa }) {
  if (!Array.isArray(participants)) return;

  for (const p of participants) {
    const customID = p.customID || p.customId || p.cid || '';
    const rut      = p.rut || '';

    // Buscamos al usuario por customID (preferido) o por RUT
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
      date,                               // <- clave para que el Panel de Usuarios cambie fecha
      formaCurso: forma,
      empresaSolicitante: (forma === 'cerrado') ? (empresa || '') : ''
    };

    await uref.update({ assignedCoursesMeta: meta });
  }
}
// ===== Acciones (realizados) =====
document.addEventListener('click', async (e)=>{
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
  $('#btnGoUsers')?.addEventListener('click', ()=>{ location.href='dashboard-admin.html'; });
  $('#btnSignOutFixed')?.addEventListener('click', async ()=>{
    try{ await firebase.auth().signOut(); location.href='index.html'; }catch(e){ alert(e.message); }
  });

  loadCreatedCourses(); // también carga realizados cuando termina

  $('#searchCreated')?.addEventListener('input', renderCreatedList);
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
});




