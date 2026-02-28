const BRAIN_API_URL = 'https://neuro-master.online/api';
let USER_ID = null;
const filesByMode = {};

// --- 1. ИНИЦИАЛИЗАЦИЯ И СКРЫТИЕ КНОПОК ОПЛАТЫ ---
vkBridge.send('VKWebAppInit');

function hidePaymentsOnMobile() {
    const urlParams = new URLSearchParams(window.location.search);
    const platform = urlParams.get('vk_platform');
    const isNativeApp = platform === 'mobile_android' || platform === 'mobile_iphone' || platform === 'mobile_ipad';
    if (isNativeApp) {
        document.querySelectorAll('.buy-btn').forEach(btn => btn.style.display = 'none');
    }
}
hidePaymentsOnMobile();

async function initUser() {
    try {
        const data = await vkBridge.send('VKWebAppGetUserInfo');
        if (data.id) {
            USER_ID = data.id;
            updateBalance();
        }
    } catch (e) { console.error("Ошибка получения профиля:", e); }
}
initUser();

// --- 2. БАЛАНС ---
function getAuthHeader() { return window.location.search.slice(1); }

function updateBalance() {
    if (!USER_ID) return;
    const balanceEl = document.getElementById('user-balance-display');
    if (balanceEl) balanceEl.textContent = "Обновление...";

    fetch(`${BRAIN_API_URL}/user/${USER_ID}`, {
        headers: { 'X-VK-Sign': getAuthHeader() }
    })
    .then(r => r.json())
    .then(info => { if (balanceEl) balanceEl.textContent = `Баланс: ${info.balance} кр.`; })
    .catch(() => { if (balanceEl) balanceEl.textContent = "Ошибка"; });
}
document.getElementById('refreshBalance')?.addEventListener('click', updateBalance);

// --- 3. ИНТЕРФЕЙС И КАСТОМНЫЕ ОКНА ---
function showCustomAlert(message, title = "Уведомление") {
    const modal = document.getElementById('customAlertModal');
    const messageEl = document.getElementById('customAlertMessage');
    const titleEl = document.getElementById('customAlertTitle');
    
    if (modal && messageEl) {
        if (titleEl) titleEl.textContent = title;
        messageEl.textContent = message;
        modal.classList.remove('hidden');
        document.body.classList.add('modal-open');
    }
}

document.getElementById('closeCustomAlert')?.addEventListener('click', () => {
    document.getElementById('customAlertModal').classList.add('hidden');
    document.body.classList.remove('modal-open');
});

function showLoader() { document.getElementById('loader')?.classList.remove('hidden'); document.body.classList.add('modal-open'); }
function hideLoader() { document.getElementById('loader')?.classList.add('hidden'); document.body.classList.remove('modal-open'); }

// Окно Помощи
document.getElementById('helpButton')?.addEventListener('click', () => {
    document.getElementById('helpModal')?.classList.remove('hidden');
    document.body.classList.add('modal-open');
});

document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
        document.getElementById('helpModal')?.classList.add('hidden');
        document.body.classList.remove('modal-open');
    });
});


// --- 4. РАБОТА С ФАЙЛАМИ И ВАЛИДАЦИЯ ---
const fileToBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

// НОВАЯ ФУНКЦИЯ: Проверка длительности аудио/видео
const checkMediaDuration = (file) => new Promise((resolve) => {
    const isVideo = file.type.startsWith('video/');
    const isAudio = file.type.startsWith('audio/');
    
    if (!isVideo && !isAudio) {
        resolve(0); // Это фото, пропускаем проверку длины
        return;
    }

    const mediaElement = document.createElement(isVideo ? 'video' : 'audio');
    const objectUrl = URL.createObjectURL(file);

    mediaElement.onloadedmetadata = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(mediaElement.duration);
    };
    mediaElement.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(0); // В случае ошибки чтения пропускаем (защита от багов браузера)
    };
    mediaElement.src = objectUrl;
});


document.querySelectorAll('.universal-upload-button').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const section = e.target.closest('.mode-section');
        const mode = section.dataset.mode;
        const type = e.target.dataset.type || 'photo';
        
        let input;
        if (type === 'video') input = section.querySelector('.video-upload-input');
        else if (type === 'audio') input = section.querySelector('.audio-upload-input');
        else input = section.querySelector('.file-upload-input');
        
        if (input) {
            input.onchange = async (event) => {
                const files = Array.from(event.target.files);
                const typeKey = type === 'video' ? 'videos' : (type === 'audio' ? 'audios' : 'photos');
                
                if (!filesByMode[mode]) filesByMode[mode] = { photos: [], videos: [], audios: [] };
                
                const accept = input.getAttribute('accept');
                for (let file of files) {
                    // Валидация формата
                    if (accept && accept !== '*/*' && !file.type.startsWith(accept.split('/')[0])) {
                        showCustomAlert(`Файл ${file.name} не поддерживается. Разрешены только ${accept}.`, "Неверный формат");
                        continue;
                    }

                    // НОВАЯ ВАЛИДАЦИЯ: Проверка длины видео и аудио (15 секунд + 1 сек буфер)
                    if (typeKey === 'videos' || typeKey === 'audios') {
                        const duration = await checkMediaDuration(file);
                        if (duration > 16) {
                            showCustomAlert(`Файл слишком длинный! Загрузите медиа не дольше 15 секунд. (У вас: ${Math.round(duration)} сек)`, "Превышен лимит времени");
                            continue; // Пропускаем этот файл, не добавляем
                        }
                    }

                    const max = parseInt(section.dataset.maxPhotos) || 1;
                    if (filesByMode[mode][typeKey].length < max) {
                        filesByMode[mode][typeKey].push(file);
                    } else {
                        showCustomAlert(`Достигнут лимит файлов.`, "Лимит");
                    }
                }
                updateUI(section);
                input.value = '';
            };
            input.click();
        }
    });
});

function removeFile(mode, type, index) {
    filesByMode[mode][type].splice(index, 1);
    updateUI(document.querySelector(`.mode-section[data-mode="${mode}"]`));
}

function updateUI(section) {
    const mode = section.dataset.mode;
    const files = filesByMode[mode] || { photos: [], videos: [], audios: [] };
    const max = parseInt(section.dataset.maxPhotos) || 1;
    
    const previewDiv = section.querySelector('.image-previews');
    if (previewDiv) {
        previewDiv.innerHTML = '';
        ['photos', 'videos', 'audios'].forEach(type => {
            files[type].forEach((f, i) => {
                const container = document.createElement('div');
                container.className = 'preview-container';
                if (type === 'photos' || type === 'videos') {
                    const el = document.createElement(type === 'photos' ? 'img' : 'video');
                    el.src = URL.createObjectURL(f);
                    el.className = 'preview-image';
                    container.appendChild(el);
                } else {
                    const span = document.createElement('div'); span.textContent = "🎵 Аудио готово"; container.appendChild(span);
                }
                const del = document.createElement('div');
                del.className = 'remove-btn'; del.innerHTML = '×';
                del.onclick = () => removeFile(mode, type, i);
                container.appendChild(del);
                previewDiv.appendChild(container);
            });
        });
    }

    const uploadBtn = section.querySelector('.universal-upload-button:not([data-type])') || section.querySelector('.universal-upload-button[data-type="photo"]');
    if (uploadBtn) {
        if (max > 1) uploadBtn.textContent = `Добавить фото (${files.photos.length}/${max})`;
        else uploadBtn.textContent = files.photos.length > 0 ? "Выбрать другое" : "1. Выбрать фото";
    }
    
    const videoBtn = section.querySelector('.universal-upload-button[data-type="video"]');
    if (videoBtn) videoBtn.textContent = files.videos.length > 0 ? "Видео выбрано ✅" : "2. Видео-шаблон (до 15 сек)";
    
    const audioBtn = section.querySelector('.universal-upload-button[data-type="audio"]');
    if (audioBtn) audioBtn.textContent = files.audios.length > 0 ? "Аудио выбрано ✅" : "2. Голосовое (до 15 сек)";

    const processBtn = section.querySelector('.process-button');
    if (processBtn) {
        let ready = ['t2i', 't2v', 'chat', 'music'].includes(mode) || files.photos.length > 0;
        processBtn.classList.toggle('hidden', !ready);
    }
}

// --- 5. ГЕНЕРАЦИЯ И ОПРОС ---
async function pollTaskStatus(taskId, section) {
    const pollInterval = setInterval(async () => {
        try {
            const response = await fetch(`${BRAIN_API_URL}/task_status/${taskId}?user_id=${USER_ID}`, {
                headers: { 'X-VK-Sign': getAuthHeader() }
            });
            const data = await response.json();

            if (data.success === true && data.result_url) {
                clearInterval(pollInterval);
                showResult(data);
                hideLoader();
                updateBalance();
            } else if (data.success === false) {
                clearInterval(pollInterval);
                hideLoader();
                showCustomAlert(data.error || "Произошла ошибка при генерации.", "Ошибка");
            }
        } catch (e) {
            clearInterval(pollInterval);
            hideLoader();
            showCustomAlert("Связь с сервером потеряна.", "Ошибка");
        }
    }, 3500);
}

function showResult(result) {
    const resultWrapper = document.getElementById('result-wrapper');
    const resultImage = document.getElementById('resultImage');
    const resultVideo = document.getElementById('resultVideo');
    const resultAudio = document.getElementById('resultAudio');

    if (!resultWrapper) return;

    resultWrapper.classList.remove('hidden');
    resultImage?.classList.add('hidden');
    resultVideo?.classList.add('hidden');
    resultAudio?.classList.add('hidden');

    const url = result.result_url || result.response;

    if (result.model === 'chat') { showCustomAlert(url, "Ответ помощника"); resultWrapper.classList.add('hidden'); return; }

    const isVideo = url.includes('.mp4') || url.includes('.mov');
    const isAudio = url.includes('.mp3') || url.includes('.wav');

    if (isVideo) {
        resultVideo.src = url; resultVideo.classList.remove('hidden');
    } else if (isAudio) {
        resultAudio.src = url; resultAudio.classList.remove('hidden');
    } else {
        resultImage.src = url; resultImage.classList.remove('hidden');
    }

    resultWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

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
            if (btn.dataset.style) {
                stylePrompt = btn.dataset.style;
                if (stylePrompt === 'custom') {
                    const customInp = section.querySelector('#custom-style-input');
                    stylePrompt = customInp ? customInp.value : '';
                    if (!stylePrompt) return showCustomAlert("Введите стиль!", "Ошибка");
                }
            }
        }

        if (!prompt && !['i2v', 'music', 'vip_clip', 'talking_photo'].includes(mode)) {
            return showCustomAlert("Пожалуйста, введите текстовое описание.", "Пустой запрос");
        }

        if (mode === 'music') {
            const lyricsLength = musicLyrics ? musicLyrics.length : 0;
            const styleLength = stylePrompt ? stylePrompt.length : 0;
            
            if (lyricsLength < 10 || lyricsLength > 600) {
                return showCustomAlert("Текст песни должен быть от 10 до 600 символов. У вас: " + lyricsLength, "Ошибка текста");
            }
            if (btn.dataset.style === 'custom') {
                if (styleLength < 10) return showCustomAlert("Пожалуйста, опишите свой стиль подробнее (не менее 10 символов).", "Ошибка стиля");
                if (styleLength > 300) return showCustomAlert("Стиль музыки не должен превышать 300 символов.", "Ошибка стиля");
            }
        }

        const files = filesByMode[mode] || { photos: [], videos: [], audios: [] };
        
        showLoader();
        btn.disabled = true;

        try {
            const requestBody = { user_id: USER_ID, model: mode, prompt: prompt, image_urls: [], style_prompt: stylePrompt, lyrics: musicLyrics };

            if (files.photos.length > 0) {
                for (let f of files.photos) requestBody.image_urls.push(await fileToBase64(f));
            }
            if (files.videos.length > 0) requestBody.video_url = await fileToBase64(files.videos[0]);
            if (files.audios.length > 0) requestBody.audio_url = await fileToBase64(files.audios[0]);

            const endpoint = mode === 'chat' ? `${BRAIN_API_URL}/chat` : `${BRAIN_API_URL}/generate`;
            
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-VK-Sign': getAuthHeader() },
                body: JSON.stringify(requestBody)
            });

            const result = await response.json();
            
            if (response.ok) {
                if (mode === 'chat') {
                    hideLoader();
                    showCustomAlert(result.response, "Ответ Нейро-Помощника");
                    if (promptInput) promptInput.value = '';
                } else if (result.task_id) {
                    pollTaskStatus(result.task_id, section);
                    if (promptInput) promptInput.value = '';
                    filesByMode[mode] = { photos: [], videos: [], audios: [] };
                    updateUI(section);
                }
            } else {
                throw new Error(result.detail || "Ошибка сервера");
            }

        } catch (e) {
            hideLoader();
            showCustomAlert(e.message, "Ошибка");
        } finally {
            btn.disabled = false;
        }
    });
});

// --- 6. ДОП. ФУНКЦИИ ---
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

document.getElementById('downloadButton')?.addEventListener('click', () => {
    const activeMedia = document.querySelector('#result-wrapper img:not(.hidden), #result-wrapper video:not(.hidden), #result-wrapper audio:not(.hidden)');
    const url = activeMedia?.src;
    if (!url) return;

    if (vkBridge.isWebView() && !url.includes('.mp4')) {
        vkBridge.send("VKWebAppShowImages", { images: [url] });
    } else {
        window.open(url, '_blank');
    }
});

document.getElementById('gallery-link')?.addEventListener('click', () => {
    vkBridge.send("VKWebAppOpenApp", { 
        "app_id": 51884181, 
        "location": "https://vk.com/hollie_ai_bot"
    }).catch(() => {
        window.open("https://vk.com/hollie_ai_bot", "_blank");
    });
});

document.querySelectorAll('.buy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        if (!USER_ID) return;
        const amount = parseInt(btn.dataset.amount);
        const credits = parseInt(btn.dataset.credits);
        showLoader();

        try {
            const response = await fetch(`${BRAIN_API_URL}/yookassa/create-payment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-VK-Sign': getAuthHeader() },
                body: JSON.stringify({ user_id: USER_ID, amount: amount, description: `Покупка ${credits} кредитов` })
            });

            const result = await response.json();
            if (result.success) {
                window.open(result.payment_url, '_blank');
            } else {
                throw new Error(result.detail || "Сервер платежей недоступен");
            }
        } catch (e) {
            showCustomAlert(e.message, "Ошибка оплаты");
        } finally {
            hideLoader();
        }
    });
});
