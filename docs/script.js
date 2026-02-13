vkBridge.send('VKWebAppInit');
const BRAIN_API_URL = 'https://neuro-master.online';

// --- Глобальные хранилища ---
const multiStepFiles = {};

// --- Привязка обработчиков ---
document.querySelectorAll('.process-button').forEach(b => b.addEventListener('click', handleProcessClick));
document.querySelectorAll('.add-photo-button').forEach(b => b.addEventListener('click', e => handleAddFileClick(e, 'photo')));
document.querySelectorAll('.add-video-button').forEach(b => b.addEventListener('click', e => handleAddFileClick(e, 'video')));
document.querySelectorAll('.record-audio-button').forEach(b => b.addEventListener('click', handleRecordAudioClick));
document.querySelectorAll('.music-styles .style-button').forEach(b => b.addEventListener('click', handleMusicStyleClick));
document.querySelector('[data-mode="music"] .prompt-input').addEventListener('input', handleMusicLyricsInput);


// --- Логика ---

async function handleAddFileClick(event, fileType) {
    // ... (без изменений, теперь принимает fileType)
}

async function handleRecordAudioClick(event) {
    const section = event.target.closest('.mode-section');
    const mode = section.dataset.mode;
    alert('Начинаю запись... Нажмите ОК и говорите. Запись остановится автоматически через 20 секунд или при сворачивании приложения.');
    try {
        await vkBridge.send('VKWebAppStartRecord', { max_duration: 20 });
        // Подписываемся на результат
        vkBridge.subscribe(e => {
            if (e.detail.type === 'VKWebAppRecordResult') {
                const fileUrl = e.detail.data.url;
                if (!multiStepFiles[mode]) multiStepFiles[mode] = { photos: [], videos: [], audios: [] };
                multiStepFiles[mode].audios.push(fileUrl);
                updateMultiStepUI(section);
            }
        });
    } catch (error) {
        handleError(error);
    }
}

function handleMusicLyricsInput(event) {
    const section = event.target.closest('.mode-section');
    const musicStylesDiv = section.querySelector('.music-styles');
    musicStylesDiv.classList.toggle('hidden', event.target.value.length < 10);
}

async function handleMusicStyleClick(event) {
    const button = event.target;
    const section = button.closest('.mode-section');
    const lyrics = section.querySelector('.prompt-input').value;
    const stylePrompt = button.dataset.prompt;

    button.disabled = true;
    showLoader();
    try {
        const requestBody = { lyrics, style_prompt: stylePrompt };
        const response = await fetch(`${BRAIN_API_URL}/generate_music`, {
             method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody)
        });
        if (!response.ok) throw new Error((await response.json()).detail);
        const result = await response.json();
        showResult(result);
    } catch (error) {
        handleError(error);
    } finally {
        loader.classList.add('hidden');
        button.disabled = false;
    }
}

async function handleProcessClick(event) {
    // ... (основная функция, теперь с обработкой talking_photo и chat)
    const button = event.target;
    const section = button.closest('.mode-section');
    const mode = section.dataset.mode;
    // ... (остальной код)

    try {
        // ...
        if (section.dataset.multistep === 'true') {
            // ...
            if (mode === 'talking_photo') {
                requestBody.image_url = files.photos[0];
                requestBody.audio_url = files.audios[0];
            }
            // ...
        }
        // ...

        const response = await fetch(`${BRAIN_API_URL}/generate_${mode}`, {
            // ...
        });

        // ...
    }
    // ...
}

function updateMultiStepUI(section) {
    // ... (теперь включает логику для talking_photo)
    const mode = section.dataset.mode;
    // ...
    if (mode === 'talking_photo') {
        const photoDone = files.photos.length >= maxPhotos;
        const audioDone = files.audios.length >= maxAudios;

        addPhotoButton.classList.toggle('hidden', photoDone);
        recordButton.classList.toggle('hidden', !photoDone || audioDone);
        processButton.classList.toggle('hidden', !photoDone || !audioDone);
    }
    // ...
}

// ... (остальные функции без изменений)
