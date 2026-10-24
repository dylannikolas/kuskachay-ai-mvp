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

## 💡 Nuestra Solución y Diferencial Clave

### 1. El "Sello de Comprensión" (Diferenciador Imbatible)
No nos limitamos a transcribir o traducir:
1. **Lectura Multimodal:** El ciudadano o funcionario fotografía el documento oficial (acta, citación).
2. **Explicación por Voz en Lenguaje Claro:** Mediante modelos multimodales y RAG normativo, la IA sintetiza los hechos y derechos en quechua adaptado a la variante regional del usuario.
3. **Verificación Activa:** El sistema formula de 2 a 3 preguntas de control por voz. Si detecta discrepancias (ej. el acta policial registra 4 animales robados pero el comunero declara 5), bloquea la firma y exige corrección inmediata.
4. **Constancia Bilingüe con Trazabilidad:** Genera una constancia digital en PDF con sello de tiempo, preguntas auditables y citas legales de respaldo, protegiendo tanto al ciudadano como al funcionario público contra futuras nulidades.

### 2. Modelo B2G / SaaS Institucional
* **Gratuito para el ciudadano:** Acceso directo desde web móvil ligera o bots conversacionales.
* **Plataforma para el Estado (PNP, Fiscalía, MinJus, Poder Judicial):** Panel analítico centralizado con métricas de comprensión, tasas de discrepancia corregida, alertas de vulnerabilidad y ahorro estimado por reducción de actos nulos.

---

## 🛠️ Arquitectura Técnica

* **Frontend:** PWA interactiva ultra ligera desarrollada con HTML5, Tailwind CSS y Vanilla JS para garantizar compatibilidad con dispositivos de gama de entrada sin consumo elevado de datos móviles.
* **Procesamiento Multimodal (Visión + LLM):** Pipeline para extracción OCR de actas estructuradas y traducción jurídica contextualmente adaptada al quechua (variantes Chanka y Collao).
* **Voz & Accesibilidad:** Integración con Web Speech API y modelos de síntesis de voz locales/cloud optimizados para hablantes con bajo nivel de lectoescritura.
* **RAG Legal (Normas Peruanas):** Indexación de normas clave:
  * Constitución Política del Perú (Art. 2, inc. 19).
  * Ley N° 29735 (Uso, preservación y recuperación de lenguas originarias).
  * Código Procesal Penal (Derechos del imputado y la víctima).
* **Despliegue:** Integración continua y entrega continua (CI/CD) alojada en **Vercel Edge Network**.

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
