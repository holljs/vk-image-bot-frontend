// Инициализация
vkBridge.send('VKWebAppInit');

// Элементы
const loadingScreen = document.getElementById('screen-loading');
const mainScreen = document.getElementById('screen-main');
const promptInput = document.getElementById('prompt-input');
const generateButton = document.getElementById('generate-button');
const resultContainer = document.getElementById('result-container');
const resultImage = document.getElementById('result-image');

// --- Логика ---

function showScreen(screenElement) {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    screenElement.style.display = 'block';
}

async function startApp() {
    // В будущем здесь будет проверка подписки
    showScreen(mainScreen); 
}

// Обработчик нажатия на кнопку
generateButton.addEventListener('click', async () => {
    const prompt = promptInput.value;
    if (!prompt) {
        alert("Пожалуйста, введите описание картинки.");
        return;
    }

    // Блокируем кнопку и показываем загрузку
    generateButton.disabled = true;
    generateButton.innerText = "🔮 Создаю магию...";
    resultContainer.style.display = 'none';

    try {
        // --- ЗДЕСЬ БУДЕТ ЗАПРОС К НАШЕМУ СЕРВЕРУ ---
        // const response = await fetch(`${API_SERVER_URL}/generate_image`, {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify({ user_id: 123, prompt: prompt })
        // });
        // const data = await response.json();

        // --- ВРЕМЕННАЯ ЗАГЛУШКА ДЛЯ ТЕСТА ---
        await new Promise(resolve => setTimeout(resolve, 2000)); // Имитация задержки
        const testImageUrl = "https://i.imgur.com/8nLFCVP.png"; // Тестовая картинка
        // ------------------------------------

        // Показываем результат
        resultImage.src = testImageUrl; // data.imageUrl;
        resultContainer.style.display = 'block';

    } catch (error) {
        console.error("Ошибка генерации:", error);
        alert("Произошла ошибка. Попробуйте позже.");
    } finally {
        // Разблокируем кнопку
        generateButton.disabled = false;
        generateButton.innerText = "🎨 Сгенерировать";
    }
});

// Запускаем приложение
startApp();
