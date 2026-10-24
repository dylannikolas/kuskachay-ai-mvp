# ⚖️ Kuskachay AI — Asistente Legal Bilingüe con Sello de Comprensión en Quechua

> *"Nadie firma lo que no entiende. Hoy el sistema asume que entendiste; nosotros lo comprobamos."*

[![Vercel Deployment](https://img.shields.io/badge/Vercel-Deployed-success?logo=vercel)](https://finanzas-unt.vercel.app/)
[![Hackathon](https://img.shields.io/badge/Hackathon-futurX%202026-blueviolet)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 📌 Visión General

**Kuskachay AI** es una plataforma GovTech impulsada por Inteligencia Artificial multimodal diseñada para garantizar el debido proceso, la defensa efectiva y los derechos lingüísticos de más de 3.7 millones de quechuahablantes en el Perú.

A diferencia de los traductores genéricos, **Kuskachay AI** opera en el momento más crítico: **antes de la firma de un acta policial, notificación fiscal o citación judicial**. El sistema no solo traduce normas y actas a través de visión artificial y voz, sino que introduce un **"Sello de Comprensión"**: verifica mediante preguntas interactivas por voz si la persona realmente comprendió sus derechos y los hechos denunciados antes de estampar su firma o huella, emitiendo una constancia con validez probatoria institucional.

---

## 🚨 El Problema Social

* **Barrera Idiomática Crítica:** Millones de ciudadanos quechuahablantes enfrentan diligencias legales, policiales y administrativas en un idioma que no dominan plenamente.
* **Escasez de Intérpretes Acreditados:** Existen menos de 600 intérpretes oficiales certificados en el Registro Nacional de Intérpretes y Traductores (ReNIT) para atender a todo el país.
* **Actas Nulas y Costos Procesales:** La firma de documentos sin comprensión real vulnera el debido proceso (Art. 2 inc. 19 de la Constitución y Ley 29735), generando miles de audiencias suspendidas, nulidades procesales y un costo millonario anual para el Estado peruano.

---

## 🌟 Capacidades Multimodales Reales (En el Navegador)

El prototipo ha sido potenciado para operar con capacidades multimodales reales ejecutadas directamente desde el navegador, sin depender de servidores complejos que puedan fallar en vivo:

### 🎙️ 1. Comunicación por Micrófono en Vivo (Voz a Texto + Detección de Intención)
* Integra la API nativa de reconocimiento de voz del navegador (`SpeechRecognition`) con un botón de micrófono pulsante.
* El usuario puede hablar directamente al micrófono (por ejemplo: *"No entiendo qué significa esto, explícame más fácil"* o *"Me robaron 5 vacas, no 4"*).
* El asistente detecta automáticamente la discrepancia o re-explica el contenido con un vocabulario más sencillo y accesible.
* Incluye botones de acceso rápido debajo del micrófono para simular la entrada de voz con un solo clic durante demostraciones en vivo o streaming.

### 📸 2. Subida y Lectura Real de Fotografías / Imágenes Judiciales (OCR + Visión)
* Permite tomar fotos con la cámara o subir cualquier imagen (`.jpg`, `.png`) de un acta, notificación o documento judicial.
* Muestra la vista previa del documento y utiliza **Tesseract.js** (OCR 100% en el navegador) o integración opcional con **Gemini 1.5 Flash Vision** mediante API Key.
* Extrae el contenido, clasifica el tipo de documento y lo traduce/explica en la variante quechua seleccionada (**Chanka**, **Collao** o **Áncash**) y en castellano sencillo.

### 📄 3. Recepción y Lectura Real de Documentos PDF, Word (.DOCX) y .TXT
* **PDF.js (Mozilla):** Extrae texto real de archivos PDF cargados en vivo.
* **Mammoth.js:** Procesa y lee documentos de Microsoft Word (`.docx`) al instante.
* **Editor interactivo en vivo:** El área de texto extraído es completamente editable para pruebas en vivo con párrafos judiciales específicos solicitados por jurados.

### 🔊 4. Lectura en Voz Alta (TTS) y Re-explicación Adaptativa ("Sello de Comprensión")
* Síntesis de voz en Quechua y Castellano con animación dinámica de ondas sonoras (con soporte para cargar audios `.mp3` de hablantes nativos).
* Botón **"No entendí bien: Re-explicar con ejemplos sencillos"** para simplificar terminología jurídica a un lenguaje comunitario comprensible.
* **Validación de Discrepancias:** Bloquea la firma si los hechos declarados no concuerdan con el acta (ej. caso de las 4 vs. 5 vacas de Don Julián).
* **Exportación Institucional:** Genera en PDF imprimible tanto la **Constancia Bilingüe con Sello de Comprensión** como la **Solicitud de Intérprete Oficial** respaldada en la Ley N° 29735.

---

## 💡 Nuestra Solución y Diferencial Clave

### 1. El "Sello de Comprensión" (Diferenciador Imbatible)
1. **Lectura Multimodal:** El ciudadano o funcionario fotografía o sube el documento oficial (acta, citación, PDF, Word).
2. **Explicación por Voz en Lenguaje Claro:** La IA sintetiza los hechos y derechos en quechua adaptado a la variante regional del usuario.
3. **Verificación Activa:** Formula preguntas de control por voz. Si detecta discrepancias, bloquea la firma y exige corrección inmediata.
4. **Constancia Bilingüe con Trazabilidad:** Genera una constancia digital en PDF con sello de tiempo, preguntas auditables y citas legales de respaldo, protegiendo tanto al ciudadano como al funcionario público contra futuras nulidades.

### 2. Modelo B2G / SaaS Institucional
* **Gratuito para el ciudadano:** Acceso directo desde web móvil ligera o bots conversacionales.
* **Plataforma para el Estado (PNP, Fiscalía, MinJus, Poder Judicial):** Panel analítico centralizado con métricas de comprensión, tasas de discrepancia corregida, alertas de vulnerabilidad y ahorro estimado por reducción de actos nulos.

---

## 🛠️ Arquitectura Técnica

* **Frontend:** PWA interactiva ultra ligera desarrollada con HTML5, Tailwind CSS y Vanilla JS.
* **Librerías del Cliente:**
  * **Tesseract.js:** OCR local en navegador para fotos de actas.
  * **PDF.js (Mozilla):** Renderizado y extracción de texto de PDFs.
  * **Mammoth.js:** Lectura cliente de documentos Word (.docx).
  * **Web Speech API:** Speech-to-Text y Text-to-Speech multilingüe.
  * **Google Gemini 1.5 Flash Vision (Opcional):** Procesamiento de imágenes y análisis multimodal avanzado.
* **RAG Legal (Normas Peruanas):**
  * Constitución Política del Perú (Art. 2, inc. 19).
  * Ley N° 29735 (Uso, preservación y recuperación de lenguas originarias).
  * Código Procesal Penal (Derechos del imputado y la víctima).
* **Despliegue:** Alojado en **Vercel Edge Network**.

---

## 🚀 Despliegue y Ejecución Local

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/dylannikolas/kuskachay-ai-mvp.git
   cd kuskachay-ai-mvp
   ```

2. **Ejecución Local:**
   - Abre `index.html` directamente en tu navegador web.
   - O inicia un servidor estático local:
     ```bash
     npx serve .
     # o con Python
     python -m http.server 3000
     ```

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT.
