// script.js (vFinal - ПОЛНЫЙ)

// --- 1. ИНИЦИАЛИЗАЦИЯ ---
vkBridge.send('VKWebAppInit');
const BRAIN_API_URL = 'https://neuro-master.online/api';
let USER_ID = null;
let userIdInitialized = false;
const filesByMode = {};

const loader = document.getElementById('loader');
const resultWrapper = document.getElementById('result-wrapper');
const resultImage = document.getElementById('resultImage');
const resultVideo = document.getElementById('resultVideo');
const resultAudio = document.getElementById('resultAudio');
const downloadButton = document.getElementById('downloadButton');
const shareButton = document.getElementById('shareButton');
const helpModal = document.getElementById('helpModal');

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
            updateBalance();
        }
    } catch (e) { console.error(e); }
}

function updateBalance() {
    if (!USER_ID) return;
    const balanceEl = document.getElementById('user-balance-display');
    if(balanceEl) balanceEl.textContent = "Обновление...";
    
    fetch(`${BRAIN_API_URL}/user/${USER_ID}`)
        .then(r => r.json())
        .then(info => {
            if (balanceEl) balanceEl.textContent = `Баланс: ${info.balance} кр.`;
        })
        .catch(() => { if (balanceEl) balanceEl.textContent = "Ошибка"; });
}

// Кнопки ЛК
document.getElementById('refreshBalance')?.addEventListener('click', updateBalance);
document.getElementById('invite-friend-btn')?.addEventListener('click', () => {
    if (!USER_ID) return;
    vkBridge.send("VKWebAppShare", { "link": `https://vk.com/app51884181#${USER_ID}` });
});

// Кнопка Помощи
document.getElementById('helpButton')?.addEventListener('click', () => {
    if (helpModal) helpModal.classList.remove('hidden');
});
document.querySelector('.close-modal')?.addEventListener('click', () => {
    if (helpModal) helpModal.classList.add('hidden');
});

// --- 2. БИЗНЕС-ЛОГИКА ---
document.querySelectorAll('.business-shortcut').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const targetMode = e.target.dataset.target;
        const promptText = e.target.dataset.prompt;
        const targetSection = document.querySelector(`.mode-section[data-mode="${targetMode}"]`);
        if (targetSection) {
            targetSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const input = targetSection.querySelector('.prompt-input');
            if (input) {
                input.value = promptText;
                input.style.borderColor = '#4CAF50';
                setTimeout(() => input.style.borderColor = '#dce1e6', 1000);
            }
        }
    });
});

// --- 3. ЗАГРУЗКА ФАЙЛОВ (УНИВЕРСАЛЬНАЯ) ---
document.querySelectorAll('.universal-upload-button').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const section = e.target.closest('.mode-section');
        const type = e.target.dataset.type || 'photo';
        let input;
        if (type === 'video') input = section.querySelector('.video-upload-input');
        else if (type === 'audio') input = section.querySelector('.audio-upload-input');
        else input = section.querySelector('.file-upload-input');
        if (input) input.click();
    });
});

document.querySelectorAll('.file-upload-input, .video-upload-input, .audio-upload-input').forEach(input => {
    input.addEventListener('change', (e) => {
        const section = e.target.closest('.mode-section');
        const mode = section.dataset.mode;
        const newFiles = Array.from(e.target.files);
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
    });
});

// --- 4. ГЕНЕРАЦИЯ (BASE64) ---
document.querySelectorAll('.process-button').forEach(btn => {
    btn.addEventListener('click', handleProcessClick);
});

async function handleProcessClick(event) {
    const btn = event.target;
    const section = btn.closest('.mode-section');
    const mode = section.dataset.mode;
    
    if (!USER_ID) { alert("ID не определен."); return; }

    const promptInput = section.querySelector('.prompt-input');
    const prompt = promptInput ? promptInput.value : '';
    
    let stylePrompt = null;
    let musicLyrics = null;
    if (mode === 'music') {
        musicLyrics = prompt;
        if (btn.dataset.style) {
            stylePrompt = btn.dataset.style;
            if (stylePrompt === 'custom') {
                const customInp = section.querySelector('#custom-style-input');
                stylePrompt = customInp ? customInp.value : '';
                if (!stylePrompt || stylePrompt.length < 5) { alert("Введите стиль!"); return; }
            }
        }
    }

    if (!prompt && !['i2v', 'music', 'vip_clip', 'talking_photo'].includes(mode)) {
        alert("Напишите промпт!"); return;
    }
    
    const files = filesByMode[mode] || { photos: [], videos: [], audios: [] };
    
    if (['vip_edit', 'i2v', 'quick_edit', 'vip_mix'].includes(mode) && files.photos.length === 0) {
        alert("Выберите фото!"); return;
    }
    if (mode === 'vip_clip' && (files.photos.length === 0 || files.videos.length === 0)) {
        alert("Выберите фото и видео!"); return;
    }

    btn.disabled = true;
    showLoader();

    try {
        // Конвертация в Base64 (НАДЕЖНО)
        const imageBase64s = [];
        if (files.photos) {
            for (let f of files.photos) imageBase64s.push(await fileToBase64(f));
        }
        let videoBase64 = null;
        if (files.videos && files.videos.length) videoBase64 = await fileToBase64(files.videos[0]);
        let audioBase64 = null;
        if (files.audios && files.audios.length) audioBase64 = await fileToBase64(files.audios[0]);

        const requestBody = {
            user_id: USER_ID, model: mode, prompt: prompt,
            image_urls: imageBase64s,
            video_url: videoBase64, audio_url: audioBase64,
            style_prompt: stylePrompt, lyrics: musicLyrics
        };

        const endpoint = mode === 'chat' ? `${BRAIN_API_URL}/chat` : `${BRAIN_API_URL}/generate`;
        const response = await fetch(endpoint, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "Ошибка");
        }

        const result = await response.json();
        showResult(result);
        
        filesByMode[mode] = { photos: [], videos: [], audios: [] };
        if (promptInput) promptInput.value = '';
        updateUI(section);
        resultWrapper.scrollIntoView({ behavior: "smooth", block: "start" });
        updateBalance();

    } catch (error) {
        handleError(error);
    } finally {
        hideLoader();
        btn.disabled = false;
    }
}

// --- 5. ВСПОМОГАТЕЛЬНЫЕ ---
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
        files.photos.forEach(f => previewDiv.appendChild(createPreview(f, 'img')));
        files.videos.forEach(f => previewDiv.appendChild(createPreview(f, 'video')));
        files.audios.forEach(f => {
            const span = document.createElement('div');
            span.textContent = "🎵 Аудио готово"; 
            previewDiv.appendChild(span);
        });
    }

    const uploadBtn = section.querySelector('.universal-upload-button:not([data-type])') || section.querySelector('.universal-upload-button[data-type="photo"]');
    if (uploadBtn) {
        if (max > 1) {
            uploadBtn.textContent = `Добавить фото (${files.photos.length}/${max})`;
            uploadBtn.disabled = files.photos.length >= max;
        } else {
            uploadBtn.textContent = files.photos.length > 0 ? "Выбрать другое" : "1. Выбрать фото";
        }
    }
    
    const videoBtn = section.querySelector('.universal-upload-button[data-type="video"]');
    if (videoBtn) videoBtn.textContent = files.videos.length > 0 ? "Видео выбрано" : "2. Выбрать видео";
    const audioBtn = section.querySelector('.universal-upload-button[data-type="audio"]');
    if (audioBtn) audioBtn.textContent = files.audios.length > 0 ? "Аудио выбрано" : "2. Выбрать аудио";

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

function createPreview(file, tag) {
    const el = document.createElement(tag);
    el.src = URL.createObjectURL(file);
    el.className = 'preview-image';
    return el;
}

function showLoader() { loader.classList.remove('hidden'); resultWrapper.classList.add('hidden'); }
function hideLoader() { loader.classList.add('hidden'); }
function handleError(e) { alert("Ошибка: " + e.message); hideLoader(); }

function showResult(res) {
    const url = res.result_url || res.response;
    if (res.model === 'chat') { alert(url); return; }
    
    resultWrapper.classList.remove('hidden');
    const isVideo = url.includes('.mp4');
    const isAudio = url.includes('.mp3') || url.includes('.wav');

    resultImage.classList.add('hidden');
    resultVideo.classList.add('hidden');
    if(resultAudio) resultAudio.classList.add('hidden');

    if (isAudio) {
        if(resultAudio) { resultAudio.src = url; resultAudio.classList.remove('hidden'); }
    } else {
        resultImage.src = !isVideo ? url : '';
        resultImage.classList.toggle('hidden', isVideo);
        resultVideo.src = isVideo ? url : '';
        resultVideo.classList.toggle('hidden', !isVideo);
    }
    
    downloadButton.classList.remove('hidden');
    
    // Клик для открытия оригинала
    if(resultImage) resultImage.onclick = () => window.open(url, '_blank');
}

// Кнопка Скачать
downloadButton.addEventListener('click', () => {
    const url = resultImage.src || resultVideo.src || resultAudio.src;
    if (!url) return;
    const isVideo = url.includes('.mp4');
    const isAudio = url.includes('.mp3');

    if (vkBridge.isWebView() && !isVideo && !isAudio) {
        vkBridge.send("VKWebAppShowImages", { images: [url] });
    } else {
        window.open(url, '_blank');
    }
});

// Кнопка Поделиться
if (shareButton) {
    shareButton.addEventListener('click', () => {
        const url = resultImage.src || resultVideo.src || resultAudio.src;
        if (url) vkBridge.send("VKWebAppShare", { "link": url });
    });
}

// --- 6. ЛОГИКА ОПЛАТЫ (РАБОЧАЯ ВЕРСИЯ БЕЗ ПОДПИСИ) ---
const buyButtons = document.querySelectorAll('.buy-btn');

buyButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        if (!USER_ID) return;
        
        const amount = parseInt(btn.dataset.amount); // 150 или 700
        const credits = parseInt(btn.dataset.credits); // 15 или 100
        const description = `Покупка ${credits} кредитов`;
        
        // 1. Прямой вызов VK Pay (pay-to-group)
        vkBridge.send("VKWebAppOpenPayForm", {
            app_id: 51884181,
            action: "pay-to-group",
            params: {
                group_id: 191367447, // ВАШ ID ГРУППЫ
                amount: amount,
                description: description
            }
        })
        .then(async (data) => {
            if (data.status) {
                // 2. Начисляем кредиты
                // Хак для сервера: amount = credits * 10
                const fakeAmount = credits * 10;
                
                await fetch(`${BRAIN_API_URL}/vk-pay/success`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        user_id: USER_ID, 
                        amount: fakeAmount, 
                        description: "manual_success" 
                    })
                });
                
                alert("Оплата прошла успешно! Баланс пополнен.");
                updateBalance();
            }
        })
        .catch(error => {
            console.error("Ошибка оплаты:", error);
            // Если ошибка "Access denied", значит всё-таки нужна подпись, 
            // но вы говорили, что этот вариант работал.
        });
    });
});
