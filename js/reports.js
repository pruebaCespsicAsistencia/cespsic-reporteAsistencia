// Variables globales
let isAuthenticated = false;
let currentUser = null;
let userRole = null; // 'admin' o 'user'
let attendanceData = [];
let pdfBlob = null;
let usersList = []; // Lista de usuarios para admins
let selectedSortOrder = ''; // Criterio de ordenamiento seleccionado

// CONFIGURACIÓN
const GOOGLE_CLIENT_ID = '799841037062-kal4vump3frc2f8d33bnp4clc9amdnng.apps.googleusercontent.com';
const SHEET_ID = '146Q1MG0AUCnzacqrN5kBENRuiql8o07Uts-l_gimL2I';
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyN49EgjqFoE4Gwos_gnu5lM5XERnGfKejEcI-eVuxb68EgJ4wes2DAorINEZ9xVCI/exec';

// Usuarios administradores
const ADMIN_USERS = [
    'jose.lino.flores.madrigal@gmail.com',
    'cepsic.atencionpsicologica@gmail.com',
    'adymadrid.22@gmail.com',
    'cespsic@uas.edu.mx'
];

let authenticationAttempts = 0;
const MAX_AUTH_ATTEMPTS = 3;

// Inicializar aplicación
document.addEventListener('DOMContentLoaded', function() {
    console.log('=== DOM CARGADO ===');
    console.log('CESPSIC Reportes v.3.0 - Sistema Multi-Rol');
    console.log('Fecha/hora:', new Date().toISOString());
    
    initializeApp();
});

function initializeApp() {
    console.log('=== INICIANDO APLICACIÓN CESPSIC REPORTES v.3.0 ===');
    console.log('MODO: Multi-rol (Administradores y Usuarios)');
    
    const container = document.getElementById('signin-button-container');
    if (!container) {
        console.error('ERROR: Contenedor signin-button-container no encontrado');
        return;
    }
    
    showLoadingMessage('Iniciando sistema de autenticación...');
    setupEventListeners();
    setMaxDate();
    initializeGoogleSignInWithRetry();
    
    console.log('Configuración:');
    console.log('- Client ID:', GOOGLE_CLIENT_ID ? 'Configurado' : 'NO CONFIGURADO');
    console.log('- Script URL:', GOOGLE_SCRIPT_URL ? 'Configurado' : 'NO CONFIGURADO');
    console.log('- Administradores:', ADMIN_USERS.length);
}

function showLoadingMessage(message) {
    const container = document.getElementById('signin-button-container');
    container.innerHTML = `
        <div style="text-align: center; padding: 20px; color: #666;">
            <div style="display: inline-block; animation: spin 1s linear infinite; margin-right: 10px;">??</div>
            ${message}
        </div>
        <style>
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
    `;
}

function initializeGoogleSignInWithRetry() {
    let attempts = 0;
    const maxAttempts = 15;
    
    function tryInitialize() {
        attempts++;
        console.log(`Intento ${attempts}/${maxAttempts} - Inicializando Google Sign-In...`);
        
        if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
            console.log('? Google Sign-In API disponible');
            initializeGoogleSignIn();
        } else if (attempts < maxAttempts) {
            console.log('? Google API no disponible, reintentando...');
            setTimeout(tryInitialize, 1000);
        } else {
            console.error('? Google Sign-In no se pudo cargar');
            showAuthenticationError('No se pudo cargar el sistema de autenticación de Google');
        }
    }
    
    tryInitialize();
}

function initializeGoogleSignIn() {
    try {
        console.log('?? Configurando Google Sign-In...');
        
        google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleCredentialResponse,
            auto_select: false,
            cancel_on_tap_outside: true,
            use_fedcm_for_prompt: false
        });

        const container = document.getElementById("signin-button-container");
        container.innerHTML = '';
        
        google.accounts.id.renderButton(container, {
            theme: "filled_blue",
            size: "large",
            text: "signin_with",
            shape: "rectangular",
            logo_alignment: "left",
            width: "280",
            locale: "es"
        });

        console.log('? Google Sign-In inicializado correctamente');
        setTimeout(checkBackendAvailability, 2000);

    } catch (error) {
        console.error('? Error inicializando Google Sign-In:', error);
        showAuthenticationError('Error configurando sistema de autenticación: ' + error.message);
    }
}

async function checkBackendAvailability() {
    try {
        console.log('?? Verificando disponibilidad del backend...');
        
        const response = await fetchWithTimeout(GOOGLE_SCRIPT_URL + '?action=test_permissions', 10000);
        
        if (response.ok) {
            console.log('? Backend disponible');
            showStatus('Sistema listo para su uso', 'success');
            setTimeout(() => hideStatus(), 3000);
        } else {
            console.warn('?? Backend no responde correctamente');
            showStatus('Advertencia: Conexión con backend limitada', 'error');
        }
        
    } catch (error) {
        console.warn('?? No se pudo verificar backend:', error.message);
        showStatus('Advertencia: Verificación de backend falló', 'error');
    }
}

async function handleCredentialResponse(response) {
    try {
        authenticationAttempts++;
        console.log(`?? Procesando autenticación (intento ${authenticationAttempts})...`);
        
        if (authenticationAttempts > MAX_AUTH_ATTEMPTS) {
            showStatus('Demasiados intentos de autenticación. Recargue la página.', 'error');
            return;
        }
        
        const userInfo = parseJwt(response.credential);
        
        if (!userInfo) {
            throw new Error('No se pudo procesar la información del usuario');
        }
        
        console.log('?? Usuario detectado:', userInfo.email);
        
        // TODOS LOS USUARIOS VERIFICADOS PUEDEN ACCEDER
        if (!userInfo.email_verified) {
            showStatus('? Cuenta no verificada. Use una cuenta de Gmail verificada.', 'error');
            return;
        }
        
        // Configurar usuario
        currentUser = {
            id: userInfo.sub,
            email: userInfo.email,
            name: userInfo.name,
            picture: userInfo.picture,
            email_verified: userInfo.email_verified
        };

        isAuthenticated = true;
        
        // Verificar rol en el backend
        await checkUserRole();
        
        console.log('? Autenticación exitosa para:', currentUser.name);
        console.log('?? Rol del usuario:', userRole);
        
        updateAuthenticationUI();
        enableForm();
        
        // Si es admin, cargar lista de usuarios con fechas iniciales
        if (currentUser.isAdmin) {
            const fechaDesde = document.getElementById('fecha_desde').value;
            const fechaHasta = document.getElementById('fecha_hasta').value;
            await loadUsersList(fechaDesde, fechaHasta);
        }
        
        // Mensaje según el rol
        const roleMessage = userRole === 'admin' 
            ? `Bienvenido Administrador ${currentUser.name}! Puede ver todos los registros.`
            : `Bienvenido ${currentUser.name}! Puede ver sus propios registros.`;
        
        showStatus(roleMessage, 'success');
        setTimeout(() => hideStatus(), 5000);

    } catch (error) {
        console.error('? Error procesando credenciales:', error);
        showStatus('Error en la autenticación: ' + error.message, 'error');
    }
}

async function checkUserRole() {
    try {
        console.log('?? Verificando rol del usuario...');
        
        const result = await makeBackendRequest('check_user_role', {});
        
        if (result.success) {
            userRole = result.role;
            console.log(`? Rol verificado: ${userRole} (Admin: ${result.isAdmin})`);
            
            // Guardar información adicional del rol
            currentUser.isAdmin = result.isAdmin;
            currentUser.permissions = result.permissions;
            
            return result;
        } else {
            console.warn('?? No se pudo verificar el rol, asumiendo usuario normal');
            userRole = 'Usuario';
            currentUser.isAdmin = false;
        }
        
    } catch (error) {
        console.error('? Error verificando rol:', error);
        userRole = 'Usuario';
        currentUser.isAdmin = false;
    }
}

async function loadUsersList(fechaDesde = null, fechaHasta = null) {
    try {
        console.log('?? Cargando lista de usuarios (solo admin)...');
        if (fechaDesde && fechaHasta) {
            console.log(`?? Filtrando por rango: ${fechaDesde} al ${fechaHasta}`);
        }
        
        const params = fechaDesde && fechaHasta ? {
            fechaDesde: fechaDesde,
            fechaHasta: fechaHasta
        } : {};
        
        const result = await makeBackendRequest('get_users_list', params);
        
        if (result.success) {
            usersList = result.users || [];
            console.log(`? Lista de usuarios cargada: ${usersList.length} usuarios`);
            if (result.dateRange) {
                console.log(`   (En rango ${result.dateRange.desde} - ${result.dateRange.hasta})`);
            }
            updateAdminControls();
        } else {
            console.error('? Error cargando usuarios:', result.message);
            usersList = [];
            updateAdminControls();
        }
        
    } catch (error) {
        console.error('? Error cargando lista de usuarios:', error);
        usersList = [];
        updateAdminControls();
    }
}

function updateAdminControls() {
    // Mostrar/ocultar controles según el rol
    const adminControls = document.getElementById('admin-controls');
    const adminEvidenciasControl = document.getElementById('admin-evidencias-control');
    
    if (adminControls) {
        if (currentUser.isAdmin) {
            adminControls.style.display = 'block';
            
            // Mostrar checkbox de evidencias solo para admins
            if (adminEvidenciasControl) {
                adminEvidenciasControl.style.display = 'block';
            }
            
            // Llenar el combo de usuarios
            const userSelect = document.getElementById('filtro_usuario');
            if (userSelect) {
                // Guardar el valor actual si existe
                const currentValue = userSelect.value;
                
                userSelect.innerHTML = '<option value="">Todos los usuarios</option>';
                
                if (usersList.length === 0) {
                    const optionNoUsers = document.createElement('option');
                    optionNoUsers.value = '';
                    optionNoUsers.textContent = '(No hay usuarios en este rango de fechas)';
                    optionNoUsers.disabled = true;
                    userSelect.appendChild(optionNoUsers);
                } else {
                    usersList.forEach(user => {
                        const option = document.createElement('option');
                        option.value = user.email;
                        option.textContent = user.nombre;
                        userSelect.appendChild(option);
                    });
                }
                
                // Restaurar el valor anterior si existe en la nueva lista
                if (currentValue && usersList.some(u => u.email === currentValue)) {
                    userSelect.value = currentValue;
                } else {
                    userSelect.value = ''; // Todos los usuarios por defecto
                }
            }
            
            // Establecer valor por defecto en combo de ordenamiento
            const ordenarSelect = document.getElementById('ordenar_por');
            if (ordenarSelect && !ordenarSelect.value) {
                ordenarSelect.value = 'nombre'; // Por defecto ordenar por nombre para admins
            }
        } else {
            adminControls.style.display = 'none';
            
            // Ocultar checkbox de evidencias para usuarios normales
            if (adminEvidenciasControl) {
                adminEvidenciasControl.style.display = 'none';
                
                // Desmarcar el checkbox si estaba marcado
                const evidenciasSoloCheckbox = document.getElementById('incluir_evidencias_solo');
                if (evidenciasSoloCheckbox && evidenciasSoloCheckbox.checked) {
                    evidenciasSoloCheckbox.checked = false;
                    updateCheckboxStyles();
                }
            }
        }
    }
}

async function makeBackendRequest(action, additionalData = {}) {
    const requestData = {
        action: action,
        userEmail: currentUser.email,
        timestamp: new Date().toISOString(),
        ...additionalData
    };
    
    console.log('?? Enviando solicitud al backend:', action);
    
    try {
        const jsonpResponse = await fetchWithJSONP(GOOGLE_SCRIPT_URL, requestData);
        if (jsonpResponse && jsonpResponse.success !== undefined) {
            console.log('? Respuesta JSONP exitosa');
            return jsonpResponse;
        }
    } catch (jsonpError) {
        console.log('?? JSONP falló:', jsonpError.message);
    }
    
    try {
        const response = await fetchWithTimeout(GOOGLE_SCRIPT_URL, 30000, {
            method: 'POST',
            mode: 'cors',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('? Respuesta POST exitosa');
            return result;
        } else {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
    } catch (fetchError) {
        console.log('?? Fetch POST falló:', fetchError.message);
        throw new Error('No se pudo conectar con el servidor: ' + fetchError.message);
    }
}

async function fetchWithJSONP(url, data, timeout = 30000) {
    return new Promise((resolve, reject) => {
        const callbackName = 'jsonp_callback_' + Math.round(100000 * Math.random());
        
        const script = document.createElement('script');
        const params = new URLSearchParams({
            ...data,
            callback: callbackName
        });
        
        window[callbackName] = function(response) {
            cleanup();
            resolve(response);
        };
        
        function cleanup() {
            delete window[callbackName];
            if (script.parentNode) {
                script.parentNode.removeChild(script);
            }
        }
        
        const timeoutId = setTimeout(() => {
            cleanup();
            reject(new Error('Timeout: No se recibió respuesta del servidor'));
        }, timeout);
        
        script.onload = () => clearTimeout(timeoutId);
        script.onerror = () => {
            cleanup();
            clearTimeout(timeoutId);
            reject(new Error('Error cargando script del servidor'));
        };
        
        script.src = `${url}?${params.toString()}`;
        document.head.appendChild(script);
    });
}

async function fetchWithTimeout(url, timeout = 10000, options = {}) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (error) {
        console.error('Error parsing JWT:', error);
        return null;
    }
}

function updateAuthenticationUI() {
    const authSection = document.getElementById('auth-section');
    const authTitle = document.getElementById('auth-title');
    const userInfo = document.getElementById('user-info');
    const signinContainer = document.getElementById('signin-button-container');

    if (isAuthenticated && currentUser) {
        authSection.classList.add('authenticated');
        
        // Título diferente según el rol
        const roleIcon = currentUser.isAdmin ? '??' : '?';
        const roleText = currentUser.isAdmin ? 'Administrador' : 'Usuario';
        authTitle.textContent = `${roleIcon} Acceso Autorizado - ${roleText}`;
        authTitle.classList.add('authenticated');

        document.getElementById('user-avatar').src = currentUser.picture;
        document.getElementById('user-email').textContent = currentUser.email;
        document.getElementById('user-name').textContent = currentUser.name;
        
        // Actualizar status con el rol
        const userStatus = document.getElementById('user-status');
        userStatus.textContent = currentUser.isAdmin ? '?? Administrador' : '? Usuario Autorizado';
        userStatus.style.background = currentUser.isAdmin ? '#fff3cd' : '#d4edda';
        userStatus.style.color = currentUser.isAdmin ? '#856404' : '#155724';
        
        userInfo.classList.add('show');
        signinContainer.style.display = 'none';
    } else {
        authSection.classList.remove('authenticated');
        authTitle.textContent = '?? Autenticación Requerida';
        authTitle.classList.remove('authenticated');
        userInfo.classList.remove('show');
        signinContainer.style.display = 'block';
    }
}

function enableForm() {
    const formContainer = document.getElementById('form-container');
    formContainer.classList.add('authenticated');
    updateSubmitButton();
    updateFormDescription();
    updateAdminControls();
}

function disableForm() {
    const formContainer = document.getElementById('form-container');
    formContainer.classList.remove('authenticated');
    updateSubmitButton();
}

function updateFormDescription() {
    const description = document.querySelector('.form-description');
    if (description && currentUser) {
        if (currentUser.isAdmin) {
            description.innerHTML = `
                <strong>?? Modo Administrador:</strong> Puede generar reportes con todos los registros del sistema o filtrar por usuario específico.
                <br>Seleccione el rango de fechas y los usuarios disponibles se actualizarán automáticamente.
                <br><strong>?? Función exclusiva:</strong> Tiene acceso al modo "Solo Evidencias de Salida" para filtrar registros con links.
                <br><strong>?? Ordenamiento por defecto:</strong> Nombre (puede cambiarlo en los controles de administrador).
            `;
            description.style.borderLeftColor = '#ffc107';
        } else {
            description.innerHTML = `
                <strong>?? Modo Usuario:</strong> Puede generar reportes solo con sus propios registros.
                <br>Seleccione el rango de fechas para ver su información personal de asistencias.
                <br><strong>?? Sus registros se ordenarán cronológicamente por fecha.</strong>
            `;
            description.style.borderLeftColor = '#667eea';
        }
    }
}

function updateSubmitButton() {
    const submitBtn = document.getElementById('submit_btn');
    
    if (!isAuthenticated) {
        submitBtn.disabled = true;
        submitBtn.textContent = '?? Autentíquese primero para generar reporte';
    } else {
        submitBtn.disabled = false;
        const buttonText = currentUser.isAdmin 
            ? '?? Generar Reporte PDF (Todos los usuarios)'
            : '?? Generar Mi Reporte PDF';
        submitBtn.innerHTML = buttonText;
    }
}

function showAuthenticationError(message) {
    const container = document.getElementById("signin-button-container");
    container.innerHTML = `
        <div style="background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 8px; padding: 15px; color: #721c24;">
            <strong>? Error de Autenticación</strong><br>
            ${message}
            <div style="margin-top: 15px;">
                <button onclick="location.reload()" style="background: #dc3545; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                    ?? Recargar Página
                </button>
            </div>
        </div>
    `;
}

function signOut() {
    try {
        if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
            google.accounts.id.disableAutoSelect();
        }
        
        isAuthenticated = false;
        currentUser = null;
        userRole = null;
        attendanceData = [];
        pdfBlob = null;
        authenticationAttempts = 0;

        updateAuthenticationUI();
        disableForm();
        closeModal();

        showStatus('Sesión cerrada correctamente.', 'success');
        setTimeout(() => {
            hideStatus();
            setTimeout(() => initializeGoogleSignIn(), 1000);
        }, 2000);

    } catch (error) {
        console.error('Error cerrando sesión:', error);
        showStatus('Error al cerrar sesión.', 'error');
    }
}

// ========== FORM HANDLING ==========

function setMaxDate() {
    const todayInCuliacan = new Date().toLocaleDateString('en-CA', {
        timeZone: 'America/Mazatlan'
    });
    
    document.getElementById('fecha_hasta').max = todayInCuliacan;
    document.getElementById('fecha_hasta').value = todayInCuliacan;
    
    const today = new Date(todayInCuliacan);
    const oneMonthAgo = new Date(today);
    oneMonthAgo.setMonth(today.getMonth() - 1);
    const oneMonthAgoStr = oneMonthAgo.toISOString().split('T')[0];
    document.getElementById('fecha_desde').value = oneMonthAgoStr;
    
    console.log('Fechas configuradas para Culiacán, Sinaloa');
}

function setupEventListeners() {
    document.getElementById('fecha_desde').addEventListener('change', handleDateChange);
    document.getElementById('fecha_hasta').addEventListener('change', handleDateChange);
    document.getElementById('reportForm').addEventListener('submit', handleFormSubmit);
    setupCheckboxListeners();
}

async function handleDateChange() {
    // Validar fechas primero
    if (!validateDates()) {
        return;
    }
    
    // Si es admin y las fechas son válidas, actualizar lista de usuarios
    if (currentUser && currentUser.isAdmin) {
        const fechaDesde = document.getElementById('fecha_desde').value;
        const fechaHasta = document.getElementById('fecha_hasta').value;
        
        if (fechaDesde && fechaHasta) {
            console.log('?? Fechas cambiadas, actualizando lista de usuarios...');
            await loadUsersList(fechaDesde, fechaHasta);
        }
    }
}

function setupCheckboxListeners() {
    const otherCheckboxes = [
        'incluir_intervenciones', 
        'incluir_actividades', 
        'incluir_evidencias', 
        'incluir_comentarios', 
        'incluir_permisos'
    ];
    
    otherCheckboxes.forEach(id => {
        const checkbox = document.getElementById(id);
        if (checkbox) {
            checkbox.addEventListener('change', function() {
                if (this.checked) {
                    const evidenciasSolo = document.getElementById('incluir_evidencias_solo');
                    if (evidenciasSolo.checked) {
                        evidenciasSolo.checked = false;
                        updateCheckboxStyles();
                    }
                }
            });
        }
    });
}

function handleEvidenciasChange(checkbox) {
    const isChecked = checkbox.checked;
    
    const otherCheckboxes = [
        'incluir_intervenciones', 
        'incluir_actividades', 
        'incluir_evidencias', 
        'incluir_comentarios', 
        'incluir_permisos'
    ];
    
    if (isChecked) {
        otherCheckboxes.forEach(id => {
            const cb = document.getElementById(id);
            if (cb) {
                cb.checked = false;
            }
        });
        
        showStatus('Modo "Solo Evidencias de Salida" activado. Se filtrarán únicamente registros de SALIDA con links clickeables.', 'loading');
        setTimeout(() => hideStatus(), 6000);
    }
    
    updateCheckboxStyles();
}

window.handleEvidenciasChange = handleEvidenciasChange;

function updateCheckboxStyles() {
    const evidenciasSolo = document.getElementById('incluir_evidencias_solo');
    const evidenciasItem = document.querySelector('.checkbox-evidencias');
    
    if (evidenciasSolo.checked) {
        evidenciasItem.style.background = '#e8f5e8';
        evidenciasItem.style.borderColor = '#4caf50';
        evidenciasItem.style.boxShadow = '0 2px 8px rgba(76, 175, 80, 0.2)';
    } else {
        evidenciasItem.style.background = '';
        evidenciasItem.style.borderColor = '';
        evidenciasItem.style.boxShadow = '';
    }
}

function validateDates() {
    const fechaDesde = document.getElementById('fecha_desde').value;
    const fechaHasta = document.getElementById('fecha_hasta').value;
    const today = new Date().toISOString().split('T')[0];
    
    if (fechaHasta > today) {
        showStatus('La fecha hasta no puede ser mayor al día actual.', 'error');
        document.getElementById('fecha_hasta').value = today;
        return false;
    }
    
    if (fechaDesde && fechaHasta && fechaDesde > fechaHasta) {
        showStatus('La fecha desde no puede ser mayor a la fecha hasta.', 'error');
        document.getElementById('fecha_desde').value = fechaHasta;
        return false;
    }
    
    hideStatus();
    return true;
}

async function handleFormSubmit(e) {
    e.preventDefault();
    
    if (!isAuthenticated || !currentUser) {
        showStatus('Debe autenticarse antes de generar reportes.', 'error');
        return;
    }
    
    const fechaDesde = document.getElementById('fecha_desde').value;
    const fechaHasta = document.getElementById('fecha_hasta').value;
    
    if (!fechaDesde || !fechaHasta) {
        showStatus('Por favor, seleccione ambas fechas (desde y hasta).', 'error');
        return;
    }
    
    if (!validateDates()) {
        return;
    }
    
    const checkboxes = document.querySelectorAll('input[name="incluir_campos[]"]:checked');
    if (checkboxes.length === 0) {
        showStatus('Debe seleccionar al menos un campo para incluir en el reporte.', 'error');
        return;
    }
    
    const selectedFields = Array.from(checkboxes).map(cb => cb.nextElementSibling.textContent.split('(')[0].trim());
    const filtroTipo = document.getElementById('filtro_tipo').value;
    const filtroModalidad = document.getElementById('filtro_modalidad').value;
    const incluirCampos = getSelectedFields();
    const isModoEvidencias = incluirCampos.includes('evidencias_solo');
    
    // Información adicional para admins
    const filtroUsuario = currentUser.isAdmin ? (document.getElementById('filtro_usuario')?.value || '') : '';
    const ordenarPor = currentUser.isAdmin ? (document.getElementById('ordenar_por')?.value || '') : '';
    const usuarioNombre = filtroUsuario && usersList.length > 0 
        ? usersList.find(u => u.email === filtroUsuario)?.nombre || filtroUsuario
        : '';
    
    const userRoleText = currentUser.isAdmin 
        ? (filtroUsuario ? `Usuario: ${usuarioNombre}` : 'Todos los usuarios')
        : 'Solo sus registros';
    
    let confirmMessage = `¿Está seguro de que desea generar el reporte?

Período: ${fechaDesde} al ${fechaHasta}
Ámbito: ${userRoleText}
Campos: ${selectedFields.join(', ')}`;
    
    if (isModoEvidencias) {
        confirmMessage += `\nModo: Solo evidencias de SALIDA`;
    }
    if (filtroTipo) confirmMessage += `\nTipo: ${filtroTipo}`;
    if (filtroModalidad) confirmMessage += `\nModalidad: ${filtroModalidad}`;
    if (currentUser.isAdmin && ordenarPor) {
        const ordenTexto = {
            'nombre': 'Nombre',
            'fecha': 'Fecha',
            'tipo_estudiante': 'Tipo de Estudiante',
            'modalidad': 'Modalidad',
            'tipo_registro': 'Tipo de Registro'
        };
        confirmMessage += `\nOrden: ${ordenTexto[ordenarPor] || ordenarPor}`;
    } else if (!currentUser.isAdmin) {
        confirmMessage += `\nOrden: Fecha (automático)`;
    }
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    showStatus('Conectando con Google Sheets...', 'loading');
    const submitBtn = document.getElementById('submit_btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Conectando...';
    
    try {
        await fetchAttendanceData(fechaDesde, fechaHasta);
        
        if (!attendanceData || attendanceData.length === 0) {
            const noDataMessage = currentUser.isAdmin
                ? 'No se encontraron registros en el rango de fechas seleccionado.'
                : 'No se encontraron registros suyos en el rango de fechas seleccionado.';
            
            showStatus(
                isModoEvidencias 
                    ? noDataMessage + ' (Modo evidencias de salida activo)'
                    : noDataMessage + ' Intente ampliar el rango de fechas.',
                'error'
            );
            updateSubmitButton();
            return;
        }
        
        showStatus(`Generando PDF con ${attendanceData.length} registros...`, 'loading');
        submitBtn.textContent = 'Generando PDF...';
        
        await generatePDF(fechaDesde, fechaHasta);
        
        showDownloadModal(fechaDesde, fechaHasta);
        hideStatus();
        updateSubmitButton();
        
    } catch (error) {
        console.error('Error generando reporte:', error);
        
        let errorMessage = 'Error al generar el reporte: ';
        
        if (error.message.includes('conectar con Google Sheets')) {
            errorMessage += 'No se pudo conectar con Google Sheets. Verifique su conexión.';
        } else if (error.message.includes('No se pudieron obtener los datos del servidor')) {
            errorMessage += 'El servidor no pudo procesar la solicitud. Intente nuevamente.';
        } else {
            errorMessage += error.message;
        }
        
        showStatus(errorMessage, 'error');
        updateSubmitButton();
    }
}

async function fetchAttendanceData(fechaDesde, fechaHasta) {
    console.log('=== OBTENIENDO DATOS DE ASISTENCIA ===');
    console.log('Usuario:', currentUser.email);
    console.log('Rol:', userRole);
    
    try {
        const incluirCampos = getSelectedFields();
        const isModoEvidencias = incluirCampos.includes('evidencias_solo');
        
        // Obtener valores de los filtros admin
        let filtroUsuario = '';
        let ordenarPor = '';
        
        if (currentUser.isAdmin) {
            filtroUsuario = document.getElementById('filtro_usuario')?.value || '';
            ordenarPor = document.getElementById('ordenar_por')?.value || 'nombre'; // Por defecto nombre para admins
        } else {
            // Usuarios normales: ordenar por fecha por defecto
            ordenarPor = 'fecha';
        }
        
        // Guardar el criterio de ordenamiento para usarlo en el PDF
        selectedSortOrder = ordenarPor;
        
        console.log('Filtro usuario:', filtroUsuario || '(todos)');
        console.log('Ordenar por:', ordenarPor);
        
        const result = await makeBackendRequest('get_attendance_data', {
            fechaDesde: fechaDesde,
            fechaHasta: fechaHasta,
            filtroTipo: document.getElementById('filtro_tipo').value,
            filtroModalidad: document.getElementById('filtro_modalidad').value,
            filtroTipoRegistro: isModoEvidencias ? 'salida' : '',
            modoEvidencias: isModoEvidencias,
            filtroUsuario: filtroUsuario,
            ordenarPor: ordenarPor
        });
        
        if (result.success && result.data) {
            if (result.dataSource === 'sample_data') {
                throw new Error('No se pudo conectar con Google Sheets. Verifique la conexión y permisos.');
            }
            
            attendanceData = result.data;
            
            if (isModoEvidencias) {
                attendanceData = attendanceData.filter(record => 
                    record.tipo_registro && record.tipo_registro.toLowerCase() === 'salida'
                );
                console.log(`Modo evidencias activo - Filtrando solo "salidas": ${attendanceData.length} registros`);
            }
            
            console.log(`Datos obtenidos: ${attendanceData.length} registros (Rol: ${result.userRole})`);
        } else {
            throw new Error(result.message || 'No se pudieron obtener los datos del servidor');
        }
        
    } catch (error) {
        console.error('Error obteniendo datos:', error);
        attendanceData = [];
        throw new Error('Error de conexión: ' + error.message);
    }
}

// ========== PDF GENERATION ==========
async function generatePDF(fechaDesde, fechaHasta) {
    const { jsPDF } = window.jspdf;
    // Cambiar a tamaño Legal (landscape)
    const doc = new jsPDF('l', 'mm', 'legal');
    
    // Usar Times como alternativa a Georgia
    doc.setFont('times');
    addPDFHeader(doc, fechaDesde, fechaHasta);
    
    const tableData = prepareTableData();
    const incluirCampos = getSelectedFields();
    const isModoEvidencias = incluirCampos.includes('evidencias_solo');
    
    if (isModoEvidencias) {
        const headers = getTableHeaders();
        const processedData = [];
        
        tableData.forEach(row => {
            const newRow = [...row];
            if (row[8] && typeof row[8] === 'string' && row[8].includes('https://')) {
                newRow[8] = row[8];
            } else {
                newRow[8] = row[8] || 'Sin links disponibles';
            }
            processedData.push(newRow);
        });
        
        doc.autoTable({
            head: [headers],
            body: processedData,
            startY: 40,
            styles: {
                fontSize: 8,
                font: 'times',
                cellPadding: 1.5,
                lineColor: [200, 200, 200],
                lineWidth: 0.1
            },
            headStyles: {
                fillColor: [102, 126, 234],
                textColor: 255,
                fontStyle: 'bold',
                fontSize: 8
            },
            alternateRowStyles: {
                fillColor: [248, 249, 250]
            },
            columnStyles: {
                0: { cellWidth: 50 }, // Nombre Completo - más ancho
                1: { cellWidth: 25 }, // Tipo Estudiante
                2: { cellWidth: 22 }, // Modalidad
                3: { cellWidth: 22 }, // Fecha
                4: { cellWidth: 15 }, // Hora
                5: { cellWidth: 20 }, // Tipo Registro
                6: { cellWidth: 40 }, // Nombres Evidencias
                7: { cellWidth: 35 }, // Carpeta
                8: { 
                    cellWidth: 50,
                    fontSize: 7,
                    textColor: [0, 0, 255]
                } // Links
            },
            didDrawCell: function(data) {
                if (data.column.index === 8 && data.section === 'body') {
                    const cellContent = processedData[data.row.index][8];
                    
                    if (cellContent && cellContent.includes('https://')) {
                        const linksData = parseLinksFromGeneratedText(cellContent);
                        
                        linksData.forEach((linkData, index) => {
                            if (linkData.url) {
                                const linkY = data.cell.y + (index * 3) + 3;
                                
                                doc.link(
                                    data.cell.x + 1,
                                    linkY - 1,
                                    data.cell.width - 2,
                                    3,
                                    { url: linkData.url }
                                );
                            }
                        });
                    }
                }
            }
        });
        
    } else {
        // Calcular anchos de columna dinámicamente según el orden
        const columnWidths = calculateColumnWidths(selectedSortOrder, incluirCampos);
        
        doc.autoTable({
            head: [getTableHeaders()],
            body: tableData,
            startY: 40,
            styles: {
                fontSize: 8,
                font: 'times',
                cellPadding: 1.5,
                lineColor: [200, 200, 200],
                lineWidth: 0.1
            },
            headStyles: {
                fillColor: [102, 126, 234],
                textColor: 255,
                fontStyle: 'bold',
                fontSize: 8
            },
            alternateRowStyles: {
                fillColor: [248, 249, 250]
            },
            columnStyles: columnWidths
        });
    }
    
    addPDFFooter(doc);
    pdfBlob = doc.output('blob');
}

function addPDFHeader(doc, fechaDesde, fechaHasta) {
    doc.setFontSize(16);
    doc.setFont('times', 'bold');
    doc.text('REPORTE DE ASISTENCIAS - CESPSIC', 178, 15, { align: 'center' }); // Centrado para Legal
    
    doc.setFontSize(12);
    doc.setFont('times', 'normal');
    doc.text(`Período: ${fechaDesde} al ${fechaHasta}`, 178, 25, { align: 'center' });
    
    // Información adicional para admins
    const filtroUsuario = currentUser.isAdmin ? (document.getElementById('filtro_usuario')?.value || '') : '';
    const usuarioNombre = filtroUsuario && usersList.length > 0 
        ? usersList.find(u => u.email === filtroUsuario)?.nombre || filtroUsuario
        : '';
    
    doc.setFontSize(9);
    let roleText = currentUser.isAdmin 
        ? (filtroUsuario ? `(Admin - Usuario: ${usuarioNombre})` : '(Administrador - Todos los registros)')
        : '(Usuario - Registros propios)';
    
    doc.text(`Generado por: ${currentUser.name} ${roleText}`, 10, 32);
    
    // Mostrar ordenamiento según el rol
    if (currentUser.isAdmin && selectedSortOrder) {
        const ordenTexto = {
            'nombre': 'Nombre',
            'fecha': 'Fecha',
            'tipo_estudiante': 'Tipo de Estudiante',
            'modalidad': 'Modalidad',
            'tipo_registro': 'Tipo de Registro'
        };
        doc.text(`Ordenado por: ${ordenTexto[selectedSortOrder] || selectedSortOrder}`, 270, 32);
    } else if (!currentUser.isAdmin) {
        doc.text(`Ordenado por: Fecha`, 270, 32);
    } else {
        doc.text(`Fecha: ${new Date().toLocaleString('es-MX')}`, 270, 32);
    }
    
    doc.text(`Total registros: ${attendanceData.length}`, 10, 37);
}

function addPDFFooter(doc) {
    const pageCount = doc.internal.getNumberOfPages();
    
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.text(
            `Página ${i} de ${pageCount} - CESPSIC`,
            178, // Ajustado para Legal
            205,
            { align: 'center' }
        );
    }
}

// Función para calcular anchos de columna según el orden seleccionado
function calculateColumnWidths(sortOrder, incluirCampos) {
    const widths = {};
    let colIndex = 0;
    
    // Tamaño de página Legal landscape: 355.6mm de ancho
    // Columnas básicas según orden
    const basicColumns = {
        nombre: 55,        // Nombre - más ancho
        fecha: 22,         // Fecha
        tipo_registro: 20, // Tipo Registro  
        modalidad: 22,     // Modalidad
        tipo_estudiante: 30, // Tipo Estudiante
        hora: 15           // Hora
    };
    
    // Asignar anchos según el orden seleccionado
    switch (sortOrder) {
        case 'nombre':
            widths[colIndex++] = { cellWidth: basicColumns.nombre };
            widths[colIndex++] = { cellWidth: basicColumns.fecha };
            widths[colIndex++] = { cellWidth: basicColumns.tipo_registro };
            widths[colIndex++] = { cellWidth: basicColumns.modalidad };
            widths[colIndex++] = { cellWidth: basicColumns.tipo_estudiante };
            widths[colIndex++] = { cellWidth: basicColumns.hora };
            break;
        case 'tipo_estudiante':
            widths[colIndex++] = { cellWidth: basicColumns.tipo_estudiante };
            widths[colIndex++] = { cellWidth: basicColumns.nombre };
            widths[colIndex++] = { cellWidth: basicColumns.fecha };
            widths[colIndex++] = { cellWidth: basicColumns.tipo_registro };
            widths[colIndex++] = { cellWidth: basicColumns.modalidad };
            widths[colIndex++] = { cellWidth: basicColumns.hora };
            break;
        case 'fecha':
            widths[colIndex++] = { cellWidth: basicColumns.fecha };
            widths[colIndex++] = { cellWidth: basicColumns.nombre };
            widths[colIndex++] = { cellWidth: basicColumns.tipo_registro };
            widths[colIndex++] = { cellWidth: basicColumns.tipo_estudiante };
            widths[colIndex++] = { cellWidth: basicColumns.modalidad };
            widths[colIndex++] = { cellWidth: basicColumns.hora };
            break;
        case 'modalidad':
            widths[colIndex++] = { cellWidth: basicColumns.modalidad };
            widths[colIndex++] = { cellWidth: basicColumns.nombre };
            widths[colIndex++] = { cellWidth: basicColumns.fecha };
            widths[colIndex++] = { cellWidth: basicColumns.tipo_registro };
            widths[colIndex++] = { cellWidth: basicColumns.tipo_estudiante };
            widths[colIndex++] = { cellWidth: basicColumns.hora };
            break;
        case 'tipo_registro':
            widths[colIndex++] = { cellWidth: basicColumns.tipo_registro };
            widths[colIndex++] = { cellWidth: basicColumns.nombre };
            widths[colIndex++] = { cellWidth: basicColumns.fecha };
            widths[colIndex++] = { cellWidth: basicColumns.modalidad };
            widths[colIndex++] = { cellWidth: basicColumns.tipo_estudiante };
            widths[colIndex++] = { cellWidth: basicColumns.hora };
            break;
        default:
            widths[colIndex++] = { cellWidth: basicColumns.nombre };
            widths[colIndex++] = { cellWidth: basicColumns.tipo_estudiante };
            widths[colIndex++] = { cellWidth: basicColumns.modalidad };
            widths[colIndex++] = { cellWidth: basicColumns.fecha };
            widths[colIndex++] = { cellWidth: basicColumns.hora };
            widths[colIndex++] = { cellWidth: basicColumns.tipo_registro };
    }
    
    // Columnas opcionales con anchos más pequeños
    if (incluirCampos.includes('intervenciones')) {
        widths[colIndex++] = { cellWidth: 14 }; // Interv.
        widths[colIndex++] = { cellWidth: 12 }; // Niños
        widths[colIndex++] = { cellWidth: 12 }; // Adoles.
        widths[colIndex++] = { cellWidth: 12 }; // Adult.
        widths[colIndex++] = { cellWidth: 12 }; // >60
        widths[colIndex++] = { cellWidth: 12 }; // Fam.
    }
    
    if (incluirCampos.includes('actividades')) {
        widths[colIndex++] = { cellWidth: 45 }; // Actividades
    }
    
    if (incluirCampos.includes('evidencias')) {
        widths[colIndex++] = { cellWidth: 15 }; // Total Ev.
    }
    
    if (incluirCampos.includes('comentarios')) {
        widths[colIndex++] = { cellWidth: 40 }; // Comentarios
    }
    
    if (incluirCampos.includes('permisos')) {
        widths[colIndex++] = { cellWidth: 30 }; // Det. Permiso
        widths[colIndex++] = { cellWidth: 30 }; // Det. Otro
    }
    
    return widths;
}

function getTableHeaders() {
    const incluirCampos = getSelectedFields();
    
    // Headers básicos según el orden seleccionado
    let basicHeaders = [];
    
    if (incluirCampos.includes('evidencias_solo')) {
        // Modo evidencias: orden fijo
        basicHeaders = ['Nombre Completo', 'Tipo Estudiante', 'Modalidad', 'Fecha', 'Hora', 'Tipo Registro'];
        basicHeaders.push('Nombres de Evidencias', 'Carpeta en Drive', 'Links a Archivos');
    } else {
        // Orden según criterio seleccionado
        switch (selectedSortOrder) {
            case 'nombre':
                basicHeaders = ['Nombre Completo', 'Fecha', 'Tipo Registro', 'Modalidad', 'Tipo Estudiante', 'Hora'];
                break;
            case 'tipo_estudiante':
                basicHeaders = ['Tipo Estudiante', 'Nombre Completo', 'Fecha', 'Tipo Registro', 'Modalidad', 'Hora'];
                break;
            case 'fecha':
                basicHeaders = ['Fecha', 'Nombre Completo', 'Tipo Registro', 'Tipo Estudiante', 'Modalidad', 'Hora'];
                break;
            case 'modalidad':
                basicHeaders = ['Modalidad', 'Nombre Completo', 'Fecha', 'Tipo Registro', 'Tipo Estudiante', 'Hora'];
                break;
            case 'tipo_registro':
                basicHeaders = ['Tipo Registro', 'Nombre Completo', 'Fecha', 'Modalidad', 'Tipo Estudiante', 'Hora'];
                break;
            default:
                basicHeaders = ['Nombre Completo', 'Tipo Estudiante', 'Modalidad', 'Fecha', 'Hora', 'Tipo Registro'];
        }
        
        // Agregar columnas opcionales con encabezados ABREVIADOS
        if (incluirCampos.includes('intervenciones')) {
            basicHeaders.push('Interv.', 'Niños', 'Adoles.', 'Adult.', '>60', 'Fam.');
        }
        if (incluirCampos.includes('actividades')) {
            basicHeaders.push('Actividades');
        }
        if (incluirCampos.includes('evidencias')) {
            basicHeaders.push('Total Ev.');
        }
        if (incluirCampos.includes('comentarios')) {
            basicHeaders.push('Comentarios');
        }
        if (incluirCampos.includes('permisos')) {
            basicHeaders.push('Det. Permiso', 'Det. Otro');
        }
    }
    
    return basicHeaders;
}

function prepareTableData() {
    const incluirCampos = getSelectedFields();
    
    return attendanceData.map(record => {
        const nombreCompleto = normalizeFullName(
            record.nombre || '',
            record.apellido_paterno || '',
            record.apellido_materno || ''
        );
        
        let row = [];
        
        if (incluirCampos.includes('evidencias_solo')) {
            // Modo evidencias: orden fijo
            row = [
                nombreCompleto,
                record.tipo_estudiante || '',
                record.modalidad || '',
                record.fecha || '',
                record.hora || '',
                record.tipo_registro || '',
                record.nombres_evidencias || 'Sin evidencias',
                record.carpeta_evidencias || 'Sin carpeta',
                record.links_evidencias || 'Sin links disponibles'
            ];
        } else {
            // Orden básico según criterio seleccionado
            switch (selectedSortOrder) {
                case 'nombre':
                    row = [
                        nombreCompleto,
                        record.fecha || '',
                        record.tipo_registro || '',
                        record.modalidad || '',
                        record.tipo_estudiante || '',
                        record.hora || ''
                    ];
                    break;
                case 'tipo_estudiante':
                    row = [
                        record.tipo_estudiante || '',
                        nombreCompleto,
                        record.fecha || '',
                        record.tipo_registro || '',
                        record.modalidad || '',
                        record.hora || ''
                    ];
                    break;
                case 'fecha':
                    row = [
                        record.fecha || '',
                        nombreCompleto,
                        record.tipo_registro || '',
                        record.tipo_estudiante || '',
                        record.modalidad || '',
                        record.hora || ''
                    ];
                    break;
                case 'modalidad':
                    row = [
                        record.modalidad || '',
                        nombreCompleto,
                        record.fecha || '',
                        record.tipo_registro || '',
                        record.tipo_estudiante || '',
                        record.hora || ''
                    ];
                    break;
                case 'tipo_registro':
                    row = [
                        record.tipo_registro || '',
                        nombreCompleto,
                        record.fecha || '',
                        record.modalidad || '',
                        record.tipo_estudiante || '',
                        record.hora || ''
                    ];
                    break;
                default:
                    row = [
                        nombreCompleto,
                        record.tipo_estudiante || '',
                        record.modalidad || '',
                        record.fecha || '',
                        record.hora || '',
                        record.tipo_registro || ''
                    ];
            }
            
            // Agregar columnas opcionales
            if (incluirCampos.includes('intervenciones')) {
                row.push(
                    record.intervenciones_psicologicas || '0',
                    record.ninos_ninas || '0',
                    record.adolescentes || '0',
                    record.adultos || '0',
                    record.mayores_60 || '0',
                    record.familia || '0'
                );
            }
            
            if (incluirCampos.includes('actividades')) {
                let actividades = record.actividades_realizadas || '';
                if (record.actividades_varias_detalle) {
                    actividades += (actividades ? ' | ' : '') + record.actividades_varias_detalle;
                }
                if (record.pruebas_psicologicas_detalle) {
                    actividades += (actividades ? ' | ' : '') + record.pruebas_psicologicas_detalle;
                }
                row.push(actividades);
            }
            
            if (incluirCampos.includes('evidencias')) {
                row.push(record.total_evidencias || '0');
            }
            
            if (incluirCampos.includes('comentarios')) {
                row.push(record.comentarios_adicionales || '');
            }
            
            if (incluirCampos.includes('permisos')) {
                row.push(
                    record.permiso_detalle || '',
                    record.otro_detalle || ''
                );
            }
        }
        
        return row;
    });
}

function normalizeFullName(nombre, apellidoPaterno, apellidoMaterno) {
    function capitalizeName(str) {
        if (!str) return '';
        return str.trim()
            .toLowerCase()
            .split(' ')
            .map(word => {
                if (word.length === 0) return '';
                return word.charAt(0).toUpperCase() + word.slice(1);
            })
            .join(' ');
    }
    
    const parts = [
        capitalizeName(nombre),
        capitalizeName(apellidoPaterno),
        capitalizeName(apellidoMaterno)
    ].filter(part => part !== '');
    
    return parts.join(' ');
}

function parseLinksFromGeneratedText(linksText) {
    const lines = linksText.split('\n');
    const linksData = [];
    
    lines.forEach(line => {
        if (line.includes('https://')) {
            const parts = line.split(': https://');
            if (parts.length === 2) {
                linksData.push({
                    fileName: parts[0].trim(),
                    url: 'https://' + parts[1].trim()
                });
            }
        }
    });
    
    return linksData;
}

function getSelectedFields() {
    const checkboxes = document.querySelectorAll('input[name="incluir_campos[]"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

// ========== MODAL FUNCTIONS ==========

function showDownloadModal(fechaDesde, fechaHasta) {
    const modal = document.getElementById('modal-overlay');
    const reportInfo = document.getElementById('report-info');
    
    const incluirCampos = getSelectedFields();
    const filtroTipo = document.getElementById('filtro_tipo').value;
    const filtroModalidad = document.getElementById('filtro_modalidad').value;
    
    // Información adicional para admins
    const filtroUsuario = currentUser.isAdmin ? (document.getElementById('filtro_usuario')?.value || '') : '';
    const ordenarPor = currentUser.isAdmin ? (document.getElementById('ordenar_por')?.value || '') : '';
    const usuarioNombre = filtroUsuario && usersList.length > 0 
        ? usersList.find(u => u.email === filtroUsuario)?.nombre || filtroUsuario
        : '';
    
    let roleInfo = '';
    if (currentUser.isAdmin) {
        if (filtroUsuario) {
            roleInfo = `<p><strong>?? Ámbito:</strong> Usuario específico - ${usuarioNombre}</p>`;
        } else {
            roleInfo = '<p><strong>?? Ámbito:</strong> Todos los usuarios del sistema</p>';
        }
    } else {
        roleInfo = '<p><strong>?? Ámbito:</strong> Solo sus registros personales</p>';
    }
    
    let ordenInfo = '';
    if (currentUser.isAdmin && ordenarPor) {
        const ordenTexto = {
            'nombre': 'Nombre',
            'fecha': 'Fecha',
            'tipo_estudiante': 'Tipo de Estudiante',
            'modalidad': 'Modalidad',
            'tipo_registro': 'Tipo de Registro'
        };
        ordenInfo = `<p><strong>?? Ordenado por:</strong> ${ordenTexto[ordenarPor] || ordenarPor}</p>`;
    } else if (!currentUser.isAdmin) {
        ordenInfo = `<p><strong>?? Ordenado por:</strong> Fecha (automático)</p>`;
    }
    
    reportInfo.innerHTML = `
        <h4>?? Resumen del Reporte</h4>
        <p><strong>Período:</strong> ${fechaDesde} al ${fechaHasta}</p>
        <p><strong>Total de registros:</strong> ${attendanceData.length}</p>
        ${roleInfo}
        ${ordenInfo}
        <p><strong>Campos incluidos:</strong> ${incluirCampos.join(', ')}</p>
        ${filtroTipo ? `<p><strong>Filtro tipo:</strong> ${filtroTipo}</p>` : ''}
        ${filtroModalidad ? `<p><strong>Filtro modalidad:</strong> ${filtroModalidad}</p>` : ''}
        <p><strong>Generado por:</strong> ${currentUser.name}</p>
        <p><strong>Fecha:</strong> ${new Date().toLocaleString('es-MX')}</p>
    `;
    
    const downloadBtn = document.getElementById('download-btn');
    downloadBtn.onclick = downloadPDF;
    
    modal.classList.add('show');
}

function closeModal() {
    const modal = document.getElementById('modal-overlay');
    modal.classList.remove('show');
}

function downloadPDF() {
    if (pdfBlob) {
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        const rolePrefix = currentUser.isAdmin ? 'Admin' : 'Usuario';
        a.download = `Reporte_${rolePrefix}_CESPSIC_${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showStatus('Reporte descargado exitosamente.', 'success');
        setTimeout(() => {
            hideStatus();
            closeModal();
        }, 2000);
    }
}

// ========== UTILITY FUNCTIONS ==========

function showStatus(message, type) {
    const status = document.getElementById('status');
    status.innerHTML = message;
    status.className = `status ${type}`;
    status.style.display = 'block';
}

function hideStatus() {
    const status = document.getElementById('status');
    status.style.display = 'none';
}
