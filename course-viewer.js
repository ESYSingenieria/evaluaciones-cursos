// course-viewer.js
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

    // Pintar watermark y cabecera (si tu app.js no la completa ya)
    try {
      const uDoc = await db.collection('users').doc(user.uid).get();
      const u = uDoc.exists ? uDoc.data() : {};

      // Anti-compartir: marca de agua con nombre/email y reloj moviéndose
      els.wm.textContent = `${u.name || user.email || 'Alumno'} • ${new Date().toLocaleString()}`;
      setInterval(()=>{
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
      if (courseParam.endsWith('_asincronico')) {
        els.asyncLayout.style.display = '';
        els.liveLayout.style.display = 'none';
        await loadRecordedCourse(courseParam); // pinta videos
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

  // 2) Carga curso grabado (colección "recordedCourses")
  //    Busca por docId == courseParam o por slug == courseParam
  async function loadRecordedCourse(idOrSlug){
    const data = await findRecordedCourse(idOrSlug);
    if (!data) {
      els.title.textContent = 'Curso no encontrado';
      els.desc.textContent  = 'No existe contenido grabado para este identificador.';
      return;
    }
    CURRENT_COURSE = data;
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
        const row = document.createElement('div'); row.className = 'lesson';
        row.innerHTML = `
          <div>${l.title || ('Lección '+(li+1))}</div>
          <small>${l.duration || ''}</small>
        `;
        row.addEventListener('click', () => {
          els.mods.querySelectorAll('.lesson.active').forEach(n => n.classList.remove('active'));
          row.classList.add('active');
          playLesson(course, m, l, { mi, li });
        });
        box.appendChild(row);
      });

      els.mods.appendChild(box);
    });

    // Autoplay primera lección
    if (modules[0]?.lessons?.[0]) {
      const first = els.mods.querySelector('.lesson');
      if (first) first.click();
    }
  }

  // Reproduce una lección (HLS). Si tienes backend con URLs firmadas, cámbialo aquí.
  async function playLesson(course, module, lesson, idx){
    const title = lesson.title || `Lección ${idx.li+1}`;
    els.lessonTitle.textContent = title;
    els.lessonPath.textContent  = `${module.title || ('Módulo '+(idx.mi+1))} • ${title}`;

    // Si usas firma, descomenta y adapta:
    // const signed = await fetch(`/api/play?key=${encodeURIComponent(lesson.key || '')}`).then(r=>r.json()).catch(()=>null);
    // const src = signed?.url || lesson.hlsUrl || lesson.publicUrl;
    const src = lesson.hlsUrl || lesson.publicUrl;

    if (!src){ console.warn('Lección sin URL'); return; }

    const video = els.player;
    try { video.pause(); } catch {}
    video.removeAttribute('src');

    if (Hls.isSupported()){
      if (HLS) { HLS.destroy(); }
      HLS = new Hls({ maxBufferLength: 30 });
      HLS.loadSource(src);
      HLS.attachMedia(video);
      HLS.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(()=>{}));
    } else {
      // Safari iOS/macOS reproduce HLS nativo
      video.src = src;
      video.play().catch(()=>{});
    }
  }

  // 3) Cursos NO asincrónicos: solo manual + evaluación
  //    Ajusta los href a tus rutas reales.
  function loadLiveCourse(idOrSlug){
    els.crumb.textContent = idOrSlug;
    els.title.textContent = idOrSlug;
    els.desc.textContent  = 'Este curso no tiene material grabado.';

    // Enlaza a tus páginas existentes
    els.manualBtn.href = `manual.html?course=${encodeURIComponent(idOrSlug)}`;
    els.evalBtn.href   = `evaluation.html?course=${encodeURIComponent(idOrSlug)}`;
  }
})();