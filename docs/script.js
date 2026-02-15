// script.js (v8 - Полная версия с правильной логикой)

vkBridge.send('VKWebAppInit');

// --- Глобальные переменные ---
const BRAIN_API_URL = 'https://neuro-master.online/api';
let USER_ID = null;
let selectedFile = null; // Будем хранить выбранный файл здесь

// --- Поиск элементов ---
const loader = document.getElementById('loader');
const resultWrapper = document.getElementById('result-wrapper');
const originalPreviewsContainer = document.getElementById('original-previews');
const resultImage = document.getElementById('resultImage');
const resultVideo = document.getElementById('resultVideo');
const vipEditUploadInput = document.getElementById('vip-edit-upload');
const vipEditPromptInput = document.getElementById('vip-edit-prompt');
const vipEditPreviews = document.getElementById('vip-edit-previews');
const vipEditProcessBtn = document.getElementById('vip-edit-process');


// --- Инициализация ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const userInfo = await vkBridge.send('VKWebAppGetUserInfo');
        if (userInfo.id) {
            USER_ID = userInfo.id;
            console.log("VK User ID:", USER_ID);
            // "Знакомим" пользователя с сервером
            fetch(`${BRAIN_API_URL}/user/${USER_ID}`).catch(err => console.error("User registration failed:", err));
        }
    } catch (e) {
        alert("Не удалось определить ID пользователя. Пожалуйста, запустите приложение из VK.");
    }
});


// --- ШАГ 1: Пользователь выбрал файл ---
vipEditUploadInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    selectedFile = file; // Сохраняем файл глобально

    // Показываем превью
    vipEditPreviews.innerHTML = ''; // Очищаем старое
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file); // Создаем временный URL для показа
    img.className = 'preview-image';
    vipEditPreviews.appendChild(img);

    // Показываем кнопку "Нарисовать"
    vipEditProcessBtn.classList.remove('hidden');
});


// --- ШАГ 2: Пользователь нажал "Нарисовать" ---
vipEditProcessBtn.addEventListener('click', async () => {
    if (!selectedFile) {
        alert("Пожалуйста, сначала выберите фото.");
        return;
    }
    const prompt = vipEditPromptInput.value;
    if (!prompt) {
        alert("Пожалуйста, введите текстовое описание (промпт)!");
        return;
    }
    if (!USER_ID) {
        alert("ID пользователя не определен. Перезапустите приложение.");
        return;
    }

    showLoader(); // <-- ПОКАЗЫВАЕМ ЗАГРУЗЧИК
    try {
        // --- Начинается магия, которую мы уже отладили ---
        const uploadServer = await vkBridge.send('VKWebAppGetAppUploadServer', {
            app_id: 51884181, // ID вашего приложения
        });
        
        const formData = new FormData();
        formData.append('photo', selectedFile);
        
        const uploadResponse = await fetch(uploadServer.upload_url, { method: 'POST', body: formData });
        const uploadResult = await uploadResponse.json();
        
        const savedPhoto = await vkBridge.send('VKWebAppSaveAppPhoto', {
            photo: uploadResult.photo, server: uploadResult.server, hash: uploadResult.hash
        });

        const photoUrl = savedPhoto.images.sort((a,b) => b.width - a.width)[0].url;
        
        const requestBody = {
            user_id: USER_ID, model: 'vip_edit', prompt: prompt, image_urls: [photoUrl]
        };

        const response = await fetch(`${BRAIN_API_URL}/generate`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody)
        });

        if (!response.ok) throw new Error((await response.json()).detail);
        
        const result = await response.json();
        showOriginals([photoUrl]);
        showResult(result);

    } catch (error) {
        handleError(error);
    } finally {
        hideLoader();
        // Сбрасываем все, чтобы можно было начать заново
        selectedFile = null;
        vipEditUploadInput.value = null;
        vipEditProcessBtn.classList.add('hidden');
        vipEditPreviews.innerHTML = '';
        vipEditPromptInput.value = '';
    }
});

// --- Кликабельный результат ---
resultImage.addEventListener('click', () => {
    if (resultImage.src) { window.open(resultImage.src, '_blank'); }
});
resultVideo.addEventListener('click', () => {
    if (resultVideo.src) { window.open(resultVideo.src, '_blank'); }
});


// --- Вспомогательные функции UI ---
function showLoader() {
    loader.classList.remove('hidden');
    resultWrapper.classList.add('hidden');
}

function hideLoader() {
    loader.classList.add('hidden');
}

function showOriginals(urls) {
    originalPreviewsContainer.innerHTML = '';
    if (urls && urls.length > 0) {
        urls.forEach(url => {
            if (!url) return;
            const el = document.createElement('img');
            el.src = url;
            el.className = 'preview-image';
            originalPreviewsContainer.appendChild(el);
        });
        document.getElementById('originalImageContainer').classList.remove('hidden');
    } else {
        document.getElementById('originalImageContainer').classList.add('hidden');
    }
}

function showResult(result) {
    resultWrapper.classList.remove('hidden');
    hideLoader();
    const resultUrl = result.result_url;
    const isVideo = resultUrl && ['.mp4', '.mov'].some(ext => resultUrl.includes(ext));
    const isImage = resultUrl && !isVideo;

    resultImage.src = isImage ? resultUrl : '';
    resultImage.classList.toggle('hidden', !isImage);

    resultVideo.src = isVideo ? resultUrl : '';
    resultVideo.classList.toggle('hidden', !isVideo);
}

function handleError(error) {
    console.error('Ошибка в процессе:', error);
    alert(`Произошла ошибка: ${error.message}`);
    hideLoader();
}
