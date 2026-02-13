vkBridge.send('VKWebAppInit');

const BRAIN_API_URL = 'https://neuro-master.online';

// --- Глобальные переменные ---
// Хранилище для URL-адресов фото в пошаговых режимах
const multiStepPhotoUrls = {}; 

// --- Поиск элементов ---
const loader = document.getElementById('loader');
// ... (остальные элементы)

// --- Обработчики ---
document.querySelectorAll('.process-button').forEach(button => {
    button.addEventListener('click', handleProcessClick);
});

document.querySelectorAll('.add-photo-button').forEach(button => {
    button.addEventListener('click', handleAddPhotoClick);
});

// --- Логика ---

// Клик по кнопке "Добавить фото"
async function handleAddPhotoClick(event) {
    const section = event.target.closest('.mode-section');
    const mode = section.dataset.mode;

    try {
        const photoData = await vkBridge.send('VKWebAppGetPhotos', { max_count: 1 });
        const largestPhoto = photoData.images.sort((a, b) => b.width - a.width)[0];
        
        // Инициализируем массив фото для этого режима, если его нет
        if (!multiStepPhotoUrls[mode]) {
            multiStepPhotoUrls[mode] = [];
        }
        // Добавляем URL нового фото
        multiStepPhotoUrls[mode].push(largestPhoto.url);

        // Обновляем интерфейс
        updateMultiStepUI(section, mode);

    } catch (error) {
        handleError(error);
    }
}

// Обновление UI для пошаговых секций
function updateMultiStepUI(section, mode) {
    const previewsContainer = section.querySelector('.image-previews');
    const processButton = section.querySelector('.process-button');

    // Очищаем старые миниатюры
    previewsContainer.innerHTML = '';

    // Рисуем новые миниатюры
    multiStepPhotoUrls[mode].forEach(url => {
        const img = document.createElement('img');
        img.src = url;
        img.style.width = '80px';
        img.style.height = '80px';
        img.style.objectFit = 'cover';
        img.style.margin = '5px';
        img.style.borderRadius = '8px';
        previewsContainer.appendChild(img);
    });

    // Показываем кнопку "Запустить", если есть хотя бы одно фото
    if (multiStepPhotoUrls[mode].length > 0) {
        processButton.classList.remove('hidden');
    }
}


// Клик по кнопке "Запустить" или "Нарисовать"
async function handleProcessClick(event) {
    const section = event.target.closest('.mode-section');
    const mode = section.dataset.mode;
    const promptInput = section.querySelector('.prompt-input');
    let prompt = promptInput.value;
    
    // ... (проверка на пустой промпт)

    try {
        let requestBody = { prompt };
        
        // --- Логика для разных режимов ---
        if (section.dataset.multistep === 'true') {
            // Пошаговый режим
            if (!multiStepPhotoUrls[mode] || multiStepPhotoUrls[mode].length === 0) {
                alert('Пожалуйста, добавьте хотя бы одно фото.');
                return;
            }
            requestBody.image_urls = multiStepPhotoUrls[mode];
            // Показываем последнюю добавленную картинку как "оригинал"
            showLoaderAndOriginal(multiStepPhotoUrls[mode][multiStepPhotoUrls[mode].length - 1]);
        
        } else if (mode === 't2i') {
            // Режим Текст-в-Картинку
            showLoaderAndOriginal(null); // Фото нет
        
        } else {
            // Обычный режим с одним фото
            const photoData = await vkBridge.send('VKWebAppGetPhotos', { max_count: 1 });
            const largestPhoto = photoData.images.sort((a, b) => b.width - a.width)[0];
            requestBody.image_url = largestPhoto.url;
            showLoaderAndOriginal(largestPhoto.url);
        }

        // --- Отправка запроса ---
        const response = await fetch(`${BRAIN_API_URL}/generate_${mode}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        
        // ... (обработка ответа и ошибок, как раньше)
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || `Сервер ответил ошибкой: ${response.status}`);
        }
        const result = await response.json();
        showResult(result);

        // Сбрасываем состояние пошагового режима после успешной обработки
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

// ... (остальные функции showLoaderAndOriginal, showResult, handleError без изменений)
// ...
