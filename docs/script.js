<script>
    const vkBridge = window.vkBridge;

    // --- DOM элементы ---
    const balanceElement = document.getElementById('balance');
    const promptInput = document.getElementById('prompt');
    const generateBtn = document.getElementById('generateBtn');
    const resultImage = document.getElementById('resultImage');
    const loadingSpinner = document.getElementById('loading');
    const errorMessage = document.getElementById('errorMessage');

    let userId = null;
    let currentModel = 'imagine'; // Модель по умолчанию

    // --- Инициализация приложения ---
    document.addEventListener('DOMContentLoaded', async () => {
        // Инициализируем VK Bridge
        vkBridge.send('VKWebAppInit');
        
        try {
            // Получаем ID пользователя
            const userInfo = await vkBridge.send('VKWebAppGetUserInfo');
            if (userInfo.id) {
                userId = userInfo.id;
                // Запрашиваем баланс пользователя с нашего бэкенда
                fetchBalance();
            }
        } catch (error) {
            showError('Не удалось получить ID пользователя VK.');
            console.error(error);
        }
    });

    // --- Функции API ---
    async function fetchBalance() {
        if (!userId) return;
        try {
            const response = await fetch(`https://neuro-master.online/api/user/${userId}`);
            const data = await response.json();
            if (data.success) {
                balanceElement.textContent = `Баланс: ${data.balance}`;
            } else {
                showError('Не удалось загрузить баланс.');
            }
        } catch (error) {
            showError('Ошибка сети при загрузке баланса.');
            console.error(error);
        }
    }

    async function generateImage() {
        const prompt = promptInput.value.trim();
        if (!prompt) {
            showError('Пожалуйста, введите текстовый запрос.');
            return;
        }
        if (!userId) {
            showError('Не удалось определить пользователя. Перезагрузите приложение.');
            return;
        }

        // Показываем спиннер и скрываем старые результаты
        loadingSpinner.style.display = 'block';
        errorMessage.style.display = 'none';
        resultImage.style.display = 'none';
        generateBtn.disabled = true;

        try {
            const response = await fetch('https://neuro-master.online/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    prompt: prompt,
                    model: currentModel,
                }),
            });

            const data = await response.json();

            if (response.ok && data.success) {
                resultImage.src = data.image_url;
                resultImage.style.display = 'block';
                // Обновляем баланс после успешной генерации
                fetchBalance(); 
            } else {
                // Если сервер вернул ошибку (например, кончились деньги)
                showError(data.detail || 'Произошла ошибка генерации.');
            }
        } catch (error) {
            showError('Ошибка сети. Не удалось отправить запрос.');
            console.error(error);
        } finally {
            // Скрываем спиннер и включаем кнопку
            loadingSpinner.style.display = 'none';
            generateBtn.disabled = false;
        }
    }

    // --- Вспомогательные функции ---
    function selectModel(modelName, buttonElement) {
        currentModel = modelName;
        // Снимаем класс 'active' со всех кнопок
        document.querySelectorAll('.pills button').forEach(btn => btn.classList.remove('active'));
        // Добавляем класс 'active' к нажатой
        buttonElement.classList.add('active');
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
    }

    // --- Назначаем обработчики ---
    generateBtn.addEventListener('click', generateImage);

</script>
