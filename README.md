# Save the Date — Boda Cami & Sebas

Sitio web interactivo y personalizado para el **"Save the Date"** de nuestra boda. Diseñado para ser compartido fácilmente y ofrecer una experiencia única a cada invitado.

## ✨ Características Principales

- **Personalización Dinámica:** Saludos y mensajes personalizados mediante parámetros en la URL.
- **Lista de Acceso Cerrada:** Sistema de validación que solo permite ver la invitación completa a los invitados confirmados en la lista blanca (`whitelist`).
- **Vista Restringida:** Los visitantes que no estén en la lista verán una versión elegante pero limitada (portada oscurecida con mensaje de "Boda Íntima").
- **Reproductor de Música:** Fondo musical interactivo con controles de reproducción y volumen. El reproductor se oculta automáticamente tras la interacción para no estorbar el diseño.
- **Intro de Bienvenida:** Animación de carga con el logo personalizado que da paso a la invitación.
- **Contador Regresivo:** Visualización en tiempo real de los días, horas, minutos y segundos que faltan para el gran día.
- **Galería de Fotos:** Collage de momentos especiales integrado en el diseño.
- **Optimización de Carga:** Uso de formatos modernos (WebP), carga diferida (lazy loading) y pre-carga de recursos críticos para asegurar una experiencia fluida.

## 📁 Estructura del Proyecto

- `index.html`: Estructura semántica, carga de fuentes y contenedores principales.
- `styles.css`: Sistema de diseño basado en variables, animaciones personalizadas y diseño responsivo premium.
- `script.js`: Lógica de personalización, validación de invitados, contador regresivo y controlador de música.
- `/assets`: Repositorio de imágenes optimizadas (WebP), música (MP3) y el logo oficial.

## 🛠️ Cómo Funciona la Personalización

El sitio utiliza el parámetro `?to=` en la URL para identificar a los invitados.

### Reglas de los Enlaces:
1. **Separador de invitados:** Usa el símbolo `+`.
2. **Espacios en nombres:** Usa espacios normales o `%20`.
3. **Whitelist:** Solo los strings exactos definidos en la constante `ALLOWED_GUESTS` de `script.js` tendrán acceso total.

**Ejemplos de URL:**
- `.../index.html?to=Mami+Papi` -> Saludo: "Mami y Papi".
- `.../index.html?to=Nonita+Tia%20Ana+Valen` -> Saludo: "Nonita, Tia Ana y Valen".

### Comportamiento según el Invitado:
- **Invitado válido:** Se muestra la invitación completa, fotos, mapa, contador y firma con marca de agua.
- **Invitado no válido / Sin parámetro:** Se oscurece la imagen principal y se muestra el mensaje "BODA ÍNTIMA (SOLO CON INVITACIÓN)".

## 🎵 Control de Música

- **Autoplay:** La música intenta reproducirse automáticamente al primer gesto del usuario (scroll o click).
- **Controles:** Ubicados en la esquina inferior derecha. El deslizador de volumen se expande al click y se contrae automáticamente tras 3 segundos de inactividad.

## 🎨 Diseño y Tipografía

- **Fuentes:** 
  - **Ephesis:** Utilizada para los nombres y caligrafía principal.
  - **Montserrat / Playfair Display / Inter / Cormorant Garamond:** Combinación para textos elegantes y legibilidad.
- **Paleta:** Tonos crema, oro y negro con transparencias y desenfoques (*backdrop-filter*).

## 🚀 Publicación y Uso

El sitio es 100% estático. Se puede subir a cualquier servicio como GitHub Pages, Netlify o Vercel simplemente arrastrando la carpeta. Asegúrate de que los archivos en `/assets` mantengan sus nombres originales para que las referencias no se rompan.

---
*Hecho con ❤️ para la boda de Cami & Sebas.*
