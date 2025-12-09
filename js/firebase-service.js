/**
 * FIREBASE SERVICE - CESPSIC REPORTES
 * Versión: 1.2 - CORRECCIÓN EXACTA
 * Mapeo específico para estructura snake_case
 */

import { CONFIG } from './Config.js';

// Variables globales de Firebase
let db = null;
let isFirebaseInitialized = false;

/**
 * Normalizar campos de Firestore al formato esperado por reports.js
 * Mapeo exacto según estructura real de Firestore
 */
function normalizeFieldNames(data) {
    const normalized = {};
    
    // Sistema
    //normalized.timestamp = data.timestamp || data.fecha_creacion || '';
    if (data.timestamp || data.fecha_creacion) {
        const timestampValue = data.timestamp || data.fecha_creacion;
        
        // Si es un Timestamp de Firebase
        if (timestampValue && typeof timestampValue.toDate === 'function') {
            const date = timestampValue.toDate();
            normalized.timestamp = formatTimestampMazatlan(date);
        } 
        // Si es un Date object
        else if (timestampValue instanceof Date) {
            normalized.timestamp = formatTimestampMazatlan(timestampValue);
        }
        // Si es un string o número
        else if (timestampValue) {
            const date = new Date(timestampValue);
            normalized.timestamp = formatTimestampMazatlan(date);
        } else {
            normalized.timestamp = '';
        }
    } else {
        normalized.timestamp = '';
    }    
    normalized.email = data.email || '';
    normalized.googleUserId = data.google_user_id || '';
    normalized.nombreAutenticado = data.authenticated_user_name || data.nombre_completo || '';
    normalized.timestampAutenticacion = data.fecha_creacion || '';
    
    // Ubicación (desde el mapa 'ubicacion')
    if (data.ubicacion) {
        normalized.latitud = data.ubicacion.lat || '';
        normalized.longitud = data.ubicacion.lng || '';
        normalized.estadoUbicacion = 'success'; // Asumido si existe ubicacion
        normalized.ubicacionDetectada = data.ubicacion.lugar || '';
        normalized.direccionCompleta = data.ubicacion.direccion || '';
        normalized.precisionGPS = data.ubicacion.accuracy < 50 ? 'high' : 'medium';
        normalized.precisionGPSMetros = data.ubicacion.precision_metros || data.ubicacion.accuracy || '';
        normalized.validacionUbicacion = 'dentro_rango'; // Asumido
    } else {
        normalized.latitud = '';
        normalized.longitud = '';
        normalized.estadoUbicacion = '';
        normalized.ubicacionDetectada = '';
        normalized.direccionCompleta = '';
        normalized.precisionGPS = '';
        normalized.precisionGPSMetros = '';
        normalized.validacionUbicacion = '';
    }
    
    // Personal
    normalized.nombre = data.nombre || '';
    normalized.apellidoPaterno = data.apellido_paterno || '';
    normalized.apellidoMaterno = data.apellido_materno || '';
    normalized.tipoEstudiante = data.tipo_estudiante || '';
    normalized.modalidad = data.modalidad || '';
    
    // Asistencia
    normalized.fecha = data.fecha || '';
    normalized.hora = data.hora || '';
    normalized.tipoRegistro = data.tipo_registro || '';
    normalized.permisoDetalle = data.permiso_detalle || '';
    normalized.otroDetalle = data.otro_detalle || '';
    
    // Intervenciones (desde el mapa 'grupos_edad')
    normalized.intervencionesPsicologicas = data.intervenciones_psicologicas || 0;
    if (data.grupos_edad) {
        normalized.ninosNinas = data.grupos_edad.ninos_ninas || 0;
        normalized.adolescentes = data.grupos_edad.adolescentes || 0;
        normalized.adultos = data.grupos_edad.adultos || 0;
        normalized.mayores60 = data.grupos_edad.mayores_60 || 0;
        normalized.familia = data.grupos_edad.familia || 0;
    } else {
        normalized.ninosNinas = 0;
        normalized.adolescentes = 0;
        normalized.adultos = 0;
        normalized.mayores60 = 0;
        normalized.familia = 0;
    }
    
    // Actividades
    // Convertir array de actividades a texto
    if (data.actividades && Array.isArray(data.actividades)) {
        normalized.actividadesRealizadas = data.actividades.join(', ');
    } else {
        normalized.actividadesRealizadas = '';
    }
    normalized.actividadesVariasDetalle = data.actividades_varias_texto || '';
    normalized.pruebasPsicologicasDetalle = data.pruebas_psicologicas_texto || '';
    normalized.comentariosAdicionales = data.comentarios_adicionales || '';
    
    // Evidencias
    normalized.totalEvidencias = data.total_evidencias || 0;
    
    // Convertir array de evidencias a texto
    if (data.evidencias && Array.isArray(data.evidencias) && data.evidencias.length > 0) {
        normalized.nombresEvidencias = data.evidencias
            .map(e => {
                // Extraer fileName del objeto evidencia (camelCase como está en Firebase)
                if (typeof e === 'object' && e !== null) {
                    return e.fileName || e.filename || e.nombre || '';
                }
                return e || '';
            })
            .filter(filename => filename !== '') // Filtrar vacíos
            .join(', ');
    } else {
        normalized.nombresEvidencias = '';
    }
    
    normalized.carpetaEvidencias = data.carpeta_evidencias || '';
    normalized.linksEvidencias = ''; // Se generaría desde Drive si es necesario
    
    // Técnico (desde el mapa 'device_info')
    normalized.tipoDispositivo = data.device_type || '';
    if (data.device_info) {
        normalized.esDesktop = data.device_info.isDesktop || false;
        normalized.metodoGPS = data.gps_method || '';
        normalized.precisionRequerida = data.device_info.requiredAccuracy || data.required_accuracy || '';
        
        // Convertir device_info a JSON string
        normalized.infoDispositivoJSON = JSON.stringify(data.device_info);
    } else {
        normalized.esDesktop = data.is_desktop || false;
        normalized.metodoGPS = data.gps_method || '';
        normalized.precisionRequerida = data.required_accuracy || '';
        normalized.infoDispositivoJSON = '';
    }
    
    normalized.versionHTML = data.version || '';
    normalized.registroId = data.registro_id || '';
    
    return normalized;
}

/**
 * Inicializar Firebase
 */
export async function initializeFirebase() {
    if (isFirebaseInitialized) {
        console.log('✅ Firebase ya está inicializado');
        return true;
    }

    try {
        console.log('🔥 Inicializando Firebase...');
        
        const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
        const { getFirestore } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        const app = initializeApp(CONFIG.FIREBASE_CONFIG);
        db = getFirestore(app);
        
        isFirebaseInitialized = true;
        console.log('✅ Firebase inicializado correctamente');
        return true;
        
    } catch (error) {
        console.error('❌ Error inicializando Firebase:', error);
        throw new Error('No se pudo inicializar Firebase: ' + error.message);
    }
}

/**
 * Obtener datos de asistencias desde Firestore
 */
export async function getAttendanceData(userEmail, isAdmin, filters = {}) {
    try {
        if (!isFirebaseInitialized) {
            await initializeFirebase();
        }

        console.log('📊 Obteniendo datos de asistencias...');
        console.log('Usuario:', userEmail, '| Admin:', isAdmin);
        console.log('Filtros:', filters);

        const { collection, query, where, getDocs } = await import(
            'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
        );

        let q = collection(db, CONFIG.FIRESTORE_COLLECTION);
        const constraints = [];

        // Filtro por usuario (si NO es admin)
        if (!isAdmin && userEmail) {
            constraints.push(where('email', '==', userEmail));
        }

        // CORREGIDO: Filtro por rango de fechas
        if (filters.fechaDesde && filters.fechaHasta) {
            console.log('📅 Aplicando filtro de fechas:', filters.fechaDesde, 'al', filters.fechaHasta);
            
            // Los filtros de fecha se hacen con strings YYYY-MM-DD
            constraints.push(where('fecha', '>=', filters.fechaDesde));
            constraints.push(where('fecha', '<=', filters.fechaHasta));
        }

        // Aplicar constraints
        if (constraints.length > 0) {
            q = query(q, ...constraints);
        }

        // Ejecutar query
        const querySnapshot = await getDocs(q);
        
        console.log(`📦 Documentos obtenidos de Firestore: ${querySnapshot.size}`);

        // Procesar documentos
        const attendanceData = [];
        querySnapshot.forEach((doc) => {
            const rawData = doc.data();
            
            // Normalizar nombres de campos
            const data = normalizeFieldNames(rawData);
            
            // Normalizar capitalización de nombres
            if (data.nombre) data.nombre = normalizeNameCapitalization(data.nombre);
            if (data.apellidoPaterno) data.apellidoPaterno = normalizeNameCapitalization(data.apellidoPaterno);
            if (data.apellidoMaterno) data.apellidoMaterno = normalizeNameCapitalization(data.apellidoMaterno);
            
            // Agregar ID del documento
            data.docId = doc.id;
            
            // DEBUG: Mostrar primer registro procesado
            if (attendanceData.length === 0) {
                console.log('🔍 Primer registro RAW:', rawData);
                console.log('🔍 Primer registro NORMALIZADO:', data);
            }
            
            attendanceData.push(data);
        });

        // Filtrar en memoria por otros criterios
        let filteredData = attendanceData;

        // Filtro por tipo de estudiante
        if (filters.filtroTipo && filters.filtroTipo !== '') {
            const countBefore = filteredData.length;
            filteredData = filteredData.filter(record => 
                record.tipoEstudiante === filters.filtroTipo
            );
            console.log(`Filtro tipo_estudiante: ${countBefore} → ${filteredData.length}`);
        }

        // Filtro por modalidad
        if (filters.filtroModalidad && filters.filtroModalidad !== '') {
            const countBefore = filteredData.length;
            filteredData = filteredData.filter(record => 
                record.modalidad === filters.filtroModalidad
            );
            console.log(`Filtro modalidad: ${countBefore} → ${filteredData.length}`);
        }

        // Filtro por tipo de registro
        if (filters.filtroTipoRegistro && filters.filtroTipoRegistro !== '') {
            const countBefore = filteredData.length;
            filteredData = filteredData.filter(record => 
                record.tipoRegistro && 
                record.tipoRegistro.toLowerCase() === filters.filtroTipoRegistro.toLowerCase()
            );
            console.log(`Filtro tipo_registro: ${countBefore} → ${filteredData.length}`);
        }

        // Filtro por usuario específico (para admins)
        if (isAdmin && filters.filtroUsuario && filters.filtroUsuario !== '') {
            const countBefore = filteredData.length;
            filteredData = filteredData.filter(record => {
                const nombreCompleto = `${record.nombre || ''} ${record.apellidoPaterno || ''} ${record.apellidoMaterno || ''}`.trim();
                return nombreCompleto === filters.filtroUsuario;
            });
            console.log(`Filtro usuario: ${countBefore} → ${filteredData.length}`);
        }

        console.log(`✅ Total final: ${filteredData.length} registros`);
        console.log(`📅 Rango: ${filters.fechaDesde} al ${filters.fechaHasta}`);

        return filteredData;

    } catch (error) {
        console.error('❌ Error obteniendo datos:', error);
        throw new Error('Error al obtener datos de asistencias: ' + error.message);
    }
}

/**
 * Obtener lista de usuarios únicos en un rango de fechas
 */
export async function getUsersInRange(fechaDesde, fechaHasta) {
    try {
        if (!isFirebaseInitialized) {
            await initializeFirebase();
        }

        console.log('👥 Obteniendo usuarios en rango:', fechaDesde, 'al', fechaHasta);

        const { collection, query, where, getDocs } = await import(
            'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
        );

        const q = query(
            collection(db, CONFIG.FIRESTORE_COLLECTION),
            where('fecha', '>=', fechaDesde),
            where('fecha', '<=', fechaHasta)
        );

        const querySnapshot = await getDocs(q);
        
        const usersSet = new Set();
        querySnapshot.forEach((doc) => {
            const rawData = doc.data();
            const data = normalizeFieldNames(rawData);
            
            // Limpiar y normalizar el nombre completo
            const nombreCompleto = `${data.nombre || ''} ${data.apellidoPaterno || ''} ${data.apellidoMaterno || ''}`
                .trim()
                .replace(/\s+/g, ' '); // Eliminar espacios múltiples
            
            if (nombreCompleto && nombreCompleto !== '') {
                const nombreNormalizado = normalizeNameCapitalization(nombreCompleto);
                usersSet.add(nombreNormalizado);
            }
        });
        
        const users = Array.from(usersSet).sort((a, b) => a.localeCompare(b, 'es'));
        console.log(`✅ Usuarios encontrados: ${users.length}`);
        
        return users;

    } catch (error) {
        console.error('❌ Error obteniendo usuarios:', error);
        throw new Error('Error al obtener usuarios: ' + error.message);
    }
}

/**
 * Obtener nombre completo del usuario por su email
 */
export async function getUserNameByEmail(email) {
    try {
        if (!isFirebaseInitialized) {
            await initializeFirebase();
        }

        const { collection, query, where, getDocs, limit } = await import(
            'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
        );

        const q = query(
            collection(db, CONFIG.FIRESTORE_COLLECTION),
            where('email', '==', email),
            limit(1)
        );

        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
            const rawData = querySnapshot.docs[0].data();
            const data = normalizeFieldNames(rawData);
            
            const nombreCompleto = `${data.nombre || ''} ${data.apellidoPaterno || ''} ${data.apellidoMaterno || ''}`.trim();
            return normalizeNameCapitalization(nombreCompleto);
        }

        return '';

    } catch (error) {
        console.error('❌ Error obteniendo nombre de usuario:', error);
        return '';
    }
}

/**
 * Normaliza un nombre: primera letra de cada palabra en mayúscula, resto en minúsculas
 */
function normalizeNameCapitalization(name) {
    if (!name || typeof name !== 'string') {
        return '';
    }
    
    return name
        .trim()
        .toLowerCase()
        .split(' ')
        .map(word => {
            if (word.length === 0) return '';
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(' ');
}

/**
 * Test de conexión con Firebase
 */
export async function testFirebaseConnection() {
    try {
        if (!isFirebaseInitialized) {
            await initializeFirebase();
        }

        const { collection, getDocs, limit, query } = await import(
            'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
        );

        const q = query(collection(db, CONFIG.FIRESTORE_COLLECTION), limit(1));
        const querySnapshot = await getDocs(q);

        return {
            success: true,
            message: 'Conexión exitosa con Firebase',
            collection: CONFIG.FIRESTORE_COLLECTION,
            canRead: querySnapshot.size >= 0
        };

    } catch (error) {
        console.error('❌ Error en test de conexión:', error);
        return {
            success: false,
            message: 'Error de conexión: ' + error.message
        };
    }
}

/**
 * Formatear timestamp a zona horaria de Mazatlán
 * Formato: DD/MM/YYYY HH:MM:SS
 */
function formatTimestampMazatlan(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
        return '';
    }
    
    try {
        // Opciones para formato en zona horaria de Mazatlán
        const options = {
            timeZone: 'America/Mazatlan',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        };
        
        const formatter = new Intl.DateTimeFormat('es-MX', options);
        const parts = formatter.formatToParts(date);
        
        // Extraer partes
        const partsMap = {};
        parts.forEach(part => {
            partsMap[part.type] = part.value;
        });
        
        // Construir formato DD/MM/YYYY HH:MM:SS
        return `${partsMap.day}/${partsMap.month}/${partsMap.year} ${partsMap.hour}:${partsMap.minute}:${partsMap.second}`;
        
    } catch (error) {
        console.error('Error formateando timestamp:', error);
        return date.toLocaleString('es-MX', { timeZone: 'America/Mazatlan' });
    }
}
