// script.js (v21 - Объединенная версия)

// --- Глобальные переменные ---
const BRAIN_API_URL = 'https://neuro-master.online/api';
let USER_ID = null;
let userIdInitialized = false;
const filesByMode = {}; // Хранилище файлов: { "vip_edit": [File, File], ... }

// --- Поиск элементов ---
const loader = document.getElementById('loader');
const resultWrapper = document.getElementById('result-wrapper');
const resultImage = document.getElementById('resultImage');
const resultVideo = document.getElementById('resultVideo');
const downloadButton = document.getElementById('downloadButton');
const modal = document.getElementById('imageModal');
const modalImg = document.getElementById("modalImage");
const closeBtn = document.querySelector(".close");

// --- Обработчики модального окна ---
resultImage.addEventListener('click', function() {
    if (resultImage.src) {
        modal.style.display = "block";
        modalImg.src = resultImage.src;
    }
});

closeBtn.onclick = function() {
    modal.style.display = "none";
}

window.onclick = function(event) {
    if (event.target == modal) {
        modal.style.display = "none";
    }
}

// --- Обработчик скачивания ---
downloadButton.addEventListener('click', async () => {
    const url = resultImage.src || resultVideo.src;
    const isVideo = !resultVideo.classList.contains('hidden');
    if (!url) return;

    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = isVideo ? 'neuro_video.mp4' : 'neuro_image.png';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (e) {
        alert("Скачивание не удалось. Попробуйте нажать на картинку и сохранить её.");
    }
});

// --- Инициализация ---
vkBridge.send('VKWebAppInit');

vkBridge.subscribe(e => {
    if (e.detail && e.detail.type === 'VKWebAppUpdateConfig' && !userIdInitialized) {
        initUser();
    }
});

setTimeout(() => { if (!userIdInitialized) initUser(); }, 2000);

async function initUser() {
    try {
        const data = await vkBridge.send('VKWebAppGetUserInfo');
        if (data.id) {
            USER_ID = data.id;
            userIdInitialized = true;
            console.log('User ID:', USER_ID);
            // Регистрируем пользователя на сервере (тихо)
            fetch(`${BRAIN_API_URL}/user/${USER_ID}`).catch(console.error);
        }
    } catch (e) {
        console.error(e);
    }
}

// --- Обработчики событий ---
document.querySelectorAll('.universal-upload-button').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const section = e.target.closest('.mode-section');
        const input = section.querySelector('.file-upload-input');
        if (input) input.click();
    });
});

document.querySelectorAll('.file-upload-input').forEach(input => {
    input.addEventListener('change', (e) => {
        const section = e.target.closest('.mode-section');
        const mode = section.dataset.mode;
        const maxPhotos = parseInt(section.dataset.maxPhotos) || 1;
        const newFiles = Array.from(e.target.files);

        if (newFiles.length === 0) return;

        if (!filesByMode[mode]) filesByMode[mode] = [];

        if (maxPhotos === 1) {
            filesByMode[mode] = [newFiles[0]];
        } else {
            for (let f of newFiles) {
                if (filesByMode[mode].length < maxPhotos) {
                    filesByMode[mode].push(f);
                }
            }
        }

        updateUI(section);
        input.value = '';
    });
});

document.querySelectorAll('.process-button').forEach(btn => {
    btn.addEventListener('click', handleProcessClick);
});

document.querySelectorAll('.style-button').forEach(btn => {
    btn.addEventListener('click', handleMusicStyleClick);
});

async function handleProcessClick(event) {
    const btn = event.target;
    const section = btn.closest('.mode-section');
    const mode = section.dataset.mode;

    if (!USER_ID) { alert("ID не определен. Перезапустите приложение."); return; }

    const promptInput = section.querySelector('.prompt-input');
    const prompt = promptInput ? promptInput.value : '';

    if (!prompt && mode !== 'i2v' && mode !== 'music') {
        alert("Пожалуйста, напишите промпт!");
        return;
    }

    const files = filesByMode[mode] || [];
    if (section.querySelector('.file-upload-input') && files.length === 0) {
        alert("Пожалуйста, выберите фото!");
        return;
    }

    btn.disabled = true;
    showLoader();

    try {
        const uploadedUrls = [];
        for (let file of files) {
            const url = await uploadToVK(file);
            uploadedUrls.push(url);
        }

        const requestBody = {
            user_id: USER_ID,
            model: mode,
            prompt: prompt,
            image_urls: uploadedUrls,
            style_prompt: mode === 'music' ? btn.dataset.style : null,
            lyrics: prompt // Для музыки текст в поле prompt
        };

        const endpoint = mode === 'chat' ? `${BRAIN_API_URL}/chat` : `${BRAIN_API_URL}/generate`;
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.detail || "Ошибка сервера");
        }

        const result = await response.json();
        showResult(result);

        filesByMode[mode] = [];
        if (promptInput) promptInput.value = '';
        updateUI(section);

        resultWrapper.scrollIntoView({ behavior: "smooth" });

    } catch (error) {
        console.error(error);
        alert("Ошибка: " + error.message);
    } finally {
        hideLoader();
        btn.disabled = false;
    }
}

async function uploadToVK(file) {
    const uploadServer = await vkBridge.send('VKWebAppGetAppUploadServer', { app_id: 51884181 });

    const formData = new FormData();
    formData.append('photo', file);
    const postResponse = await fetch(uploadServer.upload_url, { method: 'POST', body: formData });
    const postResult = await postResponse.json();

    const saved = await vkBridge.send('VKWebAppSaveAppPhoto', {
        photo: postResult.photo, server: postResult.server, hash: postResult.hash
