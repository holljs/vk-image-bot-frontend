// script.js (vFinal-Polished)

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

// --- ОБРАБОТЧИКИ СОБЫТИЙ ---

// 1. Клик по кнопке "Выбрать..."
document.addEventListener('click', (e) => {
    if (e.target.matches('.universal-upload-button')) {
        const section = e.target.closest('.mode-section');
        const type = e.target.dataset.type || 'photo';
        let selector = '.file-upload-input';
        if (type === 'video') selector = '.video-upload-input';
        if (type === 'audio') selector = '.audio-upload-input';
        
        const input = section.querySelector(selector);
        if (input) input.click();
    }
    
    if (e.target.matches('.process-button')) {
        handleProcessClick(e);
    }
});

// 2. Выбор файла (input change)
document.addEventListener('change', (e) => {
    if (e.target.matches('.file-upload-input, .video-upload-input, .audio-upload-input')) {
        const input = e.target;
        const section = input.closest('.mode-section');
        if (!section) return; // Защита от undefined

        const mode = section.dataset.mode;
        const newFiles = Array.from(input.files);
        
        if (!newFiles.length) return;

        // Тип хранилища
        let typeKey = 'photos';
        if (input.classList.contains('video-upload-input')) typeKey = 'videos';
        if (input.classList.contains('audio-upload-input')) typeKey = 'audios';

        if (!filesByMode[mode]) filesByMode[mode] = { photos: [], videos: [], audios: [] };
        
        const max = parseInt(section.dataset.maxPhotos) || 1;

        if (typeKey === 'photos') {
            if (max === 1) filesByMode[mode].photos = [newFiles[0]];
            else {
                // Добавляем, пока не достигнем лимита
                for (let f of newFiles) {
                    if (filesByMode[mode].photos.length < max) filesByMode[mode].photos.push(f);
                }
            }
        } else {
            filesByMode[mode][typeKey] = [newFiles[0]];
        }
        
        updateUI(section);
        input.value = '';
    }
});

// --- ГЛАВНАЯ ЛОГИКА ---

async function handleProcessClick(e) {
    const btn = e.target;
    const section = btn.closest('.mode-section');
    const mode = section.dataset.mode;
    
    if (!USER_ID) { alert("ID не определен. Перезапустите."); return; }

    const promptInput = section.querySelector('.prompt-input');
    const prompt = promptInput ? promptInput.value : '';
    const files = filesByMode[mode] || { photos: [], videos: [], audios: [] };

    // Валидация
    if (!prompt && mode !== 'i2v' && mode !== 'music') { alert("Напишите промпт!"); return; }
    
    // Проверка фото (для режимов где это обязательно)
    if (['vip_edit', 'i2v', 'quick_edit', 'vip_mix'].includes(mode) && files.photos.length === 0) {
        alert("Выберите фото!"); return;
    }

    btn.disabled = true;
    showLoader();

    try {
        // Конвертация в Base64
        const imageBase64s = [];
        if (files.photos) {
            for (let file of files.photos) {
                const b64 = await fileToBase64(file);
                imageBase64s.push(b64);
            }
        }

        const requestBody = {
            user_id: USER_ID, model: mode, prompt: prompt,
            image_urls: imageBase64s,
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
        
        // Успех: очистка
        filesByMode[mode] = { photos: [], videos: [], audios: [] };
        if (promptInput) promptInput.value = '';
        updateUI(section);
        resultWrapper.scrollIntoView({ behavior: "smooth" });

    } catch (error) {
        handleError(error);
    } finally {
        hideLoader();
        btn.disabled = false;
    }
}

// --- ВСПОМОГАТЕЛЬНЫЕ ---

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

    // Текст кнопки и счетчик
    const uploadBtn = section.querySelector('.universal-upload-button');
    if (uploadBtn) {
        if (max > 1) {
            uploadBtn.textContent = `Добавить фото (${files.photos.length}/${max})`;
            uploadBtn.disabled = files.photos.length >= max;
        } else {
            uploadBtn.textContent = files.photos.length > 0 ? "Выбрать другое" : "1. Выбрать фото";
        }
    }

    // Показ кнопки запуска
    const processBtn = section.querySelector('.process-button');
    if (processBtn) {
        let ready = false;
        // Если это чисто текстовый режим
        if (mode === 't2i' || mode === 't2v' || mode === 'chat' || mode === 'music') {
            ready = true;
        } 
        // Если это фото-режим
        else if (files.photos.length > 0) {
            ready = true;
        }
        
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
}

// --- НОВАЯ ЛОГИКА СКАЧИВАНИЯ ---
downloadButton.addEventListener('click', () => {
    const url = resultImage.src || resultVideo.src;
    if (!url) return;

    const isVideo = url.includes('.mp4');

    if (!isVideo) {
        // ДЛЯ ФОТО: Используем нативный просмотрщик VK
        // Это самый надежный способ сохранить фото на телефоне
        vkBridge.send("VKWebAppShowImages", { 
            images: [url] 
        }).catch(e => {
            // Если вдруг не сработало (например, на компе) - открываем в новой вкладке
            window.open(url, '_blank');
        });
    } else {
        // ДЛЯ ВИДЕО: Открываем в новой вкладке (браузер сам предложит сохранить)
        window.open(url, '_blank');
    }
});
