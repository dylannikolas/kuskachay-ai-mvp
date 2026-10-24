# Kuskachay — Entiende antes de firmar

> *"Nadie firma lo que no entiende. Hoy el sistema asume que entendiste; nosotros lo comprobamos."*

Kuskachay es una app web para personas quechuahablantes que reciben un documento legal en castellano
(un acta policial, una citación fiscal, una notificación). La app lee el documento, lo explica en quechua
y en castellano sencillo, y **comprueba con preguntas que la persona lo entendió antes de firmar**.
Si algo no coincide con lo que la persona declaró, bloquea la firma y pide corregir el acta.
Al final genera una constancia en PDF que sirve como evidencia complementaria para la institución.

*Kuskachay* significa "igualar, emparejar" en quechua.

---

## Qué hace

1. **Adaptación en el primer uso.** La persona elige su variante de quechua (chanka, collao o de Áncash)
   y si prefiere escuchar o leer. Se guarda en el teléfono.
2. **Lectura del documento.** Foto con la cámara, PDF, Word (.docx) o texto.
   - Fotos: reconocimiento de texto (OCR) en el navegador con Tesseract.js.
   - PDF: PDF.js. Si el PDF es escaneado, se lee con OCR.
   - Word: Mammoth.js.
   - Si la foto se lee mal, el texto se puede corregir y volver a analizar.
3. **Datos importantes y alertas.** Tipo de documento, entidad, número, persona, cantidades, plazos, fecha de
   citación y advertencias como *"el acta dice que no requirió intérprete"*.
4. **Explicación** en quechua y castellano sencillo, con audio y con las normas que protegen a la persona.
   Cada norma se abre en lenguaje claro.
5. **Sello de comprensión.** Hasta 3 preguntas generadas **a partir del documento leído**
   (por ejemplo, "¿Cuántas vacas dice el acta?" y "¿Cuántas te robaron de verdad?").
   Se responde tocando, hablando o escribiendo, y la app evalúa la respuesta:
   - Respuesta incorrecta: se explica de otra forma (máximo 2 repasos).
   - Tras 2 repasos sin comprensión: se deriva a intérprete o defensor público.
   - Si lo que declara la persona no coincide con el acta: **"No firmes todavía"**, con una pantalla
     para mostrar al funcionario y la confirmación de la corrección.
6. **Constancia en PDF** con lo explicado, cada pregunta y respuesta (y si fue por voz, toque o texto),
   repasos, diferencias detectadas, correcciones, quién corrigió y una huella SHA-256 del registro.
7. **Solicitud de intérprete y defensa pública** en PDF, rellenada con los datos del documento.
8. **Preguntas libres** sobre el documento o los derechos de la persona ("¿me pueden llevar presa?").
9. **Mis documentos:** historial con las constancias, que se pueden volver a descargar.
10. **Panel institucional** (`#panel`): indicadores calculados con los registros reales del dispositivo
    y exportación a CSV.

## Voz en quechua

Los navegadores no traen una voz en quechua: la voz del teléfono lee el texto con pronunciación castellana.
Para la demo, en **Ajustes › Grabar voz en quechua** un hablante nativo puede grabar cada frase
(la explicación, las preguntas, los repasos y las frases fijas) o subir un MP3.
Desde ese momento la app reproduce la voz grabada en lugar de la sintética.
Las grabaciones se guardan solo en ese navegador (IndexedDB).

## Gemini (opcional)

Sin clave, todo funciona en el teléfono y el documento no sale del dispositivo.
Con una clave de API de Gemini (en **Ajustes**), la app usa Gemini para leer fotos difíciles,
completar los datos y redactar la explicación. Las normas que cite Gemini se filtran contra la base
legal local (`js/legal.js`): no puede citar una norma que no esté ahí. Las preguntas de comprensión y su
evaluación siempre las hace el motor local, para que sean auditables.

El modelo por defecto es `gemini-flash-latest` y se puede cambiar en Ajustes.

## Estructura

```
index.html        estructura e íconos
css/app.css       estilos (Atkinson Hyperlegible, paleta índigo / maíz / grana / qocha)
js/legal.js       base legal local, en lenguaje claro
js/engine.js      motor sin conexión: extracción de datos, explicación, preguntas y evaluación
js/app.js         pantallas, voz, lectura de archivos, grabaciones, PDF, historial y panel
favicon.svg       ícono
```

Las librerías externas (PDF.js, Mammoth, Tesseract.js, pdf-lib) se cargan desde CDN solo cuando se necesitan.

## Ejecutar en local

```bash
git clone https://github.com/dylannikolas/kuskachay-ai-mvp.git
cd kuskachay-ai-mvp
python3 -m http.server 3000
# abrir http://localhost:3000
```

El micrófono y la cámara solo funcionan en `https://` o en `localhost`.
En Vercel se publica como sitio estático, sin configuración.

## Límites conocidos (antes de usarlo con personas reales)

- **Las frases en quechua son plantillas cortas y deben validarse con hablantes nativos de cada variante.**
  Los números cambian por variante (por ejemplo, 4 es *tawa* en chanka y collao, y *chusku* en Áncash).
- **Los textos legales de `js/legal.js` están resumidos** y deben revisarse con un abogado contra el texto oficial.
- El motor local reconoce actas de denuncia, citaciones, actas de intervención y notificaciones con
  formatos comunes. Documentos muy distintos dan explicaciones más generales (con Gemini mejora).
- El reconocimiento de voz usa el del navegador en castellano (Chrome o Edge); entiende números y "sí/no"
  también dichos en quechua (*tawa, pichqa, arí, manam*).
- El historial y el panel usan los datos de ese dispositivo. Un despliegue institucional necesita un
  servidor con registro central.
- La constancia es **evidencia complementaria**: no reemplaza a un intérprete acreditado
  ni es un documento oficial del Estado.

## Licencia

MIT.
