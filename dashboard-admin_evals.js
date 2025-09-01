// =======================
// Utilitarios
// =======================
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };

// Sanitiza docId (para creación/edición manual)
function sanitizeDocId(s = '') {
  return s
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Siguiente versión desde un docId EXACTO (preserva mayúsculas/minúsculas del base)
async function nextVersionFromExact(docIdExact) {
  const m = /\.v(\d+)$/i.exec(docIdExact);
  const base = m ? docIdExact.replace(/\.v\d+$/i, '') : docIdExact;
  let current = m ? parseInt(m[1], 10) : 1;
  while (true) {
    const candidate = `${base}.v${current + 1}`;
    /* eslint-disable no-await-in-loop */
    const snap = await firebase.firestore().collection('evaluations').doc(candidate).get();
    if (!snap.exists) return candidate;
    current++;
  }
}

// Versión desde docId (1 si no hay sufijo .vN)
function versionFromDocId(docId) {
  const m = /\.v(\d+)$/i.exec(docId || '');
  return m ? parseInt(m[1], 10) : 1;
}

// Quita prefijo/sufijo de archivo para mostrar solo el "nombre base"
function stripPrefixAndExt(url, prefix, ext) {
  if (!url) return '';
  let s = url;
  if (prefix && s.startsWith(prefix)) s = s.slice(prefix.length);
  if (ext && s.toLowerCase().endsWith(ext.toLowerCase())) s = s.slice(0, -ext.length);
  return s;
}

// =======================
// Render de tarjetas
// =======================
function courseCardHTML({ docId, id, name, title, puntajeAprobacion, version }) {
  return `
    <div class="course-card" data-doc="${docId}" data-id="${id || ''}">
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

function doneCardHTML({ course, dateStr, empresa }) {
  return `
    <div class="course-card">
      <div class="course-title">${course || '(Curso desconocido)'}</div>
      <div class="meta">
        <span class="tag">${dateStr || '-'}</span>
        ${empresa ? `<span class="tag">Empresa: ${empresa}</span>` : ''}
      </div>
    </div>
  `;
}

// =======================
// Estado
// =======================
let allEvaluations = []; // [{docId, data}]

// =======================
// Cargar listados
// =======================
async function loadCreatedCourses() {
  const list = $('#createdList');
  list.innerHTML = 'Cargando...';
  try {
    const snap = await firebase.firestore().collection('evaluations').get();
    allEvaluations = snap.docs.map(d => ({ docId: d.id, data: d.data() }));
    renderCreatedList();
  } catch (e) {
    console.error(e);
    list.innerHTML = 'Error al cargar evaluaciones.';
  }
}

function renderCreatedList() {
  const q = ($('#searchCreated')?.value || '').toLowerCase().trim();
  const list = $('#createdList');
  const rows = allEvaluations
    .filter(({ docId, data }) => {
      if (!q) return true;
      const hay =
        (docId || '').toLowerCase().includes(q) ||
        (data.name || '').toLowerCase().includes(q) ||
        (data.title || '').toLowerCase().includes(q) ||
        (data.ID || '').toLowerCase().includes(q);
      return hay;
    })
    .map(({ docId, data }) => {
      const payload = {
        docId,
        id: data.ID || '',
        name: data.name || '',
        title: data.title || data.name || '',
        puntajeAprobacion: data.puntajeAprobacion || '',
        version: versionFromDocId(docId)
      };
      return courseCardHTML(payload);
    })
    .join('');
  list.innerHTML = rows || '<div class="meta">No hay cursos creados.</div>';
}

async function loadDoneCourses() {
  const list = $('#doneList');
  list.innerHTML = 'Cargando...';
  const items = [];
  try {
    // responses
    const resSnap = await firebase.firestore().collection('responses').limit(100).get().catch(() => null);
    if (resSnap && !resSnap.empty) {
      resSnap.forEach(d => {
        const r = d.data() || {};
        const course = r.title || r.evaluationTitle || r.course || r.evaluationName || r.evalTitle;
        const ts = r.createdAt?.toDate?.() || (r.createdAt ? new Date(r.createdAt) : null) || (r.date ? new Date(r.date) : null);
        const empresa = r.empresa || r.company;
        items.push({ course, date: ts, empresa });
      });
    }
    // inscripciones / inscriptions
    const tryCol = async (name) => {
      const snap = await firebase.firestore().collection(name).limit(100).get().catch(() => null);
      if (!snap || snap.empty) return;
      snap.forEach(d => {
        const r = d.data() || {};
        const course = r.courseName || r.course || r.title || r.evaluationTitle;
        const ts = r.date?.toDate?.() || (r.date ? new Date(r.date) : null) || r.createdAt?.toDate?.();
        const empresa = (r.forma === 'cerrado' ? (r.empresa || r.company) : null);
        items.push({ course, date: ts, empresa });
      });
    };
    await tryCol('inscripciones');
    await tryCol('inscriptions');

    items.sort((a,b)=> (b.date?.getTime?.()||0) - (a.date?.getTime?.()||0));
    const q = ($('#searchDone')?.value || '').toLowerCase().trim();
    const html = items
      .filter(it => {
        if (!q) return true;
        const hay =
          (it.course || '').toLowerCase().includes(q) ||
          (it.empresa || '').toLowerCase().includes(q) ||
          (it.date ? it.date.toLocaleDateString() : '').toLowerCase().includes(q);
        return hay;
      })
      .map(it => doneCardHTML({
        course: it.course,
        dateStr: it.date ? it.date.toLocaleDateString() : 's/f',
        empresa: it.empresa
      }))
      .join('');
    list.innerHTML = html || '<div class="meta">No hay cursos realizados aún.</div>';
  } catch (e) {
    console.error(e);
    list.innerHTML = 'Error al cargar cursos realizados.';
  }
}

// =======================
// Editor (abrir/cerrar)
// =======================
function openEditor(title='Nuevo curso') {
  $('#editorTitle').textContent = title;
  $('#editor').classList.add('open');
  $('#editor').setAttribute('aria-hidden', 'false');
}
function closeEditor() {
  $('#editor').classList.remove('open');
  $('#editor').setAttribute('aria-hidden', 'true');
  clearForm();
}

// =======================
// Controles dinámicos
// =======================
function rowChip(value = '') {
  const wrap = document.createElement('div');
  wrap.className = 'chip-row';
  wrap.innerHTML = `
    <input type="text" placeholder="Escribe aquí..." value="${(value||'').replace(/"/g,'&quot;')}">
    <button type="button" class="small-btn small-del">Eliminar</button>
  `;
  wrap.querySelector('button').addEventListener('click', () => wrap.remove());
  return wrap;
}

function makeQuestion(q = { text:'', options:[''], correct:'' }) {
  const wrap = document.createElement('div');
  wrap.className = 'q-card';
  wrap.innerHTML = `
    <div class="field">
      <label>Enunciado</label>
      <input class="q-text" type="text" placeholder="Escribe la pregunta..." value="${(q.text||'').replace(/"/g,'&quot;')}">
    </div>

    <div class="q-options"></div>
    <div class="q-actions">
      <button type="button" class="small-btn q-add">+ Opción</button>
      <button type="button" class="small-btn q-del">Eliminar pregunta</button>
    </div>

    <div class="field">
      <label>Respuesta correcta</label>
      <input class="q-correct" type="text" placeholder="Debe coincidir con una opción" value="${(q.correct||'').replace(/"/g,'&quot;')}">
    </div>
  `;
  const optBox = wrap.querySelector('.q-options');

  function addOption(val = '') {
    const r = document.createElement('div');
    r.className = 'q-row';
    r.innerHTML = `
      <input class="opt-text" type="text" placeholder="Texto de la opción" value="${(val||'').replace(/"/g,'&quot;')}">
      <button type="button" class="small-btn q-del-opt">Quitar</button>
    `;
    r.querySelector('.q-del-opt').addEventListener('click', () => r.remove());
    optBox.appendChild(r);
  }

  const opts = Array.isArray(q.options) && q.options.length ? q.options : [''];
  opts.forEach(addOption);

  wrap.querySelector('.q-add').addEventListener('click', () => addOption(''));
  wrap.querySelector('.q-del').addEventListener('click', () => wrap.remove());

  return wrap;
}

// =======================
// Form helpers
// =======================
function clearForm() {
  ['docIdInput','idInput','nameInput','descInput','manualUrlInput',
   'certificateTmplInput','imageUrlInput','imageBadgeInput','timeHoursInput','scoreInput']
   .forEach(id => setVal(id, ''));
  $('#criteriaList').innerHTML = '';
  $('#standardsList').innerHTML = '';
  $('#questionsList').innerHTML = '';
}

function fillForm(docId, data) {
  setVal('docIdInput', docId || '');
  setVal('idInput', data.ID ?? '');
  setVal('nameInput', data.name ?? '');
  setVal('descInput', data.description ?? '');

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
}

function collectArrayFrom(containerSel) {
  const out = [];
  $$(containerSel + ' input[type="text"]').forEach(i => {
    const v = i.value.trim();
    if (v) out.push(v);
  });
  return out;
}

function collectQuestions() {
  const out = [];
  $$('#questionsList .q-card').forEach(card => {
    const text = card.querySelector('.q-text').value.trim();
    const correct = card.querySelector('.q-correct').value.trim();
    const options = [];
    card.querySelectorAll('.opt-text').forEach(o => {
      const v = o.value.trim();
      if (v) options.push(v);
    });
    if (!text || !options.length) return;
    out.push({ text, options, correct });
  });
  return out;
}

// =======================
// Acciones de tarjetas
// =======================
document.addEventListener('click', async (e) => {
  const btnEdit = e.target.closest('.act-edit');
  const btnCopy = e.target.closest('.act-copy');
  const btnDel  = e.target.closest('.act-delete');

  if (btnEdit) {
    const card = btnEdit.closest('.course-card');
    const docId = card.getAttribute('data-doc');
    const found = allEvaluations.find(x => x.docId === docId);
    fillForm(docId, found?.data || {});
    $('#editorTitle').textContent = 'Editar curso';
    openEditor('Editar curso');
  }

  if (btnCopy) {
    const card = btnCopy.closest('.course-card');
    const originalId = card.getAttribute('data-doc'); // EXACTO
    try {
      const snap = await firebase.firestore().collection('evaluations').doc(originalId).get();
      if (!snap.exists) { alert('No se encontró el curso a copiar.'); return; }
      const data = snap.data();
      const newId = await nextVersionFromExact(originalId);
      await firebase.firestore().collection('evaluations').doc(newId).set(data, { merge:false });
      alert('✅ Copiado como ' + newId);
      await loadCreatedCourses();
    } catch (err) {
      console.error(err);
      alert('❌ Error al copiar: ' + err.message);
    }
  }

  if (btnDel) {
    const card = btnDel.closest('.course-card');
    const docId = card.getAttribute('data-doc');
    const found = allEvaluations.find(x => x.docId === docId);
    const name  = found?.data?.title || found?.data?.name || docId;
    if (!confirm(`Vas a eliminar el curso:\n\n${name}\n(ID de documento: ${docId})\n\nEsta acción no se puede deshacer. ¿Continuar?`)) return;
    try {
      await firebase.firestore().collection('evaluations').doc(docId).delete();
      alert('🗑️ Curso eliminado.');
      await loadCreatedCourses();
    } catch (err) {
      console.error(err);
      alert('❌ Error al eliminar: ' + err.message);
    }
  }
});

// =======================
// Guardar (crear/actualizar)
// =======================
async function saveEvaluation() {
  // docId desde input (sanitizado); si está vacío, se deriva del nombre
  let docId = $('#docIdInput').value.trim();
  if (!docId) {
    const baseFrom = $('#nameInput').value || 'curso';
    docId = sanitizeDocId(baseFrom);
  } else {
    docId = sanitizeDocId(docId);
  }

  const ID = $('#idInput').value.trim();
  const name = $('#nameInput').value.trim();
  const title = name; // title = name (no editable)
  const description = $('#descInput').value.trim();

  // archivos (solo nombre base, agregamos prefijo/extensión)
  const manualPrefix = 'https://esysingenieria.github.io/evaluaciones-cursos/manuales-cursos/';
  const manualBase = $('#manualUrlInput').value.trim().replace(/\.pdf$/i,'');
  const certificateBase = $('#certificateTmplInput').value.trim().replace(/\.pdf$/i,'');
  const coverBase = $('#imageUrlInput').value.trim().replace(/\.jpg$/i,'');
  const badgeBase = $('#imageBadgeInput').value.trim().replace(/\.png$/i,'');

  const manualURL = manualBase ? `${manualPrefix}${manualBase}.pdf` : '';
  const certificateTemplate = certificateBase ? `${certificateBase}.pdf` : '';
  const imageURL = coverBase ? `${coverBase}.jpg` : '';
  const imageURL_badge = badgeBase ? `${badgeBase}.png` : '';

  // fijos / derivados
  const puntajeAprobacion = $('#scoreInput').value.trim();
  const timeHours = $('#timeHoursInput').value.trim();
  const timeEvaluation = timeHours ? `${timeHours} HRS.` : '';
  const isLocked = false;
  const lastDate = 36;
  const timelimit = 3600;

  if (!ID || !name || !certificateTemplate) {
    alert('Faltan campos obligatorios: Identificador de Curso / Nombre de Curso / Plantilla Certificado');
    return;
  }

  const criteria = collectArrayFrom('#criteriaList');
  const standards = collectArrayFrom('#standardsList');
  const questions = collectQuestions();

  const payload = {
    ID,
    certificateTemplate,
    criteria,
    description,
    imageURL,
    imageURL_badge,
    isLocked,
    lastDate,
    manualURL,
    name,
    puntajeAprobacion,
    questions,
    standards,
    timeEvaluation,
    timelimit,
    title
  };

  try {
    await firebase.firestore().collection('evaluations').doc(docId).set(payload, { merge:false });
    alert('✅ Guardado en evaluations/' + docId);
    closeEditor();
    await loadCreatedCourses();
  } catch (err) {
    console.error(err);
    alert('❌ Error al guardar: ' + err.message);
  }
}

// =======================
// Wire-up
// =======================
document.addEventListener('DOMContentLoaded', () => {
  // navegación
  $('#btnGoUsers')?.addEventListener('click', () => { location.href = 'dashboard-admin.html'; });
  $('#btnSignOut')?.addEventListener('click', async () => {
    try { await firebase.auth().signOut(); location.href = 'index.html'; } catch (e) { alert(e.message); }
  });

  // listados
  loadCreatedCourses();
  loadDoneCourses();

  // buscadores
  $('#searchCreated')?.addEventListener('input', renderCreatedList);
  $('#searchDone')?.addEventListener('input', loadDoneCourses);

  // editor
  $('#btnNewCourse')?.addEventListener('click', () => {
    clearForm();
    $('#editorTitle').textContent = 'Nuevo curso';
    openEditor('Nuevo curso');
  });
  $('#btnSave')?.addEventListener('click', saveEvaluation);
  $('#btnClose')?.addEventListener('click', closeEditor);

  // agregar filas dinámicas en editor
  $('#btnAddCriterion')?.addEventListener('click', () => {
    $('#criteriaList').appendChild(rowChip(''));
  });
  $('#btnAddStandard')?.addEventListener('click', () => {
    $('#standardsList').appendChild(rowChip(''));
  });
  $('#btnAddQuestion')?.addEventListener('click', () => {
    $('#questionsList').appendChild(makeQuestion({ text:'', options:[''], correct:'' }));
  });
});
