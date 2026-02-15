// script.js (v30 - ИСПРАВЛЕНА ЛОГИКА, СЧЕТЧИКИ, СКАЧИВАНИЕ)

// --- 1. ИНИЦИАЛИЗАЦИЯ ---
vkBridge.send('VKWebAppInit');
const BRAIN_API_URL = 'https://neuro-master.online/api';
let USER_ID = null;
let userIdInitialized = false;
// Хранилище файлов: { "vip_edit": {photos: [], videos: [], audios: []}, ... }
const filesByMode = {}; 

// Поиск основных элементов
const loader = document.getElementById('loader');
const resultWrapper = document.getElementById('result-wrapper');
const resultImage = document.getElementById('resultImage');
const resultVideo = document.getElementById('resultVideo');
const downloadButton = document.getElementById('downloadButton');

// Надежное получение ID пользователя
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
    } catch (e) {
        console.error(e);
    }
}

// --- 2. ОБРАБОТЧИКИ СОБЫТИЙ ДЛЯ ЗАГРУЗКИ ---

// Кнопка "Выбрать/Добавить..." -> нажимает на скрытый input
document.querySelectorAll('.universal-upload-button').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const section = e.target.closest('.mode-section');
        const type = e.target.dataset.type || 'photo';
        let input;
        
        if (type === 'video') input = section.querySelector('.video-upload-input');
        else if (type === 'audio') input = section.querySelector('.audio-upload-input');
        else input = section.querySelector('.file-upload-input'); // photo default

        if (input) input.click();
    });
});

// Обработка выбора файлов в input
document.querySelectorAll('.file-upload-input, .video-upload-input, .audio-upload-input').forEach(input => {
    input.addEventListener('change', (e) => {
        const section = e.target.closest('.mode-section');
        const mode = section.dataset.mode;
        const newFiles = Array.from(e.target.files);
        if (newFiles.length === 0) return;

        // Определяем тип файла по классу инпута
        let fileType = 'photos';
        if (input.classList.contains('video-upload-input')) fileType = 'videos';
        if (input.classList.contains('audio-upload-input')) fileType = 'audios';

        // Инициализируем хранилище для этого режима
        if (!filesByMode[mode]) filesByMode[mode] = { photos: [], videos: [], audios: [] };

        // Определяем лимиты
        const maxPhotos = parseInt(section.dataset.maxPhotos) || 1;
        const maxVideos = parseInt(section.dataset.maxVideos) || 0;
        const maxAudios = parseInt(section.dataset.maxAudios) || 0;

        // Логика добавления: 
        // Если лимит 1 - заменяем. Если больше - добавляем.
        if (fileType === 'photos') {
            if (maxPhotos === 1) filesByMode[mode].photos = [newFiles[0]];
            else {
                for (let f of newFiles) {
                    if (filesByMode[mode].photos.length < maxPhotos) filesByMode[mode].photos.push(f);
                }
            }
        } else if (fileType === 'videos') {
            filesByMode[mode].videos = [newFiles[0]]; // Видео всегда одно пока
        } else if (fileType === 'audios') {
            filesByMode[mode].audios = [newFiles[0]]; // Аудио всегда одно пока
        }
        
        updateUI(section);
        input.value = ''; // Сброс инпута
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
    
    if (!USER_ID) { alert("ID не определен. Перезапустите приложение."); return; }

    const promptInput = section.querySelector('.prompt-input');
    const prompt = promptInput ? promptInput.value : '';
    
    // Стиль музыки берется из кнопки
    const stylePrompt = mode === 'music' ? btn.dataset.style : null;
    // Текст для музыки - это prompt
    const musicLyrics = mode === 'music' ? prompt : null;

    // Валидация
    if (!prompt && mode !== 'i2v' && mode !== 'music') {
        alert("Пожалуйста, напишите промпт!"); return;
    }
    
    const files = filesByMode[mode] || { photos: [], videos: [], audios: [] };
    
    // Проверка наличия файлов для режимов, где они обязательны
    if (['vip_edit', 'i2v', 'quick_edit', 'vip_mix'].includes(model) && files.photos.length === 0) {
        alert("Выберите фото!"); return;
    }
    if (model === 'vip_clip' && (files.photos.length === 0 || files.videos.length === 0)) {
        alert("Выберите фото и видео!"); return;
    }
    if (model === 'talking_photo' && (files.photos.length === 0 || files.audios.length === 0)) {
        alert("Выберите фото и аудио!"); return;
    }

    // --- СТАРТ ---
    btn.disabled = true;
    showLoader();

    try {
        // Шаг А: Загружаем файлы на сервер VK
        const uploadedImageUrls = await uploadFiles(files.photos, 'photo');
        const uploadedVideoUrls = await uploadFiles(files.videos, 'video');
        const uploadedAudioUrls = await uploadFiles(files.audios, 'audio');

        // Шаг Б: Собираем запрос
        const requestBody = {
            user_id: USER_ID,
            model: model,
            prompt: prompt,
            image_urls: uploadedImageUrls,
            video_url: uploadedVideoUrls[0] || null,
            audio_url: uploadedAudioUrls[0] || null,
            style_prompt: stylePrompt,
            lyrics: musicLyrics
        };

        // Шаг В: Отправляем на "Мозг"
        const endpoint = model === 'chat' ? `${BRAIN_API_URL}/chat` : `${BRAIN_API_URL}/generate`;
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.detail || "Ошибка сервера");
        }

        const result = await response.json();

        // Шаг Г: Успех
        showResult(result);
        
        // Очистка полей и файлов
        filesByMode[mode] = { photos: [], videos: [], audios: [] };
        if (promptInput) promptInput.value = '';
        updateUI(section);
        
        // Скролл к результату
        resultWrapper.scrollIntoView({ behavior: "smooth", block: "start" });

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
        // 1. Получаем адрес
        const uploadServer = await vkBridge.send('VKWebAppGetAppUploadServer', { app_id: 51884181 });
        
        // 2. Отправляем файл
        const formData = new FormData();
        // Имя поля зависит от типа файла, VK требователен к этому
        let fieldName = 'photo';
        if (type === 'video') fieldName = 'video_file';
        if (type === 'audio') fieldName = 'file'; // Для аудио/документов часто 'file'
        
        formData.append(fieldName, file);
        
        const uploadResponse = await fetch(uploadServer.upload_url, { method: 'POST', body: formData });
        const uploadResult = await uploadResponse.json();

        // 3. Сохраняем (методы разные)
        if (type === 'photo') {
            const saved = await vkBridge.send('VKWebAppSaveAppPhoto', {
                photo: uploadResult.photo, server: uploadResult.server, hash: uploadResult.hash
            });
            uploadedUrls.push(saved.images.sort((a,b) => b.width - a.width)[0].url);
        } 
        else if (type === 'video') {
            // Для видео сохранение чуть сложнее, используем упрощенный вариант если доступен
            // Или возвращаем ссылку если она есть в uploadResult (иногда бывает)
            // Но для надежности лучше так:
             const saved = await vkBridge.send('VKWebAppSaveAppVideo', {
                video_file: uploadResult.video_file || uploadResult.file
             });
             uploadedUrls.push(saved.video_url || saved.access_key); // Тут может потребоваться доработка API VK, но пробуем
        }
        else if (type === 'audio') {
             // Аудио загружаем как документ, т.к. аудио API закрыто
             // Это "хак" для голосовых
             // Если не сработает - вернемся к записи
             // Пока просто пропустим этот шаг, т.к. VK не дает просто так грузить аудио
             throw new Error("Загрузка аудио файлом пока недоступна в VK Mini Apps. Используйте запись (мы вернем её позже).");
        }
    }
    return uploadedUrls;
}

function updateUI(section) {
    const mode = section.dataset.mode;
    const files = filesByMode[mode] || { photos: [], videos: [], audios: [] };
    const maxPhotos = parseInt(section.dataset.maxPhotos) || 0;
    
    // Превью
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
            previewDiv.appendChild(vid);
        });
        // Аудио иконка
        files.audios.forEach(f => {
            const span = document.createElement('span');
            span.textContent = "🎵 Аудио";
            span.className = 'preview-image'; // Просто стиль
            previewDiv.appendChild(span);
        });
    }

    // Текст кнопок (счетчики)
    const photoBtn = section.querySelector('.universal-upload-button[data-type="photo"]') || section.querySelector('.universal-upload-button:not([data-type])');
    if (photoBtn) {
        if (maxPhotos > 1) {
            photoBtn.textContent = `Добавить фото (${files.photos.length}/${maxPhotos})`;
            photoBtn.disabled = files.photos.length >= maxPhotos;
        } else {
            photoBtn.textContent = files.photos.length > 0 ? "Выбрать другое" : "1. Выбрать фото";
        }
    }
    
    // Кнопки видео/аудио
    const videoBtn = section.querySelector('.universal-upload-button[data-type="video"]');
    if (videoBtn) videoBtn.textContent = files.videos.length > 0 ? "Видео выбрано" : "2. Выбрать видео";

    // Кнопка запуска
    const processBtn = section.querySelector('.process-button');
    if (processBtn) {
        // Условие показа: если файлы нужны и их нет -> скрыть
        let ready = true;
        if (section.querySelector('.file-upload-input') && files.photos.length === 0) ready = false;
        if (section.querySelector('.video-upload-input') && files.videos.length === 0) ready = false;
        if (section.querySelector('.audio-upload-input') && files.audios.length === 0) ready = false;
        
        if (ready) processBtn.classList.remove('hidden');
        else processBtn.classList.add('hidden');
    }
}

function showLoader() { loader.classList.remove('hidden'); resultWrapper.classList.add('hidden'); }
function hideLoader() { loader.classList.add('hidden'); }
function handleError(e) { console.error(e); alert("Ошибка: " + e.message); hideLoader(); }

function showResult(result) {
    const url = result.result_url || result.response;
    if (result.model === 'chat' || !url.startsWith('http')) { alert(url); return; }
    
    resultWrapper.classList.remove('hidden');
    const isVideo = url.includes('.mp4') || url.includes('.mov');
    const isAudio = url.includes('.mp3');

    if (isAudio) {
        alert("Аудио готово! Ссылка: " + url); // Упрощенно
    } else {
        resultImage.src = !isVideo ? url : '';
        resultImage.classList.toggle('hidden', isVideo);
        resultVideo.src = isVideo ? url : '';
        resultVideo.classList.toggle('hidden', !isVideo);
        downloadButton.classList.remove('hidden');
    }
    // Клик для открытия
    resultImage.onclick = () => window.open(url, '_blank');
}

// ПРАВИЛЬНОЕ СКАЧИВАНИЕ
downloadButton.addEventListener('click', async () => {
    const url = resultImage.src || resultVideo.src;
    const isVideo = !resultVideo.classList.contains('hidden');
    if (!url) return;
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = isVideo ? 'result.mp4' : 'result.png';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
    } catch(e) {
        alert("Скачивание не удалось. Откройте картинку и сохраните вручную.");
    }
});
