/*
 * Motor de análisis de Kuskachay AI.
 *
 * Funciona sin conexión: lee el texto del documento, encuentra los datos que importan
 * (tipo, cantidades, plazos, intérprete...), arma la explicación, genera las preguntas
 * de comprensión a partir de esos datos y evalúa las respuestas.
 *
 * Las frases en quechua son plantillas cortas y DEBEN revisarse con un hablante nativo
 * de cada variante antes de usarse con personas reales.
 */
(function (root) {
  const KLegal = root.KLegal || (typeof require !== 'undefined' ? require('./legal.js') : null);

  // ---------- utilidades de texto ----------
  const strip = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const titleCase = (s) => {
    const small = ['de', 'del', 'la', 'las', 'los', 'y', 'e', 'en', 'el'];
    return clean(s).toLowerCase().split(' ').map((w, i) =>
      i > 0 && small.includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };
  const isCaps = (s) => s && s === s.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(s);

  // ---------- números ----------
  const ES_NUM = {
    cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8,
    nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16,
    diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21,
    veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, treinta: 30, cuarenta: 40,
    cincuenta: 50, sesenta: 60, cien: 100
  };
  const ES_ORD = {
    primer: 1, primero: 1, segundo: 2, tercer: 3, tercero: 3, cuarto: 4, quinto: 5, sexto: 6,
    septimo: 7, octavo: 8, noveno: 9, decimo: 10
  };
  const ES_WORDS = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
    'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte'];
  const QU_NUM = {
    sur: ['', 'huk', 'iskay', 'kimsa', 'tawa', 'pichqa', 'suqta', 'qanchis', 'pusaq', 'isqun', 'chunka'],
    ancash: ['', 'huk', 'ishkay', 'kima', 'chusku', 'pitsqa', 'suqta', 'qanchis', 'puwaq', 'isqun', 'chunka']
  };
  // palabras quechua que una persona puede decir al responder (todas las variantes)
  const QU_PARSE = {
    huk: 1, iskay: 2, ishkay: 2, kimsa: 3, kima: 3, tawa: 4, chusku: 4, pichqa: 5, pichqa_: 5, pitsqa: 5, pisqa: 5,
    suqta: 6, soqta: 6, qanchis: 7, pusaq: 8, puwaq: 8, isqun: 9, chunka: 10
  };

  const variantGroup = (variant) => (strip(variant).includes('ancash') ? 'ancash' : 'sur');
  const numEs = (n) => (n >= 0 && n <= 20 ? ES_WORDS[n] : String(n));
  const numQu = (n, variant) => {
    const t = QU_NUM[variantGroup(variant)];
    return n >= 1 && n <= 10 ? t[n] : String(n);
  };

  function wordToNumber(word) {
    const w = strip(word).replace(/[^a-z0-9]/g, '');
    if (/^\d+$/.test(w)) return parseInt(w, 10);
    if (w in ES_NUM) return ES_NUM[w];
    if (w in ES_ORD) return ES_ORD[w];
    if (w in QU_PARSE) return QU_PARSE[w];
    return null;
  }

  // Encuentra el primer número dicho o escrito en una respuesta libre
  function findNumber(text) {
    const tokens = strip(text).replace(/[^a-z0-9ñ\s]/g, ' ').split(/\s+/).filter(Boolean);
    for (const t of tokens) {
      const n = wordToNumber(t);
      if (n !== null) return n;
    }
    return null;
  }

  // ---------- catálogos ----------
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'setiembre', 'octubre', 'noviembre', 'diciembre'];

  const ANIMALES = [
    { re: /^(vacun|vaca|toro|novill|becerr|terner|bovin)/, es: 'vacas', esUno: 'vaca', qu: 'waka' },
    { re: /^(ovin|oveja|carner)/, es: 'ovejas', esUno: 'oveja', qu: 'uwiha' },
    { re: /^(caprin|cabra|chivo)/, es: 'cabras', esUno: 'cabra', qu: 'kapra' },
    { re: /^(equin|caball|yegua|burro|asno)/, es: 'caballos', esUno: 'caballo', qu: 'kawallu' },
    { re: /^(porcin|cerdo|chancho)/, es: 'cerdos', esUno: 'cerdo', qu: 'khuchi' },
    { re: /^(alpaca)/, es: 'alpacas', esUno: 'alpaca', qu: 'alpaka' },
    { re: /^(llama)s?$/, es: 'llamas', esUno: 'llama', qu: 'llama' },
    { re: /^(cuy|cuyes)$/, es: 'cuyes', esUno: 'cuy', qu: 'quwi' },
    { re: /^(cabeza|cabezas|animal|animales|ganado|semoviente)/, es: 'animales', esUno: 'animal', qu: 'uywa' }
  ];

  // ---------- extracción ----------
  function extract(rawText) {
    const text = (rawText || '').replace(/\r/g, '');
    const flat = clean(text);
    const low = strip(flat);
    const f = {
      tipo: 'otro', rol: null, entidad: null, numero: null, persona: null, dni: null,
      fechas: [], hora: null, cantidad: null, valor: null, plazoDias: null, plazoTexto: null,
      fechaCita: null, horaCita: null, consecuencia: false, esDetencion: false,
      interpreteNoAsignado: false, diceComprenderCastellano: false, lenguaQuechua: false,
      instruccionBaja: false, mencionaAbogado: false, alertas: []
    };
    if (!flat) return f;

    // tipo de documento
    if (/acta de denuncia|denuncia verbal|denuncia policial|el denunciante|la denunciante/.test(low)) f.tipo = 'denuncia';
    else if (/citacion|cedula de notificacion|se dispone citar|citar a|apersone|comparezca|comparecer/.test(low)) f.tipo = 'citacion';
    else if (/acta de intervencion|intervenido|intervenida|acta de detencion|detencion en flagrancia/.test(low)) f.tipo = 'intervencion';
    else if (/notificacion|resolucion|oficio/.test(low)) f.tipo = 'notificacion';

    if (f.tipo === 'citacion') {
      f.rol = /testimonial|testigo/.test(low) ? 'testigo' : /investigad|imputad|denunciad/.test(low) ? 'investigado' : 'citado';
    } else if (f.tipo === 'denuncia') f.rol = 'denunciante';
    else if (f.tipo === 'intervencion') f.rol = 'intervenido';

    // entidad
    const reEnt = /\b((?:COMISAR[IÍ]A|Comisar[ií]a|FISCAL[IÍ]A|Fiscal[ií]a|JUZGADO|Juzgado|DESPACHO FISCAL|Despacho Fiscal|DEPARTAMENTO DE INVESTIGACI[OÓ]N|DIVISI[OÓ]N)[^,.;:\n()“"]{0,60})/;
    const lineaEnt = text.split('\n').map((l) => l.match(reEnt)).find(Boolean);
    const ent = lineaEnt || flat.match(reEnt);
    if (ent) {
      let e = ent[1].replace(/\s+(?:Regi[oó]n|REGI[OÓ]N|Libro|LIBRO|siendo|Se dispone|SE DISPONE|N\.?\s*[°º]|dentro|para|a fin|bajo|en calidad|que|con)\b.*$/, '');
      e = e.replace(/\s+\S{1,4}$/, (x) => (/^\s+(de|del|la|las|los|el)$/i.test(x) || /[^A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(x.trim()) ? '' : x)).trim();
      f.entidad = isCaps(e) ? titleCase(e) : clean(e);
    }

    // número del documento
    const numRes = [
      /(?:ACTA|Acta|C[ÉE]DULA|C[ée]dula|CITACI[ÓO]N|Citaci[óo]n)[^.]{0,40}?N\.?\s*[°º*]?\s*([0-9][\w\-\/]*)/,
      /(?:NOTIFICACI[ÓO]N|Notificaci[óo]n|OFICIO|Oficio|RESOLUCI[ÓO]N|Resoluci[óo]n)[^.]{0,40}?N\.?\s*[°º*]?\s*([0-9][\w\-\/]*)/
    ];
    let num = null;
    for (const re of numRes) { num = flat.match(re); if (num) break; }
    if (num) f.numero = num[1].replace(/[.\-]+$/, '');

    // persona
    const nombrePatrones = [
      /Apellidos y nombres\s*:\s*([^\n]{3,60}?)(?:\s{2,}|\n|DNI|$)/i,
      /(?:citar|cita)\s+a\s+(?:la|el)\s+(?:ciudadan[oa]|se[ñn]or[a]?)\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ]+){1,3})/,
      /(?:ciudadan[oa]|se[ñn]or[a]?|denunciante|intervenid[oa])\s+(?:don\s+|do[ñn]a\s+)?([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ]+){1,3})/
    ];
    for (const re of nombrePatrones) {
      const m = text.match(re) || flat.match(re);
      if (m) {
        let n = clean(m[1]).replace(/\s*\(.*$/, '').replace(/[,;]\s*$/, '');
        if (n.includes(',')) { const [ap, no] = n.split(','); n = clean(no) + ' ' + clean(ap); }
        f.persona = isCaps(n.replace(/\s/g, '')) ? titleCase(n) : n.split(' ').map((w) => isCaps(w) ? titleCase(w) : w).join(' ');
        break;
      }
    }

    const dni = flat.match(/DNI\s*(?:N\.?\s*[°º]?)?\s*:?\s*(\d{8})/i);
    if (dni) f.dni = dni[1];

    // fechas y hora
    const reFecha = new RegExp('(\\d{1,2})\\s+de\\s+(' + MESES.join('|') + ')\\s+(?:de|del)\\s+(\\d{4})', 'gi');
    let m;
    while ((m = reFecha.exec(flat)) !== null) f.fechas.push(`${parseInt(m[1], 10)} de ${m[2].toLowerCase()} de ${m[3]}`);
    const hora = flat.match(/(\d{1,2}[:.]\d{2})\s*(?:horas|hrs|h\b)/i);
    if (hora) f.hora = hora[1].replace('.', ':');

    // cita: fecha concreta para presentarse
    const cita = flat.match(new RegExp('(?:compare\\w*|apersone\\w*|apersonarse|present\\w*|concurr\\w*|acud\\w*)[^.]{0,90}?(\\d{1,2}\\s+de\\s+(?:' + MESES.join('|') + ')\\s+(?:de|del)\\s+\\d{4})(?:[^.]{0,40}?(\\d{1,2}[:.]\\d{2}))?', 'i'));
    if (cita) { f.fechaCita = cita[1].toLowerCase(); if (cita[2]) f.horaCita = cita[2].replace('.', ':'); }

    // plazo en días
    const plazoRes = [
      /dentro\s+(?:de\s+)?(?:del|de los|los|el)?\s*([a-záéíóú]+|\d+)\s*(?:\(\s*(\d+)\s*[a-z°º]*\s*\))?\s*(?:\(\s*\d+\s*\)\s*)?d[ií]as?\s*(h[aá]bil(?:es)?|calendario|naturales)?/i,
      /plazo\s+(?:de|m[aá]ximo de)\s+([a-záéíóú]+|\d+)\s*(?:\(\s*(\d+)\s*\))?\s*d[ií]as?\s*(h[aá]bil(?:es)?|calendario|naturales)?/i,
      /\b(\d{1,2})\s*d[ií]as\s*(h[aá]biles)/i
    ];
    for (const re of plazoRes) {
      const p = flat.match(re);
      if (p) {
        const n = p[2] ? parseInt(p[2], 10) : wordToNumber(p[1]);
        if (n && n > 0 && n <= 90) {
          f.plazoDias = n;
          const habiles = /h[aá]bil/i.test(p[3] || p[2] || '') || /h[aá]bil/i.test(p[0]);
          f.plazoTexto = `${n} ${n === 1 ? 'día' : 'días'}${habiles ? ' hábiles' : ''}`;
          break;
        }
      }
    }

    // cantidad (animales o bienes cerca de un número)
    const tokens = flat.split(/\s+/);
    for (let i = 0; i < tokens.length && !f.cantidad; i++) {
      const t = strip(tokens[i]).replace(/[^a-z]/g, '');
      const animal = ANIMALES.find((a) => a.re.test(t));
      if (!animal) continue;
      // buscar el tipo concreto si dice "cabezas de ganado vacuno"
      let tipo = animal;
      if (tipo.es === 'animales') {
        for (let k = i + 1; k < Math.min(tokens.length, i + 5); k++) {
          const tk = strip(tokens[k]).replace(/[^a-z]/g, '');
          const a2 = ANIMALES.find((a) => a.es !== 'animales' && a.re.test(tk));
          if (a2) { tipo = a2; break; }
        }
      }
      for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
        const raw = tokens[j];
        const paren = raw.match(/\(\s*0*(\d{1,3})\s*\)/);
        const n = paren ? parseInt(paren[1], 10) : wordToNumber(raw);
        if (n !== null && n > 0 && n < 1000) {
          // "CUATRO (04)": si el número en letras y el de cifras no coinciden, mandan las letras,
          // porque el OCR confunde cifras (0 y 6, 1 y 7) con más frecuencia que palabras.
          const anterior = j > 0 ? tokens[j - 1].replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '') : '';
          const enLetras = paren && anterior ? wordToNumber(anterior) : null;
          const value = enLetras && enLetras > 0 ? enLetras : n;
          const desde = enLetras ? j - 1 : j;
          f.cantidad = { n: value, es: value === 1 ? tipo.esUno : tipo.es, qu: tipo.qu, frase: clean(tokens.slice(desde, i + 1).join(' ')) };
          break;
        }
      }
    }

    const valor = flat.match(/S\/\.?\s*([\d.,]+\d)/);
    if (valor) f.valor = 'S/ ' + valor[1];

    f.consecuencia = /conduccion compulsiva|apercibimiento/.test(low);
    f.esDetencion = /orden de (detencion|captura)|detencion preliminar|queda detenid/.test(low);
    f.interpreteNoAsignado = /no\s+requiri\w?\s+(?:de\s+)?(?:un\s+)?(?:la\s+)?(?:presencia\s+de\s+)?interprete|no\s+(?:necesito|solicito)\s+(?:de\s+)?(?:un\s+)?interprete|sin\s+(?:la\s+)?(?:presencia\s+de\s+)?(?:un\s+)?interprete/.test(low);
    f.diceComprenderCastellano = /comprende[r]?\s+(?:el\s+)?(?:idioma\s+)?castellano|domina\s+el\s+castellano/.test(low);
    f.lenguaQuechua = /(?:materna|aterna)\W{0,3}quechua|quechuahablante|quechua hablante|habla quechua|idioma quechua/.test(low);
    f.instruccionBaja = /primaria incompleta|sin instruccion|iletrad|analfabet/.test(low);
    f.mencionaAbogado = /abogado|defensor/.test(low);

    f.alertas = buildAlerts(f);
    return f;
  }

  function buildAlerts(f) {
    const a = [];
    if (f.interpreteNoAsignado || f.diceComprenderCastellano) {
      a.push({
        id: 'interprete',
        nivel: 'alto',
        titulo: 'El acta dice que no necesitas intérprete',
        texto: (f.lenguaQuechua ? 'Tu lengua materna es el quechua. ' : '') +
          'Si no entiendes bien el castellano, tienes derecho a un intérprete antes de firmar.',
        norma: 'const_2_19'
      });
    }
    if (f.plazoTexto) {
      a.push({ id: 'plazo', nivel: 'medio', titulo: `Tienes un plazo de ${f.plazoTexto}`, texto: 'Cuenta los días desde que recibiste el papel.' });
    } else if (f.fechaCita) {
      a.push({ id: 'plazo', nivel: 'medio', titulo: `Debes presentarte el ${f.fechaCita}${f.horaCita ? ' a las ' + f.horaCita : ''}`, texto: 'Anota la fecha y la hora.' });
    }
    if (f.consecuencia) {
      a.push({ id: 'consecuencia', nivel: 'medio', titulo: 'Si no vas, la policía puede llevarte', texto: 'El papel avisa que pueden ordenar tu conducción compulsiva.', norma: 'cpp_66' });
    }
    return a;
  }

  // ---------- explicación ----------
  function explain(f, variant) {
    const nq = (n) => numQu(n, variant);
    const es = [], qu = [], esS = [], quS = [];
    const quien = f.persona ? f.persona.split(' ')[0] : null;
    const ent = f.entidad || null;

    if (f.tipo === 'denuncia') {
      es.push(`Este papel es un acta de denuncia${ent ? ' de la ' + ent : ''}. Aquí la policía escribe lo que tú contaste.`);
      qu.push('Kay papelqa denunciaykim. Kaypi policia qillqan qam willakusqaykita.');
      if (f.cantidad) {
        es.push(`El acta dice que te robaron ${f.cantidad.n} (${numEs(f.cantidad.n)}) ${f.cantidad.es}.`);
        qu.push(`Papelpiqa nin: ${nq(f.cantidad.n)} (${f.cantidad.n}) ${f.cantidad.qu}ykikunata suwarusqankuta.`);
        esS.push(`El papel dice ${f.cantidad.n} ${f.cantidad.es}. Solo ${f.cantidad.n}. Si fueron más o menos, no firmes: pide que lo corrijan.`);
        quS.push(`Uyariy: papelpiqa ${nq(f.cantidad.n)} (${f.cantidad.n}) ${f.cantidad.qu}llam qillqasqa. Manachus chayqa, ama firmaychu.`);
      }
      if (f.valor) es.push(`También dice que los animales valen ${f.valor}.`);
      es.push('Antes de firmar, revisa que los números y los hechos sean los que tú contaste. Puedes pedir una copia del acta. La Fiscalía puede llamarte para que cuentes más.');
      qu.push('Manaraq firmaspayki, qhawariy yupaykuna chiqap kasqanta. Copiata mañakuwaqmi.');
    } else if (f.tipo === 'citacion') {
      es.push(`Este papel es una citación${ent ? ' de la ' + ent : ''}. No es una orden para detenerte.`);
      qu.push('Kay papelqa waqyaymi. Manam carcelman apasunaykipaqchu.');
      if (f.rol === 'testigo') es.push('Te llaman para que cuentes lo que sabes, como testigo.');
      if (f.plazoDias) {
        es.push(`Tienes que ir dentro de ${f.plazoTexto}.`);
        qu.push(`${cap(nq(f.plazoDias))} (${f.plazoDias}) punchaw ukhupim rinayki.`);
        esS.push(`Tienes ${f.plazoDias} días para ir. Nadie te va a detener por este papel.`);
        quS.push(`${cap(nq(f.plazoDias))} (${f.plazoDias}) punchawmi kapusunki rinaykipaq. Ama manchakuychu.`);
      } else if (f.fechaCita) {
        es.push(`Tienes que ir el ${f.fechaCita}${f.horaCita ? ' a las ' + f.horaCita : ''}.`);
        qu.push(`${f.fechaCita} punchawpim rinayki.`);
        esS.push(`Ve el ${f.fechaCita}. Nadie te va a detener por este papel.`);
      }
      if (f.consecuencia) {
        es.push('Si no vas, el fiscal puede ordenar que la policía te lleve.');
        qu.push('Mana rispaykiqa, policiawan pusachisunkiman.');
      }
      es.push('Puedes ir con un abogado defensor gratis del Estado y pedir un intérprete de quechua.');
      qu.push('Abogado defensorta mana qullqiyuqta mañakuwaqmi, hinallataq quechua rimaq yanapaqta.');
    } else if (f.tipo === 'intervencion') {
      es.push(`Este papel es un acta de intervención${ent ? ' de la ' + ent : ''}. Cuenta lo que hizo la policía contigo.`);
      qu.push('Kay papelqa policiapa intervencionninmanta willakun.');
      es.push('Tienes derecho a saber de qué te acusan, a tener un abogado y a no declarar sin él. Puedes pedir un intérprete de quechua.');
      qu.push('Abogadoykita mañakuwaqmi. Mana rimayta munaspaqa, manam rimanaykichu. Intérpreteta mañakuwaqmi.');
      esS.push('No tienes que declarar sin tu abogado. Pide un intérprete.');
    } else {
      es.push(`Este papel es un documento legal${ent ? ' de la ' + ent : ''}.`);
      qu.push('Kay papelqa kamachikuykunamanta willakun.');
    }

    if (f.interpreteNoAsignado || f.diceComprenderCastellano) {
      es.push('Cuidado: el papel dice que entiendes castellano y que no necesitaste intérprete. Si no es así, no firmes y pide un intérprete.');
      qu.push('Papelpiqa nin castellanota intindisqaykita. Mana allinta intindispaqa, ama firmaychu: intérpreteta mañakuy.');
    }
    if (!esS.length) esS.push('Si algo no es verdad o no lo entiendes, no firmes. Pide un intérprete o un defensor gratis.');
    if (!quS.length) quS.push('Mana intindispaykiqa, ama firmaychu. Intérpreteta mañakuy.');

    return {
      es: es.join(' '), qu: qu.join(' '),
      esSimple: esS.join(' '), quSimple: quS.join(' '),
      normas: (KLegal.POR_TIPO[f.tipo] || KLegal.POR_TIPO.otro).slice()
    };
  }
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // ---------- preguntas ----------
  const SI_NO = [{ value: true, label: 'Sí', qu: 'Arí' }, { value: false, label: 'No', qu: 'Manam' }];

  function numberOptions(n, extra) {
    const set = new Set([n]);
    const cands = [n - 1, n + 1, n + 2, n - 2, n + 5, extra].filter((x) => x && x > 0 && x !== n);
    for (const c of cands) { if (set.size >= 3) break; set.add(c); }
    return [...set].sort((a, b) => a - b).map((v) => ({ value: v, label: String(v) }));
  }

  function buildQuestions(f, variant) {
    const nq = (n) => numQu(n, variant);
    const Q = [];
    const qInterprete = {
      id: 'interprete', tipo: 'derecho', modo: 'sino',
      es: '¿Puedes pedir un intérprete de quechua gratis?',
      qu: '¿Intérpreteta mana qullqiyuqta mañakuwaqchu?',
      opciones: SI_NO, esperado: true,
      reEs: 'Sí puedes. La ley te da derecho a usar tu idioma ante cualquier autoridad con un intérprete, sin pagar.',
      reQu: 'Arí, mañakuwaqmi. Ley 29735 nisqanman hinaqa, intérpreteta mana qullqiyuqta mañakuwaqmi.',
      norma: 'const_2_19'
    };
    const qFirmar = {
      id: 'firmar', tipo: 'derecho', modo: 'sino',
      es: '¿Debes firmar si algo de lo que dice no es verdad?',
      qu: '¿Firmanaykichu mana chiqap kaptin?',
      opciones: SI_NO, esperado: false,
      reEs: 'No. Si algo no es verdad o no lo entiendes, no firmes. Pide que lo corrijan o que te expliquen.',
      reQu: 'Manam. Mana chiqap kaptinqa, ama firmaychu.'
    };

    if (f.tipo === 'denuncia' && f.cantidad) {
      const c = f.cantidad;
      Q.push({
        id: 'cantidad_acta', tipo: 'comprension', modo: 'numero',
        es: `¿Cuántas ${c.es} dice el acta que te robaron?`,
        qu: `¿Hayk'a ${c.qu}tataq papelpi nin?`,
        opciones: numberOptions(c.n), esperado: c.n,
        reEs: `Escucha otra vez: el acta dice ${c.n} (${numEs(c.n)}) ${c.es}. Solo ${c.n}.`,
        reQu: `Uyariy: papelpiqa ${nq(c.n)} (${c.n}) ${c.qu}llam nin.`
      });
      Q.push({
        id: 'cantidad_real', tipo: 'veracidad', modo: 'numero',
        es: `Ahora piensa en lo que pasó. ¿Cuántas ${c.es} te robaron de verdad?`,
        qu: `¿Hayk'a ${c.qu}ykikunatataq chiqaptapuni suwarunku?`,
        opciones: Array.from({ length: Math.max(10, c.n + 3) }, (_, i) => ({ value: i + 1, label: String(i + 1) })),
        esperado: c.n, campo: 'cantidad'
      });
      Q.push(qInterprete);
    } else if (f.tipo === 'citacion') {
      if (f.plazoDias) {
        Q.push({
          id: 'plazo', tipo: 'comprension', modo: 'numero',
          es: '¿En cuántos días tienes que ir?',
          qu: '¿Hayk\'a punchaw ukhupitaq rinayki?',
          opciones: numberOptions(f.plazoDias, 30), esperado: f.plazoDias,
          reEs: `Escucha otra vez: tienes ${f.plazoTexto} para ir. ${cap(numEs(f.plazoDias))} días.`,
          reQu: `Uyariy: ${nq(f.plazoDias)} (${f.plazoDias}) punchawmi kapusunki.`
        });
      } else if (f.fechaCita) {
        const otra = f.fechas.find((d) => d !== f.fechaCita);
        Q.push({
          id: 'fecha', tipo: 'comprension', modo: 'opcion',
          es: '¿Qué día tienes que ir?', qu: '¿Ima punchawtaq rinayki?',
          opciones: [{ value: f.fechaCita, label: f.fechaCita }, { value: 'otra', label: otra || 'No dice una fecha' }],
          esperado: f.fechaCita,
          reEs: `Escucha otra vez: tienes que ir el ${f.fechaCita}.`, reQu: `Uyariy: ${f.fechaCita} punchawpim rinayki.`
        });
      }
      Q.push({
        id: 'detencion', tipo: 'comprension', modo: 'sino',
        es: '¿Este papel es una orden para detenerte?',
        qu: '¿Kay papelqa carcelman apasunaykipaqchu?',
        opciones: SI_NO, esperado: !!f.esDetencion,
        reEs: f.esDetencion ? 'Sí: este papel habla de una detención. Pide un abogado ahora.' : 'No. Este papel solo te pide ir a declarar. Nadie te va a detener por él.',
        reQu: f.esDetencion ? 'Arí. Abogadoykita kunanpuni mañakuy.' : 'Manam. Kay papelqa rimanaykipaqllam waqyasunki.'
      });
      Q.push({
        id: 'abogado', tipo: 'derecho', modo: 'sino',
        es: '¿Puedes ir con un abogado gratis del Estado?', qu: '¿Abogadota mana qullqiyuqta mañakuwaqchu?',
        opciones: SI_NO, esperado: true,
        reEs: 'Sí. Si no puedes pagar, la Defensa Pública te da un abogado gratis.',
        reQu: 'Arí. Mana qullqiyki kaptinqa, Estadom abogadota quykusunki.', norma: 'ley_29360'
      });
    } else if (f.tipo === 'intervencion') {
      Q.push({
        id: 'silencio', tipo: 'derecho', modo: 'sino',
        es: '¿Puedes no declarar hasta que llegue tu abogado?', qu: '¿Abogadoyki chayamunankama mana rimayta atinkichu?',
        opciones: SI_NO, esperado: true,
        reEs: 'Sí. Tienes derecho a no declarar y a tener un abogado desde el inicio.',
        reQu: 'Arí. Mana rimayta atinkim, abogadoyki chayamunankama.', norma: 'cpp_71'
      });
      Q.push(qFirmar);
      Q.push(qInterprete);
    } else {
      Q.push(qFirmar);
      Q.push(qInterprete);
      Q.push({
        id: 'abogado', tipo: 'derecho', modo: 'sino',
        es: '¿Puedes pedir un abogado gratis si no tienes dinero?', qu: '¿Abogadota mana qullqiyuqta mañakuwaqchu?',
        opciones: SI_NO, esperado: true,
        reEs: 'Sí. La Defensa Pública del Estado da abogados gratis.', reQu: 'Arí. Estadom abogadota quykusunki.', norma: 'ley_29360'
      });
    }
    return Q.slice(0, 3);
  }

  // ---------- respuestas ----------
  function parseAnswer(q, raw) {
    const t = strip(raw);
    if (q.modo === 'numero') return findNumber(raw);
    if (q.modo === 'sino') {
      if (/\b(no se|no entiendo|no estoy segur|no recuerdo)\b/.test(t)) return null;
      const si = t.search(/\b(si|ari|claro|correcto|puedo|puede|tengo derecho|verdad|asi es)\b/);
      const no = t.search(/\b(no|manam|mana|nunca|falso|jamas)\b/);
      if (si === -1 && no === -1) return null;
      if (si === -1) return false;
      if (no === -1) return true;
      return si < no;
    }
    if (q.modo === 'opcion') {
      const op = q.opciones.find((o) => t.includes(strip(String(o.label)).slice(0, 6)));
      return op ? op.value : null;
    }
    return null;
  }

  function evaluate(q, value) {
    if (value === null || value === undefined) return { estado: 'sin_respuesta' };
    if (q.tipo === 'veracidad') return { estado: value === q.esperado ? 'confirmado' : 'discrepancia' };
    return { estado: value === q.esperado ? 'correcto' : 'incorrecto' };
  }

  // ---------- preguntas libres ----------
  function answerFree(f, text, variant) {
    const t = strip(text);
    const ex = explain(f, variant);
    if (/plazo|cuando|dias|fecha|hora|que dia|hasta/.test(t)) {
      if (f.plazoTexto) return { es: `Tienes ${f.plazoTexto} para presentarte.`, qu: `${cap(numQu(f.plazoDias, variant))} (${f.plazoDias}) punchawmi kapusunki.` };
      if (f.fechaCita) return { es: `Debes ir el ${f.fechaCita}${f.horaCita ? ' a las ' + f.horaCita : ''}.`, qu: `${f.fechaCita} punchawpim rinayki.` };
      return { es: 'El documento no dice un plazo ni una fecha para presentarte.', qu: 'Papelpiqa manam punchawta ninchu.' };
    }
    if (/interprete|traductor|quechua|idioma|castellano/.test(t)) {
      return { es: 'Sí, tienes derecho a un intérprete de quechua gratis ante cualquier autoridad. Pídelo antes de firmar.', qu: 'Arí, intérpreteta mana qullqiyuqta mañakuwaqmi. Manaraq firmaspa mañakuy.', norma: 'const_2_19' };
    }
    if (/abogado|defensor|dinero|pagar|gratis|plata/.test(t)) {
      return { es: 'Si no puedes pagar un abogado, la Defensa Pública del Ministerio de Justicia te da uno gratis.', qu: 'Mana qullqiyki kaptinqa, Estadom abogadota quykusunki.', norma: 'ley_29360' };
    }
    if (/deten|carcel|preso|captura|llevar|policia me/.test(t)) {
      if (f.tipo === 'citacion') return { es: f.consecuencia ? 'Este papel no es una orden de detención. Pero si no vas, el fiscal puede ordenar que la policía te lleve a declarar.' : 'Este papel no es una orden de detención. Solo te piden ir a declarar.', qu: 'Kay papelqa manam carcelman apasunaykipaqchu.', norma: f.consecuencia ? 'cpp_66' : null };
      return { es: 'Si te detienen, tienes derecho a saber por qué, a un abogado y a no declarar sin él.', qu: 'Abogadoykita mañakuy. Mana rimayta atinkim.', norma: 'cpp_71' };
    }
    if (/firm|huella/.test(t)) {
      return { es: 'Firma solo si todo lo que dice es verdad y lo entendiste. Si no, pide que lo corrijan o pide un intérprete.', qu: 'Chiqap kaptinlla, intindispaykilla firmay.' };
    }
    if (/cuant|vacas|animales|numero|robaron/.test(t)) {
      if (f.cantidad) return { es: `El acta dice ${f.cantidad.n} (${numEs(f.cantidad.n)}) ${f.cantidad.es}. Si fueron otra cantidad, no firmes y pide que lo corrijan.`, qu: `Papelpiqa ${numQu(f.cantidad.n, variant)} (${f.cantidad.n}) ${f.cantidad.qu}tam nin.` };
      return { es: 'El documento no menciona una cantidad.', qu: 'Papelpiqa manam yupayta ninchu.' };
    }
    if (/copia/.test(t)) return { es: 'Sí, puedes pedir una copia del acta. Guárdala.', qu: 'Arí, copiata mañakuwaqmi.' };
    if (/que es|que dice|significa|no entiendo|explica/.test(t)) return { es: ex.esSimple, qu: ex.quSimple };
    return { es: 'No encontré eso en el documento. Si tienes dudas, no firmes todavía: pide un intérprete o un defensor público.', qu: 'Mana intindispaykiqa, ama firmaychu. Intérpreteta mañakuy.' };
  }

  // Une los datos de la lectura local con los que devuelva Gemini (los locales mandan si existen)
  function mergeFacts(local, llm) {
    if (!llm) return local;
    const f = Object.assign({}, local);
    const tipos = ['denuncia', 'citacion', 'intervencion', 'notificacion', 'otro'];
    if (f.tipo === 'otro' && tipos.includes(llm.tipo)) f.tipo = llm.tipo;
    f.entidad = f.entidad || llm.entidad || null;
    f.numero = f.numero || llm.numero || null;
    f.persona = f.persona || llm.persona || null;
    if (!f.cantidad && llm.cantidad && Number.isInteger(llm.cantidad.numero) && llm.cantidad.numero > 0) {
      const a = ANIMALES.find((x) => x.re.test(strip(llm.cantidad.objeto || ''))) || ANIMALES[ANIMALES.length - 1];
      f.cantidad = { n: llm.cantidad.numero, es: a.es, qu: a.qu, frase: llm.cantidad.objeto };
    }
    if (!f.plazoDias && Number.isInteger(llm.plazoDias) && llm.plazoDias > 0) { f.plazoDias = llm.plazoDias; f.plazoTexto = `${llm.plazoDias} días`; }
    f.fechaCita = f.fechaCita || llm.fechaCita || null;
    f.interpreteNoAsignado = f.interpreteNoAsignado || !!llm.interpreteNoAsignado;
    f.consecuencia = f.consecuencia || !!llm.consecuencia;
    f.alertas = buildAlerts(f);
    return f;
  }

  const TIPO_NOMBRE = {
    denuncia: 'Acta de denuncia', citacion: 'Citación', intervencion: 'Acta de intervención',
    notificacion: 'Notificación', otro: 'Documento legal'
  };

  const api = { extract, explain, buildQuestions, parseAnswer, evaluate, answerFree, mergeFacts, numEs, numQu, findNumber, TIPO_NOMBRE, strip };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
