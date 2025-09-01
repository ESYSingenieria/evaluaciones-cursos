// Utilitarios
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// Sanitiza docId a lo permitido (minúsculas, sin tildes, solo [a-z0-9._-])
function sanitizeDocId(s='') {
  return s
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Genera id de copia con .v2, .v3, ...
async function nextVersionId(baseId) {
  let candidate = baseId, n = 2;
  const doc = await firebase.firestore().collection('evaluations').doc(candidate).get();
  if (!doc.exists) return candidate;
  while (true) {
    candidate = `${baseId}.v${n}`;
    // Firestore permite puntos en docId
    /* eslint-disable no-await-in-loop */
    const snap = await firebase.firestore().collection('evaluations').doc(candidate).get();
    if (!snap.exists) return candidate;
    n++;
  }
}

// Render de tarjetas
function courseCardHTML({ id, name, title, puntajeAprobacion }) {
  return `
    <div class="course-card" data-id="${id}">
      <div class="actions">
        <button class="btn btn-sm btn-primary act-edit">Editar</button>
        <button class="btn btn-sm btn-neutral act-copy">Copiar</button>
      </div>
      <div class="course-title">${title || name || '(Sin título)'}</div>
      <div class="meta">
        <span class="tag">ID: ${id || '-'}</span>
        <span class="tag">Aprobación: ${puntajeAprobacion || '-'}</span>
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

// Estado simple
let allEvaluations = [];  // [{docId, data}]
let editingDocId = null;  // id actual en edición (para detectar cambios)

// Cargar listados
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
        id: data.ID || docId,
        name: data.name,
        title: data.title || data.name,
        puntajeAprobacion: data.puntajeAprobacion
      };
      return courseCardHTML(payload).replace('data-id="', `data-doc="${docId}" data-id="`);
    })
    .join('');
  list.innerHTML = rows || '<div class="meta">No hay cursos creados.</div>';
}

async function loadDoneCourses() {
  const list = $('#doneList');
  list.innerHTML = 'Cargando...';
  const items = [];

  try {
    // 1) responses (si existe)
    const resSnap = await firebase.firestore().collection('responses').limit(100).get().catch(() => null);
    if (resSnap && !resSnap.empty) {
      resSnap.forEach(d => {
        const r = d.data() || {};
        const course = r.title || r.evaluationTitle || r.course || r.evaluationName || r.evalTitle;
        const ts = r.createdAt?.toDate?.() || (r.createdAt? new Date(r.createdAt): null) || (r.date? new Date(r.date): null);
        const empresa = r.empresa || r.company;
        items.push({ course, date: ts, empresa });
      });
    }

    // 2) inscripciones / inscriptions (si existen)
    const tryCol = async (name) => {
      const snap = await firebase.firestore().collection(name).limit(100).get().catch(() => null);
      if (!snap || snap.empty) return;
      snap.forEach(d => {
        const r = d.data() || {};
        const course = r.courseName || r.course || r.title || r.evaluationTitle;
        const ts = r.date?.toDate?.() || (r.date? new Date(r.date): null) || r.createdAt?.toDate?.();
        const empresa = (r.forma === 'cerrado' ? (r.empresa || r.company) : null);
        items.push({ course, date: ts, empresa });
      });
    };
    await tryCol('inscripciones');
    await tryCol('inscriptions');

    // Ordenar por fecha desc y pintar
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

// Editor (abrir, cerrar, rellenar, recolectar)
function openEditor(title='Nuevo curso') {
  $('#editorTitle').textContent = title;
  $('#editor').classList.add('open');
  $('#editor').setAttribute('aria-hidden', 'false');
}

function closeEditor() {
  $('#editor').classList.remove('open');
  $('#editor').setAttribute('aria-hidden', 'true');
  editingDocId = null;
  clearForm();
}

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

function clearForm() {
  ['docIdInput','idInput','nameInput','titleInput','descInput','manualUrlInput',
   'certificateTmplInput','imageUrlInput','imageBadgeInput','lastDateInput',
   'timeEvalInput','timeLimitInput','scoreInput']
   .forEach(id => { const el = document.getElementById(id); if (el) el.value=''; });
  $('#isLockedInput').checked = false;
  $('#criteriaList').innerHTML = '';
  $('#standardsList').innerHTML = '';
  $('#questionsList').innerHTML = '';
}

function fillForm(docId, data) {
  $('#docIdInput').value = docId || '';
  $('#idInput').value = data.ID ?? '';
  $('#nameInput').value = data.name ?? '';
  $('#titleInput').value = data.title ?? '';
  $('#descInput').value = data.description ?? '';
  $('#manualUrlInput').value = data.manualURL ?? '';
  $('#certificateTmplInput').value = data.certificateTemplate ?? '';
  $('#imageUrlInput').value = data.imageURL ?? '';
  $('#imageBadgeInput').value = data.imageURL_badge ?? '';
  $('#isLockedInput').checked = !!data.isLocked;
  $('#lastDateInput').value = data.lastDate ?? '';
  $('#timeEvalInput').value = data.timeEvaluation ?? '';
  $('#timeLimitInput').value = data.timelimit ?? '';
  $('#scoreInput').value = data.puntajeAprobacion ?? '';

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

// Acciones: editar / copiar
document.addEventListener('click', async (e) => {
  const btnEdit = e.target.closest('.act-edit');
  const btnCopy = e.target.closest('.act-copy');

  if (btnEdit) {
    const card = btnEdit.closest('.course-card');
    const docId = card.getAttribute('data-doc');
    const found = allEvaluations.find(x => x.docId === docId);
    editingDocId = docId;
    fillForm(docId, found?.data || {});
    $('#editorTitle').textContent = 'Editar curso';
    openEditor('Editar curso');
  }

  if (btnCopy) {
    const card = btnCopy.closest('.course-card');
    const docId = card.getAttribute('data-doc');
    try {
      const snap = await firebase.firestore().collection('evaluations').doc(docId).get();
      if (!snap.exists) { alert('No se encontró el curso a copiar.'); return; }
      const data = snap.data();

      const base = sanitizeDocId(docId || data.title || data.name || 'curso');
      const newId = await nextVersionId(base);

      await firebase.firestore().collection('evaluations').doc(newId).set(data, { merge:false });
      alert('✅ Copiado como ' + newId);
      await loadCreatedCourses();
    } catch (err) {
      console.error(err);
      alert('❌ Error al copiar: ' + err.message);
    }
  }
});

// Guardar (crear/actualizar)
async function saveEvaluation() {
  // Recolectar y sanear docId
  let docId = sanitizeDocId($('#docIdInput').value.trim());
  if (!docId) {
    // si no escribieron docId, generarlo desde title o name
    const baseFrom = $('#titleInput').value || $('#nameInput').value || 'curso';
    docId = sanitizeDocId(baseFrom);
  }

  const ID = $('#idInput').value.trim();
  const name = $('#nameInput').value.trim();
  const title = $('#titleInput').value.trim();
  const description = $('#descInput').value.trim();
  const manualURL = $('#manualUrlInput').value.trim();
  const certificateTemplate = $('#certificateTmplInput').value.trim();
  const imageURL = $('#imageUrlInput').value.trim();
  const imageURL_badge = $('#imageBadgeInput').value.trim();
  const isLocked = $('#isLockedInput').checked;
  const lastDateRaw = $('#lastDateInput').value.trim();
  const timeEvaluation = $('#timeEvalInput').value.trim();
  const timelimitRaw = $('#timeLimitInput').value.trim();
  const puntajeAprobacion = $('#scoreInput').value.trim();

  if (!ID || !name || !title || !certificateTemplate) {
    alert('Faltan campos obligatorios: ID / Nombre / Título / Plantilla de Certificado');
    return;
  }

  const criteria = collectArrayFrom('#criteriaList');
  const standards = collectArrayFrom('#standardsList');
  const questions = collectQuestions();
  const lastDate = lastDateRaw ? Number(lastDateRaw) : 0;
  const timelimit = timelimitRaw ? Number(timelimitRaw) : 0;

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
    puntajeAprobacion, // string, como pediste
    questions,
    standards,
    timeEvaluation,
    timelimit,
    title
  };

  try {
    // Si es edición y cambió el docId, creamos el nuevo y NO borramos el viejo (lo puedes borrar luego)
    const targetId = docId;
    await firebase.firestore().collection('evaluations').doc(targetId).set(payload, { merge:false });
    alert('✅ Guardado en evaluations/' + targetId);
    closeEditor();
    await loadCreatedCourses();
  } catch (err) {
    console.error(err);
    alert('❌ Error al guardar: ' + err.message);
  }
}

// Wire-up UI
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
    editingDocId = null;
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
