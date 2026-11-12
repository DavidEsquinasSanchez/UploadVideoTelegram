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
    const collapsedChannels = new Set(); // canales colapsados (por defecto todos expandidos)

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

    const btnDeleteAll = document.getElementById('btnDeleteAll');
    const deleteAllModal = document.getElementById('deleteAllModal');
    const btnConfirmDeleteAll = document.getElementById('btnConfirmDeleteAll');
    const btnCancelDeleteAll = document.getElementById('btnCancelDeleteAll');

    const btnDeleteOk = document.getElementById('btnDeleteOk');
    const deleteOkModal = document.getElementById('deleteOkModal');
    const btnConfirmDeleteOk = document.getElementById('btnConfirmDeleteOk');
    const btnCancelDeleteOk = document.getElementById('btnCancelDeleteOk');

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

    const DOWNLOAD_LOCKED_MSG = "Descarga en curso. Al finalizar se volverá a habilitar";
    let isDownloading = false;
    let pendingTopicDownload = null;
    let downloadPollInterval = null;
    let seenDownloadLogs = new Set();
    let currentTab = 'uploads';
    let downloadsList = [];

    // --------------------------------------------------- Menú lateral colapsable
    function toggleSidebar() {
        if (!sidebar) return;
        const isCollapsed = sidebar.classList.toggle('collapsed');
        if (btnToggleSidebar) {
            btnToggleSidebar.textContent = isCollapsed ? '▶' : '◀';
            btnToggleSidebar.title = isCollapsed ? 'Descomprimir menú lateral' : 'Comprimir menú lateral';
        }
    }

    if (btnToggleSidebar) btnToggleSidebar.addEventListener('click', toggleSidebar);
    if (btnSidebarCollapse) btnSidebarCollapse.addEventListener('click', toggleSidebar);

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
        connDot.className = `conn-dot conn-${state}`;
        connText.textContent = text;
    }

    async function checkHealth() {
        try {
            const h = await window.TelegramAPI.health();
            if (!h.telegram) setConn('error', 'Telegram desconectado');
            else if (h.scanning) setConn('busy', 'Actualizando temas y vídeos...');
            else setConn('ok', h.bot ? `Conectado (@${h.bot})` : 'Conectado');
        } catch (error) {
            setConn('error', error.status === 401 ? 'Sesión caducada: recarga (F5)' : 'Sin conexión con el backend');
        }
    }

    // ------------------------------------------------------------------- Inicio
    async function init() {
        addLog("Iniciando aplicación y cargando interfaz...", "info");
        initTableResizers();
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
        telegramData.forEach(grupo => {
            const folderDiv = document.createElement('div');
            folderDiv.className = 'folder-item folder-collapsible';
            const isChannelCollapsed = collapsedChannels.has(grupo.id);
            if (!isChannelCollapsed) {
                folderDiv.classList.add('expanded');
            }

            const titleDiv = document.createElement('div');
            titleDiv.className = 'folder-title';
            titleDiv.tabIndex = 0;
            titleDiv.setAttribute('role', 'button');
            titleDiv.setAttribute('aria-expanded', String(!isChannelCollapsed));
            titleDiv.title = 'Haz clic para comprimir o descomprimir este canal';

            const toggleIcon = document.createElement('span');
            toggleIcon.className = 'folder-toggle-icon';
            toggleIcon.textContent = '▶';

            const folderIcon = document.createElement('span');
            folderIcon.className = 'folder-emoji';
            folderIcon.textContent = isChannelCollapsed ? '📁' : '📂';

            const titleText = document.createElement('span');
            titleText.className = 'folder-title-text';
            titleText.textContent = grupo.nombre;

            titleDiv.append(toggleIcon, folderIcon, titleText);
            folderDiv.appendChild(titleDiv);

            const toggleChannel = () => {
                if (collapsedChannels.has(grupo.id)) {
                    collapsedChannels.delete(grupo.id);
                } else {
                    collapsedChannels.add(grupo.id);
                }
                const nowCollapsed = collapsedChannels.has(grupo.id);
                folderDiv.classList.toggle('expanded', !nowCollapsed);
                titleDiv.setAttribute('aria-expanded', String(!nowCollapsed));
                folderIcon.textContent = nowCollapsed ? '📁' : '📂';
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
                        btnDlTopic.textContent = '⬇️';
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
                            btnDlVideo.textContent = '⬇️';
                            btnDlVideo.addEventListener('click', (e) => {
                                e.stopPropagation();
                                if (isDownloading) return;
                                addVideoToDownloadList(grupo.id, tema.id, v);
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
                    btnDlVideo.textContent = '⬇️';
                    btnDlVideo.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (isDownloading) return;
                        addVideoToDownloadList(grupo.id, null, v);
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

    serieNuevaCheck.addEventListener('change', (e) => {
        if (e.target.checked) {
            subcategoriaContainer.classList.add('hidden');
            nuevaSerieContainer.classList.remove('hidden');
            subcategoriaSelect.value = '';
        } else {
            subcategoriaContainer.classList.remove('hidden');
            nuevaSerieContainer.classList.add('hidden');
            nombreSerieInput.value = '';
            temporadaInput.value = '';
        }
        validateForm();
    });

    subcategoriaSelect.addEventListener('change', () => {
        validateForm();
        updatePendingTransformedNames();
    });
    nombreSerieInput.addEventListener('input', validateForm);
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

        if (isDownloading) {
            btnSeleccionar.disabled = true;
            btnSeleccionar.title = DOWNLOAD_LOCKED_MSG;
            btnSubir.disabled = true;
            btnSubir.title = DOWNLOAD_LOCKED_MSG;
            btnReintentar.disabled = true;
            btnReintentar.title = DOWNLOAD_LOCKED_MSG;
            btnCrearTema.disabled = !canCreateTopic;
            btnCrearTema.title = canCreateTopic ? 'Crear Tema' : '';
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
            btnCancelarDescarga.textContent = 'Cancelar subida';
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
            if (uploadViewControls) uploadViewControls.classList.remove('hidden');
            if (downloadViewControls) downloadViewControls.classList.add('hidden');
            validateForm();
            checkUploadButtonState();
        } else {
            if (tabDownloads) tabDownloads.classList.add('active');
            if (tabUploads) tabUploads.classList.remove('active');
            if (downloadsWrapper) downloadsWrapper.classList.remove('hidden');
            if (uploadsWrapper) uploadsWrapper.classList.add('hidden');
            if (downloadViewControls) downloadViewControls.classList.remove('hidden');
            if (uploadViewControls) uploadViewControls.classList.add('hidden');
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

    function addVideoToDownloadList(chatId, topicId, videoName, switchTabToDownloads = true) {
        if (!videoName || isDownloading) return;
        const baseName = getCleanVideoBaseName(videoName);

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
            existing.checked = true;
            addLog(`El vídeo '${baseName}' ya está en la lista de descargas (marcado).`, 'info');
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
                dest: '',
                error: null
            });
            const partInfo = partsCount > 1 ? ` (${partsCount} partes binarias)` : '';
            addLog(`Añadido a la lista de descargas: '${baseName}'${partInfo}`, 'info');
        }

        if (switchTabToDownloads) {
            switchTab('downloads');
        }
        renderDownloadsTable();
        updateBadges();
        syncHeaderCheckbox();
        checkDownloadButtonState();
    }

    function addTopicVideosToDownloadList(chatId, topicId, topicName) {
        if (isDownloading) return;
        const grupo = telegramData.find(g => String(g.id) === String(chatId));
        if (!grupo) return;
        const tema = (grupo.temas || []).find(t => String(t.id) === String(topicId));
        if (!tema || !tema.videos || tema.videos.length === 0) {
            addLog(`El tema '${topicName}' no contiene vídeos para descargar.`, 'warning');
            return;
        }

        const uniqueBases = new Set();
        tema.videos.forEach(v => uniqueBases.add(getCleanVideoBaseName(v)));

        let count = 0;
        uniqueBases.forEach(baseName => {
            addVideoToDownloadList(chatId, topicId, baseName, false);
            count++;
        });

        addLog(`Añadidos ${count} vídeos del tema '${topicName}' a la lista de descargas.`, 'success');
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
                    <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 36px 16px;">
                        <div style="font-size: 1.6rem; margin-bottom: 8px;">⬇️</div>
                        <div style="font-weight: 600; font-size: 0.95rem;">No hay descargas en la lista</div>
                        <div style="font-size: 0.85rem; margin-top: 6px; opacity: 0.8;">
                            Haz clic en el icono ⬇️ junto a cualquier tema o vídeo en el panel lateral para añadirlo a esta lista.
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
                statusText.textContent = `${status} ⚙️`;

                meta.appendChild(statusText);

                const track = document.createElement('div');
                track.className = 'download-bar-track';
                const fill = document.createElement('div');
                fill.className = 'download-bar-fill status-merging';
                track.appendChild(fill);

                container.appendChild(meta);
                container.appendChild(track);
                tdProgress.appendChild(container);

            } else if (status === 'Completado') {
                tdProgress.innerHTML = `<span class="status-ok">Completado ✅</span>`;
            } else if (status === 'Pendiente') {
                tdProgress.innerHTML = `<span class="status-pendiente">Pendiente</span>`;
            } else if (status === 'En cola ⏳') {
                tdProgress.innerHTML = `<span class="status-pendiente">En cola ⏳</span>`;
            } else if (status === 'Cancelado') {
                tdProgress.innerHTML = `<span class="status-cancelado">Cancelado ⚠️</span>`;
            } else if (status === 'Error') {
                tdProgress.innerHTML = `<span class="status-error" title="${item.error || 'Error en descarga'}">Error ❌</span>`;
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
                btnDel.className = 'btn-delete-row';
                btnDel.textContent = 'Eliminar';
                btnDel.title = isDownloading ? DOWNLOAD_LOCKED_MSG : 'Eliminar de la lista';
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

        addLog(`Selecciona la carpeta donde guardar los ${checkedItems.length} vídeo(s)...`, 'info');
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

        checkedItems.forEach(it => {
            it.dest = folder;
            it.status = 'En cola ⏳';
            it.percent = 0;
            it.speed = null;
            it.eta = null;
            it.error = null;
        });

        setDownloadLock(true);
        renderDownloadsTable();

        const itemsPayload = checkedItems.map(it => ({
            chatId: it.chatId,
            topicId: it.topicId,
            videoName: it.name
        }));

        addLog(`Iniciando descarga de ${checkedItems.length} vídeo(s) en '${folder}'...`, 'info');

        try {
            await window.TelegramAPI.startDownload({
                destFolder: folder,
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
            btnCancelarDescarga.textContent = 'Cancelando subida...';
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
                        const localItem = downloadsList.find(it => it.name.toLowerCase() === qItem.name.toLowerCase());
                        if (localItem) {
                            localItem.status = qItem.status;
                            localItem.percent = qItem.percent;
                            localItem.speed = qItem.speed;
                            localItem.eta = qItem.eta;
                            localItem.dest = qItem.dest || localItem.dest;
                            localItem.error = qItem.error;
                            if (qItem.status === 'Completado') {
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
        btnSave.textContent = '✔';

        const btnCancel = document.createElement('button');
        btnCancel.type = 'button';
        btnCancel.className = 'btn-cancel-transformed';
        btnCancel.title = 'Cancelar';
        btnCancel.textContent = '✖';

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
            btnEdit.textContent = '✏️';
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
            btn.className = 'btn-delete-row';
            btn.dataset.id = fileObj.id;
            btn.textContent = 'Eliminar';
            btn.title = isDownloading ? DOWNLOAD_LOCKED_MSG : '';
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
    }

    // ------------------------------------ Redimensionamiento de columnas de la tabla
    function initTableResizers() {
        if (!filesTable) return;
        const resizers = filesTable.querySelectorAll('.resizer');

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

    btnDeleteAll.addEventListener('click', () => { if (filesToUpload.length > 0) deleteAllModal.classList.remove('hidden'); });
    btnCancelDeleteAll.addEventListener('click', () => { deleteAllModal.classList.add('hidden'); });
    deleteAllModal.addEventListener('click', (e) => { if (e.target === deleteAllModal) deleteAllModal.classList.add('hidden'); });
    btnConfirmDeleteAll.addEventListener('click', () => {
        filesToUpload = [];
        renderTable();
        checkUploadButtonState();
        addLog("Se han eliminado todos los archivos de la lista.", "warning");
        deleteAllModal.classList.add('hidden');
    });

    btnDeleteOk.addEventListener('click', () => {
        if (filesToUpload.some(f => f.status === 'Subido OK')) deleteOkModal.classList.remove('hidden');
    });
    btnCancelDeleteOk.addEventListener('click', () => { deleteOkModal.classList.add('hidden'); });
    deleteOkModal.addEventListener('click', (e) => { if (e.target === deleteOkModal) deleteOkModal.classList.add('hidden'); });
    btnConfirmDeleteOk.addEventListener('click', () => {
        const totalBefore = filesToUpload.length;
        filesToUpload = filesToUpload.filter(f => f.status !== 'Subido OK');
        renderTable();
        checkUploadButtonState();
        addLog(`Se han eliminado ${totalBefore - filesToUpload.length} archivo(s) con estado 'Subido OK'.`, "info");
        deleteOkModal.classList.add('hidden');
    });

    // ---------------------------------------------------------------- Descarga de tema (Modal)
    if (btnConfirmDownloadTopic) {
        btnConfirmDownloadTopic.addEventListener('click', () => {
            if (downloadTopicModal) downloadTopicModal.classList.add('hidden');
            if (pendingTopicDownload) {
                const { categoryId, topicId, topicName } = pendingTopicDownload;
                pendingTopicDownload = null;
                addTopicVideosToDownloadList(categoryId, topicId, topicName);
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
            if (error.cancelled) {
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
        btnDeleteAll.disabled = true;
        btnDeleteOk.disabled = true;
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

        validateForm();
        btnDeleteAll.disabled = false;
        btnDeleteOk.disabled = false;
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

    btnClearLog.addEventListener('click', () => { logConsole.innerHTML = ''; });

    init();
});
