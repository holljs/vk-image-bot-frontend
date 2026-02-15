// script.js (v5 - УПРОЩЕННАЯ ВЕРСИЯ)

vkBridge.send('VKWebAppInit');

// --- Глобальные переменные ---
const BRAIN_API_URL = 'https://neuro-master.online/api';
let USER_ID = null;

// --- Поиск элементов ---
const loader = document.getElementById('loader');
const resultWrapper = document.getElementById('result-wrapper');
const originalPreviewsContainer = document.querySelector('#originalImageContainer .image-previews');
const resultImage = document.getElementById('resultImage');
const resultVideo = document.getElementById('resultVideo');
const vipEditUploadInput = document.getElementById('vip-edit-upload');
const vipEditPromptInput = document.getElementById('vip-edit-prompt');


// --- Инициализация ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const userInfo = await vkBridge.send('VKWebAppGetUserInfo');
        if (userInfo.id) {
            USER_ID = userInfo.id;
            console.log("VK User ID:", USER_ID);
            fetch(`${BRAIN_API_URL}/user/${USER_ID}`).catch(err => console.error(err));
        }
    } catch (e) {
        alert("Не удалось определить ID пользователя. Пожалуйста, запустите приложение из VK.");
    }
});


// --- ГЛАВНЫЙ И ЕДИНСТВЕННЫЙ ОБРАБОТЧИК ---
vipEditUploadInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const prompt = vipEditPromptInput.value;
    if (!prompt) {
        alert("Пожалуйста, сначала введите текстовое описание (промпт)!");
        // Сбрасываем input, чтобы можно было выбрать тот же файл снова
        event.target.value = null; 
        return;
    }

    if (!USER_ID) {
        alert("ID пользователя не определен. Перезапустите приложение.");
        return;
    }

    showLoader();
    try {
        // 1. Получаем сервер для загрузки от VK
        const uploadServer = await vkBridge.send('VKWebAppGetAppUploadServer', {
            app_id: 51884181, // ID вашего приложения
        });

        // 2. Формируем данные и загружаем файл на сервер VK
        const formData = new FormData();
        formData.append('photo', file); // VK ожидает поле с именем 'photo'
        
        const uploadResponse = await fetch(uploadServer.upload_url, {
            method: 'POST',
            body: formData
        });
        const uploadResult = await uploadResponse.json();
        
        // 3. Сохраняем фото в VK, чтобы получить постоянный URL
        const savedPhoto = await vkBridge.send('VKWebAppSaveAppPhoto', {
            photo: uploadResult.photo,
            server: uploadResult.server,
            hash: uploadResult.hash
        });

        // Находим самый большой URL
        const photoUrl = savedPhoto.images.sort((a, b) => b.width - a.width)[0].url;
        
        // --- Все готово для отправки на наш "мозг" ---
        const requestBody = {
            user_id: USER_ID,
            model: 'vip_edit',
            prompt: prompt,
            image_urls: [photoUrl]
        };

        const response = await fetch(`${BRAIN_API_URL}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) throw new Error((await response.json()).detail);
        
        const result = await response.json();
        showOriginals([photoUrl]);
        showResult(result);

    } catch (error) {
        handleError(error);
    } finally {
        hideLoader();
        event.target.value = null; // Сбрасываем input
    }
});


// --- Вспомогательные функции UI ---
function showLoader() { /* ... (код без изменений) */ }
function hideLoader() { /* ... (код без изменений) */ }
function showOriginals(urls) { /* ... (код без изменений) */ }
function showResult(result) { /* ... (код без изменений) */ }
function handleError(error) { /* ... (код без изменений) */ }

