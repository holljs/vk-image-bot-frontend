// script.js (vFinal-UX - Идеальный интерфейс)

// --- Инициализация ---
vkBridge.send('VKWebAppInit');
const BRAIN_API_URL = 'https://neuro-master.online/api';
let USER_ID = null;
let userIdInitialized = false;
const filesByMode = {};

const loader = document.getElementById('loader');
const resultWrapper = document.getElementById('result-wrapper');
const resultImage = document.getElementById('resultImage');
const resultVideo = document.getElementById('resultVideo');
const downloadButton = document.getElementById('downloadButton');

// Получение ID
vkBridge.subscribe(e => {
    if (e.detail?.type === 'VKWebAppUpdateConfig' && !userIdInitialized) initUser();
});
setTimeout(() => { if (!userIdInitialized) initUser(); }, 2000);

async function initUser() {
    try {
        const data = await vkBridge.send('VKWebAppGetUserInfo');
        if (data.id) {
            USER_ID = data.id;
            userIdInitialized = true;
            console.log('User ID:', USER_ID);
            
            // Регистрируем пользователя и обновляем баланс в Личном Кабинете
            fetch(`${BRAIN_API_URL}/user/${USER_ID}`)
                .then(response => response.json())
                .then(info => {
                    const balanceEl = document.getElementById('user-balance-display');
                    if (balanceEl && info.balance !== undefined) {
                        balanceEl.textContent = `Баланс: ${info.balance} кр.`;
                    }
                })
                .catch(console.error);
        }
    } catch (e) {
        console.error("Ошибка инициализации:", e);
    }
}

// Добавляем обработчик для кнопки "Пригласить друга"
// (Вставьте это в конец файла или после initUser)
const inviteBtn = document.getElementById('invite-friend-btn');
if (inviteBtn) {
    inviteBtn.addEventListener('click', () => {
        if (!USER_ID) return;
        // Формируем реферальную ссылку
        const link = `https://vk.com/app51884181#${USER_ID}`; 
        // Вызываем окно "Поделиться"
        vkBridge.send("VKWebAppShare", { "link": link }); 
    });
}

// --- ОБРАБОТЧИКИ ---

document.addEventListener('click', (e) => {
    if (e.target.matches('.universal-upload-button')) {
        const section = e.target.closest('.mode-section');
        const type = e.target.dataset.type || 'photo';
        let selector = '.file-upload-input';
        if (type === 'video') selector = '.video-upload-input';
        if (type === 'audio') selector = '.audio-upload-input';
        const input = section.querySelector(selector);
        if (input) input.click();
    }
    
    if (e.target.matches('.process-button')) {
        handleProcessClick(e);
    }
});

document.addEventListener('change', (e) => {
    if (e.target.matches('.file-upload-input, .video-upload-input, .audio-upload-input')) {
        const input = e.target;
        const section = input.closest('.mode-section');
        if (!section) return;

        const mode = section.dataset.mode;
        const newFiles = Array.from(input.files);
        if (!newFiles.length) return;

        let typeKey = 'photos';
        if (input.classList.contains('video-upload-input')) typeKey = 'videos';
        if (input.classList.contains('audio-upload-input')) typeKey = 'audios';

        if (!filesByMode[mode]) filesByMode[mode] = { photos: [], videos: [], audios: [] };
        
        const max = parseInt(section.dataset.maxPhotos) || 1;

        if (typeKey === 'photos') {
            if (max === 1) filesByMode[mode].photos = [newFiles[0]];
            else {
                for (let f of newFiles) {
                    if (filesByMode[mode].photos.length < max) filesByMode[mode].photos.push(f);
                }
            }
        } else {
            filesByMode[mode][typeKey] = [newFiles[0]];
        }
        
        updateUI(section);
        input.value = '';
    }
});

// --- ГЛАВНАЯ ЛОГИКА ---

async function handleProcessClick(event) {
    const btn = event.target;
    const section = btn.closest('.mode-section');
    const mode = section.dataset.mode;
    
    if (!USER_ID) { alert("ID не определен. Перезапустите приложение."); return; }

    const promptInput = section.querySelector('.prompt-input');
    const prompt = promptInput ? promptInput.value : '';
    
    // --- ЛОГИКА ДЛЯ МУЗЫКИ ---
    let stylePrompt = null;
    let musicLyrics = null;

    if (mode === 'music') {
        musicLyrics = prompt; // Текст песни берем из основного поля
        
        // Если нажата кнопка стиля
        if (btn.dataset.style) {
            stylePrompt = btn.dataset.style;
            
            // Если выбран "Свой стиль"
            if (stylePrompt === 'custom') {
                const customStyleInput = section.querySelector('#custom-style-input');
                stylePrompt = customStyleInput ? customStyleInput.value : '';
                if (!stylePrompt || stylePrompt.length < 10) {
                    alert("Описание стиля должно быть длиннее 10 символов!");
                    return;
                }
            }
        }
    }
    // --------------------------

    const files = filesByMode[mode] || { photos: [], videos: [], audios: [] };

    // --- ВАЛИДАЦИЯ ---
    
    // 1. Промпт (кроме исключений)
    if (!prompt && !['i2v', 'music', 'vip_clip', 'talking_photo'].includes(mode)) {
        alert("Напишите промпт!"); return;
    }
    
    // 2. Фото
    if (['vip_edit', 'i2v', 'quick_edit', 'vip_mix'].includes(mode) && files.photos.length === 0) {
        alert("Выберите фото!"); return;
    }
    
    // 3. Фото + Видео (VIP-Клип)
    if (mode === 'vip_clip' && (files.photos.length === 0 || files.videos.length === 0)) {
        alert("Выберите и фото, и видео!"); return;
    }
    
    // 4. Фото + Аудио (Говорящее фото)
    if (mode === 'talking_photo' && (files.photos.length === 0 || files.audios.length === 0)) {
        alert("Выберите фото и аудио!"); return;
    }

    // --- ЗАПУСК ---
    btn.disabled = true;
    showLoader();

    try {
        // Конвертация файлов
        const imageBase64s = [];
        if (files.photos) {
            for (let file of files.photos) imageBase64s.push(await fileToBase64(file));
        }

        let videoBase64 = null;
        if (files.videos && files.videos.length > 0) {
            videoBase64 = await fileToBase64(files.videos[0]);
        }

        let audioBase64 = null;
        if (files.audios && files.audios.length > 0) {
            audioBase64 = await fileToBase64(files.audios[0]);
        }

        const requestBody = {
            user_id: USER_ID, model: mode, prompt: prompt,
            image_urls: imageBase64s,
            video_url: videoBase64,
            audio_url: audioBase64,
            style_prompt: stylePrompt,
            lyrics: musicLyrics
        };

        const endpoint = mode === 'chat' ? `${BRAIN_API_URL}/chat` : `${BRAIN_API_URL}/generate`;
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "Ошибка сервера");
        }

        const result = await response.json();
        showResult(result);
        
        // Очистка
        filesByMode[mode] = { photos: [], videos: [], audios: [] };
        if (promptInput) promptInput.value = '';
        if (mode === 'music') {
             const customStyleInput = section.querySelector('#custom-style-input');
             if (customStyleInput) customStyleInput.value = '';
        }
        
        updateUI(section);
        resultWrapper.scrollIntoView({ behavior: "smooth", block: "start" });

    } catch (error) {
        handleError(error);
    } finally {
        hideLoader();
        btn.disabled = false;
    }
}

// --- ВСПОМОГАТЕЛЬНЫЕ ---

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

function updateUI(section) {
    const mode = section.dataset.mode;
    const files = filesByMode[mode] || { photos: [], videos: [], audios: [] };
    const max = parseInt(section.dataset.maxPhotos) || 1;
    
    const previewDiv = section.querySelector('.image-previews');
    if (previewDiv) {
        previewDiv.innerHTML = '';
        files.photos.forEach(f => {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(f);
            img.className = 'preview-image';
            previewDiv.appendChild(img);
        });
        files.videos.forEach(f => {
            const vid = document.createElement('video');
            vid.src = URL.createObjectURL(f);
            vid.className = 'preview-image';
            vid.muted = true; 
            previewDiv.appendChild(vid);
        });
        if (files.audios.length > 0) {
            const span = document.createElement('div');
            span.textContent = "🎵 Аудио загружено";
            span.style.marginTop = "5px";
            previewDiv.appendChild(span);
        }
    }

    const uploadBtn = section.querySelector('.universal-upload-button:not([data-type])') || section.querySelector('.universal-upload-button[data-type="photo"]');
    if (uploadBtn) {
        if (max > 1) {
            uploadBtn.textContent = `Добавить фото (${files.photos.length}/${max})`;
            uploadBtn.disabled = files.photos.length >= max;
        } else {
            uploadBtn.textContent = files.photos.length > 0 ? "Выбрать другое фото" : "1. Выбрать фото";
        }
    }
    
    const videoBtn = section.querySelector('.universal-upload-button[data-type="video"]');
    if (videoBtn) videoBtn.textContent = files.videos.length > 0 ? "Видео выбрано" : "2. Выбрать видео";

    const processBtn = section.querySelector('.process-button');
    if (processBtn) {
        let ready = false;
        if (mode === 't2i' || mode === 't2v' || mode === 'chat' || mode === 'music') ready = true;
        else if (mode === 'vip_clip' && files.photos.length > 0 && files.videos.length > 0) ready = true;
        else if (mode === 'talking_photo' && files.photos.length > 0 && files.audios.length > 0) ready = true;
        else if (files.photos.length > 0) ready = true;
        
        if (ready) processBtn.classList.remove('hidden');
        else processBtn.classList.add('hidden');
    }
}

function showLoader() { loader.classList.remove('hidden'); resultWrapper.classList.add('hidden'); }
function hideLoader() { loader.classList.add('hidden'); }
function handleError(e) { alert("Ошибка: " + e.message); hideLoader(); }

function showResult(res) {
    const url = res.result_url || res.response;
    
    // Если это просто текст (чат), показываем alert и выходим
    if (res.model === 'chat') { alert(url); return; }
    
    resultWrapper.classList.remove('hidden');
    
    const isVideo = url.includes('.mp4');
    const isAudio = url.includes('.mp3') || url.includes('.wav');
    const isImage = !isVideo && !isAudio;

    // Скрываем все, потом показываем нужное
    resultImage.classList.add('hidden');
    resultVideo.classList.add('hidden');
    resultAudio.classList.add('hidden');

    if (isImage) {
        resultImage.src = url;
        resultImage.classList.remove('hidden');
        resultImage.onclick = () => window.open(url, '_blank');
    } else if (isVideo) {
        resultVideo.src = url;
        resultVideo.classList.remove('hidden');
    } else if (isAudio) {
        resultAudio.src = url;
        resultAudio.classList.remove('hidden');
    }
    
    // Показываем кнопки
    downloadButton.classList.remove('hidden');
    shareButton.classList.remove('hidden');
    
    // Сохраняем текущий URL глобально для кнопки "Поделиться"
    window.currentResultUrl = url;
}

// Обработчик "Поделиться"
if (shareButton) {
    shareButton.addEventListener('click', () => {
        if (!window.currentResultUrl) return;
        
        // Используем встроенную функцию VK для шеринга
        vkBridge.send("VKWebAppShare", { "link": window.currentResultUrl });
        
        // ИЛИ (если хотите постить на стену):
        // vkBridge.send("VKWebAppShowWallPostBox", { "message": "Смотри, что я сделал в Нейро-художнике!", "attachments": window.currentResultUrl });
    });
}

// Обработчик "Скачать"
if (downloadButton) {
    downloadButton.addEventListener('click', async () => {
        if (!window.currentResultUrl) return;
        const url = window.currentResultUrl;
        const isVideo = url.includes('.mp4');
        const isAudio = url.includes('.mp3') || url.includes('.wav');

        // Для мобильного приложения VK
        if (vkBridge.isWebView() && !isVideo && !isAudio) {
            vkBridge.send("VKWebAppShowImages", { images: [url] });
        } else {
            // Для всего остального (компьютер, видео, аудио)
            window.open(url, '_blank');
        }
    });
}
