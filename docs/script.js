const BRAIN_API_URL = 'https://neuro-master.online/api';
let USER_ID = null;
const filesByMode = {};

// ИНИЦИАЛИЗАЦИЯ
vkBridge.send('VKWebAppInit');

function hidePaymentsOnMobile() {
    const urlParams = new URLSearchParams(window.location.search);
    const platform = urlParams.get('vk_platform');
    const isNativeApp = platform === 'mobile_android' || platform === 'mobile_iphone' || platform === 'mobile_ipad';
    if (isNativeApp) {
        document.querySelectorAll('.buy-btn').forEach(btn => btn.style.display = 'none');
    }
}
hidePaymentsOnMobile();

async function initUser() {
    try {
        const data = await vkBridge.send('VKWebAppGetUserInfo');
        if (data.id) { USER_ID = data.id; updateBalance(); }
    } catch (e) { console.error(e); }
}
initUser();

function getAuthHeader() { return window.location.search.slice(1); }

function updateBalance() {
    if (!USER_ID) return;
    const balanceEl = document.getElementById('user-balance-display');
    fetch(`${BRAIN_API_URL}/user/${USER_ID}`, { headers: { 'X-VK-Sign': getAuthHeader() } })
        .then(r => r.json())
        .then(info => { if (balanceEl) balanceEl.textContent = `Баланс: ${info.balance} кр.`; })
        .catch(() => { if (balanceEl) balanceEl.textContent = "Ошибка"; });
}

// КАСТОМНЫЕ ОКНА
function showCustomAlert(message, title = "Уведомление") {
    const modal = document.getElementById('customAlertModal');
    document.getElementById('customAlertTitle').textContent = title;
    document.getElementById('customAlertMessage').textContent = message;
    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
}

document.getElementById('closeCustomAlert')?.addEventListener('click', () => {
    document.getElementById('customAlertModal').classList.add('hidden');
    document.body.classList.remove('modal-open');
});

function showLoader() { document.getElementById('loader').classList.remove('hidden'); document.body.classList.add('modal-open'); }
function hideLoader() { document.getElementById('loader').classList.add('hidden'); document.body.classList.remove('modal-open'); }

// БАГ №5, №6: ПРАВИЛЬНОЕ ПРИГЛАШЕНИЕ
document.getElementById('invite-friend-btn')?.addEventListener('click', () => {
    if (!USER_ID) return;
    vkBridge.send("VKWebAppShare", { 
        "link": `https://vk.com/app51884181#${USER_ID}` 
    }).catch(err => console.error(err));
});

// ПОМОЩЬ
document.getElementById('helpButton')?.addEventListener('click', () => {
    document.getElementById('helpModal').classList.remove('hidden');
    document.body.classList.add('modal-open');
});
document.querySelectorAll('.close-modal').forEach(b => b.onclick = () => {
    document.getElementById('helpModal').classList.add('hidden');
    document.body.classList.remove('modal-open');
});

// ФАЙЛЫ
const fileToBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = e => reject(e);
});

document.querySelectorAll('.universal-upload-button').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const section = e.target.closest('.mode-section');
        const type = e.target.dataset.type || 'photo';
        const input = section.querySelector(type === 'video' ? '.video-upload-input' : (type === 'audio' ? '.audio-upload-input' : '.file-upload-input'));
        if (input) input.click();
    });
});

document.querySelectorAll('input[type="file"]').forEach(input => {
    input.addEventListener('change', async (e) => {
        const section = e.target.closest('.mode-section');
        const mode = section.dataset.mode;
        const files = Array.from(e.target.files);
        const typeKey = input.classList.contains('video-upload-input') ? 'videos' : (input.classList.contains('audio-upload-input') ? 'audios' : 'photos');
        
        if (!filesByMode[mode]) filesByMode[mode] = { photos: [], videos: [], audios: [] };
        
        const accept = input.getAttribute('accept');
        for (let file of files) {
            if (accept && !file.type.startsWith(accept.split('/')[0])) {
                showCustomAlert("Неверный формат файла", "Ошибка"); continue;
            }
            const max = parseInt(section.dataset.maxPhotos) || 1;
            if (filesByMode[mode][typeKey].length < max) {
                filesByMode[mode][typeKey].push(file);
            }
        }
        updateUI(section);
        input.value = '';
    });
});

// БАГ №15: УДАЛЕНИЕ ФОТО
function removeFile(mode, type, index) {
    filesByMode[mode][type].splice(index, 1);
    updateUI(document.querySelector(`.mode-section[data-mode="${mode}"]`));
}

function updateUI(section) {
    const mode = section.dataset.mode;
    const files = filesByMode[mode] || { photos: [], videos: [], audios: [] };
    const previewDiv = section.querySelector('.image-previews');
    
    if (previewDiv) {
        previewDiv.innerHTML = '';
        ['photos', 'videos', 'audios'].forEach(type => {
            files[type].forEach((f, i) => {
                const container = document.createElement('div');
                container.className = 'preview-container';
                if (type === 'photos' || type === 'videos') {
                    const el = document.createElement(type === 'photos' ? 'img' : 'video');
                    el.src = URL.createObjectURL(f);
                    el.className = 'preview-image';
                    container.appendChild(el);
                } else {
                    const span = document.createElement('div'); span.textContent = "🎵 Аудио"; container.appendChild(span);
                }
                const del = document.createElement('div');
                del.className = 'remove-btn'; del.innerHTML = '×';
                del.onclick = () => removeFile(mode, type, i);
                container.appendChild(del);
                previewDiv.appendChild(container);
            });
        });
    }

    const uploadBtn = section.querySelector('.universal-upload-button:not([data-type])') || section.querySelector('.universal-upload-button[data-type="photo"]');
    if (uploadBtn) {
        const max = parseInt(section.dataset.maxPhotos) || 1;
        uploadBtn.textContent = files.photos.length > 0 ? `1. Выбрать другое (${files.photos.length}/${max})` : `1. Выбрать фото`;
    }
    
    const processBtn = section.querySelector('.process-button');
    if (processBtn) {
        let ready = ['t2i', 't2v', 'chat', 'music'].includes(mode) || files.photos.length > 0;
        processBtn.classList.toggle('hidden', !ready);
    }
}

// ГЕНЕРАЦИЯ
async function pollTaskStatus(taskId) {
    const interval = setInterval(async () => {
        try {
            const r = await fetch(`${BRAIN_API_URL}/task_status/${taskId}?user_id=${USER_ID}`, { headers: { 'X-VK-Sign': getAuthHeader() } });
            const data = await r.json();
            if (data.success && data.result_url) {
                clearInterval(interval); hideLoader(); showResult(data); updateBalance();
            } else if (data.success === false) {
                clearInterval(interval); hideLoader(); showCustomAlert(data.error);
            }
        } catch (e) { clearInterval(interval); hideLoader(); }
    }, 3500);
}

function showResult(res) {
    const wrapper = document.getElementById('result-wrapper');
    wrapper.classList.remove('hidden');
    const url = res.result_url;
    const isVideo = url.includes('.mp4');
    const isAudio = url.includes('.mp3');
    
    document.getElementById('resultImage').classList.toggle('hidden', isVideo || isAudio);
    document.getElementById('resultVideo').classList.toggle('hidden', !isVideo);
    document.getElementById('resultAudio').classList.toggle('hidden', !isAudio);
    
    if (isVideo) document.getElementById('resultVideo').src = url;
    else if (isAudio) document.getElementById('resultAudio').src = url;
    else document.getElementById('resultImage').src = url;
    
    wrapper.scrollIntoView({ behavior: 'smooth' });
}

document.querySelectorAll('.process-button').forEach(btn => {
    btn.onclick = async (e) => {
        const section = e.target.closest('.mode-section');
        const mode = section.dataset.mode;
        const prompt = section.querySelector('.prompt-input')?.value.trim() || '';
        
        // БАГ №17: Валидация музыки
        if (mode === 'music' && prompt.length < 10) {
            return showCustomAlert("Текст песни должен быть не менее 10 символов");
        }
        if (!prompt && !['talking_photo', 'vip_clip'].includes(mode)) return showCustomAlert("Введите описание");

        const files = filesByMode[mode] || { photos: [], videos: [], audios: [] };
        showLoader();
        
        try {
            const body = { user_id: USER_ID, model: mode, prompt: prompt, image_urls: [] };
            if (files.photos.length) for (let f of files.photos) body.image_urls.push(await fileToBase64(f));
            if (files.videos.length) body.video_url = await fileToBase64(files.videos[0]);
            if (files.audios.length) body.audio_url = await fileToBase64(files.audios[0]);
            
            if (mode === 'music') { body.lyrics = prompt; body.style_prompt = e.target.dataset.style === 'custom' ? document.getElementById('custom-style-input').value : e.target.dataset.style; }

            const endpoint = mode === 'chat' ? 'chat' : 'generate';
            const r = await fetch(`${BRAIN_API_URL}/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-VK-Sign': getAuthHeader() },
                body: JSON.stringify(body)
            });
            const res = await r.json();
            if (r.ok) {
                if (mode === 'chat') { hideLoader(); showCustomAlert(res.response, "Ответ"); }
                else pollTaskStatus(res.task_id);
            } else throw new Error(res.detail);
        } catch (err) { hideLoader(); showCustomAlert(err.message); }
    };
});

// СКАЧИВАНИЕ
document.getElementById('downloadButton').onclick = () => {
    const url = document.querySelector('#result-wrapper img:not(.hidden), #result-wrapper video:not(.hidden), #result-wrapper audio:not(.hidden)')?.src;
    if (url) window.open(url, '_blank');
};

document.getElementById('shareButton').onclick = () => {
    const url = document.querySelector('#result-wrapper img:not(.hidden), #result-wrapper video:not(.hidden)')?.src;
    if (url) vkBridge.send("VKWebAppShare", { "link": url });
};

// ОПЛАТА (ЮKASSA)
document.querySelectorAll('.buy-btn').forEach(btn => {
    btn.onclick = async () => {
        if (vkBridge.isWebView()) return showCustomAlert("Оплата доступна только в веб-версии");
        showLoader();
        try {
            const r = await fetch(`${BRAIN_API_URL}/yookassa/create-payment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-VK-Sign': getAuthHeader() },
                body: JSON.stringify({ user_id: USER_ID, amount: parseInt(btn.dataset.amount), description: `Покупка кредитов` })
            });
            const res = await r.json();
            if (res.success) window.open(res.payment_url, '_blank');
        } catch (e) { showCustomAlert("Ошибка платежа"); } finally { hideLoader(); }
    };
});
