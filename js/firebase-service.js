/**
 * FIREBASE SERVICE - CESPSIC REPORTES
 * Servicio para comunicación con Firebase Firestore
 * Versión: 1.0
 */

import { CONFIG, FIREBASE_FIELD_MAPPING } from './Config.js';

// Variables globales de Firebase
let db = null;
let isFirebaseInitialized = false;

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
    
    // Importar Firebase dinámicamente
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
    const { getFirestore } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    
    // Inicializar Firebase con configuración del ambiente
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
 * @param {string} userEmail - Email del usuario autenticado
 * @param {boolean} isAdmin - Si el usuario es administrador
 * @param {Object} filters - Filtros a aplicar
 * @returns {Promise<Array>} - Array de registros de asistencias
 */
export async function getAttendanceData(userEmail, isAdmin, filters = {}) {
  try {
    if (!isFirebaseInitialized) {
      await initializeFirebase();
    }

    console.log('📊 Obteniendo datos de asistencias...');
    console.log('Usuario:', userEmail, '| Admin:', isAdmin);
    console.log('Filtros:', filters);

    const { collection, query, where, getDocs, orderBy } = await import(
      'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
    );

    // Construir query base
    let q = collection(db, CONFIG.FIRESTORE_COLLECTION);
    const constraints = [];

    // Filtro por usuario (si NO es admin)
    if (!isAdmin && userEmail) {
      constraints.push(where('email', '==', userEmail));
    }

    // Filtro por rango de fechas
    if (filters.fechaDesde) {
      const fechaDesde = new Date(filters.fechaDesde);
      fechaDesde.setHours(0, 0, 0, 0);
      constraints.push(where('fecha', '>=', fechaDesde.toISOString().split('T')[0]));
    }

    if (filters.fechaHasta) {
      const fechaHasta = new Date(filters.fechaHasta);
      fechaHasta.setHours(23, 59, 59, 999);
      constraints.push(where('fecha', '<=', fechaHasta.toISOString().split('T')[0]));
    }

    // Filtro por tipo de estudiante
    if (filters.filtroTipo && filters.filtroTipo !== '') {
      constraints.push(where('tipoEstudiante', '==', filters.filtroTipo));
    }

    // Filtro por modalidad
    if (filters.filtroModalidad && filters.filtroModalidad !== '') {
      constraints.push(where('modalidad', '==', filters.filtroModalidad));
    }

    // Filtro por tipo de registro
    if (filters.filtroTipoRegistro && filters.filtroTipoRegistro !== '') {
      constraints.push(where('tipoRegistro', '==', filters.filtroTipoRegistro));
    }

    // Aplicar constraints si hay
    if (constraints.length > 0) {
      q = query(q, ...constraints);
    }

    // Ejecutar query
    const querySnapshot = await getDocs(q);
    
    console.log(`📦 Documentos obtenidos: ${querySnapshot.size}`);

    // Procesar documentos
    const attendanceData = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      
      // Normalizar nombres
      if (data.nombre) data.nombre = normalizeNameCapitalization(data.nombre);
      if (data.apellidoPaterno) data.apellidoPaterno = normalizeNameCapitalization(data.apellidoPaterno);
      if (data.apellidoMaterno) data.apellidoMaterno = normalizeNameCapitalization(data.apellidoMaterno);
      
      // Agregar ID del documento
      data.docId = doc.id;
      
      attendanceData.push(data);
    });

    // Filtro por usuario específico (para admins)
    let filteredData = attendanceData;
    if (isAdmin && filters.filtroUsuario && filters.filtroUsuario !== '') {
      filteredData = attendanceData.filter(record => {
        const nombreCompleto = `${record.nombre || ''} ${record.apellidoPaterno || ''} ${record.apellidoMaterno || ''}`.trim();
        return nombreCompleto === filters.filtroUsuario;
      });
    }

    console.log(`✅ Datos filtrados: ${filteredData.length} registros`);

    return filteredData;

  } catch (error) {
    console.error('❌ Error obteniendo datos:', error);
    throw new Error('Error al obtener datos de asistencias: ' + error.message);
  }
}

/**
 * Obtener lista de usuarios únicos en un rango de fechas
 * Solo para administradores
 * @param {string} fechaDesde - Fecha desde
 * @param {string} fechaHasta - Fecha hasta
 * @returns {Promise<Array<string>>} - Array de nombres completos únicos
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
      const data = doc.data();
      const nombreCompleto = `${data.nombre || ''} ${data.apellidoPaterno || ''} ${data.apellidoMaterno || ''}`.trim();
      if (nombreCompleto) {
        usersSet.add(normalizeNameCapitalization(nombreCompleto));
      }
    });

    const users = Array.from(usersSet).sort();
    console.log(`✅ Usuarios encontrados: ${users.length}`);
    
    return users;

  } catch (error) {
    console.error('❌ Error obteniendo usuarios:', error);
    throw new Error('Error al obtener usuarios: ' + error.message);
  }
}

/**
 * Obtener nombre completo del usuario por su email
 * @param {string} email - Email del usuario
 * @returns {Promise<string>} - Nombre completo del usuario
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
      const data = querySnapshot.docs[0].data();
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
 * @param {string} name - Nombre a normalizar
 * @returns {string} - Nombre normalizado
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
 * @returns {Promise<Object>} - Resultado del test
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
