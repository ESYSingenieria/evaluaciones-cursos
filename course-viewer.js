// course-viewer.js (mod)
// Requiere que app.js haya inicializado firebase y expuesto 'db' y 'firebase' (compat).

(function(){
  const url = new URL(location.href);
  const courseParam = url.searchParams.get('course'); // p.ej. NFPA_70E.v2_asincronico  ó  NFPA_70E.v2

  const els = {
    crumb: document.getElementById('crumb-course'),
    title: document.getElementById('courseTitle'),
    desc:  document.getElementById('courseDesc'),
    mods:  document.getElementById('modulesList'),
    player:document.getElementById('player'),
    wm:    document.getElementById('wm'),
    lessonTitle: document.getElementById('lessonTitle'),
    lessonPath:  document.getElementById('lessonPath'),
    tags:  document.getElementById('tags'),
    asyncLayout: document.getElementById('asyncLayout'),
    liveLayout:  document.getElementById('liveLayout'),
    manualBtn:   document.getElementById('manualBtn'),
    evalBtn:     document.getElementById('evalBtn'),
  };

  let CURRENT_USER = null;
  let CURRENT_COURSE = null;
  let HLS = null;

  // Progreso (users/{uid}/progress/{courseId}.completed = { m0_l0: true, ... })
  let PROGRESS = { completed: {} };

  // 0) Guardia: debe venir ?course en la URL
  if (!courseParam) {
    els.title.textContent = 'Curso no especificado';
  }

  // 1) Autenticación + verificación de matrícula en users/{uid}.assignedEvaluations
  firebase.auth().onAuthStateChanged(async (user) => {
    if (!user) {
      alert('Debes iniciar sesión para ver este curso.');
      location.href = 'login.html';
      return;
    }
    CURRENT_USER = user;

    // Pintar watermark y cabecera
    try {
      const uDoc = await db.collection('users').doc(user.uid).get();
      const u = uDoc.exists ? uDoc.data() : {};

      // Anti-compartir: marca de agua con nombre/email y reloj moviéndose
      els.wm && (els.wm.textContent = `${u.name || user.email || 'Alumno'} • ${new Date().toLocaleString()}`);
      setInterval(()=>{
        if (!els.wm) return;
        els.wm.style.right = (5 + Math.random()*18) + 'px';
        els.wm.style.bottom = (5 + Math.random()*12) + 'px';
        els.wm.textContent = `${u.name || user.email || 'Alumno'} • ${new Date().toLocaleString()}`;
      }, 7000);

      // Verificar matrícula
      const assigned = Array.isArray(u.assignedEvaluations) ? u.assignedEvaluations : [];
      if (!courseParam || !assigned.includes(courseParam)) {
        els.title.textContent = 'Acceso denegado';
        els.desc.textContent = 'Este curso no está asignado a tu cuenta.';
        return;
      }

      // Elegir layout según tipo
      // Después (acepta .v2, .v3, etc.)
      const isAsyncCourse = /_asincronico(?:$|\.v\d+$)/i.test(courseParam);
      if (isAsyncCourse) {
        els.asyncLayout.style.display = '';
        els.liveLayout.style.display = 'none';
        await loadRecordedCourse(courseParam); // pinta videos + actividades
      } else {
        els.asyncLayout.style.display = 'none';
        els.liveLayout.style.display = '';
        loadLiveCourse(courseParam);           // solo manual + evaluación
      }
    } catch (e) {
      console.error(e);
      els.title.textContent = 'Error de acceso';
      els.desc.textContent = 'No fue posible validar tu matrícula.';
    }
  });

  // =========================
  // 2) Carga curso grabado
  // =========================
  async function loadRecordedCourse(idOrSlug){
    const data = await findRecordedCourse(idOrSlug);
    if (!data) {
      els.title.textContent = 'Curso no encontrado';
      els.desc.textContent  = 'No existe contenido grabado para este identificador.';
      return;
    }
    CURRENT_COURSE = data;

    // Cargar progreso antes de renderizar (usa docId si existe, si no fallback a courseParam)
    await loadProgress(CURRENT_USER.uid, (data.id || courseParam));
    renderRecordedCourse(data);
  }

  async function findRecordedCourse(idOrSlug){
    try{
      // 1) Intentar por docId
      const byId = await db.collection('recordedCourses').doc(idOrSlug).get();
      if (byId.exists) return { id: byId.id, ...byId.data() };

      // 2) Intentar por slug
      const snap = await db.collection('recordedCourses').where('slug', '==', idOrSlug).limit(1).get();
      if (!snap.empty) {
        const d = snap.docs[0];
        return { id: d.id, ...d.data() };
      }
      return null;
    }catch(e){
      console.error('findRecordedCourse', e);
      return null;
    }
  }

  // =========================
  // 3) Render de módulos/lecciones (sidebar) con actividades + bloqueo opcional
  // =========================
  function renderRecordedCourse(course){
    const { title, description, modules = [], tags = [], slug } = course;
    els.crumb.textContent = title || (slug || courseParam || 'Curso');
    els.title.textContent = title || courseParam || 'Curso';
    els.desc.textContent  = description || '';

    // Tags
    els.tags.innerHTML = '';
    (tags||[]).forEach(t => {
      const span = document.createElement('span');
      span.className = 'chip'; span.textContent = t;
      els.tags.appendChild(span);
    });

    // Lista lateral
    els.mods.innerHTML = '';
    modules.forEach((m, mi) => {
      const box = document.createElement('div'); box.className = 'module';
      const h4 = document.createElement('h4'); h4.textContent = m.title || `Módulo ${mi+1}`;
      box.appendChild(h4);

      (m.lessons || []).forEach((l, li) => {
        const isActivity =
          (l.type === 'activity') ||
          (!l.hlsUrl && !l.hlsURL && !l.hls && !l.publicUrl && !l.url && !l.video && (l.activityHtml || l.template));

        const key = keyFor(mi, li);
        const completed = !!PROGRESS.completed[key];
        const locked = isLocked(modules, mi, li);

        const row = document.createElement('div'); 
        row.className = 'lesson';
        row.dataset.mi = String(mi);
        row.dataset.li = String(li);

        const leftIcon = locked ? '🔒' : (isActivity ? '🧩' : '▶️');
        const rightInfo = completed ? '✅' : (l.duration || (isActivity ? 'actividad' : ''));

        row.innerHTML = `
          <div>${leftIcon} ${l.title || ('Lección '+(li+1))}</div>
          <small>${rightInfo || ''}</small>
        `;

        if (locked) {
          row.style.opacity = '0.55';
          row.style.pointerEvents = 'none';
          row.title = 'Completa la lección/actividad anterior para desbloquear';
        }

        row.addEventListener('click', () => {
          els.mods.querySelectorAll('.lesson.active').forEach(n => n.classList.remove('active'));
          row.classList.add('active');

          if (isActivity) {
            showActivity(course, m, l, { mi, li });
          } else {
            playLesson(course, m, l, { mi, li });
          }
        });

        box.appendChild(row);
      });

      els.mods.appendChild(box);
    });

    // Autoplay primer ítem
    const first = els.mods.querySelector('.lesson');
    if (first) first.click();
  }

  // =========================
  // 4) Helpers de video
  // =========================
  function pickLessonSrc(lesson) {
    // Acepta varios alias comunes y estructuras anidadas
    const candidates = [
      lesson?.hlsUrl,       // tu campo correcto
      lesson?.hlsURL,       // variante a veces usada
      lesson?.hls,          // otro alias
      lesson?.publicUrl,    // fallback
      lesson?.url,          // por si guardaste 'url'
      typeof lesson?.video === 'string' ? lesson.video : (
        lesson?.video?.hlsUrl || lesson?.video?.hls || lesson?.video?.url
      )
    ];
    const src = candidates.find(Boolean) || null;
    if (!src) console.error('[LESSON] Sin URL HLS en la lección ->', lesson);
    return src;
  }

  function cacheBust(url) {
    try {
      return url + (url.includes('?') ? '&' : '?') + 'v=' + Date.now();
    } catch { return url; }
  }

  async function playLesson(course, module, lesson, idx){
    const title = lesson.title || `Lección ${idx.li+1}`;
    els.lessonTitle.textContent = title;
    els.lessonPath.textContent  = `${module.title || ('Módulo '+(idx.mi+1))} • ${title}`;

    // Mostrar video, ocultar activity view
    const activityView = document.getElementById('activityView');
    if (activityView) activityView.style.display = 'none';
    els.player.style.display = '';

    // 1) Elegir URL (acepta alias) + rompe caché para evitar playlists viejas
    const raw = pickLessonSrc(lesson);
    if (!raw) {
      els.player.removeAttribute('src');
      els.player.load();
      return;
    }
    const src = cacheBust(raw);

    // 2) Reset de reproductor
    const video = els.player;
    try { video.pause?.(); } catch {}
    if (HLS) { try { HLS.destroy(); } catch {} HLS = null; }
    video.removeAttribute('src');
    video.load();

    // 3) Reproducción HLS (hls.js o nativo)
    if (window.Hls && Hls.isSupported()){
      HLS = new Hls({
        maxBufferLength: 30,
        enableWorker: true,
        lowLatencyMode: false
      });

      HLS.on(Hls.Events.ERROR, (evt, data) => {
        console.error('[HLS ERROR]', data.type, data.details, data);
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            HLS.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            HLS.recoverMediaError();
          } else {
            try { HLS.destroy(); } catch {}
          }
        }
      });

      HLS.loadSource(src);
      HLS.attachMedia(video);
      HLS.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(e => console.warn('Autoplay bloqueado:', e));
      });

    } else if (video.canPlayType && video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari iOS/macOS (HLS nativo)
      video.src = src;
      video.addEventListener('loadedmetadata', () => {
        video.play().catch(e => console.warn('Autoplay bloqueado:', e));
      }, { once: true });

    } else {
      console.error('Este navegador no soporta HLS/MSE.');
    }

    // 4) Marcar completado al terminar (si no se desactiva explícitamente)
    // Si agregas lesson.completeOnEnd === false, no marcará auto.
    video.onended = null;
    if (lesson.completeOnEnd !== false) {
      video.addEventListener('ended', () => {
        const key = keyFor(idx.mi, idx.li);
        markCompleted(key);
      }, { once: true });
    }
  }

  // =========================
  // 5) Actividades (HTML embebido via srcdoc) + plantillas
  // =========================
  function showActivity(course, module, item, idx){
    const title = item.title || `Actividad ${idx.li+1}`;
    els.lessonTitle.textContent = title;
    els.lessonPath.textContent  = `${module.title || ('Módulo '+(idx.mi+1))} • ${title}`;

    // Ocultar video y apagar HLS si estaba activo
    const video = els.player;
    try { video.pause?.(); } catch {}
    if (HLS) { try { HLS.destroy(); } catch {} HLS = null; }
    video.removeAttribute('src');
    video.style.display = 'none';

    // Mostrar activity view
    const view  = document.getElementById('activityView');
    const frame = document.getElementById('activityFrame');
    const btn   = document.getElementById('activityOpen');
    const html  = document.getElementById('activityHtml');

    if (!view || !frame || !btn || !html) {
      console.error('Falta el bloque de Activity View en el HTML.');
      return;
    }

    view.style.display = '';
    frame.style.display = 'none';
    btn.style.display   = 'none';
    html.style.display  = 'none';
    html.innerHTML      = '';

    const kind = (item.activityKind || 'html');
    const completeKey = keyFor(idx.mi, idx.li);

    // 1) Plantillas (decision / numeric / mcq)
    if (kind === 'html' && item.template) {
      const doc = renderActivityTemplate(item.template, item.data || {}, completeKey);
      frame.removeAttribute('src');
      frame.setAttribute('srcdoc', doc);
      frame.style.display = '';
      return;
    }

    // 2) HTML raw embebido (si quisieras pegar HTML directo en Firestore)
    if (kind === 'html' && item.activityHtml) {
      const doc = renderActivityTemplate('__raw', { html: item.activityHtml }, completeKey);
      frame.removeAttribute('src');
      frame.setAttribute('srcdoc', doc);
      frame.style.display = '';
      return;
    }

    // 3) Link/Form/File por URL
    if ((kind === 'link' || kind === 'form' || kind === 'file') && item.activityUrl) {
      try {
        const u = new URL(item.activityUrl, location.href);
        const sameOrigin = u.origin === location.origin;
        if (sameOrigin || item.activityUrl.toLowerCase().endsWith('.pdf')) {
          frame.src = item.activityUrl;
          frame.style.display = '';
        } else {
          btn.href = item.activityUrl; btn.textContent = (kind === 'file') ? 'Descargar archivo' : 'Abrir actividad';
          btn.style.display = '';
        }
      } catch {
        btn.href = item.activityUrl; btn.textContent = 'Abrir actividad';
        btn.style.display = '';
      }
      return;
    }

    // 4) Fallback
    html.innerHTML = `<p style="color:#b91c1c">No se pudo abrir esta actividad.</p>`;
    html.style.display = '';
  }

  function renderActivityTemplate(tpl, data, completeKey) {
    if (tpl === 'decision') return renderDecisionSrcdoc(data, completeKey);
    if (tpl === 'numeric')  return renderNumericSrcdoc(data, completeKey);
    if (tpl === 'mcq')      return renderMcqSrcdoc(data, completeKey);
    if (tpl === 'mcq_multi')return renderMcqMultiSrcdoc(data, completeKey);  // ← NUEVO
    if (tpl === '__raw')    return wrapRawHtml(data.html || '');
    return basicCard(`No se reconoce la plantilla "${tpl}".`);
  }

  function baseHead(extraCSS = '') {
    return `
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root { --b:#e5e7eb; --bg:#fff; --chip:#f8fafc; --ok:#16a34a; --bad:#b91c1c; --btn:#0ea5e9; }
  *{box-sizing:border-box} body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:var(--bg)}
  .wrap{padding:16px}
  .card{background:#f8fafc;border:1px solid var(--b);border-radius:12px;padding:16px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
  .btn{display:inline-block;padding:.6rem 1rem;border-radius:10px;background:var(--btn);color:#fff;border:none;cursor:pointer}
  .btn:disabled{opacity:.5;cursor:not-allowed}
  .muted{color:#64748b}
  .ok{color:var(--ok)} .bad{color:var(--bad)}
  ${extraCSS}
</style>`;
  }
  function basicCard(inner) {
    return `<!doctype html><html lang="es"><head>${baseHead()}</head><body><div class="wrap"><div class="card">${inner}</div></div></body></html>`;
  }
  function wrapRawHtml(html){
    return `<!doctype html><html lang="es"><head>${baseHead()}</head><body><div class="wrap"><div class="card">${html}</div></div></body></html>`;
  }
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }

  /*** Plantilla 1) DECISION ***/
  function renderDecisionSrcdoc({ prompt = 'Escenario', options = [], allowRetry = true } = {}, key) {
    const buttons = options.map((o, i) =>
      `<button class="btn" data-i="${i}" style="margin:6px 8px 6px 0">${escapeHtml(o.text)}</button>`
    ).join('');
    const fb = options.map(o => escapeHtml(o.feedback || (o.correct ? 'Correcto' : 'Incorrecto')));
    const corrects = options.map(o => !!o.correct);
    return `<!doctype html><html lang="es"><head>${baseHead()}</head><body>
      <div class="wrap"><div class="card">
        <h2>${escapeHtml(prompt)}</h2>
        <div id="btns">${buttons}</div>
        <p id="out" class="muted"></p>
        ${allowRetry ? '<button id="retry" class="btn" style="display:none">Reintentar</button>' : ''}
      </div></div>
      <script>
        const feedback = ${JSON.stringify(fb)};
        const corrects = ${JSON.stringify(corrects)};
        const out = document.getElementById('out');
        const btns = document.getElementById('btns');
        const retry = document.getElementById('retry');
        btns.addEventListener('click', e=>{
          const b = e.target.closest('button[data-i]'); if(!b) return;
          const i = +b.dataset.i;
          const ok = !!corrects[i];
          out.textContent = feedback[i] || (ok ? '✅ Correcto' : '❌ Incorrecto');
          out.className = ok ? 'ok' : 'bad';
          if (ok && parent && parent.__markLessonCompleted) { try { parent.__markLessonCompleted(${JSON.stringify(key)}); } catch(e){} }
          if (retry) retry.style.display = '';
        });
        if (retry) retry.onclick = ()=>{ out.textContent=''; out.className='muted'; };
      <\/script>
    </body></html>`;
  }

  /*** Plantilla 2) NUMERIC ***/
  function renderNumericSrcdoc({ prompt='Ingresa el resultado', unit='', solution=0, tolAbs=0, tolPct=0 } = {}, key) {
    return `<!doctype html><html lang="es"><head>${baseHead()}</head><body>
      <div class="wrap"><div class="card">
        <h2>${escapeHtml(prompt)}</h2>
        <div style="display:flex;gap:8px;align-items:center;margin:10px 0">
          <input id="val" type="number" step="any" style="flex:1;padding:.5rem;border:1px solid var(--b);border-radius:8px">
          <span>${escapeHtml(unit)}</span>
          <button id="chk" class="btn">Verificar</button>
        </div>
        <p class="muted">Se acepta un error de ${tolAbs?('±'+tolAbs+' '+unit):''}${(tolAbs&&tolPct)?' o ':''}${tolPct?('±'+(tolPct*100)+'%'):''}.</p>
        <p id="out" class="muted"></p>
      </div></div>
      <script>
        const sol = ${+solution};
        const tolAbs = ${+tolAbs};
        const tolPct = ${+tolPct};
        const out = document.getElementById('out');
        document.getElementById('chk').onclick = ()=>{
          const x = parseFloat(document.getElementById('val').value);
          if (Number.isNaN(x)) { out.textContent='Ingresa un número.'; out.className='bad'; return; }
          const err = Math.abs(x - sol);
          const lim = Math.max(tolAbs || 0, Math.abs(sol) * (tolPct || 0));
          const ok = err <= lim;
          out.textContent = ok ? '✅ Dentro del rango. Error = '+err.toFixed(4) : '❌ Fuera de rango. Error = '+err.toFixed(4);
          out.className = ok ? 'ok' : 'bad';
          if (ok && parent && parent.__markLessonCompleted) { try { parent.__markLessonCompleted(${JSON.stringify(key)}); } catch(e){} }
        };
      <\/script>
    </body></html>`;
  }

  /*** Plantilla 3) (Opcional) MCQ ***/
  function renderMcqSrcdoc({ question='Pregunta', choices=[], shuffle=true } = {}, key) {
    const idxs = choices.map((_,i)=>i);
    if (shuffle) idxs.sort(()=>Math.random()-0.5);
    const html = idxs.map(i=>{
      const c = choices[i];
      return `<label style="display:block;margin:6px 0">
        <input type="radio" name="mcq" value="${i}"> ${escapeHtml(c.text)}
      </label>`;
    }).join('');
    const correct = choices.findIndex(c=>c.correct);
    return `<!doctype html><html lang="es"><head>${baseHead()}</head><body>
      <div class="wrap"><div class="card">
        <h2>${escapeHtml(question)}</h2>
        <div>${html}</div>
        <button id="check" class="btn" style="margin-top:8px">Revisar</button>
        <p id="out" class="muted"></p>
      </div></div>
      <script>
        const correct = ${correct};
        const map = ${JSON.stringify(idxs)};
        const out = document.getElementById('out');
        document.getElementById('check').onclick=()=>{
          const pick = document.querySelector('input[name=mcq]:checked');
          if (!pick) { out.textContent='Selecciona una opción.'; out.className='bad'; return; }
          const chosenOriginal = map[+pick.value];
          const ok = chosenOriginal === correct;
          out.textContent = ok ? '✅ Correcto' : '❌ Incorrecto';
          out.className = ok ? 'ok' : 'bad';
          if (ok && parent && parent.__markLessonCompleted) { try { parent.__markLessonCompleted(${JSON.stringify(key)}); } catch(e){} }
        };
      <\/script>
    </body></html>`;
  }

  function renderMcqMultiSrcdoc({
    questions = [],
    shuffleQ = true,
    shuffleChoices = true,
    showPerQuestion = true
  } = {}, key) {

    // util para barajar índices
    function shuf(arr){ return arr.slice().sort(()=>Math.random()-0.5); }

    const qIdxs = shuffleQ ? shuf(questions.map((_,i)=>i)) : questions.map((_,i)=>i);

    // construir HTML de todas las preguntas (con barajado de alternativas)
    const blocks = qIdxs.map((qi, qnShown) => {
      const q = questions[qi] || {};
      const cIdxs = shuffleChoices ? shuf((q.choices||[]).map((_,i)=>i)) : (q.choices||[]).map((_,i)=>i);
      const radios = cIdxs.map(ci => {
        const ch = q.choices[ci];
        const isCorrect = !!ch.correct;
        return `<label style="display:block;margin:6px 0">
          <input type="radio" name="q${qnShown}" data-c="${isCorrect ? 1 : 0}">
          ${escapeHtml(ch.text)}
        </label>`;
      }).join('');
      return `
        <div class="qblock" data-q="${qnShown}" style="margin:16px 0">
          <h3 style="margin:0 0 6px">${qnShown+1}. ${escapeHtml(q.question || '')}</h3>
          ${radios}
          ${showPerQuestion ? `<p class="qfb muted" id="fb${qnShown}"></p>` : ``}
        </div>
      `;
    }).join('');

    return `<!doctype html><html lang="es"><head>${baseHead()}</head><body>
      <div class="wrap"><div class="card">
        <h2>Cuestionario de práctica</h2>
        <div id="quiz">${blocks}</div>
        <button id="check" class="btn" style="margin-top:8px">Revisar</button>
        <p id="final" class="muted" style="margin-top:8px"></p>
      </div></div>
      <script>
        let locked = false;
        function evalQuiz(){
          if (locked) return;
          let ok = 0;
          const qblocks = document.querySelectorAll('.qblock');
          qblocks.forEach((blk, i) => {
            const pick = blk.querySelector('input[type=radio]:checked');
            const correct = pick && pick.dataset.c === '1';
            if (correct) ok++;
            const fb = document.getElementById('fb'+i);
            if (fb) { fb.textContent = correct ? '✅ Correcto' : '❌ Incorrecto'; fb.className = correct ? 'ok' : 'bad'; }
          });

          // Deshabilitar todos los radios y el botón para impedir reintento
          document.querySelectorAll('input[type=radio]').forEach(r=>r.disabled = true);
          const btn = document.getElementById('check');
          btn.disabled = true;
          locked = true;

          // Mensaje final solo informativo (sin puntaje/porcentajes)
          const final = document.getElementById('final');
          final.textContent = 'Revisión completada.';
          final.className = 'muted';

          // IMPORTANTE: no marcamos "completado" aquí (actividad de práctica)
          // Si algún día quisieras marcar completado igual, podrías llamar:
          // if (parent && parent.__markLessonCompleted) { try { parent.__markLessonCompleted(${JSON.stringify(key)}); } catch(e){} }
        }

        document.getElementById('check').onclick = evalQuiz;
      <\/script>
    </body></html>`;
  }

  // =========================
  // 6) Progreso y bloqueo
  // =========================
  function keyFor(mi, li){ return `m${mi}_l${li}`; }

  function getPrevIndex(modules, mi, li){
    if (li > 0) return { mi, li: li - 1 };
    // buscar último del módulo anterior
    for (let m = mi - 1; m >= 0; m--){
      const len = (modules[m]?.lessons || []).length;
      if (len > 0) return { mi: m, li: len - 1 };
    }
    return null;
  }

  function isLocked(modules, mi, li){
    const prev = getPrevIndex(modules, mi, li);
    if (!prev) return false; // el primero nunca se bloquea
    const prevLesson = modules[prev.mi]?.lessons?.[prev.li];
    if (!prevLesson) return false;
    if (prevLesson.requireComplete === true){
      const prevKey = keyFor(prev.mi, prev.li);
      return !PROGRESS.completed[prevKey];
    }
    return false;
  }

  async function loadProgress(uid, courseId){
    try{
      const ref = db.collection('users').doc(uid).collection('progress').doc(courseId);
      const snap = await ref.get();
      if (snap.exists){
        const d = snap.data() || {};
        PROGRESS.completed = Object.assign({}, PROGRESS.completed, (d.completed || {}));
      }
    }catch(e){
      console.warn('No se pudo cargar progreso:', e);
    }
  }

  async function markCompleted(key){
    if (!CURRENT_USER || !CURRENT_COURSE) return;
    if (PROGRESS.completed[key]) return; // ya registrado

    PROGRESS.completed[key] = true;

    // Persistir
    try{
      const docId = (CURRENT_COURSE.id || courseParam);
      await db.collection('users').doc(CURRENT_USER.uid)
        .collection('progress').doc(docId)
        .set({ completed: { [key]: true } }, { merge: true });
    }catch(e){
      console.error('Error guardando progreso:', e);
    }

    // Refrescar UI de bloqueo/check
    refreshSidebarState();
  }

  // Exponer para que las plantillas dentro del iframe puedan marcar completado
  window.__markLessonCompleted = function(key){
    markCompleted(key);
  };

  function refreshSidebarState(){
    if (!CURRENT_COURSE) return;
    const modules = CURRENT_COURSE.modules || [];

    // Recorre todos los rows y ajusta estado
    const rows = els.mods.querySelectorAll('.lesson');
    rows.forEach(row => {
      const mi = +row.dataset.mi;
      const li = +row.dataset.li;
      const key = keyFor(mi, li);

      // Completo
      const completed = !!PROGRESS.completed[key];

      // Bloqueo
      const locked = isLocked(modules, mi, li);

      // Ajustes visuales
      const titleDiv = row.querySelector('div');
      const small = row.querySelector('small');
      if (titleDiv) {
        // mantener ícono actual si existe, pero poner candado si bloqueado
        const text = titleDiv.textContent || '';
        const orig = text.replace(/^(\s*[🔒🧩▶️]\s*)?/, ''); // limpia icono previo
        titleDiv.textContent = `${locked ? '🔒' : titleDiv.textContent?.includes('🧩') ? '🧩' : '▶️'} ${orig}`;
      }
      if (small) {
        if (completed) small.textContent = '✅';
      }

      if (locked) {
        row.style.opacity = '0.55';
        row.style.pointerEvents = 'none';
        row.title = 'Completa la lección/actividad anterior para desbloquear';
      } else {
        row.style.opacity = '';
        row.style.pointerEvents = '';
        row.removeAttribute('title');
      }
    });
  }

  // =========================
  // 7) Cursos NO asincrónicos: solo manual + evaluación
  // =========================
  function loadLiveCourse(idOrSlug){
    els.crumb.textContent = idOrSlug;
    els.title.textContent = idOrSlug;
    els.desc.textContent  = 'Este curso no tiene material grabado.';

    // Enlaza a tus páginas existentes
    els.manualBtn.href = `manual.html?course=${encodeURIComponent(idOrSlug)}`;
    els.evalBtn.href   = `evaluation.html?course=${encodeURIComponent(idOrSlug)}`;
  }
})();
