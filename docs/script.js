// script.js (ФИНАЛЬНАЯ ВЕРСИЯ ДЛЯ VK MINI APP)

// Инициализируем VK Bridge
vkBridge.send('VKWebAppInit').catch(error => console.error("VK Bridge Init Error:", error));

// --- Глобальные переменные ---
const BRAIN_API_URL = 'https://neuro-master.online/api'; // Используем /api как базовый путь
let USER_ID = null; // Будем хранить ID пользователя здесь

// --- Поиск элементов ---
const loader = document.getElementById('loader');
const resultWrapper = document.getElementById('result-wrapper');
const originalPreviewsContainer = document.querySelector('#originalImageContainer .image-previews');
const resultImage = document.getElementById('resultImage');
const resultVideo = document.getElementById('resultVideo');

// --- Глобальное хранилище для файлов ---
const multiStepFiles = {};

// --- Получение ID пользователя при запуске ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const userInfo = await vkBridge.send('VKWebAppGetUserInfo');
        if (userInfo.id) {
            USER_ID = userInfo.id;
            console.log("VK User ID получен:", USER_ID);
            // "Знакомим" пользователя с сервером
            fetch(`${BRAIN_API_URL}/user/${USER_ID}`).catch(err => console.error("User registration failed", err));
        }
    } catch (e) {
        handleError(new Error("Не удалось получить ID пользователя VK."));
    }
});


// --- ОСНОВНАЯ ЛОГИКА ---

// 1. Обработчик клика на ЛЮБУЮ кнопку "Запустить/Нарисовать/Отправить"
async function handleProcessClick(event) {
    const button = event.target;
    const section = button.closest('.mode-section');
    const model = section.dataset.mode;
    
    if (!USER_ID) {
        alert("Не удалось определить ID пользователя. Пожалуйста, перезапустите приложение.");
        return;
    }

    button.disabled = true;
    showLoader();

    try {
        const requestBody = {
            user_id: USER_ID,
            model: model,
            prompt: section.querySelector('.prompt-input')?.value || (model === 'i2v' ? '.' : ''),
            image_urls: [],
            video_url: null,
            audio_url: null,
            lyrics: null,
            style_prompt: null
        };

        // Собираем файлы, если это пошаговый режим
        if (section.dataset.multistep === 'true') {
            const files = multiStepFiles[model] || {};
            requestBody.image_urls = files.photos || [];
            requestBody.video_url = files.videos ? files.videos[0] : null;
            requestBody.audio_url = files.audios ? files.audios[0] : null;
        } 
        // Если режим не пошаговый, но требует фото
        else if (['vip_edit', 'i2v'].includes(model)) {
            const photoData = await vkBridge.send('VKWebAppGetPhotos', { max_count: 1 });
            const largestPhoto = photoData.images.sort((a, b) => b.width - a.width)[0];
            requestBody.image_urls = [largestPhoto.url];
        }

        showOriginals(requestBody.image_urls.concat(requestBody.video_url || []));

        // --- ЕДИНЫЙ ЗАПРОС НА СЕРВЕР ---
        const endpoint = model === 'chat' ? `${BRAIN_API_URL}/chat` : `${BRAIN_API_URL}/generate`;
        const response = await fetch(endpoint, {
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

        // Сбрасываем файлы после успешной генерации
        if (multiStepFiles[model]) {
            multiStepFiles[model] = { photos: [], videos: [], audios: [] };
            updateMultiStepUI(section);
        }

    } catch (error) {
        handleError(error);
    } finally {
        hideLoader();
        button.disabled = false;
    }
}


// --- Обработчики добавления файлов (почти без изменений) ---
async function handleAddFileClick(event, fileType) {
    const section = event.target.closest('.mode-section');
    const mode = section.dataset.mode;
    const method = fileType === 'video' ? 'VKWebAppGetVideos' : 'VKWebAppGetPhotos';
    
    try {
        const fileData = await vkBridge.send(method, { max_count: 1 });
        const fileUrl = fileType === 'video' 
            ? fileData.videos[0].player 
            : fileData.images.sort((a, b) => b.width - a.width)[0].url;

        if (!multiStepFiles[mode]) multiStepFiles[mode] = { photos: [], videos: [], audios: [] };
        
        const fileStore = fileType === 'video' ? 'videos' : 'photos';
        multiStepFiles[mode][fileStore].push(fileUrl);
        
        updateMultiStepUI(section);
    } catch (error) {
        handleError(error);
    }
}

// ... (handleRecordAudioClick, handleMusicLyricsInput, handleMusicStyleClick остаются такими же, как у вас)
// ... (updateMultiStepUI остается таким же)


// --- Функции UI ---
function showLoader() {
    resultWrapper.classList.add('hidden');
    loader.classList.remove('hidden');
}

function hideLoader() {
    loader.classList.add('hidden');
}

function showOriginals(urls) {
    // ... (код этой функции остается без изменений)
}

function showResult(result) {
    resultWrapper.classList.remove('hidden');
    hideLoader();
    
    // --- НОВАЯ ЛОГИКА ОБРАБОТКИ ОТВЕТА ---
    const resultUrl = result.result_url; // Единое поле для URL
    const responseText = result.response; // Для чата

    const isVideo = resultUrl && ['.mp4', '.mov'].some(ext => resultUrl.includes(ext));
    const isImage = resultUrl && !isVideo;

    resultImage.src = isImage ? resultUrl : '';
    resultImage.classList.toggle('hidden', !isImage);

    resultVideo.src = isVideo ? resultUrl : '';
    resultVideo.classList.toggle('hidden', !isVideo);

    if (responseText) {
        alert("Ответ Нейро-помощника:\n\n" + responseText);
    }
    
    // Можно добавить всплывающее уведомление о списании кредитов
    if (result.cost !== undefined) {
        console.log(`Списано: ${result.cost}, новый баланс: ${result.new_balance}`);
        // Тут можно показать красивый toast-нотификейшн
    }
}

function handleError(error) {
    // ... (код этой функции остается без изменений)
}

// --- Привязка обработчиков ---
document.querySelectorAll('.process-button').forEach(b => b.addEventListener('click', handleProcessClick));
document.querySelectorAll('.add-photo-button').forEach(b => b.addEventListener('click', (e) => handleAddFileClick(e, 'photo')));
// ... (все остальные обработчики остаются)
