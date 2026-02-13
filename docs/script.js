vkBridge.send('VKWebAppInit');

const BRAIN_API_URL = 'https://neuro-master.online';

// Находим общие элементы
const loader = document.getElementById('loader');
const originalImageContainer = document.getElementById('originalImageContainer');
const originalImage = document.getElementById('originalImage');
const resultContainer = document.getElementById('resultContainer');
const resultImage = document.getElementById('resultImage');
const resultVideo = document.getElementById('resultVideo');

// Находим все кнопки "запустить"
const processButtons = document.querySelectorAll('.process-button');

// Добавляем обработчик на каждую кнопку
processButtons.forEach(button => {
    button.addEventListener('click', handleProcessClick);
});

async function handleProcessClick(event) {
    // Находим родительскую секцию, чтобы понять, какой режим выбран
    const section = event.target.closest('.mode-section');
    const mode = section.dataset.mode;
    const promptInput = section.querySelector('.prompt-input');
    const prompt = promptInput.value;

    if (!prompt) {
        alert('Пожалуйста, введите текстовое описание (промпт) для обработки.');
        return;
    }

    try {
        // 1. Получаем фото от пользователя
        const photoData = await vkBridge.send('VKWebAppGetPhotos', { max_count: 1 });
        const largestPhoto = photoData.images.sort((a, b) => b.width - a.width)[0];
        const photoUrl = largestPhoto.url;
        
        // Показываем UI
        showLoaderAndOriginal(photoUrl);

        // 2. Готовим тело запроса для "мозга"
        const requestBody = {
            // user_id пока не передаем для анонимности
            // user_id: 12345, 
            prompt: prompt,
            // В зависимости от режима, ключ для URL будет разным
            image_url: photoUrl, // Для vip_edit
            image_urls: [photoUrl] // Для quick_edit
        };

        // 3. Отправляем запрос на правильную "дверь" API
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

        // 4. Показываем результат
        showResult(result);

    } catch (error) {
        handleError(error);
    } finally {
        loader.classList.add('hidden');
    }
}

function showLoaderAndOriginal(photoUrl) {
    originalImage.src = photoUrl;
    originalImageContainer.classList.remove('hidden');
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
