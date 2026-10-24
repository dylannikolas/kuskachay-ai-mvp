/*
 * Base legal local de Kuskachay AI.
 *
 * Cada explicación solo puede citar normas de esta lista (también cuando responde Gemini).
 * Los textos están PARAFRASEADOS en lenguaje claro: antes de un uso real, un abogado
 * debe revisarlos contra el texto oficial publicado en El Peruano / SPIJ.
 */
(function (root) {
  const NORMAS = {
    const_2_19: {
      corto: 'Constitución, art. 2 inc. 19',
      titulo: 'Constitución Política del Perú, artículo 2, inciso 19',
      texto: 'Toda persona tiene derecho a su identidad étnica y cultural. Todo peruano tiene derecho a usar su propio idioma ante cualquier autoridad mediante un intérprete.'
    },
    ley_29735: {
      corto: 'Ley 29735, art. 4',
      titulo: 'Ley N.° 29735, Ley de lenguas originarias, artículo 4',
      texto: 'Reconoce el derecho de toda persona a usar su lengua originaria en el ámbito público y a contar con traductores o intérpretes cuando lo necesite.'
    },
    cpp_114: {
      corto: 'Código Procesal Penal, art. 114',
      titulo: 'Código Procesal Penal, artículo 114 (idioma)',
      texto: 'Las actuaciones procesales se hacen en castellano. Cuando una persona no lo comprende o no se expresa con facilidad, debe contar con un traductor o intérprete.'
    },
    cpp_71: {
      corto: 'Código Procesal Penal, art. 71',
      titulo: 'Código Procesal Penal, artículo 71 (derechos del imputado)',
      texto: 'La persona investigada tiene derecho a conocer de qué se le acusa, a ser asistida por un abogado defensor desde el inicio y a no declarar si no lo desea.'
    },
    cpp_95: {
      corto: 'Código Procesal Penal, art. 95',
      titulo: 'Código Procesal Penal, artículo 95 (derechos del agraviado)',
      texto: 'La víctima tiene derecho a ser informada de lo que se hace con su denuncia y de los resultados del proceso, y a ser escuchada.'
    },
    cpp_66: {
      corto: 'Código Procesal Penal, art. 66',
      titulo: 'Código Procesal Penal, artículo 66 (poder coercitivo)',
      texto: 'Si una persona citada correctamente no se presenta, el fiscal puede ordenar que la policía la lleve a declarar (conducción compulsiva).'
    },
    cp_189a: {
      corto: 'Código Penal, art. 189-A',
      titulo: 'Código Penal, artículo 189-A (abigeato)',
      texto: 'Sanciona a quien se apodera de ganado ajeno (vacunos, ovinos, equinos, caprinos, porcinos o camélidos sudamericanos).'
    },
    ley_29360: {
      corto: 'Ley 29360 (Defensa Pública)',
      titulo: 'Ley N.° 29360, Ley del Servicio de Defensa Pública',
      texto: 'El Estado brinda defensa legal gratuita a las personas que no pueden pagar un abogado.'
    }
  };

  const POR_TIPO = {
    denuncia: ['const_2_19', 'ley_29735', 'cpp_95', 'cp_189a'],
    citacion: ['const_2_19', 'ley_29735', 'cpp_66', 'ley_29360'],
    intervencion: ['const_2_19', 'cpp_71', 'cpp_114', 'ley_29360'],
    notificacion: ['const_2_19', 'ley_29735', 'ley_29360'],
    otro: ['const_2_19', 'ley_29735']
  };

  const api = { NORMAS, POR_TIPO };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KLegal = api;
})(typeof window !== 'undefined' ? window : globalThis);
