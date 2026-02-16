// script.js (vFinal-UX - Идеальный интерфейс)

// --- Инициализация ---
vkBridge.send('VKWebAppInit');
const BRAIN_API_URL = 'https://neuro-master.online/api';
let USER_ID = null;
let userIdInitialized = false;
const filesByMode = {};

const loader = document.getElementById('loader');
const resultWrapper = document.getElementById('result-wrapper');
const resultImage = document.getElementById('resultImage');
const resultVideo = document.getElementById('resultVideo');
const downloadButton = document.getElementById('downloadButton');

// Получение ID
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

// --- ОБРАБОТЧИКИ ---

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

document.addEventListener('change', (e) => {
    if (e.target.matches('.file-upload-input, .video-upload-input, .audio-upload-input')) {
        const input = e.target;
        const section = input.closest('.mode-section');
        if (!section) return;

        const mode = section.dataset.mode;
        const newFiles = Array.from(input.files);
        if (!newFiles.length) return;

        let typeKey = 'photos';
        if (input.classList.contains('video-upload-input')) typeKey = 'videos';
        if (input.classList.contains('audio-upload-input')) typeKey = 'audios';

        if (!filesByMode[mode]) filesByMode[mode] = { photos: [], videos: [], audios: [] };
        
        const max = parseInt(section.dataset.maxPhotos) || 1;

        if (typeKey === 'photos') {
            if (max === 1) filesByMode[mode].photos = [newFiles[0]];
            else {
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

    // --- ВАЛИДАЦИЯ (ВЕРНУЛАСЬ!) ---
    // 1. Проверка промпта (кроме режимов, где он не нужен)
    if (!prompt && !['i2v', 'music', 'vip_clip', 'talking_photo'].includes(mode)) { 
        alert("Напишите промпт!"); return; 
    }
    
    // 2. Проверка фото (для фото-режимов)
    if (['vip_edit', 'i2v', 'quick_edit', 'vip_mix'].includes(mode) && files.photos.length === 0) {
        alert("Выберите фото!"); return;
    }
    
    // 3. Проверка видео (для vip_clip)
    if (mode === 'vip_clip' && (files.photos.length === 0 || files.videos.length === 0)) {
        alert("Выберите и фото, и видео!"); return;
    }
    
    // 4. Проверка аудио (для talking_photo)
    if (mode === 'talking_photo' && (files.photos.length === 0 || files.audios.length === 0)) {
        alert("Выберите фото и аудио!"); return;
    }
    // ------------------------------

    btn.disabled = true;
    showLoader();

    try {
        // 1. Конвертируем ФОТО
        const imageBase64s = [];
        if (files.photos) {
            for (let file of files.photos) imageBase64s.push(await fileToBase64(file));
        }

        // 2. Конвертируем ВИДЕО
        let videoBase64 = null;
        if (files.videos && files.videos.length > 0) {
            videoBase64 = await fileToBase64(files.videos[0]);
        }

        // 3. Конвертируем АУДИО
        let audioBase64 = null;
        if (files.audios && files.audios.length > 0) {
            audioBase64 = await fileToBase64(files.audios[0]);
        }

        const requestBody = {
            user_id: USER_ID, model: mode, prompt: prompt,
            image_urls: imageBase64s,
            video_url: videoBase64, 
            audio_url: audioBase64,
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
    
    const previewDiv = section.querySelector('.image-previews');
    if (previewDiv) {
        previewDiv.innerHTML = '';
        files.photos.forEach(f => {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(f);
            img.className = 'preview-image';
            previewDiv.appendChild(img);
        });
        files.videos.forEach(f => {
            const vid = document.createElement('video');
            vid.src = URL.createObjectURL(f);
            vid.className = 'preview-image';
            vid.muted = true; 
            previewDiv.appendChild(vid);
        });
        if (files.audios.length > 0) {
            const span = document.createElement('div');
            span.textContent = "🎵 Аудио загружено";
            span.style.marginTop = "5px";
            previewDiv.appendChild(span);
        }
    }

    const uploadBtn = section.querySelector('.universal-upload-button:not([data-type])') || section.querySelector('.universal-upload-button[data-type="photo"]');
    if (uploadBtn) {
        if (max > 1) {
            uploadBtn.textContent = `Добавить фото (${files.photos.length}/${max})`;
            uploadBtn.disabled = files.photos.length >= max;
        } else {
            uploadBtn.textContent = files.photos.length > 0 ? "Выбрать другое фото" : "1. Выбрать фото";
        }
    }
    
    const videoBtn = section.querySelector('.universal-upload-button[data-type="video"]');
    if (videoBtn) videoBtn.textContent = files.videos.length > 0 ? "Видео выбрано" : "2. Выбрать видео";

    const processBtn = section.querySelector('.process-button');
    if (processBtn) {
        let ready = false;
        if (mode === 't2i' || mode === 't2v' || mode === 'chat' || mode === 'music') ready = true;
        else if (mode === 'vip_clip' && files.photos.length > 0 && files.videos.length > 0) ready = true;
        else if (mode === 'talking_photo' && files.photos.length > 0 && files.audios.length > 0) ready = true;
        else if (files.photos.length > 0) ready = true;
        
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
    
    // МЫ УБРАЛИ ОБРАБОТЧИК КЛИКА ПО КАРТИНКЕ, ОН БОЛЬШЕ НЕ НУЖЕН
}

// КЛИК ПО КНОПКЕ "СКАЧАТЬ"
downloadButton.addEventListener('click', () => {
    const url = resultImage.src || resultVideo.src;
    if (!url) return;

    const isVideo = url.includes('.mp4');

    if (vkBridge.isWebView() && !isVideo) { 
        // На телефоне фото открываем в нативном просмотрщике
        vkBridge.send("VKWebAppShowImages", { images: [url] });
    } else {
        // Видео или компьютер - открываем в новой вкладке
        window.open(url, '_blank');
    }
});
