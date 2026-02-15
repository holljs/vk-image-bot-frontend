// script.js (v3 - ЕДИНСТВЕННАЯ И ПОЛНАЯ ВЕРСИЯ)

// --- Глобальные переменные ---
const BRAIN_API_URL = 'https://neuro-master.online/api';
let USER_ID = null;

// --- Поиск элементов ---
const loader = document.getElementById('loader');
const resultWrapper = document.getElementById('result-wrapper');
const originalPreviewsContainer = document.querySelector('#originalImageContainer .image-previews');
const resultContainer = document.getElementById('resultContainer');
const resultImage = document.getElementById('resultImage');
const resultVideo = document.getElementById('resultVideo');

// --- Глобальное хранилище для файлов ---
const multiStepFiles = {};

// --- НАЧАЛО: Надежная инициализация VK Bridge ---
vkBridge.send('VKWebAppInit');
vkBridge.subscribe(async (e) => {
  if (e.detail && e.detail.type === 'VKWebAppUpdateConfig') {
    try {
        const userInfo = await vkBridge.send('VKWebAppGetUserInfo');
        if (userInfo.id) {
            USER_ID = userInfo.id;
            console.log("VK User ID получен:", USER_ID);
            fetch(`${BRAIN_API_URL}/user/${USER_ID}`).catch(err => console.error("User registration failed:", err));
        } else {
            handleError(new Error("VK Bridge не вернул ID пользователя."));
        }
    } catch (error) {
        handleError(new Error("Ошибка при запросе ID пользователя."));
    }
  }
});
// --- КОНЕЦ: Надежная инициализация VK Bridge ---


// --- ОСНОВНАЯ ЛОГИКА ---

// 1. ГЛАВНЫЙ ОБРАБОТЧИК: Клик на "Запустить", "Нарисовать", "Отправить"
async function handleProcessClick(event) {
    const button = event.target;
    const section = button.closest('.mode-section');
    const model = section.dataset.mode;
    
    if (!USER_ID) {
        alert("Не удалось определить ID пользователя. Пожалуйста, перезапустите приложение внутри VK.");
        return;
    }

    button.disabled = true;
    showLoader();

    try {
        const requestBody = {
            user_id: USER_ID, model: model,
            prompt: section.querySelector('.prompt-input')?.value || (model === 'i2v' ? '.' : ''),
            image_urls: [], video_url: null, audio_url: null, lyrics: null, style_prompt: null
        };

        if (section.dataset.multistep === 'true') {
            const files = multiStepFiles[model] || {};
            requestBody.image_urls = files.photos || [];
            requestBody.video_url = files.videos ? files.videos[0] : null;
            requestBody.audio_url = files.audios ? files.audios[0] : null;
        } 
        else if (['vip_edit', 'i2v'].includes(model)) {
            const photoData = await vkBridge.send('VKWebAppGetPhotos', { max_count: 1 });
            const largestPhoto = photoData.images.sort((a, b) => b.width - a.width)[0];
            requestBody.image_urls = [largestPhoto.url];
        }

        showOriginals(requestBody.image_urls.concat(requestBody.video_url || []));

        const endpoint = model === 'chat' ? `${BRAIN_API_URL}/chat` : `${BRAIN_API_URL}/generate`;
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || `Сервер ответил ошибкой: ${response.status}`);
        }
        
        const result = await response.json();
        showResult(result);

        if (multiStepFiles[model]) {
            multiStepFiles[model] = { photos: [], videos: [], audios: [] };
            updateMultiStepUI(section);
        }
    } catch (error) {
        handleError(error);
    } finally {
        hideLoader();
        button.disabled = false;
    }
}

// 2. Обработчик добавления ФОТО или ВИДЕО
async function handleAddFileClick(event, fileType) {
    const section = event.target.closest('.mode-section');
    const mode = section.dataset.mode;
    const method = fileType === 'video' ? 'VKWebAppGetVideos' : 'VKWebAppGetPhotos';
    
    try {
        const fileData = await vkBridge.send(method, { max_count: 1 });
        const fileUrl = fileType === 'video' 
            ? fileData.videos[0].player 
            : fileData.images.sort((a, b) => b.width - a.width)[0].url;

        if (!multiStepFiles[mode]) multiStepFiles[mode] = { photos: [], videos: [], audios: [] };
        
        const fileStore = fileType === 'video' ? 'videos' : 'photos';
        multiStepFiles[mode][fileStore].push(fileUrl);
        
        updateMultiStepUI(section);
    } catch (error) {
        handleError(error);
    }
}

// 3. Обработчик записи АУДИО
async function handleRecordAudioClick(event) {
    const section = event.target.closest('.mode-section');
    const mode = section.dataset.mode;
    alert('Начинаю запись... Нажмите ОК и говорите. Запись остановится автоматически через 20 секунд или при сворачивании приложения.');
    try {
        await vkBridge.send('VKWebAppStartRecord', { max_duration: 20 });
        const unsubscribe = vkBridge.subscribe(e => {
            if (e.detail.type === 'VKWebAppRecordResult') {
                const fileUrl = e.detail.data.url;
                if (!multiStepFiles[mode]) multiStepFiles[mode] = { photos: [], videos: [], audios: [] };
                multiStepFiles[mode].audios.push(fileUrl);
                updateMultiStepUI(section);
                unsubscribe();
            } else if (e.detail.type === 'VKWebAppRecordFailed') {
                 handleError(new Error('Не удалось записать аудио.'));
                 unsubscribe();
            }
        });
    } catch (error) {
        handleError(error);
    }
}

// 4. Обработчик для режима "Нейро-Музыка"
function handleMusicLyricsInput(event) {
    const section = event.target.closest('.mode-section');
    const musicStylesDiv = section.querySelector('.music-styles');
    musicStylesDiv.classList.toggle('hidden', event.target.value.length < 10);
}

async function handleMusicStyleClick(event) {
    const button = event.target;
    const section = button.closest('.mode-section');
    const lyrics = section.querySelector('.prompt-input').value;
    const stylePrompt = button.dataset.prompt;

    if (!USER_ID) { alert("ID пользователя не определен!"); return; }
    
    button.disabled = true;
    showLoader();
    try {
        const response = await fetch(`${BRAIN_API_URL}/generate`, {
             method: 'POST', 
             headers: { 'Content-Type': 'application/json' }, 
             body: JSON.stringify({ user_id: USER_ID, model: 'music', lyrics: lyrics, style_prompt: stylePrompt })
        });
        if (!response.ok) throw new Error((await response.json()).detail);
        const result = await response.json();
        showOriginals([]);
        showResult(result);
    } catch (error) {
        handleError(error);
    } finally {
        hideLoader();
        button.disabled = false;
    }
}

// --- Функции обновления UI ---
function updateMultiStepUI(section) {
    const mode = section.dataset.mode;
    const previewsContainer = section.querySelector('.image-previews');
    const processButton = section.querySelector('.process-button');
    const addPhotoButton = section.querySelector('.add-photo-button');
    const addVideoButton = section.querySelector('.add-video-button');
    const recordAudioButton = section.querySelector('.record-audio-button');
    const maxPhotos = parseInt(section.dataset.maxPhotos) || 0;
    const maxVideos = parseInt(section.dataset.maxVideos) || 0;
    const maxAudios = parseInt(section.dataset.maxAudios) || 0;
    const files = multiStepFiles[mode] || { photos: [], videos: [], audios: [] };
    
    previewsContainer.innerHTML = '';
    [...files.photos, ...files.videos, ...files.audios].forEach(url => {
        const el = document.createElement(url.includes('.mp4') ? 'video' : 'img');
        el.src = url; el.className = 'preview-image';
        previewsContainer.appendChild(el);
    });
    
    const photoDone = maxPhotos > 0 && files.photos.length >= maxPhotos;
    const videoDone = maxVideos > 0 && files.videos.length >= maxVideos;
    const audioDone = maxAudios > 0 && files.audios.length >= maxAudios;

    if (mode === 'dance_video') {
        if(addPhotoButton) addPhotoButton.classList.toggle('hidden', photoDone);
        if(addVideoButton) addVideoButton.classList.toggle('hidden', !photoDone || videoDone);
        if(processButton) processButton.classList.toggle('hidden', !photoDone || !videoDone);
    } else if (mode === 'talking_photo') {
        if(addPhotoButton) addPhotoButton.classList.toggle('hidden', photoDone);
        if(recordAudioButton) recordAudioButton.classList.toggle('hidden', !photoDone || audioDone);
        if(processButton) processButton.classList.toggle('hidden', !photoDone || !audioDone);
    } else {
        if(processButton) processButton.classList.toggle('hidden', files.photos.length === 0);
        if(addPhotoButton) {
            addPhotoButton.textContent = `Добавить фото (${files.photos.length}/${maxPhotos})`;
            addPhotoButton.disabled = photoDone;
        }
    }
}

function showLoader() {
    resultWrapper.classList.add('hidden');
    loader.classList.remove('hidden');
}

function hideLoader() {
    loader.classList.add('hidden');
}

function showOriginals(urls) {
    const container = document.getElementById('originalImageContainer');
    if (urls && urls.length > 0) {
        originalPreviewsContainer.innerHTML = '';
        urls.forEach(url => {
            const el = document.createElement(url.includes('.mp4') ? 'video' : 'img');
            el.src = url; el.className = 'preview-image'; if (el.tagName === 'VIDEO') el.muted = true;
            originalPreviewsContainer.appendChild(el);
        });
        container.classList.remove('hidden');
    } else {
        container.classList.add('hidden');
    }
}

function showResult(result) {
    resultWrapper.classList.remove('hidden');
    hideLoader();
    const resultUrl = result.result_url;
    const responseText = result.response;
    const isVideo = resultUrl && ['.mp4', '.mov'].some(ext => resultUrl.includes(ext));
    const isImage = resultUrl && !isVideo;
    const isAudio = resultUrl && ['.mp3', '.wav', '.ogg'].some(ext => resultUrl.includes(ext));
    
    resultImage.src = isImage ? resultUrl : '';
    resultImage.classList.toggle('hidden', !isImage);
    resultVideo.src = isVideo ? resultUrl : '';
    resultVideo.classList.toggle('hidden', !isVideo);

    if (isAudio) { alert("Ваша музыка готова! Ссылка: " + resultUrl); }
    if (responseText) { alert("Ответ Нейро-помощника:\n\n" + responseText); }
}

function handleError(error) {
    console.error('Ошибка в процессе:', error);
    const message = (error.error_data && error.error_data.error_reason) 
        ? `Ошибка VK: ${error.error_data.error_reason}`
        : `Произошла ошибка: ${error.message}`;
    alert(message);
    hideLoader();
}

// --- Привязка всех обработчиков ---
document.querySelectorAll('.process-button').forEach(b => b.addEventListener('click', handleProcessClick));
document.querySelectorAll('.add-photo-button').forEach(b => b.addEventListener('click', (e) => handleAddFileClick(e, 'photo')));
document.querySelectorAll('.add-video-button').forEach(b => b.addEventListener('click', (e) => handleAddFileClick(e, 'video')));
document.querySelectorAll('.record-audio-button').forEach(b => b.addEventListener('click', handleRecordAudioClick));
document.querySelectorAll('.music-styles .style-button').forEach(b => b.addEventListener('click', handleMusicStyleClick));
document.querySelector('[data-mode="music"] .prompt-input')?.addEventListener('input', handleMusicLyricsInput);
