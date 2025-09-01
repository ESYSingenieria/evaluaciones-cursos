// ===== Navegación básica =====
document.addEventListener('DOMContentLoaded', () => {
  const goUsers = document.getElementById('btnGoUsers');
  const signOut = document.getElementById('btnSignOut');
  if (goUsers) goUsers.addEventListener('click', () => { location.href = 'dashboard-admin.html'; });
  if (signOut) signOut.addEventListener('click', async () => {
    try { await firebase.auth().signOut(); location.href = 'index.html'; } catch (e) { alert(e.message); }
  });
});

// ===== Helpers cortos =====
const $ = (sel) => document.querySelector(sel);

function rowChip(value = '') {
  const wrap = document.createElement('div');
  wrap.className = 'chip-row';
  wrap.innerHTML = `
    <input type="text" placeholder="Escribe aquí..." value="${value.replace(/"/g,'&quot;')}">
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
      <input class="q-text" type="text" placeholder="Escribe la pregunta..." value="${q.text.replace(/"/g,'&quot;')}">
    </div>

    <div class="mt-8"><strong>Opciones</strong></div>
    <div class="q-options"></div>
    <div class="q-actions mt-8">
      <button type="button" class="small-btn q-add">+ Opción</button>
      <button type="button" class="small-btn q-del">Eliminar pregunta</button>
    </div>

    <div class="field mt-12">
      <label>Respuesta correcta</label>
      <input class="q-correct" type="text" placeholder="Debe coincidir con una opción" value="${q.correct.replace(/"/g,'&quot;')}">
    </div>
  `;
  const optBox = wrap.querySelector('.q-options');

  function addOption(val = '') {
    const r = document.createElement('div');
    r.className = 'q-row';
    r.innerHTML = `
      <input class="opt-text" type="text" placeholder="Texto de la opción" value="${val.replace(/"/g,'&quot;')}">
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

function collectArrayFrom(container) {
  const out = [];
  if (!container) return out;
  container.querySelectorAll('input[type="text"]').forEach(i => {
    const v = i.value.trim();
    if (v) out.push(v);
  });
  return out;
}

function collectQuestions() {
  const out = [];
  document.querySelectorAll('#questionsList .q-card').forEach(card => {
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

function clearForm() {
  const ids = [
    'docIdInput','idInput','nameInput','titleInput','descInput','manualUrlInput',
    'certificateTmplInput','imageUrlInput','imageBadgeInput','lastDateInput',
    'timeEvalInput','timeLimitInput','scoreInput'
  ];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value=''; });
  const isLocked = $('#isLockedInput'); if (isLocked) isLocked.checked = false;
  $('#criteriaList').innerHTML = '';
  $('#standardsList').innerHTML = '';
  $('#questionsList').innerHTML = '';
}

function fillForm(data) {
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

async function saveEvaluation() {
  const docId = $('#docIdInput').value.trim();
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

  if (!docId){ alert('Falta: Nombre de documento (Firestore)'); return; }
  if (!ID){ alert('Falta: Identificador de Evaluación'); return; }
  if (!name){ alert('Falta: Nombre'); return; }
  if (!title){ alert('Falta: Título'); return; }
  if (!certificateTemplate){ alert('Falta: Plantilla de Certificado'); return; }

  const criteria = collectArrayFrom($('#criteriaList'));
  const standards = collectArrayFrom($('#standardsList'));
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
    puntajeAprobacion,      // se guarda como string, como pediste
    questions,
    standards,
    timeEvaluation,
    timelimit,
    title
  };

  try {
    await firebase.firestore().collection('evaluations').doc(docId).set(payload, { merge:false });
    alert('✅ Guardado en evaluations/' + docId);
  } catch (err) {
    console.error(err);
    alert('❌ Error al guardar: ' + err.message);
  }
}

async function loadEvaluation() {
  const docId = $('#docIdInput').value.trim();
  if (!docId){ alert('Escribe el nombre de documento a cargar.'); return; }
  try {
    const snap = await firebase.firestore().collection('evaluations').doc(docId).get();
    if (!snap.exists){ alert('No existe evaluations/' + docId); return; }
    fillForm(snap.data());
    alert('✅ Cargada evaluations/' + docId);
  } catch (err) {
    console.error(err);
    alert('❌ Error al cargar: ' + err.message);
  }
}

// ===== Wire-up UI =====
document.addEventListener('DOMContentLoaded', () => {
  if (!firebase.apps.length) {
    console.warn('⚠️ Inicializa firebaseConfig en el HTML antes de cargar este JS.');
  }

  $('#btnSave')?.addEventListener('click', saveEvaluation);
  $('#btnLoad')?.addEventListener('click', loadEvaluation);
  $('#btnNew')?.addEventListener('click', clearForm);

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
