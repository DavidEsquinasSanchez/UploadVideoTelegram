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
    // soloCache = true: respuesta instantánea con lo guardado; false: espera al escaneo de Telegram
    async getGrupos(soloCache = false) {
        if (!soloCache) addLog("Actualizando grupos, temas y vídeos desde Telegram...", "info");
        try {
            const response = await apiFetch(`/groups${soloCache ? '?scan=false' : ''}`);
            if (!response.ok) throw new Error(await readError(response));
            const grupos = await response.json();
            if (!soloCache) addLog("Grupos de NigroServer actualizados desde Telegram.", "success");
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