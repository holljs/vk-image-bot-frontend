// script.js (vFinal - ИДЕАЛЬНАЯ СИНХРОНИЗАЦИЯ С HTML)

// --- 1. ИНИЦИАЛИЗАЦИЯ ---
vkBridge.send('VKWebAppInit');
const BRAIN_API_URL = 'https://neuro-master.online/api';
let USER_ID = null;
let userIdInitialized = false;
// Хранилище: { "vip_edit": {photos: [], videos: [], audios: []}, ... }
const filesByMode = {}; 

const loader = document.getElementById('loader');
const resultWrapper = document.getElementById('result-wrapper');
const resultImage = document.getElementById('resultImage');
const resultVideo = document.getElementById('resultVideo');
const downloadButton = document.getElementById('downloadButton');

// Получение ID пользователя
vkBridge.subscribe(e => {
    if (e.detail && e.detail.type === 'VKWebAppUpdateConfig' && !userIdInitialized) {
        initUser();
    }
});
setTimeout(() => { if (!userIdInitialized) initUser(); }, 2000);

async function initUser() {
    try {
        const data = await vkBridge.send('VKWebAppGetUserInfo');
        if (data.id) {
            USER_ID = data.id;
            userIdInitialized = true;
            console.log('User ID:', USER_ID);
            fetch(`${BRAIN_API_URL}/user/${USER_ID}`).catch(console.error);
        }
    } catch (e) { console.error(e); }
}

// --- 2. ОБРАБОТКА ВЫБОРА ФАЙЛОВ ---

// Клик по кнопке "Выбрать..." -> Открывает скрытый input
document.querySelectorAll('.universal-upload-button').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const section = e.target.closest('.mode-section');
        const type = e.target.dataset.type || 'photo'; // photo, video, audio
        
        let inputSelector = '.file-upload-input'; // По умолчанию фото
        if (type === 'video') inputSelector = '.video-upload-input';
        if (type === 'audio') inputSelector = '.audio-upload-input';
        
        const input = section.querySelector(inputSelector);
        if (input) input.click();
    });
});

// Выбор файла в input -> Сохранение и обновление UI
document.querySelectorAll('.file-upload-input, .video-upload-input, .audio-upload-input').forEach(input => {
    input.addEventListener('change', (e) => {
        const section = e.target.closest('.mode-section');
        const mode = section.dataset.mode;
        const newFiles = Array.from(e.target.files);
        
        if (newFiles.length === 0) return;

        // Определяем тип файла
        let fileType = 'photos';
        if (input.classList.contains('video-upload-input')) fileType = 'videos';
        if (input.classList.contains('audio-upload-input')) fileType = 'audios';

        if (!filesByMode[mode]) filesByMode[mode] = { photos: [], videos: [], audios: [] };

        // Лимиты
        const maxPhotos = parseInt(section.dataset.maxPhotos) || 1;
        
        // Логика добавления
        if (fileType === 'photos') {
            if (maxPhotos === 1) filesByMode[mode].photos = [newFiles[0]];
            else {
                for (let f of newFiles) {
                    if (filesByMode[mode].photos.length < maxPhotos) filesByMode[mode].photos.push(f);
                }
            }
        } else {
            // Видео и аудио пока по 1 шт.
            filesByMode[mode][fileType] = [newFiles[0]];
        }
        
        updateUI(section);
        input.value = ''; // Сброс, чтобы можно было выбрать тот же файл снова
    });
});


// --- 3. ГЛАВНАЯ ЛОГИКА ГЕНЕРАЦИИ ---

document.querySelectorAll('.process-button').forEach(btn => {
    btn.addEventListener('click', handleProcessClick);
});

async function handleProcessClick(event) {
    const btn = event.target;
    const section = btn.closest('.mode-section');
    const mode = section.dataset.mode;
    
    if (!USER_ID) { alert("ID не определен. Перезапустите."); return; }

    const promptInput = section.querySelector('.prompt-input');
    const prompt = promptInput ? promptInput.value : '';
    const stylePrompt = mode === 'music' ? btn.dataset.style : null;
    const musicLyrics = mode === 'music' ? prompt : null;

    // Валидация промпта
    if (!prompt && mode !== 'i2v' && mode !== 'music') {
        alert("Напишите промпт!"); return;
    }

    // Валидация файлов
    const files = filesByMode[mode] || { photos: [], videos: [], audios: [] };
    
    // Проверка для фото-режимов
    if (['vip_edit', 'i2v', 'quick_edit', 'vip_mix'].includes(mode) && files.photos.length === 0) {
        alert("Выберите фото!"); return;
    }
    // Проверка для видео/аудио режимов
    if (mode === 'vip_clip' && (files.photos.length === 0 || files.videos.length === 0)) {
        alert("Выберите и фото, и видео!"); return;
    }
    if (mode === 'talking_photo' && (files.photos.length === 0 || files.audios.length === 0)) {
        alert("Выберите фото и аудио!"); return;
    }

    btn.disabled = true;
    showLoader();

    try {
        // Шаг 1: Загрузка файлов
        const uploadedImageUrls = await uploadFiles(files.photos, 'photo');
        const uploadedVideoUrls = await uploadFiles(files.videos, 'video');
        // Аудио пока не грузим, т.к. VK API это ограничивает. Оставляем null или заглушку.
        // Для 'talking_photo' лучше использовать запись голоса, но пока пропустим.
        const uploadedAudioUrls = []; 

        // Шаг 2: Сборка запроса
        const requestBody = {
            user_id: USER_ID, model: mode, prompt: prompt,
            image_urls: uploadedImageUrls,
            video_url: uploadedVideoUrls[0] || null,
            audio_url: null, // Пока так
            style_prompt: stylePrompt, lyrics: musicLyrics
        };

        // Шаг 3: Отправка
        const endpoint = mode === 'chat' ? `${BRAIN_API_URL}/chat` : `${BRAIN_API_URL}/generate`;
        const response = await fetch(endpoint, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.detail || "Ошибка сервера");
        }

        const result = await response.json();
        showResult(result);
        
        // Шаг 4: Очистка
        filesByMode[mode] = { photos: [], videos: [], audios: [] };
        if (promptInput) promptInput.value = '';
        updateUI(section);
        resultWrapper.scrollIntoView({ behavior: "smooth" });

    } catch (error) {
        handleError(error);
    } finally {
        hideLoader();
        btn.disabled = false;
    }
}

// --- 4. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

async function uploadFiles(fileList, type) {
    const uploadedUrls = [];
    if (!fileList || fileList.length === 0) return uploadedUrls;

    for (const file of fileList) {
        // 1. Получаем адрес загрузки
        const uploadServer = await vkBridge.send('VKWebAppGetAppUploadServer', { app_id: 51884181 });
        
        // 2. Отправляем файл
        const formData = new FormData();
        let fieldName = 'photo';
        if (type === 'video') fieldName = 'video_file';
        formData.append(fieldName, file);
        
        const uploadResponse = await fetch(uploadServer.upload_url, { method: 'POST', body: formData });
        const uploadResult = await uploadResponse.json();

        // 3. Сохраняем
        if (type === 'video') {
             const saved = await vkBridge.send('VKWebAppSaveAppVideo', {
                video_file: uploadResult.video_file || uploadResult.file,
                name: "Video for Neuro-Master", // Обязательное поле для видео
                description: "Temporary upload"
             });
             // VK возвращает access_key и owner_id+video_id. Получить прямой URL сложно.
             // В качестве временного решения вернем заглушку или access_key
             uploadedUrls.push(`video${saved.owner_id}_${saved.video_id}`);
        } else {
            const saved = await vkBridge.send('VKWebAppSaveAppPhoto', {
                photo: uploadResult.photo, server: uploadResult.server, hash: uploadResult.hash
            });
            uploadedUrls.push(saved.images.sort((a,b) => b.width - a.width)[0].url);
        }
    }
    return uploadedUrls;
}

function updateUI(section) {
    const mode = section.dataset.mode;
    const files = filesByMode[mode] || { photos: [], videos: [], audios: [] };
    const max = parseInt(section.dataset.maxPhotos) || 1;
    
    // Превью
    const previewDiv = section.querySelector('.image-previews');
    if (previewDiv) {
        previewDiv.innerHTML = '';
        files.photos.forEach(f => previewDiv.appendChild(createPreview(f, 'img')));
        files.videos.forEach(f => previewDiv.appendChild(createPreview(f, 'video')));
        files.audios.forEach(f => previewDiv.innerHTML += '<div class="preview-image">🎵</div>');
    }

    // Кнопки загрузки
    const photoBtn = section.querySelector('.universal-upload-button[data-type="photo"]') || section.querySelector('.universal-upload-button:not([data-type])');
    if (photoBtn) {
        if (max > 1) {
            photoBtn.textContent = `Добавить фото (${files.photos.length}/${max})`;
            photoBtn.disabled = files.photos.length >= max;
        } else {
            photoBtn.textContent = files.photos.length > 0 ? "Выбрать другое" : "1. Выбрать фото";
        }
    }
    
    const videoBtn = section.querySelector('.universal-upload-button[data-type="video"]');
    if (videoBtn) videoBtn.textContent = files.videos.length > 0 ? "Видео выбрано" : "2. Выбрать видео";

    const audioBtn = section.querySelector('.universal-upload-button[data-type="audio"]');
    if (audioBtn) audioBtn.textContent = files.audios.length > 0 ? "Аудио выбрано" : "2. Выбрать аудио";

    // Кнопка запуска
    const processBtn = section.querySelector('.process-button');
    if (processBtn) {
        let ready = true;
        // Если есть инпут, но нет файлов -> не готов
        if (section.querySelector('.file-upload-input') && files.photos.length === 0) ready = false;
        if (section.querySelector('.video-upload-input') && files.videos.length === 0) ready = false;
        if (section.querySelector('.audio-upload-input') && files.audios.length === 0) ready = false;
        
        if (ready) processBtn.classList.remove('hidden');
        else processBtn.classList.add('hidden');
    }
}

function createPreview(file, tag) {
    const el = document.createElement(tag);
    el.src = URL.createObjectURL(file);
    el.className = 'preview-image';
    return el;
}

// ... (остальные функции showLoader, showResult, handleError, download - как в v30) ...
function showLoader() { loader.classList.remove('hidden'); resultWrapper.classList.add('hidden'); }
function hideLoader() { loader.classList.add('hidden'); }
function handleError(e) { console.error(e); alert("Ошибка: " + e.message); hideLoader(); }
function showResult(res) {
    const url = res.result_url || res.response;
    if (res.model === 'chat' || !url.startsWith('http')) { alert(url); return; }
    
    resultWrapper.classList.remove('hidden');
    const isVideo = url.includes('.mp4');
    
    resultImage.src = !isVideo ? url : '';
    resultImage.classList.toggle('hidden', isVideo);
    resultVideo.src = isVideo ? url : '';
    resultVideo.classList.toggle('hidden', !isVideo);
    downloadButton.classList.remove('hidden');
    
    resultImage.onclick = () => window.open(url, '_blank');
}

downloadButton.onclick = async () => {
    const url = resultImage.src || resultVideo.src;
    const isVideo = !resultVideo.classList.contains('hidden');
    if (!url) return;
    try {
        const blob = await (await fetch(url)).blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = isVideo ? 'result.mp4' : 'result.png';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch(e) { alert("Не удалось скачать."); }
};
