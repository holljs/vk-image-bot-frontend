const BRAIN_API_URL = 'https://neuro-master.online/api';
let USER_ID = null;
const filesByMode = {};

// --- 1. ИНИЦИАЛИЗАЦИЯ И СКРЫТИЕ КНОПОК ОПЛАТЫ ---
vkBridge.send('VKWebAppInit');
hidePaymentsOnMobile();
initUser();

function hidePaymentsOnMobile() {
    const urlParams = new URLSearchParams(window.location.search);
    const platform = urlParams.get('vk_platform');
    
    // Скрываем только в нативных приложениях. На ПК и мобильном вебе (m.vk.com) оплата останется!
    const isNativeApp = platform === 'mobile_android' || platform === 'mobile_iphone' || platform === 'mobile_ipad';
    if (isNativeApp) {
        document.querySelectorAll('.buy-btn').forEach(btn => btn.style.display = 'none');
    }
}

async function initUser() {
    try {
        const data = await vkBridge.send('VKWebAppGetUserInfo');
        if (data.id) {
            USER_ID = data.id;
            updateBalance();
        }
    } catch (e) { console.error("Ошибка получения профиля:", e); }
}

// --- 2. БАЛАНС ---
function getAuthHeader() { return window.location.search.slice(1); }

function updateBalance() {
    if (!USER_ID) return;
    const balanceEl = document.getElementById('user-balance-display');
    if (balanceEl) balanceEl.textContent = "Обновление...";

    fetch(`${BRAIN_API_URL}/user/${USER_ID}`, {
        headers: { 'X-VK-Sign': getAuthHeader() }
    })
    .then(r => {
        if (!r.ok) throw new Error("Не удалось загрузить баланс");
        return r.json();
    })
    .then(info => {
        if (balanceEl) balanceEl.textContent = `Баланс: ${info.balance} кр.`;
    })
    .catch((e) => {
        console.error("Ошибка обновления баланса:", e);
        if (balanceEl) balanceEl.textContent = "Ошибка";
    });
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

document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
        document.getElementById('helpModal')?.classList.add('hidden');
        document.body.classList.remove('modal-open');
    });
});

// --- 4. РАБОТА С ФАЙЛАМИ, ВАЛИДАЦИЯ ФОРМАТА И ДЛИТЕЛЬНОСТИ ---
const fileToBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

// Проверка длины видео и аудио
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
        
        if (input) {
            input.onchange = async (event) => {
                const mode = section.dataset.mode;
                const files = Array.from(event.target.files);
                const typeKey = type === 'video' ? 'videos' : (type === 'audio' ? 'audios' : 'photos');
                
                if (!filesByMode[mode]) filesByMode[mode] = { photos: [], videos: [], audios: [] };
                
                // ИСПРАВЛЕНИЕ: Очищаем старые файлы перед загрузкой новых
                const maxLim = parseInt(section.dataset.maxPhotos) || 1;
                if (maxLim === 1) filesByMode[mode][typeKey] = [];
                
                const accept = input.getAttribute('accept');
                for (let file of files) {
                    // 1. Строгая валидация формата (только растр для фото)
                    if (typeKey === 'photos') {
                        // Явно запрещаем SVG, так как нейросеть с ним не работает
                        if (file.type.includes('svg') || file.name.toLowerCase().endsWith('.svg')) {
                            showCustomAlert(`Векторный формат SVG не поддерживается. Пожалуйста, загрузите фото в формате JPG или PNG.`, "Неверный формат");
                            continue;
                        }
                        // Проверка, что это вообще картинка
                        if (!file.type.startsWith('image/')) {
                            showCustomAlert(`Файл ${file.name} не является изображением.`, "Неверный формат");
                            continue;
                        }
                    } else if (accept && accept !== '*/*' && !file.type.startsWith(accept.split('/')[0])) {
                        showCustomAlert(`Файл ${file.name} не поддерживается. Разрешены только ${accept}.`, "Неверный формат");
                        continue;
                    }

                    // Валидация длины медиа (не более 16 секунд)
                    if (typeKey === 'videos' || typeKey === 'audios') {
                        const duration = await checkMediaDuration(file);
                        if (duration > 16) {
                            showCustomAlert(`Файл слишком длинный! Загрузите медиа не дольше 15 секунд. (У вас: ${Math.round(duration)} сек)`, "Превышен лимит времени");
                            continue;
                        }
                    }

                    const max = parseInt(section.dataset.maxPhotos) || 1;
                    
                    // БАГ №9: Замена файла вместо ошибки лимита
                    if (max === 1) {
                        filesByMode[mode][typeKey] = [file];
                    } else {
                        if (filesByMode[mode][typeKey].length < max) {
                            filesByMode[mode][typeKey].push(file);
                        } else {
                            showCustomAlert(`Лимит файлов (${max}). Сначала удалите старое фото (нажмите на крестик).`, "Лимит");
                        }
                    }
                }
                updateUI(section);
                input.value = '';
            };
            input.click();
        }
    });
});

// Удаление загруженного файла (крестик)
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
                    const span = document.createElement('div'); span.textContent = "🎵 Аудио"; container.appendChild(span);
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
        if (max > 1) {
            uploadBtn.textContent = files.photos.length > 0 ? `1. Добавить еще (${files.photos.length}/${max})` : `1. Выбрать фото`;
        } else {
            uploadBtn.textContent = files.photos.length > 0 ? "1. Изменить фото" : "1. Выбрать фото";
        }
    }
    
    const videoBtn = section.querySelector('.universal-upload-button[data-type="video"]');
    if (videoBtn) videoBtn.textContent = files.videos.length > 0 ? "2. Изменить видео ✅" : "2. Видео-шаблон (до 15 сек)";

    const audioBtn = section.querySelector('.universal-upload-button[data-type="audio"]');
    if (audioBtn) audioBtn.textContent = files.audios.length > 0 ? "2. Изменить аудио ✅" : "2. Голосовое (до 15 сек)";

    const processBtn = section.querySelector('.process-button');
    if (processBtn) {
        let ready = false;
       // СТАЛО: добавили vip_mix
        if (['t2i', 't2v', 'chat', 'music', 'vip_mix'].includes(mode)) ready = true;
        else if (mode === 'vip_clip' && files.photos.length > 0 && files.videos.length > 0) ready = true;
        else if (mode === 'talking_photo' && files.photos.length > 0 && files.audios.length > 0) ready = true;
        else if (files.photos.length > 0) ready = true;
        
        if (ready) processBtn.classList.remove('hidden');
        else processBtn.classList.add('hidden');
    }
}

// --- 5. ГЕНЕРАЦИЯ И ОПРОС ---
async function pollTaskStatus(taskId) {
    let attempts = 0;
    const maxAttempts = 150; 
    let isTaskFinished = false;

    const pollInterval = setInterval(async () => {
        if (isTaskFinished) {
            clearInterval(pollInterval);
            return;
        }

        attempts++;
        if (attempts > maxAttempts) {
            clearInterval(pollInterval);
            if (!isTaskFinished) {
                hideLoader();
                showCustomAlert("Нейросеть генерирует медиа дольше обычного. Пожалуйста, попробуйте повторить запрос чуть позже. Ваши кредиты не списаны (или будут возвращены в течение 5 минут).", "Долгая загрузка");
            }
            return;
        }

        try {
            const response = await fetch(`${BRAIN_API_URL}/task_status/${taskId}?user_id=${USER_ID}`, {
                headers: { 'X-VK-Sign': getAuthHeader() }
            });
            
            if (!response.ok) {
                 console.warn(`Поллинг: Сервер ответил статусом ${response.status}. Ждем дальше...`);
                 return; 
            }

            const data = await response.json();
            console.log("Статус задачи:", data); 

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
                showCustomAlert(data.error || "Произошла ошибка при генерации. Средства возвращены.", "Ошибка нейросети");
                updateBalance(); 
            }
        } catch (e) {
            console.warn("Временный обрыв сети при опросе статуса. Продолжаем ждать...", e);
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

    if (result.model === 'chat') { 
        showCustomAlert(url, "Ответ помощника"); 
        resultWrapper.classList.add('hidden'); 
        return; 
    }

    const isVideo = url.includes('.mp4') || url.includes('.mov');
    const isAudio = url.includes('.mp3') || url.includes('.wav');

    const downloadBtn = document.getElementById('downloadButton');
    if (downloadBtn) {
        downloadBtn.textContent = isAudio ? "Скачать песню" : "Скачать на устройство";
    }

    if (isVideo) {
        resultVideo.src = url;
        resultVideo.classList.remove('hidden');
        // Очень важно! Для видео - не открываем внешнюю ссылку, а просто отдаем URL.
        // Браузер сам покажет кнопки для скачивания (три точки).
        // Если это не сработает, то нужно будет искать, почему Replicate блокирует прямую ссылку.
    } else if (isAudio) {
        resultAudio.src = url;
        resultAudio.classList.remove('hidden');
    } else {
        resultImage.src = url;
        resultImage.classList.remove('hidden');
        
        resultImage.style.cursor = 'pointer'; 
        resultImage.onclick = () => {
            if (vkBridge.isWebView()) {
                vkBridge.send("VKWebAppShowImages", { images: [url] });
            } else {
                window.open(url, '_blank');
            }
        };
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

       // БАЗОВАЯ ПРОВЕРКА ПРОМПТА
        if (!prompt && !['i2v', 'music', 'vip_clip', 'talking_photo'].includes(mode)) {
            return showCustomAlert("Пожалуйста, введите текстовое описание.", "Пустой запрос");
        }

        // ПРОВЕРКА МУЗЫКИ (Длина текста и стиля)
        if (mode === 'music') {
            const lyricsLength = musicLyrics ? musicLyrics.length : 0;
            const styleLength = stylePrompt ? stylePrompt.length : 0;
            
            if (lyricsLength < 10 || lyricsLength > 600) {
                return showCustomAlert("Текст песни должен быть от 10 до 600 символов.", "Ошибка текста");
            }
           if (btn.dataset.style === 'custom') {
                if (styleLength < 2) return showCustomAlert("Введите название жанра (от 2 символов).", "Ошибка стиля");
                if (styleLength > 300) return showCustomAlert("Стиль музыки не должен превышать 300 символов.", "Ошибка стиля");
            }
        }

        const files = filesByMode[mode] || { photos: [], videos: [], audios: [] };
        
        // --- ГЛОБАЛЬНАЯ ОЧИСТКА ---
        filesByMode[mode] = { photos: [], videos: [], audios: [] };
        if (promptInput) promptInput.value = '';
        if (mode === 'music') {
            const customInp = section.querySelector('#custom-style-input');
            if(customInp) customInp.value = '';
        }
        updateUI(section); 
        // -------------------------

        showLoader();
        btn.disabled = true; 

        try {
            const requestBody = {
                user_id: USER_ID,
                model: mode,
                prompt: prompt,
                image_urls: [], 
                audio_url: null,
                video_url: null,
                style_prompt: stylePrompt,
                lyrics: musicLyrics
            };

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
                } else if (result.task_id) {
                    pollTaskStatus(result.task_id, section);
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
            
            filesByMode[targetMode] = { photos: [], videos: [], audios: [] };
            updateUI(targetSection); 

            document.querySelectorAll('.mode-section h2').forEach(h2 => {
                if (h2.dataset.orig) h2.innerText = h2.dataset.orig;
            });

            const title = targetSection.querySelector('h2');
            if (!title.dataset.orig) title.dataset.orig = title.innerText;
            title.innerText = `💼 ${e.target.innerText} (Шаблон)`;
            
            targetSection.style.transition = 'box-shadow 0.3s ease';
            targetSection.style.boxShadow = '0 0 0 3px #2787F5';
            setTimeout(() => { targetSection.style.boxShadow = ''; }, 2000);
            
            const input = targetSection.querySelector('.prompt-input');
            if (input) {
                input.value = promptText;
                input.style.borderColor = '#2787F5';
                setTimeout(() => input.style.borderColor = '#dce1e6', 1500);
            }
        }
    });
});

document.getElementById('gallery-link')?.addEventListener('click', () => {
    vkBridge.send("VKWebAppOpenUrl", { "url": "https://vk.com/hollie_ai_bot" })
        .catch(() => { window.open("https://vk.com/hollie_ai_bot", "_blank"); });
});

// --- СКАЧИВАНИЕ (Побег из WebView для видео) ---
document.getElementById('downloadButton')?.addEventListener('click', () => {
    const activeMedia = document.querySelector('#result-wrapper img:not(.hidden), #result-wrapper video:not(.hidden), #result-wrapper audio:not(.hidden)');
    const url = activeMedia?.src;
    if (!url) return;

    const isVideo = url.includes('.mp4') || url.includes('.mov');
    const isAudio = url.includes('.mp3') || url.includes('.wav');

    // Если это мобилка ВК
    if (vkBridge.isWebView()) {
        if (!isVideo && !isAudio) {
            // ФОТО: просто открываем в полноэкранном режиме ВК (там можно нажать сохранить)
            vkBridge.send("VKWebAppShowImages", { images: [url] });
        } else {
            // ВИДЕО / АУДИО: Выкидываем пользователя во ВНЕШНИЙ БРАУЗЕР
            // Там он сможет просто зажать палец на видео и нажать "Сохранить"
            let externalUrl = url;
            
            // Если вдруг Replicate отдает ссылку без https://, добавляем
            if (!externalUrl.startsWith('http')) externalUrl = 'https://' + externalUrl;
            
            try {
                // Команда открыть ссылку во внешнем браузере устройства (Safari/Chrome)
                vkBridge.send("VKWebAppOpenUrl", { "url": externalUrl });
                // Если первая не сработала, дергаем системную ссылку
                setTimeout(() => { window.open(externalUrl, '_blank'); }, 500);
            } catch (e) {
                window.open(externalUrl, '_blank');
            }
        }
    } else {
        // ДЛЯ ПК: Оставляем старый рабочий Blob
        const filename = `neuro_master_${Date.now()}${isVideo ? '.mp4' : (isAudio ? '.mp3' : '.jpg')}`;
        fetch(url)
            .then(response => response.blob())
            .then(blob => {
                const blobUrl = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(blobUrl);
            })
            .catch(() => {
                window.open(url, '_blank');
            });
    }
});

// Оплата ЮKassa
document.querySelectorAll('.buy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        if (!USER_ID) return showCustomAlert("Пожалуйста, авторизуйтесь.", "Ошибка");

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

// --- ПОЛУЧЕНИЕ БОНУСА ЗА РАЗРЕШЕНИЕ СООБЩЕНИЙ ---
document.getElementById('getBonusBtn')?.addEventListener('click', async () => {
    if (!USER_ID) return showCustomAlert("Пожалуйста, подождите загрузки профиля.", "Ошибка");
    
    try {
        // ID вашей группы "Нейро-Магия"
        const GROUP_ID = 191367447; 
        
        // Вызываем официальное окно ВК с просьбой разрешить сообщения
        const bridgeResponse = await vkBridge.send("VKWebAppAllowMessagesFromGroup", {"group_id": GROUP_ID});
        
        if (bridgeResponse.result) {
            // Если юзер нажал "Разрешить", отправляем запрос на наш сервер для начисления бонуса
            showLoader();
            const response = await fetch(`${BRAIN_API_URL}/bonus`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-VK-Sign': getAuthHeader() },
                body: JSON.stringify({ user_id: USER_ID })
            });
            
            const result = await response.json();
            hideLoader();
            
            if (result.success) {
                showCustomAlert("Вам начислено 5 кредитов! 🎉 Теперь вы будете получать наши новости и акции в личные сообщения.", "Бонус получен");
                updateBalance();
                // Прячем кнопку, чтобы не нажимали дважды
                document.getElementById('getBonusBtn').style.display = 'none';
            } else {
                showCustomAlert(result.detail || "Вы уже получали этот бонус ранее.", "Упс!");
            }
        }
    } catch (e) {
        // Пользователь нажал "Отмена" в окне ВК
        if (e.error_data && e.error_data.error_reason === "User denied") {
            showCustomAlert("Вы отменили действие. Чтобы получить бонус, необходимо разрешить сообщения.", "Отмена");
        } else {
            console.log("Бонус: Ошибка или уже разрешено", e);
            // Пытаемся начислить бонус, вдруг он уже давал разрешение раньше
            showCustomAlert("Кредиты выдаются только при первом разрешении сообщений.", "Информация");
        }
    }
});
