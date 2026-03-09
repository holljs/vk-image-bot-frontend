// script.js (v119 - НАДЕЖНАЯ ИНИЦИАЛИЗАЦИЯ + БЕЗОПАСНОСТЬ)

vkBridge.send('VKWebAppInit');
const BRAIN_API_URL = 'https://neuro-master.online/api';
let USER_ID = null;
let userIdInitialized = false;
const filesByMode = {};

const loader = document.getElementById('loader');
const resultWrapper = document.getElementById('result-wrapper');
const resultImage = document.getElementById('resultImage');
const resultVideo = document.getElementById('resultVideo');
const resultAudio = document.getElementById('resultAudio');
const downloadButton = document.getElementById('downloadButton');
const shareButton = document.getElementById('shareButton');
const helpModal = document.getElementById('helpModal');

// --- ГЛАВНАЯ ФИШКА БЕЗОПАСНОСТИ ---
function getAuthHeader() {
    // Берет строку ?vk_user_id=...&sign=... из адреса для подписи
    return window.location.search.slice(1);
}

// --- 1. ИНИЦИАЛИЗАЦИЯ (НАДЕЖНАЯ) ---
// Скрываем кнопки оплаты на мобильных сразу
const urlParams = new URLSearchParams(window.location.search);
const platform = urlParams.get('vk_platform');
const isMobileApp = ['mobile_android', 'mobile_iphone', 'mobile_ipad'].includes(platform);
if (isMobileApp) {
    document.querySelectorAll('.buy-btn').forEach(btn => btn.style.display = 'none');
}

// Получение ID (подписка + таймер)
vkBridge.subscribe(e => {
    if (e.detail && e.detail.type === 'VKWebAppUpdateConfig' && !userIdInitialized) {
        initUser();
    }
});

setTimeout(() => { 
    if (!userIdInitialized) {
        console.warn("Таймаут инициализации VK Bridge. Пробуем вручную...");
        initUser(); 
    }
}, 2000);

async function initUser() {
    try {
        const data = await vkBridge.send('VKWebAppGetUserInfo');
        if (data.id) {
            USER_ID = data.id;
            userIdInitialized = true;
            console.log("VK User ID получен:", USER_ID);
            updateBalance();
        }
    } catch (e) { 
        console.error("Ошибка получения профиля:", e); 
    }
}

function updateBalance() {
    if (!USER_ID) return;
    const balanceEl = document.getElementById('user-balance-display');
    if(balanceEl) balanceEl.textContent = "Обновление...";
    
    // ДОБАВЛЕН ЗАГОЛОВОК БЕЗОПАСНОСТИ ДЛЯ ИНИЦИАЛИЗАЦИИ
    fetch(`${BRAIN_API_URL}/user/${USER_ID}`, {
        headers: { 'X-VK-Sign': getAuthHeader() }
    })
        .then(r => r.json())
        .then(info => {
            if (balanceEl) balanceEl.textContent = `Баланс: ${info.balance} кр.`;
        })
        .catch(() => { if (balanceEl) balanceEl.textContent = "Ошибка"; });
}

// --- КНОПКИ ЛК И ПОМОЩИ ---
document.getElementById('refreshBalance')?.addEventListener('click', updateBalance);

document.getElementById('invite-friend-btn')?.addEventListener('click', () => {
    if (!USER_ID) return;
    vkBridge.send("VKWebAppShare", { "link": `https://vk.com/app51884181#${USER_ID}` });
});

document.getElementById('helpButton')?.addEventListener('click', () => {
    if (helpModal) helpModal.classList.remove('hidden');
});

document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
        if (helpModal) helpModal.classList.add('hidden');
    });
});

// --- КАСТОМНЫЕ АЛЕРТЫ (если вы их оставили в HTML) ---
function showCustomAlert(message, title = "Уведомление") {
    const modal = document.getElementById('customAlertModal');
    const messageEl = document.getElementById('customAlertMessage');
    const titleEl = document.getElementById('customAlertTitle');
    if (modal && messageEl) {
        if (titleEl) titleEl.textContent = title;
        messageEl.textContent = message;
        modal.classList.remove('hidden');
    } else {
        alert(title + ": " + message);
    }
}
document.getElementById('closeCustomAlert')?.addEventListener('click', () => {
    const modal = document.getElementById('customAlertModal');
    if(modal) modal.classList.add('hidden');
});

// --- БИЗНЕС-ЛОГИКА ---
document.querySelectorAll('.business-shortcut').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const targetMode = e.target.dataset.target;
        const promptText = e.target.dataset.prompt;
        const targetSection = document.querySelector(`.mode-section[data-mode="${targetMode}"]`);
        if (targetSection) {
            targetSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const input = targetSection.querySelector('.prompt-input');
            if (input) {
                input.value = promptText;
                input.style.borderColor = '#4CAF50';
                setTimeout(() => input.style.borderColor = '#dce1e6', 1000);
            }
        }
    });
});


// --- ЗАГРУЗКА ФАЙЛОВ ---
const checkMediaDuration = (file) => new Promise((resolve) => {
    const isVideo = file.type.startsWith('video/');
    const isAudio = file.type.startsWith('audio/');
    if (!isVideo && !isAudio) { resolve(0); return; }
    
    const mediaElement = document.createElement(isVideo ? 'video' : 'audio');
    const objectUrl = URL.createObjectURL(file);
    mediaElement.onloadedmetadata = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(mediaElement.duration);
    };
    mediaElement.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(0);
    };
    mediaElement.src = objectUrl;
});

document.querySelectorAll('.universal-upload-button').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const section = e.target.closest('.mode-section');
        const type = e.target.dataset.type || 'photo';
        let input;
        if (type === 'video') input = section.querySelector('.video-upload-input');
        else if (type === 'audio') input = section.querySelector('.audio-upload-input');
        else input = section.querySelector('.file-upload-input');
        if (input) input.click();
    });
});

document.querySelectorAll('.file-upload-input, .video-upload-input, .audio-upload-input').forEach(input => {
    input.addEventListener('change', async (e) => {
        const section = e.target.closest('.mode-section');
        const mode = section.dataset.mode;
        const newFiles = Array.from(e.target.files);
        if (!newFiles.length) return;

        let typeKey = 'photos';
        if (input.classList.contains('video-upload-input')) typeKey = 'videos';
        if (input.classList.contains('audio-upload-input')) typeKey = 'audios';

        if (!filesByMode[mode]) filesByMode[mode] = { photos: [], videos: [], audios: [] };
        
        const maxLim = parseInt(section.dataset.maxPhotos) || 1;
        if (maxLim === 1) filesByMode[mode][typeKey] = []; // Очищаем старые перед добавлением нового
        
        const accept = input.getAttribute('accept');

        for (let file of newFiles) {
            // Валидация формата
            if (typeKey === 'photos') {
                if (file.type.includes('svg') || file.name.toLowerCase().endsWith('.svg')) {
                    showCustomAlert(`Формат SVG не поддерживается. Загрузите JPG или PNG.`, "Неверный формат");
                    continue;
                }
                if (!file.type.startsWith('image/')) {
                    showCustomAlert(`Файл не является изображением.`, "Неверный формат");
                    continue;
                }
            } else if (accept && accept !== '*/*' && !file.type.startsWith(accept.split('/')[0])) {
                showCustomAlert(`Файл не поддерживается. Разрешены: ${accept}.`, "Неверный формат");
                continue;
            }

            // Валидация длины медиа
            if (typeKey === 'videos' || typeKey === 'audios') {
                const duration = await checkMediaDuration(file);
                if (duration > 16) {
                    showCustomAlert(`Файл слишком длинный! Загрузите медиа не дольше 15 секунд. (У вас: ${Math.round(duration)} сек)`, "Превышен лимит");
                    continue;
                }
            }

            if (maxLim === 1) {
                filesByMode[mode][typeKey] = [file];
            } else {
                if (filesByMode[mode][typeKey].length < maxLim) {
                    filesByMode[mode][typeKey].push(file);
                } else {
                    showCustomAlert(`Лимит файлов (${maxLim}).`, "Лимит");
                }
            }
        }
        
        updateUI(section);
        input.value = '';
    });
});

// Удаление загруженного файла (если вы добавили крестики в HTML)
function removeFile(mode, type, index) {
    if (filesByMode[mode] && filesByMode[mode][type]) {
        filesByMode[mode][type].splice(index, 1);
        const section = document.querySelector(`.mode-section[data-mode="${mode}"]`);
        if (section) updateUI(section);
    }
}

function updateUI(section) {
    const mode = section.dataset.mode;
    const files = filesByMode[mode] || { photos: [], videos: [], audios: [] };
    const maxPhotos = parseInt(section.dataset.maxPhotos) || 1;
    
    const previewDiv = section.querySelector('.image-previews');
    if (previewDiv) {
        previewDiv.innerHTML = '';
        ['photos', 'videos', 'audios'].forEach(type => {
            files[type].forEach((f, i) => {
                const container = document.createElement('div');
                container.className = 'preview-container';
                container.style.position = 'relative'; // Для позиционирования крестика
                container.style.display = 'inline-block';
                container.style.margin = '5px';

                if (type === 'photos' || type === 'videos') {
                    const el = document.createElement(type === 'photos' ? 'img' : 'video');
                    el.src = URL.createObjectURL(f);
                    el.className = 'preview-image';
                    el.style.width = '80px'; el.style.height = '80px'; el.style.objectFit = 'cover';
                    if (type === 'videos') el.muted = true;
                    container.appendChild(el);
                } else {
                    const span = document.createElement('div');
                    span.textContent = "🎵 Аудио";
                    span.className = 'preview-image';
                    span.style.width = '80px'; span.style.height = '80px'; span.style.display = 'flex'; span.style.alignItems = 'center'; span.style.justifyContent = 'center'; span.style.background = '#eee';
                    container.appendChild(span);
                }

                // Кнопка удаления
                const del = document.createElement('div');
                del.innerHTML = '×';
                del.style.position = 'absolute'; del.style.top = '-5px'; del.style.right = '-5px'; 
                del.style.background = 'red'; del.style.color = 'white'; del.style.borderRadius = '50%'; 
                del.style.width = '20px'; del.style.height = '20px'; del.style.cursor = 'pointer'; 
                del.style.lineHeight = '18px'; del.style.textAlign = 'center'; del.style.fontSize = '16px';
                del.onclick = () => removeFile(mode, type, i);
                container.appendChild(del);

                previewDiv.appendChild(container);
            });
        });
    }

    const uploadBtn = section.querySelector('.universal-upload-button:not([data-type])') || section.querySelector('.universal-upload-button[data-type="photo"]');
    if (uploadBtn) {
        if (maxPhotos > 1) {
            uploadBtn.textContent = files.photos.length > 0 ? `Добавить еще (${files.photos.length}/${maxPhotos})` : `1. Выбрать фото`;
            uploadBtn.disabled = files.photos.length >= maxPhotos;
        } else {
            uploadBtn.textContent = files.photos.length > 0 ? "1. Изменить фото" : "1. Выбрать фото";
        }
    }
    
    const videoBtn = section.querySelector('.universal-upload-button[data-type="video"]');
    if (videoBtn) videoBtn.textContent = files.videos.length > 0 ? "2. Изменить видео ✅" : "2. Выбрать видео";

    const audioBtn = section.querySelector('.universal-upload-button[data-type="audio"]');
    if (audioBtn) audioBtn.textContent = files.audios.length > 0 ? "2. Изменить аудио ✅" : "2. Выбрать аудио";

    const processBtn = section.querySelector('.process-button');
    if (processBtn) {
        let ready = false;
        if (['t2i', 't2v', 'chat', 'music'].includes(mode)) ready = true;
        else if (['vip_edit', 'i2v', 'quick_edit', 'vip_mix'].includes(mode) && files.photos.length > 0) ready = true;
        else if (mode === 'vip_clip' && files.photos.length > 0 && files.videos.length > 0) ready = true;
        else if (mode === 'talking_photo' && files.photos.length > 0 && files.audios.length > 0) ready = true;
        
        if (ready) processBtn.classList.remove('hidden');
        else processBtn.classList.add('hidden');
    }
}


// --- 5. ГЕНЕРАЦИЯ (BASE64 + ПОДПИСЬ) ---

const fileToBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

document.querySelectorAll('.process-button').forEach(btn => {
    btn.addEventListener('click', async (event) => {
        const section = event.target.closest('.mode-section');
        const mode = section.dataset.mode;
        
        if (!USER_ID) return showCustomAlert("Пожалуйста, авторизуйтесь.", "Ошибка");

        const promptInput = section.querySelector('.prompt-input');
        let prompt = promptInput ? promptInput.value.trim() : '';
        let stylePrompt = null;
        let musicLyrics = null;

        if (mode === 'music') {
            musicLyrics = prompt;
            if (event.target.dataset.style) {
                stylePrompt = event.target.dataset.style;
                if (stylePrompt === 'custom') {
                    const customInp = section.querySelector('#custom-style-input');
                    stylePrompt = customInp ? customInp.value.trim() : '';
                    if (!stylePrompt) return showCustomAlert("Введите стиль!", "Ошибка");
                }
            }
        }

        if (!prompt && !['i2v', 'music', 'vip_clip', 'talking_photo'].includes(mode)) {
            return showCustomAlert("Пожалуйста, введите текстовое описание.", "Пустой запрос");
        }
        
        const files = filesByMode[mode] || { photos: [], videos: [], audios: [] };
        
        // Очистка UI после нажатия
        filesByMode[mode] = { photos: [], videos: [], audios: [] };
        if (promptInput) promptInput.value = '';
        if (mode === 'music') {
            const customInp = section.querySelector('#custom-style-input');
            if(customInp) customInp.value = '';
        }
        updateUI(section);

        // Запуск
        event.target.disabled = true;
        showLoader();

        try {
            const requestBody = {
                user_id: USER_ID, model: mode, prompt: prompt,
                image_urls: [], audio_url: null, video_url: null,
                style_prompt: stylePrompt, lyrics: musicLyrics
            };

            if (files.photos.length > 0) {
                for (let f of files.photos) requestBody.image_urls.push(await fileToBase64(f));
            }
            if (files.videos.length > 0) requestBody.video_url = await fileToBase64(files.videos[0]);
            if (files.audios.length > 0) requestBody.audio_url = await fileToBase64(files.audios[0]);

            const endpoint = mode === 'chat' ? `${BRAIN_API_URL}/chat` : `${BRAIN_API_URL}/generate`;

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-VK-Sign': getAuthHeader() // ЗАГОЛОВОК ДЛЯ ГЕНЕРАЦИИ
                },
                body: JSON.stringify(requestBody)
            });

            const result = await response.json();

            if (response.ok) {
                if (mode === 'chat') {
                    hideLoader();
                    showCustomAlert(result.response, "Ответ Нейро-Помощника");
                } else if (result.task_id) {
                    // Если у вас на бэкенде включена очередь, мы поллим
                    pollTaskStatus(result.task_id, section);
                } else if (result.result_url) {
                    // Если бэкенд возвращает ответ сразу (синхронно)
                    hideLoader();
                    showResult(result);
                    updateBalance();
                }
            } else {
                throw new Error(result.detail || "Ошибка сервера");
            }

        } catch (error) {
            hideLoader();
            showCustomAlert(error.message, "Ошибка");
        } finally {
            event.target.disabled = false;
        }
    });
});

// Функция опроса задачи (если бэкенд возвращает task_id)
async function pollTaskStatus(taskId) {
    let attempts = 0; const maxAttempts = 150; let isTaskFinished = false;
    const pollInterval = setInterval(async () => {
        if (isTaskFinished) { clearInterval(pollInterval); return; }
        attempts++;
        if (attempts > maxAttempts) {
            clearInterval(pollInterval);
            if (!isTaskFinished) {
                hideLoader();
                showCustomAlert("Генерация занимает больше времени, чем ожидалось.", "Таймаут");
            }
            return;
        }
        try {
            const response = await fetch(`${BRAIN_API_URL}/task_status/${taskId}?user_id=${USER_ID}`, {
                headers: { 'X-VK-Sign': getAuthHeader() } // ЗАГОЛОВОК ПРИ ОПРОСЕ
            });
            if (!response.ok) return;
            
            const data = await response.json();
            if (data.success === true && data.result_url) {
                isTaskFinished = true;
                clearInterval(pollInterval);
                showResult(data);
                hideLoader();
                updateBalance();
            } else if (data.success === false && data.status !== "pending") {
                isTaskFinished = true;
                clearInterval(pollInterval);
                hideLoader();
                showCustomAlert(data.error || "Ошибка при генерации.", "Ошибка");
                updateBalance();
            }
        } catch (e) { console.warn("Polling error...", e); }
    }, 3500);
}

// --- 6. ОТОБРАЖЕНИЕ РЕЗУЛЬТАТА ---
function showLoader() { document.getElementById('loader')?.classList.remove('hidden'); }
function hideLoader() { document.getElementById('loader')?.classList.add('hidden'); }

function showResult(result) {
    const wrapper = document.getElementById('result-wrapper');
    const rImg = document.getElementById('resultImage');
    const rVid = document.getElementById('resultVideo');
    const rAud = document.getElementById('resultAudio');
    const dBtn = document.getElementById('downloadButton');
    
    if (!wrapper) return;
    wrapper.classList.remove('hidden');
    rImg?.classList.add('hidden'); rVid?.classList.add('hidden'); rAud?.classList.add('hidden');
    
    const url = result.result_url || result.response;
    if (result.model === 'chat') {
        showCustomAlert(url, "Ответ помощника");
        wrapper.classList.add('hidden');
        return;
    }
    
    const isVideo = url.includes('.mp4') || url.includes('.mov');
    const isAudio = url.includes('.mp3') || url.includes('.wav');
    
    // Настройка кнопки скачивания
    if (dBtn) {
        dBtn.href = url;
        if (!isVideo && !isAudio && vkBridge.isWebView()) {
            // Фото на телефоне открываем нативно
            dBtn.onclick = (e) => {
                e.preventDefault();
                vkBridge.send("VKWebAppShowImages", { images: [url] });
            };
        } else {
            // Видео/аудио пусть скачивается браузером
            dBtn.onclick = null;
        }
    }
    
    if (isVideo) {
        if(rVid) { rVid.src = url; rVid.classList.remove('hidden'); }
    } else if (isAudio) {
        if(rAud) { rAud.src = url; rAud.classList.remove('hidden'); }
    } else {
        if(rImg) { 
            rImg.src = url; rImg.classList.remove('hidden'); 
            rImg.style.cursor = 'pointer';
            rImg.onclick = () => {
                if (vkBridge.isWebView()) vkBridge.send("VKWebAppShowImages", { images: [url] });
                else window.open(url, '_blank');
            };
        }
    }
    wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Поделиться
document.getElementById('shareButton')?.addEventListener('click', () => {
    const rImg = document.getElementById('resultImage');
    if (rImg && rImg.src) vkBridge.send("VKWebAppShare", { "link": rImg.src });
});

// --- 7. ОПЛАТА ЮKASSA ---
if (!isMobileApp) {
    document.querySelectorAll('.buy-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!USER_ID) return showCustomAlert("Авторизуйтесь.", "Ошибка");
            const amount = parseInt(btn.dataset.amount);
            const credits = parseInt(btn.dataset.credits);
            showLoader();
            try {
                const response = await fetch(`${BRAIN_API_URL}/yookassa/create-payment`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-VK-Sign': getAuthHeader() },
                    body: JSON.stringify({ user_id: USER_ID, amount: amount, description: `Покупка ${credits} кр` })
                });
                const result = await response.json();
                if (result.success) window.open(result.payment_url, '_blank');
                else throw new Error(result.detail || "Сервер недоступен");
            } catch (e) {
                showCustomAlert(e.message, "Ошибка оплаты");
            } finally { hideLoader(); }
        });
    });
}
