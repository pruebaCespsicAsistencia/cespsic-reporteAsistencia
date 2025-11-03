/**
 * CESPSIC - Generador de Reportes de Asistencia
 * Frontend con Firebase Integration
 * Versión: 5.0 - Firebase Migration
 */

import { CONFIG, AUTH_CONFIG, CONNECTION_CONFIG, FIREBASE_FIELD_MAPPING, EXCEL_FIELD_ORDER } from './Config.js';
import { 
  initializeFirebase, 
  getAttendanceData, 
  getUsersInRange, 
  getUserNameByEmail,
  testFirebaseConnection 
} from './firebase-service.js';

// ========== VARIABLES GLOBALES ==========
let isAuthenticated = false;
let currentUser = null;
let attendanceData = [];
let pdfBlob = null;
let isAdmin = false;

// ========== INICIALIZACIÓN ==========
document.addEventListener('DOMContentLoaded', function() {
    console.log('=== DOM CARGADO ===');
    initializeApp();
});

async function initializeApp() {
    const container = document.getElementById('signin-button-container');
    if (!container) return;
    
    showLoadingMessage('Iniciando aplicación...');
    
    try {
        // Inicializar Firebase primero
        await initializeFirebase();
        console.log('✅ Firebase inicializado');
        
        // Configurar event listeners
        setupEventListeners();
        setMaxDate();
        
        // Inicializar Google Sign-In
        initializeGoogleSignInWithRetry();
        
        // Test de conexión Firebase
        setTimeout(checkFirebaseAvailability, 2000);
        
    } catch (error) {
        console.error('❌ Error inicializando app:', error);
        showAuthenticationError('Error de inicialización: ' + error.message);
    }
}

function showLoadingMessage(msg) {
    const container = document.getElementById('signin-button-container');
    if (container) {
        container.innerHTML = `
            <div style="text-align:center;padding:20px;color:#666;">
                <div style="display:inline-block;animation:spin 1s linear infinite;">🔄</div> 
                ${msg}
            </div>
            <style>@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}</style>
        `;
    }
}

function initializeGoogleSignInWithRetry() {
    let attempts = 0;
    function tryInit() {
        attempts++;
        if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
            initializeGoogleSignIn();
        } else if (attempts < 15) {
            setTimeout(tryInit, 1000);
        } else {
            showAuthenticationError('No se cargó Google Sign-In');
        }
    }
    tryInit();
}

function initializeGoogleSignIn() {
    try {
        google.accounts.id.initialize({
            client_id: AUTH_CONFIG.GOOGLE_CLIENT_ID,
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
        
    } catch (error) {
        showAuthenticationError('Error: ' + error.message);
    }
}

async function checkFirebaseAvailability() {
    try {
        const result = await testFirebaseConnection();
        if (result.success) {
            showStatus('✅ Sistema listo - Conectado a Firebase', 'success');
            setTimeout(() => hideStatus(), 3000);
        } else {
            showStatus('⚠️ Advertencia: ' + result.message, 'error');
        }
    } catch (error) {
        console.warn('Firebase warning:', error.message);
    }
}

// ========== AUTENTICACIÓN ==========
async function handleCredentialResponse(response) {
    try {
        const userInfo = parseJwt(response.credential);
        if (!userInfo) throw new Error('No se procesó usuario');
        
        if (!userInfo.email_verified) {
            showStatus('❌ Cuenta no verificada', 'error');
            return;
        }
        
        // Verificar si es administrador
        isAdmin = AUTH_CONFIG.ADMIN_USERS.includes(userInfo.email);
        
        currentUser = {
            id: userInfo.sub,
            email: userInfo.email,
            name: userInfo.name,
            picture: userInfo.picture,
            email_verified: userInfo.email_verified,
            isAdmin: isAdmin
        };
        
        isAuthenticated = true;
        updateAuthenticationUI();
        enableForm();
        
        if (isAdmin) {
            showAdminControls();
        } else {
            showRegularUserControls();
            // Cargar asistencias automáticamente para usuarios regulares
            setTimeout(() => {
                loadAndDisplayAttendance();
            }, 500);
        }
        
        showStatus(`✅ Bienvenido ${currentUser.name}!${isAdmin?' (Admin)':''}`, 'success');
        setTimeout(() => hideStatus(), 4000);
        
    } catch (error) {
        showStatus('❌ Error: ' + error.message, 'error');
    }
}

function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
            atob(base64).split('').map(c => 
                '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
            ).join('')
        );
        return JSON.parse(jsonPayload);
    } catch (error) {
        return null;
    }
}

// ========== CONTROL DE INTERFAZ ==========
function showAdminControls() {
    console.log('🔧 Configurando controles de administrador...');
    
    const adminSection = document.getElementById('admin-controls-section');
    if (adminSection) {
        adminSection.style.display = 'block';
    }
    
    const evidenciasCheckbox = document.querySelector('.checkbox-evidencias');
    if (evidenciasCheckbox) {
        evidenciasCheckbox.style.display = 'flex';
    }
    
    // Mostrar botones de reportes especiales (horas y Excel)
    const reportTypeSection = document.getElementById('report-type-section');
    if (reportTypeSection) {
        reportTypeSection.style.display = 'block';
    }
    
    setupAdminFilters();
}

function showRegularUserControls() {
    console.log('👤 Configurando controles de usuario regular...');
    
    const adminSection = document.getElementById('admin-controls-section');
    if (adminSection) {
        adminSection.style.display = 'none';
    }
    
    const evidenciasCheckbox = document.querySelector('.checkbox-evidencias');
    if (evidenciasCheckbox) {
        evidenciasCheckbox.style.display = 'none';
    }
    
    // Ocultar botones de reportes especiales
    const reportTypeSection = document.getElementById('report-type-section');
    if (reportTypeSection) {
        reportTypeSection.style.display = 'none';
    }
    
    setMaxDate();
    
    const attendanceSection = document.getElementById('attendance-view-section');
    if (attendanceSection) {
        attendanceSection.style.display = 'block';
    }
}

async function setupAdminFilters() {
    const fechaDesde = document.getElementById('fecha_desde');
    const fechaHasta = document.getElementById('fecha_hasta');
    if (fechaDesde && fechaHasta) {
        fechaDesde.addEventListener('change', updateUserFilter);
        fechaHasta.addEventListener('change', updateUserFilter);
    }
    updateUserFilter();
}

async function updateUserFilter() {
    if (!isAdmin) return;
    
    const fechaDesde = document.getElementById('fecha_desde').value;
    const fechaHasta = document.getElementById('fecha_hasta').value;
    const userSelect = document.getElementById('filtro_usuario');
    
    if (!fechaDesde || !fechaHasta || !userSelect) return;
    
    try {
        showStatus('Cargando usuarios...', 'loading');
        
        const users = await getUsersInRange(fechaDesde, fechaHasta);
        
        userSelect.innerHTML = '<option value="">Todos los usuarios</option>';
        users.forEach(user => {
            const option = document.createElement('option');
            option.value = user;
            option.textContent = user;
            userSelect.appendChild(option);
        });
        
        hideStatus();
        
    } catch (error) {
        console.error('Error cargando usuarios:', error);
        hideStatus();
    }
}

async function loadAndDisplayAttendance() {
    if (isAdmin) return;
    
    const fechaDesde = document.getElementById('fecha_desde').value;
    const fechaHasta = document.getElementById('fecha_hasta').value;
    
    if (!fechaDesde || !fechaHasta || !validateDates()) return;
    
    try {
        showStatus('Cargando asistencias...', 'loading');
        
        await fetchAttendanceDataFromFirebase();
        displayAttendanceOnScreen();
        
        hideStatus();
        
    } catch (error) {
        console.error('Error cargando asistencias:', error);
        showStatus('❌ Error al cargar asistencias', 'error');
        setTimeout(() => hideStatus(), 3000);
    }
}

function displayAttendanceOnScreen() {
    console.log('=== DISPLAY ATTENDANCE ===');
    
    if (isAdmin) {
        return;
    }
    
    const attendanceSection = document.getElementById('attendance-view-section');
    const attendanceSummary = document.getElementById('attendance-summary');
    const attendanceList = document.getElementById('attendance-list');
    
    if (!attendanceSection) return;
    
    if (!attendanceData || attendanceData.length === 0) {
        attendanceSection.style.display = 'block';
        attendanceSummary.innerHTML = '📊 Sin asistencias en este período';
        attendanceList.innerHTML = `
            <div class="no-attendance-message">
                <div class="icon">🔭</div>
                <p>No hay registros de asistencia para el período seleccionado.</p>
            </div>
        `;
        return;
    }
    
    attendanceSection.style.display = 'block';
    attendanceSummary.innerHTML = `📊 Total de asistencias: <strong>${attendanceData.length}</strong>`;
    
    let tableHTML = `
        <table class="attendance-table">
            <thead>
                <tr>
                    <th>Fecha</th>
                    <th>Hora</th>
                    <th>Tipo de Registro</th>
                    <th>Nombre</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    attendanceData.forEach(record => {
        const nombreCompleto = `${record.nombre || ''} ${record.apellidoPaterno || ''} ${record.apellidoMaterno || ''}`.trim();
        const fecha = record.fecha || '-';
        const hora = record.hora || '-';
        const tipoRegistro = record.tipoRegistro || '-';
        
        let registroClass = 'registro-otro';
        if (tipoRegistro.toLowerCase() === 'entrada') {
            registroClass = 'registro-entrada';
        } else if (tipoRegistro.toLowerCase() === 'salida') {
            registroClass = 'registro-salida';
        } else if (tipoRegistro.toLowerCase() === 'permiso') {
            registroClass = 'registro-permiso';
        }
        
        tableHTML += `
            <tr>
                <td>${fecha}</td>
                <td>${hora}</td>
                <td><span class="${registroClass}">${tipoRegistro}</span></td>
                <td>${nombreCompleto}</td>
            </tr>
        `;
    });
    
    tableHTML += `
            </tbody>
        </table>
    `;
    
    attendanceList.innerHTML = tableHTML;
}

// ========== OBTENCIÓN DE DATOS ==========
async function fetchAttendanceDataFromFirebase() {
    try {
        const fechaDesde = document.getElementById('fecha_desde').value;
        const fechaHasta = document.getElementById('fecha_hasta').value;
        
        const filters = {
            fechaDesde: fechaDesde,
            fechaHasta: fechaHasta,
            filtroTipo: document.getElementById('filtro_tipo').value,
            filtroModalidad: document.getElementById('filtro_modalidad').value,
            filtroTipoRegistro: '',
            filtroUsuario: ''
        };
        
        // Si es admin, agregar filtro de usuario si existe
        if (isAdmin) {
            const userFilter = document.getElementById('filtro_usuario');
            if (userFilter) {
                filters.filtroUsuario = userFilter.value;
            }
        }
        
        // Verificar si está en modo evidencias
        const incluirCampos = getSelectedFields();
        if (incluirCampos.includes('evidencias_solo')) {
            filters.filtroTipoRegistro = 'salida';
        }
        
        attendanceData = await getAttendanceData(currentUser.email, isAdmin, filters);
        
        // Ordenar si es necesario
        const ordenamiento = isAdmin ? (document.getElementById('orden_datos')?.value || 'nombre') : 'nombre';
        if (ordenamiento) {
            attendanceData = sortAttendanceData(attendanceData, ordenamiento);
        }
        
        console.log(`✅ Datos obtenidos: ${attendanceData.length} registros`);
        
    } catch (error) {
        console.error('❌ Error obteniendo datos:', error);
        attendanceData = [];
        throw error;
    }
}

function sortAttendanceData(data, ordenamiento) {
    const sorted = [...data];
    const getNombre = (r) => `${r.nombre || ''} ${r.apellidoPaterno || ''} ${r.apellidoMaterno || ''}`.trim().toLowerCase();
    
    const comparators = {
        nombre: (a, b) => getNombre(a).localeCompare(getNombre(b)) || (a.fecha || '').localeCompare(b.fecha || ''),
        fecha: (a, b) => (a.fecha || '').localeCompare(b.fecha || '') || getNombre(a).localeCompare(getNombre(b)),
        tipo_estudiante: (a, b) => (a.tipoEstudiante || '').localeCompare(b.tipoEstudiante || '') || (a.fecha || '').localeCompare(b.fecha || ''),
        modalidad: (a, b) => (a.modalidad || '').localeCompare(b.modalidad || '') || (a.fecha || '').localeCompare(b.fecha || ''),
        tipo_registro: (a, b) => (a.tipoRegistro || '').localeCompare(b.tipoRegistro || '') || (a.fecha || '').localeCompare(b.fecha || '')
    };
    
    sorted.sort(comparators[ordenamiento] || comparators.nombre);
    return sorted;
}

// Continúa en la siguiente parte...
// ========== CONTINUACIÓN reports.js - Parte 2 ==========

// ========== MANEJO DE FORMULARIO ==========
function setupEventListeners() {
    const fechaDesde = document.getElementById('fecha_desde');
    const fechaHasta = document.getElementById('fecha_hasta');
    
    fechaDesde.addEventListener('change', function() {
        validateDates();
        if (!isAdmin) {
            loadAndDisplayAttendance();
        }
    });
    
    fechaHasta.addEventListener('change', function() {
        validateDates();
        if (!isAdmin) {
            loadAndDisplayAttendance();
        }
    });
    
    document.getElementById('reportForm').addEventListener('submit', handleFormSubmit);
    
    // Event listeners para botones de reportes especiales
    const btnHoras = document.getElementById('btn-reporte-horas');
    if (btnHoras) {
        btnHoras.addEventListener('click', handleReporteHoras);
    }
    
    const btnExcel = document.getElementById('btn-export-excel');
    if (btnExcel) {
        btnExcel.addEventListener('click', handleExportExcel);
    }
    
    setupCheckboxListeners();
}

function setupCheckboxListeners() {
    ['incluir_intervenciones','incluir_actividades','incluir_evidencias','incluir_comentarios','incluir_permisos'].forEach(id => {
        const checkbox = document.getElementById(id);
        if (checkbox) {
            checkbox.addEventListener('change', function() {
                if (this.checked) {
                    const evidenciasSolo = document.getElementById('incluir_evidencias_solo');
                    if (evidenciasSolo && evidenciasSolo.checked) {
                        evidenciasSolo.checked = false;
                        updateCheckboxStyles();
                    }
                }
            });
        }
    });
}

function handleEvidenciasChange(checkbox) {
    if (checkbox.checked) {
        ['incluir_intervenciones','incluir_actividades','incluir_evidencias','incluir_comentarios','incluir_permisos'].forEach(id => {
            const cb = document.getElementById(id);
            if (cb) cb.checked = false;
        });
        showStatus('⚠️ Modo "Solo Evidencias" activado', 'loading');
        setTimeout(() => hideStatus(), 6000);
    }
    updateCheckboxStyles();
}

window.handleEvidenciasChange = handleEvidenciasChange;

function updateCheckboxStyles() {
    const evidenciasSolo = document.getElementById('incluir_evidencias_solo');
    const evidenciasItem = document.querySelector('.checkbox-evidencias');
    if (evidenciasSolo && evidenciasSolo.checked && evidenciasItem) {
        evidenciasItem.style.background = '#e8f5e8';
        evidenciasItem.style.borderColor = '#4caf50';
        evidenciasItem.style.boxShadow = '0 2px 8px rgba(76,175,80,0.2)';
    } else if (evidenciasItem) {
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
        showStatus('❌ Fecha futura no válida', 'error');
        document.getElementById('fecha_hasta').value = today;
        return false;
    }
    
    if (fechaDesde && fechaHasta && fechaDesde > fechaHasta) {
        showStatus('❌ Rango de fechas inválido', 'error');
        document.getElementById('fecha_desde').value = fechaHasta;
        return false;
    }
    
    hideStatus();
    return true;
}

async function handleFormSubmit(e) {
    e.preventDefault();
    
    if (!isAuthenticated || !currentUser) {
        showStatus('❌ Debe autenticarse', 'error');
        return;
    }
    
    const fechaDesde = document.getElementById('fecha_desde').value;
    const fechaHasta = document.getElementById('fecha_hasta').value;
    
    if (!fechaDesde || !fechaHasta || !validateDates()) return;
    
    const checkboxes = document.querySelectorAll('input[name="incluir_campos[]"]:checked');
    if (checkboxes.length === 0) {
        showStatus('❌ Seleccione al menos un campo', 'error');
        return;
    }
    
    showStatus('⏳ Obteniendo datos...', 'loading');
    const submitBtn = document.getElementById('submit_btn');
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ Procesando...';
    
    try {
        await fetchAttendanceDataFromFirebase();
        
        if (!attendanceData || attendanceData.length === 0) {
            const isModoEvidencias = getSelectedFields().includes('evidencias_solo');
            showStatus(
                isModoEvidencias ? '⚠️ Sin SALIDAS con evidencias' : '⚠️ Sin registros en este período', 
                'error'
            );
            updateSubmitButton();
            
            if (!isAdmin) {
                displayAttendanceOnScreen();
            }
            return;
        }
        
        if (!isAdmin) {
            displayAttendanceOnScreen();
        }
        
        showStatus(`⏳ Generando PDF (${attendanceData.length} registros)...`, 'loading');
        submitBtn.textContent = '⏳ Generando PDF...';
        
        await generatePDFAsistencias(fechaDesde, fechaHasta);
        showDownloadModal(fechaDesde, fechaHasta, 'asistencias');
        
        hideStatus();
        updateSubmitButton();
        
    } catch (error) {
        console.error('❌ Error:', error);
        showStatus('❌ Error: ' + error.message, 'error');
        updateSubmitButton();
    }
}

// ========== GENERACIÓN DE REPORTE PDF DE ASISTENCIAS ==========
async function generatePDFAsistencias(fechaDesde, fechaHasta) {
    const {jsPDF} = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.setFont('helvetica');
    
    const ordenamiento = isAdmin ? (document.getElementById('orden_datos')?.value || 'nombre') : 'nombre';
    addPDFHeader(doc, fechaDesde, fechaHasta, ordenamiento);
    
    const tableData = prepareTableDataAsistencias(ordenamiento);
    const incluirCampos = getSelectedFields();
    const isModoEvidencias = incluirCampos.includes('evidencias_solo');
    
    if (isModoEvidencias) {
        generatePDFEvidenciasMode(doc, tableData, ordenamiento);
    } else {
        generatePDFNormalMode(doc, tableData, ordenamiento);
    }
    
    addPDFFooter(doc);
    pdfBlob = doc.output('blob');
}

function generatePDFNormalMode(doc, tableData, ordenamiento) {
    const headers = getTableHeaders(ordenamiento);
    const columnStyles = {};
    
    headers.forEach((header, index) => {
        if (['Interv.', 'Niños', 'Adoles.', 'Adult.', 'May.60', 'Fam.', 'Tot.Ev.'].includes(header)) {
            columnStyles[index] = {cellWidth: 12, fontSize: 6, halign: 'center'};
        } else if (header === 'Actividades') {
            columnStyles[index] = {cellWidth: 40, fontSize: 5};
        } else if (header === 'Comentarios') {
            columnStyles[index] = {cellWidth: 35, fontSize: 5};
        } else {
            columnStyles[index] = {fontSize: 6};
        }
    });
    
    doc.autoTable({
        head: [headers],
        body: tableData,
        startY: 40,
        styles: {fontSize: 6, cellPadding: 1.5, lineColor: [200,200,200], lineWidth: 0.1},
        headStyles: {fillColor: [102,126,234], textColor: 255, fontStyle: 'bold', fontSize: 6},
        alternateRowStyles: {fillColor: [248,249,250]},
        columnStyles: columnStyles
    });
}

function generatePDFEvidenciasMode(doc, tableData, ordenamiento) {
    const headers = getTableHeaders(ordenamiento);
    const columnStyles = {};
    
    headers.forEach((header, index) => {
        if (header === 'Links') {
            columnStyles[index] = {cellWidth: 50, fontSize: 5, textColor: [0,0,255]};
        } else if (header === 'Nombres Evid.') {
            columnStyles[index] = {cellWidth: 35, fontSize: 5};
        } else if (header === 'Carpeta') {
            columnStyles[index] = {cellWidth: 30, fontSize: 5};
        } else {
            columnStyles[index] = {fontSize: 6};
        }
    });
    
    doc.autoTable({
        head: [headers],
        body: tableData,
        startY: 40,
        styles: {fontSize: 6, cellPadding: 1.5, lineColor: [200,200,200], lineWidth: 0.1},
        headStyles: {fillColor: [102,126,234], textColor: 255, fontStyle: 'bold', fontSize: 6},
        alternateRowStyles: {fillColor: [248,249,250]},
        columnStyles: columnStyles,
        didDrawCell: function(data) {
            const linksIndex = headers.indexOf('Links');
            if (data.column.index === linksIndex && data.section === 'body') {
                const cellContent = tableData[data.row.index][linksIndex];
                if (cellContent && cellContent.includes('https://')) {
                    const linksData = parseLinksFromGeneratedText(cellContent);
                    linksData.forEach((linkData, index) => {
                        if (linkData.url) {
                            const linkY = data.cell.y + (index * 2.5) + 2;
                            doc.link(data.cell.x + 1, linkY - 1, data.cell.width - 2, 2.5, {url: linkData.url});
                        }
                    });
                }
            }
        }
    });
}

function addPDFHeader(doc, fechaDesde, fechaHasta, ordenamiento) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('REPORTE DE ASISTENCIAS - CESPSIC', 148, 12, {align: 'center'});
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generado por: ${currentUser.name}`, 10, 20);
    doc.text(`Email: ${currentUser.email}`, 10, 24);
    doc.text(`Fecha: ${new Date().toLocaleString('es-MX')}`, 10, 28);
    doc.text(`Período: ${fechaDesde} al ${fechaHasta}`, 10, 32);
    doc.text(`Total registros: ${attendanceData.length}`, 10, 36);
    
    if (ordenamiento) {
        const ordenTexto = {
            'nombre': 'Nombre',
            'fecha': 'Fecha',
            'tipo_estudiante': 'Tipo Estudiante',
            'modalidad': 'Modalidad',
            'tipo_registro': 'Tipo Registro'
        };
        doc.text(`Ordenado por: ${ordenTexto[ordenamiento] || ordenamiento}`, 200, 36);
    }
}

function addPDFFooter(doc) {
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.text(`Página ${i} de ${pageCount} - CESPSIC`, 148, 205, {align: 'center'});
    }
}

function getTableHeaders(ordenamiento = 'nombre') {
    const incluirCampos = getSelectedFields();
    let headers = [];
    
    const baseHeaders = {
        'nombre': ['Nombre Completo', 'Tipo Est.', 'Modalidad', 'Fecha', 'Hora', 'Tipo Reg.'],
        'fecha': ['Fecha', 'Nombre Completo', 'Hora', 'Tipo Est.', 'Modalidad', 'Tipo Reg.'],
        'tipo_estudiante': ['Tipo Est.', 'Fecha', 'Hora', 'Modalidad', 'Nombre Completo', 'Tipo Reg.'],
        'modalidad': ['Modalidad', 'Tipo Est.', 'Fecha', 'Hora', 'Nombre Completo', 'Tipo Reg.'],
        'tipo_registro': ['Tipo Reg.', 'Fecha', 'Hora', 'Tipo Est.', 'Modalidad', 'Nombre Completo']
    };
    
    headers = baseHeaders[ordenamiento] || baseHeaders['nombre'];
    
    if (incluirCampos.includes('evidencias_solo')) {
        headers.push('Nombres Evid.', 'Carpeta', 'Links');
    } else {
        if (incluirCampos.includes('intervenciones')) {
            headers.push('Interv.', 'Niños', 'Adoles.', 'Adult.', 'May.60', 'Fam.');
        }
        if (incluirCampos.includes('actividades')) headers.push('Actividades');
        if (incluirCampos.includes('evidencias')) headers.push('Tot.Ev.');
        if (incluirCampos.includes('comentarios')) headers.push('Comentarios');
        if (incluirCampos.includes('permisos')) headers.push('Det.Permiso', 'Det.Otro');
    }
    
    return headers;
}

function prepareTableDataAsistencias(ordenamiento = 'nombre') {
    const incluirCampos = getSelectedFields();
    
    return attendanceData.map(record => {
        const nombreCompleto = `${record.nombre || ''} ${record.apellidoPaterno || ''} ${record.apellidoMaterno || ''}`.trim();
        const tipoEst = record.tipoEstudiante || '';
        const modalidad = record.modalidad || '';
        const fecha = record.fecha || '';
        const hora = record.hora || '';
        const tipoReg = record.tipoRegistro || '';
        
        let row = [];
        
        switch(ordenamiento) {
            case 'fecha':
                row = [fecha, nombreCompleto, hora, tipoEst, modalidad, tipoReg];
                break;
            case 'tipo_estudiante':
                row = [tipoEst, fecha, hora, modalidad, nombreCompleto, tipoReg];
                break;
            case 'modalidad':
                row = [modalidad, tipoEst, fecha, hora, nombreCompleto, tipoReg];
                break;
            case 'tipo_registro':
                row = [tipoReg, fecha, hora, tipoEst, modalidad, nombreCompleto];
                break;
            default:
                row = [nombreCompleto, tipoEst, modalidad, fecha, hora, tipoReg];
        }
        
        if (incluirCampos.includes('evidencias_solo')) {
            row.push(
                record.nombresEvidencias || 'Sin evidencias',
                record.carpetaEvidencias || 'Sin carpeta',
                record.linksEvidencias || 'Sin links'
            );
        } else {
            if (incluirCampos.includes('intervenciones')) {
                row.push(
                    record.intervencionesPsicologicas || '0',
                    record.ninosNinas || '0',
                    record.adolescentes || '0',
                    record.adultos || '0',
                    record.mayores60 || '0',
                    record.familia || '0'
                );
            }
            if (incluirCampos.includes('actividades')) {
                let actividades = record.actividadesRealizadas || '';
                if (record.actividadesVariasDetalle) actividades += (actividades?' | ':'') + record.actividadesVariasDetalle;
                if (record.pruebasPsicologicasDetalle) actividades += (actividades?' | ':'') + record.pruebasPsicologicasDetalle;
                row.push(actividades);
            }
            if (incluirCampos.includes('evidencias')) row.push(record.totalEvidencias || '0');
            if (incluirCampos.includes('comentarios')) row.push(record.comentariosAdicionales || '');
            if (incluirCampos.includes('permisos')) row.push(record.permisoDetalle || '', record.otroDetalle || '');
        }
        
        return row;
    });
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

// Continúa con reportes de Horas y Excel en el siguiente archivo...
// ========== CONTINUACIÓN reports.js - Parte 3 - NUEVOS REPORTES ==========

// ========== REPORTE DE HORAS POR DÍA ==========
async function handleReporteHoras(e) {
    e.preventDefault();
    
    if (!isAuthenticated || !currentUser || !isAdmin) {
        showStatus('❌ Solo administradores pueden generar este reporte', 'error');
        return;
    }
    
    const fechaDesde = document.getElementById('fecha_desde').value;
    const fechaHasta = document.getElementById('fecha_hasta').value;
    
    if (!fechaDesde || !fechaHasta || !validateDates()) return;
    
    showStatus('⏳ Generando reporte de horas...', 'loading');
    
    try {
        await fetchAttendanceDataFromFirebase();
        
        if (!attendanceData || attendanceData.length === 0) {
            showStatus('⚠️ Sin registros en este período', 'error');
            return;
        }
        
        await generatePDFHorasPorDia(fechaDesde, fechaHasta);
        showDownloadModal(fechaDesde, fechaHasta, 'horas');
        hideStatus();
        
    } catch (error) {
        console.error('❌ Error generando reporte de horas:', error);
        showStatus('❌ Error: ' + error.message, 'error');
    }
}

async function generatePDFHorasPorDia(fechaDesde, fechaHasta) {
    const {jsPDF} = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.setFont('helvetica');
    
    // Calcular rango de días a mostrar
    const rangoFechas = calcularRangoDias(fechaDesde, fechaHasta);
    const diasMostrar = rangoFechas.dias;
    
    // Preparar datos agrupados por usuario y día
    const datosHoras = prepareHorasPorDia(diasMostrar);
    
    // Generar encabezado
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('REPORTE DE HORAS POR DÍA - CESPSIC', 148, 12, {align: 'center'});
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generado por: ${currentUser.name}`, 10, 20);
    doc.text(`Período: ${rangoFechas.fechaInicio} al ${rangoFechas.fechaFin}`, 10, 24);
    doc.text(`Total usuarios: ${datosHoras.length}`, 10, 28);
    
    // Preparar headers de tabla
    const headers = ['Nombre', 'Ap. Paterno', 'Ap. Materno', 'Tipo Est.', 'Modalidad'];
    diasMostrar.forEach(dia => {
        headers.push(dia.dia);
    });
    headers.push('Total Hrs');
    
    // Preparar datos de tabla
    const tableData = datosHoras.map(usuario => {
        const row = [
            usuario.nombre,
            usuario.apellidoPaterno,
            usuario.apellidoMaterno,
            usuario.tipoEstudiante,
            usuario.modalidad
        ];
        
        diasMostrar.forEach(dia => {
            const fechaKey = dia.fecha;
            row.push(usuario.horasPorDia[fechaKey] || '');
        });
        
        row.push(usuario.totalHoras.toFixed(1));
        
        return row;
    });
    
    // Estilos de columnas
    const columnStyles = {};
    headers.forEach((header, index) => {
        if (index < 5) {
            columnStyles[index] = {fontSize: 6};
        } else {
            columnStyles[index] = {fontSize: 5, halign: 'center', cellWidth: 8};
        }
    });
    
    // Generar tabla
    doc.autoTable({
        head: [headers],
        body: tableData,
        startY: 35,
        styles: {fontSize: 5, cellPadding: 1, lineColor: [200,200,200], lineWidth: 0.1},
        headStyles: {fillColor: [102,126,234], textColor: 255, fontStyle: 'bold', fontSize: 5},
        alternateRowStyles: {fillColor: [248,249,250]},
        columnStyles: columnStyles,
        margin: {left: 5, right: 5}
    });
    
    // Footer con leyenda
    const finalY = doc.lastAutoTable.finalY + 5;
    doc.setFontSize(7);
    doc.text('Leyenda: (vacío) = Sin registro | X = Registro incompleto | Números = Horas trabajadas', 10, finalY);
    
    addPDFFooter(doc);
    pdfBlob = doc.output('blob');
}

function calcularRangoDias(fechaDesde, fechaHasta) {
    const desde = new Date(fechaDesde);
    const hasta = new Date(fechaHasta);
    
    const diffTime = Math.abs(hasta - desde);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    let fechaInicio, fechaFin;
    
    if (diffDays > 31) {
        // Más de un mes: mostrar solo 1 mes hacia atrás desde fechaHasta
        fechaFin = new Date(hasta);
        fechaInicio = new Date(hasta);
        fechaInicio.setDate(fechaInicio.getDate() - 30);
    } else {
        // Menos de un mes: mostrar rango completo
        fechaInicio = new Date(desde);
        fechaFin = new Date(hasta);
    }
    
    // Generar array de días
    const dias = [];
    const currentDate = new Date(fechaInicio);
    
    while (currentDate <= fechaFin) {
        dias.push({
            fecha: currentDate.toISOString().split('T')[0],
            dia: currentDate.getDate().toString().padStart(2, '0')
        });
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return {
        fechaInicio: fechaInicio.toISOString().split('T')[0],
        fechaFin: fechaFin.toISOString().split('T')[0],
        dias: dias
    };
}

function prepareHorasPorDia(diasMostrar) {
    // Agrupar registros por usuario
    const usuariosMap = new Map();
    
    attendanceData.forEach(record => {
        const nombreCompleto = `${record.nombre || ''}_${record.apellidoPaterno || ''}_${record.apellidoMaterno || ''}`;
        
        if (!usuariosMap.has(nombreCompleto)) {
            usuariosMap.set(nombreCompleto, {
                nombre: record.nombre || '',
                apellidoPaterno: record.apellidoPaterno || '',
                apellidoMaterno: record.apellidoMaterno || '',
                tipoEstudiante: record.tipoEstudiante || '',
                modalidad: record.modalidad || '',
                registrosPorDia: {}
            });
        }
        
        const fecha = record.fecha;
        if (!usuariosMap.get(nombreCompleto).registrosPorDia[fecha]) {
            usuariosMap.get(nombreCompleto).registrosPorDia[fecha] = [];
        }
        
        usuariosMap.get(nombreCompleto).registrosPorDia[fecha].push({
            hora: record.hora,
            tipoRegistro: record.tipoRegistro
        });
    });
    
    // Calcular horas por día para cada usuario
    const datosHoras = [];
    
    usuariosMap.forEach(usuario => {
        const horasPorDia = {};
        let totalHoras = 0;
        
        diasMostrar.forEach(dia => {
            const fecha = dia.fecha;
            const registros = usuario.registrosPorDia[fecha] || [];
            
            if (registros.length === 0) {
                horasPorDia[fecha] = '';
            } else {
                const horas = calcularHorasDia(registros);
                horasPorDia[fecha] = horas.display;
                if (horas.value > 0) {
                    totalHoras += horas.value;
                }
            }
        });
        
        datosHoras.push({
            nombre: usuario.nombre,
            apellidoPaterno: usuario.apellidoPaterno,
            apellidoMaterno: usuario.apellidoMaterno,
            tipoEstudiante: usuario.tipoEstudiante,
            modalidad: usuario.modalidad,
            horasPorDia: horasPorDia,
            totalHoras: totalHoras
        });
    });
    
    // Ordenar por nombre
    datosHoras.sort((a, b) => {
        const nombreA = `${a.nombre} ${a.apellidoPaterno}`.toLowerCase();
        const nombreB = `${b.nombre} ${b.apellidoPaterno}`.toLowerCase();
        return nombreA.localeCompare(nombreB);
    });
    
    return datosHoras;
}

function calcularHorasDia(registros) {
    // Separar entradas y salidas
    const entradas = registros.filter(r => r.tipoRegistro && r.tipoRegistro.toLowerCase() === 'entrada');
    const salidas = registros.filter(r => r.tipoRegistro && r.tipoRegistro.toLowerCase() === 'salida');
    
    if (entradas.length === 0 || salidas.length === 0) {
        return {display: 'X', value: 0};
    }
    
    // Obtener primera entrada y última salida
    const horasEntrada = entradas.map(e => convertirHoraAMinutos(e.hora)).filter(h => h !== null);
    const horasSalida = salidas.map(s => convertirHoraAMinutos(s.hora)).filter(h => h !== null);
    
    if (horasEntrada.length === 0 || horasSalida.length === 0) {
        return {display: 'X', value: 0};
    }
    
    const primeraEntrada = Math.min(...horasEntrada);
    const ultimaSalida = Math.max(...horasSalida);
    
    const minutosTrabajados = ultimaSalida - primeraEntrada;
    const horas = minutosTrabajados / 60;
    
    return {
        display: horas.toFixed(1),
        value: horas
    };
}

function convertirHoraAMinutos(horaStr) {
    if (!horaStr) return null;
    
    try {
        const parts = horaStr.split(':');
        if (parts.length >= 2) {
            const horas = parseInt(parts[0]);
            const minutos = parseInt(parts[1]);
            return horas * 60 + minutos;
        }
    } catch (e) {
        console.warn('Error convirtiendo hora:', horaStr);
    }
    
    return null;
}

// ========== EXPORTACIÓN A EXCEL ==========
async function handleExportExcel(e) {
    e.preventDefault();
    
    if (!isAuthenticated || !currentUser || !isAdmin) {
        showStatus('❌ Solo administradores pueden exportar a Excel', 'error');
        return;
    }
    
    const fechaDesde = document.getElementById('fecha_desde').value;
    const fechaHasta = document.getElementById('fecha_hasta').value;
    
    if (!fechaDesde || !fechaHasta || !validateDates()) return;
    
    showStatus('⏳ Exportando a Excel...', 'loading');
    
    try {
        await fetchAttendanceDataFromFirebase();
        
        if (!attendanceData || attendanceData.length === 0) {
            showStatus('⚠️ Sin registros para exportar', 'error');
            return;
        }
        
        await generateExcelExport(fechaDesde, fechaHasta);
        showDownloadModal(fechaDesde, fechaHasta, 'excel');
        hideStatus();
        
    } catch (error) {
        console.error('❌ Error exportando a Excel:', error);
        showStatus('❌ Error: ' + error.message, 'error');
    }
}

async function generateExcelExport(fechaDesde, fechaHasta) {
    // Verificar librería XLSX
    const XLSX = window.XLSX;
    if (!XLSX) {
        throw new Error('Librería XLSX no cargada. Verifica que esté incluida en index.html');
    }
    
    console.log('📊 Generando Excel...');
    console.log('Registros a exportar:', attendanceData.length);
    
    // Preparar datos
    const excelData = prepareExcelData();
    
    if (excelData.length === 0) {
        throw new Error('No hay datos para exportar');
    }
    
    console.log('✅ Datos preparados para Excel:', excelData.length, 'filas');
    
    // Crear workbook y worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);
    
    // Ajustar ancho de columnas
    const headerNames = Object.keys(excelData[0]);
    const columnWidths = headerNames.map(header => {
        return { wch: Math.max(header.length + 2, 15) };
    });
    ws['!cols'] = columnWidths;
    
    // Agregar worksheet al workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Asistencias');
    
    console.log('✅ Workbook creado');
    
    // Generar archivo Excel
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    pdfBlob = new Blob([wbout], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    
    console.log('✅ Archivo Excel generado, tamaño:', pdfBlob.size, 'bytes');
}

function prepareExcelData() {
    console.log('📊 Preparando datos para Excel...');
    console.log('Total registros:', attendanceData.length);
    
    if (attendanceData.length > 0) {
        console.log('🔍 Ejemplo primer registro:', attendanceData[0]);
    }
    
    return attendanceData.map((record, index) => {
        const excelRow = {};
        
        // Orden de los 43 campos según EXCEL_FIELD_ORDER
        const fieldOrder = [
            'timestamp',
            'email',
            'googleUserId',
            'nombreAutenticado',
            'timestampAutenticacion',
            'latitud',
            'longitud',
            'estadoUbicacion',
            'ubicacionDetectada',
            'direccionCompleta',
            'precisionGPS',
            'precisionGPSMetros',
            'validacionUbicacion',
            'nombre',
            'apellidoPaterno',
            'apellidoMaterno',
            'tipoEstudiante',
            'modalidad',
            'fecha',
            'hora',
            'tipoRegistro',
            'permisoDetalle',
            'otroDetalle',
            'intervencionesPsicologicas',
            'ninosNinas',
            'adolescentes',
            'adultos',
            'mayores60',
            'familia',
            'actividadesRealizadas',
            'actividadesVariasDetalle',
            'pruebasPsicologicasDetalle',
            'comentariosAdicionales',
            'totalEvidencias',
            'nombresEvidencias',
            'carpetaEvidencias',
            'tipoDispositivo',
            'esDesktop',
            'metodoGPS',
            'precisionRequerida',
            'infoDispositivoJSON',
            'versionHTML',
            'registroId'
        ];
        
        // Mapeo de nombres de campos a headers en español
        const headerNames = {
            'timestamp': 'Timestamp',
            'email': 'Email',
            'googleUserId': 'Google_User_ID',
            'nombreAutenticado': 'Nombre_Autenticado',
            'timestampAutenticacion': 'Timestamp_Autenticacion',
            'latitud': 'Latitud',
            'longitud': 'Longitud',
            'estadoUbicacion': 'Estado_Ubicacion',
            'ubicacionDetectada': 'Ubicacion_Detectada',
            'direccionCompleta': 'Direccion_Completa',
            'precisionGPS': 'Precision_GPS',
            'precisionGPSMetros': 'Precision_GPS_Metros',
            'validacionUbicacion': 'Validacion_Ubicacion',
            'nombre': 'Nombre',
            'apellidoPaterno': 'Apellido_Paterno',
            'apellidoMaterno': 'Apellido_Materno',
            'tipoEstudiante': 'Tipo_Estudiante',
            'modalidad': 'Modalidad',
            'fecha': 'Fecha',
            'hora': 'Hora',
            'tipoRegistro': 'Tipo_Registro',
            'permisoDetalle': 'Permiso_Detalle',
            'otroDetalle': 'Otro_Detalle',
            'intervencionesPsicologicas': 'Intervenciones_Psicologicas',
            'ninosNinas': 'Ninos_Ninas',
            'adolescentes': 'Adolescentes',
            'adultos': 'Adultos',
            'mayores60': 'Mayores_60',
            'familia': 'Familia',
            'actividadesRealizadas': 'Actividades_Realizadas',
            'actividadesVariasDetalle': 'Actividades_Varias_Detalle',
            'pruebasPsicologicasDetalle': 'Pruebas_Psicologicas_Detalle',
            'comentariosAdicionales': 'Comentarios_Adicionales',
            'totalEvidencias': 'Total_Evidencias',
            'nombresEvidencias': 'Nombres_Evidencias',
            'carpetaEvidencias': 'Carpeta_Evidencias',
            'tipoDispositivo': 'Tipo_Dispositivo',
            'esDesktop': 'Es_Desktop',
            'metodoGPS': 'Metodo_GPS',
            'precisionRequerida': 'Precision_Requerida',
            'infoDispositivoJSON': 'Info_Dispositivo_JSON',
            'versionHTML': 'Version_HTML',
            'registroId': 'Registro_ID'
        };
        
        fieldOrder.forEach(fieldKey => {
            const headerName = headerNames[fieldKey];
            let value = record[fieldKey];
            
            // Manejar valores especiales
            if (value === null || value === undefined) {
                value = '';
            } else if (typeof value === 'object' && !(value instanceof Date)) {
                value = JSON.stringify(value);
            } else if (typeof value === 'boolean') {
                value = value ? 'Sí' : 'No';
            } else if (value instanceof Date) {
                value = value.toISOString();
            }
            
            excelRow[headerName] = value;
        });
        
        // Debug del primer registro
        if (index === 0) {
            console.log('🔍 Primera fila Excel:', excelRow);
        }
        
        return excelRow;
    });
}

// ========== FUNCIONES DE DESCARGA Y MODAL ==========
function generateFileName(fechaDesde, fechaHasta, tipoReporte) {
    const fecha = new Date().toISOString().split('T')[0];
    const filtros = [];
    
    if (tipoReporte === 'asistencias') {
        // Determinar filtros aplicados
        if (isAdmin) {
            const userFilter = document.getElementById('filtro_usuario')?.value;
            if (userFilter) {
                filtros.push(userFilter.replace(/\s+/g, ''));
            } else {
                filtros.push('TodosUsuarios');
            }
        } else {
            filtros.push(currentUser.name.replace(/\s+/g, ''));
        }
        
        const tipoFilter = document.getElementById('filtro_tipo')?.value;
        if (tipoFilter) {
            filtros.push(tipoFilter);
        }
        
        const modalidadFilter = document.getElementById('filtro_modalidad')?.value;
        if (modalidadFilter) {
            filtros.push(modalidadFilter);
        }
        
        return `Asistencias_${filtros.join('_')}_${fechaDesde}_${fechaHasta}.pdf`;
        
    } else if (tipoReporte === 'horas') {
        return `HorasPorDia_${fechaDesde}_${fechaHasta}_${fecha}.pdf`;
        
    } else if (tipoReporte === 'excel') {
        const userFilter = document.getElementById('filtro_usuario')?.value;
        const suffix = userFilter ? userFilter.replace(/\s+/g, '') : 'TodosUsuarios';
        return `ExportCompleto_${suffix}_${fechaDesde}_${fechaHasta}_${fecha}.xlsx`;
    }
    
    return `Reporte_CESPSIC_${fecha}.pdf`;
}

function showDownloadModal(fechaDesde, fechaHasta, tipoReporte) {
    const modal = document.getElementById('modal-overlay');
    const reportInfo = document.getElementById('report-info');
    
    let tipoReporteTexto = 'Asistencias';
    if (tipoReporte === 'horas') tipoReporteTexto = 'Horas por Día';
    if (tipoReporte === 'excel') tipoReporteTexto = 'Exportación Completa Excel';
    
    reportInfo.innerHTML = `
        <h4>📊 ${tipoReporteTexto}</h4>
        <p><strong>Período:</strong> ${fechaDesde} al ${fechaHasta}</p>
        <p><strong>Total de registros:</strong> ${attendanceData.length}</p>
        <p><strong>Generado por:</strong> ${currentUser.name}</p>
        <p><strong>Fecha:</strong> ${new Date().toLocaleString('es-MX')}</p>
    `;
    
    document.getElementById('download-btn').onclick = () => downloadFile(fechaDesde, fechaHasta, tipoReporte);
    modal.classList.add('show');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('show');
}

function downloadFile(fechaDesde, fechaHasta, tipoReporte) {
    if (pdfBlob) {
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = generateFileName(fechaDesde, fechaHasta, tipoReporte);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showStatus('✅ Archivo descargado', 'success');
        setTimeout(() => {
            hideStatus();
            closeModal();
        }, 2000);
    }
}

// ========== FUNCIONES UI AUXILIARES ==========
function updateAuthenticationUI() {
    const authSection = document.getElementById('auth-section');
    const authTitle = document.getElementById('auth-title');
    const userInfo = document.getElementById('user-info');
    const signinContainer = document.getElementById('signin-button-container');
    
    if (isAuthenticated && currentUser) {
        authSection.classList.add('authenticated');
        authTitle.textContent = `✅ Autorizado ${isAdmin?'(Admin)':''}`;
        authTitle.classList.add('authenticated');
        
        document.getElementById('user-avatar').src = currentUser.picture;
        document.getElementById('user-email').textContent = currentUser.email;
        document.getElementById('user-name').textContent = currentUser.name;
        document.getElementById('user-status').textContent = isAdmin ? '👑 Administrador' : '✅ Usuario';
        
        userInfo.classList.add('show');
        signinContainer.style.display = 'none';
    } else {
        authSection.classList.remove('authenticated');
        authTitle.textContent = '🔒 Autenticación Requerida';
        authTitle.classList.remove('authenticated');
        userInfo.classList.remove('show');
        signinContainer.style.display = 'block';
    }
}

function enableForm() {
    document.getElementById('form-container').classList.add('authenticated');
    updateSubmitButton();
}

function disableForm() {
    document.getElementById('form-container').classList.remove('authenticated');
    updateSubmitButton();
}

function updateSubmitButton() {
    const submitBtn = document.getElementById('submit_btn');
    if (!isAuthenticated) {
        submitBtn.disabled = true;
        submitBtn.textContent = '🔒 Autentíquese primero';
    } else {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '📋 Generar Reporte PDF';
    }
}

function showAuthenticationError(message) {
    const container = document.getElementById("signin-button-container");
    container.innerHTML = `
        <div style="background:#f8d7da;border:1px solid #f5c6cb;border-radius:8px;padding:15px;color:#721c24;">
            <strong>❌ Error</strong><br>${message}
            <div style="margin-top:15px;">
                <button onclick="location.reload()" style="background:#dc3545;color:white;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;">
                    🔄 Recargar
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
        attendanceData = [];
        pdfBlob = null;
        isAdmin = false;
        
        updateAuthenticationUI();
        disableForm();
        closeModal();
        
        const adminSection = document.getElementById('admin-controls-section');
        if (adminSection) adminSection.style.display = 'none';
        
        const evidenciasCheckbox = document.querySelector('.checkbox-evidencias');
        if (evidenciasCheckbox) evidenciasCheckbox.style.display = 'none';
        
        const attendanceSection = document.getElementById('attendance-view-section');
        if (attendanceSection) attendanceSection.style.display = 'none';
        
        const reportTypeSection = document.getElementById('report-type-section');
        if (reportTypeSection) reportTypeSection.style.display = 'none';
        
        showStatus('✅ Sesión cerrada', 'success');
        setTimeout(() => {
            hideStatus();
            setTimeout(() => initializeGoogleSignIn(), 1000);
        }, 2000);
    } catch (error) {
        showStatus('❌ Error cerrando sesión', 'error');
    }
}

function showStatus(message, type) {
    const status = document.getElementById('status');
    status.innerHTML = message.replace(/\n/g, '<br>');
    status.className = `status ${type}`;
    status.style.display = 'block';
}

function hideStatus() {
    document.getElementById('status').style.display = 'none';
}

function setMaxDate() {
    const today = new Date().toLocaleDateString('en-CA', {timeZone:'America/Mazatlan'});
    document.getElementById('fecha_hasta').max = today;
    document.getElementById('fecha_hasta').value = today;
    
    if (!isAdmin) {
        document.getElementById('fecha_desde').value = today;
    } else {
        const todayDate = new Date(today);
        const oneMonthAgo = new Date(todayDate);
        oneMonthAgo.setMonth(todayDate.getMonth() - 1);
        document.getElementById('fecha_desde').value = oneMonthAgo.toISOString().split('T')[0];
    }
}
