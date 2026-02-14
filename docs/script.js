vkBridge.send('VKWebAppInit').catch(error => console.error("VK Bridge Init Error:", error));

const BRAIN_API_URL = 'http://neuro-master.online:8001';

// --- Глобальное хранилище для пошаговых режимов ---
const multiStepFiles = {};

// --- Поиск элементов ---
const loader = document.getElementById('loader');
const resultWrapper = document.getElementById('result-wrapper');
const originalPreviewsContainer = document.querySelector('#originalImageContainer .image-previews');
const resultContainer = document.getElementById('resultContainer');
const resultImage = document.getElementById('resultImage');
const resultVideo = document.getElementById('resultVideo');

// --- Привязка обработчиков ---
document.querySelectorAll('.process-button').forEach(b => b.addEventListener('click', handleProcessClick));
document.querySelectorAll('.add-photo-button').forEach(b => b.addEventListener('click', (e) => handleAddFileClick(e, 'photo')));
document.querySelectorAll('.add-video-button').forEach(b => b.addEventListener('click', (e) => handleAddFileClick(e, 'video')));
document.querySelectorAll('.record-audio-button').forEach(b => b.addEventListener('click', handleRecordAudioClick));
document.querySelectorAll('.music-styles .style-button').forEach(b => b.addEventListener('click', handleMusicStyleClick));

const musicLyricsInput = document.querySelector('[data-mode="music"] .prompt-input');
if (musicLyricsInput) {
    musicLyricsInput.addEventListener('input', handleMusicLyricsInput);
}


// --- ОСНОВНАЯ ЛОГИКА ---

// 1. Обработчик добавления ФОТО или ВИДЕО
async function handleAddFileClick(event, fileType) {
    const section = event.target.closest('.mode-section');
    const mode = section.dataset.mode;
    
    const method = fileType === 'video' ? 'VKWebAppGetVideos' : 'VKWebAppGetPhotos';
    const options = fileType === 'photo' ? { max_count: 1 } : {};

    try {
        const fileData = await vkBridge.send(method, options);
        const fileUrl = fileType === 'video' 
            ? fileData.videos[0].player 
            : fileData.images.sort((a, b) => b.width - a.width)[0].url;

        if (!multiStepFiles[mode]) multiStepFiles[mode] = { photos: [], videos: [], audios: [] };

        if (fileType === 'video') {
            multiStepFiles[mode].videos.push(fileUrl);
        } else {
            multiStepFiles[mode].photos.push(fileUrl);
        }
        updateMultiStepUI(section);
    } catch (error) {
        handleError(error);
    }
}

// 2. Обработчик записи АУДИО
async function handleRecordAudioClick(event) {
    const section = event.target.closest('.mode-section');
    const mode = section.dataset.mode;
    alert('Начинаю запись... Нажмите ОК и говорите. Запись остановится автоматически через 20 секунд или при сворачивании приложения.');

    try {
        await vkBridge.send('VKWebAppStartRecord', { max_duration: 20 });
        
        // Одноразовая подписка на результат записи
        const unsubscribe = vkBridge.subscribe(e => {
            if (e.detail.type === 'VKWebAppRecordResult') {
                const fileUrl = e.detail.data.url;
                if (!multiStepFiles[mode]) multiStepFiles[mode] = { photos: [], videos: [], audios: [] };
                multiStepFiles[mode].audios.push(fileUrl);
                updateMultiStepUI(section);
                unsubscribe(); // Отписываемся, чтобы не ловить чужие события
            } else if (e.detail.type === 'VKWebAppRecordFailed') {
                 handleError(new Error('Не удалось записать аудио.'));
                 unsubscribe();
            }
        });
    } catch (error) {
        handleError(error);
    }
}

// 3. Обработчик для режима "Нейро-Музыка"
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

    button.disabled = true;
    showLoader();
    try {
        const response = await fetch(`${BRAIN_API_URL}/generate_music`, {
             method: 'POST', 
             headers: { 'Content-Type': 'application/json' }, 
             body: JSON.stringify({ lyrics, style_prompt: stylePrompt })
        });
        if (!response.ok) throw new Error((await response.json()).detail);
        const result = await response.json();
        showOriginals([]); // Для музыки нет оригинала
        showResult(result);
    } catch (error) {
        handleError(error);
    } finally {
        loader.classList.add('hidden');
        button.disabled = false;
    }
}


// 4. ГЛАВНЫЙ ОБРАБОТЧИК: Клик на "Запустить", "Нарисовать", "Отправить"
async function handleProcessClick(event) {
    const button = event.target;
    const section = button.closest('.mode-section');
    const mode = section.dataset.mode;
    const promptInput = section.querySelector('.prompt-input');
    let prompt = promptInput ? promptInput.value : '';

    if (!prompt && !['i2v', 'dance_video'].includes(mode)) {
        alert('Пожалуйста, введите текстовое описание (промпт).');
        return;
    }
    if (!prompt && mode === 'i2v') {
        prompt = ".";
    }

    button.disabled = true;
    showLoader();

    try {
        const requestBody = { prompt };
        let displayUrls = [];

        if (section.dataset.multistep === 'true') {
            const files = multiStepFiles[mode] || { photos: [], videos: [], audios: [] };
            if (files.photos.length === 0 && files.videos.length === 0) throw new Error('Пожалуйста, добавьте медиафайлы.');
            
            if (mode === 'dance_video') {
                requestBody.character_image = files.photos[0];
                requestBody.video_url = files.videos[0];
            } else if (mode === 'talking_photo') {
                requestBody.image_url = files.photos[0];
                requestBody.audio_url = files.audios[0];
            } else {
                 requestBody.image_urls = files.photos;
            }
            displayUrls = [...files.photos, ...files.videos];
        
        } else if (!['t2v', 'chat', 'music'].includes(mode)) {
            const photoData = await vkBridge.send('VKWebAppGetPhotos', { max_count: 1 });
            const largestPhoto = photoData.images.sort((a, b) => b.width - a.width)[0];
            requestBody.image_url = largestPhoto.url;
            displayUrls = [largestPhoto.url];
        }
        
        showOriginals(displayUrls);
        
        const response = await fetch(`${BRAIN_API_URL}/generate_${mode}`, {
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

        if (section.dataset.multistep === 'true') {
            multiStepFiles[mode] = { photos: [], videos: [], audios: [] };
            updateMultiStepUI(section);
        }

    } catch (error) {
        handleError(error);
    } finally {
        loader.classList.add('hidden');
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
        el.src = url;
        el.className = 'preview-image';
        previewsContainer.appendChild(el);
    });

    const photoDone = files.photos.length >= maxPhotos;
    const videoDone = files.videos.length >= maxVideos;
    const audioDone = files.audios.length >= maxAudios;

    if (mode === 'dance_video') {
        if(addPhotoButton) addPhotoButton.classList.toggle('hidden', photoDone);
        if(addVideoButton) addVideoButton.classList.toggle('hidden', !photoDone || videoDone);
        if(processButton) processButton.classList.toggle('hidden', !photoDone || !videoDone);
    } else if (mode === 'talking_photo') {
        if(addPhotoButton) addPhotoButton.classList.toggle('hidden', photoDone);
        if(recordAudioButton) recordAudioButton.classList.toggle('hidden', !photoDone || audioDone);
        if(processButton) processButton.classList.toggle('hidden', !photoDone || !audioDone);
    } else { // Для фото-миксов
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

function showOriginals(urls) {
    const container = document.getElementById('originalImageContainer');
    if (urls && urls.length > 0) {
        originalPreviewsContainer.innerHTML = '';
        urls.forEach(url => {
            const el = document.createElement(url.includes('.mp4') ? 'video' : 'img');
            el.src = url;
            el.className = 'preview-image';
            if (el.tagName === 'VIDEO') el.muted = true;
            originalPreviewsContainer.appendChild(el);
        });
        container.classList.remove('hidden');
    } else {
        container.classList.add('hidden');
    }
}

function showResult(result) {
    resultWrapper.classList.remove('hidden');
    loader.classList.add('hidden');
    
    const hasImage = result.imageUrl;
    const hasVideo = result.videoUrl;
    const hasAudio = result.audioUrl;
    const hasText = result.response;

    resultImage.src = hasImage ? result.imageUrl : '';
    resultImage.classList.toggle('hidden', !hasImage);

    resultVideo.src = hasVideo ? result.videoUrl : '';
    resultVideo.classList.toggle('hidden', !hasVideo);

    // Можно добавить отдельный блок для аудио и текста, но пока просто выведем в alert
    if (hasAudio) {
        alert("Ваша музыка готова! Ссылка (пока в алерте): " + hasAudio);
    }
    if (hasText) {
        alert("Ответ Нейро-помощника:\n\n" + hasText);
    }
}

function handleError(error) {
    console.error('Ошибка в процессе:', error);
    const message = (error.error_data && error.error_data.error_reason) 
        ? `Ошибка VK: ${error.error_data.error_reason}`
        : `Произошла ошибка: ${error.message}`;
    alert(message);
    loader.classList.add('hidden');
}
