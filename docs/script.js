// script.js (v20 - ПОЛНЫЙ, БЕЗ ЗАГЛУШЕК, С ИСПРАВЛЕНИЯМИ)

// --- 1. ИНИЦИАЛИЗАЦИЯ ---
vkBridge.send('VKWebAppInit');
const BRAIN_API_URL = 'https://neuro-master.online/api';
let USER_ID = null;
let userIdInitialized = false;
const filesByMode = {}; // Хранилище файлов: { "vip_edit": [File, File], ... }

// Поиск основных элементов
const loader = document.getElementById('loader');
const resultWrapper = document.getElementById('result-wrapper');
const resultImage = document.getElementById('resultImage');
const resultVideo = document.getElementById('resultVideo');
const downloadButton = document.getElementById('downloadButton');

// Надежное получение ID пользователя
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

// --- 2. ОБРАБОТЧИКИ СОБЫТИЙ ---

// Кнопка "Выбрать фото" -> открывает скрытый input
document.querySelectorAll('.universal-upload-button').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const section = e.target.closest('.mode-section');
        const input = section.querySelector('.file-upload-input');
        if (input) input.click();
    });
});

// Выбор файла в input -> сохраняем файл и обновляем интерфейс
document.querySelectorAll('.file-upload-input').forEach(input => {
    input.addEventListener('change', (e) => {
        const section = e.target.closest('.mode-section');
        const mode = section.dataset.mode;
        const maxPhotos = parseInt(section.dataset.maxPhotos) || 1;
        const newFiles = Array.from(e.target.files);

        if (newFiles.length === 0) return;

        if (!filesByMode[mode]) filesByMode[mode] = [];

        // Если можно только 1 фото, заменяем. Если много - добавляем.
        if (maxPhotos === 1) {
            filesByMode[mode] = [newFiles[0]];
        } else {
            // Добавляем, но не больше максимума
            for (let f of newFiles) {
                if (filesByMode[mode].length < maxPhotos) {
                    filesByMode[mode].push(f);
                }
            }
        }
        
        updateUI(section);
        // Сбрасываем input, чтобы можно было выбрать тот же файл снова
        input.value = ''; 
    });
});

// Кнопка "Запустить/Нарисовать" -> Главная логика
document.querySelectorAll('.process-button').forEach(btn => {
    btn.addEventListener('click', handleProcessClick);
});

// Клик по результату -> Открыть оригинал
resultImage.addEventListener('click', () => {
    if (resultImage.src) window.open(resultImage.src, '_blank');
});
resultVideo.addEventListener('click', () => {
    if (resultVideo.src) window.open(resultVideo.src, '_blank');
});

// Кнопка "Скачать" -> Правильное скачивание
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


// --- 3. ГЛАВНАЯ ЛОГИКА (Загрузка + Генерация) ---

async function handleProcessClick(event) {
    const btn = event.target;
    const section = btn.closest('.mode-section');
    const mode = section.dataset.mode;
    
    if (!USER_ID) { alert("ID не определен. Перезапустите приложение."); return; }

    const promptInput = section.querySelector('.prompt-input');
    const prompt = promptInput ? promptInput.value : '';
    
    // Для музыки стиль берется из кнопки
    const stylePrompt = mode === 'music' ? btn.dataset.style : null;

    // Проверка промпта (кроме i2v, где он может быть пустым)
    if (!prompt && mode !== 'i2v' && mode !== 'music') {
        alert("Пожалуйста, напишите промпт!");
        return;
    }

    // Проверка файлов
    const files = filesByMode[mode] || [];
    if (section.querySelector('.file-upload-input') && files.length === 0) {
        alert("Пожалуйста, выберите фото!");
        return;
    }

    // --- НАЧАЛО ПРОЦЕССА ---
    btn.disabled = true;
    showLoader();

    try {
        // Шаг 1: Загружаем файлы на сервер VK (если есть)
        const uploadedUrls = [];
        for (let file of files) {
            const url = await uploadToVK(file);
            uploadedUrls.push(url);
        }

        // Шаг 2: Готовим запрос
        const requestBody = {
            user_id: USER_ID,
            model: mode,
            prompt: prompt,
            image_urls: uploadedImageUrls,
            style_prompt: stylePrompt,
            lyrics: prompt // Для музыки текст в поле prompt
        };

        // Шаг 3: Отправляем на "Мозг"
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

        // Шаг 4: Успех!
        showResult(result);
        
        // Очистка
        filesByMode[mode] = [];
        if (promptInput) promptInput.value = '';
        updateUI(section);
        
        // Скролл к результату
        resultWrapper.scrollIntoView({ behavior: "smooth" });

    } catch (error) {
        console.error(error);
        alert("Ошибка: " + error.message);
    } finally {
        hideLoader();
        btn.disabled = false;
    }
}

// --- 4. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

async function uploadToVK(file) {
    // Получаем адрес для загрузки
    const uploadServer = await vkBridge.send('VKWebAppGetAppUploadServer', { app_id: 51884181 });
    
    // Загружаем файл
    const formData = new FormData();
    formData.append('photo', file);
    const postResponse = await fetch(uploadServer.upload_url, { method: 'POST', body: formData });
    const postResult = await postResponse.json();
    
    // Сохраняем в VK
    const saved = await vkBridge.send('VKWebAppSaveAppPhoto', {
        photo: postResult.photo, server: postResult.server, hash: postResult.hash
    });
    
    // Возвращаем URL самого большого фото
    return saved.images.sort((a,b) => b.width - a.width)[0].url;
}

function updateUI(section) {
    const mode = section.dataset.mode;
    const files = filesByMode[mode] || [];
    const max = parseInt(section.dataset.maxPhotos) || 1;
    
    // Обновляем превью
    const previewDiv = section.querySelector('.image-previews');
    if (previewDiv) {
        previewDiv.innerHTML = '';
        files.forEach(f => {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(f);
            img.className = 'preview-image';
            previewDiv.appendChild(img);
        });
    }

    // Обновляем текст кнопки загрузки
    const uploadBtn = section.querySelector('.universal-upload-button');
    if (uploadBtn) {
        if (max > 1) {
            uploadBtn.textContent = `Добавить фото (${files.length}/${max})`;
        } else {
            uploadBtn.textContent = files.length > 0 ? "Выбрать другое фото" : "1. Выбрать фото";
        }
    }

    // Показываем/скрываем кнопку запуска
    const processBtn = section.querySelector('.process-button');
    if (processBtn) {
        // Если файлы нужны, но их нет -> скрыть кнопку
        if (section.querySelector('.file-upload-input') && files.length === 0) {
            processBtn.classList.add('hidden');
        } else {
            processBtn.classList.remove('hidden');
        }
    }
}

function showLoader() {
    loader.classList.remove('hidden');
    resultWrapper.classList.add('hidden');
}

function hideLoader() {
    loader.classList.add('hidden');
}

function showResult(result) {
    const url = result.result_url || result.response; // Для чата ответ в .response
    
    if (result.model === 'chat' || !url.startsWith('http')) {
        alert(url); // Просто текст для чата
        return;
    }

    resultWrapper.classList.remove('hidden');
    
    const isVideo = url.includes('.mp4') || url.includes('.mov');
    const isAudio = url.includes('.mp3');

    if (isAudio) {
        alert("Аудио готово! " + url);
        // Можно добавить аудиоплеер, но пока так
    } else {
        resultImage.src = !isVideo ? url : '';
        resultImage.classList.toggle('hidden', isVideo);
        
        resultVideo.src = isVideo ? url : '';
        resultVideo.classList.toggle('hidden', !isVideo);
        
        downloadButton.classList.remove('hidden');
    }
}
