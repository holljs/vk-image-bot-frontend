vkBridge.send('VKWebAppInit');
const BRAIN_API_URL = 'https://neuro-master.online';

// --- Глобальные хранилища ---
const multiStepFiles = {}; // Теперь хранит и фото, и видео

// --- Поиск элементов ---
// ... (все без изменений)

// --- Привязка обработчиков ---
document.querySelectorAll('.process-button').forEach(b => b.addEventListener('click', handleProcessClick));
document.querySelectorAll('.add-photo-button').forEach(b => b.addEventListener('click', handleAddFileClick, { once: false }));
document.querySelectorAll('.add-video-button').forEach(b => b.addEventListener('click', handleAddFileClick, { once: false }));


// --- Логика ---

// ОБЩАЯ ФУНКЦИЯ ДЛЯ ДОБАВЛЕНИЯ ФАЙЛОВ (ФОТО И ВИДЕО)
async function handleAddFileClick(event) {
    const button = event.target;
    const section = button.closest('.mode-section');
    const mode = section.dataset.mode;
    const isVideo = button.classList.contains('add-video-button');
    
    const method = isVideo ? 'VKWebAppGetVideos' : 'VKWebAppGetPhotos';
    const options = isVideo ? {} : { max_count: 1 };

    try {
        const fileData = await vkBridge.send(method, options);
        const fileUrl = isVideo 
            ? fileData.videos[0].player // У видео получаем player URL
            : fileData.images.sort((a, b) => b.width - a.width)[0].url;

        if (!multiStepFiles[mode]) multiStepFiles[mode] = { photos: [], videos: [] };

        if (isVideo) {
            multiStepFiles[mode].videos.push(fileUrl);
        } else {
            multiStepFiles[mode].photos.push(fileUrl);
        }

        updateMultiStepUI(section);

    } catch (error) {
        handleError(error);
    }
}


// КЛИК НА "ЗАПУСТИТЬ"
async function handleProcessClick(event) {
    // ... (начало функции без изменений)
    const button = event.target;
    const section = button.closest('.mode-section');
    const mode = section.dataset.mode;
    let promptInput = section.querySelector('.prompt-input');
    let prompt = promptInput ? promptInput.value : '';

    // Для i2v промпт необязателен, как и для dance_video
    if (!prompt && !['i2v', 'dance_video'].includes(mode)) {
        alert('Пожалуйста, введите текстовое описание (промпт).');
        return;
    }
    if (!prompt && mode === 'i2v') {
        prompt = "."; // Отправляем точку, как в TG-боте
    }

    button.disabled = true;
    showLoader();

    try {
        const requestBody = { prompt };
        let displayUrls = [];

        if (section.dataset.multistep === 'true') {
            const files = multiStepFiles[mode];
            if (!files || (files.photos.length === 0 && files.videos.length === 0)) throw new Error('Пожалуйста, добавьте медиафайлы.');
            
            // Специальная логика для VIP-Клипа
            if (mode === 'dance_video') {
                requestBody.character_image = files.photos[0];
                requestBody.video_url = files.videos[0];
            } else {
                 requestBody.image_urls = files.photos;
            }
            displayUrls = [...files.photos, ...files.videos];
        
        } else if (mode === 't2v') {
            // Для T2V файлы не нужны
        } else { // Обычные режимы с 1 фото (vip_edit, i2v)
            const photoData = await vkBridge.send('VKWebAppGetPhotos', { max_count: 1 });
            const largestPhoto = photoData.images.sort((a, b) => b.width - a.width)[0];
            requestBody.image_url = largestPhoto.url;
            displayUrls = [largestPhoto.url];
        }
        
        showOriginals(displayUrls);
        
        const response = await fetch(`${BRAIN_API_URL}/generate_${mode}`, {
            // ... (отправка запроса без изменений)
        });

        // ... (обработка ответа и ошибок без изменений)

        // Сброс состояния после успеха
        if (section.dataset.multistep === 'true') {
            multiStepFiles[mode] = { photos: [], videos: [] };
            updateMultiStepUI(section);
        }

    } catch (error) {
        handleError(error);
    } finally {
        // ... (finally блок без изменений)
    }
}


function updateMultiStepUI(section) {
    const mode = section.dataset.mode;
    const previewsContainer = section.querySelector('.image-previews');
    const processButton = section.querySelector('.process-button');
    const addPhotoButton = section.querySelector('.add-photo-button');
    const addVideoButton = section.querySelector('.add-video-button');
    
    const maxPhotos = parseInt(section.dataset.maxPhotos, 10) || 1;
    const maxVideos = parseInt(section.dataset.maxVideos, 10) || 0;

    const files = multiStepFiles[mode] || { photos: [], videos: [] };
    
    // ... (отрисовка миниатюр фото и видео)

    // Управление видимостью и состоянием кнопок
    if (mode === 'dance_video') {
        const photoDone = files.photos.length >= maxPhotos;
        const videoDone = files.videos.length >= maxVideos;
        
        addPhotoButton.classList.toggle('hidden', photoDone);
        addVideoButton.classList.toggle('hidden', !photoDone || videoDone);
        processButton.classList.toggle('hidden', !photoDone || !videoDone);
    } else {
        // Логика для фото-миксов
        // ...
    }
}

// ... (остальные функции без существенных изменений)

