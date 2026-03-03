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
        if (len > 5000) {
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

function showSuccess(audioBase64, duration, modelId) {
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

        const audioUrl = `data:audio/wav;base64,${audioBase64}`;
        resultAudio.src = audioUrl;
        downloadBtn.href = audioUrl;

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
        const backendUrl = backendUrlInput.value.replace(/\/$/, '');
        const apiToken = apiTokenInput?.value.trim() || '';
        statusText.textContent = 'Conectando...';

        const headers = { 'ngrok-skip-browser-warning': 'true' };
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
        const backendUrl = backendUrlInput.value.replace(/\/$/, '');
        const apiToken = apiTokenInput?.value.trim() || '';
        const headers = { 'ngrok-skip-browser-warning': 'true' };
        if (apiToken) headers['Authorization'] = `Bearer ${apiToken}`;

        // Fetch Languages
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

        // Fetch Speakers
        const spkRes = await fetch(`${backendUrl}/speakers`, {
            headers: headers
        });
        if (spkRes.ok) {
            const data = await spkRes.json();
            speakerSelect.innerHTML = '';
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
    } catch (e) {
        console.error("Error fetching metadata:", e);
    }
}

// ──────────────────────────────────────────────
// Generate Audio (MODIFIED: + token check & deduction)
// ──────────────────────────────────────────────

async function generateAudio() {
    const text = mainText.value.trim();
    if (!text) {
        alert("Por favor, ingresa un texto para sintetizar.");
        return;
    }

    if (text.length > 5000) {
        alert("El texto excede el límite máximo de 5000 caracteres.");
        return;
    }

    // ─── TOKEN CHECK ───
    if (currentBalance < text.length) {
        alert(`No tienes suficientes tokens.\n\nNecesitas: ${text.length.toLocaleString()} caracteres\nTienes: ${currentBalance.toLocaleString()} caracteres\n\nRecarga tokens para continuar.`);
        paymentModal.classList.remove('hidden');
        return;
    }

    // Build Request Payload (same as original)
    const payload = {
        text: text,
        language: languageSelect.value,
        mode: currentMode,
        quality: qualitySelect.value
    };

    if (currentMode === 'custom_voice') {
        payload.speaker = speakerSelect.value;
        const inst = document.getElementById('cv-instruct').value.trim();
        if (inst) payload.instruct = inst;
    }
    else if (currentMode === 'voice_clone') {
        if (!base64ReferenceAudio) {
            alert("Debes subir un archivo de audio de referencia para clonar la voz.");
            return;
        }
        payload.ref_audio_base64 = base64ReferenceAudio;
        const refTx = document.getElementById('ref-text').value.trim();
        if (refTx) payload.ref_text = refTx;
    }
    else if (currentMode === 'voice_design') {
        const inst = document.getElementById('vd-instruct').value.trim();
        if (!inst) {
            alert("Debes ingresar una descripción de la voz para diseñarla.");
            return;
        }
        payload.instruct = inst;
    }

    showLoading();
    startProgressTimer(text.length);

    const backendUrl = backendUrlInput.value.replace(/\/$/, '');
    const apiToken = apiTokenInput?.value.trim() || '';

    setProgressStage(0);
    console.log(`  📡 Enviando a: ${backendUrl}`);

    try {
        setTimeout(() => setProgressStage(1), 800);
        setTimeout(() => setProgressStage(2), 4000);

        const fetchHeaders = {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true'
        };
        if (apiToken) fetchHeaders['Authorization'] = `Bearer ${apiToken}`;

        const response = await fetch(`${backendUrl}/generate_audio` || backendUrl, {
            method: 'POST',
            headers: fetchHeaders,
            body: JSON.stringify(payload)
        });

        setProgressStage(3);
        const data = await response.json();

        if (response.ok && data.success) {
            // ─── DEDUCT TOKENS ───
            await deductTokens(text.length, currentMode, qualitySelect.value);
            showSuccess(data.audio_base64, data.duration_seconds, data.model_used);
        } else {
            showError(data.detail || data.message || "Error desconocido devuelto por el servidor.");
        }
    } catch (error) {
        showError("Error de conexión. Verifica que la URL del servidor sea correcta y esté activo.");
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
