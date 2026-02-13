vkBridge.send('VKWebAppInit');
const BRAIN_API_URL = 'https://neuro-master.online';

// --- Глобальное хранилище для URL-адресов в пошаговых режимах ---
const multiStepPhotoUrls = {};

// --- Поиск элементов ---
const loader = document.getElementById('loader');
const resultWrapper = document.getElementById('result-wrapper');
const originalPreviewsContainer = document.querySelector('#originalImageContainer .image-previews');
const resultImage = document.getElementById('resultImage');
const resultVideo = document.getElementById('resultVideo');

// --- Привязка обработчиков ---
document.querySelectorAll('.process-button').forEach(b => b.addEventListener('click', handleProcessClick));
document.querySelectorAll('.add-photo-button').forEach(b => b.addEventListener('click', handleAddPhotoClick));

// --- Логика ---

// КЛИК НА "ДОБАВИТЬ ФОТО"
async function handleAddPhotoClick(event) {
    const section = event.target.closest('.mode-section');
    const mode = section.dataset.mode;
    const maxPhotos = parseInt(section.dataset.maxPhotos, 10) || 10; // 10 - условный максимум

    if (multiStepPhotoUrls[mode] && multiStepPhotoUrls[mode].length >= maxPhotos) {
        alert(`Максимум ${maxPhotos} фото для этого режима.`);
        return;
    }

    try {
        const photoData = await vkBridge.send('VKWebAppGetPhotos', { max_count: 1 });
        const largestPhoto = photoData.images.sort((a, b) => b.width - a.width)[0];
        
        if (!multiStepPhotoUrls[mode]) multiStepPhotoUrls[mode] = [];
        multiStepPhotoUrls[mode].push(largestPhoto.url);

        updateMultiStepUI(section);
    } catch (error) {
        handleError(error);
    }
}

// КЛИК НА "ЗАПУСТИТЬ" ИЛИ "НАРИСОВАТЬ"
async function handleProcessClick(event) {
    const button = event.target;
    const section = button.closest('.mode-section');
    const mode = section.dataset.mode;
    const prompt = section.querySelector('.prompt-input').value;

    if (!prompt) {
        alert('Пожалуйста, введите текстовое описание (промпт).');
        return;
    }

    button.disabled = true; // Блокируем кнопку на время обработки
    showLoader();

    try {
        const requestBody = { prompt };
        let displayUrls = [];

        if (section.dataset.multistep === 'true') {
            const urls = multiStepPhotoUrls[mode];
            if (!urls || urls.length === 0) throw new Error('Пожалуйста, добавьте хотя бы одно фото.');
            requestBody.image_urls = urls;
            displayUrls = urls;
        } else if (mode !== 't2i') {
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
            multiStepPhotoUrls[mode] = [];
            updateMultiStepUI(section);
        }

    } catch (error) {
        handleError(error);
    } finally {
        loader.classList.add('hidden');
        button.disabled = false; // Разблокируем кнопку
    }
}

// --- Функции обновления UI ---

function updateMultiStepUI(section) {
    const mode = section.dataset.mode;
    const previewsContainer = section.querySelector('.image-previews');
    const processButton = section.querySelector('.process-button');
    const addPhotoButton = section.querySelector('.add-photo-button');
    const maxPhotos = parseInt(section.dataset.maxPhotos, 10) || 10;
    
    previewsContainer.innerHTML = '';
    const urls = multiStepPhotoUrls[mode] || [];
    
    urls.forEach(url => {
        const img = document.createElement('img');
        img.src = url;
        img.className = 'preview-image';
        previewsContainer.appendChild(img);
    });

    processButton.classList.toggle('hidden', urls.length === 0);
    addPhotoButton.textContent = `Добавить фото (${urls.length}/${maxPhotos})`;
    addPhotoButton.disabled = urls.length >= maxPhotos;
}

function showLoader() {
    resultWrapper.classList.add('hidden');
    loader.classList.remove('hidden');
}

function showOriginals(urls) {
    if (urls && urls.length > 0) {
        originalPreviewsContainer.innerHTML = '';
        urls.forEach(url => {
            const img = document.createElement('img');
            img.src = url;
            img.className = 'preview-image';
            originalPreviewsContainer.appendChild(img);
        });
        document.getElementById('originalImageContainer').classList.remove('hidden');
    } else {
        document.getElementById('originalImageContainer').classList.add('hidden');
    }
}

function showResult(result) {
    resultWrapper.classList.remove('hidden');
    loader.classList.add('hidden');
    
    const hasImage = result.imageUrl;
    const hasVideo = result.videoUrl;

    resultImage.src = hasImage ? result.imageUrl : '';
    resultImage.classList.toggle('hidden', !hasImage);

    resultVideo.src = hasVideo ? result.videoUrl : '';
    resultVideo.classList.toggle('hidden', !hasVideo);
}

function handleError(error) {
    console.error('Ошибка в процессе:', error);
    const message = (error.error_data && error.error_data.error_reason) 
        ? `Ошибка VK: ${error.error_data.error_reason}`
        : `Произошла ошибка: ${error.message}`;
    alert(message);
    loader.classList.add('hidden');
}

