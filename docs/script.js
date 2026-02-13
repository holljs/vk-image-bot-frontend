vkBridge.send('VKWebAppInit');

const BRAIN_API_URL = 'https://neuro-master.online';

// --- Глобальные переменные ---
const multiStepPhotoUrls = {}; 

// --- Поиск элементов ---
const loader = document.getElementById('loader');
const originalImageContainer = document.getElementById('originalImageContainer');
const originalImage = document.getElementById('originalImage');
const resultContainer = document.getElementById('resultContainer');
const resultImage = document.getElementById('resultImage');
const resultVideo = document.getElementById('resultVideo');

// --- Привязка обработчиков ---

// 1. Привязываем обработчики ко всем кнопкам, которые должны ЗАПУСКАТЬ обработку
document.querySelectorAll('.process-button').forEach(button => {
    button.addEventListener('click', handleProcessClick);
});

// 2. Привязываем обработчики ко всем кнопкам, которые должны ДОБАВЛЯТЬ фото
document.querySelectorAll('.add-photo-button').forEach(button => {
    button.addEventListener('click', handleAddPhotoClick);
});

// --- Логика ---

// КЛИК НА "ДОБАВИТЬ ФОТО"
async function handleAddPhotoClick(event) {
    const section = event.target.closest('.mode-section');
    const mode = section.dataset.mode;
    
    console.log(`Нажата кнопка 'Добавить фото' для режима: ${mode}`); // Строка для отладки

    try {
        // Вот здесь должен вызываться VK Bridge и появляться ошибка в браузере
        const photoData = await vkBridge.send('VKWebAppGetPhotos', { max_count: 1 });
        
        const largestPhoto = photoData.images.sort((a, b) => b.width - a.width)[0];
        
        if (!multiStepPhotoUrls[mode]) {
            multiStepPhotoUrls[mode] = [];
        }
        multiStepPhotoUrls[mode].push(largestPhoto.url);

        updateMultiStepUI(section, mode);

    } catch (error) {
        // Здесь мы должны увидеть ошибку 'unsupported platform'
        handleError(error);
    }
}

// КЛИК НА "ЗАПУСТИТЬ" ИЛИ "НАРИСОВАТЬ"
async function handleProcessClick(event) {
    // ... (эта функция пока остается без изменений, она будет вызвана второй)
    const section = event.target.closest('.mode-section');
    const mode = section.dataset.mode;
    const promptInput = section.querySelector('.prompt-input');
    let prompt = promptInput.value;
    
    if (!prompt && mode !== 'i2v') { 
        alert('Пожалуйста, введите текстовое описание (промпт).');
        return;
    }
    if (!prompt && mode === 'i2v') {
        prompt = ".";
    }

    try {
        let requestBody = { prompt };
        let displayUrl = null; // URL для показа в блоке "оригинал"
        
        if (section.dataset.multistep === 'true') {
            if (!multiStepPhotoUrls[mode] || multiStepPhotoUrls[mode].length === 0) {
                alert('Пожалуйста, добавьте хотя бы одно фото.');
                return;
            }
            requestBody.image_urls = multiStepPhotoUrls[mode];
            displayUrl = multiStepPhotoUrls[mode][multiStepPhotoUrls[mode].length - 1];
        
        } else if (mode === 't2i') {
            displayUrl = null;
        
        } else {
            const photoData = await vkBridge.send('VKWebAppGetPhotos', { max_count: 1 });
            const largestPhoto = photoData.images.sort((a, b) => b.width - a.width)[0];
            requestBody.image_url = largestPhoto.url;
            displayUrl = largestPhoto.url;
        }

        showLoaderAndOriginal(displayUrl);
        
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
            updateMultiStepUI(section, mode);
        }

    } catch (error) {
        handleError(error);
    } finally {
        loader.classList.add('hidden');
    }
}


function updateMultiStepUI(section, mode) {
    const previewsContainer = section.querySelector('.image-previews');
    const processButton = section.querySelector('.process-button');
    if (!previewsContainer || !processButton) return;

    previewsContainer.innerHTML = '';
    (multiStepPhotoUrls[mode] || []).forEach(url => {
        const img = document.createElement('img');
        img.src = url;
        img.className = 'preview-image';
        previewsContainer.appendChild(img);
    });

    if (multiStepPhotoUrls[mode] && multiStepPhotoUrls[mode].length > 0) {
        processButton.classList.remove('hidden');
    } else {
        processButton.classList.add('hidden');
    }
}

function showLoaderAndOriginal(photoUrl) {
    if (photoUrl) {
        originalImage.src = photoUrl;
        originalImageContainer.classList.remove('hidden');
    } else {
        originalImageContainer.classList.add('hidden');
    }
    resultContainer.classList.add('hidden');
    resultImage.classList.add('hidden');
    resultVideo.classList.add('hidden');
    loader.classList.remove('hidden');
}

function showResult(result) {
    resultContainer.classList.remove('hidden');
    if (result.imageUrl) {
        resultImage.src = result.imageUrl;
        resultImage.classList.remove('hidden');
    } else if (result.videoUrl) {
        resultVideo.src = result.videoUrl;
        resultVideo.classList.remove('hidden');
    }
}

function handleError(error) {
    console.error('Ошибка в процессе:', error);
    if (error.error_data && error.error_data.error_reason) {
        alert(`Ошибка VK: ${error.error_data.error_reason}`);
    } else {
        alert(`Произошла ошибка: ${error.message}`);
    }
}

