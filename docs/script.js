const BRAIN_API_URL = 'https://neuro-master.online/api';
let USER_ID = null;
const filesByMode = {};

// --- 1. ИНИЦИАЛИЗАЦИЯ VK BRIDGE И СКРЫТИЕ ОПЛАТЫ ---
vkBridge.send('VKWebAppInit');

// Требование модераторов: прячем кнопки оплаты на мобильных устройствах
function hidePaymentsOnMobile() {
    const urlParams = new URLSearchParams(window.location.search);
    const platform = urlParams.get('vk_platform');
    
    // Проверяем, мобильная ли это платформа или мобильное приложение ВК
    const isMobile = platform && (platform.includes('mobile') || platform === 'android' || platform === 'iphone');
    
    if (isMobile || vkBridge.isWebView()) {
        document.querySelectorAll('.buy-btn').forEach(btn => {
            btn.style.display = 'none'; // Полностью скрываем кнопки из интерфейса
        });
    }
}
// Вызываем сразу при загрузке
hidePaymentsOnMobile();

async function initUser() {
    try {
        const data = await vkBridge.send('VKWebAppGetUserInfo');
        if (data.id) {
            USER_ID = data.id;
            updateBalance();
        }
    } catch (e) {
        console.error("Ошибка получения профиля:", e);
    }
}
initUser();


// --- 2. БАЛАНС И АВТОРИЗАЦИЯ ---
function getAuthHeader() {
    return window.location.search.slice(1);
}

function updateBalance() {
    if (!USER_ID) return;
    const balanceEl = document.getElementById('user-balance-display');
    if (balanceEl) balanceEl.textContent = "⌛ Обновление...";

    fetch(`${BRAIN_API_URL}/user/${USER_ID}`, {
        headers: { 'X-VK-Sign': getAuthHeader() }
    })
    .then(r => r.json())
    .then(info => {
        if (balanceEl) balanceEl.textContent = `Баланс: ${info.balance} кр`;
    })
    .catch(() => {
        if (balanceEl) balanceEl.textContent = "⚠️ Ошибка";
    });
}


// --- 3. ИНТЕРФЕЙС И КАСТОМНЫЕ ОКНА (Баги №1, №2) ---
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

function showLoader() {
    document.getElementById('loader')?.classList.remove('hidden');
    document.body.classList.add('modal-open');
}

function hideLoader() {
    document.getElementById('loader')?.classList.add('hidden');
    document.body.classList.remove('modal-open');
}

// Окно Помощи
document.getElementById('helpButton')?.addEventListener('click', () => {
    document.getElementById('helpModal')?.classList.remove('hidden');
    document.body.classList.add('modal-open');
});
document.querySelector('.close-modal')?.addEventListener('click', () => {
    document.getElementById('helpModal')?.classList.add('hidden');
    document.body.classList.remove('modal-open');
});

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

    const url = result.result_url;
    if (!url) return;

    if (url.includes('.mp4') || url.includes('.mov')) {
        resultVideo.src = url;
        resultVideo.classList.remove('hidden');
    } else if (url.includes('.mp3') || url.includes('.wav')) {
        resultAudio.src = url;
        resultAudio.classList.remove('hidden');
    } else {
        resultImage.src = url;
        resultImage.classList.remove('hidden');
    }
    resultWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
}


// --- 4. ОПРОС СТАТУСА (Баги №3, №5) ---
async function pollTaskStatus(taskId) {
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
                showCustomAlert(data.error || "Произошла ошибка при генерации контента.", "Ошибка генерации");
            }
        } catch (e) {
            clearInterval(pollInterval);
            hideLoader();
            showCustomAlert("Связь с сервером потеряна. Попробуйте еще раз.", "Ошибка сети");
        }
    }, 3500); // Опрос каждые 3.5 секунды
}


// --- 5. РАБОТА С ФАЙЛАМИ И ВАЛИДАЦИЯ (Баги №7, №10) ---
const fileToBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

document.querySelectorAll('.universal-upload-button').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const section = e.target.closest('.mode-section');
        const mode = section.dataset.mode;
        const input = section.querySelector('input[type="file"]');

        if (input) {
            input.onchange = async (event) => {
                const files = Array.from(event.target.files);
                const typeKey = input.dataset.type || 'photos';
                
                if (!filesByMode[mode]) filesByMode[mode] = { photos: [], videos: [], audios: [] };
                
                const accept = input.getAttribute('accept');
                for (let file of files) {
                    // Строгая валидация формата файла
                    if (accept && accept !== '*/*' && !file.type.startsWith(accept.split('/')[0])) {
                        showCustomAlert(`Файл ${file.name} не поддерживается. Разрешены только ${accept}.`, "Неверный формат");
                        continue;
                    }

                    const max = parseInt(section.dataset.maxPhotos) || 1;
                    if (filesByMode[mode][typeKey].length < max) {
                        filesByMode[mode][typeKey].push(file);
                        if (typeKey === 'photos') {
                            const base64 = await fileToBase64(file);
                            const previewDiv = section.querySelector('.image-previews');
                            if (previewDiv) {
                                const span = document.createElement('div');
                                span.className = 'preview-image';
                                span.style.backgroundImage = `url(${base64})`;
                                previewDiv.appendChild(span);
                            }
                        }
                    } else {
                        showCustomAlert(`Достигнут лимит файлов для этого режима (${max} шт.).`, "Лимит файлов");
                    }
                }
                updateUI(section);
                input.value = '';
            };
            input.click();
        }
    });
});

function updateUI(section) {
    const mode = section.dataset.mode;
    const files = filesByMode[mode] || { photos: [], videos: [], audios: [] };
    
    const photoBtn = section.querySelector('.universal-upload-button:not([data-type]), .universal-upload-button[data-type="photos"]');
    if (photoBtn) {
        const max = parseInt(section.dataset.maxPhotos) || 1;
        photoBtn.textContent = files.photos.length > 0 ? `Выбрано (${files.photos.length}/${max})` : "1. Выбрать фото";
        if(files.photos.length > 0) photoBtn.style.border = "1px solid #2787F5";
    }

    const videoBtn = section.querySelector('.universal-upload-button[data-type="videos"]');
    if (videoBtn) videoBtn.textContent = files.videos.length > 0 ? "Видео выбрано ✅" : "2. Выбрать видео";

    const audioBtn = section.querySelector('.universal-upload-button[data-type="audios"]');
    if (audioBtn) audioBtn.textContent = files.audios.length > 0 ? "Аудио выбрано ✅" : "2. Выбрать аудио";
}


// --- 6. ОТПРАВКА НА ГЕНЕРАЦИЮ ---
document.querySelectorAll('.process-button').forEach(btn => {
    btn.addEventListener('click', async (event) => {
        const section = event.target.closest('.mode-section');
        const mode = section.dataset.mode;

        if (!USER_ID) return showCustomAlert("Пожалуйста, авторизуйтесь в приложении.", "Ошибка");

        const promptInput = section.querySelector('.prompt-input');
        const prompt = promptInput ? promptInput.value.trim() : '';

        if (!prompt && !['talking_photo', 'vip_clip'].includes(mode)) {
            return showCustomAlert("Пожалуйста, введите текстовое описание.", "Пустой запрос");
        }

        const files = filesByMode[mode] || { photos: [], videos: [], audios: [] };
        if (['vip_edit', 'i2v', 'quick_edit', 'vip_mix'].includes(mode) && files.photos.length === 0) {
            return showCustomAlert("Для этого режима нужно загрузить фото.", "Нет фото");
        }

        showLoader();
        btn.disabled = true;

        try {
            const requestBody = { user_id: USER_ID, model: mode, prompt: prompt, image_urls: [] };

            if (files.photos.length > 0) {
                for (let f of files.photos) requestBody.image_urls.push(await fileToBase64(f));
            }
            if (files.videos.length > 0) requestBody.video_url = await fileToBase64(files.videos[0]);
            if (files.audios.length > 0) requestBody.audio_url = await fileToBase64(files.audios[0]);

            // Если чат — отправляем на эндпоинт чата
            if (mode === 'chat') {
                 const chatResponse = await fetch(`${BRAIN_API_URL}/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-VK-Sign': getAuthHeader() },
                    body: JSON.stringify({user_id: USER_ID, prompt: prompt})
                });
                const chatResult = await chatResponse.json();
                hideLoader();
                btn.disabled = false;
                if(chatResponse.ok) {
                    showCustomAlert(chatResult.response, "Ответ Нейросети");
                    promptInput.value = '';
                } else {
                    showCustomAlert(chatResult.detail || "Ошибка чата", "Ошибка");
                }
                return;
            }

            const response = await fetch(`${BRAIN_API_URL}/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-VK-Sign': getAuthHeader() },
                body: JSON.stringify(requestBody)
            });

            const result = await response.json();
            if (response.ok && result.task_id) {
                pollTaskStatus(result.task_id); // Старт опроса
                if (promptInput) promptInput.value = '';
                filesByMode[mode] = { photos: [], videos: [], audios: [] };
                const previews = section.querySelector('.image-previews');
                if (previews) previews.innerHTML = '';
                updateUI(section);
            } else {
                throw new Error(result.detail || "Ошибка запуска генерации на сервере.");
            }
        } catch (e) {
            hideLoader();
            showCustomAlert(e.message, "Ошибка сервера");
        } finally {
            btn.disabled = false;
        }
    });
});


// --- 7. СКАЧИВАНИЕ (Баг №4) ---
document.getElementById('downloadButton')?.addEventListener('click', () => {
    const activeMedia = document.querySelector('#result-wrapper img:not(.hidden), #result-wrapper video:not(.hidden), #result-wrapper audio:not(.hidden)');
    const url = activeMedia?.src;
    if (!url) return;

    if (vkBridge.isWebView() && !url.includes('.mp4') && !url.includes('.mov')) {
        vkBridge.send("VKWebAppShowImages", { images: [url] });
    } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = `neuro_master_${Date.now()}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
});

document.getElementById('shareButton')?.addEventListener('click', () => {
    const activeMedia = document.querySelector('#result-wrapper img:not(.hidden), #result-wrapper video:not(.hidden)');
    if (activeMedia?.src) {
        vkBridge.send("VKWebAppShare", { "link": activeMedia.src });
    }
});

document.getElementById('refreshBalance')?.addEventListener('click', updateBalance);

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
                input.style.borderColor = '#2787F5';
                setTimeout(() => input.style.borderColor = '#D3D9DE', 1500);
            }
        }
    });
});


// --- 8. ОПЛАТА ЮKASSA (ТОЛЬКО ВЕБ) ---
const buyButtons = document.querySelectorAll('.buy-btn');
buyButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
        if (!USER_ID) return;
        
        const amount = parseInt(btn.dataset.amount);
        const credits = parseInt(btn.dataset.credits);
        showLoader();
        
        try {
            const response = await fetch(`${BRAIN_API_URL}/yookassa/create-payment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-VK-Sign': getAuthHeader()
                },
                body: JSON.stringify({
                    user_id: USER_ID,
                    amount: amount,
                    description: `Пополнение баланса: ${credits} кредитов`
                })
            });
            const result = await response.json();
            if (result.success && result.payment_url) {
                window.open(result.payment_url, '_blank');
            } else {
                throw new Error(result.detail || "Сервер платежей недоступен.");
            }
        } catch (e) {
            showCustomAlert(e.message, "Ошибка оплаты");
        } finally {
            hideLoader();
        }
    });
});
