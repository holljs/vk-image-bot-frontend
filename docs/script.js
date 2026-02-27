// script.js

const BRAIN_API_URL = "http://127.0.0.1:8001"; // API адрес бэкенда
let USER_ID = null;
let userIdInitialized = false;

// Глобальные переменные для хранения загруженных файлов
const filesByMode = {};

// --- ИНИЦИАЛИЗАЦИЯ ---

async function initUser() {
    try {
        const data = await vkBridge.send('VKWebAppGetUserInfo');
        if (data.id) {
            USER_ID = data.id;
            userIdInitialized = true;
            updateBalance();
        }
    } catch (e) {
        console.error("Ошибка VK API:", e);
    }
}

// Инициализация при запуске
setTimeout(() => {
    if (!userIdInitialized) initUser();
}, 2000);

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

function getAuthHeader() {
    return window.location.search.slice(1);
}

// Конвертация файла в Base64 для передачи в JSON
const fileToBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

// --- ИНТЕРФЕЙС И МОДАЛЬНЫЕ ОКНА ---

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

// Привязка закрытия алерта
const closeAlertBtn = document.getElementById('closeCustomAlert');
if (closeAlertBtn) {
    closeAlertBtn.addEventListener('click', hideCustomAlert);
}

function showLoader() {
    const loader = document.getElementById('loader');
    if (loader) loader.classList.remove('hidden');
    document.body.classList.add('modal-open'); // Ошибка №2
}

function hideLoader() {
    const loader = document.getElementById('loader');
    if (loader) loader.classList.add('hidden');
    document.body.classList.remove('modal-open');
}

// --- БАЛАНС ---

function updateBalance() {
    if (!USER_ID) return;
    const balanceEl = document.getElementById('user-balance-display');
    if (balanceEl) balanceEl.textContent = "Обновление...";

    fetch(`${BRAIN_API_URL}/api/user/${USER_ID}`, {
        headers: {
            'X-VK-Sign': getAuthHeader()
        }
    })
    .then(r => r.json())
    .then(info => {
        if (balanceEl) balanceEl.textContent = `Баланс: ${info.balance} кр`;
    })
    .catch(() => {
        if (balanceEl) balanceEl.textContent = "Ошибка"; // Ошибка №8
    });
}

// --- ОТОБРАЖЕНИЕ РЕЗУЛЬТАТА ---

function showResult(result) {
    const resultWrapper = document.getElementById('result-wrapper');
    const resultImage = document.getElementById('resultImage');
    const resultVideo = document.getElementById('resultVideo');
    const resultAudio = document.getElementById('resultAudio');

    if (resultWrapper && resultImage && resultVideo && resultAudio) {
        resultWrapper.classList.remove('hidden');
        
        // Скрываем всё перед показом
        resultImage.classList.add('hidden');
        resultVideo.classList.add('hidden');
        resultAudio.classList.add('hidden');

        const url = result.result_url;
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
        
        // Скроллим к результату
        resultWrapper.scrollIntoView({ behavior: 'smooth' });
    }
}

// --- ЛОГИКА ОПРОСА СТАТУСА (ПОЛЛИНГ) ---

async function pollTaskStatus(taskId) {
    // Ошибка №5: решение через периодическую проверку вместо ожидания
    const pollInterval = setInterval(async () => {
        try {
            const response = await fetch(`${BRAIN_API_URL}/api/task_status/${taskId}?user_id=${USER_ID}`, {
                headers: { 'X-VK-Sign': getAuthHeader() }
            });
            const data = await response.json();

            if (data.success === true && data.result_url) {
                // Генерация завершена успешно
                clearInterval(pollInterval);
                showResult(data);
                hideLoader();
                updateBalance();
            } else if (data.success === false) {
                // Сервер вернул ошибку генерации
                clearInterval(pollInterval);
                hideLoader();
                showCustomAlert(data.error || "Ошибка при генерации контента.");
            }
            // Если status: "pending", продолжаем ждать дальше
        } catch (e) {
            clearInterval(pollInterval);
            hideLoader();
            showCustomAlert("Связь с сервером потеряна.");
        }
    }, 3000); // Проверка каждые 3 секунды
}

// --- ОБРАБОТЧИКИ СОБЫТИЙ ---

// 1. Загрузка файлов
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
                const acceptAttr = input.getAttribute('accept');
                for (let file of files) {
                    if (acceptAttr && acceptAttr !== '*/*') {
                        const baseType = acceptAttr.split('/')[0];
                        if (!file.type.startsWith(baseType)) {
                            showCustomAlert(`Неверный формат файла ${file.name}.`);
                            continue;
                        }
                    }

                    const max = parseInt(section.dataset.maxPhotos) || 1;
                    if (filesByMode[mode][typeKey].length < max) {
                        filesByMode[mode][typeKey].push(file);
                        
                        // Превью для фото
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
                        showCustomAlert(`Лимит файлов: ${max}`);
                    }
                }
                updateUI(section);
                input.value = '';
            };
            input.click();
        }
    });
});

// 2. Кнопка генерации (Главная логика)
document.querySelectorAll('.process-button').forEach(btn => {
    btn.addEventListener('click', async (event) => {
        const section = event.target.closest('.mode-section');
        const mode = section.dataset.mode;

        if (!USER_ID) {
            showCustomAlert("Авторизуйтесь через ВК.");
            return;
        }

        const promptInput = section.querySelector('.prompt-input');
        const prompt = promptInput ? promptInput.value.trim() : '';

        // Ошибка №6/11: Валидация промпта
        if (!prompt && !['talking_photo', 'vip_clip'].includes(mode)) {
            showCustomAlert("Пожалуйста, введите описание.");
            return;
        }

        const files = filesByMode[mode] || { photos: [], videos: [], audios: [] };
        
        // Валидация наличия файлов
        if (['vip_edit', 'i2v', 'quick_edit', 'vip_mix'].includes(mode) && files.photos.length === 0) {
            showCustomAlert("Загрузите фото.");
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

            // Подготовка файлов (конвертация в Base64)
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

            // Отправка запроса (Шаг 1: Получаем task_id)
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
                // Шаг 2: Запускаем циклическую проверку готовности
                pollTaskStatus(result.task_id);
                
                // Очистка формы
                if (promptInput) promptInput.value = '';
                filesByMode[mode] = { photos: [], videos: [], audios: [] };
                const previews = section.querySelector('.image-previews');
                if (previews) previews.innerHTML = '';
                updateUI(section);
            } else {
                throw new Error(result.detail || "Ошибка сервера");
            }

        } catch (e) {
            hideLoader();
            showCustomAlert("Ошибка: " + e.message);
        } finally {
            btn.disabled = false;
        }
    });
});

// 3. Скачивание (Ошибка №4)
document.getElementById('downloadButton').addEventListener('click', () => {
    const activeMedia = document.querySelector('#result-wrapper img:not(.hidden), #result-wrapper video:not(.hidden), #result-wrapper audio:not(.hidden)');
    const url = activeMedia ? activeMedia.src : null;

    if (!url) return;

    if (vkBridge.isWebView()) {
        // В мобильном ВК используем нативный просмотрщик (для фото)
        if (url.includes('replicate.delivery') && !url.includes('.mp4')) {
            vkBridge.send("VKWebAppShowImages", { images: [url] });
        } else {
            // Для видео/аудио просто открываем в браузере
            window.open(url, '_blank');
        }
    } else {
        // Ошибка №4: Десктопное скачивание
        const a = document.createElement('a');
        a.href = url;
        a.download = `neuro_master_${Date.now()}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
});

// 4. Поделиться
const shareButton = document.getElementById('shareButton');
if (shareButton) {
    shareButton.addEventListener('click', () => {
        const activeMedia = document.querySelector('#result-wrapper img:not(.hidden), #result-wrapper video:not(.hidden), #result-wrapper audio:not(.hidden)');
        if (activeMedia && activeMedia.src) {
            vkBridge.send("VKWebAppShare", { "link": activeMedia.src });
        }
    });
}

// 5. Помощь
document.getElementById('helpButton')?.addEventListener('click', () => {
    const helpModal = document.getElementById('helpModal');
    if (helpModal) {
        helpModal.classList.remove('hidden');
        document.body.classList.add('modal-open');
    }
});

document.querySelector('.close-modal')?.addEventListener('click', () => {
    const helpModal = document.getElementById('helpModal');
    if (helpModal) {
        helpModal.classList.add('hidden');
        document.body.classList.remove('modal-open');
    }
});

// 6. Быстрые промпты
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

// --- ОБНОВЛЕНИЕ UI ---

function updateUI(section) {
    const mode = section.dataset.mode;
    const files = filesByMode[mode] || { photos: [], videos: [], audios: [] };
    
    const photoBtn = section.querySelector('.universal-upload-button:not([data-type]), .universal-upload-button[data-type="photos"]');
    if (photoBtn) {
        const max = parseInt(section.dataset.maxPhotos) || 1;
        photoBtn.textContent = files.photos.length > 0 ? `Выбрано (${files.photos.length}/${max})` : "1. Выбрать фото";
    }

    const videoBtn = section.querySelector('.universal-upload-button[data-type="videos"]');
    if (videoBtn) videoBtn.textContent = files.videos.length > 0 ? "Видео выбрано" : "2. Выбрать видео";

    const audioBtn = section.querySelector('.universal-upload-button[data-type="audios"]');
    if (audioBtn) audioBtn.textContent = files.audios.length > 0 ? "Аудио выбрано" : "2. Выбрать аудио";
}

// --- ПЛАТЕЖИ (ЮKASSA) ---
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
                    description: `Покупка ${credits} кредитов`
                })
            });
            const result = await response.json();
            if (result.success && result.payment_url) {
                window.open(result.payment_url, '_blank');
            } else {
                showCustomAlert("Не удалось создать платеж.");
            }
        } catch (e) {
            showCustomAlert("Ошибка платежной системы.");
        } finally {
            hideLoader();
        }
    });
});

document.getElementById('refreshBalance')?.addEventListener('click', updateBalance);
