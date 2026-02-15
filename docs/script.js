// script.js (v15 - ТОЛЬКО АРТ-ОБРАЗ, И НИЧЕГО ЛИШНЕГО)

// --- Инициализация ---
vkBridge.send('VKWebAppInit');
const BRAIN_API_URL = 'https://neuro-master.online/api';
let USER_ID = null;
let artObrazFile = null;

// --- Поиск элементов (только то, что есть на странице!) ---
const loader = document.getElementById('loader');
const resultWrapper = document.getElementById('result-wrapper');
const resultImage = document.getElementById('resultImage');
const artObrazSelectBtn = document.getElementById('art-obraz-select-btn');
const artObrazUploadInput = document.getElementById('art-obraz-upload');
const artObrazPromptInput = document.getElementById('art-obraz-prompt');
const artObrazProcessBtn = document.getElementById('art-obraz-process-btn');
const artObrazPreviews = document.getElementById('art-obraz-previews');

// --- Получение ID пользователя ---
vkBridge.subscribe(async (e) => {
  if (e.detail?.type === 'VKWebAppUpdateConfig') {
    initializeUser();
  }
});
setTimeout(() => { initializeUser(); }, 2000);

let userInitialized = false;
async function initializeUser() {
    if (userInitialized) return;
    userInitialized = true;
    try {
        const userInfo = await vkBridge.send('VKWebAppGetUserInfo');
        if (userInfo.id) USER_ID = userInfo.id;
        console.log("VK User ID:", USER_ID);
    } catch (error) { console.error(error); }
}

// --- ЛОГИКА ДЛЯ "АРТ-ОБРАЗ" ---

// 1. Клик на "Выбрать фото"
artObrazSelectBtn.addEventListener('click', () => {
    artObrazUploadInput.click();
});

// 2. Пользователь выбрал файл
artObrazUploadInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    artObrazFile = file;
    artObrazPreviews.innerHTML = `<img src="${URL.createObjectURL(file)}" class="preview-image">`;
    artObrazProcessBtn.classList.remove('hidden');
});

// 3. Клик на "Нарисовать"
artObrazProcessBtn.addEventListener('click', async () => {
    if (!artObrazFile || !artObrazPromptInput.value || !USER_ID) {
        alert("Пожалуйста, выберите фото, введите промпт и убедитесь, что ID пользователя определен.");
        return;
    }
    showLoader();
    try {
        const photoUrl = await uploadFile(artObrazFile);
        const requestBody = { user_id: USER_ID, model: 'vip_edit', prompt: artObrazPromptInput.value, image_urls: [photoUrl] };
        const response = await fetch(`${BRAIN_API_URL}/generate`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody)
        });
        if (!response.ok) throw new Error((await response.json()).detail);
        const result = await response.json();
        showResult(result.result_url);
    } catch (error) {
        handleError(error);
    } finally {
        hideLoader();
        artObrazPreviews.innerHTML = '';
        artObrazProcessBtn.classList.add('hidden');
        artObrazPromptInput.value = '';
        artObrazUploadInput.value = null;
        artObrazFile = null;
    }
});

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

async function uploadFile(file) {
    const uploadServer = await vkBridge.send('VKWebAppGetAppUploadServer', { app_id: 51884181 });
    const formData = new FormData();
    formData.append('photo', file);
    const uploadResponse = await fetch(uploadServer.upload_url, { method: 'POST', body: formData });
    const uploadResult = await uploadResponse.json();
    const savedPhoto = await vkBridge.send('VKWebAppSaveAppPhoto', { photo: uploadResult.photo, server: uploadResult.server, hash: uploadResult.hash });
    return savedPhoto.images.sort((a,b) => b.width - a.width)[0].url;
}

function showLoader() { loader.classList.remove('hidden'); resultWrapper.classList.add('hidden'); }
function hideLoader() { loader.classList.add('hidden'); }
function showResult(url) {
    resultWrapper.classList.remove('hidden');
    resultImage.src = url;
    resultImage.classList.remove('hidden');
}
function handleError(error) {
    console.error('Ошибка:', error);
    alert(`Произошла ошибка: ${error.message}`);
    hideLoader();
}
