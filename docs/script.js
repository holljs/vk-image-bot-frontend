// script.js (vFinal-Base64)

// --- Инициализация ---
vkBridge.send('VKWebAppInit');
const BRAIN_API_URL = 'https://neuro-master.online/api';
let USER_ID = null;
let userIdInitialized = false;
const filesByMode = {};

// Элементы UI
const loader = document.getElementById('loader');
const resultWrapper = document.getElementById('result-wrapper');
const resultImage = document.getElementById('resultImage');
const resultVideo = document.getElementById('resultVideo');
const downloadButton = document.getElementById('downloadButton');

// Получение ID (самое надежное)
vkBridge.subscribe(e => {
    if (e.detail?.type === 'VKWebAppUpdateConfig' && !userIdInitialized) initUser();
});
setTimeout(() => { if (!userIdInitialized) initUser(); }, 2000);

async function initUser() {
    try {
        const data = await vkBridge.send('VKWebAppGetUserInfo');
        if (data.id) {
            USER_ID = data.id;
            userIdInitialized = true;
            fetch(`${BRAIN_API_URL}/user/${USER_ID}`).catch(console.error);
        }
    } catch (e) { console.error(e); }
}

// --- УНИВЕРСАЛЬНЫЕ ОБРАБОТЧИКИ (без привязки к конкретным ID) ---

// 1. Клик по любой кнопке "Выбрать..."
document.addEventListener('click', (e) => {
    if (e.target.matches('.universal-upload-button')) {
        const section = e.target.closest('.mode-section');
        // Находим нужный input внутри этой же секции
        const type = e.target.dataset.type || 'photo';
        let selector = '.file-upload-input';
        if (type === 'video') selector = '.video-upload-input';
        if (type === 'audio') selector = '.audio-upload-input';
        
        const input = section.querySelector(selector);
        if (input) input.click();
    }
});

// 2. Выбор файла в любом input
document.addEventListener('change', (e) => {
    if (e.target.matches('.file-upload-input, .video-upload-input, .audio-upload-input')) {
        const input = e.target;
        const section = input.closest('.mode-section');
        const mode = section.dataset.mode;
        const files = Array.from(input.files);
        
        if (!files.length) return;

        // Определяем тип хранилища
        let storeType = 'photos';
        if (input.classList.contains('video-upload-input')) storeType = 'videos';
        if (input.classList.contains('audio-upload-input')) storeType = 'audios';

        if (!filesByMode[mode]) filesByMode[mode] = { photos: [], videos: [], audios: [] };
        
        const max = parseInt(section.dataset.maxPhotos) || 1;

        // Логика добавления
        if (storeType === 'photos') {
            if (max === 1) filesByMode[mode].photos = [files[0]];
            else {
                for (let f of files) {
                    if (filesByMode[mode].photos.length < max) filesByMode[mode].photos.push(f);
                }
            }
        } else {
            filesByMode[mode][storeType] = [files[0]];
        }
        
        updateUI(section);
        input.value = ''; // Сброс
    }
});

// 3. Клик по кнопке "Запустить/Нарисовать"
document.addEventListener('click', (e) => {
    if (e.target.matches('.process-button')) {
        handleProcessClick(e);
    }
});


// --- ГЛАВНАЯ ЛОГИКА ---

async function handleProcessClick(e) {
    const btn = e.target;
    const section = btn.closest('.mode-section');
    const mode = section.dataset.mode;
    
    if (!USER_ID) { alert("ID не определен. Перезапустите."); return; }

    const prompt = section.querySelector('.prompt-input')?.value || (mode === 'i2v' ? '.' : '');
    const files = filesByMode[mode] || { photos: [], videos: [], audios: [] };

    // Валидация
    if (!prompt && mode !== 'i2v' && mode !== 'music') { alert("Напишите промпт!"); return; }
    
    // Проверка наличия файлов
    if (['vip_edit', 'i2v', 'quick_edit', 'vip_mix'].includes(mode) && files.photos.length === 0) {
        alert("Выберите фото!"); return;
    }

    btn.disabled = true;
    showLoader();

    try {
        // ШАГ 1: Конвертируем файлы в Base64 (текст)
        const imageBase64s = [];
        for (let file of files.photos) {
            const b64 = await fileToBase64(file);
            imageBase64s.push(b64);
        }

        // ШАГ 2: Отправляем на "Мозг"
        const requestBody = {
            user_id: USER_ID, model: mode, prompt: prompt,
            image_urls: imageBase64s, // Передаем картинку как текст!
            // Для видео пока null, сложная логика
            video_url: null, audio_url: null,
            style_prompt: mode === 'music' ? btn.dataset.style : null,
            lyrics: mode === 'music' ? prompt : null
        };

        const endpoint = mode === 'chat' ? `${BRAIN_API_URL}/chat` : `${BRAIN_API_URL}/generate`;
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "Ошибка сервера");
        }

        const result = await response.json();
        showResult(result);
        
        // Очистка
        filesByMode[mode] = { photos: [], videos: [], audios: [] };
        if (section.querySelector('.prompt-input')) section.querySelector('.prompt-input').value = '';
        updateUI(section);
        resultWrapper.scrollIntoView({ behavior: "smooth" });

    } catch (error) {
        handleError(error);
    } finally {
        hideLoader();
        btn.disabled = false;
    }
}

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

function updateUI(section) {
    const mode = section.dataset.mode;
    const files = filesByMode[mode] || { photos: [], videos: [], audios: [] };
    const max = parseInt(section.dataset.maxPhotos) || 1;
    
    // Превью
    const previewDiv = section.querySelector('.image-previews');
    if (previewDiv) {
        previewDiv.innerHTML = '';
        files.photos.forEach(f => {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(f);
            img.className = 'preview-image';
            previewDiv.appendChild(img);
        });
    }

    // Текст кнопки
    const uploadBtn = section.querySelector('.universal-upload-button');
    if (uploadBtn) {
        if (max > 1) uploadBtn.textContent = `Добавить фото (${files.photos.length}/${max})`;
        else uploadBtn.textContent = files.photos.length > 0 ? "Выбрать другое" : "1. Выбрать фото";
    }

    // Показ кнопки "Запустить"
    const processBtn = section.querySelector('.process-button');
    if (processBtn) {
        let ready = true;
        if (section.querySelector('.file-upload-input') && files.photos.length === 0) ready = false;
        if (ready) processBtn.classList.remove('hidden');
        else processBtn.classList.add('hidden');
    }
}

function showLoader() { loader.classList.remove('hidden'); resultWrapper.classList.add('hidden'); }
function hideLoader() { loader.classList.add('hidden'); }
function handleError(e) { alert("Ошибка: " + e.message); hideLoader(); }

function showResult(res) {
    const url = res.result_url || res.response;
    if (res.model === 'chat') { alert(url); return; }
    
    resultWrapper.classList.remove('hidden');
    const isVideo = url.includes('.mp4');
    resultImage.src = !isVideo ? url : '';
    resultImage.classList.toggle('hidden', isVideo);
    resultVideo.src = isVideo ? url : '';
    resultVideo.classList.toggle('hidden', !isVideo);
    downloadButton.classList.remove('hidden');
    
    if(resultImage) resultImage.onclick = () => window.open(url, '_blank');
}

// Клик по "Скачать"
if (downloadButton) {
    downloadButton.addEventListener('click', async () => {
        const url = resultImage.src || resultVideo.src;
        if(!url) return;
        try {
            const blob = await (await fetch(url)).blob();
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'result';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch(e) { window.open(url, '_blank'); }
    });
}
