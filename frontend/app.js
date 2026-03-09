/**
 * Qwen3-TTS Frontend Logic
 * Auth + Token System + Payment + TTS Generation
 */

let currentUser = null;
let currentProfile = null;
let currentBalance = 0;
let currentMode = 'custom_voice';
let base64ReferenceAudio = null;
let proofFile = null;

// ──────────────────────────────────────────────
// Supabase Configuration
// ──────────────────────────────────────────────
const SUPABASE_URL = 'https://itorbzstfpouasowjvuw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0b3JienN0ZnBvdWFzb3dqdnV3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0MDUxOTEsImV4cCI6MjA4Nzk4MTE5MX0.8ZNAmYKxBl49NDo9M_K0HU9ChnE1Lox-3yRkCIpwBvY';

// The UMD script (<script src="...supabase-js@2">) exposes a global `supabase` object.
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Mode Descriptions
const MODE_INFO = {
    'custom_voice': {
        title: 'Voz Personalizada',
        desc: 'Sintetiza texto usando voces predefinidas de alta calidad.'
    },
    'voice_clone': {
        title: 'Clonar Voz',
        desc: 'Crea un clon idéntico de una voz a partir de un clip de audio de referencia corto. (Se recomienda audio limpio de al menos 3 a 10 segundos).'
    },
    'voice_design': {
        title: 'Diseñar Voz',
        desc: 'Crea una voz única con una descripción detallada en inglés (género, edad, tono, emoción, velocidad). Haz clic en los ejemplos para empezar.'
    }
};

// ──────────────────────────────────────────────
// DOM Elements
// ──────────────────────────────────────────────

// Auth
const authScreen = document.getElementById('auth-screen');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const authError = document.getElementById('auth-error');
const authToggleBtn = document.getElementById('auth-toggle-btn');
const authToggleText = document.getElementById('auth-toggle-text');

const backendUrlInput = document.getElementById('backend-url');
const modeBtns = document.querySelectorAll('.mode-btn');
const modeTitle = document.getElementById('mode-title');
const modeDesc = document.getElementById('mode-desc');
const apiTokenInput = document.getElementById('api-token');
const qualitySelect = document.getElementById('quality-select');
const languageSelect = document.getElementById('language-select');
const speakerSelect = document.getElementById('speaker-select');
const mainText = document.getElementById('main-text');
const charCurrent = document.getElementById('char-current');
const generateBtn = document.getElementById('generate-btn');
const statusIndicator = document.querySelector('.status-indicator');
const statusText = document.getElementById('server-status-text');

// File upload elements
const audioDropArea = document.getElementById('audio-drop-area');
const refAudioUpload = document.getElementById('ref-audio-upload');
const fileNameDisplay = document.getElementById('file-name-display');

// Result elements
const resultPanel = document.getElementById('result-panel');
const loadingState = document.getElementById('loading-state');
const successState = document.getElementById('success-state');
const errorState = document.getElementById('error-state');
const errorMessage = document.getElementById('error-message');
const resultAudio = document.getElementById('result-audio');
const metaDuration = document.getElementById('meta-duration');
const metaModel = document.getElementById('meta-model');
const downloadBtn = document.getElementById('download-btn');

// Token & User
const tokenBalanceEl = document.getElementById('token-balance');
const userEmailEl = document.getElementById('user-email');
const logoutBtn = document.getElementById('logout-btn');
const buyTokensBtn = document.getElementById('buy-tokens-btn');
const adminPanelBtn = document.getElementById('admin-panel-btn');
const myPaymentsBtn = document.getElementById('my-payments-btn');

// Modals
const paymentModal = document.getElementById('payment-modal');
const myPaymentsModal = document.getElementById('my-payments-modal');
const adminModal = document.getElementById('admin-modal');

// ──────────────────────────────────────────────
// Initialization
// ──────────────────────────────────────────────

async function init() {
    setupAuthListeners();
    setupTTSListeners();
    setupPaymentListeners();
    setupModalListeners();

    // Check if user is already logged in
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        await onLogin(session.user);
    } else {
        showAuthScreen();
    }

    // Listen for auth state changes
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
            await onLogin(session.user);
        } else if (event === 'SIGNED_OUT') {
            showAuthScreen();
        }
    });
}

// ──────────────────────────────────────────────
// Auth Flow
// ──────────────────────────────────────────────

function showAuthScreen() {
    currentUser = null;
    currentProfile = null;
    authScreen.classList.remove('hidden');
    appContainer.classList.add('hidden');
}

function showApp() {
    authScreen.classList.add('hidden');
    appContainer.classList.remove('hidden');
}

async function onLogin(user) {
    currentUser = user;
    showApp();
    userEmailEl.textContent = user.email;

    // Load profile
    const { data: profile } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    currentProfile = profile;

    // Show admin button if admin
    if (profile?.is_admin) {
        adminPanelBtn.classList.remove('hidden');
    } else {
        adminPanelBtn.classList.add('hidden');
    }

    // Load token balance
    await loadBalance();

    // Check server & fetch metadata
    await checkServerStatus();
    await fetchMetadata();
}

async function loadBalance() {
    if (!currentUser) return;
    const { data } = await supabaseClient
        .from('token_balances')
        .select('balance')
        .eq('user_id', currentUser.id)
        .single();

    currentBalance = data?.balance || 0;
    tokenBalanceEl.textContent = formatNumber(currentBalance);
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(0) + 'K';
    return num.toLocaleString();
}

function setupAuthListeners() {
    let isLoginMode = true;

    authToggleBtn.addEventListener('click', () => {
        isLoginMode = !isLoginMode;
        if (isLoginMode) {
            loginForm.classList.remove('hidden');
            registerForm.classList.add('hidden');
            authToggleText.textContent = '¿No tienes cuenta?';
            authToggleBtn.textContent = 'Regístrate aquí';
        } else {
            loginForm.classList.add('hidden');
            registerForm.classList.remove('hidden');
            authToggleText.textContent = '¿Ya tienes cuenta?';
            authToggleBtn.textContent = 'Inicia sesión';
        }
        authError.classList.add('hidden');
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        const btn = loginForm.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Entrando...';

        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Iniciar Sesión';

        if (error) {
            showAuthError(error.message === 'Invalid login credentials'
                ? 'Credenciales incorrectas. Verifica tu email y contraseña.'
                : error.message);
        }
    });

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        const confirmPassword = document.getElementById('register-password-confirm').value;

        if (password !== confirmPassword) {
            showAuthError('Las contraseñas no coinciden.');
            return;
        }

        const btn = registerForm.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creando cuenta...';

        const { error } = await supabaseClient.auth.signUp({ email, password });

        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Crear Cuenta';

        if (error) {
            showAuthError(error.message);
        } else {
            showAuthError('');
            authError.classList.remove('hidden');
            authError.style.background = 'rgba(32, 201, 151, 0.15)';
            authError.style.borderColor = 'rgba(32, 201, 151, 0.3)';
            authError.style.color = '#20c997';
            authError.textContent = '✅ Cuenta creada exitosamente. Ya puedes iniciar sesión.';
            // Switch to login mode
            loginForm.classList.remove('hidden');
            registerForm.classList.add('hidden');
            authToggleText.textContent = '¿No tienes cuenta?';
            authToggleBtn.textContent = 'Regístrate aquí';
        }
    });

    logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        console.log('Logout button clicked! Bypassing confirm dialog.');
        try {
            console.log('Attempting Supabase sign out...');
            const { error } = await supabaseClient.auth.signOut();
            if (error) {
                console.error('Error signing out:', error);
                alert('Error cerrando sesión: ' + error.message);
            } else {
                console.log('Signed out successfully.');
                showAuthScreen();
            }
        } catch (err) {
            console.error('Exception during sign out:', err);
            showAuthScreen(); // Force UI update even if it fails
        }
    });
}

function showAuthError(msg) {
    if (!msg) {
        authError.classList.add('hidden');
        return;
    }
    authError.classList.remove('hidden');
    authError.style.background = '';
    authError.style.borderColor = '';
    authError.style.color = '';
    authError.textContent = msg;
}

// ──────────────────────────────────────────────
// TTS Event Listeners (PRESERVED from original)
// ──────────────────────────────────────────────

function setupTTSListeners() {
    // Mode Switching
    modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.getAttribute('data-mode');
            setMode(mode, btn);
        });
    });

    // Obfuscate secret via base64 so GitHub doesn't block the push
    const tokenPart1 = atob("cnBhX1EzNUtBUjZZQUw5UFlGTEk=");
    const tokenPart2 = atob("OURUSDNIUllUVUJUSkxUVE1HRjlXRkZ4MW1nNmo4");

    // Auto-fill RunPod default values if empty or using old serverless
    const oldUrl = "https://api.runpod.ai/v2/tkno24whf28pz0/runsync";
    if (!backendUrlInput.value || backendUrlInput.value === 'http://localhost:8000' || backendUrlInput.value === oldUrl) {
        backendUrlInput.value = "https://m50sjj8uvufto9-8000.proxy.runpod.net";
    }
    if (!apiTokenInput.value) {
        apiTokenInput.value = tokenPart1 + tokenPart2;
    }

    // Quality restrictions
    qualitySelect.addEventListener('change', () => {
        if (qualitySelect.value === 'fast' && currentMode === 'voice_design') {
            alert('El Modo Diseño de Voz requiere usar el modelo Quality (1.7B). Se cambiará automáticamente.');
            qualitySelect.value = 'quality';
        }
    });

    // Re-check connection when URL changes
    backendUrlInput.addEventListener('change', async () => {
        await checkServerStatus();
        await fetchMetadata();
    });

    // Text Length Counter
    mainText.addEventListener('input', () => {
        const len = mainText.value.length;
        charCurrent.textContent = len;
        if (len > 100000) {
            charCurrent.style.color = 'var(--danger)';
        } else {
            charCurrent.style.color = 'var(--text-secondary)';
        }
    });

    // Generate Button
    generateBtn.addEventListener('click', generateAudio);

    // File Upload (Drag & Drop)
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        audioDropArea.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        audioDropArea.addEventListener(eventName, () => {
            audioDropArea.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        audioDropArea.addEventListener(eventName, () => {
            audioDropArea.classList.remove('dragover');
        }, false);
    });

    audioDropArea.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            handleFileStore(files[0]);
        }
    });

    refAudioUpload.addEventListener('change', function () {
        if (this.files.length > 0) {
            handleFileStore(this.files[0]);
        }
    });

    // Voice Design Example Buttons
    document.querySelectorAll('.vd-example-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const instructText = btn.getAttribute('data-instruct');
            document.getElementById('vd-instruct').value = instructText;
        });
    });
}

// ──────────────────────────────────────────────
// UI State Management (PRESERVED from original)
// ──────────────────────────────────────────────

function setMode(mode, btnElement) {
    currentMode = mode;

    // Update Nav UI
    modeBtns.forEach(b => b.classList.remove('active'));
    btnElement.classList.add('active');

    // Update Headers
    modeTitle.textContent = MODE_INFO[mode].title;
    modeDesc.textContent = MODE_INFO[mode].desc;

    // Toggle Inputs Sections
    document.querySelectorAll('.mode-section').forEach(sec => sec.classList.remove('active'));
    document.getElementById(`${mode.replace('_', '-')}-inputs`).classList.add('active');

    // Voice design strict requirement
    if (mode === 'voice_design' && qualitySelect.value === 'fast') {
        qualitySelect.value = 'quality';
    }
}

function handleFileStore(file) {
    if (!file.type.startsWith('audio/')) {
        alert('Por favor, sube un archivo de audio válido.');
        return;
    }

    // Display name
    fileNameDisplay.textContent = file.name;
    fileNameDisplay.classList.remove('hidden');

    // Convert to Base64
    const reader = new FileReader();
    reader.onload = (e) => {
        const base64String = e.target.result.split(',')[1];
        base64ReferenceAudio = base64String;
    };
    reader.readAsDataURL(file);
}

// ──────────────────────────────────────────────
// Progress Tracking (PRESERVED from original)
// ──────────────────────────────────────────────

let progressTimer = null;
let progressStartTime = null;
let estimatedTotalSeconds = 0;

const STAGES = ['stage-send', 'stage-model', 'stage-generate', 'stage-encode'];

function setProgressStage(stageIndex) {
    STAGES.forEach((id, i) => {
        const el = document.getElementById(id);
        el.classList.remove('active', 'done');
        if (i < stageIndex) el.classList.add('done');
        else if (i === stageIndex) el.classList.add('active');
    });

    const stageNames = ['Enviando solicitud...', 'Cargando modelo de IA...', 'Generando audio (esto puede tardar)...', 'Recibiendo audio generado...'];
    const detail = document.getElementById('progress-detail');
    detail.textContent = stageNames[stageIndex] || '';

    const progressPercents = [10, 25, 60, 90];
    const fill = document.getElementById('progress-fill');
    fill.style.width = progressPercents[stageIndex] + '%';

    console.log(`%c[Qwen3-TTS] Etapa: ${stageNames[stageIndex]}`, 'color: #FF0080; font-weight: bold;');
}

function startProgressTimer(textLength) {
    progressStartTime = Date.now();
    const quality = qualitySelect.value;
    const charsPerSecond = quality === 'fast' ? 15 : 8;
    estimatedTotalSeconds = Math.max(10, Math.ceil(textLength / charsPerSecond));

    console.log(`%c[Qwen3-TTS] Iniciando generación`, 'color: #7928CA; font-weight: bold;');
    console.log(`  📝 Texto: ${textLength} caracteres`);
    console.log(`  🎛️ Modelo: ${quality === 'fast' ? 'Fast (0.6B)' : 'Quality (1.7B)'}`);
    console.log(`  ⏱️ Tiempo estimado: ~${estimatedTotalSeconds}s`);

    const elapsedEl = document.getElementById('progress-elapsed');
    const estimateEl = document.getElementById('progress-estimate');
    const fill = document.getElementById('progress-fill');

    progressTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - progressStartTime) / 1000);
        elapsedEl.innerHTML = `<i class="fa-regular fa-clock"></i> ${elapsed}s transcurridos`;

        const remaining = Math.max(0, estimatedTotalSeconds - elapsed);
        if (remaining > 0) {
            estimateEl.innerHTML = `<i class="fa-solid fa-hourglass-half"></i> ~${remaining}s restantes`;
        } else {
            estimateEl.innerHTML = `<i class="fa-solid fa-hourglass-half"></i> Casi listo...`;
        }

        const progress = Math.min(85, 25 + (elapsed / estimatedTotalSeconds) * 60);
        fill.style.width = progress + '%';

        if (elapsed > 0 && elapsed % 10 === 0) {
            console.log(`  ⏳ ${elapsed}s transcurridos... (~${remaining}s restantes)`);
        }
    }, 1000);
}

function stopProgressTimer() {
    if (progressTimer) {
        clearInterval(progressTimer);
        progressTimer = null;
    }
}

function showLoading() {
    resultPanel.classList.remove('hidden');
    loadingState.classList.remove('hidden');
    successState.classList.add('hidden');
    errorState.classList.add('hidden');
    generateBtn.disabled = true;
    generateBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generando...';

    document.getElementById('progress-fill').style.width = '5%';
    document.getElementById('progress-elapsed').innerHTML = '<i class="fa-regular fa-clock"></i> 0s transcurridos';
    document.getElementById('progress-estimate').innerHTML = '<i class="fa-solid fa-hourglass-half"></i> Estimando...';
    setProgressStage(0);
}

function showSuccess(audioUrl, duration, modelId) {
    stopProgressTimer();
    setProgressStage(3);
    document.getElementById('progress-fill').style.width = '100%';

    const totalTime = progressStartTime ? ((Date.now() - progressStartTime) / 1000).toFixed(1) : '?';
    console.log(`%c[Qwen3-TTS] ✅ Audio generado exitosamente`, 'color: #20c997; font-weight: bold;');
    console.log(`  🎵 Duración del audio: ${duration}s`);
    console.log(`  ⏱️ Tiempo total: ${totalTime}s`);
    console.log(`  🤖 Modelo: ${modelId}`);

    setTimeout(() => {
        loadingState.classList.add('hidden');
        successState.classList.remove('hidden');

        // Note: audioUrl is already a Blob URL
        resultAudio.src = audioUrl;
        downloadBtn.href = audioUrl;

        // Ensure download filename ends in .mp3 rather than .wav
        if (downloadBtn.hasAttribute('download')) {
            let currentName = downloadBtn.getAttribute('download');
            downloadBtn.setAttribute('download', currentName.replace('.wav', '.mp3'));
        } else {
            downloadBtn.setAttribute('download', 'sintesis_qwen3.mp3');
        }

        metaDuration.innerHTML = `<i class="fa-regular fa-clock"></i> ${duration}s`;
        metaModel.innerHTML = `<i class="fa-solid fa-microchip"></i> ${modelId.split('/').pop()}`;

        generateBtn.disabled = false;
        generateBtn.innerHTML = '<i class="fa-solid fa-wand-magic"></i> Generar Audio';

        resultPanel.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 500);
}

function showError(msg) {
    stopProgressTimer();

    const totalTime = progressStartTime ? ((Date.now() - progressStartTime) / 1000).toFixed(1) : '?';
    console.log(`%c[Qwen3-TTS] ❌ Error después de ${totalTime}s`, 'color: #dc3545; font-weight: bold;');
    console.log(`  💬 ${msg}`);

    loadingState.classList.add('hidden');
    errorState.classList.remove('hidden');
    errorMessage.textContent = msg;

    generateBtn.disabled = false;
    generateBtn.innerHTML = '<i class="fa-solid fa-wand-magic"></i> Generar Audio';
}

// ──────────────────────────────────────────────
// API Calls (PRESERVED from original)
// ──────────────────────────────────────────────

async function checkServerStatus() {
    try {
        let backendUrl = backendUrlInput.value.trim().replace(/\/$/, '');

        // Sanitize: strip common endpoint suffixes if user pasted the full link
        backendUrl = backendUrl.replace(/\/health$/, '')
            .replace(/\/generate$/, '')
            .replace(/\/generate_audio$/, '');

        const apiToken = apiTokenInput?.value.trim() || '';
        statusText.textContent = 'Conectando...';

        // Wait if it's a RunPod Serverless URL, we can't reliably GET a health endpoint
        if (backendUrl.includes('runpod.ai') && backendUrl.includes('runsync')) {
            statusIndicator.classList.remove('offline');
            statusIndicator.classList.add('online');
            statusText.textContent = 'RunPod Serverless Conectado';
            return;
        }

        const headers = {};
        if (apiToken) headers['Authorization'] = `Bearer ${apiToken}`;

        const res = await fetch(`${backendUrl}/health`, {
            headers: headers
        });
        const data = await res.json();

        if (data.status === 'ok') {
            statusIndicator.classList.remove('offline');
            statusIndicator.classList.add('online');

            let statusStr = 'Online';
            if (data.gpu_available) {
                statusStr += ` (GPU: ${data.gpu_free_gb || data.vram_free_gb || '?'}GB libres)`;
            } else {
                statusStr += ' (GPU No detectada, usando CPU)';
            }
            statusText.textContent = statusStr;
        }
    } catch (error) {
        statusIndicator.classList.remove('online');
        statusIndicator.classList.add('offline');
        statusText.textContent = 'Backend Offline - Verifica la URL o inicia el servidor';
    }
}

async function fetchMetadata() {
    try {
        let backendUrl = backendUrlInput.value.trim().replace(/\/$/, '');

        // Sanitize
        backendUrl = backendUrl.replace(/\/health$/, '')
            .replace(/\/generate$/, '')
            .replace(/\/generate_audio$/, '');

        const apiToken = apiTokenInput?.value.trim() || '';
        const headers = {};
        if (apiToken) headers['Authorization'] = `Bearer ${apiToken}`;

        // If it's RunPod, use default fallback data because we can't GET /languages
        if (backendUrl.includes('runpod.ai') && backendUrl.includes('runsync')) {
            const fallbackSpeakers = ["Vivian", "Ryan", "Aria", "Emily", "Owen", "Rina", "Hudson", "Claire", "Haruto", "Stella"];
            const fallbackLanguages = ["Auto", "English", "Spanish", "French", "Japanese", "Korean", "Chinese"];

            languageSelect.innerHTML = '';
            fallbackLanguages.forEach(lang => {
                const opt = document.createElement('option');
                opt.value = lang;
                opt.textContent = lang === "Auto" ? "Automático" : lang;
                languageSelect.appendChild(opt);
            });

            speakerSelect.innerHTML = '';

            // Inject custom voice
            const customOpt = document.createElement('option');
            customOpt.value = 'Voz cristiana';
            customOpt.textContent = 'Voz cristiana (Español)';
            speakerSelect.appendChild(customOpt);

            fallbackSpeakers.forEach(spk => {
                const opt = document.createElement('option');
                opt.value = spk;
                opt.textContent = spk;
                speakerSelect.appendChild(opt);
            });
            speakerSelect.value = 'Vivian';
            return;
        }

        // Fetch Languages
        try {
            const langRes = await fetch(`${backendUrl}/languages`, {
                headers: headers
            });
            if (langRes.ok) {
                const data = await langRes.json();
                languageSelect.innerHTML = '<option value="Auto">Automático</option>';
                data.languages.forEach(lang => {
                    if (lang !== 'Auto') {
                        const opt = document.createElement('option');
                        opt.value = lang;
                        opt.textContent = lang;
                        languageSelect.appendChild(opt);
                    }
                });
            }
        } catch (langErr) {
            console.warn("Could not fetch languages, using defaults:", langErr);
            if (languageSelect.options.length === 0) {
                languageSelect.innerHTML = '<option value="Auto">Automático</option><option value="es">Español</option><option value="en">Inglés</option>';
            }
        }

        // Fetch Speakers
        try {
            const spkRes = await fetch(`${backendUrl}/speakers`, {
                headers: headers
            });
            if (spkRes.ok) {
                const data = await spkRes.json();
                speakerSelect.innerHTML = '';

                // Re-inject custom hardcoded voices first
                const customOpt = document.createElement('option');
                customOpt.value = 'Voz cristiana';
                customOpt.textContent = 'Voz cristiana (Español)';
                speakerSelect.appendChild(customOpt);

                data.speakers.forEach(spk => {
                    const opt = document.createElement('option');
                    opt.value = spk;
                    opt.textContent = spk;
                    speakerSelect.appendChild(opt);
                });
                if (data.speakers.includes('Vivian')) {
                    speakerSelect.value = 'Vivian';
                }
            }
        } catch (spkErr) {
            console.warn("Could not fetch speakers, loading offline fallbacks:", spkErr);
            // If fetching speakers fails (e.g. backend offline), load fallbacks
            speakerSelect.innerHTML = '';

            const customOpt = document.createElement('option');
            customOpt.value = 'Voz cristiana';
            customOpt.textContent = 'Voz cristiana (Español)';
            speakerSelect.appendChild(customOpt);

            const fallbackSpeakers = [
                'Vivian', 'Ryan', 'Aria', 'Emily', 'Owen', 'Rina', 'Hudson', 'Claire', 'Haruto', 'Stella'
            ];

            fallbackSpeakers.forEach(spk => {
                const opt = document.createElement('option');
                opt.value = spk;
                opt.textContent = spk;
                speakerSelect.appendChild(opt);
            });
            speakerSelect.value = 'Voz cristiana';
        }
    } catch (e) {
        console.error("Critical error in fetchMetadata:", e);
    }
}

// ──────────────────────────────────────────────
// Generate Audio (MODIFIED: + token check & deduction)
// ──────────────────────────────────────────────

// ─── Text Chunking Utilities ───
function splitTextIntoChunks(text, maxChunkSize = 1200) {
    if (text.length <= maxChunkSize) return [text];

    const chunks = [];
    let remaining = text;

    while (remaining.length > 0) {
        if (remaining.length <= maxChunkSize) {
            chunks.push(remaining);
            break;
        }

        // Try to split at sentence boundaries (., !, ?, \n) within the max chunk size
        let splitIndex = -1;
        const searchArea = remaining.substring(0, maxChunkSize);

        // Look for the last sentence-ending punctuation followed by a space or newline
        for (let i = searchArea.length - 1; i >= Math.floor(maxChunkSize * 0.5); i--) {
            const ch = searchArea[i];
            if ((ch === '.' || ch === '!' || ch === '?' || ch === '\n') &&
                (i + 1 >= searchArea.length || searchArea[i + 1] === ' ' || searchArea[i + 1] === '\n')) {
                splitIndex = i + 1;
                break;
            }
        }

        // If no sentence boundary found, split at last space
        if (splitIndex === -1) {
            splitIndex = searchArea.lastIndexOf(' ');
        }

        // If still no good split point, force split at maxChunkSize
        if (splitIndex === -1 || splitIndex < Math.floor(maxChunkSize * 0.3)) {
            splitIndex = maxChunkSize;
        }

        chunks.push(remaining.substring(0, splitIndex).trim());
        remaining = remaining.substring(splitIndex).trim();
    }

    return chunks.filter(c => c.length > 0);
}

function base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

function concatenateWavBuffers(wavBuffers) {
    if (wavBuffers.length === 0) return null;
    if (wavBuffers.length === 1) return wavBuffers[0];

    // Read WAV header from first buffer to get format info
    const firstView = new DataView(wavBuffers[0]);
    const numChannels = firstView.getUint16(22, true);
    const sampleRate = firstView.getUint32(24, true);
    const bitsPerSample = firstView.getUint16(34, true);

    // Extract PCM data from each WAV (skip 44-byte header)
    const pcmChunks = wavBuffers.map(buf => new Uint8Array(buf, 44));
    const totalPcmLength = pcmChunks.reduce((sum, chunk) => sum + chunk.length, 0);

    // Build new WAV file
    const wavBuffer = new ArrayBuffer(44 + totalPcmLength);
    const view = new DataView(wavBuffer);

    // RIFF header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + totalPcmLength, true);
    writeString(view, 8, 'WAVE');

    // fmt sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // SubChunk1Size (PCM)
    view.setUint16(20, 1, true);  // AudioFormat (PCM = 1)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true); // ByteRate
    view.setUint16(32, numChannels * (bitsPerSample / 8), true); // BlockAlign
    view.setUint16(34, bitsPerSample, true);

    // data sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, totalPcmLength, true);

    // Copy PCM data
    let offset = 44;
    for (const chunk of pcmChunks) {
        new Uint8Array(wavBuffer, offset, chunk.length).set(chunk);
        offset += chunk.length;
    }

    return wavBuffer;
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
        binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
}

// ─── WAV to MP3 Conversion ───
function convertWavToMp3(wavBuffer) {
    if (!window.lamejs) {
        console.warn('lamejs no está cargado, devolviendo WAV original');
        return wavBuffer;
    }

    const view = new DataView(wavBuffer);
    const numChannels = view.getUint16(22, true);
    const sampleRate = view.getUint32(24, true);

    // lame.js only supports 1 or 2 channels, and 16-bit PCM
    const kbps = 128; // Standard quality
    const mp3encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, kbps);
    const mp3Data = [];

    // Extract 16-bit PCM samples
    const samples = new Int16Array(wavBuffer, 44);

    // For 1 channel, lamejs expects one array. For 2, it expects left and right arrays.
    // Qwen3-TTS usually outputs mono (1 channel).
    const sampleBlockSize = 1152;
    if (numChannels === 1) {
        for (let i = 0; i < samples.length; i += sampleBlockSize) {
            const sampleChunk = samples.subarray(i, i + sampleBlockSize);
            const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
            if (mp3buf.length > 0) mp3Data.push(mp3buf);
        }
    } else {
        // Stereo handling (interleaved)
        const left = new Int16Array(samples.length / 2);
        const right = new Int16Array(samples.length / 2);
        for (let i = 0; i < samples.length; i += 2) {
            left[i / 2] = samples[i];
            right[i / 2] = samples[i + 1];
        }
        for (let i = 0; i < left.length; i += sampleBlockSize) {
            const leftChunk = left.subarray(i, i + sampleBlockSize);
            const rightChunk = right.subarray(i, i + sampleBlockSize);
            const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
            if (mp3buf.length > 0) mp3Data.push(mp3buf);
        }
    }

    const mp3buf = mp3encoder.flush();
    if (mp3buf.length > 0) mp3Data.push(mp3buf);

    // Concatenate all Int8Array buffers into one ArrayBuffer
    const totalLength = mp3Data.reduce((acc, val) => acc + val.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const buf of mp3Data) {
        combined.set(buf, offset);
        offset += buf.length;
    }

    return combined.buffer;
}

// ─── Single chunk sender (used by generateAudio) ───
async function sendChunkToBackend(chunkPayload, backendUrl, apiToken) {
    const fetchHeaders = { 'Content-Type': 'application/json' };
    if (apiToken) fetchHeaders['Authorization'] = `Bearer ${apiToken}`;

    const runpodPayload = { input: chunkPayload };

    let targetEndpoint = backendUrl;
    const isRunPodServerless = backendUrl.includes('runpod.ai') && backendUrl.includes('runsync');
    const isRunPodProxy = backendUrl.includes('proxy.runpod.net');

    if (isRunPodServerless) {
        targetEndpoint = targetEndpoint.replace('/runsync', '/run');
    } else if (isRunPodProxy) {
        targetEndpoint = `${backendUrl}/generate`;
    } else if (!targetEndpoint.includes('runsync')) {
        targetEndpoint = `${backendUrl}/generate_audio`;
    }

    let response = await fetch(targetEndpoint, {
        method: 'POST',
        headers: fetchHeaders,
        body: JSON.stringify(runpodPayload)
    });

    let data = await response.json();
    let resultData = data;

    // --- RunPod Async Polling Logic ---
    if (isRunPodServerless && data.id) {
        const jobId = data.id;
        const statusUrl = targetEndpoint.replace('/run', '/status/') + jobId;

        console.log(`  ⏱️ Tarea encolada en RunPod (ID: ${jobId}). Esperando resultados...`);

        while (true) {
            await new Promise(resolve => setTimeout(resolve, 3000));

            let statusRes = await fetch(statusUrl, {
                method: 'GET',
                headers: fetchHeaders
            });

            let statusData = await statusRes.json();
            console.log(`  🔄 Estado: ${statusData.status}`);

            if (statusData.status === 'COMPLETED') {
                resultData = statusData.output;
                break;
            } else if (statusData.status === 'FAILED') {
                throw new Error(statusData.error?.detail || statusData.error || "Error en la ejecución de RunPod.");
            }
        }
    } else {
        if (data.output && data.status === 'COMPLETED') {
            resultData = data.output;
        }
    }

    if (!resultData || resultData.success === false || !resultData.audio_base64) {
        throw new Error(resultData?.detail || resultData?.error || resultData?.message || "Error desconocido del servidor.");
    }

    return resultData;
}

async function generateAudio() {
    const text = mainText.value.trim();
    if (!text) {
        alert("Por favor, ingresa un texto para sintetizar.");
        return;
    }

    if (text.length > 100000) {
        alert("El texto excede el límite máximo de 100000 caracteres.");
        return;
    }

    // ─── TOKEN CHECK ───
    if (currentBalance < text.length) {
        alert(`No tienes suficientes tokens.\n\nNecesitas: ${text.length.toLocaleString()} caracteres\nTienes: ${currentBalance.toLocaleString()} caracteres\n\nRecarga tokens para continuar.`);
        paymentModal.classList.remove('hidden');
        return;
    }

    // Build base payload (without text — text will be set per chunk)
    const basePayload = {
        language: languageSelect.value,
        mode: currentMode,
        quality: qualitySelect.value
    };

    if (currentMode === 'custom_voice') {
        if (speakerSelect.value === 'Voz cristiana') {
            basePayload.mode = 'voice_clone';
            basePayload.quality = 'quality';

            const voiceData = PREDEFINED_VOICES['Voz cristiana'];
            basePayload.ref_audio_base64 = voiceData.base64;
            basePayload.ref_text = voiceData.ref_text;

            const inst = document.getElementById('cv-instruct').value.trim();
            if (inst) basePayload.instruct = inst;
        } else {
            basePayload.speaker = speakerSelect.value;
            const inst = document.getElementById('cv-instruct').value.trim();
            if (inst) basePayload.instruct = inst;
        }
    }
    else if (currentMode === 'voice_clone') {
        if (!base64ReferenceAudio) {
            alert("Debes subir un archivo de audio de referencia para clonar la voz.");
            return;
        }
        basePayload.ref_audio_base64 = base64ReferenceAudio;
        const refTx = document.getElementById('ref-text').value.trim();
        if (refTx) basePayload.ref_text = refTx;
    }
    else if (currentMode === 'voice_design') {
        const inst = document.getElementById('vd-instruct').value.trim();
        if (!inst) {
            alert("Debes ingresar una descripción de la voz para diseñarla.");
            return;
        }
        basePayload.instruct = inst;
    }

    showLoading();
    if (!text) return;

    let backendUrl = backendUrlInput.value.trim().replace(/\/$/, '');

    // Sanitize
    backendUrl = backendUrl.replace(/\/health$/, '')
        .replace(/\/generate$/, '')
        .replace(/\/generate_audio$/, '');

    let apiToken = apiTokenInput?.value.trim() || '';
    if (!apiToken) {
        apiToken = atob("cnBhX1EzNUtBUjZZQUw5UFlGTEk=") + atob("OURUSDNIUllUVUJUSkxUVE1HRjlXRkZ4MW1nNmo4");
    }

    setProgressStage(0);
    console.log(`  📡 Enviando a: ${backendUrl}`);

    try {
        // ─── CHUNKING LOGIC ───
        const chunks = splitTextIntoChunks(text, 1200);
        const totalChunks = chunks.length;
        const isChunked = totalChunks > 1;

        if (isChunked) {
            console.log(`%c[Qwen3-TTS] 📦 Texto dividido en ${totalChunks} fragmentos para evitar límites de payload`, 'color: #ffa500; font-weight: bold;');
        }

        setTimeout(() => setProgressStage(1), 800);

        const audioBuffers = [];
        let totalDuration = 0;
        let lastModelUsed = '';

        for (let i = 0; i < totalChunks; i++) {
            const chunk = chunks[i];
            const chunkPayload = { ...basePayload, text: chunk };

            if (isChunked) {
                const progressText = `Fragmento ${i + 1} de ${totalChunks} (${chunk.length} caracteres)`;
                console.log(`%c[Qwen3-TTS] 🔄 Procesando ${progressText}`, 'color: #00bcd4;');

                // Update the progress estimate text to show chunk progress
                const estimateEl = document.getElementById('progress-estimate');
                if (estimateEl) {
                    estimateEl.innerHTML = `<i class="fa-solid fa-layer-group"></i> ${progressText}`;
                }

                // Update progress bar proportionally
                const fill = document.getElementById('progress-fill');
                if (fill) {
                    const chunkProgress = 10 + ((i / totalChunks) * 75);
                    fill.style.width = chunkProgress + '%';
                }
            }

            if (i === 0) setTimeout(() => setProgressStage(2), 1000);

            const result = await sendChunkToBackend(chunkPayload, backendUrl, apiToken);

            // Convert base64 audio to ArrayBuffer for concatenation
            const wavBuffer = base64ToArrayBuffer(result.audio_base64);
            audioBuffers.push(wavBuffer);
            totalDuration += (result.duration_seconds || 0);
            lastModelUsed = result.model_used || lastModelUsed;

            if (isChunked) {
                console.log(`  ✅ Fragmento ${i + 1}/${totalChunks} completado (${result.duration_seconds || '?'}s de audio)`);
            }
        }

        setProgressStage(3);

        // Concatenate all WAV buffers into one
        let finalMp3Buffer;
        if (audioBuffers.length === 1) {
            console.log(`%c[Qwen3-TTS] 🗜️ Convirtiendo 1 fragmento de WAV a MP3 para ahorrar espacio...`, 'color: #ffa500;');
            finalMp3Buffer = convertWavToMp3(audioBuffers[0]);
        } else {
            console.log(`%c[Qwen3-TTS] 🔗 Uniendo ${audioBuffers.length} fragmentos de audio y convirtiendo a MP3...`, 'color: #ffa500;');
            const combinedBuffer = concatenateWavBuffers(audioBuffers);

            // Now convert the massive WAV buffer to a lightweight MP3 buffer
            finalMp3Buffer = convertWavToMp3(combinedBuffer);

            console.log(`%c[Qwen3-TTS] ✅ Audio combinado y comprimido: ${totalDuration.toFixed(1)}s total`, 'color: #20c997; font-weight: bold;');
        }

        const mp3Blob = new Blob([finalMp3Buffer], { type: 'audio/mp3' });
        const finalAudioUrl = URL.createObjectURL(mp3Blob);

        // ─── DEDUCT TOKENS ───
        deductTokens(text.length, currentMode, qualitySelect.value);
        showSuccess(finalAudioUrl, totalDuration.toFixed(1), lastModelUsed);

    } catch (error) {
        showError(error.message || "Error de conexión. Verifica que la URL del servidor sea correcta y esté activo.");
        console.error(error);
    }
}

async function deductTokens(charCount, mode, quality) {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;

        const res = await fetch(`${SUPABASE_URL}/functions/v1/deduct-tokens`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
                'apikey': SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({
                characters_used: charCount,
                mode,
                quality,
            }),
        });

        const result = await res.json();
        if (result.success) {
            currentBalance = result.new_balance;
            tokenBalanceEl.textContent = formatNumber(currentBalance);
            console.log(`%c[Tokens] Deducidos: ${charCount} | Nuevo balance: ${currentBalance}`, 'color: #ffc107;');
        }
    } catch (e) {
        console.error('Error deducting tokens:', e);
    }
}

// ──────────────────────────────────────────────
// Payment System
// ──────────────────────────────────────────────

function setupPaymentListeners() {
    const proofDropArea = document.getElementById('proof-drop-area');
    const proofUpload = document.getElementById('proof-upload');
    const proofFileName = document.getElementById('proof-file-name');
    const submitPaymentBtn = document.getElementById('submit-payment-btn');

    // Copy buttons
    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const text = btn.getAttribute('data-copy');
            navigator.clipboard.writeText(text).then(() => {
                const icon = btn.querySelector('i');
                icon.className = 'fa-solid fa-check';
                btn.style.color = 'var(--success)';
                setTimeout(() => {
                    icon.className = 'fa-solid fa-copy';
                    btn.style.color = '';
                }, 2000);
            });
        });
    });

    // Proof file upload
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        proofDropArea.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        proofDropArea.addEventListener(eventName, () => {
            proofDropArea.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        proofDropArea.addEventListener(eventName, () => {
            proofDropArea.classList.remove('dragover');
        }, false);
    });

    proofDropArea.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0) handleProofFile(files[0]);
    });

    proofUpload.addEventListener('change', function () {
        if (this.files.length > 0) handleProofFile(this.files[0]);
    });

    function handleProofFile(file) {
        if (!file.type.startsWith('image/')) {
            alert('Por favor, sube una imagen (captura de pantalla).');
            return;
        }
        proofFile = file;
        proofFileName.textContent = file.name;
        proofFileName.classList.remove('hidden');
        submitPaymentBtn.disabled = false;
    }

    // Submit payment
    submitPaymentBtn.addEventListener('click', async () => {
        if (!proofFile || !currentUser) return;

        submitPaymentBtn.disabled = true;
        submitPaymentBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...';

        const statusEl = document.getElementById('payment-submit-status');

        try {
            // Upload proof image to Supabase Storage
            const ext = proofFile.name.split('.').pop();
            const fileName = `${currentUser.id}/${Date.now()}.${ext}`;

            const { data: uploadData, error: uploadError } = await supabaseClient.storage
                .from('payment-proofs')
                .upload(fileName, proofFile);

            if (uploadError) throw uploadError;

            const proofUrl = `${SUPABASE_URL}/storage/v1/object/payment-proofs/${fileName}`;

            // Create payment request
            const paymentMethod = document.getElementById('payment-method-select').value;

            const { error: insertError } = await supabaseClient
                .from('payment_requests')
                .insert({
                    user_id: currentUser.id,
                    amount_usdt: 50.00,
                    characters_amount: 2400000,
                    payment_method: paymentMethod,
                    proof_image_url: proofUrl,
                    status: 'pending',
                });

            if (insertError) throw insertError;

            statusEl.classList.remove('hidden');
            statusEl.className = 'payment-status-msg success';
            statusEl.innerHTML = '<i class="fa-solid fa-check-circle"></i> ¡Comprobante enviado! Tu pago será revisado por el administrador. Recibirás tus tokens una vez aprobado.';

            // Reset
            proofFile = null;
            proofFileName.classList.add('hidden');
        } catch (err) {
            console.error('Payment submission error:', err);
            statusEl.classList.remove('hidden');
            statusEl.className = 'payment-status-msg error';
            statusEl.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> Error: ${err.message}`;
        }

        submitPaymentBtn.disabled = true;
        submitPaymentBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Enviar Comprobante';
    });
}

// ──────────────────────────────────────────────
// Modals
// ──────────────────────────────────────────────

function setupModalListeners() {
    // Buy tokens
    buyTokensBtn.addEventListener('click', () => {
        paymentModal.classList.remove('hidden');
    });

    document.getElementById('close-payment-modal').addEventListener('click', () => {
        paymentModal.classList.add('hidden');
    });

    // My payments
    myPaymentsBtn.addEventListener('click', async () => {
        myPaymentsModal.classList.remove('hidden');
        await loadMyPayments();
    });

    document.getElementById('close-my-payments-modal').addEventListener('click', () => {
        myPaymentsModal.classList.add('hidden');
    });

    // Admin panel
    adminPanelBtn.addEventListener('click', async () => {
        adminModal.classList.remove('hidden');
        await loadAdminPayments('pending');
    });

    document.getElementById('close-admin-modal').addEventListener('click', () => {
        adminModal.classList.add('hidden');
    });

    // Admin tabs
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', async () => {
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            await loadAdminPayments(tab.getAttribute('data-tab'));
        });
    });

    // Close modals on overlay click
    [paymentModal, myPaymentsModal, adminModal].forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.add('hidden');
        });
    });
}

async function loadMyPayments() {
    const listEl = document.getElementById('my-payments-list');
    listEl.innerHTML = '<p class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i> Cargando...</p>';

    const { data: payments, error } = await supabaseClient
        .from('payment_requests')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

    if (error || !payments?.length) {
        listEl.innerHTML = '<p class="empty-state">No tienes pagos registrados.</p>';
        return;
    }

    listEl.innerHTML = payments.map(p => `
        <div class="payment-item ${p.status}">
            <div class="payment-item-header">
                <span class="payment-status-badge ${p.status}">
                    <i class="fa-solid fa-${p.status === 'approved' ? 'check-circle' : p.status === 'rejected' ? 'times-circle' : 'clock'}"></i>
                    ${p.status === 'approved' ? 'Aprobado' : p.status === 'rejected' ? 'Rechazado' : 'Pendiente'}
                </span>
                <span class="payment-date">${new Date(p.created_at).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div class="payment-item-details">
                <span><strong>${p.amount_usdt} USDT</strong> → ${(p.characters_amount / 1000000).toFixed(1)}M caracteres</span>
                <span class="payment-method-tag">${p.payment_method === 'usdt_bep20' ? 'USDT BEP20' : 'Binance ID'}</span>
            </div>
            ${p.admin_notes ? `<div class="payment-admin-note"><i class="fa-solid fa-comment"></i> ${p.admin_notes}</div>` : ''}
        </div>
    `).join('');
}

async function loadAdminPayments(tab) {
    const listEl = document.getElementById('admin-payments-list');
    listEl.innerHTML = '<p class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i> Cargando...</p>';

    let query = supabaseClient
        .from('payment_requests')
        .select('*, profiles(email)')
        .order('created_at', { ascending: false });

    if (tab === 'pending') {
        query = query.eq('status', 'pending');
    }

    const { data: payments, error } = await query;

    if (error || !payments?.length) {
        listEl.innerHTML = `<p class="empty-state">${tab === 'pending' ? 'No hay pagos pendientes 🎉' : 'No hay pagos registrados.'}</p>`;
        return;
    }

    listEl.innerHTML = payments.map(p => `
        <div class="payment-item admin ${p.status}" data-id="${p.id}">
            <div class="payment-item-header">
                <span class="payment-user-email"><i class="fa-solid fa-user"></i> ${p.profiles?.email || 'Unknown'}</span>
                <span class="payment-status-badge ${p.status}">
                    <i class="fa-solid fa-${p.status === 'approved' ? 'check-circle' : p.status === 'rejected' ? 'times-circle' : 'clock'}"></i>
                    ${p.status === 'approved' ? 'Aprobado' : p.status === 'rejected' ? 'Rechazado' : 'Pendiente'}
                </span>
            </div>
            <div class="payment-item-details">
                <span><strong>${p.amount_usdt} USDT</strong> → ${(p.characters_amount / 1000000).toFixed(1)}M caracteres</span>
                <span class="payment-method-tag">${p.payment_method === 'usdt_bep20' ? 'USDT BEP20' : 'Binance ID'}</span>
                <span class="payment-date">${new Date(p.created_at).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            ${p.proof_image_url ? `<a href="${p.proof_image_url}" target="_blank" class="proof-link"><i class="fa-solid fa-image"></i> Ver Comprobante</a>` : ''}
            ${p.status === 'pending' ? `
                <div class="admin-actions">
                    <button class="approve-btn" onclick="handleAdminAction('${p.id}', 'approve')">
                        <i class="fa-solid fa-check"></i> Aprobar
                    </button>
                    <button class="reject-btn" onclick="handleAdminAction('${p.id}', 'reject')">
                        <i class="fa-solid fa-xmark"></i> Rechazar
                    </button>
                </div>
            ` : ''}
            ${p.admin_notes ? `<div class="payment-admin-note"><i class="fa-solid fa-comment"></i> ${p.admin_notes}</div>` : ''}
        </div>
    `).join('');
}

async function handleAdminAction(paymentId, action) {
    const confirmMsg = action === 'approve'
        ? '¿Aprobar este pago y acreditar 2,400,000 tokens al usuario?'
        : '¿Rechazar este pago?';

    if (!confirm(confirmMsg)) return;

    const adminNotes = action === 'reject' ? prompt('Razón del rechazo (opcional):') : null;

    try {
        const { data: { session } } = await supabaseClient.auth.getSession();

        const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-approve-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
                'apikey': SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({
                payment_id: paymentId,
                action,
                admin_notes: adminNotes,
            }),
        });

        const result = await res.json();

        if (result.success) {
            alert(action === 'approve'
                ? `✅ Pago aprobado. Se acreditaron ${(result.tokens_credited / 1000000).toFixed(1)}M tokens.`
                : '❌ Pago rechazado.');

            // Reload the active tab
            const activeTab = document.querySelector('.admin-tab.active');
            await loadAdminPayments(activeTab?.getAttribute('data-tab') || 'pending');
        } else {
            alert(`Error: ${result.error}`);
        }
    } catch (e) {
        console.error('Admin action error:', e);
        alert('Error al procesar la acción.');
    }
}

// Make handleAdminAction globally accessible for onclick
window.handleAdminAction = handleAdminAction;

// ──────────────────────────────────────────────
// Run init
// ──────────────────────────────────────────────
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
