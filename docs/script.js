// Инициализируем VK Bridge
vkBridge.send('VKWebAppInit');

// URL нашего "мозга"
const BRAIN_API_URL = 'https://neuro-master.online';

// Находим элементы на странице
const processButton = document.getElementById('processButton');
const loader = document.getElementById('loader');
const originalImageContainer = document.getElementById('originalImageContainer');
const originalImage = document.getElementById('originalImage');
const resultImageContainer = document.getElementById('resultImageContainer');
const resultImage = document.getElementById('resultImage');

// Вешаем обработчик на кнопку
processButton.addEventListener('click', handleProcessClick);

async function handleProcessClick() {
    try {
        // 1. Просим у пользователя разрешение и фото через VK Bridge
        const photoData = await vkBridge.send('VKWebAppGetPhotos', {
            max_count: 1
        });

        // Находим фото самого большого размера
        const largestPhoto = photoData.images.sort((a, b) => b.width - a.width)[0];
        const photoUrl = largestPhoto.url;

        // Показываем оригинал и лоадер
        originalImage.src = photoUrl;
        originalImageContainer.classList.remove('hidden');
        resultImageContainer.classList.add('hidden'); // Прячем старый результат
        loader.classList.remove('hidden');

        // 2. Отправляем URL фото нашему "мозгу"
        const response = await fetch(`${BRAIN_API_URL}/process_image`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            // Тело запроса пока не включает user_id, так как у нас анонимная обработка.
            // Если понадобится учет кредитов, сюда нужно будет добавить ID пользователя.
            body: JSON.stringify({ photo_url: photoUrl })
        });

        if (!response.ok) {
            throw new Error(`Сервер ответил ошибкой: ${response.status}`);
        }

        const result = await response.json();

        // 3. Показываем результат
        if (result.success && result.processed_image_url) {
            resultImage.src = result.processed_image_url;
            resultImageContainer.classList.remove('hidden');
        } else {
            alert(`Произошла ошибка: ${result.error || 'Не удалось обработать изображение'}`);
        }

    } catch (error) {
        console.error('Ошибка в процессе обработки:', error);
        // Обработка стандартных ошибок VK Bridge (например, отказ пользователя)
        if (error.error_data && error.error_data.error_reason) {
             alert(`Ошибка VK: ${error.error_data.error_reason}`);
        } else {
             alert('Произошла непредвиденная ошибка. Попробуйте снова.');
        }
    } finally {
        // Прячем лоадер в любом случае
        loader.classList.add('hidden');
    }
}
