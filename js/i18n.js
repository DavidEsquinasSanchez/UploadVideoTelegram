// js/i18n.js
// Sistema de Internacionalización (i18n) para TeleVault
// Soporte multilingüe completo: Español (ES) e Inglés (EN)

(function () {
    const STORAGE_KEY = 'televault_lang';

    const translations = {
        es: {
            brand: {
                title: "TeleVault",
                tagline: "Gestor multimedia para Telegram"
            },
            header: {
                toggle_sidebar: "Comprimir/Descomprimir menú lateral",
                expand_sidebar: "Descomprimir menú lateral",
                collapse_sidebar: "Comprimir menú lateral",
                refresh: "Recargar página",
                theme: "Cambiar a modo claro / oscuro",
                theme_light: "Cambiar a modo claro",
                theme_dark: "Cambiar a modo oscuro",
                lang: "Cambiar idioma (ES/EN) · Switch language",
                guide: "Guía de Configuración y Uso",
                about: "Acerca de TeleVault, repositorio y contacto",
                bot_button_title: "Configurar bot de Telegram y ver estado de conexión",
                bot_config: "Configurar Bot",
                bot_checking: "Comprobando...",
                bot_connected: "Conectado",
                bot_not_configured: "Sin configurar",
                bot_error: "Error de conexión",
                shortcuts_hint: "Atajos de teclado: Alt+1 (Subidas), Alt+2 (Descargas), Alt+T (Tema), Alt+L (Idioma), Esc (Cerrar modal)"
            },
            sidebar: {
                title: "Canales",
                refresh_title: "Actualizar lista de canales desde Telegram",
                manage_title: "Gestionar canales",
                collapse_title: "Comprimir menú lateral",
                expand_title: "Descomprimir menú lateral",
                toggle_channel_title: "Haz clic para comprimir o descomprimir este canal",
                search_placeholder: "Buscar por título de vídeo o tema...",
                scanning: "Escaneando canales de Telegram...",
                no_channels: "No hay canales configurados",
                add_channel_btn: "➕ Añadir canal",
                download_all_topic: "Descargar todos los archivos",
                download_video: "Descargar video",
                channel_expand_title: "Haz clic para comprimir o descomprimir este canal"
            },
            tabs: {
                uploads: "Subidas",
                downloads: "Descargas"
            },
            status: {
                uploaded_ok: "Subido OK",
                previously_uploaded: "Subido Previamente",
                pending_upload: "Pendiente Subir",
                cancelled: "Cancelado",
                upload_error: "Error en subida",
                uploading_pct: "Subiendo {pct}%",
                pending: "Pendiente",
                queued: "En cola",
                downloading: "Descargando",
                merging: "Uniendo partes binarias...",
                finished_ok: "Finalizado OK",
                error: "Error"
            },
            uploads: {
                category_label: "Categoría:",
                select_category: "Selecciona Categoria...",
                no_channels_option: "-- No hay canales configurados --",
                subcategory_label: "SubCategoría:",
                select_subcategory: "Selecciona subcategoria",
                new_series: "¿Serie nueva?",
                name_label: "Nombre:",
                season_label: "Temp.:",
                series_placeholder: "Ej: Agata y Lola",
                season_placeholder: "Ej: 1",
                create_topic: "Crear Tema",
                create_topic_title: "Crear nuevo tema en el canal",
                select_videos: "Seleccionar vídeo(s)…",
                upload_content: "Subir Contenido",
                cancel_upload: "Cancelar subida",
                retry: "Reintentar",
                clear_completed: "Limpiar Finalizados OK",
                clear_all: "Vaciar Tabla",
                fill_notice: "Rellena los campos obligatorios para habilitar la selección de archivos.",
                th_original: "Título Original",
                th_transformed: "Título Transformado",
                th_size: "Tamaño",
                th_status: "Estado",
                th_action: "Eliminar",
                th_original_title: "Haz clic para ordenar por título original",
                th_transformed_title: "Haz clic para ordenar por título transformado",
                th_size_title: "Haz clic para ordenar por tamaño",
                empty_title: "No hay vídeos seleccionados para subir",
                empty_desc: "Selecciona la categoría y pulsa 'Seleccionar vídeo(s)…' para añadir archivos a la lista.",
                status_queued: "En cola ⏳",
                status_uploading: "Subiendo a Telegram",
                status_completed: "Completado",
                status_cancelled: "Cancelado",
                status_error: "Error en subida",
                edit_title_tooltip: "Editar título transformado",
                delete_btn_title: "Eliminar archivo de la lista",
                delete_row_tooltip: "Eliminar archivo de la lista",
                part_badge: "Parte {current}/{total}",
                split_badge_tooltip: "Archivo original de {size}. Dividido automáticamente en {parts} partes binarias para cumplir con el límite de Telegram (2 GB).",
                clear_completed_title: "Limpiar de la tabla los archivos finalizados correctamente",
                no_completed_title: "No hay archivos subidos correctamente para limpiar",
                clear_all_title: "Vaciar todos los archivos de la tabla",
                empty_table_title: "La tabla está vacía"
            },
            downloads: {
                download_content: "Descargar contenido",
                cancel_download: "Cancelar descarga",
                cancelling_download: "Cancelando descarga...",
                retry_download: "Reintentar",
                clear_completed: "Limpiar Finalizados",
                hint: "Selecciona vídeos marcando las casillas o añade desde Canales con el icono ⬇️",
                select_all_title: "Marcar / Desmarcar todos",
                th_video_file: "Vídeo / Archivo",
                th_dest_folder: "Carpeta Destino",
                th_status_progress: "Estado / Progreso",
                th_action: "Acción",
                clear_completed_title: "Limpiar descargas completadas",
                empty_title: "No hay descargas en la lista",
                empty_desc: "Haz clic en el icono de descarga junto a cualquier tema o vídeo en el panel lateral para añadirlo a esta lista.",
                uncheck_video: "Desmarcar este vídeo",
                check_video: "Marcar este vídeo para descargar",
                parts_count: "{count} partes",
                parts_tooltip: "Archivo fraccionado en {count} partes binarias en Telegram",
                dest_unassigned: "Se asignará al descargar",
                delete_row_tooltip: "Eliminar archivo de la lista",
                status_pending: "Pendiente",
                status_downloading: "Descargando",
                status_merging: "Uniendo partes binarias...",
                status_done: "Finalizado OK",
                status_cancelled: "Cancelado",
                status_error: "Error",
                remove_download_title: "Quitar de la cola",
                change_folder_title: "Cambiar carpeta de destino para este archivo",
                locked_msg: "Descarga en curso. Al finalizar se volverá a habilitar",
                select_at_least_one: "Selecciona al menos un vídeo de la tabla para descargar",
                cancel_active_title: "Cancelar descarga en curso",
                no_active_title: "No hay ninguna descarga en curso",
                retry_failed_title: "Reintentar descargas fallidas"
            },
            activity: {
                title: "Log de Actividad",
                title_tooltip: "Haz clic para alternar entre mostrar y ocultar el Log de Actividad",
                clear_log: "Limpiar Log"
            },
            modals: {
                close: "Cerrar",
                cancel: "Cancelar",
                yes: "Sí",
                no: "No",
                yes_delete: "Sí, eliminar",
                download_all: "Descargar todos",
                confirm_delete_title: "¿Estás seguro de eliminarlo?",
                confirm_delete_all_title: "¿Estás seguro de eliminar todos los archivos de la tabla?",
                confirm_delete_ok_title: "¿Estás seguro de eliminar los archivos subidos correctamente?",
                confirm_download_topic_title: "¿Deseas descargar todos los vídeos de este tema?",
                confirm_delete_channel_title: "¿Estás seguro de que deseas eliminar este canal?",
                channels: {
                    title: "⚙️ Gestión de Canales",
                    label_add: "Añadir canal o grupo de Telegram:",
                    input_placeholder: "Escribe para buscar o pega enlace (t.me/+...), @usuario o ID",
                    btn_add: "Añadir",
                    btn_add_invalid: "Introduce un canal válido donde el bot sea Administrador",
                    btn_help: "Ayuda",
                    btn_help_title: "Mostrar u ocultar ayuda sobre canales y permisos",
                    btn_detect: "Detectar canales del bot",
                    btn_detect_title: "Detectar canales donde has añadido al bot recientemente",
                    registered_title: "Canales registrados",
                    btn_refresh_title: "Actualizar lista",
                    tutorial_link: "Ver tutorial completo sobre cómo añadir el bot a canales",
                    visible_label: "Visible",
                    hidden_label: "Oculto",
                    show_title: "Haz clic para mostrar en la aplicación",
                    hide_title: "Haz clic para ocultar de la aplicación",
                    delete_title: "Eliminar este canal"
                },
                bot: {
                    title: "🤖 Configuración del Bot de Telegram",
                    desc: "Para que TeleVault pueda conectarse a Telegram y gestionar tus canales, introduce el HTTP API Token de tu bot creado en @BotFather.",
                    step1: "1. Abre Telegram y escribe a @BotFather.",
                    step2: "2. Envía /newbot y elige un nombre y usuario (ej: MiUploader_bot).",
                    step3: "3. Copia el API token recibido y pégalo a continuación:",
                    tutorial_link: "Ver tutorial paso a paso con @BotFather y claves API",
                    token_label: "Token del Bot (HTTP API Token):",
                    token_placeholder: "Ej: 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ",
                    toggle_vis_title: "Mostrar/Ocultar Token",
                    adv_summary: "Opciones avanzadas (API ID / API Hash opcionales)",
                    api_id_label: "TG_API_ID (opcional):",
                    api_id_placeholder: "Predeterminado del sistema",
                    api_hash_label: "TG_API_HASH (opcional):",
                    api_hash_placeholder: "Predeterminado del sistema",
                    btn_save: "Guardar y Conectar"
                },
                guide: {
                    title: "📖 Guía de Configuración y Uso",
                    subtitle: "Aprende paso a paso cómo vincular tu bot, obtener tus claves de Telegram y gestionar tus canales en TeleVault.",
                    item1_title: "Crear un bot con @BotFather en Telegram",
                    item1_desc: "Obtén el Token de acceso obligatorio para que TeleVault funcione",
                    btn_go_bot_config: "Ir a Configurar Bot en TeleVault",
                    btn_shortcut_bot: "Abrir Configuración del Bot",
                    item2_title: "Crear u obtener TG_API_ID y TG_API_HASH en my.telegram.org",
                    item2_desc: "Credenciales de desarrollador MTProto para descargas de alta velocidad",
                    btn_go_adv_bot: "Abrir opciones avanzadas en Configurar Bot",
                    btn_shortcut_api: "Abrir Configuración MTProto",
                    item3_title: "Añadir el bot a canales de Telegram y permisos",
                    item3_desc: "Permisos necesarios para gestionar archivos, temas y vídeos",
                    btn_go_channels: "Abrir Gestión de Canales en TeleVault",
                    btn_shortcut_channels: "Abrir Gestión de Canales",
                    item4_title: "Crear un grupo con temas (Foros) y organización recomendada",
                    item4_desc: "Estructuración óptima de series por temporadas y películas por colecciones",
                    btn_shortcut_topics: "Ir a Gestión de Canales"
                },
                about: {
                    title: "🚀 Acerca de TeleVault",
                    obj_title: "💡 Objetivo del Proyecto",
                    obj_desc: "TeleVault es una herramienta diseñada para simplificar y automatizar por completo la gestión, el fraccionamiento inteligente en partes, la subida y la descarga masiva de contenido multimedia (series, temporadas, películas y vídeos) hacia y desde canales y foros de Telegram. Preserva fielmente la calidad, integridad y extensión original de tus archivos sin coste alguno y con control 100% local.",
                    repo_title: "Repositorio Oficial en GitHub",
                    repo_sub: "Ver código fuente, ramas y novedades del proyecto",
                    contact_note: "Si tienes cualquier duda, sugerencia de mejora, idea o incidencia, puedes contactar libremente por email (nigromante2004@gmail.com) o abrir una propuesta en GitHub."
                }
            }
        },
        en: {
            brand: {
                title: "TeleVault",
                tagline: "Multimedia Manager for Telegram"
            },
            header: {
                toggle_sidebar: "Collapse/Expand sidebar",
                expand_sidebar: "Expand sidebar",
                collapse_sidebar: "Collapse sidebar",
                refresh: "Reload page",
                theme: "Switch light / dark theme",
                theme_light: "Switch to light theme",
                theme_dark: "Switch to dark theme",
                lang: "Switch language (ES/EN)",
                guide: "Setup & User Guide",
                about: "About TeleVault, repository & contact",
                bot_button_title: "Configure Telegram bot and view connection status",
                bot_config: "Configure Bot",
                bot_checking: "Checking...",
                bot_connected: "Connected",
                bot_not_configured: "Not configured",
                bot_error: "Connection error",
                shortcuts_hint: "Keyboard shortcuts: Alt+1 (Uploads), Alt+2 (Downloads), Alt+T (Theme), Alt+L (Language), Esc (Close modal)"
            },
            sidebar: {
                title: "Channels",
                refresh_title: "Refresh channels list from Telegram",
                manage_title: "Manage channels",
                collapse_title: "Collapse sidebar",
                expand_title: "Expand sidebar",
                toggle_channel_title: "Click to collapse or expand this channel",
                search_placeholder: "Search by video title or topic...",
                scanning: "Scanning Telegram channels...",
                no_channels: "No channels configured",
                add_channel_btn: "➕ Add channel",
                download_all_topic: "Download all files",
                download_video: "Download video",
                channel_expand_title: "Click to collapse or expand this channel"
            },
            tabs: {
                uploads: "Uploads",
                downloads: "Downloads"
            },
            status: {
                uploaded_ok: "Uploaded OK",
                previously_uploaded: "Previously Uploaded",
                pending_upload: "Pending Upload",
                cancelled: "Cancelled",
                upload_error: "Upload error",
                uploading_pct: "Uploading {pct}%",
                pending: "Pending",
                queued: "Queued",
                downloading: "Downloading",
                merging: "Merging binary parts...",
                finished_ok: "Finished OK",
                error: "Error"
            },
            uploads: {
                category_label: "Category:",
                select_category: "Select Category...",
                no_channels_option: "-- No channels configured --",
                subcategory_label: "SubCategory:",
                select_subcategory: "Select subcategory",
                new_series: "New series?",
                name_label: "Name:",
                season_label: "Season:",
                series_placeholder: "E.g.: Agatha and Lola",
                season_placeholder: "E.g.: 1",
                create_topic: "Create Topic",
                create_topic_title: "Create new topic in channel",
                select_videos: "Select video(s)…",
                upload_content: "Upload Content",
                cancel_upload: "Cancel upload",
                retry: "Retry",
                clear_completed: "Clear Completed OK",
                clear_all: "Clear Table",
                fill_notice: "Fill in required fields to enable file selection.",
                th_original: "Original Title",
                th_transformed: "Transformed Title",
                th_size: "Size",
                th_status: "Status",
                th_action: "Delete",
                th_original_title: "Click to sort by original title",
                th_transformed_title: "Click to sort by transformed title",
                th_size_title: "Click to sort by size",
                empty_title: "No videos selected for upload",
                empty_desc: "Select a category and click 'Select video(s)…' to add files to the list.",
                status_queued: "Queued ⏳",
                status_uploading: "Uploading to Telegram",
                status_completed: "Completed",
                status_cancelled: "Cancelled",
                status_error: "Upload error",
                edit_title_tooltip: "Edit transformed title",
                delete_btn_title: "Remove file from list",
                delete_row_tooltip: "Remove file from list",
                part_badge: "Part {current}/{total}",
                split_badge_tooltip: "Original file of {size}. Automatically split into {parts} binary parts to comply with Telegram's 2 GB limit.",
                clear_completed_title: "Clear successfully uploaded files from the table",
                no_completed_title: "No successfully uploaded files to clear",
                clear_all_title: "Clear all files from the table",
                empty_table_title: "The table is empty"
            },
            downloads: {
                download_content: "Download content",
                cancel_download: "Cancel download",
                cancelling_download: "Cancelling download...",
                retry_download: "Retry",
                clear_completed: "Clear Finished",
                hint: "Select videos by checking the boxes or add from Channels with the ⬇️ icon",
                select_all_title: "Check / Uncheck all",
                th_video_file: "Video / File",
                th_dest_folder: "Destination Folder",
                th_status_progress: "Status / Progress",
                th_action: "Action",
                clear_completed_title: "Clear completed downloads",
                empty_title: "No downloads in the list",
                empty_desc: "Click the download icon next to any topic or video in the sidebar to add it to this list.",
                uncheck_video: "Uncheck this video",
                check_video: "Check this video to download",
                parts_count: "{count} parts",
                parts_tooltip: "File split into {count} binary parts in Telegram",
                dest_unassigned: "Will be assigned on download",
                delete_row_tooltip: "Remove file from list",
                status_pending: "Pending",
                status_downloading: "Downloading",
                status_merging: "Merging binary parts...",
                status_done: "Finished OK",
                status_cancelled: "Cancelled",
                status_error: "Error",
                remove_download_title: "Remove from queue",
                change_folder_title: "Change destination folder for this file",
                locked_msg: "Download in progress. Will be re-enabled upon completion",
                select_at_least_one: "Select at least one video from the table to download",
                cancel_active_title: "Cancel download in progress",
                no_active_title: "No active download in progress",
                retry_failed_title: "Retry failed downloads"
            },
            activity: {
                title: "Activity Log",
                title_tooltip: "Click to toggle between showing and hiding the Activity Log",
                clear_log: "Clear Log"
            },
            modals: {
                close: "Close",
                cancel: "Cancel",
                yes: "Yes",
                no: "No",
                yes_delete: "Yes, delete",
                download_all: "Download all",
                confirm_delete_title: "Are you sure you want to delete it?",
                confirm_delete_all_title: "Are you sure you want to remove all files from the table?",
                confirm_delete_ok_title: "Are you sure you want to remove successfully uploaded files?",
                confirm_download_topic_title: "Do you want to download all videos from this topic?",
                confirm_delete_channel_title: "Are you sure you want to delete this channel?",
                channels: {
                    title: "⚙️ Channels Management",
                    label_add: "Add Telegram channel or group:",
                    input_placeholder: "Type to search or paste link (t.me/+...), @username or ID",
                    btn_add: "Add",
                    btn_add_invalid: "Enter a valid channel where the bot is Administrator",
                    btn_help: "Help",
                    btn_help_title: "Show or hide help on channels and permissions",
                    btn_detect: "Detect bot channels",
                    btn_detect_title: "Detect channels where you recently added the bot",
                    registered_title: "Registered channels",
                    btn_refresh_title: "Refresh list",
                    tutorial_link: "View full tutorial on adding bot to channels",
                    visible_label: "Visible",
                    hidden_label: "Hidden",
                    show_title: "Click to show in application",
                    hide_title: "Click to hide in application",
                    delete_title: "Delete this channel"
                },
                bot: {
                    title: "🤖 Telegram Bot Setup",
                    desc: "To allow TeleVault to connect to Telegram and manage your channels, enter the HTTP API Token of your bot created in @BotFather.",
                    step1: "1. Open Telegram and message @BotFather.",
                    step2: "2. Send /newbot and choose a name and username (e.g., MyUploader_bot).",
                    step3: "3. Copy the received API token and paste it below:",
                    tutorial_link: "View step-by-step tutorial with @BotFather and API keys",
                    token_label: "Bot Token (HTTP API Token):",
                    token_placeholder: "E.g.: 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ",
                    toggle_vis_title: "Show/Hide Token",
                    adv_summary: "Advanced options (optional API ID / API Hash)",
                    api_id_label: "TG_API_ID (optional):",
                    api_id_placeholder: "System default",
                    api_hash_label: "TG_API_HASH (optional):",
                    api_hash_placeholder: "System default",
                    btn_save: "Save & Connect"
                },
                guide: {
                    title: "📖 Setup & User Guide",
                    subtitle: "Learn step-by-step how to link your bot, get your Telegram keys, and manage channels in TeleVault.",
                    item1_title: "Create a bot with @BotFather in Telegram",
                    item1_desc: "Obtain the required access Token for TeleVault to operate",
                    btn_go_bot_config: "Go to Configure Bot in TeleVault",
                    btn_shortcut_bot: "Open Bot Settings",
                    item2_title: "Create or get TG_API_ID and TG_API_HASH on my.telegram.org",
                    item2_desc: "MTProto developer credentials for high-speed downloads",
                    btn_go_adv_bot: "Open advanced options in Configure Bot",
                    btn_shortcut_api: "Open MTProto Settings",
                    item3_title: "Add bot to Telegram channels and permissions",
                    item3_desc: "Required permissions to manage files, topics, and videos",
                    btn_go_channels: "Open Channels Management in TeleVault",
                    btn_shortcut_channels: "Open Channels Management",
                    item4_title: "Create a group with topics (Forums) and recommended organization",
                    item4_desc: "Optimal organization of series by seasons and movies by collections",
                    btn_shortcut_topics: "Go to Channels Management"
                },
                about: {
                    title: "🚀 About TeleVault",
                    obj_title: "💡 Project Goal",
                    obj_desc: "TeleVault is a tool designed to simplify and fully automate the management, intelligent part-splitting, bulk upload, and mass download of multimedia content to and from Telegram channels and forums. It faithfully preserves the original quality, integrity, and extension of your files with 100% local control at no cost.",
                    repo_title: "Official GitHub Repository",
                    repo_sub: "View source code, branches, and release updates",
                    contact_note: "If you have questions, improvement ideas, or issues, feel free to contact by email (nigromante2004@gmail.com) or open an issue on GitHub."
                }
            }
        }
    };

    let currentLang = 'es';

    function resolveKey(obj, path) {
        if (!path || !obj) return null;
        const parts = path.split('.');
        let curr = obj;
        for (const p of parts) {
            if (curr && typeof curr === 'object' && p in curr) {
                curr = curr[p];
            } else {
                return null;
            }
        }
        return curr;
    }

    const TeleVaultI18n = {
        init() {
            let saved = null;
            try {
                saved = localStorage.getItem(STORAGE_KEY);
            } catch (e) {}

            if (!saved) {
                const navLang = (navigator.language || navigator.userLanguage || '').toLowerCase();
                saved = navLang.startsWith('en') ? 'en' : 'es';
            }

            this.setLanguage(saved, false);
        },

        getLanguage() {
            return currentLang;
        },

        setLanguage(lang, persist = true) {
            currentLang = (lang === 'en') ? 'en' : 'es';
            if (persist) {
                try {
                    localStorage.setItem(STORAGE_KEY, currentLang);
                } catch (e) {}
            }

            if (document.documentElement) {
                document.documentElement.lang = currentLang;
            }

            this.applyTranslations();

            // Despachar evento global para que app.js actualice estados dinámicos
            try {
                window.dispatchEvent(new CustomEvent('televault:langchange', { detail: { lang: currentLang } }));
            } catch (e) {}
        },

        toggleLanguage() {
            const next = currentLang === 'es' ? 'en' : 'es';
            this.setLanguage(next, true);
            return next;
        },

        t(key, fallback = '', params = null) {
            const dict = translations[currentLang] || translations.es;
            let val = resolveKey(dict, key);
            if (val === null || val === undefined) {
                val = resolveKey(translations.es, key);
            }
            if (val === null || val === undefined) {
                val = fallback || key;
            }

            if (params && typeof params === 'object') {
                for (const [k, v] of Object.entries(params)) {
                    val = val.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
                }
            }
            return val;
        },

        applyTranslations(root = document) {
            // 1. Textos directos o en elementos con data-i18n
            root.querySelectorAll('[data-i18n]').forEach(el => {
                const key = el.getAttribute('data-i18n');
                const trans = this.t(key);
                if (!trans) return;

                // Si el elemento contiene un .btn-text interno, actualizar solo el texto de dicho span
                const btnText = el.querySelector('.btn-text');
                if (btnText) {
                    btnText.textContent = trans;
                } else {
                    el.textContent = trans;
                }
            });

            // 2. Atributos title
            root.querySelectorAll('[data-i18n-title]').forEach(el => {
                const key = el.getAttribute('data-i18n-title');
                const trans = this.t(key);
                if (trans) el.setAttribute('title', trans);
            });

            // 3. Atributos placeholder
            root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
                const key = el.getAttribute('data-i18n-placeholder');
                const trans = this.t(key);
                if (trans) el.setAttribute('placeholder', trans);
            });

            // 4. Atributos aria-label
            root.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
                const key = el.getAttribute('data-i18n-aria-label');
                const trans = this.t(key);
                if (trans) el.setAttribute('aria-label', trans);
            });

            // 5. Actualizar etiqueta del botón de idioma
            const langLabel = document.getElementById('langCurrentText');
            if (langLabel) {
                langLabel.textContent = currentLang.toUpperCase();
            }
        }
    };

    window.TeleVaultI18n = TeleVaultI18n;

    // Inicializar al cargar el script o el DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => TeleVaultI18n.init());
    } else {
        TeleVaultI18n.init();
    }
})();
