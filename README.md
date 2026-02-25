# Save the date — mini sitio

Mini sitio estático de **“save the date”** para boda. Es una única página en HTML, CSS y JavaScript pensada para compartirse fácilmente por WhatsApp, email o redes (enviando solo el enlace).

## Estructura

- `index.html`: contenido de la página.
- `styles.css`: estilos y diseño (paleta, tipografías, layout).
- `script.js`: lógica del contador regresivo.

No hay dependencias ni build: solo son archivos estáticos.

## Cómo personalizar

Abre `index.html` y busca:

- **Nombres**  
  - Dentro del `header`:
    - `Sebas &amp; Cami` en el título principal.
  - En el `footer`:
    - `Sebas &amp; Cami` en el texto final.  
  Sustituye esos textos por los nombres tal como quieres que aparezcan.

- **Fecha y ciudad**  
  En la sección de fecha:

  ```html
  <span class="date-day">Sábado</span>
  <span class="date-number">21</span>
  <span class="date-month-year">noviembre 2026</span>
  <p class="date-city">Ciudad / País</p>
  ```

  Cambia el día de la semana, número, mes/año y ciudad/país según corresponda.

- **Mensaje**  
  En la sección `Con cariño`, adapta los párrafos a tu propio texto manteniendo la idea de que los invitados **reserven la fecha**.

- **Texto de invitados (evento pequeño y personal)**  
  Hay una línea con el id `invitee-line` que el JavaScript sobrescribe según la URL. El texto por defecto dice que es un evento pequeño y muy personal y que la invitación es intransferible.

  Si quieres cambiar el tono, edita el contenido de ese `<p>` en `index.html` o ajusta el mensaje directamente en `script.js`.

### Invitados según la URL

El sitio personaliza el mensaje de a quién va dirigida la invitación leyendo el último segmento de la URL.

- Ejemplos:
  - `https://misavethedate.com/` → mensaje genérico: “Esta invitación es para ti…”
  - `https://misavethedate.com/Pablo` → “Esta invitación es solo para Pablo… no es transferible ni extensible a más personas.”
  - `https://misavethedate.com/Pablo+Dani` → “Esta invitación es para Pablo y Dani…”

Reglas:

- El código toma el último segmento de la ruta (`window.location.pathname`), lo parte por `+` y usa esos trozos como nombres.
- Puedes usar `%20` o `-` para espacios, por ejemplo:
  - `/Juan-Perez` o `/Juan%20Perez`
  - `/Pablo+Dani` para dos personas.

Esto funciona muy bien si publicas el sitio en un dominio raíz (`https://misavethedate.com`).  
Si usas un subpath (por ejemplo GitHub Pages `https://usuario.github.io/save-the-date/`), el último segmento se usará como nombres:

- `https://usuario.github.io/save-the-date/` → genérico.
- `https://usuario.github.io/save-the-date/Pablo+Dani` → personalizado.

### Contador regresivo

El contador usa un atributo en el HTML:

```html
<div
  class="countdown"
  id="countdown"
  data-target-date="2026-11-21T17:00:00"
>
  ...
</div>
```

- Cambia el valor de `data-target-date` por la fecha y hora de tu boda en formato ISO:
  - `AAAA-MM-DDTHH:MM:SS`
  - Ejemplo: `2026-04-18T16:30:00`

El script (`script.js`) leerá automáticamente este valor y actualizará el contador.

### Colores y tipografías

En `styles.css` puedes ajustar la paleta y fuentes modificando las variables al inicio:

```css
:root {
  --color-bg: #faf7f4;
  --color-bg-alt: #ffffff;
  --color-accent: #e4bdb6;
  --color-text-main: #2f2a28;
  --color-text-soft: #6b615b;
  /* ... */
}
```

- Cambia `--color-accent` para probar otros tonos (por ejemplo, un verde, azul, etc.).
- Si quieres usar otras tipografías, cambia los `link` de Google Fonts en `index.html` y las variables `--font-heading` y `--font-body` en `styles.css`.

## Cómo ver el sitio en local

La forma más simple:

1. Abre la carpeta del proyecto.
2. Haz doble clic en `index.html` para abrirlo en tu navegador.

O, si usas un servidor local (por ejemplo con VS Code Live Server), apunta a `index.html`.

## Cómo publicarlo (enviar el link a tus invitados)

Puedes usar cualquier hosting estático. Tres opciones muy sencillas:

### 1. GitHub Pages

1. Crea un repositorio nuevo en GitHub.
2. Sube los archivos (`index.html`, `styles.css`, `script.js`, `README.md`).
3. En GitHub, ve a **Settings → Pages**.
4. En “Branch”, selecciona `main` y la carpeta `/root`, guarda.
5. GitHub generará una URL del tipo:
   - `https://tu-usuario.github.io/nombre-del-repo/`

Ese enlace es el que puedes compartir.

### 2. Netlify (muy simple, con arrastrar y soltar)

1. Ve a `https://app.netlify.com/` y crea una cuenta (o usa GitHub login).
2. En el panel, usa la opción **“Deploy site” → “Drag and drop your site folder”**.
3. Arrastra la carpeta del proyecto (con `index.html` dentro).
4. Netlify publicará tu sitio y te dará una URL como:
   - `https://nombre-aleatorio.netlify.app`
5. Puedes cambiar el nombre del sitio desde la configuración de Netlify si quieres algo más personalizado.

### 3. Vercel

1. Ve a `https://vercel.com/` y crea cuenta (puede ser con GitHub).
2. Crea un nuevo proyecto desde el repositorio de GitHub donde tengas este código **o** usa la opción de subir un proyecto estático.
3. Vercel generará una URL:
   - `https://nombre-del-proyecto.vercel.app`

## Siguiente paso

1. Personaliza nombres, fecha, ciudad y textos.
2. Revisa que el contador muestre el tiempo correcto.
3. Prueba el enlace en uno o dos móviles.
4. Cuando te guste cómo se ve, ¡envía el link a tus invitados!

