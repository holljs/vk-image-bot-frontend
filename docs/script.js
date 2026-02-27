// script.js (vFinal-FULL-SECURE)

vkBridge.send('VKWebAppInit');

// ✅ Твой домен. Убедись, что Nginx перенаправляет запросы с /api на порт 8001
const BRAIN_API_URL = 'https://neuro-master.online'; 

let USER_ID = null;
let userIdInitialized = false;

// Глобальное хранилище для загруженных файлов
const filesByMode = {};

// --- 1. ИНИЦИАЛИЗАЦИЯ И ПОЛЬЗОВАТЕЛЬ ---

async function initUser() {
    try {
        const data = await vkBridge.send('VKWebAppGetUserInfo');
        if (data.id) {
            USER_ID = data.id;
            userIdInitialized = true;
            updateBalance();
        }
    } catch (e) {
        console.error("Ошибка VK Bridge:", e);
        showCustomAlert("Не удалось загрузить данные профиля ВК. Попробуйте обновить страницу.");
    }
}

// Запуск инициализации с задержкой
setTimeout(() => {
    if (!userIdInitialized) initUser();
}, 2000);

// Обновление баланса через API
function updateBalance() {
    if (!USER_ID) return;
    const balanceEl = document.getElementById('user-balance-display');
    if (balanceEl) balanceEl.textContent = "⌛ Обновление...";

    fetch(`${BRAIN_API_URL}/api/user/${USER_ID}`, {
        headers: { 'X-VK-Sign': getAuthHeader() }
    })
    .then(r => r.json())
    .then(info => {
        if (balanceEl) balanceEl.textContent = `Баланс: ${info.balance} кр`;
    })
    .catch(() => {
        if (balanceEl) balanceEl.textContent = "⚠️ Ошибка баланса";
    });
}

function getAuthHeader() {
    return window.location.search.slice(1);
}

// Конвертация файла в строку Base64
const fileToBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

// --- 2. МОДАЛЬНЫЕ ОКНА И ИНТЕРФЕЙС ---

function showCustomAlert(message, title = "Уведомление") {
    const modal = document.getElementById('customAlertModal');
    const messageEl = document.getElementById('customAlertMessage');
    const titleEl = document.getElementById('customAlertTitle');

    if (modal && messageEl) {
        if (titleEl) titleEl.textContent = title;
        messageEl.textContent = message;
        modal.classList.remove('hidden');
        document.body.classList.add('modal-open'); // Ошибка №2: Блокировка скролла
    }
}

function hideCustomAlert() {
    const modal = document.getElementById('customAlertModal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.classList.remove('modal-open');
    }
}

document.getElementById('closeCustomAlert')?.addEventListener('click', hideCustomAlert);

function showLoader() {
    document.getElementById('loader')?.classList.remove('hidden');
    document.body.classList.add('modal-open');
}

function hideLoader() {
    document.getElementById('loader')?.classList.add('hidden');
    document.body.classList.remove('modal-open');
}

// --- 3. ОТОБРАЖЕНИЕ РЕЗУЛЬТАТОВ ---

function showResult(result) {
    const resultWrapper = document.getElementById('result-wrapper');
    const resultImage = document.getElementById('resultImage');
    const resultVideo = document.getElementById('resultVideo');
    const resultAudio = document.getElementById('resultAudio');

    if (!resultWrapper) return;

    resultWrapper.classList.remove('hidden');
    // Скрываем все элементы перед показом нужного
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

// --- 4. ПОЛЛИНГ (ОПРОС СЕРВЕРА) ---

async function pollTaskStatus(taskId) {
    const pollInterval = setInterval(async () => {
        try {
            const response = await fetch(`${BRAIN_API_URL}/api/task_status/${taskId}?user_id=${USER_ID}`, {
                headers: { 'X-VK-Sign': getAuthHeader() }
            });
            const data = await response.json();

            if (data.success === true && data.result_url) {
                // Готово!
                clearInterval(pollInterval);
                showResult(data);
                hideLoader();
                updateBalance();
            } else if (data.success === false) {
                // Ошибка на стороне сервера
                clearInterval(pollInterval);
                hideLoader();
                showCustomAlert(data.error || "Произошла ошибка при генерации.");
            }
            // Если "pending", продолжаем ждать (интервал сработает снова)
        } catch (e) {
            clearInterval(pollInterval);
            hideLoader();
            showCustomAlert("Потеряно соединение с сервером.");
        }
    }, 3000); // Каждые 3 секунды
}

// --- 5. ЗАГРУЗКА ФАЙЛОВ И UI КНОПОК ---

document.querySelectorAll('.universal-upload-button').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const section = e.target.closest('.mode-section');
        const mode = section.dataset.mode;
        const input = section.querySelector('input[type="file"]');

        if (input) {
            input.onchange = async (event) => {
                const files = Array.from(event.target.files);
                const typeKey = input.dataset.type || 'photos';
                
                if (!filesByMode[mode]) {
                    filesByMode[mode] = { photos: [], videos: [], audios: [] };
                }

                // Ошибка №7/10: Валидация формата
                const accept = input.getAttribute('accept');
                for (let file of files) {
                    if (accept && accept !== '*/*' && !file.type.startsWith(accept.split('/')[0])) {
                        showCustomAlert(`Файл ${file.name} имеет неверный формат.`);
                        continue;
                    }

                    const max = parseInt(section.dataset.maxPhotos) || 1;
                    if (filesByMode[mode][typeKey].length < max) {
                        filesByMode[mode][typeKey].push(file);

                        // Создаем превью только для фото
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
                        showCustomAlert(`Достигнут лимит файлов для этого режима (${max}).`);
                    }
                }
                updateUI(section);
                input.value = ''; // Сброс для повторной загрузки
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
    }

    const videoBtn = section.querySelector('.universal-upload-button[data-type="videos"]');
    if (videoBtn) videoBtn.textContent = files.videos.length > 0 ? "Видео выбрано ✅" : "2. Выбрать видео";

    const audioBtn = section.querySelector('.universal-upload-button[data-type="audios"]');
    if (audioBtn) audioBtn.textContent = files.audios.length > 0 ? "Аудио выбрано ✅" : "2. Выбрать аудио";
}

// --- 6. ОБРАБОТЧИК ГЕНЕРАЦИИ (ГЛАВНАЯ КНОПКА) ---

document.querySelectorAll('.process-button').forEach(btn => {
    btn.addEventListener('click', async (event) => {
        const section = event.target.closest('.mode-section');
        const mode = section.dataset.mode;

        if (!USER_ID) {
            showCustomAlert("Авторизуйтесь в приложении через ВК.");
            return;
        }

        const promptInput = section.querySelector('.prompt-input');
        const prompt = promptInput ? promptInput.value.trim() : '';

        // Ошибка №11: Валидация пустого промпта
        if (!prompt && !['talking_photo', 'vip_clip'].includes(mode)) {
            showCustomAlert("Пожалуйста, опишите словами, что нужно сделать.");
            return;
        }

        const files = filesByMode[mode] || { photos: [], videos: [], audios: [] };
        
        // Базовая проверка наличия фото для нужных режимов
        if (['vip_edit', 'i2v', 'quick_edit', 'vip_mix'].includes(mode) && files.photos.length === 0) {
            showCustomAlert("Для этого режима нужно загрузить хотя бы одно фото.");
            return;
        }

        showLoader();
        btn.disabled = true;

        try {
            const requestBody = {
                user_id: USER_ID,
                model: mode,
                prompt: prompt,
                image_urls: [],
                video_url: null,
                audio_url: null
            };

            // Подготовка файлов: конвертируем всё в Base64 перед отправкой (Ошибка №3: SSRF)
            if (files.photos.length > 0) {
                for (let f of files.photos) {
                    requestBody.image_urls.push(await fileToBase64(f));
                }
            }
            if (files.videos.length > 0) {
                requestBody.video_url = await fileToBase64(files.videos[0]);
            }
            if (files.audios.length > 0) {
                requestBody.audio_url = await fileToBase64(files.audios[0]);
            }

            // ШАГ 1: Отправляем запрос и получаем task_id
            const response = await fetch(`${BRAIN_API_URL}/api/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-VK-Sign': getAuthHeader()
                },
                body: JSON.stringify(requestBody)
            });

            const result = await response.json();

            if (response.ok && result.task_id) {
                // ШАГ 2: Переходим к ожиданию результата через поллинг
                pollTaskStatus(result.task_id);
                
                // Очистка полей
                if (promptInput) promptInput.value = '';
                filesByMode[mode] = { photos: [], videos: [], audios: [] };
                const previews = section.querySelector('.image-previews');
                if (previews) previews.innerHTML = '';
                updateUI(section);
            } else {
                throw new Error(result.detail || "Не удалось запустить генерацию.");
            }

        } catch (e) {
            hideLoader();
            showCustomAlert("Ошибка: " + e.message);
        } finally {
            btn.disabled = false;
        }
    });
});

// --- 7. ДОПОЛНИТЕЛЬНЫЕ ФУНКЦИИ (СКАЧИВАНИЕ, ПЛАТЕЖИ) ---

document.getElementById('downloadButton')?.addEventListener('click', () => {
    const activeMedia = document.querySelector('#result-wrapper img:not(.hidden), #result-wrapper video:not(.hidden), #result-wrapper audio:not(.hidden)');
    const url = activeMedia?.src;

    if (!url) return;

    if (vkBridge.isWebView()) {
        // Для мобилок используем нативный просмотрщик ВК (для картинок)
        if (!url.includes('.mp4') && !url.includes('.mov')) {
            vkBridge.send("VKWebAppShowImages", { images: [url] });
        } else {
            window.open(url, '_blank');
        }
    } else {
        // Ошибка №4: Исправление скачивания на десктопе
        const a = document.createElement('a');
        a.href = url;
        a.download = `neuro_master_${Date.now()}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
});

// Обработчик бизнес-кнопок (прокрутка и промпт)
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
                setTimeout(() => input.style.borderColor = '#dce1e6', 1500);
            }
        }
    });
});

// Оплата ЮKassa
const buyButtons = document.querySelectorAll('.buy-btn');
buyButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
        if (!USER_ID) return;
        const amount = parseInt(btn.dataset.amount);
        const credits = parseInt(btn.dataset.credits);
        showLoader();
        try {
            const response = await fetch(`${BRAIN_API_URL}/api/yookassa/create-payment`, {
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
                showCustomAlert("Ошибка платежного сервера. Попробуйте позже.");
            }
        } catch (e) {
            showCustomAlert("Не удалось создать счет на оплату.");
        } finally {
            hideLoader();
        }
    });
});

document.getElementById('shareButton')?.addEventListener('click', () => {
    const activeMedia = document.querySelector('#result-wrapper img:not(.hidden), #result-wrapper video:not(.hidden)');
    if (activeMedia?.src) {
        vkBridge.send("VKWebAppShare", { "link": activeMedia.src });
    }
});

document.getElementById('refreshBalance')?.addEventListener('click', updateBalance);
