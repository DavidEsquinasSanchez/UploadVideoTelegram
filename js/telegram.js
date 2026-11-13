// js/telegram.js
// Cliente de la API local. El frontend lo sirve el propio backend (mismo origen), así que
// no hace falta CORS; cada llamada lleva el token de esta ejecución (meta "nigro-token").

const API_BASE_URL = '/api';
const API_TOKEN = (document.querySelector('meta[name="nigro-token"]') || {}).content || '';

class ApiError extends Error {
    constructor(message, status = 0) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

async function apiFetch(path, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set('X-API-Token', API_TOKEN);

    let response;
    try {
        response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
    } catch (error) {
        throw new ApiError('Sin conexión con el backend', 0);
    }
    if (response.status === 401) {
        throw new ApiError('Sesión caducada o servidor reiniciado: recarga la página (F5)', 401);
    }
    return response;
}

async function readError(response) {
    try {
        const data = await response.json();
        return typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
    } catch (e) {
        return `Error HTTP ${response.status}`;
    }
}

const TelegramAPI = {
    // Configuración del bot de Telegram
    async getBotConfig() {
        const response = await apiFetch('/config/bot');
        if (!response.ok) throw new Error(await readError(response));
        return await response.json();
    },

    async setBotConfig(botToken, apiId = null, apiHash = null) {
        const formData = new FormData();
        formData.append('botToken', botToken);
        if (apiId) formData.append('apiId', apiId);
        if (apiHash) formData.append('apiHash', apiHash);
        const response = await apiFetch('/config/bot', { method: 'POST', body: formData });
        if (!response.ok) throw new Error(await readError(response));
        return await response.json();
    },

    // Canales dinámicos
    async getChannels() {
        const response = await apiFetch('/channels');
        if (!response.ok) throw new Error(await readError(response));
        return await response.json();
    },

    async getKnownChannels() {
        const response = await apiFetch('/channels/known');
        if (!response.ok) throw new Error(await readError(response));
        return await response.json();
    },

    async checkChannel(channelInput) {
        const formData = new FormData();
        formData.append('channelInput', channelInput);
        const response = await apiFetch('/channels/check', { method: 'POST', body: formData });
        if (!response.ok) throw new Error(await readError(response));
        return await response.json();
    },

    async addChannel(channelInput) {
        const formData = new FormData();
        formData.append('channelInput', channelInput);
        const response = await apiFetch('/channels/add', { method: 'POST', body: formData });
        if (!response.ok) throw new Error(await readError(response));
        return await response.json();
    },

    async toggleChannel(channelId) {
        const formData = new FormData();
        formData.append('channelId', channelId);
        const response = await apiFetch('/channels/toggle', { method: 'POST', body: formData });
        if (!response.ok) throw new Error(await readError(response));
        return await response.json();
    },

    async deleteChannel(channelId, purgeCache = false) {
        const formData = new FormData();
        formData.append('channelId', channelId);
        formData.append('purgeCache', purgeCache ? 'true' : 'false');
        const response = await apiFetch('/channels/delete', { method: 'POST', body: formData });
        if (!response.ok) throw new Error(await readError(response));
        return await response.json();
    },

    // soloCache = true: respuesta instantánea con lo guardado; false: espera al escaneo de Telegram
    async getGrupos(soloCache = false) {
        if (!soloCache) addLog("Actualizando grupos, temas y vídeos desde Telegram...", "info");
        try {
            const response = await apiFetch(`/groups${soloCache ? '?scan=false' : ''}`);
            if (!response.ok) throw new Error(await readError(response));
            const grupos = await response.json();
            if (!soloCache) addLog("Grupos de TeleVault actualizados desde Telegram.", "success");
            return grupos;
        } catch (error) {
            addLog(`Error de conexión con el backend: ${error.message}`, "error");
            throw error;
        }
    },

    async createTopic(categoryId, topicName) {
        addLog(`Creando tema en Telegram: '${topicName}'...`, "info");
        try {
            const formData = new FormData();
            formData.append('categoryId', categoryId);
            formData.append('topicName', topicName);

            const response = await apiFetch('/create_topic', { method: 'POST', body: formData });
            if (!response.ok) throw new Error(await readError(response));
            return await response.json();
        } catch (error) {
            addLog(`Error al crear el tema: ${error.message}`, "error");
            throw error;
        }
    },

    async checkFileExists(filename, categoryId, topicId = null) {
        return false;
    },

    // Abre el selector nativo de archivos del equipo (lo abre el backend) y devuelve [{id, name, size}]
    async selectFiles() {
        const response = await apiFetch('/select_files', { method: 'POST' });
        if (!response.ok) throw new Error(await readError(response));
        return await response.json();
    },

    async health() {
        const response = await apiFetch('/health');
        if (!response.ok) throw new ApiError(await readError(response), response.status);
        return await response.json();
    },

    async cancelUploads(ids) {
        if (!ids.length) return { cancelled: [] };
        const formData = new FormData();
        formData.append('keys', ids.join(','));
        const response = await apiFetch('/cancel', { method: 'POST', body: formData });
        return response.ok ? await response.json() : { cancelled: [] };
    },

    // Abre el selector nativo de carpetas para elegir destino de descargas
    async selectFolder() {
        const response = await apiFetch('/select_folder', { method: 'POST' });
        if (!response.ok) throw new Error(await readError(response));
        const data = await response.json();
        return data.folder || '';
    },

    // Inicia una descarga en el backend (por lote estructurado o por vídeo/tema específico)
    async startDownload(arg1, topicId, videoName, destFolder) {
        const formData = new FormData();
        if (typeof arg1 === 'object' && arg1 !== null) {
            formData.append('destFolder', arg1.destFolder);
            if (arg1.itemsJson) formData.append('itemsJson', arg1.itemsJson);
            if (arg1.chatId) formData.append('chatId', arg1.chatId);
            if (arg1.topicId) formData.append('topicId', arg1.topicId);
            if (arg1.videoName) formData.append('videoName', arg1.videoName);
        } else {
            formData.append('chatId', arg1);
            if (topicId) formData.append('topicId', topicId);
            if (videoName) formData.append('videoName', videoName);
            formData.append('destFolder', destFolder);
        }

        const response = await apiFetch('/download', { method: 'POST', body: formData });
        if (!response.ok) throw new Error(await readError(response));
        return await response.json();
    },

    // Consulta el progreso y estado actual de la descarga
    async getDownloadProgress() {
        try {
            const response = await apiFetch('/download_progress');
            if (!response.ok) return { active: false };
            return await response.json();
        } catch (e) {
            return { active: false };
        }
    },

    // Cancela la descarga activa en curso
    async cancelDownload() {
        try {
            const response = await apiFetch('/cancel_download', { method: 'POST' });
            return response.ok ? await response.json() : { ok: false };
        } catch (e) {
            return { ok: false };
        }
    },

    // Limpia las descargas completadas/canceladas de la cola
    async clearDownloads() {
        try {
            const response = await apiFetch('/clear_downloads', { method: 'POST' });
            return response.ok ? await response.json() : { ok: false };
        } catch (e) {
            return { ok: false };
        }
    },

    // Formato de velocidad
    formatSpeed(bytesPerSec) {
        if (!bytesPerSec || bytesPerSec <= 0) return '';
        if (bytesPerSec >= 1024 * 1024) {
            return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
        }
        return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
    },

    // "45 s" · "3 min 20 s" · "1 h 05 min"
    formatDuration(totalSeconds) {
        const s = Math.max(0, Math.round(totalSeconds));
        if (s < 1) return 'menos de 1 s';
        if (s < 60) return `${s} s`;
        if (s < 3600) return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
        return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} min`;
    },

    // El archivo lo lee el backend directamente del disco (elegido con el selector nativo)
    async uploadFile(fileItem, categoryId, topicId, onProgress) {
        const key = fileItem.id;
        let active = true;

        const poll = async () => {
            try {
                const res = await apiFetch(`/progress/${encodeURIComponent(key)}`);
                if (!active || !res.ok) return;
                const data = await res.json();
                if (!active) return;
                if (data.status === 'Subiendo a Telegram') {
                    const resto = (data.eta === null || data.eta === undefined)
                        ? 'calculando...'
                        : `quedan ${TelegramAPI.formatDuration(data.eta)}`;
                    onProgress(`Subiendo... ${data.percent}% · ${resto}`);
                } else if (data.status.startsWith('Error:')) {
                    onProgress('Fallo interno');
                } else {
                    onProgress(data.status);
                }
            } catch (e) {
                // errores temporales del sondeo: se ignoran
            }
        };
        const pollInterval = setInterval(poll, 1000);

        try {
            const formData = new FormData();
            formData.append('fileId', key);
            formData.append('transformedName', fileItem.transformedName);
            formData.append('originalName', fileItem.originalName || '');
            formData.append('chatId', categoryId);
            formData.append('topicId', topicId || '');

            const response = await apiFetch('/upload', { method: 'POST', body: formData });
            if (response.ok) return await response.json();

            const message = await readError(response);
            const error = new Error(message);
            error.cancelled = (response.status === 409 && message === 'Cancelado');
            throw error;
        } finally {
            active = false;
            clearInterval(pollInterval);
        }
    }
};

window.TelegramAPI = TelegramAPI;