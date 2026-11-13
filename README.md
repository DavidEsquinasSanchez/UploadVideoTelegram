# 🚀 TeleVault

> **Gestor integral de subidas multimedia, descargas masivas y organización en canales, grupos y foros de Telegram.**

![Python](https://img.shields.io/badge/Python-3.10%2B-blue?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.104%2B-009688?logo=fastapi&logoColor=white)
![Telethon](https://img.shields.io/badge/Telethon-MTProto-2CA5E0?logo=telegram&logoColor=white)
![Platform](https://img.shields.io/badge/Plataforma-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey)
![License](https://img.shields.io/badge/Licencia-MIT-green)

---

## 📑 Tabla de Contenidos

1. [¿Qué es TeleVault?](#-qué-es-televault)
2. [Características Principales](#-características-principales)
3. [Requisitos Previos](#-requisitos-previos)
4. [Instalación y Puesta en Marcha](#-instalación-y-puesta-en-marcha)
5. [Guía de Configuración Inicial](#-guía-de-configuración-inicial)
6. [Estructura del Proyecto](#-estructura-del-proyecto)
7. [Tecnologías Utilizadas](#-tecnologías-utilizadas)
8. [Roadmap (Próximas Mejoras)](#-roadmap-próximas-mejoras)
9. [Licencia](#-licencia)

---

## 💡 ¿Qué es TeleVault?

**TeleVault** es una aplicación cliente-servidor diseñada para simplificar y automatizar por completo la transferencia de contenido multimedia (series, episodios, películas y vídeos) hacia y desde **Telegram**.

Permite a cualquier usuario transformar Telegram en su propia nube personal organizada, gestionando subidas con control de series y temporadas, creando automáticamente temas en foros de Telegram, y facilitando descargas masivas en paralelo sin lidiar con interfaces complejas.

---

## ✨ Características Principales

* 📤 **Subida Inteligente de Contenido Multimedia:**
  * Organización automatizada por **Series**, **Temporadas** y **Películas**.
  * Renombrado estandarizado y asignación de temas antes de la subida.
  * Selector múltiple de archivos con vista previa en tabla interactiva.

* 💬 **Integración Nativa con Foros y Temas de Telegram:**
  * Detección y creación automática de temas (*topics*) dentro de supergrupos de Telegram.
  * Selección ágil de categorías y destinos de publicación.

* 📥 **Gestor de Descargas Masivas:**
  * Cola de descarga concurrente con seguimiento en tiempo real.
  * Indicadores de porcentaje de progreso, velocidad de transferencia (KB/s y MB/s) y estado por archivo.
  * Descarga directa con soporte para archivos de gran tamaño (hasta 2 GB).

* ⚙️ **Gestión Dinámica de Canales (`channels.json`):**
  * Agrega, oculta o elimina canales y grupos de Telegram desde la propia aplicación sin reiniciar el servidor.
  * **Verificación de permisos en vivo:** TeleVault comprueba que tu bot cuente con permisos de **Administrador** antes de registrar el canal.
  * Persistencia local independiente de las credenciales de código.

* 🔍 **Soporte y Autodetección de Canales Privados:**
  * Solución nativa a las restricciones de Telegram para bots: detecta canales privados mediante actualizaciones recientes (`🔍 Detectar canales del bot`) o mediante enlaces directos a mensajes (`https://t.me/c/...`).

* 🤖 **Asistente de Configuración del Bot Integrado:**
  * Configura o actualiza el **Token de Telegram** (`@BotFather`) y tus claves opcionales `API_ID` / `API_HASH` desde una ventana modal en la propia app.
  * Almacenamiento seguro y local en `backend/config.json`.

* 📖 **Sistema de Guías Interactivas Integrado:**
  * Tutoriales paso a paso desplegables dentro de la app para:
    1. Crear un bot con `@BotFather` y obtener el Token.
    2. Obtener `TG_API_ID` y `TG_API_HASH` en [my.telegram.org](https://my.telegram.org).
    3. Añadir el bot a canales públicos o privados y asignar permisos de Administrador.

* 🌓 **Diseño Moderno y Responsivo:**
  * Tema oscuro estilizado con paneles colapsables.
  * Consola de **Log de Actividad** en vivo para monitorizar todas las operaciones de red.

---

## 📋 Requisitos Previos

* **Python 3.10** o superior instalado en el sistema.
* Un **bot de Telegram** (creado gratuitamente en 2 minutos mediante `@BotFather`).
* Un navegador web moderno (Google Chrome, Microsoft Edge, Mozilla Firefox, Brave, etc.).
* *(Opcional)* Claves personales `API_ID` y `API_HASH` de [my.telegram.org](https://my.telegram.org) para optimizar el ancho de banda.

---

## 🚀 Instalación y Puesta en Marcha

### Opción 1: En Windows con arranque automático (Recomendada)

El proyecto incluye un script inteligente (`iniciar.bat`) que se encarga de todo: crea el entorno virtual, instala las dependencias si faltan, arranca el servidor backend y abre tu navegador web automáticamente.

1. Clona el repositorio o descarga el código fuente:
   ```bash
   git clone https://github.com/DavidEsquinasSanchez/UploadVideoTelegram.git
   cd UploadVideoTelegram
   ```
2. Haz doble clic en el archivo **`iniciar.bat`**.
3. ¡Listo! La aplicación se iniciará automáticamente en `http://127.0.0.1:8000`.

---

### Opción 2: Instalación manual (Windows / Linux / macOS)

1. Clona el repositorio:
   ```bash
   git clone https://github.com/DavidEsquinasSanchez/UploadVideoTelegram.git
   cd UploadVideoTelegram
   ```

2. Crea y activa un entorno virtual de Python:
   * **En Linux / macOS:**
     ```bash
     python3 -m venv .venv
     source .venv/bin/activate
     ```
   * **En Windows (PowerShell / CMD):**
     ```powershell
     python -m venv .venv
     .venv\Scripts\activate
     ```

3. Instala las dependencias necesarias:
   ```bash
   pip install -r backend/requirements.txt
   ```

4. Ejecuta el servidor FastAPI con Uvicorn:
   ```bash
   python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
   ```

5. Abre en tu navegador la URL: **`http://127.0.0.1:8000`**.

---

## 🔧 Guía de Configuración Inicial

Al abrir TeleVault por primera vez, sigue estos sencillos pasos:

1. **Configurar tu Bot de Telegram:**
   * Pulsa en el botón superior **`🤖 Configurar Bot`**.
   * Introduce el **HTTP API Token** obtenido en `@BotFather` (ej: `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ`).
   * *(Opcional)* Despliega las opciones avanzadas para ingresar tu `TG_API_ID` y `TG_API_HASH` de [my.telegram.org](https://my.telegram.org).
   * Pulsa **Guardar y Conectar**.

2. **Añadir el Bot a tus Canales:**
   * Entra en tu canal o grupo de Telegram y añade a tu bot como **Administrador** con permisos para **Publicar mensajes** (y **Gestionar temas** si es un foro).

3. **Vincular Canales en TeleVault:**
   * En la barra lateral izquierda, pulsa el botón de la rueda **`⚙️`** (Gestión de Canales).
   * **Para canales públicos:** Escribe el `@nombre_canal` o su enlace y pulsa **➕ Añadir**.
   * **Para canales privados:** Envía cualquier mensaje de prueba en el canal (ej: *hola*) y pulsa **`🔍 Detectar canales del bot`**; TeleVault lo reconocerá al instante y lo añadirá con 1 clic.

> 💡 **Nota:** Si en cualquier momento tienes dudas, pulsa el botón **`📖 Guía de Uso`** en la cabecera superior para consultar las instrucciones detalladas paso a paso con accesos directos.

---

## 📁 Estructura del Proyecto

```text
UploadVideoTelegram/
├── backend/
│   ├── main.py              # API REST (FastAPI) y cliente Telegram (Telethon & Bot API)
│   ├── requirements.txt     # Dependencias del backend de Python
│   ├── channels.json        # Almacenamiento local de canales registrados (ignorado en git)
│   └── config.json          # Almacenamiento local de configuración del bot (ignorado en git)
├── css/
│   └── styles.css           # Estilos de la aplicación, temas, tablas y modales
├── js/
│   ├── app.js               # Lógica del frontend, subidas, descargas y navegación
│   └── telegram.js          # Capa de comunicación HTTP con los endpoints del backend
├── index.html               # Interfaz gráfica principal de TeleVault
├── iniciar.bat              # Script de inicio rápido de un solo clic para Windows
└── README.md                # Documentación del proyecto
```

---

## 🛠️ Tecnologías Utilizadas

* **Backend:**
  * [Python 3.10+](https://www.python.org/)
  * [FastAPI](https://fastapi.tiangolo.com/) - Framework web moderno, asíncrono y de alto rendimiento.
  * [Uvicorn](https://www.uvicorn.org/) - Servidor ASGI ultrarrápido.
  * [Telethon](https://github.com/LonamiWebs/Telethon) - Cliente nativo MTProto para transferencias masivas y gestión de canales.
  * [Telegram Bot API](https://core.telegram.org/bots/api) - Consultas de metadatos, verificación de miembros y autodetección.

* **Frontend:**
  * HTML5 semántico y CSS3 moderno (Flexbox, CSS Grid, variables CSS para modo oscuro).
  * JavaScript ES6+ modular sin dependencias pesadas ni frameworks de compilación externa.

---

## 🗺️ Roadmap (Próximas Mejoras)

* [ ] Integración con **FFmpeg** para transcodificación automática de vídeos a formatos compatibles antes de la subida.
* [ ] Generación automática de miniaturas (*thumbnails*) personalizadas a partir de fotogramas del vídeo.
* [ ] Planificador (*Scheduler*) de subidas automáticas por fecha y franja horaria.
* [ ] Soporte para pausar y reanudar descargas individuales.
* [ ] Métricas estadísticas de cuota de almacenamiento y ancho de banda transferido.

---

## 📄 Licencia

Este proyecto se distribuye bajo la licencia **MIT**. Consulta el archivo `LICENSE` para más información.
