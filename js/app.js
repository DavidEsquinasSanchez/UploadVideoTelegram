// js/app.js

window.addLog = function(msg, type = 'info') {
    const consoleEl = document.getElementById('logConsole');
    if (!consoleEl) return;

    const time = new Date().toLocaleTimeString();
    const div = document.createElement('div');
    div.className = `log-msg-${type}`;
    div.textContent = `[${time}] ${msg}`;

    consoleEl.appendChild(div);
    consoleEl.scrollTop = consoleEl.scrollHeight;
};

document.addEventListener('DOMContentLoaded', async () => {
    // ---------------------------------------------------------------- Ajustes
    const SMALL_FILE_BYTES = 100 * 1024 * 1024;   // hasta 100 MB: se pueden subir varios a la vez
    const SMALL_CONCURRENCY = 3;                  // subidas simultáneas de archivos pequeños
    const UPLOADABLE = ['Pendiente Subir', 'Error en subida', 'Subido Previamente', 'Cancelado'];
    const WORKING = ['Subiendo', 'Preparando', 'Enviando', 'Reintentando', 'Esperando', 'Cancelando'];
    const HEALTH_INTERVAL_MS = 10000;

    // ----------------------------------------------------------------- Estado
    let telegramData = [];
    let filesToUpload = [];
    let fileToDeleteId = null;
    let currentSortColumn = 'transformedName';
    let currentSortAsc = true;
    let uploading = false;
    let cancelRequested = false;
    const expandedTopics = new Set(); // temas desplegados en la barra lateral (clave: grupo:tema)
    const expandedChannels = new Set(); // canales expandidos (por defecto todos comprimidos)

    // ------------------------------------------------------------- Catálogo SVG
    const SVG = {
        sun: '<svg class="icon-svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
        moon: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
        chevronLeft: '<svg class="icon-svg" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>',
        chevronRight: '<svg class="icon-svg" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>',
        pencil: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>',
        trash: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>',
        check: '<svg class="icon-svg" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
        cross: '<svg class="icon-svg" viewBox="0 0 24 24"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>',
        download: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>',
        square: '<svg class="icon-svg" viewBox="0 0 24 24"><rect width="14" height="14" x="5" y="5" rx="2"/></svg>',
        spinner: '<svg class="icon-svg icon-spin" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>',
        eye: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
        eyeOff: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>'
    };

    // --------------------------------------------------------------- Elementos
    const sidebar = document.getElementById('sidebar');
    const btnToggleSidebar = document.getElementById('btnToggleSidebar');
    const btnSidebarCollapse = document.getElementById('btnSidebarCollapse');
    const sidebarGroups = document.getElementById('sidebarGroups');
    const btnRefresh = document.getElementById('btnRefresh');
    const connDot = document.getElementById('connDot');
    const connText = document.getElementById('connText');

    const uploadForm = document.getElementById('uploadForm');
    const categoriaSelect = document.getElementById('categoria');
    const temasContainer = document.getElementById('temasContainer');
    const serieNuevaCheck = document.getElementById('serieNueva');
    const subcategoriaContainer = document.getElementById('subcategoriaContainer');
    const subcategoriaSelect = document.getElementById('subcategoria');
    const nuevaSerieContainer = document.getElementById('nuevaSerieContainer');
    const nombreSerieInput = document.getElementById('nombreSerie');
    const temporadaInput = document.getElementById('temporada');
    const btnSeleccionar = document.getElementById('btnSeleccionar');

    const btnCrearTema = document.getElementById('btnCrearTema');
    const btnSubir = document.getElementById('btnSubir');
    const btnReintentar = document.getElementById('btnReintentar');
    const btnCancelar = document.getElementById('btnCancelar');

    const filesTable = document.getElementById('filesTable');
    const filesTableBody = document.getElementById('filesTableBody');
    const thOriginal = document.getElementById('thOriginal');
    const thTransformado = document.getElementById('thTransformado');

    const logSection = document.getElementById('logSection');
    const logToggleTitle = document.getElementById('logToggleTitle');
    const btnClearLog = document.getElementById('btnClearLog');
    const logConsole = document.getElementById('logConsole');

    const deleteModal = document.getElementById('deleteModal');
    const btnConfirmDelete = document.getElementById('btnConfirmDelete');
    const btnCancelDelete = document.getElementById('btnCancelDelete');

    const btnClearAllUploads = document.getElementById('btnClearAllUploads');
    const deleteAllModal = document.getElementById('deleteAllModal');
    const btnConfirmDeleteAll = document.getElementById('btnConfirmDeleteAll');
    const btnCancelDeleteAll = document.getElementById('btnCancelDeleteAll');

    const btnClearCompletedUploads = document.getElementById('btnClearCompletedUploads');
    const deleteOkModal = document.getElementById('deleteOkModal');
    const btnConfirmDeleteOk = document.getElementById('btnConfirmDeleteOk');
    const btnCancelDeleteOk = document.getElementById('btnCancelDeleteOk');
    const helpText = document.getElementById('helpText');

    const downloadTopicModal = document.getElementById('downloadTopicModal');
    const downloadTopicModalText = document.getElementById('downloadTopicModalText');
    const btnConfirmDownloadTopic = document.getElementById('btnConfirmDownloadTopic');
    const btnCancelDownloadTopic = document.getElementById('btnCancelDownloadTopic');

    const uploadViewControls = document.getElementById('uploadViewControls');
    const downloadViewControls = document.getElementById('downloadViewControls');
    const btnCancelarDescarga = document.getElementById('btnCancelarDescarga');
    const btnReintentarDescarga = document.getElementById('btnReintentarDescarga');
    const btnDescargarContenido = document.getElementById('btnDescargarContenido');
    const tabUploads = document.getElementById('tabUploads');
    const tabDownloads = document.getElementById('tabDownloads');
    const uploadsWrapper = document.getElementById('uploadsWrapper');
    const downloadsWrapper = document.getElementById('downloadsWrapper');
    const badgeUploads = document.getElementById('badgeUploads');
    const badgeDownloads = document.getElementById('badgeDownloads');
    const downloadsTable = document.getElementById('downloadsTable');
    const downloadsTableBody = document.getElementById('downloadsTableBody');
    const checkAllDownloads = document.getElementById('checkAllDownloads');
    const btnClearCompletedDownloads = document.getElementById('btnClearCompletedDownloads');

    // Elementos de Gestión de Canales
    const btnManageChannels = document.getElementById('btnManageChannels');
    const channelsModal = document.getElementById('channelsModal');
    const btnCloseChannelsModal = document.getElementById('btnCloseChannelsModal');
    const inputNewChannel = document.getElementById('inputNewChannel');
    const btnSubmitAddChannel = document.getElementById('btnSubmitAddChannel');
    const modalBotName = document.getElementById('modalBotName');
    const channelAddFeedback = document.getElementById('channelAddFeedback');
    const channelsCount = document.getElementById('channelsCount');
    const btnRefreshChannelsList = document.getElementById('btnRefreshChannelsList');
    const channelsListContainer = document.getElementById('channelsListContainer');
    const deleteChannelModal = document.getElementById('deleteChannelModal');
    const deleteChannelModalText = document.getElementById('deleteChannelModalText');
    const btnConfirmDeleteChannel = document.getElementById('btnConfirmDeleteChannel');
    const btnCancelDeleteChannel = document.getElementById('btnCancelDeleteChannel');
    let channelToDelete = null;

    // Configuración del Bot y Sugerencias de Canales
    const btnConfigBot = document.getElementById('btnConfigBot');
    const headerBotUsername = document.getElementById('headerBotUsername');
    const botConfigModal = document.getElementById('botConfigModal');
    const btnCloseBotConfigModal = document.getElementById('btnCloseBotConfigModal');
    const inputBotToken = document.getElementById('inputBotToken');
    const btnToggleBotTokenVis = document.getElementById('btnToggleBotTokenVis');
    const inputApiId = document.getElementById('inputApiId');
    const inputApiHash = document.getElementById('inputApiHash');
    const botConfigFeedback = document.getElementById('botConfigFeedback');
    const btnSaveBotConfig = document.getElementById('btnSaveBotConfig');
    const btnCancelBotConfig = document.getElementById('btnCancelBotConfig');
    const channelSuggestionsDropdown = document.getElementById('channelSuggestionsDropdown');
    const btnDetectChannels = document.getElementById('btnDetectChannels');
    const btnToggleChannelHelp = document.getElementById('btnToggleChannelHelp');
    const channelHelpBlock = document.getElementById('channelHelpBlock');
    let knownChannelsList = [];
    let checkChannelDebounceTimer = null;
    let selectedChannelToVerify = null;

    const DOWNLOAD_LOCKED_MSG = "Descarga en curso. Al finalizar se volverá a habilitar";
    let isDownloading = false;
    let pendingTopicDownload = null;
    let downloadPollInterval = null;
    let seenDownloadLogs = new Set();
    let currentTab = 'uploads';
    let downloadsList = [];

    // --------------------------------------------------- Modo Claro / Oscuro
    const btnToggleTheme = document.getElementById('btnToggleTheme');

    function applyTheme(theme) {
        if (theme === 'light') {
            document.body.classList.add('light-theme');
            if (btnToggleTheme) {
                btnToggleTheme.innerHTML = SVG.sun;
                btnToggleTheme.title = 'Cambiar a modo oscuro';
                btnToggleTheme.setAttribute('aria-label', 'Modo oscuro');
            }
        } else {
            document.body.classList.remove('light-theme');
            if (btnToggleTheme) {
                btnToggleTheme.innerHTML = SVG.moon;
                btnToggleTheme.title = 'Cambiar a modo claro';
                btnToggleTheme.setAttribute('aria-label', 'Modo claro');
            }
        }
    }

    function initTheme() {
        const savedTheme = localStorage.getItem('teleVaultTheme') || 'dark';
        applyTheme(savedTheme);

        if (btnToggleTheme) {
            btnToggleTheme.addEventListener('click', () => {
                const isLight = document.body.classList.contains('light-theme');
                const nextTheme = isLight ? 'dark' : 'light';
                localStorage.setItem('teleVaultTheme', nextTheme);
                applyTheme(nextTheme);
            });
        }
    }
    initTheme();

    // --------------------------------------------------- Menú lateral colapsable y redimensionable
    const sidebarResizer = document.getElementById('sidebarResizer');
    let isResizingSidebar = false;

    function applySidebarWidth(w) {
        if (!sidebar) return;
        const maxAvail = Math.min(800, window.innerWidth - 360);
        const clamped = Math.max(220, Math.min(w, maxAvail));
        sidebar.style.width = clamped + 'px';
        sidebar.style.minWidth = clamped + 'px';
    }

    function initSidebar() {
        const savedWidth = parseInt(localStorage.getItem('teleVaultSidebarWidth'), 10);
        if (savedWidth && !isNaN(savedWidth) && savedWidth >= 220) {
            applySidebarWidth(savedWidth);
        }

        if (!sidebarResizer) return;

        sidebarResizer.addEventListener('mousedown', (e) => {
            if (sidebar.classList.contains('collapsed')) return;
            isResizingSidebar = true;
            document.body.classList.add('resizing-sidebar');
            sidebarResizer.classList.add('is-resizing');
            sidebar.classList.add('no-transition');
            const startX = e.clientX;
            const startWidth = sidebar.getBoundingClientRect().width;

            function onMouseMove(ev) {
                if (!isResizingSidebar) return;
                const deltaX = ev.clientX - startX;
                applySidebarWidth(startWidth + deltaX);
            }

            function onMouseUp() {
                if (!isResizingSidebar) return;
                isResizingSidebar = false;
                document.body.classList.remove('resizing-sidebar');
                sidebarResizer.classList.remove('is-resizing');
                sidebar.classList.remove('no-transition');
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);

                const finalWidth = Math.round(sidebar.getBoundingClientRect().width);
                localStorage.setItem('teleVaultSidebarWidth', finalWidth);
            }

            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
            e.preventDefault();
        });
    }

    function toggleSidebar() {
        if (!sidebar) return;
        const isCollapsed = sidebar.classList.toggle('collapsed');
        if (btnToggleSidebar) {
            btnToggleSidebar.innerHTML = isCollapsed ? SVG.chevronRight : SVG.chevronLeft;
            btnToggleSidebar.title = isCollapsed ? 'Descomprimir menú lateral' : 'Comprimir menú lateral';
        }
        if (!isCollapsed) {
            const savedWidth = parseInt(localStorage.getItem('teleVaultSidebarWidth'), 10) || 280;
            applySidebarWidth(savedWidth);
        }
    }

    if (btnToggleSidebar) btnToggleSidebar.addEventListener('click', toggleSidebar);
    if (btnSidebarCollapse) btnSidebarCollapse.addEventListener('click', toggleSidebar);
    initSidebar();

    // --------------------------------------------- Log de Actividad colapsable
    if (logToggleTitle && logSection) {
        logToggleTitle.addEventListener('click', () => {
            logSection.classList.toggle('collapsed');
        });
    }

    // ------------------------------------------------------------- Utilidades
    function isWorkingStatus(status) {
        return WORKING.some(prefix => status.startsWith(prefix));
    }

    const naturalCompare = (a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });

    function parseTransformedTitle(title) {
        if (!title) return { series: '', season: 0, episode: 0, part: 0, isEpisode: false };

        let clean = title.trim();
        let partNum = 0;

        // 1. Detectar corte binario tipo .001, .002
        const numericPartMatch = clean.match(/\.(\d{3,4})$/);
        if (numericPartMatch) {
            partNum = parseInt(numericPartMatch[1], 10);
            clean = clean.substring(0, numericPartMatch.index);
        }

        // 2. Quitar extensión de vídeo (ej: .mp4, .mkv) si queda al final
        const dotIdx = clean.lastIndexOf('.');
        if (dotIdx > 0) {
            clean = clean.substring(0, dotIdx);
        }

        // 3. Detectar compatibilidad con partes antiguas .part1, -part2
        let nameWithoutPart = clean;
        const legacyPartMatch = clean.match(/[\._-]part(\d+)$/i);
        if (legacyPartMatch) {
            if (!partNum) partNum = parseInt(legacyPartMatch[1], 10);
            nameWithoutPart = clean.substring(0, legacyPartMatch.index);
        }

        const matchX = nameWithoutPart.match(/^(.*?)(?:^|\s+)(\d+)x(\d+)(.*?)$/i);
        if (matchX) {
            const series = (matchX[1] + (matchX[4] || '')).trim();
            const season = parseInt(matchX[2], 10);
            let episode = parseInt(matchX[3], 10);
            const epStr = String(matchX[3]);
            const sStr = String(season);
            if (epStr.length === sStr.length + 2 && epStr.startsWith(sStr)) {
                episode = parseInt(epStr.slice(sStr.length), 10);
            }
            return {
                series: series.toLowerCase(),
                season: season,
                episode: episode,
                part: partNum,
                isEpisode: true
            };
        }

        const matchSE = nameWithoutPart.match(/^(.*?)(?:^|\s+)s(\d+)e(\d+)(.*?)$/i);
        if (matchSE) {
            const series = (matchSE[1] + (matchSE[4] || '')).trim();
            const season = parseInt(matchSE[2], 10);
            let episode = parseInt(matchSE[3], 10);
            const epStr = String(matchSE[3]);
            const sStr = String(season);
            if (epStr.length === sStr.length + 2 && epStr.startsWith(sStr)) {
                episode = parseInt(epStr.slice(sStr.length), 10);
            }
            return {
                series: series.toLowerCase(),
                season: season,
                episode: episode,
                part: partNum,
                isEpisode: true
            };
        }

        return {
            series: nameWithoutPart.toLowerCase(),
            season: 0,
            episode: 0,
            part: partNum,
            isEpisode: false
        };
    }

    function compareTransformedTitles(aTitle, bTitle) {
        const a = parseTransformedTitle(aTitle);
        const b = parseTransformedTitle(bTitle);

        if (a.series && b.series && a.series === b.series) {
            if (a.isEpisode && b.isEpisode) {
                if (a.season !== b.season) return a.season - b.season;
                if (a.episode !== b.episode) return a.episode - b.episode;
            }
            if (a.part !== b.part) return a.part - b.part;
        }
        return (aTitle || '').localeCompare(bTitle || '', 'es', { numeric: true, sensitivity: 'base' });
    }

    const compareForUpload = (a, b) =>
        compareTransformedTitles(a.transformedName, b.transformedName) || naturalCompare(a.originalName, b.originalName);

    // ---------------------------------------------------- Estado de conexión
    function setConn(state, text) {
        if (connDot) connDot.className = `conn-dot conn-${state}`;
        if (connText) {
            connText.className = `conn-badge conn-badge-${state}`;
            connText.textContent = text;
        }
    }

    async function checkHealth() {
        try {
            const h = await window.TelegramAPI.health();
            if (h.bot) {
                if (headerBotUsername) headerBotUsername.textContent = `@${h.bot}`;
                if (modalBotName) modalBotName.textContent = `@${h.bot}`;
            } else {
                if (headerBotUsername) headerBotUsername.textContent = 'Configurar Bot';
            }

            if (!h.configured) {
                setConn('error', 'Sin configurar');
            } else if (!h.telegram) {
                setConn('error', 'Desconectado');
            } else if (h.scanning) {
                setConn('busy', 'Actualizando…');
            } else {
                setConn('ok', 'Conectado');
            }
        } catch (error) {
            setConn('error', error.status === 401 ? 'Sesión caducada' : 'Sin backend');
        }
    }

    // ------------------------------------------------------------------- Inicio
    async function init() {
        addLog("Iniciando aplicación y cargando interfaz...", "info");
        initTableResizers();
        renderTable();
        renderDownloadsTable();
        updateBadges();
        syncHeaderCheckbox();
        checkDownloadButtonState();
        checkHealth();
        setInterval(checkHealth, HEALTH_INTERVAL_MS);

        // 0) Comprobar si hay descarga en curso o cola previa
        try {
            const prog = await window.TelegramAPI.getDownloadProgress();
            if (prog && (prog.active || (prog.queue && prog.queue.length > 0))) {
                downloadsList = prog.queue || [];
                renderDownloadsTable(prog);
                updateBadges();
                if (prog.active) {
                    setDownloadLock(true);
                    startDownloadPolling();
                }
            }
        } catch (e) {
            // Ignorar error inicial
        }

        // 1) Al instante, con lo que el backend tiene guardado
        let hasCached = false;
        try {
            const cached = await window.TelegramAPI.getGrupos(true);
            if (cached.length > 0) {
                applyGroupsData(cached);
                hasCached = true;
            }
        } catch (error) {
            // el error ya se registra en el log
        }

        // 2) Datos al día desde Telegram (el backend ya los está actualizando en segundo plano)
        try {
            applyGroupsData(await window.TelegramAPI.getGrupos(false));
        } catch (error) {
            if (!hasCached) addLog("Error crítico al inicializar los datos de Telegram.", "error");
        }
        checkHealth();
    }

    // Pinta los datos y conserva lo que el usuario tenía seleccionado en el formulario
    function applyGroupsData(data) {
        // Filtrar grupo "General" por si existiese
        telegramData = (data || []).filter(g => g.nombre && g.nombre.trim().toLowerCase() !== 'general');
        renderSidebar();

        const prevCat = categoriaSelect.value;
        const prevSub = subcategoriaSelect.value;
        renderCategoriaOptions();
        const grupo = telegramData.find(g => g.id === prevCat);
        if (grupo) {
            categoriaSelect.value = prevCat;
            populateSubcategorias(grupo);
            if (prevSub && !serieNuevaCheck.checked &&
                Array.from(subcategoriaSelect.options).some(o => o.value === prevSub)) {
                subcategoriaSelect.value = prevSub;
            }
        }
        validateForm();
    }

    btnRefresh.addEventListener('click', () => { window.location.reload(); });

    // Recarga rápida (desde la caché del backend) tras subir vídeos
    async function refreshSidebar() {
        try {
            applyGroupsData(await window.TelegramAPI.getGrupos(true));
        } catch (error) {
            // el error ya se registra en el log
        }
    }

    // ------------------------------------------------------------ Barra lateral
    function renderSidebar() {
        sidebarGroups.innerHTML = '';
        if (!telegramData || telegramData.length === 0) {
            sidebarGroups.innerHTML = `
                <div class="sidebar-empty">
                    <div class="empty-icon">📁</div>
                    <div class="empty-text">No hay canales configurados</div>
                    <button type="button" class="btn-sidebar-add-empty" id="btnSidebarEmptyAdd">➕ Añadir canal</button>
                </div>
            `;
            const btnEmpty = document.getElementById('btnSidebarEmptyAdd');
            if (btnEmpty) btnEmpty.addEventListener('click', () => openChannelsModal(true));
            return;
        }
        telegramData.forEach(grupo => {
            const folderDiv = document.createElement('div');
            folderDiv.className = 'folder-item folder-collapsible';
            const isChannelExpanded = expandedChannels.has(grupo.id);
            if (isChannelExpanded) {
                folderDiv.classList.add('expanded');
            }

            const titleDiv = document.createElement('div');
            titleDiv.className = 'folder-title';
            titleDiv.tabIndex = 0;
            titleDiv.setAttribute('role', 'button');
            titleDiv.setAttribute('aria-expanded', String(isChannelExpanded));
            titleDiv.title = 'Haz clic para comprimir o descomprimir este canal';

            const toggleIcon = document.createElement('span');
            toggleIcon.className = 'folder-toggle-icon';
            toggleIcon.textContent = '▶';

            const folderIcon = document.createElement('span');
            folderIcon.className = 'folder-emoji';
            folderIcon.textContent = isChannelExpanded ? '📂' : '📁';

            const titleText = document.createElement('span');
            titleText.className = 'folder-title-text';
            titleText.textContent = grupo.nombre;

            titleDiv.append(toggleIcon, folderIcon, titleText);
            folderDiv.appendChild(titleDiv);

            const toggleChannel = () => {
                if (expandedChannels.has(grupo.id)) {
                    expandedChannels.delete(grupo.id);
                } else {
                    expandedChannels.add(grupo.id);
                }
                const nowExpanded = expandedChannels.has(grupo.id);
                folderDiv.classList.toggle('expanded', nowExpanded);
                titleDiv.setAttribute('aria-expanded', String(nowExpanded));
                folderIcon.textContent = nowExpanded ? '📂' : '📁';
            };

            titleDiv.addEventListener('click', toggleChannel);
            titleDiv.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleChannel();
                }
            });

            // Filtrar temas para no mostrar "General" ni id 1
            const temasFiltrados = (grupo.temas || []).filter(
                t => String(t.id) !== '1' && t.nombre.trim().toLowerCase() !== 'general'
            );

            if (grupo.tieneTemas && temasFiltrados.length > 0) {
                const sublist = document.createElement('ul');
                sublist.className = 'subfolder-list';

                temasFiltrados.forEach(tema => {
                    const subItem = document.createElement('li');
                    subItem.className = 'subfolder-item';

                    // Vídeos del tema, ordenados por número de capítulo / parte
                    const videos = (tema.videos || []).slice().sort(compareTransformedTitles);

                    if (videos.length === 0) {
                        subItem.textContent = tema.nombre;
                    } else {
                        const key = `${grupo.id}:${tema.id}`;
                        subItem.classList.add('subfolder-collapsible');

                        const row = document.createElement('div');
                        row.className = 'subfolder-row';
                        row.tabIndex = 0;
                        row.setAttribute('role', 'button');

                        const icon = document.createElement('span');
                        icon.className = 'toggle-icon';
                        icon.textContent = '▶';

                        const name = document.createElement('span');
                        name.className = 'subfolder-name';
                        name.textContent = tema.nombre;

                        const count = document.createElement('span');
                        count.className = 'video-count';
                        count.textContent = videos.length;

                        // Botón de descarga de todos los vídeos del tema
                        const btnDlTopic = document.createElement('button');
                        btnDlTopic.type = 'button';
                        btnDlTopic.className = 'btn-download-topic';
                        btnDlTopic.title = isDownloading ? DOWNLOAD_LOCKED_MSG : 'Descargar todos los archivos';
                        btnDlTopic.disabled = isDownloading;
                        btnDlTopic.innerHTML = SVG.download;
                        btnDlTopic.addEventListener('click', (e) => {
                            e.stopPropagation();
                            if (isDownloading) return;
                            pendingTopicDownload = { categoryId: grupo.id, topicId: tema.id, topicName: tema.nombre };
                            if (downloadTopicModalText) {
                                downloadTopicModalText.textContent = `¿Deseas descargar todos los vídeos del tema "${tema.nombre}"?`;
                            }
                            if (downloadTopicModal) {
                                downloadTopicModal.classList.remove('hidden');
                            }
                        });

                        row.append(icon, name, count, btnDlTopic);

                        const videoList = document.createElement('ul');
                        videoList.className = 'video-list';
                        videos.forEach(v => {
                            const li = document.createElement('li');
                            li.className = 'video-item';

                            const vTitle = document.createElement('span');
                            vTitle.className = 'video-item-title';
                            vTitle.textContent = v;
                            vTitle.title = v;

                            const btnDlVideo = document.createElement('button');
                            btnDlVideo.type = 'button';
                            btnDlVideo.className = 'btn-download-video';
                            btnDlVideo.title = isDownloading ? DOWNLOAD_LOCKED_MSG : 'Descargar video';
                            btnDlVideo.disabled = isDownloading;
                            btnDlVideo.innerHTML = SVG.download;
                            btnDlVideo.addEventListener('click', async (e) => {
                                e.stopPropagation();
                                if (isDownloading) return;
                                await promptAndAddVideoToDownloadList(grupo.id, tema.id, v);
                            });

                            li.append(vTitle, btnDlVideo);
                            videoList.appendChild(li);
                        });

                        subItem.append(row, videoList);

                        const setExpanded = (open) => {
                            subItem.classList.toggle('expanded', open);
                            row.setAttribute('aria-expanded', String(open));
                            if (open) expandedTopics.add(key); else expandedTopics.delete(key);
                        };
                        setExpanded(expandedTopics.has(key));

                        row.addEventListener('click', () => setExpanded(!subItem.classList.contains('expanded')));
                        row.addEventListener('keydown', (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                row.click();
                            }
                        });
                    }
                    sublist.appendChild(subItem);
                });
                folderDiv.appendChild(sublist);
            } else if (!grupo.tieneTemas && grupo.videos && grupo.videos.length > 0) {
                const videoList = document.createElement('ul');
                videoList.className = 'video-list direct-channel-videos';
                const directVideos = (grupo.videos || []).slice().sort(compareTransformedTitles);

                directVideos.forEach(v => {
                    const li = document.createElement('li');
                    li.className = 'video-item';

                    const vTitle = document.createElement('span');
                    vTitle.className = 'video-item-title';
                    vTitle.textContent = v;
                    vTitle.title = v;

                    const btnDlVideo = document.createElement('button');
                    btnDlVideo.type = 'button';
                    btnDlVideo.className = 'btn-download-video';
                    btnDlVideo.title = isDownloading ? DOWNLOAD_LOCKED_MSG : 'Descargar video';
                    btnDlVideo.disabled = isDownloading;
                    btnDlVideo.innerHTML = SVG.download;
                    btnDlVideo.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (isDownloading) return;
                        await promptAndAddVideoToDownloadList(grupo.id, null, v);
                    });

                    li.append(vTitle, btnDlVideo);
                    videoList.appendChild(li);
                });
                folderDiv.appendChild(videoList);
            }
            sidebarGroups.appendChild(folderDiv);
        });
    }

    // --------------------------------------------------------------- Formulario
    function renderCategoriaOptions() {
        if (!telegramData || telegramData.length === 0) {
            categoriaSelect.innerHTML = '<option value="">-- No hay canales configurados --</option>';
            return;
        }
        categoriaSelect.innerHTML = '<option value="">Selecciona Categoria...</option>';
        telegramData.forEach(grupo => {
            const option = document.createElement('option');
            option.value = grupo.id;
            option.textContent = grupo.nombre;
            categoriaSelect.appendChild(option);
        });
    }

    function populateSubcategorias(grupo) {
        subcategoriaSelect.innerHTML = '<option value="">Selecciona subcategoria</option>';
        if (!grupo) return;
        // Filtrar temas para no mostrar ni permitir elegir "General"
        const temasFiltrados = (grupo.temas || []).filter(
            t => String(t.id) !== '1' && t.nombre.trim().toLowerCase() !== 'general'
        );
        temasFiltrados.forEach(tema => {
            const opt = document.createElement('option');
            opt.value = tema.id;
            opt.textContent = tema.nombre;
            subcategoriaSelect.appendChild(opt);
        });
    }

    categoriaSelect.addEventListener('change', (e) => {
        const selectedId = e.target.value;
        const grupo = telegramData.find(g => g.id === selectedId);

        serieNuevaCheck.checked = false;
        serieNuevaCheck.disabled = true;
        nombreSerieInput.value = '';
        temporadaInput.value = '';
        populateSubcategorias(null);

        if (grupo && grupo.tieneTemas) {
            temasContainer.classList.remove('hidden');
            subcategoriaContainer.classList.remove('hidden');
            nuevaSerieContainer.classList.add('hidden');
            serieNuevaCheck.disabled = false;
            populateSubcategorias(grupo);
        } else {
            temasContainer.classList.add('hidden');
        }
        validateForm();
    });

    function adjustSeriesInputWidth() {
        if (!nombreSerieInput) return;
        const len = nombreSerieInput.value.length;
        if (len === 0) {
            nombreSerieInput.style.width = '';
            return;
        }
        // Base de 220px, se expande fluidamente según los caracteres hasta un máximo de 420px
        const targetWidth = Math.min(420, Math.max(220, len * 9.2 + 28));
        nombreSerieInput.style.width = `${Math.round(targetWidth)}px`;
    }

    serieNuevaCheck.addEventListener('change', (e) => {
        if (e.target.checked) {
            subcategoriaContainer.classList.add('hidden');
            nuevaSerieContainer.classList.remove('hidden');
            subcategoriaSelect.value = '';
            adjustSeriesInputWidth();
        } else {
            subcategoriaContainer.classList.remove('hidden');
            nuevaSerieContainer.classList.add('hidden');
            nombreSerieInput.value = '';
            temporadaInput.value = '';
            adjustSeriesInputWidth();
        }
        validateForm();
    });

    subcategoriaSelect.addEventListener('change', () => {
        validateForm();
        updatePendingTransformedNames();
    });
    nombreSerieInput.addEventListener('input', () => {
        adjustSeriesInputWidth();
        validateForm();
    });
    temporadaInput.addEventListener('input', validateForm);

    // Bloquea / desbloquea el formulario mientras se sube
    function setFormLocked(locked) {
        categoriaSelect.disabled = locked;
        subcategoriaSelect.disabled = locked;
        nombreSerieInput.disabled = locked;
        temporadaInput.disabled = locked;
        const grupo = telegramData.find(g => g.id === categoriaSelect.value);
        serieNuevaCheck.disabled = locked || !(grupo && grupo.tieneTemas);
    }

    function validateForm() {
        let isFormValid = true;
        let canCreateTopic = false;
        const selectedId = categoriaSelect.value;
        const grupo = telegramData.find(g => g.id === selectedId);

        if (!selectedId) {
            isFormValid = false;
        } else if (grupo && grupo.tieneTemas) {
            if (serieNuevaCheck.checked) {
                isFormValid = false;
                if (nombreSerieInput.value.trim() !== '' && temporadaInput.value.trim() !== '') {
                    canCreateTopic = true;
                }
            } else {
                if (!subcategoriaSelect.value) {
                    isFormValid = false;
                }
            }
        }

        const selectionEnabled = isFormValid && !uploading;
        btnSeleccionar.disabled = !selectionEnabled;
        btnCrearTema.disabled = !canCreateTopic || uploading;
        if (helpText) helpText.style.display = selectionEnabled ? 'none' : '';

        if (isDownloading) {
            btnSeleccionar.disabled = true;
            btnSeleccionar.title = DOWNLOAD_LOCKED_MSG;
            btnSubir.disabled = true;
            btnSubir.title = DOWNLOAD_LOCKED_MSG;
            btnReintentar.disabled = true;
            btnReintentar.title = DOWNLOAD_LOCKED_MSG;
            btnCrearTema.disabled = !canCreateTopic;
            btnCrearTema.title = canCreateTopic ? 'Crear Tema' : '';
            if (btnClearCompletedUploads) {
                btnClearCompletedUploads.disabled = true;
                btnClearCompletedUploads.title = DOWNLOAD_LOCKED_MSG;
            }
            if (btnClearAllUploads) {
                btnClearAllUploads.disabled = true;
                btnClearAllUploads.title = DOWNLOAD_LOCKED_MSG;
            }
            return;
        }

        checkUploadButtonState();
    }

    btnCrearTema.addEventListener('click', async () => {
        const categoryId = categoriaSelect.value;
        const nombreSerie = nombreSerieInput.value.trim();
        const temporada = temporadaInput.value.trim();
        const topicName = `${nombreSerie} - Temporada ${temporada}`;

        btnCrearTema.disabled = true;

        try {
            const result = await window.TelegramAPI.createTopic(categoryId, topicName);

            if (result.success) {
                addLog(`Tema creado correctamente: ${topicName}`, "success");
                const grupoNuevo = telegramData.find(g => g.id === categoryId);
                if (grupoNuevo && !grupoNuevo.temas.some(t => t.id === result.topic.id)) {
                    grupoNuevo.temas.push({ id: result.topic.id, nombre: result.topic.nombre, videos: [] });
                }
                expandedChannels.add(categoryId);
                renderSidebar();

                serieNuevaCheck.checked = false;
                subcategoriaContainer.classList.remove('hidden');
                nuevaSerieContainer.classList.add('hidden');
                nombreSerieInput.value = '';
                temporadaInput.value = '';

                populateSubcategorias(telegramData.find(g => g.id === categoryId));
                subcategoriaSelect.value = result.topic.id;
                validateForm();
                updatePendingTransformedNames();
            } else if (result.reason === "duplicate") {
                addLog("No se ha creado el tema. Ya existe un tema con el mismo nombre previamente", "warning");
                validateForm();
            } else {
                addLog(`No se pudo crear el tema: ${result.reason || 'motivo desconocido'}`, "error");
                validateForm();
            }
        } catch (error) {
            addLog(`Error al crear el tema: ${error.message || 'Error desconocido'}`, "error");
            validateForm();
        }
    });

    function checkUploadButtonState() {
        const hasCompleted = filesToUpload.some(f => f.status === 'Subido OK');
        const hasAnyFiles = filesToUpload.length > 0;

        if (btnClearCompletedUploads) {
            btnClearCompletedUploads.disabled = uploading || isDownloading || !hasCompleted;
            btnClearCompletedUploads.title = hasCompleted
                ? 'Limpiar de la tabla los archivos finalizados correctamente'
                : 'No hay archivos subidos correctamente para limpiar';
        }

        if (btnClearAllUploads) {
            btnClearAllUploads.disabled = uploading || isDownloading || !hasAnyFiles;
            btnClearAllUploads.title = hasAnyFiles
                ? 'Vaciar todos los archivos de la tabla'
                : 'La tabla está vacía';
        }

        if (isDownloading) {
            btnSubir.disabled = true;
            btnSubir.title = DOWNLOAD_LOCKED_MSG;
            btnReintentar.disabled = true;
            btnReintentar.title = DOWNLOAD_LOCKED_MSG;
            return;
        }
        const hasFilesToUpload = filesToUpload.some(f => UPLOADABLE.includes(f.status));
        btnSubir.disabled = !hasFilesToUpload || uploading;
        btnSubir.title = '';
        // "Reintentar" solo tiene sentido si hay archivos con error (y no se está subiendo)
        btnReintentar.disabled = uploading || !filesToUpload.some(f => f.status === 'Error en subida');
        btnReintentar.title = '';
    }

    // ------------------------------------------------- Bloqueo y Control de Descargas
    function setDownloadLock(locked) {
        isDownloading = locked;

        if (btnCancelarDescarga) {
            btnCancelarDescarga.innerHTML = `<span class="btn-icon">${SVG.square}</span><span class="btn-text">Cancelar descarga</span>`;
        }

        checkDownloadButtonState();
        checkUploadButtonState();

        document.querySelectorAll('.btn-download-topic, .btn-download-video').forEach(btn => {
            btn.disabled = locked;
            if (locked) {
                btn.setAttribute('title', DOWNLOAD_LOCKED_MSG);
            } else {
                btn.setAttribute('title', btn.classList.contains('btn-download-topic') ? 'Descargar todos los archivos' : 'Descargar video');
            }
        });

        if (!locked) {
            validateForm();
            renderTable();
        }
        renderSidebar();
        renderDownloadsTable();
        updateBadges();
    }

    // ------------------------------------------------- Pestañas y Tabla de Descargas
    function switchTab(tab) {
        currentTab = tab;
        if (tab === 'uploads') {
            if (tabUploads) tabUploads.classList.add('active');
            if (tabDownloads) tabDownloads.classList.remove('active');
            if (uploadsWrapper) uploadsWrapper.classList.remove('hidden');
            if (downloadsWrapper) downloadsWrapper.classList.add('hidden');
            validateForm();
            checkUploadButtonState();
        } else {
            if (tabDownloads) tabDownloads.classList.add('active');
            if (tabUploads) tabUploads.classList.remove('active');
            if (downloadsWrapper) downloadsWrapper.classList.remove('hidden');
            if (uploadsWrapper) uploadsWrapper.classList.add('hidden');
            checkDownloadButtonState();
        }
    }

    if (tabUploads) tabUploads.addEventListener('click', () => switchTab('uploads'));
    if (tabDownloads) tabDownloads.addEventListener('click', () => switchTab('downloads'));

    function updateBadges() {
        if (badgeUploads) badgeUploads.textContent = filesToUpload.length;
        if (badgeDownloads) {
            badgeDownloads.textContent = downloadsList.length;
            if (isDownloading) {
                badgeDownloads.classList.add('badge-active-pulse');
            } else {
                badgeDownloads.classList.remove('badge-active-pulse');
            }
        }
    }

    function syncHeaderCheckbox() {
        if (!checkAllDownloads) return;
        if (downloadsList.length === 0) {
            checkAllDownloads.checked = false;
            checkAllDownloads.indeterminate = false;
            return;
        }
        const allChecked = downloadsList.every(i => i.checked);
        const noneChecked = downloadsList.every(i => !i.checked);
        checkAllDownloads.checked = allChecked;
        checkAllDownloads.indeterminate = !allChecked && !noneChecked;
    }

    if (checkAllDownloads) {
        checkAllDownloads.addEventListener('change', () => {
            if (isDownloading) return;
            const checked = checkAllDownloads.checked;
            downloadsList.forEach(i => { i.checked = checked; });
            renderDownloadsTable();
            checkDownloadButtonState();
        });
    }

    function checkDownloadButtonState() {
        if (!btnDescargarContenido || !btnCancelarDescarga || !btnReintentarDescarga) return;

        if (isDownloading) {
            btnCancelarDescarga.disabled = false;
            btnCancelarDescarga.title = 'Cancelar descarga en curso';

            btnReintentarDescarga.disabled = true;
            btnReintentarDescarga.title = DOWNLOAD_LOCKED_MSG;

            btnDescargarContenido.disabled = true;
            btnDescargarContenido.title = DOWNLOAD_LOCKED_MSG;
        } else {
            btnCancelarDescarga.disabled = true;
            btnCancelarDescarga.title = 'No hay ninguna descarga en curso';

            // Reintentar: solo si al finalizar alguna descarga tuvo error
            const hasError = downloadsList.some(it => it.status === 'Error');
            btnReintentarDescarga.disabled = !hasError;
            btnReintentarDescarga.title = hasError ? 'Reintentar descargas fallidas' : '';

            // Descargar contenido: habilitado si hay al menos un elemento marcado
            const hasChecked = downloadsList.some(it => it.checked);
            btnDescargarContenido.disabled = !hasChecked;
            btnDescargarContenido.title = hasChecked ? '' : 'Selecciona al menos un vídeo de la tabla para descargar';
        }
    }

    function getCleanVideoBaseName(filename) {
        if (!filename) return '';
        return filename.replace(/\.\d{3,4}$/, '');
    }

    async function promptAndAddVideoToDownloadList(chatId, topicId, videoName, switchTabToDownloads = true) {
        if (!videoName || isDownloading) return;
        const baseName = getCleanVideoBaseName(videoName);

        addLog(`Selecciona la carpeta donde guardar '${baseName}'...`, 'info');
        let folder;
        try {
            folder = await window.TelegramAPI.selectFolder();
        } catch (err) {
            addLog(`Error al abrir selector de carpetas: ${err.message}`, 'error');
            return;
        }

        if (!folder) {
            addLog('Operación cancelada: no se seleccionó ninguna carpeta.', 'warning');
            return;
        }

        // Contar partes binarias
        const grupo = telegramData.find(g => String(g.id) === String(chatId));
        let partsCount = 1;
        if (grupo) {
            let vList = [];
            if (topicId) {
                const tema = (grupo.temas || []).find(t => String(t.id) === String(topicId));
                if (tema) vList = tema.videos || [];
            } else {
                vList = grupo.videos || [];
            }
            const matching = vList.filter(vn => getCleanVideoBaseName(vn).toLowerCase() === baseName.toLowerCase());
            if (matching.length > 1) {
                partsCount = matching.length;
            }
        }

        const existing = downloadsList.find(it => String(it.chatId) === String(chatId) && it.name.toLowerCase() === baseName.toLowerCase());
        if (existing) {
            existing.dest = folder;
            existing.checked = true;
            addLog(`Actualizada ubicación de '${baseName}' a '${folder}'.`, 'info');
        } else {
            downloadsList.push({
                id: 'dl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                chatId: chatId,
                topicId: topicId,
                name: baseName,
                parts: partsCount,
                checked: true,
                status: 'Pendiente',
                percent: 0,
                speed: null,
                eta: null,
                dest: folder,
                error: null
            });
            const partInfo = partsCount > 1 ? ` (${partsCount} partes binarias)` : '';
            addLog(`Añadido a la lista de descargas: '${baseName}'${partInfo} -> '${folder}'`, 'info');
        }

        if (switchTabToDownloads) {
            switchTab('downloads');
        }
        renderDownloadsTable();
        updateBadges();
        syncHeaderCheckbox();
        checkDownloadButtonState();
    }

    async function promptAndAddTopicVideosToDownloadList(chatId, topicId, topicName) {
        if (isDownloading) return;
        const grupo = telegramData.find(g => String(g.id) === String(chatId));
        if (!grupo) return;
        const tema = (grupo.temas || []).find(t => String(t.id) === String(topicId));
        if (!tema || !tema.videos || tema.videos.length === 0) {
            addLog(`El tema '${topicName}' no contiene vídeos para descargar.`, 'warning');
            return;
        }

        addLog(`Selecciona la carpeta donde guardar los vídeos del tema '${topicName}'...`, 'info');
        let folder;
        try {
            folder = await window.TelegramAPI.selectFolder();
        } catch (err) {
            addLog(`Error al abrir selector de carpetas: ${err.message}`, 'error');
            return;
        }

        if (!folder) {
            addLog('Operación cancelada: no se seleccionó ninguna carpeta.', 'warning');
            return;
        }

        const uniqueBases = new Set();
        tema.videos.forEach(v => uniqueBases.add(getCleanVideoBaseName(v)));

        let count = 0;
        uniqueBases.forEach(baseName => {
            const matching = (tema.videos || []).filter(vn => getCleanVideoBaseName(vn).toLowerCase() === baseName.toLowerCase());
            const partsCount = matching.length > 1 ? matching.length : 1;

            const existing = downloadsList.find(it => String(it.chatId) === String(chatId) && it.name.toLowerCase() === baseName.toLowerCase());
            if (existing) {
                existing.dest = folder;
                existing.checked = true;
            } else {
                downloadsList.push({
                    id: 'dl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                    chatId: chatId,
                    topicId: topicId,
                    name: baseName,
                    parts: partsCount,
                    checked: true,
                    status: 'Pendiente',
                    percent: 0,
                    speed: null,
                    eta: null,
                    dest: folder,
                    error: null
                });
            }
            count++;
        });

        addLog(`Añadidos ${count} vídeos del tema '${topicName}' a la lista de descargas -> '${folder}'.`, 'success');
        switchTab('downloads');
        renderDownloadsTable();
        updateBadges();
        syncHeaderCheckbox();
        checkDownloadButtonState();
    }

    function renderDownloadsTable(prog = null) {
        if (!downloadsTableBody) return;

        if (!downloadsList || downloadsList.length === 0) {
            downloadsTableBody.innerHTML = `
                <tr class="empty-downloads-row">
                    <td colspan="5" class="empty-table-cell">
                        <div class="empty-state-box">
                            <svg class="icon-svg empty-state-icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                            <div class="empty-state-text">No hay descargas en la lista</div>
                            <div class="empty-state-subtext">Haz clic en el icono de descarga junto a cualquier tema o vídeo en el panel lateral para añadirlo a esta lista.</div>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        downloadsTableBody.innerHTML = '';

        downloadsList.forEach((item, index) => {
            const tr = document.createElement('tr');

            // 0. Columna Checkbox
            const tdCheck = document.createElement('td');
            tdCheck.className = 'download-check-cell';
            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.className = 'download-item-check';
            chk.dataset.id = item.id;
            chk.checked = Boolean(item.checked);
            chk.disabled = isDownloading;
            chk.title = chk.checked ? 'Desmarcar este vídeo' : 'Marcar este vídeo para descargar';
            chk.addEventListener('change', (e) => {
                e.stopPropagation();
                item.checked = chk.checked;
                syncHeaderCheckbox();
                checkDownloadButtonState();
            });
            tdCheck.appendChild(chk);

            // 1. Vídeo / Archivo
            const tdName = document.createElement('td');
            tdName.className = 'download-cell-name';
            const nameSpan = document.createElement('span');
            nameSpan.className = 'download-file-text';
            nameSpan.textContent = item.name;
            nameSpan.title = item.name;
            tdName.appendChild(nameSpan);

            if (item.parts > 1) {
                const partBadge = document.createElement('span');
                partBadge.className = 'download-part-badge';
                partBadge.textContent = `${item.parts} partes`;
                partBadge.title = `Archivo fraccionado en ${item.parts} partes binarias en Telegram`;
                tdName.appendChild(partBadge);
            }

            // 2. Carpeta Destino
            const tdDest = document.createElement('td');
            const destSpan = document.createElement('span');
            destSpan.className = 'download-dest-text';
            destSpan.textContent = item.dest || '-';
            destSpan.title = item.dest || 'Se asignará al descargar';
            tdDest.appendChild(destSpan);

            // 3. Estado / Progreso
            const tdProgress = document.createElement('td');
            const status = item.status || 'Pendiente';

            if (status.startsWith('Descargando')) {
                const container = document.createElement('div');
                container.className = 'download-progress-cell';

                const meta = document.createElement('div');
                meta.className = 'download-progress-meta';

                const statusText = document.createElement('span');
                statusText.className = 'download-progress-status-text status-curso';
                statusText.textContent = status;

                const speedText = document.createElement('span');
                speedText.className = 'download-progress-speed-text';
                const speedFormatted = item.speed ? window.TelegramAPI.formatSpeed(item.speed) : '';
                const etaFormatted = (item.eta !== null && item.eta !== undefined) ? `ETA: ${window.TelegramAPI.formatDuration(item.eta)}` : '';
                const stats = [speedFormatted, etaFormatted].filter(Boolean).join(' · ');
                speedText.textContent = stats;

                meta.appendChild(statusText);
                meta.appendChild(speedText);

                const track = document.createElement('div');
                track.className = 'download-bar-track';
                const fill = document.createElement('div');
                fill.className = 'download-bar-fill';
                fill.style.width = `${item.percent || 0}%`;
                track.appendChild(fill);

                container.appendChild(meta);
                container.appendChild(track);
                tdProgress.appendChild(container);

            } else if (status.startsWith('Uniendo')) {
                const container = document.createElement('div');
                container.className = 'download-progress-cell';

                const meta = document.createElement('div');
                meta.className = 'download-progress-meta';

                const statusText = document.createElement('span');
                statusText.className = 'download-progress-status-text status-curso';
                statusText.textContent = status;

                meta.appendChild(statusText);

                const track = document.createElement('div');
                track.className = 'download-bar-track';
                const fill = document.createElement('div');
                fill.className = 'download-bar-fill status-merging';
                track.appendChild(fill);

                container.appendChild(meta);
                container.appendChild(track);
                tdProgress.appendChild(container);

            } else if (status === 'Completado' || status === 'Finalizado OK') {
                tdProgress.innerHTML = `<span class="status-ok">Finalizado OK</span>`;
            } else if (status === 'Pendiente') {
                tdProgress.innerHTML = `<span class="status-pendiente">Pendiente</span>`;
            } else if (status === 'En cola ⏳' || status === 'En cola') {
                tdProgress.innerHTML = `<span class="status-pendiente">En cola</span>`;
            } else if (status === 'Cancelado') {
                tdProgress.innerHTML = `<span class="status-cancelado">Cancelado</span>`;
            } else if (status === 'Error') {
                tdProgress.innerHTML = `<span class="status-error" title="${item.error || 'Error en descarga'}">Error</span>`;
            } else {
                tdProgress.innerHTML = `<span>${status}</span>`;
            }

            // 4. Acción
            const tdAction = document.createElement('td');
            tdAction.className = 'td-delete';
            const isItemActive = status.startsWith('Descargando') || status.startsWith('Uniendo');

            if (!isItemActive) {
                const btnDel = document.createElement('button');
                btnDel.type = 'button';
                btnDel.className = 'btn-delete-row-icon';
                btnDel.innerHTML = SVG.trash;
                btnDel.title = isDownloading ? DOWNLOAD_LOCKED_MSG : 'Eliminar archivo de la lista';
                btnDel.disabled = isDownloading;
                btnDel.addEventListener('click', () => {
                    if (isDownloading) return;
                    downloadsList.splice(index, 1);
                    renderDownloadsTable();
                    updateBadges();
                    syncHeaderCheckbox();
                    checkDownloadButtonState();
                });
                tdAction.appendChild(btnDel);
            }

            tr.append(tdCheck, tdName, tdDest, tdProgress, tdAction);
            downloadsTableBody.appendChild(tr);
        });
    }

    async function executeDownloadProcess() {
        const checkedItems = downloadsList.filter(it => it.checked);
        if (checkedItems.length === 0) return;

        // Si algún elemento seleccionado no tiene carpeta de destino asignada (ej. restaurado sin dest), pedirla
        const missingDest = checkedItems.filter(it => !it.dest);
        if (missingDest.length > 0) {
            addLog(`Falta indicar ubicación en ${missingDest.length} vídeo(s). Selecciona la carpeta donde guardarlos...`, 'info');
            let folder;
            try {
                folder = await window.TelegramAPI.selectFolder();
            } catch (err) {
                addLog(`Error al abrir selector de carpetas: ${err.message}`, 'error');
                return;
            }

            if (!folder) {
                addLog('Descarga cancelada: no se seleccionó ninguna carpeta.', 'warning');
                return;
            }

            missingDest.forEach(it => {
                it.dest = folder;
            });
        }

        checkedItems.forEach(it => {
            it.status = 'En cola ⏳';
            it.percent = 0;
            it.speed = null;
            it.eta = null;
            it.error = null;
        });

        setDownloadLock(true);
        renderDownloadsTable();

        const itemsPayload = checkedItems.map(it => {
            if (!it.id) {
                it.id = 'dl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
            }
            return {
                id: it.id,
                chatId: it.chatId,
                topicId: it.topicId,
                videoName: it.name,
                dest: it.dest
            };
        });

        addLog(`Iniciando descarga de ${checkedItems.length} vídeo(s) hacia sus destinos asignados...`, 'info');

        try {
            await window.TelegramAPI.startDownload({
                destFolder: checkedItems[0].dest || '',
                itemsJson: JSON.stringify(itemsPayload)
            });
            startDownloadPolling();
        } catch (err) {
            setDownloadLock(false);
            checkedItems.forEach(it => {
                it.status = 'Error';
                it.error = err.message;
            });
            renderDownloadsTable();
            checkDownloadButtonState();
            addLog(`Error al iniciar descarga: ${err.message}`, 'error');
        }
    }

    if (btnDescargarContenido) {
        btnDescargarContenido.addEventListener('click', () => {
            if (isDownloading) return;
            executeDownloadProcess();
        });
    }

    if (btnReintentarDescarga) {
        btnReintentarDescarga.addEventListener('click', () => {
            if (isDownloading) return;
            downloadsList.forEach(it => {
                if (it.status === 'Error') {
                    it.checked = true;
                    it.status = 'Pendiente';
                    it.error = null;
                } else {
                    it.checked = false;
                }
            });
            syncHeaderCheckbox();
            renderDownloadsTable();
            checkDownloadButtonState();
            executeDownloadProcess();
        });
    }

    if (btnCancelarDescarga) {
        btnCancelarDescarga.addEventListener('click', async () => {
            if (!isDownloading) return;
            btnCancelarDescarga.disabled = true;
            btnCancelarDescarga.innerHTML = `<span class="btn-icon">${SVG.spinner}</span><span class="btn-text">Cancelando descarga...</span>`;
            addLog('Cancelando descarga en curso...', 'warning');
            try {
                await window.TelegramAPI.cancelDownload();
            } catch (e) {
                addLog(`Error al cancelar descarga: ${e.message}`, 'error');
            }
        });
    }

    if (btnClearCompletedDownloads) {
        btnClearCompletedDownloads.addEventListener('click', async () => {
            if (isDownloading) return;
            try {
                await window.TelegramAPI.clearDownloads();
                downloadsList = downloadsList.filter(item => {
                    const s = item.status || '';
                    return s.startsWith('Descargando') || s.startsWith('Uniendo') || s === 'En cola ⏳';
                });
                renderDownloadsTable();
                updateBadges();
                syncHeaderCheckbox();
                checkDownloadButtonState();
                addLog('Descargas completadas eliminadas de la lista.', 'info');
            } catch (e) {
                addLog(`Error al limpiar descargas: ${e.message}`, 'error');
            }
        });
    }

    function startDownloadPolling() {
        if (downloadPollInterval) clearInterval(downloadPollInterval);
        seenDownloadLogs.clear();

        downloadPollInterval = setInterval(async () => {
            try {
                const prog = await window.TelegramAPI.getDownloadProgress();
                if (!prog) return;

                if (prog.queue && Array.isArray(prog.queue)) {
                    prog.queue.forEach(qItem => {
                        const localItem = downloadsList.find(it => 
                            (qItem.id && it.id === qItem.id) ||
                            (qItem.original_name && it.name && it.name.toLowerCase() === qItem.original_name.toLowerCase()) ||
                            (it.name && qItem.name && it.name.toLowerCase() === qItem.name.toLowerCase())
                        );
                        if (localItem) {
                            if (qItem.name && localItem.name !== qItem.name) {
                                localItem.name = qItem.name;
                            }
                            localItem.status = qItem.status;
                            localItem.percent = qItem.percent;
                            localItem.speed = qItem.speed;
                            localItem.eta = qItem.eta;
                            localItem.dest = qItem.dest || localItem.dest;
                            localItem.error = qItem.error;
                            if (qItem.status === 'Completado' || qItem.status === 'Finalizado OK') {
                                localItem.checked = false;
                            }
                        }
                    });
                    renderDownloadsTable(prog);
                    updateBadges();
                    checkDownloadButtonState();
                }

                if (prog.logs && Array.isArray(prog.logs)) {
                    prog.logs.forEach(l => {
                        const logKey = `${l.ts}_${l.msg}`;
                        if (!seenDownloadLogs.has(logKey)) {
                            seenDownloadLogs.add(logKey);
                            addLog(l.msg, l.type || 'info');
                        }
                    });
                }

                if (!prog.active) {
                    clearInterval(downloadPollInterval);
                    downloadPollInterval = null;
                    if (prog.queue && Array.isArray(prog.queue)) {
                        prog.queue.forEach(qItem => {
                            const localItem = downloadsList.find(it => 
                                (qItem.id && it.id === qItem.id) ||
                                (qItem.original_name && it.name && it.name.toLowerCase() === qItem.original_name.toLowerCase()) ||
                                (it.name && qItem.name && it.name.toLowerCase() === qItem.name.toLowerCase())
                            );
                            if (localItem) {
                                if (qItem.name && localItem.name !== qItem.name) {
                                    localItem.name = qItem.name;
                                }
                                localItem.status = qItem.status;
                                localItem.percent = qItem.percent;
                                localItem.speed = qItem.speed;
                                localItem.eta = qItem.eta;
                                localItem.dest = qItem.dest || localItem.dest;
                                localItem.error = qItem.error;
                                if (qItem.status === 'Completado' || qItem.status === 'Finalizado OK') {
                                    localItem.checked = false;
                                }
                            }
                        });
                    }
                    setDownloadLock(false);
                    renderDownloadsTable(prog);
                    updateBadges();
                    syncHeaderCheckbox();
                    checkDownloadButtonState();
                    if (prog.error) {
                        addLog(`Descarga finalizada con error: ${prog.error}`, 'error');
                    }
                }
            } catch (e) {
                // Errores temporales de red/sondeo
            }
        }, 750);
    }

    // ------------------------------------------------- Nombres de episodio/serie
    function parseEpisodeNumber(filename, seasonHint = null) {
        if (!filename) return 1;

        // 1. S01E04 o s1e4
        const regexSE = /(?:^|[^0-9a-z])s(\d{1,2})e(\d{1,3})(?:[^0-9a-z]|$)/i;
        const matchSE = filename.match(regexSE);
        if (matchSE) return parseInt(matchSE[2], 10);

        // 2. 1x01 o 2x20 o 4x04
        const regexX = /(?:^|[^0-9a-z])\d{1,2}x(\d{1,3})(?:[^0-9a-z]|$)/i;
        const matchX = filename.match(regexX);
        if (matchX) return parseInt(matchX[1], 10);

        // 3. Cap.104 o Cap.401 (concatenación temporada + 2 dígitos de capítulo con Cap/Ep)
        // Debe evaluarse ANTES de regexWord para no ser devorado por \d{1,3}
        const regexCapConcat = /(?:capitulo|episodio|cap|ep)\.?\s*(\d{1,2})(\d{2})(?:[^0-9a-z]|$)/i;
        const matchCapConcat = filename.match(regexCapConcat);
        if (matchCapConcat) {
            if (!seasonHint || parseInt(matchCapConcat[1], 10) === seasonHint) {
                return parseInt(matchCapConcat[2], 10);
            }
        }

        // 4. Episodio 20, Cap. 04, Ep 3 (1 a 3 dígitos tras palabra clave)
        const regexWord = /(?:capitulo|episodio|cap|ep)\.?\s*(\d{1,3})(?:[^0-9a-z]|$)/i;
        const matchWord = filename.match(regexWord);
        if (matchWord) {
            const num = parseInt(matchWord[1], 10);
            if (seasonHint && num >= 100 && num <= 9999) {
                const numStr = String(num);
                const seasonStr = String(seasonHint);
                if (numStr.startsWith(seasonStr) && numStr.length === seasonStr.length + 2) {
                    return parseInt(numStr.slice(seasonStr.length), 10);
                }
            }
            return num;
        }

        // 5. Número de 3 dígitos con prefijo de temporada conocido en guion, corchete o espacio
        // Ej: " - 401", "_401", "[401]", " 401 "
        if (seasonHint && seasonHint > 0) {
            const seasonStr = String(seasonHint);
            const regexSeasonConcat = new RegExp('(?:^|[^0-9a-z])' + seasonStr + '(\\d{2})(?:[^0-9a-z]|$)', 'i');
            const matchSeasonConcat = filename.match(regexSeasonConcat);
            if (matchSeasonConcat) {
                const candidate = parseInt(seasonStr + matchSeasonConcat[1], 10);
                const isResolution = (candidate === 720 || candidate === 1080 || candidate === 2160);
                if (!isResolution) {
                    return parseInt(matchSeasonConcat[1], 10);
                }
            }
        }

        // 6. Concatenación genérica de 3 dígitos si no hay seasonHint: e.g. Cap.104
        const regexGenericCapConcat = /[Cc]ap\.?\s*\d(\d{2})(?:[^0-9a-z]|$)/i;
        const matchGenericCap = filename.match(regexGenericCapConcat);
        if (matchGenericCap) return parseInt(matchGenericCap[1], 10);

        // 7. - 01 o _01 o [01] o - 101
        const regexGuion = /(?:-\s*|_\s*|\[\s*)(\d{1,3})(?:\s*-|\s*_|\s*\]|\.|\s*$)/i;
        const matchGuion = filename.match(regexGuion);
        if (matchGuion) {
            const num = parseInt(matchGuion[1], 10);
            if (seasonHint && num >= 100 && num <= 9999) {
                const numStr = String(num);
                const seasonStr = String(seasonHint);
                if (numStr.startsWith(seasonStr) && numStr.length === seasonStr.length + 2) {
                    return parseInt(numStr.slice(seasonStr.length), 10);
                }
            }
            return num;
        }

        // 8. Cualquier número suelto de 1 o 2 dígitos
        const regexAnyNum = /(?:^|[^0-9a-z])(\d{1,2})(?:[^0-9a-z]|$)/i;
        const matchAnyNum = filename.match(regexAnyNum);
        if (matchAnyNum) return parseInt(matchAnyNum[1], 10);

        return 1;
    }

    function getSeriesInfo(categoryId, topicId) {
        let seriesName = '';
        let season = 1;

        if (serieNuevaCheck && serieNuevaCheck.checked) {
            seriesName = nombreSerieInput.value.trim();
            season = parseInt(temporadaInput.value.trim(), 10) || 1;
            return { seriesName, season };
        }

        const grupo = telegramData.find(g => g.id === categoryId);
        let topicName = '';
        if (grupo && grupo.temas) {
            const tId = topicId || (subcategoriaSelect ? subcategoriaSelect.value : null);
            const tema = grupo.temas.find(t => String(t.id) === String(tId));
            if (tema) topicName = tema.nombre.trim();
        }
        if (!topicName && subcategoriaSelect && subcategoriaSelect.selectedIndex >= 0) {
            const opt = subcategoriaSelect.options[subcategoriaSelect.selectedIndex];
            if (opt && opt.value) topicName = opt.text.trim();
        }

        if (topicName) {
            // Ejemplo: "Agatha y Lola - Temporada 1" o "Agatha y Lola - Temporada 2"
            const match = topicName.match(/^(.*?)\s*-\s*(?:Temporada|Temp\.?|T)\s*(\d+)\s*$/i);
            if (match) {
                seriesName = match[1].trim();
                season = parseInt(match[2], 10) || 1;
            } else {
                const matchDashNum = topicName.match(/^(.*?)\s*-\s*(\d+)\s*$/);
                if (matchDashNum) {
                    seriesName = matchDashNum[1].trim();
                    season = parseInt(matchDashNum[2], 10) || 1;
                } else {
                    seriesName = topicName.trim();
                    season = 1;
                }
            }
        }
        return { seriesName, season };
    }

    function getSeriesBaseCode(filename, categoryId, topicId) {
        const { seriesName, season } = getSeriesInfo(categoryId, topicId);
        const episode = parseEpisodeNumber(filename, season);
        const episodeStr = episode.toString().padStart(2, '0');
        const epCode = `${season}x${episodeStr}`;
        return seriesName ? `${seriesName} ${epCode}` : epCode;
    }

    function getTransformedName(item, categoryId, topicId = null) {
        const grupo = telegramData.find(g => g.id === categoryId);
        const hasTopics = grupo && grupo.tieneTemas;
        const nameWithoutExt = item.originalBase || (item.name ? item.name.substring(0, item.name.lastIndexOf('.')) : '') || item.name || '';

        if (item.isPart) {
            const partStr = item.partIndex.toString().padStart(3, '0');
            if (hasTopics) {
                // Serie fraccionada (> 2000 MB): "Agatha y Lola 2x20.mp4.001"
                const baseCode = getSeriesBaseCode(item.name || nameWithoutExt, categoryId, topicId);
                return `${baseCode}.mp4.${partStr}`;
            } else {
                // Película fraccionada (> 2000 MB): "NombrePelicula.mp4.001"
                return `${nameWithoutExt}.mp4.${partStr}`;
            }
        } else {
            if (hasTopics) {
                // Serie normal: "Agatha y Lola 1x01.mp4"
                const baseCode = getSeriesBaseCode(nameWithoutExt, categoryId, topicId);
                return `${baseCode}.mp4`;
            } else {
                // Película normal: "NombrePelicula.mp4"
                return `${nameWithoutExt}.mp4`;
            }
        }
    }

    function updatePendingTransformedNames() {
        const categoryId = categoriaSelect.value;
        const topicId = subcategoriaSelect.value || null;
        let changed = false;

        filesToUpload.forEach(fileObj => {
            if (!fileObj.isCustom && (fileObj.status === 'Pendiente Subir' || fileObj.status === 'Subido Previamente')) {
                const item = fileObj.rawItem || {
                    name: fileObj.originalName.replace(/\s*\(Parte\s+\d+\/\d+\)$/, ''),
                    isPart: fileObj.isPart,
                    partIndex: fileObj.partIndex,
                    totalParts: fileObj.totalParts
                };
                const newName = getTransformedName(item, categoryId, topicId);

                if (newName && newName !== fileObj.transformedName) {
                    fileObj.transformedName = newName;
                    changed = true;
                }
            }
        });

        if (changed) {
            renderTable();
        }
    }

    // ------------------------------------------------- Selección de archivos
    async function addFilesToQueue(items) {
        const categoryId = categoriaSelect.value;
        const topicId = subcategoriaSelect.value || null;

        btnSeleccionar.disabled = true;
        btnSubir.disabled = true;
        btnReintentar.disabled = true;

        for (const item of items) {
            const transformedName = getTransformedName(item, categoryId, topicId);
            const existe = await window.TelegramAPI.checkFileExists(transformedName, categoryId, topicId);
            const status = existe ? 'Subido Previamente' : 'Pendiente Subir';

            const displayName = item.isPart
                ? `${item.name} (Parte ${item.partIndex}/${item.totalParts})`
                : item.name;

            filesToUpload.push({
                id: item.id,
                size: item.size || 0,
                originalName: displayName,
                transformedName: transformedName,
                status: status,
                isPart: item.isPart || false,
                partIndex: item.partIndex,
                totalParts: item.totalParts,
                rawItem: item,
                isCustom: false,
            });

            if (item.isPart) {
                addLog(`Archivo grande dividido en cola: ${item.name} [Parte ${item.partIndex}/${item.totalParts}] -> ${transformedName} [${status}]`, "info");
            } else {
                addLog(`Archivo añadido a la cola: ${item.name} -> ${transformedName} [${status}]`, "info");
            }
        }

        validateForm();
        renderTable();
        checkUploadButtonState();
    }

    btnSeleccionar.addEventListener('click', async () => {
        btnSeleccionar.disabled = true;
        addLog("Abriendo el selector de archivos del equipo...", "info");
        try {
            const files = await window.TelegramAPI.selectFiles();
            if (files.length === 0) {
                addLog("No se ha seleccionado ningún archivo.", "info");
            } else {
                await addFilesToQueue(files);
            }
        } catch (error) {
            addLog(`Error al seleccionar archivos: ${error.message}`, "error");
        } finally {
            validateForm();
        }
    });

    // Evita que soltar un vídeo en la página haga que el navegador lo abra
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());

    // ------------------------------------------------------------------ Tabla
    function getStatusClass(status) {
        if (isWorkingStatus(status)) return 'status-curso';
        switch (status) {
            case 'Pendiente Subir': return 'status-pendiente';
            case 'Subido OK': return 'status-ok';
            case 'Error en subida': return 'status-error';
            case 'Subido Previamente': return 'status-previo';
            case 'Cancelado': return 'status-cancelado';
            default: return '';
        }
    }

    thOriginal.addEventListener('click', (e) => {
        if (e.target.closest('.resizer')) return;
        handleSort('originalName');
    });

    thTransformado.addEventListener('click', (e) => {
        if (e.target.closest('.resizer')) return;
        handleSort('transformedName');
    });

    function handleSort(column) {
        if (currentSortColumn === column) {
            currentSortAsc = !currentSortAsc;
        } else {
            currentSortColumn = column;
            currentSortAsc = true;
        }
        renderTable();
    }

    function updateSortIcons() {
        thOriginal.querySelector('.sort-icon').textContent = '';
        thTransformado.querySelector('.sort-icon').textContent = '';
        if (currentSortColumn === 'originalName') {
            thOriginal.querySelector('.sort-icon').textContent = currentSortAsc ? '▲' : '▼';
        } else if (currentSortColumn === 'transformedName') {
            thTransformado.querySelector('.sort-icon').textContent = currentSortAsc ? '▲' : '▼';
        }
    }

    function sortFiles() {
        if (!currentSortColumn || currentSortColumn === 'transformedName') {
            return [...filesToUpload].sort((a, b) => {
                const cmp = compareForUpload(a, b);
                return currentSortAsc ? cmp : -cmp;
            });
        }
        return [...filesToUpload].sort((a, b) => {
            if (currentSortColumn === 'originalName') {
                const cmp = naturalCompare(a.originalName, b.originalName);
                return currentSortAsc ? cmp : -cmp;
            }
            const valA = (a[currentSortColumn] || '').toLowerCase();
            const valB = (b[currentSortColumn] || '').toLowerCase();
            if (valA < valB) return currentSortAsc ? -1 : 1;
            if (valA > valB) return currentSortAsc ? 1 : -1;
            return 0;
        });
    }

    // Edición en línea del título transformado con el lápiz
    function startEditingTransformedName(fileObj, cellWrapper) {
        cellWrapper.innerHTML = '';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'input-edit-transformed';
        input.value = fileObj.transformedName;

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'edit-actions';

        const btnSave = document.createElement('button');
        btnSave.type = 'button';
        btnSave.className = 'btn-save-transformed';
        btnSave.title = 'Guardar';
        btnSave.innerHTML = SVG.check;

        const btnCancel = document.createElement('button');
        btnCancel.type = 'button';
        btnCancel.className = 'btn-cancel-transformed';
        btnCancel.title = 'Cancelar';
        btnCancel.innerHTML = SVG.cross;

        actionsDiv.append(btnSave, btnCancel);

        let isFinished = false;

        const save = () => {
            if (isFinished) return;
            isFinished = true;
            const val = input.value.trim();
            if (val && val !== fileObj.transformedName) {
                const oldName = fileObj.transformedName;
                fileObj.transformedName = val;
                fileObj.isCustom = true;
                addLog(`Título modificado: "${oldName}" -> "${val}"`, 'info');
            }
            renderTable();
        };

        const cancel = () => {
            if (isFinished) return;
            isFinished = true;
            renderTable();
        };

        btnSave.addEventListener('click', (e) => {
            e.stopPropagation();
            save();
        });

        btnCancel.addEventListener('click', (e) => {
            e.stopPropagation();
            cancel();
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                save();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
            }
        });

        cellWrapper.append(input, actionsDiv);
        input.focus();
        input.select();
    }

    // Render de filas
    function renderTable() {
        filesTableBody.innerHTML = '';

        if (!filesToUpload || filesToUpload.length === 0) {
            filesTableBody.innerHTML = `
                <tr class="empty-files-row">
                    <td colspan="4" class="empty-table-cell">
                        <div class="empty-state-box">
                            <svg class="icon-svg empty-state-icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                            <div class="empty-state-text">No hay vídeos seleccionados para subir</div>
                            <div class="empty-state-subtext">Selecciona la categoría y pulsa "Seleccionar vídeo(s)…" para añadir archivos a la lista.</div>
                        </div>
                    </td>
                </tr>
            `;
            updateSortIcons();
            updateBadges();
            checkUploadButtonState();
            return;
        }

        sortFiles().forEach(fileObj => {
            const tr = document.createElement('tr');

            // 1. Título Original
            const tdOriginal = document.createElement('td');
            tdOriginal.textContent = fileObj.originalName;
            tdOriginal.title = fileObj.originalName;

            // 2. Título Transformado con botón lápiz
            const tdTransformed = document.createElement('td');
            tdTransformed.className = 'td-transformed';

            const cellWrapper = document.createElement('div');
            cellWrapper.className = 'transformed-cell-wrapper';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'transformed-name-text';
            nameSpan.textContent = fileObj.transformedName;
            nameSpan.title = fileObj.transformedName;

            const btnEdit = document.createElement('button');
            btnEdit.type = 'button';
            btnEdit.className = 'btn-edit-transformed';
            btnEdit.title = isDownloading ? DOWNLOAD_LOCKED_MSG : 'Editar título transformado';
            btnEdit.innerHTML = SVG.pencil;
            btnEdit.disabled = isWorkingStatus(fileObj.status) || isDownloading;
            btnEdit.addEventListener('click', (e) => {
                e.stopPropagation();
                startEditingTransformedName(fileObj, cellWrapper);
            });

            cellWrapper.append(nameSpan, btnEdit);
            tdTransformed.appendChild(cellWrapper);

            // 3. Estado
            const tdStatus = document.createElement('td');
            tdStatus.id = `status-${fileObj.id}`;
            tdStatus.className = getStatusClass(fileObj.status);
            tdStatus.textContent = fileObj.status;
            tdStatus.title = fileObj.status;

            // 4. Eliminar
            const tdDelete = document.createElement('td');
            tdDelete.className = 'td-delete';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-delete-row-icon';
            btn.dataset.id = fileObj.id;
            btn.innerHTML = SVG.trash;
            btn.title = isDownloading ? DOWNLOAD_LOCKED_MSG : 'Eliminar archivo de la lista';
            btn.disabled = isWorkingStatus(fileObj.status) || isDownloading;
            btn.addEventListener('click', () => {
                fileToDeleteId = fileObj.id;
                deleteModal.classList.remove('hidden');
            });
            tdDelete.appendChild(btn);

            tr.append(tdOriginal, tdTransformed, tdStatus, tdDelete);
            filesTableBody.appendChild(tr);
        });
        updateSortIcons();
        updateBadges();
        checkUploadButtonState();
    }

    function updateRowStatus(id, newStatus) {
        const fileObj = filesToUpload.find(f => f.id === id);
        if (!fileObj) return;
        fileObj.status = newStatus;

        const statusCell = document.getElementById(`status-${id}`);
        if (statusCell) {
            statusCell.textContent = newStatus;
            statusCell.title = newStatus;
            statusCell.className = getStatusClass(newStatus);
        }
        const deleteBtn = filesTableBody.querySelector(`button[data-id="${id}"]`);
        if (deleteBtn) deleteBtn.disabled = isWorkingStatus(newStatus);

        const row = statusCell ? statusCell.closest('tr') : null;
        if (row) {
            const editBtn = row.querySelector('.btn-edit-transformed');
            if (editBtn) editBtn.disabled = isWorkingStatus(newStatus);
        }
        checkUploadButtonState();
    }

    // ------------------------------------ Redimensionamiento de columnas de la tabla
    function initTableResizers() {
        const resizers = document.querySelectorAll('.table-section .resizer');

        resizers.forEach(resizer => {
            const th = resizer.parentElement;
            let startX = 0;
            let startWidth = 0;

            const onMouseMove = (e) => {
                const diff = e.pageX - startX;
                const newWidth = Math.max(65, startWidth + diff);
                th.style.width = `${newWidth}px`;
            };

            const onMouseUp = () => {
                resizer.classList.remove('resizing');
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };

            resizer.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                startX = e.pageX;
                startWidth = th.offsetWidth;
                resizer.classList.add('resizing');
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });

            resizer.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        });
    }

    // ---------------------------------------------------------------- Borrado
    btnCancelDelete.addEventListener('click', () => { deleteModal.classList.add('hidden'); fileToDeleteId = null; });
    deleteModal.addEventListener('click', (e) => { if (e.target === deleteModal) { deleteModal.classList.add('hidden'); fileToDeleteId = null; } });
    btnConfirmDelete.addEventListener('click', () => {
        if (fileToDeleteId) {
            filesToUpload = filesToUpload.filter(f => f.id !== fileToDeleteId);
            renderTable();
            checkUploadButtonState();
            addLog("Archivo eliminado de la lista.", "info");
        }
        deleteModal.classList.add('hidden');
        fileToDeleteId = null;
    });

    if (btnClearAllUploads) {
        btnClearAllUploads.addEventListener('click', () => {
            if (!btnClearAllUploads.disabled && filesToUpload.length > 0 && deleteAllModal) {
                deleteAllModal.classList.remove('hidden');
            }
        });
    }
    if (btnCancelDeleteAll && deleteAllModal) {
        btnCancelDeleteAll.addEventListener('click', () => { deleteAllModal.classList.add('hidden'); });
        deleteAllModal.addEventListener('click', (e) => { if (e.target === deleteAllModal) deleteAllModal.classList.add('hidden'); });
    }
    if (btnConfirmDeleteAll) {
        btnConfirmDeleteAll.addEventListener('click', () => {
            filesToUpload = [];
            renderTable();
            checkUploadButtonState();
            addLog("Se han eliminado todos los archivos de la tabla.", "warning");
            if (deleteAllModal) deleteAllModal.classList.add('hidden');
        });
    }

    if (btnClearCompletedUploads) {
        btnClearCompletedUploads.addEventListener('click', () => {
            if (!btnClearCompletedUploads.disabled && filesToUpload.some(f => f.status === 'Subido OK') && deleteOkModal) {
                deleteOkModal.classList.remove('hidden');
            }
        });
    }
    if (btnCancelDeleteOk && deleteOkModal) {
        btnCancelDeleteOk.addEventListener('click', () => { deleteOkModal.classList.add('hidden'); });
        deleteOkModal.addEventListener('click', (e) => { if (e.target === deleteOkModal) deleteOkModal.classList.add('hidden'); });
    }
    if (btnConfirmDeleteOk) {
        btnConfirmDeleteOk.addEventListener('click', () => {
            const totalBefore = filesToUpload.length;
            filesToUpload = filesToUpload.filter(f => f.status !== 'Subido OK');
            renderTable();
            checkUploadButtonState();
            addLog(`Se han eliminado ${totalBefore - filesToUpload.length} archivo(s) con estado 'Subido OK'.`, "info");
            if (deleteOkModal) deleteOkModal.classList.add('hidden');
        });
    }

    // ---------------------------------------------------------------- Descarga de tema (Modal)
    if (btnConfirmDownloadTopic) {
        btnConfirmDownloadTopic.addEventListener('click', async () => {
            if (downloadTopicModal) downloadTopicModal.classList.add('hidden');
            if (pendingTopicDownload) {
                const { categoryId, topicId, topicName } = pendingTopicDownload;
                pendingTopicDownload = null;
                await promptAndAddTopicVideosToDownloadList(categoryId, topicId, topicName);
            }
        });
    }

    if (btnCancelDownloadTopic) {
        btnCancelDownloadTopic.addEventListener('click', () => {
            if (downloadTopicModal) downloadTopicModal.classList.add('hidden');
            pendingTopicDownload = null;
        });
    }

    if (downloadTopicModal) {
        downloadTopicModal.addEventListener('click', (e) => {
            if (e.target === downloadTopicModal) {
                downloadTopicModal.classList.add('hidden');
                pendingTopicDownload = null;
            }
        });
    }

    // ------------------------------------------------------------------ Subida
    async function runOne(fileObj, categoryId, topicId) {
        const startedAt = performance.now();
        updateRowStatus(fileObj.id, 'Preparando...');

        try {
            await window.TelegramAPI.uploadFile(
                fileObj, categoryId, topicId,
                (statusText) => { if (!cancelRequested) updateRowStatus(fileObj.id, statusText); }
            );
            const duration = window.TelegramAPI.formatDuration((performance.now() - startedAt) / 1000);
            updateRowStatus(fileObj.id, 'Subido OK');
            addLog(`Subida finalizada con éxito: ${fileObj.transformedName} (${duration})`, "success");
        } catch (error) {
            if (error.cancelled || cancelRequested) {
                updateRowStatus(fileObj.id, 'Cancelado');
                addLog(`Subida cancelada: ${fileObj.transformedName}`, "warning");
            } else {
                updateRowStatus(fileObj.id, 'Error en subida');
                addLog(`Error en ${fileObj.transformedName}: ${error.message}`, "error");
            }
        }
    }

    async function executeUploadProcess() {
        if (uploading) return;
        const categoryId = categoriaSelect.value;
        const topicId = subcategoriaSelect.value || null;

        uploading = true;
        cancelRequested = false;
        setFormLocked(true);
        btnSubir.disabled = true;
        btnReintentar.disabled = true;
        btnCrearTema.disabled = true;
        btnSeleccionar.disabled = true;
        if (btnClearAllUploads) btnClearAllUploads.disabled = true;
        if (btnClearCompletedUploads) btnClearCompletedUploads.disabled = true;
        btnCancelar.disabled = false;
        btnCancelar.classList.remove('hidden');

        addLog("Iniciando proceso de subida...", "info");

        const queue = filesToUpload.filter(f => UPLOADABLE.includes(f.status)).sort(compareForUpload);
        const grupo = telegramData.find(g => g.id === categoryId);
        const isTopic = Boolean(topicId || (grupo && grupo.tieneTemas));

        await new Promise((resolve) => {
            const running = new Set();
            let bigRunning = false;

            const pump = () => {
                if (!cancelRequested) {
                    while (queue.length > 0) {
                        const next = queue[0];
                        const isBig = (next.size || 0) > SMALL_FILE_BYTES;
                        if (isTopic) {
                            // Para temas/series: subida estrictamente secuencial para mantener orden 01, 02.part1, 02.part2, 03...
                            if (running.size > 0) break;
                        } else {
                            if (bigRunning) break;
                            if (isBig ? running.size > 0 : running.size >= SMALL_CONCURRENCY) break;
                        }

                        queue.shift();
                        running.add(next.id);
                        if (isBig) bigRunning = true;
                        runOne(next, categoryId, topicId).finally(() => {
                            running.delete(next.id);
                            if (isBig) bigRunning = false;
                            pump();
                        });
                    }
                }
                if (running.size === 0 && (queue.length === 0 || cancelRequested)) resolve();
            };
            pump();
        });

        uploading = false;
        btnCancelar.classList.add('hidden');
        setFormLocked(false);
        addLog(cancelRequested
            ? "Subida cancelada. Los archivos pendientes siguen en la lista."
            : "Cola de subida procesada.", cancelRequested ? "warning" : "info");
        cancelRequested = false;

        // Asegurar que ninguna fila quede en 'Cancelando...' ni en estado de ejecución
        filesToUpload.forEach(f => {
            if (f.status === 'Cancelando...' || isWorkingStatus(f.status)) {
                updateRowStatus(f.id, 'Cancelado');
            }
        });

        validateForm();
        checkUploadButtonState();

        if (filesToUpload.some(f => f.status === 'Subido OK')) {
            refreshSidebar();
        }
    }

    btnSubir.addEventListener('click', executeUploadProcess);

    btnReintentar.addEventListener('click', async () => {
        addLog("Preparando archivos para reintentar la subida...", "info");
        filesToUpload.forEach(fileObj => {
            if (fileObj.status === 'Error en subida') updateRowStatus(fileObj.id, 'Pendiente Subir');
        });
        await executeUploadProcess();
    });

    btnCancelar.addEventListener('click', async () => {
        if (!uploading || cancelRequested) return;
        cancelRequested = true;
        btnCancelar.disabled = true;
        addLog("Cancelando subida...", "warning");

        const running = filesToUpload.filter(f => isWorkingStatus(f.status));
        running.forEach(f => updateRowStatus(f.id, 'Cancelando...'));

        const ids = running.map(f => f.id);
        try {
            await window.TelegramAPI.cancelUploads(ids);
        } catch (error) {
            addLog(`No se pudo cancelar: ${error.message}`, "error");
        }
    });

    // Aviso si se intenta cerrar la pestaña mientras se sube
    window.addEventListener('beforeunload', (e) => {
        if (uploading) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    // -------------------------------------------------- Gestión de Canales
    async function openChannelsModal(focusInput = false) {
        if (!channelsModal) return;
        channelsModal.classList.remove('hidden');
        if (channelAddFeedback) {
            channelAddFeedback.className = 'channel-feedback hidden';
            channelAddFeedback.textContent = '';
        }
        if (inputNewChannel) inputNewChannel.value = '';
        if (btnSubmitAddChannel) {
            btnSubmitAddChannel.disabled = true;
            btnSubmitAddChannel.title = 'Introduce un canal válido donde el bot sea Administrador';
        }
        if (channelSuggestionsDropdown) {
            channelSuggestionsDropdown.classList.add('hidden');
            channelSuggestionsDropdown.innerHTML = '';
        }
        // Por defecto la ayuda inicia oculta y el botón inactivo
        if (channelHelpBlock) channelHelpBlock.classList.add('hidden');
        if (btnToggleChannelHelp) btnToggleChannelHelp.classList.remove('active');

        try {
            const res = await window.TelegramAPI.getKnownChannels();
            knownChannelsList = res.channels || [];
        } catch (e) {
            knownChannelsList = [];
        }
        loadChannelsManager();
        if (focusInput && inputNewChannel) {
            setTimeout(() => inputNewChannel.focus(), 100);
        }
    }

    function closeChannelsModal() {
        if (!channelsModal) return;
        channelsModal.classList.add('hidden');
        if (channelSuggestionsDropdown) channelSuggestionsDropdown.classList.add('hidden');
        if (channelHelpBlock) channelHelpBlock.classList.add('hidden');
        if (btnToggleChannelHelp) btnToggleChannelHelp.classList.remove('active');
    }

    function renderSuggestionsList(items, headerTitle = 'Canales sugeridos', filterQuery = '') {
        if (!channelSuggestionsDropdown) return;
        if (!items || items.length === 0) {
            channelSuggestionsDropdown.classList.add('hidden');
            channelSuggestionsDropdown.innerHTML = '';
            return;
        }

        channelSuggestionsDropdown.innerHTML = '';

        // Encabezado con título y botón de cerrar
        const header = document.createElement('div');
        header.className = 'channel-suggestions-header';

        const titleEl = document.createElement('span');
        titleEl.textContent = headerTitle;

        const btnClose = document.createElement('button');
        btnClose.type = 'button';
        btnClose.className = 'btn-close-suggestions';
        btnClose.title = 'Cerrar sugerencias';
        btnClose.textContent = '✕';
        btnClose.addEventListener('click', (e) => {
            e.stopPropagation();
            channelSuggestionsDropdown.classList.add('hidden');
        });

        header.append(titleEl, btnClose);
        channelSuggestionsDropdown.appendChild(header);

        // Lista de sugerencias
        items.slice(0, 8).forEach(c => {
            const item = document.createElement('div');
            item.className = 'channel-suggestion-item';

            const left = document.createElement('div');
            left.className = 'suggestion-left';

            const icon = document.createElement('span');
            icon.className = 'suggestion-icon';
            icon.textContent = c.forum ? '📂' : '📢';

            const text = document.createElement('div');
            text.className = 'suggestion-text';

            const titleSpan = document.createElement('span');
            titleSpan.className = 'suggestion-title';

            if (filterQuery) {
                const regex = new RegExp(`(${filterQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                titleSpan.innerHTML = (c.title || String(c.id)).replace(regex, '<mark>$1</mark>');
            } else {
                titleSpan.textContent = c.title || String(c.id);
            }

            const idSpan = document.createElement('span');
            idSpan.className = 'suggestion-id';
            idSpan.textContent = `ID: ${c.id}`;

            text.append(titleSpan, idSpan);
            left.append(icon, text);

            const badge = document.createElement('span');
            if (c.is_added) {
                badge.className = 'suggestion-badge registered';
                badge.textContent = c.visible ? '✔ Registrado' : '👁️‍🗨️ Oculto';
            } else if (c.is_admin) {
                badge.className = 'suggestion-badge detected';
                badge.textContent = '✨ Clic para añadir';
            } else {
                badge.className = 'suggestion-badge cached';
                badge.textContent = 'Disponible';
            }

            item.append(left, badge);

            item.addEventListener('click', (e) => {
                e.preventDefault();
                selectChannelSuggestion(c);
            });

            channelSuggestionsDropdown.appendChild(item);
        });

        channelSuggestionsDropdown.classList.remove('hidden');
    }

    function renderChannelSuggestions(filterText) {
        const q = (filterText || '').toLowerCase().trim();
        if (!q) {
            if (channelSuggestionsDropdown) channelSuggestionsDropdown.classList.add('hidden');
            return;
        }
        const matches = knownChannelsList.filter(c =>
            (c.title && c.title.toLowerCase().includes(q)) || String(c.id).includes(q)
        );
        if (matches.length > 0) {
            renderSuggestionsList(matches, `Canales sugeridos (${matches.length})`, q);
        } else if (channelSuggestionsDropdown) {
            channelSuggestionsDropdown.innerHTML = `
                <div class="channel-suggestions-header">
                    <span>Búsqueda</span>
                    <button type="button" class="btn-close-suggestions" title="Cerrar">✕</button>
                </div>
                <div class="suggestion-empty">No se encontraron canales guardados que coincidan con "${filterText.trim()}".<br>Si es un canal privado, pulsa <strong>"Detectar canales del bot"</strong> o pega el enlace del mensaje.</div>
            `;
            const closeBtn = channelSuggestionsDropdown.querySelector('.btn-close-suggestions');
            if (closeBtn) closeBtn.onclick = () => channelSuggestionsDropdown.classList.add('hidden');
            channelSuggestionsDropdown.classList.remove('hidden');
        }
    }

    function selectChannelSuggestion(c) {
        if (!inputNewChannel) return;
        selectedChannelToVerify = c;
        inputNewChannel.value = c.title || c.id;
        inputNewChannel.dataset.channelId = String(c.id);
        if (channelSuggestionsDropdown) channelSuggestionsDropdown.classList.add('hidden');

        if (c.is_added) {
            showChannelFeedback(`El canal "${c.title}" ya está registrado en tu lista inferior.`, 'info');
            if (btnSubmitAddChannel) {
                btnSubmitAddChannel.disabled = true;
                btnSubmitAddChannel.title = 'Este canal ya está registrado';
            }
        } else {
            verifyChannelAdmin(c.id);
        }
    }

    async function verifyChannelAdmin(channelInput) {
        if (!channelInput || !btnSubmitAddChannel) return;
        btnSubmitAddChannel.disabled = true;
        showChannelFeedback('Comprobando permisos del bot en Telegram...', 'info');

        try {
            const res = await window.TelegramAPI.checkChannel(channelInput);
            if (res.is_admin) {
                btnSubmitAddChannel.disabled = false;
                btnSubmitAddChannel.title = 'Añadir canal';
                const botName = res.bot_username ? `@${res.bot_username}` : 'el bot';
                showChannelFeedback(`✔ Canal verificado: el bot ${botName} es Administrador.`, 'success');
            } else {
                btnSubmitAddChannel.disabled = true;
                btnSubmitAddChannel.title = 'El bot no es Administrador';
                const botName = res.bot_username ? `@${res.bot_username}` : 'el bot';
                const errMsg = res.error || `El canal elegido no tiene al bot (${botName}) añadido como Administrador.`;
                showChannelFeedback(errMsg, 'error');
            }
        } catch (err) {
            btnSubmitAddChannel.disabled = true;
            showChannelFeedback(err.message || 'No se pudo verificar el canal', 'error');
        }
    }

    async function loadChannelsManager() {
        if (!channelsListContainer) return;
        channelsListContainer.innerHTML = '<div style="text-align:center; padding:15px; color:var(--text-muted);">Cargando canales...</div>';
        try {
            const data = await window.TelegramAPI.getChannels(true);
            if (modalBotName && data.bot) {
                modalBotName.textContent = `@${data.bot}`;
            }
            const channels = data.channels || [];
            if (channelsCount) channelsCount.textContent = channels.length;

            if (channels.length === 0) {
                channelsListContainer.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">No tienes ningún canal registrado todavía.</div>';
                return;
            }

            channelsListContainer.innerHTML = '';
            channels.forEach(ch => {
                const card = document.createElement('div');
                card.className = `channel-card ${!ch.visible ? 'channel-hidden' : ''}`;

                const left = document.createElement('div');
                left.className = 'channel-card-left';

                const icon = document.createElement('span');
                icon.className = 'channel-card-icon';
                icon.textContent = ch.forum ? '📂' : '📢';

                const info = document.createElement('div');
                info.className = 'channel-card-info';

                const titleRow = document.createElement('div');
                titleRow.className = 'channel-card-title-row';

                const titleSpan = document.createElement('span');
                titleSpan.className = 'channel-card-title';
                titleSpan.textContent = ch.title;
                titleSpan.title = ch.title;

                const badge = document.createElement('span');
                badge.className = 'channel-card-badge';
                badge.textContent = ch.forum ? 'Foro / Temas' : 'Canal Normal';

                titleRow.append(titleSpan, badge);

                const meta = document.createElement('span');
                meta.className = 'channel-card-meta';
                meta.textContent = `ID: ${ch.id}`;

                info.append(titleRow, meta);
                left.append(icon, info);

                const actions = document.createElement('div');
                actions.className = 'channel-card-actions';

                // Botón Visibilidad (Toggle)
                const btnToggle = document.createElement('button');
                btnToggle.type = 'button';
                btnToggle.className = `btn-channel-toggle ${ch.visible ? 'active' : ''}`;
                btnToggle.title = ch.visible ? 'Haz clic para ocultar de la aplicación' : 'Haz clic para mostrar en la aplicación';
                btnToggle.innerHTML = ch.visible ? `${SVG.eye} <span>Visible</span>` : `${SVG.eyeOff} <span>Oculto</span>`;
                btnToggle.addEventListener('click', async () => {
                    btnToggle.disabled = true;
                    try {
                        await window.TelegramAPI.toggleChannel(ch.id);
                        await loadChannelsManager();
                        await refreshSidebar();
                    } catch (err) {
                        alert(`Error al cambiar visibilidad: ${err.message}`);
                    }
                });

                // Botón Eliminar
                const btnDelete = document.createElement('button');
                btnDelete.type = 'button';
                btnDelete.className = 'btn-channel-delete btn-delete-row-icon';
                btnDelete.title = 'Eliminar este canal';
                btnDelete.innerHTML = SVG.trash;
                btnDelete.addEventListener('click', () => {
                    channelToDelete = ch;
                    if (deleteChannelModalText) {
                        deleteChannelModalText.textContent = `¿Estás seguro de que deseas eliminar el canal "${ch.title}"?`;
                    }
                    if (deleteChannelModal) deleteChannelModal.classList.remove('hidden');
                });

                actions.append(btnToggle, btnDelete);
                card.append(left, actions);
                channelsListContainer.appendChild(card);
            });
        } catch (error) {
            channelsListContainer.innerHTML = `<div style="text-align:center; padding:15px; color:var(--error);">Error al cargar: ${error.message}</div>`;
        }
    }

    async function handleAddChannel() {
        if (!inputNewChannel || !btnSubmitAddChannel || btnSubmitAddChannel.disabled) return;
        
        // Priorizar el ID verificado del canal si proviene de una sugerencia/detección
        const verifiedId = inputNewChannel.dataset.channelId || (selectedChannelToVerify ? String(selectedChannelToVerify.id) : null);
        const val = (verifiedId || inputNewChannel.value).trim();
        
        if (!val) {
            showChannelFeedback('Introduce un enlace (t.me/+...), @usuario o ID', 'error');
            return;
        }

        btnSubmitAddChannel.disabled = true;
        inputNewChannel.disabled = true;
        showChannelFeedback('Verificando y guardando canal en Telegram...', 'info');

        try {
            const res = await window.TelegramAPI.addChannel(val);
            if (res.ok) {
                showChannelFeedback(res.message || 'Canal añadido con éxito', 'success');
                inputNewChannel.value = '';
                delete inputNewChannel.dataset.channelId;
                selectedChannelToVerify = null;
                if (channelSuggestionsDropdown) channelSuggestionsDropdown.classList.add('hidden');
                await loadChannelsManager();
                await refreshSidebar();
            } else {
                showChannelFeedback(res.message || 'No se pudo añadir el canal', 'error');
            }
        } catch (err) {
            showChannelFeedback(err.message || 'Error al conectar con el canal', 'error');
        } finally {
            btnSubmitAddChannel.disabled = false;
            inputNewChannel.disabled = false;
        }
    }

    function showChannelFeedback(msg, type) {
        if (!channelAddFeedback) return;
        channelAddFeedback.className = `channel-feedback ${type}`;
        channelAddFeedback.textContent = msg;
        channelAddFeedback.classList.remove('hidden');
    }

    // -------------------------------------------------- Configuración del Bot
    function openBotConfigModal() {
        if (!botConfigModal) return;
        botConfigModal.classList.remove('hidden');
        if (botConfigFeedback) {
            botConfigFeedback.className = 'channel-feedback hidden';
            botConfigFeedback.textContent = '';
        }
        loadBotConfigData();
    }

    function closeBotConfigModal() {
        if (!botConfigModal) return;
        botConfigModal.classList.add('hidden');
    }

    async function loadBotConfigData() {
        try {
            const cfg = await window.TelegramAPI.getBotConfig();
            if (inputBotToken && cfg.token_preview) {
                inputBotToken.placeholder = `Token actual: ${cfg.token_preview}`;
            }
            if (inputApiId && cfg.api_id) {
                inputApiId.value = cfg.api_id;
            }
        } catch (e) {
            // Ignorar
        }
    }

    async function saveBotConfigHandler() {
        if (!inputBotToken || !btnSaveBotConfig) return;
        const token = inputBotToken.value.trim();
        if (!token) {
            showBotFeedback('Debes introducir el Token del Bot proporcionado por @BotFather', 'error');
            return;
        }

        btnSaveBotConfig.disabled = true;
        showBotFeedback('Conectando con Telegram y verificando bot...', 'info');

        try {
            const apiId = inputApiId ? inputApiId.value.trim() : null;
            const apiHash = inputApiHash ? inputApiHash.value.trim() : null;
            const res = await window.TelegramAPI.setBotConfig(token, apiId, apiHash);
            if (res.ok) {
                showBotFeedback(`✔ Conectado exitosamente como @${res.bot}`, 'success');
                if (headerBotUsername) headerBotUsername.textContent = `@${res.bot}`;
                if (modalBotName) modalBotName.textContent = `@${res.bot}`;
                inputBotToken.value = '';
                setTimeout(() => {
                    closeBotConfigModal();
                    checkHealth();
                    refreshSidebar();
                }, 1200);
            } else {
                showBotFeedback(res.message || 'No se pudo configurar el bot', 'error');
            }
        } catch (err) {
            showBotFeedback(err.message || 'Error al conectar con Telegram', 'error');
        } finally {
            btnSaveBotConfig.disabled = false;
        }
    }

    function showBotFeedback(msg, type) {
        if (!botConfigFeedback) return;
        botConfigFeedback.className = `channel-feedback ${type}`;
        botConfigFeedback.textContent = msg;
        botConfigFeedback.classList.remove('hidden');
    }

    if (btnConfigBot) btnConfigBot.addEventListener('click', openBotConfigModal);
    if (btnCloseBotConfigModal) btnCloseBotConfigModal.addEventListener('click', closeBotConfigModal);
    if (btnCancelBotConfig) btnCancelBotConfig.addEventListener('click', closeBotConfigModal);
    if (btnSaveBotConfig) btnSaveBotConfig.addEventListener('click', saveBotConfigHandler);
    if (btnToggleBotTokenVis && inputBotToken) {
        btnToggleBotTokenVis.addEventListener('click', () => {
            inputBotToken.type = inputBotToken.type === 'password' ? 'text' : 'password';
            btnToggleBotTokenVis.innerHTML = inputBotToken.type === 'password' ? SVG.eye : SVG.eyeOff;
        });
    }

    if (btnManageChannels) btnManageChannels.addEventListener('click', () => openChannelsModal(false));
    if (btnCloseChannelsModal) btnCloseChannelsModal.addEventListener('click', closeChannelsModal);
    if (btnRefreshChannelsList) btnRefreshChannelsList.addEventListener('click', loadChannelsManager);
    if (btnSubmitAddChannel) btnSubmitAddChannel.addEventListener('click', handleAddChannel);

    if (btnToggleChannelHelp && channelHelpBlock) {
        btnToggleChannelHelp.addEventListener('click', () => {
            const isHidden = channelHelpBlock.classList.toggle('hidden');
            btnToggleChannelHelp.classList.toggle('active', !isHidden);
        });
    }

    if (btnDetectChannels) {
        btnDetectChannels.addEventListener('click', async () => {
            btnDetectChannels.disabled = true;
            showChannelFeedback('Escaneando canales recientes del bot en Telegram...', 'info');
            try {
                const res = await window.TelegramAPI.detectChannels();
                const detected = res.detected || [];
                if (detected.length === 0) {
                    showChannelFeedback('No se detectaron canales nuevos. Asegúrate de enviar un mensaje en el canal (ej: "hola") para que el bot reciba la notificación.', 'error');
                    if (channelSuggestionsDropdown) channelSuggestionsDropdown.classList.add('hidden');
                } else {
                    // Actualizar lista en memoria con los detectados
                    detected.forEach(d => {
                        const existing = knownChannelsList.find(k => String(k.id) === String(d.id));
                        if (!existing) {
                            knownChannelsList.unshift(d);
                        } else {
                            existing.is_added = d.is_added;
                            existing.is_admin = d.is_admin;
                        }
                    });

                    // Mostrar siempre los canales detectados en el bloque de sugerencias
                    renderSuggestionsList(detected, `🔍 Canales detectados del bot (${detected.length})`);

                    const unadded = detected.filter(d => !d.is_added);
                    if (unadded.length > 0) {
                        showChannelFeedback(`✔ Se encontraron ${detected.length} canal(es). Haz clic sobre "${unadded[0].title}" en la lista de sugerencias para seleccionarlo y añadirlo.`, 'success');
                    } else {
                        showChannelFeedback(`Se detectaron ${detected.length} canal(es) donde el bot está activo. Ya se encuentran registrados en tu lista inferior.`, 'info');
                    }
                }
            } catch (err) {
                showChannelFeedback(err.message || 'Error al escanear canales', 'error');
            } finally {
                btnDetectChannels.disabled = false;
            }
        });
    }

    if (inputNewChannel) {
        inputNewChannel.addEventListener('input', () => {
            delete inputNewChannel.dataset.channelId;
            selectedChannelToVerify = null;
            const val = inputNewChannel.value;
            renderChannelSuggestions(val);
            if (btnSubmitAddChannel) btnSubmitAddChannel.disabled = true;

            clearTimeout(checkChannelDebounceTimer);
            const trimmed = val.trim();
            if (trimmed.startsWith('-100') || trimmed.startsWith('@') || trimmed.includes('t.me/')) {
                checkChannelDebounceTimer = setTimeout(() => {
                    verifyChannelAdmin(trimmed);
                }, 500);
            }
        });

        inputNewChannel.addEventListener('focus', () => {
            if (inputNewChannel.value.trim()) {
                renderChannelSuggestions(inputNewChannel.value);
            }
        });

        inputNewChannel.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (!btnSubmitAddChannel.disabled) {
                    handleAddChannel();
                } else if (inputNewChannel.value.trim()) {
                    verifyChannelAdmin(inputNewChannel.value.trim());
                }
            }
        });
    }

    // Ocultar sugerencias al hacer clic fuera
    document.addEventListener('click', (e) => {
        if (channelSuggestionsDropdown && !channelSuggestionsDropdown.contains(e.target) && e.target !== inputNewChannel) {
            channelSuggestionsDropdown.classList.add('hidden');
        }
    });

    if (btnConfirmDeleteChannel) {
        btnConfirmDeleteChannel.addEventListener('click', async () => {
            if (!channelToDelete) return;
            btnConfirmDeleteChannel.disabled = true;
            try {
                await window.TelegramAPI.deleteChannel(channelToDelete.id);
                if (deleteChannelModal) deleteChannelModal.classList.add('hidden');
                channelToDelete = null;
                await loadChannelsManager();
                await refreshSidebar();
            } catch (err) {
                alert(`Error al eliminar: ${err.message}`);
            } finally {
                btnConfirmDeleteChannel.disabled = false;
            }
        });
    }

    if (btnCancelDeleteChannel) {
        btnCancelDeleteChannel.addEventListener('click', () => {
            channelToDelete = null;
            if (deleteChannelModal) deleteChannelModal.classList.add('hidden');
        });
    }

    if (channelsModal) {
        channelsModal.addEventListener('click', (e) => {
            if (e.target === channelsModal) closeChannelsModal();
        });
    }
    if (botConfigModal) {
        botConfigModal.addEventListener('click', (e) => {
            if (e.target === botConfigModal) closeBotConfigModal();
        });
    }
    if (deleteChannelModal) {
        deleteChannelModal.addEventListener('click', (e) => {
            if (e.target === deleteChannelModal) {
                channelToDelete = null;
                deleteChannelModal.classList.add('hidden');
            }
        });
    }

    // -------------------------------------------------- Modal de Guía de Uso y Configuración
    const guideModal = document.getElementById('guideModal');
    const btnOpenGuideModal = document.getElementById('btnOpenGuideModal');
    const btnCloseGuideModal = document.getElementById('btnCloseGuideModal');
    const linkGuideFromBot = document.getElementById('linkGuideFromBot');
    const linkGuideFromChannels = document.getElementById('linkGuideFromChannels');
    const btnShortcutOpenBotConfig = document.getElementById('btnShortcutOpenBotConfig');
    const btnShortcutOpenApiConfig = document.getElementById('btnShortcutOpenApiConfig');
    const btnShortcutOpenChannels = document.getElementById('btnShortcutOpenChannels');

    function openGuideModal(openTopicId = null) {
        if (!guideModal) return;
        guideModal.classList.remove('hidden');

        // Cerrar otros modales si estuvieran abiertos
        if (channelsModal) channelsModal.classList.add('hidden');
        if (botConfigModal) botConfigModal.classList.add('hidden');

        const guideItems = guideModal.querySelectorAll('.guide-item');
        guideItems.forEach(item => {
            const content = item.querySelector('.guide-item-content');
            if (openTopicId && item.id === openTopicId) {
                item.classList.add('open');
                if (content) content.classList.remove('hidden');
                setTimeout(() => item.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 120);
            } else {
                item.classList.remove('open');
                if (content) content.classList.add('hidden');
            }
        });
    }

    function closeGuideModal() {
        if (!guideModal) return;
        guideModal.classList.add('hidden');
    }

    // Acordeón interactivo de guías
    const guideHeaders = document.querySelectorAll('.guide-item-header');
    guideHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const item = header.closest('.guide-item');
            const targetId = header.getAttribute('data-target');
            const content = targetId ? document.getElementById(targetId) : (item ? item.querySelector('.guide-item-content') : null);
            if (!item || !content) return;

            const isOpen = item.classList.contains('open');
            if (isOpen) {
                item.classList.remove('open');
                content.classList.add('hidden');
            } else {
                item.classList.add('open');
                content.classList.remove('hidden');
            }
        });
    });

    if (btnOpenGuideModal) btnOpenGuideModal.addEventListener('click', () => openGuideModal());
    if (btnCloseGuideModal) btnCloseGuideModal.addEventListener('click', closeGuideModal);

    // Enlaces directos cruzados
    if (linkGuideFromBot) {
        linkGuideFromBot.addEventListener('click', () => {
            openGuideModal('guideItemBotFather');
        });
    }
    if (linkGuideFromChannels) {
        linkGuideFromChannels.addEventListener('click', () => {
            openGuideModal('guideItemChannels');
        });
    }
    if (btnShortcutOpenBotConfig) {
        btnShortcutOpenBotConfig.addEventListener('click', () => {
            closeGuideModal();
            openBotConfigModal();
        });
    }
    if (btnShortcutOpenApiConfig) {
        btnShortcutOpenApiConfig.addEventListener('click', () => {
            closeGuideModal();
            openBotConfigModal();
            const adv = document.querySelector('.bot-advanced-details');
            if (adv) adv.open = true;
        });
    }
    if (btnShortcutOpenChannels) {
        btnShortcutOpenChannels.addEventListener('click', () => {
            closeGuideModal();
            openChannelsModal();
        });
    }
    const btnShortcutOpenChannelsFromTopics = document.getElementById('btnShortcutOpenChannelsFromTopics');
    if (btnShortcutOpenChannelsFromTopics) {
        btnShortcutOpenChannelsFromTopics.addEventListener('click', () => {
            closeGuideModal();
            openChannelsModal();
        });
    }

    if (guideModal) {
        guideModal.addEventListener('click', (e) => {
            if (e.target === guideModal) closeGuideModal();
        });
    }

    // -------------------------------------------------- Modal Acerca de TeleVault
    const aboutModal = document.getElementById('aboutModal');
    const btnAboutProject = document.getElementById('btnAboutProject');
    const btnCloseAboutModal = document.getElementById('btnCloseAboutModal');
    const btnConfirmCloseAboutModal = document.getElementById('btnConfirmCloseAboutModal');

    function openAboutModal() {
        if (!aboutModal) return;
        aboutModal.classList.remove('hidden');
    }

    function closeAboutModal() {
        if (!aboutModal) return;
        aboutModal.classList.add('hidden');
    }

    if (btnAboutProject) btnAboutProject.addEventListener('click', openAboutModal);
    if (btnCloseAboutModal) btnCloseAboutModal.addEventListener('click', closeAboutModal);
    if (btnConfirmCloseAboutModal) btnConfirmCloseAboutModal.addEventListener('click', closeAboutModal);

    if (aboutModal) {
        aboutModal.addEventListener('click', (e) => {
            if (e.target === aboutModal) closeAboutModal();
        });
    }

    // Tecla Escape para cerrar cualquier modal abierto de forma intuitiva
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (aboutModal && !aboutModal.classList.contains('hidden')) closeAboutModal();
            if (guideModal && !guideModal.classList.contains('hidden')) closeGuideModal();
            if (channelsModal && !channelsModal.classList.contains('hidden')) closeChannelsModal();
            if (botConfigModal && !botConfigModal.classList.contains('hidden')) closeBotConfigModal();
            if (deleteModal && !deleteModal.classList.contains('hidden')) {
                deleteModal.classList.add('hidden');
                fileToDelete = null;
            }
            if (downloadTopicModal && !downloadTopicModal.classList.contains('hidden')) {
                downloadTopicModal.classList.add('hidden');
                pendingTopicDownload = null;
            }
        }
    });

    btnClearLog.addEventListener('click', () => { logConsole.innerHTML = ''; });

    init();
});
