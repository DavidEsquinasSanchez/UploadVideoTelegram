// js/i18n.js
// Sistema de Internacionalización (i18n) para TeleVault
// Soporte multilingüe: Español (ES) e Inglés (EN)

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
                refresh: "Recargar página",
                theme: "Cambiar a modo claro / oscuro",
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
                title: "Canales y Foros",
                refresh_title: "Actualizar lista de canales desde Telegram",
                manage_title: "Gestionar canales registrados",
                search_placeholder: "Buscar por título de vídeo o tema...",
                scanning: "Escaneando canales de Telegram...",
                no_channels: "No hay canales registrados. Pulsa en la rueda de configuración para añadir uno.",
                topics_label: "Temas / Foros:",
                videos_label: "Vídeos detectados:"
            },
            tabs: {
                uploads: "Subidas",
                downloads: "Descargas"
            },
            uploads: {
                category_label: "Categoría:",
                select_category: "Seleccionar canal...",
                new_series: "¿Serie nueva?",
                name_label: "Nombre:",
                season_label: "Temp.:",
                create_topic: "+ Crear Tema",
                select_videos: "Seleccionar vídeo(s)...",
                upload_content: "Subir Contenido",
                retry: "Reintentar",
                clear_selection: "Limpiar selección",
                fill_notice: "Rellena los campos obligatorios para habilitar la selección de archivos.",
                th_original: "Título Original",
                th_transformed: "Título Transformado",
                th_size: "Tamaño",
                th_progress: "Progreso y Estado",
                th_action: "Acción",
                empty_title: "No hay archivos seleccionados",
                empty_desc: "Selecciona una categoría o tema arriba y pulsa en 'Seleccionar vídeo(s)' para comenzar.",
                status_queued: "En cola ⏳",
                status_uploading: "Subiendo a Telegram",
                status_completed: "Completado",
                status_cancelled: "Cancelado",
                status_error: "Error",
                delete_btn_title: "Eliminar archivo de la lista",
                part_badge: "Parte {current}/{total}",
                speed_prefix: "Velocidad:",
                eta_prefix: "Restante:"
            },
            downloads: {
                start_download: "Iniciar Descarga",
                cancel_download: "Cancelar descarga",
                clear_completed: "Limpiar completadas",
                select_folder: "Seleccionar carpeta destino...",
                default_folder_title: "Carpeta de destino predeterminada",
                th_select_all: "Seleccionar todos",
                th_name: "Nombre del Archivo",
                th_size: "Tamaño",
                th_progress: "Estado / Progreso",
                th_dest: "Carpeta de Destino",
                th_action: "Acción",
                empty_title: "No hay descargas en curso ni en cola",
                empty_desc: "Navega por los canales o temas en el menú lateral y haz clic en el icono de descarga para añadir vídeos a la cola.",
                status_pending: "Pendiente",
                status_downloading: "Descargando",
                status_merging: "Uniendo partes binarias...",
                status_done: "Finalizado OK",
                status_cancelled: "Cancelado",
                status_error: "Error",
                remove_download_title: "Quitar de la cola",
                change_folder_title: "Cambiar carpeta de destino para este archivo",
                locked_msg: "Descarga en curso. Al finalizar se volverá a habilitar"
            },
            activity: {
                title: "Registro de Actividad",
                filter_all: "Todos",
                filter_info: "Info",
                filter_success: "Éxito",
                filter_warning: "Avisos",
                filter_error: "Errores",
                clear_log: "Limpiar Log"
            },
            modals: {
                close: "Cerrar",
                cancel: "Cancelar",
                save_connect: "Guardar y Conectar",
                bot: {
                    title: "🤖 Configuración del Bot de Telegram",
                    token_label: "HTTP API Token del Bot:",
                    token_placeholder: "123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ",
                    token_help: "Obtenido en Telegram hablando con @BotFather.",
                    adv_toggle: "Opciones avanzadas (API_ID y API_HASH de my.telegram.org)",
                    api_id_label: "TG_API_ID (opcional):",
                    api_hash_label: "TG_API_HASH (opcional):",
                    adv_help: "Permiten a TeleVault acelerar las descargas y subidas con el protocolo nativo MTProto."
                },
                channels: {
                    title: "⚙️ Gestión de Canales y Grupos",
                    subtitle: "Configura los destinos donde TeleVault puede organizar, subir y descargar contenido.",
                    add_tab: "➕ Añadir Canal",
                    detect_tab: "🔍 Autodetectar Canales",
                    list_title: "Canales Registrados",
                    empty: "No hay canales registrados todavía."
                },
                guide: {
                    title: "📖 Guía de Configuración y Uso",
                    step1_title: "1. Crear el Bot de Telegram",
                    step2_title: "2. Permisos en Canales y Foros",
                    step3_title: "3. Fraccionamiento y Subida Inteligente",
                    step4_title: "4. Descargas y Reproducción con TeveFlipe"
                },
                about: {
                    title: "🚀 Acerca de TeleVault",
                    obj_title: "💡 Objetivo del Proyecto",
                    obj_desc: "TeleVault es una herramienta diseñada para simplificar y automatizar por completo la gestión, el fraccionamiento inteligente en partes, la subida y la descarga masiva de contenido multimedia (series, temporadas, películas y vídeos) hacia y desde canales y foros de Telegram. Preserva fielmente la calidad, integridad y extensión original de tus archivos sin coste alguno y con control 100% local.",
                    repo_title: "Repositorio Oficial en GitHub",
                    repo_sub: "Ver código fuente, ramas y novedades del proyecto",
                    contact_note: "Si tienes cualquier duda, sugerencia de mejora, idea o incidencia, puedes contactar libremente por email ({email}) o abrir una propuesta en GitHub."
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
                refresh: "Reload page",
                theme: "Switch light / dark theme",
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
                title: "Channels & Forums",
                refresh_title: "Refresh channels list from Telegram",
                manage_title: "Manage registered channels",
                search_placeholder: "Search by video title or topic...",
                scanning: "Scanning Telegram channels...",
                no_channels: "No registered channels. Click the settings gear to add one.",
                topics_label: "Topics / Forums:",
                videos_label: "Detected videos:"
            },
            tabs: {
                uploads: "Uploads",
                downloads: "Downloads"
            },
            uploads: {
                category_label: "Category:",
                select_category: "Select channel...",
                new_series: "New series?",
                name_label: "Name:",
                season_label: "Season:",
                create_topic: "+ Create Topic",
                select_videos: "Select video(s)...",
                upload_content: "Upload Content",
                retry: "Retry",
                clear_selection: "Clear selection",
                fill_notice: "Fill in required fields to enable file selection.",
                th_original: "Original Title",
                th_transformed: "Transformed Title",
                th_size: "Size",
                th_progress: "Progress & Status",
                th_action: "Action",
                empty_title: "No files selected",
                empty_desc: "Select a category or topic above and click 'Select video(s)' to get started.",
                status_queued: "Queued ⏳",
                status_uploading: "Uploading to Telegram",
                status_completed: "Completed",
                status_cancelled: "Cancelled",
                status_error: "Error",
                delete_btn_title: "Remove file from list",
                part_badge: "Part {current}/{total}",
                speed_prefix: "Speed:",
                eta_prefix: "ETA:"
            },
            downloads: {
                start_download: "Start Download",
                cancel_download: "Cancel download",
                clear_completed: "Clear completed",
                select_folder: "Select destination folder...",
                default_folder_title: "Default destination folder",
                th_select_all: "Select all",
                th_name: "File Name",
                th_size: "Size",
                th_progress: "Status / Progress",
                th_dest: "Destination Folder",
                th_action: "Action",
                empty_title: "No active or queued downloads",
                empty_desc: "Browse channels or topics in the sidebar and click the download icon to add videos to the queue.",
                status_pending: "Pending",
                status_downloading: "Downloading",
                status_merging: "Merging binary parts...",
                status_done: "Finished OK",
                status_cancelled: "Cancelled",
                status_error: "Error",
                remove_download_title: "Remove from queue",
                change_folder_title: "Change destination folder for this file",
                locked_msg: "Download in progress. Will be re-enabled upon completion"
            },
            activity: {
                title: "Activity Log",
                filter_all: "All",
                filter_info: "Info",
                filter_success: "Success",
                filter_warning: "Warnings",
                filter_error: "Errors",
                clear_log: "Clear Log"
            },
            modals: {
                close: "Close",
                cancel: "Cancel",
                save_connect: "Save & Connect",
                bot: {
                    title: "🤖 Telegram Bot Setup",
                    token_label: "Bot HTTP API Token:",
                    token_placeholder: "123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ",
                    token_help: "Obtained in Telegram by messaging @BotFather.",
                    adv_toggle: "Advanced options (API_ID and API_HASH from my.telegram.org)",
                    api_id_label: "TG_API_ID (optional):",
                    api_hash_label: "TG_API_HASH (optional):",
                    adv_help: "Allow TeleVault to speed up uploads and downloads via native MTProto."
                },
                channels: {
                    title: "⚙️ Channels & Groups Management",
                    subtitle: "Configure destinations where TeleVault can organize, upload, and download content.",
                    add_tab: "➕ Add Channel",
                    detect_tab: "🔍 Autodetect Channels",
                    list_title: "Registered Channels",
                    empty: "No registered channels yet."
                },
                guide: {
                    title: "📖 Setup & User Guide",
                    step1_title: "1. Create the Telegram Bot",
                    step2_title: "2. Permissions in Channels and Forums",
                    step3_title: "3. Smart Splitting and Upload",
                    step4_title: "4. Downloads and Playback with TeveFlipe"
                },
                about: {
                    title: "🚀 About TeleVault",
                    obj_title: "💡 Project Goal",
                    obj_desc: "TeleVault is a tool designed to simplify and fully automate the management, intelligent part-splitting, bulk upload, and mass download of multimedia content to and from Telegram channels and forums. It faithfully preserves the original quality, integrity, and extension of your files with 100% local control at no cost.",
                    repo_title: "Official GitHub Repository",
                    repo_sub: "View source code, branches, and release updates",
                    contact_note: "If you have questions, improvement ideas, or issues, feel free to contact by email ({email}) or open an issue on GitHub."
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
            // Textos
            root.querySelectorAll('[data-i18n]').forEach(el => {
                const key = el.getAttribute('data-i18n');
                const trans = this.t(key);
                if (trans) {
                    el.textContent = trans;
                }
            });

            // Atributos title
            root.querySelectorAll('[data-i18n-title]').forEach(el => {
                const key = el.getAttribute('data-i18n-title');
                const trans = this.t(key);
                if (trans) {
                    el.setAttribute('title', trans);
                }
            });

            // Atributos placeholder
            root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
                const key = el.getAttribute('data-i18n-placeholder');
                const trans = this.t(key);
                if (trans) {
                    el.setAttribute('placeholder', trans);
                }
            });

            // Atributos aria-label
            root.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
                const key = el.getAttribute('data-i18n-aria-label');
                const trans = this.t(key);
                if (trans) {
                    el.setAttribute('aria-label', trans);
                }
            });

            // Actualizar etiqueta del botón de idioma
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
