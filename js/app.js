/* Kuskachay — lógica de la app (sin frameworks). */
(function () {
  'use strict';
  const E = window.KEngine;
  const L = window.KLegal;

  // ---------- librerías externas (se cargan solo cuando hacen falta) ----------
  const LIB = {
    pdfjs: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    pdfjsWorker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    mammoth: 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js',
    tesseract: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
    pdflib: 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js'
  };
  const cargadas = {};
  function cargarScript(url) {
    if (!cargadas[url]) {
      cargadas[url] = new Promise((ok, mal) => {
        const s = document.createElement('script');
        s.src = url; s.async = true;
        s.onload = () => ok(); s.onerror = () => { delete cargadas[url]; mal(new Error('No se pudo cargar ' + url)); };
        document.head.appendChild(s);
      });
    }
    return cargadas[url];
  }
  async function esperarGlobal(nombre, ms = 8000) {
    const t0 = Date.now();
    while (!window[nombre]) {
      if (Date.now() - t0 > ms) throw new Error('No se pudo iniciar ' + nombre);
      await new Promise((r) => setTimeout(r, 50));
    }
    return window[nombre];
  }

  // ---------- almacenamiento ----------
  const guardado = {
    leer(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
    escribir(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } }
  };
  const VARIANTES = {
    chanka: { nombre: 'Quechua chanka', regiones: 'Ayacucho, Apurímac, Huancavelica' },
    collao: { nombre: 'Quechua collao', regiones: 'Cusco, Puno' },
    ancash: { nombre: 'Quechua de Áncash', regiones: 'Áncash, Huánuco' }
  };

  const estado = {
    perfil: guardado.leer('kuskachay_perfil', null),
    ajustes: Object.assign({ apiKey: '', modelo: 'gemini-flash-latest' }, guardado.leer('kuskachay_ajustes', {})),
    sesion: null,
    pantalla: null
  };
  const historial = () => guardado.leer('kuskachay_historial', []);
  function guardarEnHistorial(reg) {
    const h = historial().filter((x) => x.id !== reg.id);
    h.unshift(reg);
    guardado.escribir('kuskachay_historial', h.slice(0, 200));
  }

  // ---------- utilidades ----------
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icono = (n) => `<svg class="i" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const variante = () => (estado.perfil && estado.perfil.variante) || 'chanka';
  const varNombre = () => VARIANTES[variante()].nombre;
  const fechaHora = (d) => new Date(d).toLocaleString('es-PE', { dateStyle: 'long', timeStyle: 'short' });
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---------- voces grabadas por hablantes nativos (IndexedDB) ----------
  // Cada frase en quechua se guarda con su texto exacto como clave. Si existe una grabación,
  // la app la reproduce en lugar de la voz sintética del teléfono.
  const Grabaciones = {
    db: null,
    clave: (t) => String(t || '').replace(/\s+/g, ' ').trim(),
    abrir() {
      if (this.db) return this.db;
      this.db = new Promise((ok, mal) => {
        if (!('indexedDB' in window)) return mal(new Error('sin IndexedDB'));
        const r = indexedDB.open('kuskachay', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('voces');
        r.onsuccess = () => ok(r.result);
        r.onerror = () => mal(r.error);
      }).catch((e) => { this.db = null; throw e; });
      return this.db;
    },
    async op(modo, fn) {
      const db = await this.abrir();
      return new Promise((ok, mal) => {
        const tx = db.transaction('voces', modo);
        const req = fn(tx.objectStore('voces'));
        tx.oncomplete = () => ok(req && req.result);
        tx.onerror = () => mal(tx.error);
      });
    },
    obtener(t) { return this.op('readonly', (s) => s.get(this.clave(t))).catch(() => null); },
    guardar(t, blob) { return this.op('readwrite', (s) => s.put(blob, this.clave(t))); },
    borrar(t) { return this.op('readwrite', (s) => s.delete(this.clave(t))); },
    contar() { return this.op('readonly', (s) => s.count()).catch(() => 0); }
  };

  // ---------- voz ----------
  const Voz = {
    hablando: null,
    turno: 0,
    soportaEscucha: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
    elegirVoz(idioma) {
      const voces = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
      if (idioma === 'qu') {
        const q = voces.find((v) => /^qu/i.test(v.lang));
        if (q) return q;
      }
      return voces.find((v) => /es-PE/i.test(v.lang)) || voces.find((v) => /es-(419|US|MX)/i.test(v.lang)) || voces.find((v) => /^es/i.test(v.lang)) || null;
    },
    async decir(texto, idioma, boton) {
      const mismo = this.hablando && this.hablando.boton === boton && boton;
      this.callar();
      if (mismo) return;
      const turno = ++this.turno;
      const grabada = await Grabaciones.obtener(texto);
      if (turno !== this.turno) return; // otro audio empezó mientras se buscaba la grabación
      if (grabada) {
        const url = URL.createObjectURL(grabada);
        const audio = new Audio(url);
        const fin = () => { URL.revokeObjectURL(url); if (boton) marcarBotonAudio(boton, false); if (this.hablando && this.hablando.audio === audio) this.hablando = null; };
        audio.onended = fin; audio.onerror = fin;
        this.hablando = { audio, boton };
        if (boton) marcarBotonAudio(boton, true);
        audio.play().catch(fin);
        return;
      }
      if (!('speechSynthesis' in window)) return;
      const u = new SpeechSynthesisUtterance(texto);
      const v = this.elegirVoz(idioma);
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'es-PE';
      u.rate = 0.9;
      const fin = () => { if (boton) marcarBotonAudio(boton, false); this.hablando = null; };
      u.onend = fin; u.onerror = fin;
      this.hablando = { u, boton };
      if (boton) marcarBotonAudio(boton, true);
      speechSynthesis.speak(u);
    },
    callar() {
      this.turno++;
      if ('speechSynthesis' in window) speechSynthesis.cancel();
      if (this.hablando && this.hablando.audio) { this.hablando.audio.pause(); this.hablando.audio.onended && this.hablando.audio.onended(); }
      if (this.hablando && this.hablando.boton) marcarBotonAudio(this.hablando.boton, false);
      this.hablando = null;
    },
    escuchar({ alParcial } = {}) {
      return new Promise((ok, mal) => {
        const R = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!R) return mal(new Error('sin_soporte'));
        this.callar();
        const r = new R();
        r.lang = 'es-PE'; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
        let final = '';
        r.onresult = (ev) => {
          let t = '';
          for (let i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript;
          final = t;
          if (alParcial) alParcial(t);
        };
        r.onerror = (ev) => mal(new Error(ev.error || 'error'));
        r.onend = () => ok(final.trim());
        r.start();
      });
    }
  };
  if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => {};

  function marcarBotonAudio(b, activo) {
    if (!b || !b.isConnected) return;
    b.setAttribute('aria-pressed', activo ? 'true' : 'false');
    const etiqueta = b.dataset.etiqueta || 'Escuchar';
    b.innerHTML = activo ? `${icono('stop')} Detener` : `${icono('speaker')} ${esc(etiqueta)}`;
  }
  function botonAudio(texto, idioma, etiqueta = 'Escuchar', clase = '') {
    return `<button type="button" class="btn btn-audio ${clase}" data-audio="${esc(texto)}" data-idioma="${idioma}" data-etiqueta="${esc(etiqueta)}" aria-pressed="false">${icono('speaker')} ${esc(etiqueta)}</button>`;
  }
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-audio]');
    if (b) Voz.decir(b.dataset.audio, b.dataset.idioma, b);
  });

  // ---------- navegación ----------
  const PASO_DE = { revision: 'leer', procesando: 'leer', explicacion: 'entender', verificar: 'verificar', repaso: 'verificar', discrepancia: 'verificar', sello: 'constancia', derivacion: 'constancia' };
  const ORDEN_PASOS = ['leer', 'entender', 'verificar', 'constancia'];

  function ir(nombre, ...args) {
    Voz.callar();
    estado.pantalla = nombre;
    document.body.classList.toggle('ancho', nombre === 'panel');
    const paso = PASO_DE[nombre];
    const pasos = $('#pasos');
    if (paso && estado.sesion) {
      pasos.hidden = false;
      const idx = ORDEN_PASOS.indexOf(paso);
      pasos.querySelectorAll('li').forEach((li, i) => {
        li.className = i < idx ? 'hecho' : i === idx ? 'actual' : '';
        if (i === idx) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
      });
    } else pasos.hidden = true;
    $('#acciones').innerHTML = '';
    PANTALLAS[nombre](...args);
    window.scrollTo(0, 0);
    $('#pantalla').focus({ preventScroll: true });
  }
  function acciones(html) { $('#acciones').innerHTML = html; }

  // ---------- hoja inferior ----------
  function abrirHoja(titulo, html, alAbrir) {
    $('#hojaTitulo').textContent = titulo;
    $('#hojaCuerpo').innerHTML = html;
    $('#hoja').hidden = false; $('#hojaFondo').hidden = false;
    if (alAbrir) alAbrir($('#hojaCuerpo'));
    setTimeout(() => { const f = $('#hojaCuerpo').querySelector('input,button,textarea'); if (f) f.focus(); }, 30);
  }
  function cerrarHoja() { $('#hoja').hidden = true; $('#hojaFondo').hidden = true; Voz.callar(); }
  $('#hojaCerrar').onclick = cerrarHoja;
  $('#hojaFondo').onclick = cerrarHoja;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#hoja').hidden) cerrarHoja(); });

  function mostrarNorma(id) {
    const n = L.NORMAS[id];
    if (!n) return;
    abrirHoja(n.titulo, `<p class="norma-texto">${esc(n.texto)}</p><p class="peque">Texto resumido en lenguaje claro. Consulta la norma oficial para su redacción exacta.</p>${botonAudio(n.texto, 'es')}`);
  }
  document.addEventListener('click', (ev) => { const b = ev.target.closest('[data-norma]'); if (b) mostrarNorma(b.dataset.norma); });

  // ---------- pantallas ----------
  const PANTALLAS = {};

  PANTALLAS.perfil = function (desdeAjustes) {
    const p = estado.perfil || { variante: 'chanka', modo: 'escuchar' };
    $('#pantalla').innerHTML = `
      <h1>Allillanchu</h1>
      <p class="sub">Te ayudamos a entender en quechua los papeles que te dan la policía, la fiscalía o el juzgado, antes de que firmes.</p>
      <form id="formPerfil" class="tarjeta">
        <fieldset style="border:0;padding:0;margin:0">
          <legend><h2>¿De dónde es tu quechua?</h2></legend>
          <div class="elegir" style="margin-top:12px">
            ${Object.entries(VARIANTES).map(([k, v]) => `
              <label><input type="radio" name="variante" value="${k}" ${p.variante === k ? 'checked' : ''} />
                <span><strong>${esc(v.nombre)}</strong><span class="sub">${esc(v.regiones)}</span></span></label>`).join('')}
          </div>
        </fieldset>
        <fieldset style="border:0;padding:0;margin:20px 0 0">
          <legend><h2>¿Cómo prefieres la explicación?</h2></legend>
          <div class="elegir" style="margin-top:12px">
            <label><input type="radio" name="modo" value="escuchar" ${p.modo !== 'leer' ? 'checked' : ''} />
              <span><strong>Escuchar</strong><span class="sub">La app te habla en voz alta</span></span></label>
            <label><input type="radio" name="modo" value="leer" ${p.modo === 'leer' ? 'checked' : ''} />
              <span><strong>Leer</strong><span class="sub">Ves el texto y lo escuchas cuando quieras</span></span></label>
          </div>
        </fieldset>
      </form>`;
    acciones(`<button class="btn btn-primario" id="btnGuardarPerfil" type="button">${desdeAjustes ? 'Guardar' : 'Empezar'}</button>`);
    $('#btnGuardarPerfil').onclick = () => {
      const fd = new FormData($('#formPerfil'));
      estado.perfil = { variante: fd.get('variante') || 'chanka', modo: fd.get('modo') || 'escuchar' };
      guardado.escribir('kuskachay_perfil', estado.perfil);
      ir('inicio');
    };
  };

  PANTALLAS.inicio = function () {
    estado.sesion = null;
    const conGemini = !!estado.ajustes.apiKey;
    $('#pantalla').innerHTML = `
      <p class="saludo">${esc(varNombre())}</p>
      <h1>¿Qué papel te entregaron?</h1>
      <p class="sub">Tómale una foto o súbelo. Te lo explicamos en quechua y comprobamos juntos que lo entendiste antes de firmar.</p>
      ${botonAudio(FRASES_FIJAS[4].t, 'qu', 'Escuchar en quechua')}
      <div class="losas">
        <button class="losa principal" type="button" id="btnFoto">
          <span class="losa-icono">${icono('camera')}</span>
          <span><strong>Tomar foto del papel</strong><span class="sub">Acta, citación o notificación</span></span>
        </button>
        <button class="losa" type="button" id="btnArchivo">
          <span class="losa-icono">${icono('file')}</span>
          <span><strong>Subir un archivo</strong><span class="sub">PDF, Word, texto o imagen</span></span>
        </button>
        <button class="losa" type="button" id="btnPreguntar">
          <span class="losa-icono">${icono('question')}</span>
          <span><strong>Tengo una pregunta</strong><span class="sub">Sobre mis derechos</span></span>
        </button>
      </div>
      <p class="nota-privada">${icono('user')}<span>${conGemini
        ? 'El análisis con Gemini está activado: el documento se envía a Google para leerlo.'
        : 'El documento se lee en este teléfono. No se envía a ningún servidor.'}</span></p>
      <div class="pie"><button class="btn btn-texto" type="button" id="btnPanel">Panel institucional</button></div>`;
    $('#btnFoto').onclick = () => $('#inputFoto').click();
    $('#btnArchivo').onclick = () => $('#inputArchivo').click();
    $('#btnPreguntar').onclick = () => ir('preguntas');
    $('#btnPanel').onclick = () => { location.hash = 'panel'; };
  };

  PANTALLAS.preguntas = function () {
    const s = estado.sesion;
    const f = s ? s.hechos : E.extract('');
    $('#pantalla').innerHTML = `
      <h1>Pregunta lo que necesites</h1>
      <p class="sub">${s ? 'Respondemos con lo que dice tu documento.' : 'Respondemos sobre tus derechos ante la policía, la fiscalía o el juzgado.'}</p>
      ${bloquePreguntar()}`;
    activarPreguntar(f);
    acciones(`<button class="btn btn-borde" type="button" id="btnVolver">${icono('back')} Volver</button>`);
    $('#btnVolver').onclick = () => ir(s ? 'explicacion' : 'inicio');
  };

  function bloquePreguntar() {
    return `
      <div class="tarjeta">
        <label class="etiqueta" for="campoPregunta">Tu pregunta</label>
        <div class="preguntar">
          <input class="campo" id="campoPregunta" type="text" autocomplete="off" placeholder="Escribe o toca el micrófono" />
          ${Voz.soportaEscucha ? `<button class="btn-mic" id="btnMicPregunta" type="button" aria-label="Preguntar hablando">${icono('mic')}</button>` : ''}
          <button class="btn btn-primario" style="width:auto" id="btnEnviarPregunta" type="button">Preguntar</button>
        </div>
        <p class="escucha-estado" id="estadoPregunta" aria-live="polite"></p>
        <div id="respuestaPregunta"></div>
      </div>`;
  }
  function activarPreguntar(hechos) {
    const campo = $('#campoPregunta');
    const responder = async () => {
      const q = campo.value.trim();
      if (!q) { $('#estadoPregunta').textContent = 'Escribe o di tu pregunta primero.'; campo.focus(); return; }
      $('#estadoPregunta').textContent = 'Buscando la respuesta…';
      let r = null;
      if (estado.ajustes.apiKey && estado.sesion) r = await Gemini.responder(estado.sesion, q).catch(() => null);
      if (!r) r = E.answerFree(hechos, q, variante());
      $('#estadoPregunta').textContent = '';
      $('#respuestaPregunta').innerHTML = `
        <div class="tarjeta quechua" style="margin-top:12px"><p class="idioma">Runasimi</p><p class="texto-grande">${esc(r.qu)}</p>${botonAudio(r.qu, 'qu')}</div>
        <div class="tarjeta" style="margin-top:12px"><p class="idioma">Castellano</p><p class="texto-grande">${esc(r.es)}</p>
          ${r.norma && L.NORMAS[r.norma] ? `<div class="chips"><button type="button" class="chip" data-norma="${r.norma}">${icono('scale')} ${esc(L.NORMAS[r.norma].corto)}</button></div>` : ''}
          ${botonAudio(r.es, 'es')}</div>`;
      if (estado.sesion) estado.sesion.preguntasLibres.push({ q, r: r.es, en: new Date().toISOString() });
      if (estado.perfil && estado.perfil.modo === 'escuchar') Voz.decir(r.qu + '. ' + r.es, 'qu', null);
    };
    $('#btnEnviarPregunta').onclick = responder;
    campo.onkeydown = (e) => { if (e.key === 'Enter') responder(); };
    const mic = $('#btnMicPregunta');
    if (mic) mic.onclick = async () => {
      mic.classList.add('escuchando'); $('#estadoPregunta').textContent = 'Te escucho…';
      try {
        const t = await Voz.escuchar({ alParcial: (p) => { campo.value = p; } });
        mic.classList.remove('escuchando');
        if (t) { campo.value = t; responder(); } else $('#estadoPregunta').textContent = 'No te escuché. Inténtalo otra vez.';
      } catch (e) {
        mic.classList.remove('escuchando');
        $('#estadoPregunta').textContent = e.message === 'not-allowed' ? 'Permite el uso del micrófono para hablar.' : 'No te escuché. Inténtalo otra vez o escribe tu pregunta.';
      }
    };
  }

  // ----- procesamiento del archivo -----
  const ETAPAS = ['Leyendo el documento', 'Buscando los datos importantes', 'Preparando la explicación en quechua'];
  PANTALLAS.procesando = function (archivo, vistaPrevia) {
    $('#pantalla').innerHTML = `
      <h1>Un momento…</h1>
      <p class="sub">${esc(archivo.name)}</p>
      ${vistaPrevia ? `<img class="vista-previa" src="${vistaPrevia}" alt="Foto del documento" />` : ''}
      <ol class="proceso" id="proceso">${ETAPAS.map((e) => `<li><span class="marca-paso"></span><span>${e}</span></li>`).join('')}</ol>
      <div class="barra" id="barra" hidden aria-hidden="true"><span></span></div>
      <p class="peque" id="detalleProceso"></p>`;
  };
  function etapa(n, detalle) {
    const lis = document.querySelectorAll('#proceso li');
    lis.forEach((li, i) => {
      li.className = i < n ? 'hecho' : i === n ? 'actual' : '';
      li.querySelector('.marca-paso').innerHTML = i < n ? icono('check') : '';
    });
    if (detalle !== undefined && $('#detalleProceso')) $('#detalleProceso').textContent = detalle;
  }
  function progreso(p) {
    const b = $('#barra'); if (!b) return;
    b.hidden = p == null; if (p != null) b.querySelector('span').style.width = Math.round(p * 100) + '%';
  }

  async function prepararImagen(archivo) {
    const url = URL.createObjectURL(archivo);
    const img = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = url; });
    const max = 2200, k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const ctx = c.getContext('2d');
    ctx.filter = 'grayscale(1) contrast(1.25)';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return { canvas: c, url, dataUrl: c.toDataURL('image/jpeg', 0.9) };
  }

  async function ocr(fuente) {
    await cargarScript(LIB.tesseract);
    const T = await esperarGlobal('Tesseract');
    progreso(0);
    const r = await T.recognize(fuente, 'spa', {
      logger: (m) => { if (m.status === 'recognizing text') progreso(m.progress); else if (m.status) $('#detalleProceso').textContent = traducirOcr(m.status); }
    });
    progreso(null);
    return (r.data && r.data.text) || '';
  }
  function traducirOcr(s) {
    if (/loading/.test(s)) return 'Preparando el lector de texto (la primera vez tarda un poco)…';
    if (/initializ/.test(s)) return 'Iniciando el lector de texto…';
    return '';
  }

  async function leerPdf(archivo) {
    await cargarScript(LIB.pdfjs);
    const lib = await esperarGlobal('pdfjsLib');
    if (lib.GlobalWorkerOptions && !lib.GlobalWorkerOptions.workerSrc) lib.GlobalWorkerOptions.workerSrc = LIB.pdfjsWorker;
    const pdf = await lib.getDocument({ data: await archivo.arrayBuffer() }).promise;
    let texto = '';
    for (let i = 1; i <= Math.min(pdf.numPages, 6); i++) {
      const pag = await pdf.getPage(i);
      const cont = await pag.getTextContent();
      let ultimaY = null, linea = '';
      for (const it of cont.items) {
        const y = it.transform ? Math.round(it.transform[5]) : null;
        if (ultimaY !== null && y !== null && Math.abs(y - ultimaY) > 3) { texto += linea.replace(/ {2,}/g, ' ').trim() + '\n'; linea = ''; }
        linea += it.str + (it.hasEOL ? '' : ' ');
        ultimaY = y;
      }
      texto += linea.replace(/ {2,}/g, ' ').trim() + '\n\n';
    }
    if (texto.replace(/\s/g, '').length < 40) {
      // PDF escaneado: se convierte la primera página en imagen y se lee con OCR
      $('#detalleProceso').textContent = 'El PDF es una imagen escaneada. Leyendo con reconocimiento de texto…';
      const pag = await pdf.getPage(1);
      const vp = pag.getViewport({ scale: 2 });
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
      await pag.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      texto = await ocr(c);
    }
    return { texto, paginas: pdf.numPages };
  }

  async function procesarArchivo(archivo) {
    if (!archivo) return;
    const ext = (archivo.name.split('.').pop() || '').toLowerCase();
    const esImagen = archivo.type.startsWith('image/');
    let previa = null, imagen = null;
    if (esImagen) { imagen = await prepararImagen(archivo).catch(() => null); previa = imagen && imagen.url; }
    estado.sesion = nuevaSesion(archivo.name, esImagen ? 'foto' : ext);
    ir('procesando', archivo, previa);
    etapa(0);
    let texto = '', llm = null, aviso = null;
    try {
      if (esImagen) {
        if (estado.ajustes.apiKey) {
          $('#detalleProceso').textContent = 'Leyendo la foto con Gemini…';
          llm = await Gemini.analizar({ imagenBase64: imagen.dataUrl.split(',')[1], mime: 'image/jpeg' }).catch((e) => { aviso = 'No se pudo usar Gemini (' + e.message + '). Se usó la lectura del teléfono.'; return null; });
          texto = (llm && llm.texto) || '';
        }
        if (!texto) texto = await ocr(imagen ? imagen.canvas : archivo);
      } else if (ext === 'pdf') {
        texto = (await leerPdf(archivo)).texto;
      } else if (ext === 'docx') {
        await cargarScript(LIB.mammoth);
        const m = await esperarGlobal('mammoth');
        texto = (await m.extractRawText({ arrayBuffer: await archivo.arrayBuffer() })).value || '';
      } else if (ext === 'doc') {
        throw new Error('El formato .doc antiguo no se puede leer. Guarda el archivo como .docx o PDF.');
      } else {
        texto = await archivo.text();
      }
    } catch (e) {
      console.error(e);
      return ir('error', e.message && /formato|guarda/i.test(e.message) ? e.message : 'No pudimos abrir el archivo. Revisa tu conexión la primera vez que usas esta función, o prueba con otra foto.');
    }
    if (texto.replace(/\s/g, '').length < 30) return ir('error', 'No encontramos texto en el documento. Toma la foto de frente, con buena luz y que se vea la hoja completa.');
    await analizar(texto, llm, aviso);
  }

  function nuevaSesion(nombre, fuente) {
    return {
      id: uid(), inicio: new Date().toISOString(), archivo: nombre, fuente, variante: variante(), modo: estado.perfil ? estado.perfil.modo : 'escuchar',
      texto: '', hechos: null, explicacion: null, preguntas: [], idx: 0, respuestas: [], repasos: 0,
      discrepancias: [], correcciones: [], preguntasLibres: [], estado: 'en_curso', motivo: null, conGemini: false, avisos: []
    };
  }

  async function analizar(texto, llmPrevio, aviso) {
    const s = estado.sesion;
    s.texto = texto.trim();
    if (aviso) s.avisos.push(aviso);
    etapa(1, '');
    let hechos = E.extract(s.texto);
    let llm = llmPrevio;
    if (!llm && estado.ajustes.apiKey) {
      llm = await Gemini.analizar({ texto: s.texto }).catch((e) => { s.avisos.push('No se pudo usar Gemini (' + e.message + '). Se usó la lectura del teléfono.'); return null; });
    }
    if (llm) { hechos = E.mergeFacts(hechos, llm.hechos); s.conGemini = true; }
    s.hechos = hechos;
    etapa(2);
    const local = E.explain(hechos, variante());
    s.explicacion = local;
    if (llm && llm.explicacion) {
      const x = llm.explicacion;
      s.explicacion = {
        es: x.es || local.es, qu: x.qu || local.qu,
        esSimple: x.esSimple || local.esSimple, quSimple: x.quSimple || local.quSimple,
        // solo se aceptan normas que existen en la base legal local
        normas: (Array.isArray(x.normas) ? x.normas.filter((n) => L.NORMAS[n]) : []).concat(local.normas).filter((n, i, a) => a.indexOf(n) === i).slice(0, 5)
      };
    }
    s.preguntas = E.buildQuestions(hechos, variante());
    s.idx = 0;
    await new Promise((r) => setTimeout(r, 250));
    etapa(3);
    ir('revision');
  }

  PANTALLAS.error = function (mensaje) {
    $('#pantalla').innerHTML = `
      <h1>No pudimos leer el papel</h1>
      <div class="aviso medio">${icono('alert')}<div><strong>${esc(mensaje)}</strong></div></div>
      <div class="tarjeta">
        <h2>Consejos para la foto</h2>
        <ul style="margin:8px 0 0;padding-left:1.2em">
          <li>Pon el papel sobre una mesa, de frente.</li>
          <li>Busca buena luz, sin sombras ni reflejos.</li>
          <li>Que se vea la hoja completa.</li>
        </ul>
      </div>
      <button class="btn btn-texto" type="button" id="btnEscribir">${icono('keyboard')} Escribir el texto del papel</button>`;
    acciones(`<button class="btn btn-primario" type="button" id="btnOtraFoto">${icono('camera')} Tomar otra foto</button>
      <button class="btn btn-borde" type="button" id="btnInicio">Volver al inicio</button>`);
    $('#btnOtraFoto').onclick = () => $('#inputFoto').click();
    $('#btnInicio').onclick = () => ir('inicio');
    $('#btnEscribir').onclick = () => ir('escribir');
  };

  PANTALLAS.escribir = function () {
    $('#pantalla').innerHTML = `
      <h1>Escribe lo que dice el papel</h1>
      <p class="sub">Copia el texto tal como está. Puede pedirle ayuda a otra persona.</p>
      <label class="etiqueta" for="textoManual">Texto del documento</label>
      <textarea class="campo" id="textoManual"></textarea>
      <p class="escucha-estado" id="errorManual" role="alert"></p>`;
    acciones(`<button class="btn btn-primario" type="button" id="btnAnalizarManual">Analizar el texto</button>
      <button class="btn btn-borde" type="button" id="btnCancelar">Cancelar</button>`);
    $('#btnAnalizarManual').onclick = async () => {
      const t = $('#textoManual').value.trim();
      if (t.length < 30) { $('#errorManual').textContent = 'Escribe al menos unas líneas del documento.'; return; }
      estado.sesion = nuevaSesion('Texto escrito', 'texto');
      ir('procesando', { name: 'Texto escrito' });
      etapa(0);
      await analizar(t);
    };
    $('#btnCancelar').onclick = () => ir('inicio');
  };

  // ----- revisión: lo que dice el documento -----
  PANTALLAS.revision = function () {
    const s = estado.sesion, f = s.hechos;
    const filas = [];
    if (f.entidad) filas.push(['De', f.entidad]);
    if (f.numero) filas.push(['Número', f.numero]);
    if (f.persona) filas.push(['A nombre de', f.persona]);
    if (f.cantidad) filas.push(['Cantidad', `${f.cantidad.n} ${f.cantidad.es}`]);
    if (f.plazoTexto) filas.push(['Plazo', f.plazoTexto]);
    if (f.fechaCita) filas.push(['Presentarse', f.fechaCita + (f.horaCita ? ', ' + f.horaCita : '')]);
    if (f.valor) filas.push(['Valor', f.valor]);
    if (!f.fechaCita && f.fechas.length) filas.push(['Fecha', f.fechas[0]]);
    $('#pantalla').innerHTML = `
      <p class="saludo">${esc(s.archivo)}</p>
      <h1>${esc(E.TIPO_NOMBRE[f.tipo])}</h1>
      ${s.avisos.map((a) => `<div class="aviso medio">${icono('alert')}<div>${esc(a)}</div></div>`).join('')}
      ${filas.length ? `<div class="tarjeta"><dl class="datos">${filas.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></div>` : ''}
      ${f.alertas.map((a) => `<div class="aviso ${a.nivel === 'alto' ? 'alto' : 'medio'}">${icono('alert')}<div><strong>${esc(a.titulo)}</strong>${esc(a.texto)}${a.norma ? ` <button type="button" class="btn-texto btn" style="min-height:0;padding:0" data-norma="${a.norma}">Ver la ley</button>` : ''}</div></div>`).join('')}
      <details class="texto-leido">
        <summary>Ver y corregir el texto leído</summary>
        <p class="peque">Si la foto se leyó mal, corrige el texto y toca «Volver a analizar».</p>
        <textarea class="campo" id="textoLeido">${esc(s.texto)}</textarea>
        <button class="btn btn-borde" type="button" id="btnReanalizar" style="margin-top:10px">${icono('edit')} Volver a analizar</button>
      </details>`;
    acciones(`<button class="btn btn-primario" type="button" id="btnEntender">${icono('speaker')} Explícame el documento</button>`);
    $('#btnEntender').onclick = () => ir('explicacion');
    $('#btnReanalizar').onclick = async () => {
      const t = $('#textoLeido').value.trim();
      if (t.length < 30) return;
      const nombre = s.archivo, fuente = s.fuente;
      estado.sesion = nuevaSesion(nombre, fuente);
      ir('procesando', { name: nombre }); etapa(0);
      await analizar(t);
    };
  };

  // ----- explicación -----
  PANTALLAS.explicacion = function () {
    const s = estado.sesion, x = s.explicacion;
    $('#pantalla').innerHTML = `
      <h1>Esto dice tu papel</h1>
      <div class="tarjeta quechua">
        <div class="tarjeta-cabeza"><p class="idioma">Runasimi · ${esc(varNombre())}</p></div>
        <p class="texto-grande">${esc(x.qu)}</p>
        ${botonAudio(x.qu, 'qu', 'Escuchar en quechua', 'autoplay')}
      </div>
      <div class="tarjeta">
        <p class="idioma">Castellano sencillo</p>
        <p class="texto-grande">${esc(x.es)}</p>
        ${botonAudio(x.es, 'es', 'Escuchar en castellano')}
      </div>
      <div>
        <h2 style="margin-bottom:10px">Leyes que te protegen</h2>
        <div class="chips">${x.normas.map((n) => `<button type="button" class="chip" data-norma="${n}">${icono('scale')} ${esc(L.NORMAS[n].corto)}</button>`).join('')}</div>
      </div>
      <button class="btn btn-borde" type="button" id="btnDuda">${icono('question')} Tengo una duda</button>`;
    acciones(`<button class="btn btn-primario" type="button" id="btnVerificar">Ya entendí: comprobar</button>`);
    $('#btnVerificar').onclick = () => ir('verificar');
    $('#btnDuda').onclick = () => ir('preguntas');
    autoplay();
  };
  function autoplay() {
    if (!estado.perfil || estado.perfil.modo !== 'escuchar') return;
    const b = document.querySelector('.autoplay');
    if (b) setTimeout(() => { if (b.isConnected) Voz.decir(b.dataset.audio, b.dataset.idioma, b); }, 350);
  }

  // ----- verificación (sello de comprensión) -----
  PANTALLAS.verificar = function () {
    const s = estado.sesion;
    if (s.idx >= s.preguntas.length) return terminar('sello');
    const q = s.preguntas[s.idx];
    const clase = q.modo === 'sino' ? 'dos' : q.modo === 'opcion' ? 'lista' : '';
    const textoAudio = q.qu + '. ' + q.es;
    $('#pantalla').innerHTML = `
      <p class="contador">Pregunta ${s.idx + 1} de ${s.preguntas.length}</p>
      <div class="tarjeta quechua">
        <p class="pregunta-qu">${esc(q.qu)}</p>
        <p class="pregunta-es">${esc(q.es)}</p>
        ${botonAudio(textoAudio, 'qu', 'Escuchar la pregunta', 'autoplay')}
      </div>
      <div class="opciones ${clase}" role="group" aria-label="Respuestas">
        ${q.opciones.map((o, i) => `<button type="button" class="opcion" data-i="${i}">${esc(o.label)}${o.qu ? `<small>${esc(o.qu)}</small>` : ''}</button>`).join('')}
      </div>
      <div class="fila">
        ${Voz.soportaEscucha ? `<button class="btn btn-borde" type="button" id="btnHablar">${icono('mic')} Responder hablando</button>` : ''}
        <button class="btn btn-borde" type="button" id="btnTeclear">${icono('keyboard')} Escribir</button>
      </div>
      <div id="zonaTeclear" hidden>
        <label class="etiqueta" for="campoRespuesta">Tu respuesta</label>
        <div class="preguntar" style="grid-template-columns:1fr auto">
          <input class="campo" id="campoRespuesta" type="text" autocomplete="off" />
          <button class="btn btn-primario" style="width:auto" type="button" id="btnResponderTexto">Responder</button>
        </div>
      </div>
      <p class="escucha-estado" id="estadoRespuesta" aria-live="polite"></p>`;
    document.querySelectorAll('.opcion').forEach((b) => {
      b.onclick = () => { b.classList.add('elegida'); responder(q, q.opciones[+b.dataset.i].value, b.textContent.trim(), 'toque'); };
    });
    $('#btnTeclear').onclick = () => { $('#zonaTeclear').hidden = false; $('#campoRespuesta').focus(); };
    const porTexto = () => {
      const t = $('#campoRespuesta').value.trim();
      if (!t) { $('#estadoRespuesta').textContent = 'Escribe tu respuesta primero.'; return; }
      responder(q, E.parseAnswer(q, t), t, 'texto');
    };
    $('#btnResponderTexto').onclick = porTexto;
    $('#campoRespuesta').onkeydown = (e) => { if (e.key === 'Enter') porTexto(); };
    const hablar = $('#btnHablar');
    if (hablar) hablar.onclick = async () => {
      hablar.disabled = true; $('#estadoRespuesta').textContent = 'Te escucho…';
      try {
        const t = await Voz.escuchar({ alParcial: (p) => { $('#estadoRespuesta').textContent = '«' + p + '»'; } });
        hablar.disabled = false;
        if (!t) { $('#estadoRespuesta').textContent = 'No te escuché. Toca una respuesta o vuelve a hablar.'; return; }
        responder(q, E.parseAnswer(q, t), t, 'voz');
      } catch (e) {
        hablar.disabled = false;
        $('#estadoRespuesta').textContent = e.message === 'not-allowed' ? 'Permite el micrófono o toca una respuesta.' : 'No te escuché. Toca una respuesta.';
      }
    };
    autoplay();
  };

  function responder(q, valor, crudo, via) {
    const s = estado.sesion;
    const ev = E.evaluate(q, valor);
    if (ev.estado === 'sin_respuesta') {
      $('#estadoRespuesta').textContent = `Escuché «${crudo}», pero no entendí tu respuesta. Toca una opción o vuelve a intentarlo.`;
      return;
    }
    const etiqueta = (q.opciones.find((o) => o.value === valor) || {}).label || String(valor);
    s.respuestas.push({ id: q.id, pregunta: q.es, respuesta: etiqueta, crudo, via, estado: ev.estado, intento: s.respuestas.filter((r) => r.id === q.id).length + 1, en: new Date().toISOString() });
    if (ev.estado === 'discrepancia') {
      s.discrepancias.push({ campo: q.campo, acta: q.esperado, persona: valor, en: new Date().toISOString() });
      return ir('discrepancia', q, valor);
    }
    if (ev.estado === 'incorrecto') {
      if (s.repasos >= 2) return derivar('no_comprende');
      s.repasos++;
      return ir('repaso', q);
    }
    // correcto o confirmado
    const ultimo = s.idx >= s.preguntas.length - 1;
    document.querySelectorAll('.opcion, #btnHablar, #btnTeclear').forEach((b) => { b.disabled = true; });
    $('#estadoRespuesta').innerHTML = `<span class="resultado ok" style="display:grid">${icono('check')}<span><strong>${ev.estado === 'confirmado' ? 'Coincide con el acta.' : 'Correcto.'}</strong></span></span>`;
    Voz.decir(ev.estado === 'confirmado' ? 'Allinmi. Coincide con el acta.' : 'Allinmi. Correcto.', 'qu', null);
    acciones(`<button class="btn btn-primario" type="button" id="btnSiguiente">${ultimo ? 'Terminar' : 'Siguiente pregunta'}</button>`);
    $('#btnSiguiente').onclick = () => { s.idx++; ir('verificar'); };
    $('#btnSiguiente').focus();
  }

  PANTALLAS.repaso = function (q) {
    const s = estado.sesion;
    $('#pantalla').innerHTML = `
      <h1>Te lo explicamos de otra forma</h1>
      <div class="tarjeta quechua">
        <p class="texto-grande">${esc(q.reQu || s.explicacion.quSimple)}</p>
        ${botonAudio((q.reQu || s.explicacion.quSimple), 'qu', 'Escuchar en quechua', 'autoplay')}
      </div>
      <div class="tarjeta">
        <p class="texto-grande">${esc(q.reEs || s.explicacion.esSimple)}</p>
        ${botonAudio((q.reEs || s.explicacion.esSimple), 'es', 'Escuchar en castellano')}
      </div>
      <p class="peque">Repaso ${s.repasos} de 2. Si todavía hay dudas, te ayudaremos a pedir un intérprete.</p>`;
    acciones(`<button class="btn btn-primario" type="button" id="btnReintentar">Responder otra vez</button>
      <button class="btn btn-borde" type="button" id="btnAyudaPersona">${icono('user')} Prefiero un intérprete</button>`);
    $('#btnReintentar').onclick = () => ir('verificar');
    $('#btnAyudaPersona').onclick = () => derivar('pide_interprete');
    autoplay();
  };

  PANTALLAS.discrepancia = function (q, valor) {
    const s = estado.sesion, f = s.hechos;
    const cosa = f.cantidad ? f.cantidad.es : '';
    $('#pantalla').innerHTML = `
      <h1>No firmes todavía</h1>
      <p class="sub">Lo que tú dices no es lo mismo que dice el acta.</p>
      <div class="comparar">
        <div><span class="peque">El acta dice</span><span class="cifra">${esc(q.esperado)}</span><span>${esc(cosa)}</span></div>
        <div class="tu"><span class="peque">Tú dices</span><span class="cifra">${esc(valor)}</span><span>${esc(cosa)}</span></div>
      </div>
      ${botonAudio(`Ama firmaychu. Papelpiqa ${E.numQu(q.esperado, variante())} nin, qamtaq ${E.numQu(valor, variante())} ninki. No firmes todavía. El acta dice ${q.esperado} y tú dices ${valor}.`, 'qu', 'Escuchar', 'autoplay')}
      <div class="funcionario">
        <p class="peque">Muestre esta pantalla al funcionario</p>
        <p><strong>La persona declara ${esc(valor)} (${esc(E.numEs(valor))}) ${esc(cosa)}. El acta consigna ${esc(q.esperado)} (${esc(E.numEs(q.esperado))}).</strong></p>
        <p>Corrija el acta antes de la firma. Si la persona no comprende el castellano, corresponde un intérprete (Constitución, art. 2 inc. 19).</p>
      </div>`;
    acciones(`<button class="btn btn-exito" type="button" id="btnCorregida">${icono('check')} Ya corrigieron el acta</button>
      <button class="btn btn-borde" type="button" id="btnPedirApoyo">${icono('user')} Necesito un intérprete o defensor</button>`);
    $('#btnCorregida').onclick = () => confirmarCorreccion(q, valor);
    $('#btnPedirApoyo').onclick = () => derivar('discrepancia');
    autoplay();
  };

  function confirmarCorreccion(q, declarado) {
    abrirHoja('Confirmar la corrección', `
      <p>Funcionario: indique el número que dice ahora el acta corregida.</p>
      <label class="etiqueta" for="numCorregido">Número en el acta corregida</label>
      <input class="campo" id="numCorregido" type="number" inputmode="numeric" min="1" value="${esc(declarado)}" />
      <label class="etiqueta" for="nombreFuncionario">Nombre y grado de quien corrige (opcional)</label>
      <input class="campo" id="nombreFuncionario" type="text" autocomplete="off" />
      <p class="escucha-estado" id="errorCorreccion" role="alert"></p>
      <button class="btn btn-exito" type="button" id="btnConfirmarCorreccion">Confirmar corrección</button>`);
    $('#btnConfirmarCorreccion').onclick = () => {
      const n = parseInt($('#numCorregido').value, 10);
      if (!n || n < 1) { $('#errorCorreccion').textContent = 'Escriba un número válido.'; return; }
      if (n !== declarado) { $('#errorCorreccion').textContent = `El acta debe decir ${declarado}, que es lo que declaró la persona. Si no es así, toque «Necesito un intérprete o defensor».`; return; }
      const s = estado.sesion;
      s.correcciones.push({ campo: q.campo || 'cantidad', antes: q.esperado, despues: n, funcionario: $('#nombreFuncionario').value.trim() || null, en: new Date().toISOString() });
      if (s.hechos.cantidad) s.hechos.cantidad.n = n;
      s.respuestas.push({ id: q.id, pregunta: q.es, respuesta: String(n), crudo: 'acta corregida', via: 'corrección', estado: 'confirmado', intento: 2, en: new Date().toISOString() });
      cerrarHoja();
      s.idx++;
      ir('verificar');
    };
  }

  function derivar(motivo) {
    const s = estado.sesion;
    s.motivo = motivo;
    terminar('derivado');
  }

  async function terminar(final) {
    const s = estado.sesion;
    s.estado = final;
    s.fin = new Date().toISOString();
    s.huella = await huella(registroPublico(s));
    guardarEnHistorial(registroPublico(s, true));
    ir(final === 'sello' ? 'sello' : 'derivacion');
  }

  // Lo que se guarda y se firma con la huella (sin el texto completo para no ocupar memoria)
  function registroPublico(s, conHuella) {
    const r = {
      id: s.id, inicio: s.inicio, fin: s.fin, archivo: s.archivo, fuente: s.fuente, variante: s.variante, modo: s.modo,
      tipo: s.hechos.tipo, entidad: s.hechos.entidad, numero: s.hechos.numero, persona: s.hechos.persona, dni: s.hechos.dni,
      cantidad: s.hechos.cantidad, plazo: s.hechos.plazoTexto, fechaCita: s.hechos.fechaCita,
      alertas: s.hechos.alertas.map((a) => a.id), interpreteNoAsignado: s.hechos.interpreteNoAsignado,
      explicacion: { es: s.explicacion.es, qu: s.explicacion.qu, normas: s.explicacion.normas },
      respuestas: s.respuestas, repasos: s.repasos, discrepancias: s.discrepancias, correcciones: s.correcciones,
      estado: s.estado, motivo: s.motivo, conGemini: s.conGemini, extracto: s.texto.slice(0, 600)
    };
    if (conHuella) r.huella = s.huella;
    return r;
  }
  async function huella(obj) {
    const datos = new TextEncoder().encode(JSON.stringify(obj));
    if (window.crypto && crypto.subtle) {
      const h = await crypto.subtle.digest('SHA-256', datos);
      return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    let x = 0; for (const b of datos) x = (x * 31 + b) >>> 0;
    return x.toString(16).padStart(8, '0');
  }

  PANTALLAS.sello = function () {
    const s = estado.sesion, f = s.hechos;
    $('#pantalla').innerHTML = `
      <div class="sello-zona">
        <div class="sello estampar" role="img" aria-label="Sello de comprensión otorgado"><div class="sello-centro">${icono('check')}<span>Entendido</span></div></div>
        <h1>Entendiste el documento</h1>
        <p class="sub">Ya puedes decidir si firmas. Guarda la constancia: demuestra que te lo explicaron en tu idioma.</p>
      </div>
      <div class="tarjeta">
        <ul class="resumen">
          <li>${icono('check')}<span>${s.preguntas.length} preguntas respondidas${s.repasos ? `, con ${s.repasos} ${s.repasos === 1 ? 'repaso' : 'repasos'}` : ', todas a la primera'}</span></li>
          ${s.correcciones.map((c) => `<li>${icono('edit')}<span>El acta se corrigió de ${esc(c.antes)} a ${esc(c.despues)} antes de firmar</span></li>`).join('')}
          <li>${icono('speaker')}<span>Explicado en ${esc(varNombre())}</span></li>
          <li>${icono('scale')}<span>Código de verificación <span class="codigo">${esc(s.huella.slice(0, 12).toUpperCase())}</span></span></li>
        </ul>
      </div>
      ${f.interpreteNoAsignado ? `<div class="aviso alto">${icono('alert')}<div><strong>El acta dice que no necesitaste intérprete.</strong>Si no es así, prepara la solicitud y entrégala antes de firmar.</div></div>` : ''}`;
    acciones(`<button class="btn btn-primario" type="button" id="btnConstancia">${icono('download')} Descargar constancia</button>
      <button class="btn btn-borde" type="button" id="btnSolicitud">${icono('file')} Preparar solicitud de intérprete</button>
      <button class="btn btn-texto" type="button" id="btnTerminar" style="justify-self:center">Leer otro documento</button>`);
    $('#btnConstancia').onclick = (e) => descargar(e.currentTarget, () => Documentos.constancia(registroPublico(s, true)));
    $('#btnSolicitud').onclick = (e) => descargar(e.currentTarget, () => Documentos.solicitud(registroPublico(s, true)));
    $('#btnTerminar').onclick = () => ir('inicio');
    Voz.decir('Allinmi. Documentota intindirqanki.', 'qu', null);
  };

  const MOTIVOS = {
    no_comprende: 'Después de dos repasos, todavía hay dudas sobre el documento.',
    discrepancia: 'Lo que declaraste no coincide con el acta y no se corrigió.',
    pide_interprete: 'Pediste la ayuda de un intérprete.'
  };
  PANTALLAS.derivacion = function () {
    const s = estado.sesion;
    $('#pantalla').innerHTML = `
      <div class="sello-zona">
        <div class="sello derivado" role="img" aria-label="Caso derivado a una persona"><div class="sello-centro">${icono('user')}<span>Con apoyo</span></div></div>
        <h1>Necesitas el apoyo de una persona</h1>
        <p class="sub">${esc(MOTIVOS[s.motivo] || '')} No firmes hasta que un intérprete o un defensor te explique.</p>
      </div>
      ${botonAudio('Ama firmaychu. Intérpreteta otaq abogado defensorta mañakuy. No firmes todavía. Pide un intérprete o un defensor público.', 'qu', 'Escuchar', 'autoplay')}
      <div class="funcionario">
        <p class="peque">Muestre esta pantalla al funcionario</p>
        <p><strong>La persona no ha comprendido plenamente el documento${s.hechos.numero ? ' N.° ' + esc(s.hechos.numero) : ''}.</strong></p>
        <p>Corresponde suspender la firma hasta contar con un intérprete de quechua (Constitución, art. 2 inc. 19; Ley 29735) y, si lo requiere, un defensor público (Ley 29360).</p>
      </div>
      <div class="tarjeta">
        <h2>Dónde pedir ayuda gratis</h2>
        <p style="margin-top:8px">Defensa Pública del Ministerio de Justicia: atiende en cada provincia y no cobra.</p>
        <p style="margin-top:8px">Si estás en una comisaría o fiscalía, pide allí mismo que llamen a un intérprete.</p>
      </div>`;
    acciones(`<button class="btn btn-primario" type="button" id="btnSolicitud">${icono('download')} Descargar solicitud de intérprete y defensor</button>
      <button class="btn btn-borde" type="button" id="btnConstancia">${icono('file')} Descargar registro de lo explicado</button>
      <button class="btn btn-texto" type="button" id="btnTerminar" style="justify-self:center">Volver al inicio</button>`);
    $('#btnSolicitud').onclick = (e) => descargar(e.currentTarget, () => Documentos.solicitud(registroPublico(s, true)));
    $('#btnConstancia').onclick = (e) => descargar(e.currentTarget, () => Documentos.constancia(registroPublico(s, true)));
    $('#btnTerminar').onclick = () => ir('inicio');
    autoplay();
  };

  async function descargar(boton, crear) {
    const original = boton.innerHTML;
    boton.disabled = true; boton.textContent = 'Preparando el PDF…';
    try {
      const { bytes, nombre } = await crear();
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      boton.innerHTML = `${icono('check')} Descargado`;
      setTimeout(() => { if (boton.isConnected) { boton.innerHTML = original; boton.disabled = false; } }, 2500);
    } catch (e) {
      console.error(e);
      boton.innerHTML = original; boton.disabled = false;
      alertaBreve('No se pudo crear el PDF. Revisa tu conexión e inténtalo otra vez.');
    }
  }
  function alertaBreve(msg) { abrirHoja('Aviso', `<p>${esc(msg)}</p><button class="btn btn-primario" type="button" onclick="document.getElementById('hojaCerrar').click()">Entendido</button>`); }

  // ----- historial -----
  PANTALLAS.historial = function () {
    const h = historial();
    $('#pantalla').innerHTML = `
      <h1>Mis documentos</h1>
      ${h.length ? `<ul class="lista-docs">${h.map((r) => `
        <li>
          <div><span class="estado e-${esc(r.estado)}">${r.estado === 'sello' ? 'Entendido' : r.estado === 'derivado' ? 'Con apoyo' : 'Sin terminar'}</span></div>
          <h2>${esc(E.TIPO_NOMBRE[r.tipo] || 'Documento')}${r.numero ? ' N.° ' + esc(r.numero) : ''}</h2>
          <p class="peque">${esc(r.entidad || r.archivo)} — ${esc(fechaHora(r.fin || r.inicio))}</p>
          <div class="fila">
            <button class="btn btn-borde" type="button" data-pdf="constancia" data-id="${esc(r.id)}">${icono('download')} Constancia</button>
            <button class="btn btn-borde" type="button" data-pdf="solicitud" data-id="${esc(r.id)}">${icono('file')} Solicitud</button>
          </div>
        </li>`).join('')}</ul>`
        : `<div class="vacio">${icono('folder')}<p>Aquí aparecerán los documentos que verifiques, con su constancia.</p></div>`}`;
    document.querySelectorAll('[data-pdf]').forEach((b) => {
      b.onclick = () => {
        const r = historial().find((x) => x.id === b.dataset.id);
        if (r) descargar(b, () => (b.dataset.pdf === 'constancia' ? Documentos.constancia(r) : Documentos.solicitud(r)));
      };
    });
    acciones(`<button class="btn btn-primario" type="button" id="btnNuevo">${icono('camera')} Leer un documento</button>`);
    $('#btnNuevo').onclick = () => ir('inicio');
  };

  // ----- panel institucional -----
  PANTALLAS.panel = function () {
    const h = historial();
    const total = h.length;
    const sellos = h.filter((r) => r.estado === 'sello');
    const aLaPrimera = sellos.filter((r) => r.repasos === 0 && !r.discrepancias.length).length;
    const discrep = h.reduce((n, r) => n + r.discrepancias.length, 0);
    const corregidas = h.reduce((n, r) => n + r.correcciones.length, 0);
    const derivados = h.filter((r) => r.estado === 'derivado').length;
    const sinInterprete = h.filter((r) => r.interpreteNoAsignado).length;
    const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '—');
    $('#pantalla').innerHTML = `
      <p class="saludo">Panel institucional</p>
      <h1>Comprensión verificada antes de la firma</h1>
      <p class="sub">Registros guardados en este dispositivo. Cada fila tiene la huella SHA-256 de su constancia.</p>
      <div class="kpis">
        <div class="kpi"><b>${total}</b><span>Documentos verificados</span></div>
        <div class="kpi"><b>${pct(aLaPrimera, total)}</b><span>Entendieron a la primera</span></div>
        <div class="kpi"><b>${discrep}</b><span>Diferencias detectadas en actas (${corregidas} corregidas)</span></div>
        <div class="kpi"><b>${derivados}</b><span>Derivados a intérprete o defensor</span></div>
        <div class="kpi"><b>${sinInterprete}</b><span>Actas que decían «no requirió intérprete»</span></div>
      </div>
      ${total ? `<div class="tabla-envoltura"><table>
        <thead><tr><th>Fecha</th><th>Documento</th><th>Persona</th><th>Lengua</th><th>Resultado</th><th>Huella</th></tr></thead>
        <tbody>${h.map((r) => `<tr>
          <td>${esc(fechaHora(r.fin || r.inicio))}</td>
          <td>${esc(E.TIPO_NOMBRE[r.tipo] || '')}${r.numero ? ' N.° ' + esc(r.numero) : ''}<br><span class="peque">${esc(r.entidad || '')}</span></td>
          <td>${esc(r.persona || '—')}</td>
          <td>${esc((VARIANTES[r.variante] || {}).nombre || '')}</td>
          <td><span class="estado e-${esc(r.estado)}">${r.estado === 'sello' ? 'Comprendido' : 'Derivado'}</span>${r.correcciones.length ? '<br><span class="peque">Acta corregida</span>' : ''}${r.repasos ? `<br><span class="peque">${r.repasos} repaso(s)</span>` : ''}</td>
          <td><span class="codigo">${esc((r.huella || '').slice(0, 12).toUpperCase())}</span></td></tr>`).join('')}</tbody></table></div>`
        : `<div class="vacio">${icono('chart')}<p>Todavía no hay registros. Aparecerán cuando alguien verifique un documento en este dispositivo.</p></div>`}`;
    acciones(`<div class="fila"><button class="btn btn-borde" type="button" id="btnVolverApp">${icono('back')} Volver a la app</button>
      <button class="btn btn-primario" type="button" id="btnCsv" ${total ? '' : 'disabled'}>${icono('download')} Exportar CSV</button></div>`);
    $('#btnVolverApp').onclick = () => { history.replaceState(null, '', location.pathname); arrancar(); };
    $('#btnCsv').onclick = () => {
      const cols = ['fecha', 'tipo', 'numero', 'entidad', 'persona', 'variante', 'resultado', 'repasos', 'discrepancias', 'correcciones', 'interprete_no_asignado', 'huella'];
      const filas = h.map((r) => [r.fin || r.inicio, r.tipo, r.numero, r.entidad, r.persona, r.variante, r.estado, r.repasos, r.discrepancias.length, r.correcciones.length, r.interpreteNoAsignado ? 'si' : 'no', r.huella]);
      const csv = [cols].concat(filas).map((f) => f.map((v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`).join(',')).join('\n');
      const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a'); a.href = url; a.download = 'kuskachay-registros.csv'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    };
  };

  // ----- grabar voz nativa -----
  const FRASES_FIJAS = [
    { t: 'Allinmi. Correcto.', para: 'Respuesta correcta' },
    { t: 'Allinmi. Coincide con el acta.', para: 'Coincide con el acta' },
    { t: 'Allinmi. Documentota intindirqanki.', para: 'Sello de comprensión' },
    { t: 'Ama firmaychu. Intérpreteta otaq abogado defensorta mañakuy. No firmes todavía. Pide un intérprete o un defensor público.', para: 'Derivación a una persona' },
    { t: 'Allillanchu. Kuskachaymi kani. Yanapasqayki papelniykita intindinaykipaq.', para: 'Saludo' }
  ];
  function frasesQuechua() {
    const s = estado.sesion, lista = [];
    const add = (t, para) => { if (t && !lista.some((x) => x.t === t)) lista.push({ t, para }); };
    if (s && s.explicacion) {
      add(s.explicacion.qu, 'Explicación del documento');
      s.preguntas.forEach((q, i) => { add(q.qu + '. ' + q.es, `Pregunta ${i + 1}`); add(q.reQu, `Repaso de la pregunta ${i + 1}`); });
      add(s.explicacion.quSimple, 'Explicación corta');
    }
    FRASES_FIJAS.forEach((f) => add(f.t, f.para));
    return lista;
  }

  async function abrirGrabador() {
    const frases = frasesQuechua();
    const grabadas = await Promise.all(frases.map((f) => Grabaciones.obtener(f.t)));
    const puedeGrabar = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
    abrirHoja('Grabar voz en quechua', `
      <p>Pide a un hablante nativo de ${esc(varNombre().replace('Quechua ', 'quechua '))} que lea cada frase. La app usará su voz en lugar de la voz del teléfono.</p>
      ${estado.sesion ? '' : '<p class="peque">Lee un documento primero para grabar también su explicación y sus preguntas.</p>'}
      <p class="peque">Las grabaciones se guardan solo en este teléfono.</p>
      ${frases.map((f, i) => `
        <div class="tarjeta" data-frase="${i}">
          <p class="peque">${esc(f.para)}</p>
          <p class="texto-grande">${esc(f.t)}</p>
          <p class="escucha-estado" data-estado="${i}">${grabadas[i] ? 'Grabada con voz nativa' : 'Sin grabar: se usa la voz del teléfono'}</p>
          <div class="fila" style="flex-wrap:wrap">
            ${puedeGrabar ? `<button class="btn btn-primario" type="button" data-grabar="${i}">${icono('mic')} Grabar</button>` : ''}
            <button class="btn btn-borde" type="button" data-audio="${esc(f.t)}" data-idioma="qu" data-etiqueta="Escuchar" aria-pressed="false">${icono('speaker')} Escuchar</button>
          </div>
          <div class="fila" style="margin-top:8px">
            <label class="btn btn-texto" style="justify-content:flex-start">${icono('download')} Subir un audio (MP3)<input type="file" accept="audio/*" hidden data-subir="${i}" /></label>
            <button class="btn btn-texto" type="button" data-borrar="${i}" ${grabadas[i] ? '' : 'hidden'}>Borrar</button>
          </div>
        </div>`).join('')}`);

    const cuerpo = $('#hojaCuerpo');
    const marcar = (i, texto, hay) => {
      cuerpo.querySelector(`[data-estado="${i}"]`).textContent = texto;
      cuerpo.querySelector(`[data-borrar="${i}"]`).hidden = !hay;
    };
    let grabando = null;
    cuerpo.querySelectorAll('[data-grabar]').forEach((b) => {
      b.onclick = async () => {
        const i = +b.dataset.grabar;
        if (grabando && grabando.i === i) { grabando.rec.stop(); return; }
        if (grabando) grabando.rec.stop();
        Voz.callar();
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const rec = new MediaRecorder(stream);
          const partes = [];
          rec.ondataavailable = (e) => { if (e.data.size) partes.push(e.data); };
          rec.onstop = async () => {
            stream.getTracks().forEach((t) => t.stop());
            b.innerHTML = `${icono('mic')} Regrabar`; b.classList.remove('btn-peligro'); b.classList.add('btn-primario');
            grabando = null;
            if (!partes.length) { marcar(i, 'No se grabó nada. Inténtalo otra vez.', false); return; }
            await Grabaciones.guardar(frases[i].t, new Blob(partes, { type: rec.mimeType || 'audio/webm' }));
            marcar(i, 'Grabada con voz nativa', true);
          };
          rec.start();
          grabando = { i, rec };
          b.innerHTML = `${icono('stop')} Detener`; b.classList.remove('btn-primario'); b.classList.add('btn-peligro');
          marcar(i, 'Grabando… lee la frase y toca Detener.', false);
        } catch (e) {
          marcar(i, 'No se pudo usar el micrófono. Revisa los permisos del navegador.', false);
        }
      };
    });
    cuerpo.querySelectorAll('[data-subir]').forEach((inp) => {
      inp.onchange = async () => {
        const i = +inp.dataset.subir, f = inp.files[0];
        inp.value = '';
        if (!f) return;
        if (!f.type.startsWith('audio/')) { marcar(i, 'Ese archivo no es un audio.', false); return; }
        await Grabaciones.guardar(frases[i].t, f);
        marcar(i, `Grabada con voz nativa (${f.name})`, true);
      };
    });
    cuerpo.querySelectorAll('[data-borrar]').forEach((b) => {
      b.onclick = async () => { const i = +b.dataset.borrar; await Grabaciones.borrar(frases[i].t); marcar(i, 'Sin grabar: se usa la voz del teléfono', false); };
    });
  }

  // ----- ajustes -----
  async function abrirAjustes() {
    const a = estado.ajustes;
    const nGrabadas = await Grabaciones.contar();
    abrirHoja('Ajustes', `
      <button class="btn btn-borde" type="button" id="btnCambiarPerfil">${icono('user')} Cambiar variante y forma de explicación</button>
      <div class="tarjeta">
        <h3>Voz en quechua</h3>
        <p class="peque">${nGrabadas ? `${nGrabadas} frases grabadas por un hablante nativo.` : 'Ahora se usa la voz del teléfono, que no habla quechua. Para la demo, graba la voz de un hablante nativo.'}</p>
        <button class="btn btn-borde" type="button" id="btnGrabarVoz">${icono('mic')} Grabar voz en quechua</button>
      </div>
      <div class="tarjeta">
        <h3>Análisis con Gemini (opcional)</h3>
        <p class="peque">Mejora la lectura de fotos difíciles y las explicaciones. El documento se envía a Google. Sin clave, todo funciona en el teléfono.</p>
        <label class="etiqueta" for="ajKey">Clave de API</label>
        <input class="campo" id="ajKey" type="password" autocomplete="off" value="${esc(a.apiKey)}" placeholder="AIza…" />
        <label class="etiqueta" for="ajModelo">Modelo</label>
        <input class="campo" id="ajModelo" type="text" autocomplete="off" value="${esc(a.modelo)}" />
        <p class="escucha-estado" id="ajEstado" role="status"></p>
        <div class="fila"><button class="btn btn-borde" type="button" id="btnProbar">Probar</button><button class="btn btn-primario" type="button" id="btnGuardarAj">Guardar</button></div>
      </div>
      <div class="tarjeta">
        <h3>Datos de este dispositivo</h3>
        <p class="peque">${historial().length} documentos guardados.</p>
        <button class="btn btn-borde" type="button" id="btnBorrar">Borrar historial</button>
      </div>`);
    $('#btnCambiarPerfil').onclick = () => { cerrarHoja(); ir('perfil', true); };
    $('#btnGrabarVoz').onclick = () => abrirGrabador();
    const leer = () => ({ apiKey: $('#ajKey').value.trim(), modelo: $('#ajModelo').value.trim() || 'gemini-flash-latest' });
    $('#btnGuardarAj').onclick = () => { estado.ajustes = leer(); guardado.escribir('kuskachay_ajustes', estado.ajustes); $('#ajEstado').textContent = 'Guardado.'; if (estado.pantalla === 'inicio') ir('inicio'); };
    $('#btnProbar').onclick = async () => {
      const prev = estado.ajustes; estado.ajustes = leer();
      $('#ajEstado').textContent = 'Probando…';
      try { await Gemini.llamar([{ text: 'Responde solo con {"ok":true}' }]); $('#ajEstado').textContent = 'Conexión correcta.'; }
      catch (e) { $('#ajEstado').textContent = 'No funcionó: ' + e.message; }
      estado.ajustes = prev;
    };
    $('#btnBorrar').onclick = () => { guardado.escribir('kuskachay_historial', []); $('#btnBorrar').textContent = 'Historial borrado'; $('#btnBorrar').disabled = true; };
  }

  // ---------- Gemini (opcional) ----------
  const Gemini = {
    async llamar(partes) {
      const { apiKey, modelo } = estado.ajustes;
      if (!apiKey) throw new Error('sin clave');
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 30000);
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
          method: 'POST', signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({ contents: [{ parts: partes }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data.error && data.error.message) || 'error ' + res.status);
        const txt = (((data.candidates || [])[0] || {}).content || {}).parts?.map((p) => p.text || '').join('') || '';
        return JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
      } finally { clearTimeout(t); }
    },
    instrucciones(conImagen) {
      return `Eres un asistente legal peruano. Ayudas a una persona quechuahablante (${varNombre()}) a entender un documento antes de firmarlo.
${conImagen ? 'Primero transcribe con exactitud todo el texto de la imagen en "texto".' : ''}
Devuelve SOLO un JSON con estas claves:
${conImagen ? '"texto": transcripción completa,' : ''}
"hechos": {"tipo": "denuncia"|"citacion"|"intervencion"|"notificacion"|"otro", "entidad": string|null, "numero": string|null, "persona": string|null,
  "cantidad": {"numero": entero, "objeto": string}|null, "plazoDias": entero|null, "fechaCita": string|null, "interpreteNoAsignado": boolean, "consecuencia": boolean},
"explicacion": {"qu": explicación clara en quechua ${varNombre()}, máximo 5 oraciones, "es": la misma explicación en castellano sencillo sin tecnicismos,
  "quSimple": versión muy corta en quechua, "esSimple": versión muy corta en castellano,
  "normas": lista de ids aplicables, elegidos SOLO entre: ${Object.keys(L.NORMAS).join(', ')}}.
No inventes datos que no estén en el documento.`;
    },
    async analizar({ texto, imagenBase64, mime }) {
      const partes = [{ text: this.instrucciones(!!imagenBase64) }];
      if (imagenBase64) partes.push({ inline_data: { mime_type: mime, data: imagenBase64 } });
      else partes.push({ text: 'Documento:\n' + texto.slice(0, 12000) });
      return this.llamar(partes);
    },
    async responder(s, pregunta) {
      const r = await this.llamar([{ text: `Responde la pregunta de una persona quechuahablante (${varNombre()}) usando SOLO el documento y estas normas: ${Object.entries(L.NORMAS).map(([k, v]) => k + ': ' + v.texto).join(' | ')}.
Devuelve JSON {"qu": respuesta corta en quechua, "es": respuesta corta en castellano sencillo, "norma": id de la norma usada o null}. Si el documento no lo dice, dilo.
Documento:\n${s.texto.slice(0, 8000)}\nPregunta: ${pregunta}` }]);
      if (r && r.norma && !L.NORMAS[r.norma]) r.norma = null;
      return r && r.es ? r : null;
    }
  };

  // ---------- PDF: constancia y solicitud ----------
  const Documentos = {
    async base() {
      await cargarScript(LIB.pdflib);
      return esperarGlobal('PDFLib');
    },
    // pdf-lib solo admite el juego de caracteres WinAnsi con las fuentes estándar
    limpio(t) {
      const extra = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
      return String(t == null ? '' : t).replace(/[«»]/g, '"').replace(/[^\n\x20-\xFF]/g, (c) => (extra.includes(c) ? c : ''));
    },
    async lienzo(titulo) {
      const P = await this.base();
      const doc = await P.PDFDocument.create();
      doc.setTitle(this.limpio(titulo)); doc.setCreator('Kuskachay'); doc.setProducer('Kuskachay');
      const f = await doc.embedFont(P.StandardFonts.Helvetica);
      const fb = await doc.embedFont(P.StandardFonts.HelveticaBold);
      const W = 595.28, H = 841.89, M = 50;
      const color = (h) => P.rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
      const ctx = { P, doc, f, fb, W, H, M, color, pag: null, y: 0 };
      ctx.nuevaPagina = () => {
        ctx.pag = doc.addPage([W, H]);
        // franja tejida
        for (let x = 0; x < W; x += 24) {
          ctx.pag.drawRectangle({ x, y: H - 12, width: 24, height: 12, color: color('#A3154E') });
          ctx.pag.drawRectangle({ x: x + 8, y: H - 10, width: 8, height: 8, color: color('#F2B300') });
          ctx.pag.drawRectangle({ x: x + 11, y: H - 7, width: 2, height: 2, color: color('#2F2A7A') });
        }
        ctx.y = H - 44;
      };
      ctx.texto = (t, { tam = 10.5, negrita = false, col = '#1E1B3A', sangria = 0, interlinea = 1.4, ancho } = {}) => {
        const fuente = negrita ? fb : f;
        const max = (ancho || W - 2 * M) - sangria;
        const parrafos = this.limpio(t).split('\n');
        for (const par of parrafos) {
          const palabras = par.split(' ');
          let linea = '';
          const flush = () => {
            if (ctx.y < M + 40) ctx.nuevaPagina();
            ctx.pag.drawText(linea, { x: M + sangria, y: ctx.y, size: tam, font: fuente, color: color(col) });
            ctx.y -= tam * interlinea; linea = '';
          };
          for (const w of palabras) {
            const prueba = linea ? linea + ' ' + w : w;
            if (fuente.widthOfTextAtSize(prueba, tam) > max && linea) { flush(); linea = w; } else linea = prueba;
          }
          flush();
        }
      };
      ctx.espacio = (n = 8) => { ctx.y -= n; };
      ctx.linea = () => { ctx.pag.drawLine({ start: { x: M, y: ctx.y + 4 }, end: { x: W - M, y: ctx.y + 4 }, thickness: 0.6, color: color('#DAD7E5') }); ctx.y -= 10; };
      ctx.campo = (k, v) => {
        if (ctx.y < M + 40) ctx.nuevaPagina();
        ctx.pag.drawText(this.limpio(k), { x: M, y: ctx.y, size: 9.5, font: f, color: color('#55526E') });
        const yAntes = ctx.y;
        ctx.y = yAntes;
        ctx.texto(v || '—', { tam: 10.5, negrita: true, sangria: 130 });
      };
      ctx.titulo = (t) => { if (ctx.y < M + 110) ctx.nuevaPagina(); ctx.espacio(6); ctx.texto(t, { tam: 12.5, negrita: true, col: '#2F2A7A' }); ctx.espacio(2); };
      ctx.pie = (t) => {
        doc.getPages().forEach((p, i, todas) => {
          p.drawText(this.limpio(t), { x: M, y: 28, size: 7.5, font: f, color: color('#55526E') });
          p.drawText(`Página ${i + 1} de ${todas.length}`, { x: W - M - 60, y: 28, size: 7.5, font: f, color: color('#55526E') });
        });
      };
      ctx.nuevaPagina();
      return ctx;
    },
    nombreArchivo(pref, r) { return `${pref}-${(r.numero || r.id).replace(/[^\w-]+/g, '_')}.pdf`; },

    async constancia(r) {
      const c = await this.lienzo('Constancia de comprensión');
      const ok = r.estado === 'sello';
      c.texto('Kuskachay', { tam: 11, negrita: true, col: '#55526E' });
      c.texto(ok ? 'CONSTANCIA DE COMPRENSIÓN DE DOCUMENTO' : 'REGISTRO DE EXPLICACIÓN — COMPRENSIÓN NO ALCANZADA', { tam: 16, negrita: true });
      c.texto('Evidencia complementaria del ejercicio de derechos lingüísticos (Constitución, art. 2 inc. 19; Ley N.° 29735)', { tam: 9.5, col: '#55526E' });
      c.espacio(10);
      c.campo('Código de verificación', r.huella ? r.huella.slice(0, 12).toUpperCase() : '—');
      c.campo('Fecha y hora', fechaHora(r.fin || r.inicio));
      c.campo('Persona', [r.persona, r.dni ? 'DNI ' + r.dni : ''].filter(Boolean).join(', ') || 'No figura en el documento');
      c.campo('Documento', `${E.TIPO_NOMBRE[r.tipo] || 'Documento'}${r.numero ? ' N.° ' + r.numero : ''}`);
      c.campo('Entidad', r.entidad || '—');
      c.campo('Archivo leído', `${r.archivo} (${r.fuente})`);
      c.campo('Lengua de explicación', `${(VARIANTES[r.variante] || {}).nombre || ''}, ${r.modo === 'leer' ? 'texto y voz a pedido' : 'voz y texto'}`);
      c.campo('Normas citadas', r.explicacion.normas.map((n) => L.NORMAS[n] ? L.NORMAS[n].corto : n).join('; '));
      c.linea();

      c.titulo('1. Lo que se explicó');
      c.texto('En quechua:', { tam: 9.5, col: '#55526E' });
      c.texto(r.explicacion.qu, { tam: 10.5 });
      c.espacio(4);
      c.texto('En castellano:', { tam: 9.5, col: '#55526E' });
      c.texto(r.explicacion.es, { tam: 10.5 });

      c.titulo('2. Verificación de comprensión');
      r.respuestas.forEach((a, i) => {
        const res = { correcto: 'Correcta', incorrecto: 'Incorrecta: se repitió la explicación', confirmado: 'Coincide con el acta', discrepancia: 'NO coincide con el acta' }[a.estado] || a.estado;
        c.texto(`${i + 1}. ${a.pregunta}`, { negrita: true });
        c.texto(`Respuesta: ${a.respuesta} (por ${a.via}${a.via === 'voz' ? ': "' + a.crudo + '"' : ''}). Resultado: ${res}.`, { sangria: 12 });
        c.espacio(2);
      });
      c.texto(`Repasos de la explicación: ${r.repasos}.`);

      if (r.discrepancias.length || r.correcciones.length) {
        c.titulo('3. Diferencias detectadas en el acta');
        r.discrepancias.forEach((d) => c.texto(`- El acta consignaba ${d.acta}; la persona declaró ${d.persona} (${fechaHora(d.en)}).`));
        r.correcciones.forEach((k) => c.texto(`- Acta corregida de ${k.antes} a ${k.despues} antes de la firma${k.funcionario ? ', por ' + k.funcionario : ''} (${fechaHora(k.en)}).`));
      }
      if (r.interpreteNoAsignado) {
        c.titulo('Observación');
        c.texto('El documento indica que la persona no requirió intérprete. La persona fue informada de su derecho a contar con uno (Constitución, art. 2 inc. 19).');
      }

      c.titulo('Resultado');
      c.texto(ok
        ? 'La persona respondió correctamente las preguntas de control sobre el contenido del documento y sus derechos.'
        : 'La persona NO alcanzó a comprender plenamente el documento. Corresponde suspender la firma hasta contar con un intérprete y, si lo requiere, un defensor público.',
      { negrita: true, col: ok ? '#0F6E5F' : '#B42318' });

      c.espacio(36);
      if (c.y < 140) { c.nuevaPagina(); c.espacio(40); }
      const yF = c.y;
      c.pag.drawLine({ start: { x: c.M, y: yF }, end: { x: c.M + 200, y: yF }, thickness: 0.6, color: c.color('#1E1B3A') });
      c.pag.drawLine({ start: { x: c.W - c.M - 200, y: yF }, end: { x: c.W - c.M, y: yF }, thickness: 0.6, color: c.color('#1E1B3A') });
      c.pag.drawText('Firma o huella de la persona', { x: c.M, y: yF - 14, size: 9, font: c.f });
      c.pag.drawText('Firma del funcionario', { x: c.W - c.M - 200, y: yF - 14, size: 9, font: c.f });
      c.y = yF - 40;

      c.texto(`Huella SHA-256 del registro: ${r.huella || '—'}`, { tam: 7.5, col: '#55526E' });
      c.texto('Este registro no reemplaza a un intérprete acreditado ni es un documento oficial del Estado.' + (r.conGemini ? ' Parte del análisis se hizo con Gemini (Google).' : ''), { tam: 7.5, col: '#55526E' });
      c.pie('Kuskachay — constancia generada en el dispositivo de la persona');
      return { bytes: await c.doc.save(), nombre: this.nombreArchivo('constancia', r) };
    },

    async solicitud(r) {
      const c = await this.lienzo('Solicitud de intérprete');
      const v = (VARIANTES[r.variante] || VARIANTES.chanka).nombre.toLowerCase();
      const doc = `${E.TIPO_NOMBRE[r.tipo] || 'documento'}${r.numero ? ' N.° ' + r.numero : ''}`;
      c.texto('SUMILLA: Solicito intérprete de lengua quechua y defensa pública gratuita', { negrita: true });
      c.espacio(14);
      c.texto(`SEÑOR(A) TITULAR DE ${(r.entidad || '__________________________').toUpperCase()}:`, { negrita: true });
      c.espacio(10);
      c.texto(`Yo, ${r.persona || '__________________________'}, identificado(a) con DNI N.° ${r.dni || '____________'}, en relación con el ${doc.toLowerCase()}, ante usted me presento y digo:`, { interlinea: 1.55 });
      c.espacio(8);
      c.texto(`Que mi lengua materna es el ${v} y no comprendo plenamente el castellano. Al amparo del artículo 2, inciso 19, de la Constitución Política del Perú, de la Ley N.° 29735 y del artículo 114 del Código Procesal Penal, solicito:`, { interlinea: 1.55 });
      c.espacio(8);
      c.texto(`1. Que se me asigne un intérprete de ${v} en todas las diligencias en las que deba participar.`, { sangria: 14, interlinea: 1.55 });
      c.texto('2. Que se comunique a la Defensa Pública del Ministerio de Justicia para contar con un abogado defensor gratuito (Ley N.° 29360).', { sangria: 14, interlinea: 1.55 });
      c.texto('3. Que no se me pida firmar ningún documento sin que antes un intérprete me lo explique en mi idioma.', { sangria: 14, interlinea: 1.55 });
      if (r.interpreteNoAsignado) {
        c.espacio(6);
        c.texto('Dejo constancia de que el documento indica que no requerí intérprete, lo cual no corresponde a mi situación.', { interlinea: 1.55 });
      }
      c.espacio(10);
      c.texto('POR LO EXPUESTO: Pido a usted acceder a lo solicitado.', { negrita: true });
      c.espacio(16);
      c.texto('Lugar y fecha: ______________________, ' + new Date().toLocaleDateString('es-PE', { dateStyle: 'long' }));
      c.espacio(100);
      const yF = c.y;
      c.pag.drawLine({ start: { x: c.M, y: yF }, end: { x: c.M + 220, y: yF }, thickness: 0.6, color: c.color('#1E1B3A') });
      c.pag.drawRectangle({ x: c.M + 250, y: yF - 6, width: 64, height: 78, borderColor: c.color('#1E1B3A'), borderWidth: 0.6 });
      c.pag.drawText('Firma', { x: c.M, y: yF - 14, size: 9, font: c.f });
      c.pag.drawText('Huella', { x: c.M + 266, y: yF - 18, size: 9, font: c.f });
      c.y = yF - 50;
      c.texto(`Esta solicitud fue explicada en ${v} con Kuskachay${r.huella ? ' (código ' + r.huella.slice(0, 12).toUpperCase() + ')' : ''}. Revísela con un defensor público antes de presentarla.`, { tam: 8.5, col: '#55526E' });
      c.pie('Kuskachay — modelo de solicitud');
      return { bytes: await c.doc.save(), nombre: this.nombreArchivo('solicitud-interprete', r) };
    }
  };

  // ---------- arranque ----------
  $('#inputFoto').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; procesarArchivo(f); };
  $('#inputArchivo').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; procesarArchivo(f); };
  $('#btnMarca').onclick = () => { if (location.hash) history.replaceState(null, '', location.pathname); arrancar(); };
  $('#btnHistorial').onclick = () => { if (location.hash) history.replaceState(null, '', location.pathname); ir('historial'); };
  $('#btnAjustes').onclick = abrirAjustes;
  window.addEventListener('hashchange', arrancar);

  function arrancar() {
    if (location.hash === '#panel') return ir('panel');
    if (!estado.perfil) return ir('perfil');
    ir('inicio');
  }
  arrancar();

  // expuesto para pruebas
  window.Kuskachay = { estado, procesarArchivo, Documentos, registroPublico, Grabaciones, Voz };
})();
