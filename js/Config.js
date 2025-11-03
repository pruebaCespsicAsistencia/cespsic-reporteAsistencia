// ========== CONFIGURACIÓN DE AMBIENTES - CESPSIC ASISTENCIAS ==========
// Este archivo contiene TODA la configuración del sistema centralizada
// IMPORTANTE: Solo cambia la variable AMBIENTE_ACTUAL para cambiar entre ambientes

// 🎯 SELECCIONAR AMBIENTE (solo cambia esta variable)
// Valores permitidos: 'PRUEBAS' o 'PRODUCCION'
const AMBIENTE_ACTUAL = 'PRUEBAS';  // 👈 Cambia aquí entre 'PRUEBAS' o 'PRODUCCION'

// ========== CONFIGURACIÓN DE AMBIENTES ==========
const AMBIENTES = {
  PRUEBAS: {
    nombre: 'PRUEBAS',
    
    // Google Sheets (YA NO SE USA - MIGRADO A FIREBASE)
    SHEET_ID: '1YLmEuA-O3Vc1fWRQ1nC_BojOUSVmzBb8QxCCsb5tQwk',
    EVIDENCIAS_FOLDER_ID: '1tt6yqPycpYT9My16frwjo_c0auz8Du_g',
    
    // Google Apps Script URL (YA NO SE USA - MIGRADO A FIREBASE)
    GOOGLE_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbw10UgiYsuGYi16MisVfk7fx-wlGU-gUmCKTz2bZmyqys_2ku1ghZ9zzv71UncZ_sXlDg/exec',
    
    // Firebase - CONFIGURACIÓN ACTIVA
    FIREBASE_CONFIG: {
      apiKey: "AIzaSyBINCTkXd77-SKnCAlcT1wU6d-kpEkEAHs",
      authDomain: "cespsic-asistencias.firebaseapp.com",
      projectId: "cespsic-asistencias",
      storageBucket: "cespsic-asistencias.firebasestorage.app",
      messagingSenderId: "249910813853",
      appId: "1:249910813853:web:f0764208f9db7727046074",
      measurementId: "G-TXEEEQGY1X"
    },
    
    // Colección de Firestore para asistencias
    FIRESTORE_COLLECTION: 'asistencias'
  },
  
  PRODUCCION: {
    nombre: 'PRODUCCIÓN',
    
    // Google Sheets (YA NO SE USA - MIGRADO A FIREBASE)
    SHEET_ID: '146Q1MG0AUCnzacqrN5kBENRuiql8o07Uts-l_gimL2I',
    EVIDENCIAS_FOLDER_ID: '1YMp3S1Ybzuusav_2Z7tWzZ0hG2_c_5Wc',
    
    // Google Apps Script URL (YA NO SE USA - MIGRADO A FIREBASE)
    GOOGLE_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbyllBO0vTORygvLlbTeRWfNXz1_Dt1khrM2z_BUxbNM6jWqEGYDqaLnd7LJs9Fl9Q9X/exec',
    
    // Firebase - CONFIGURACIÓN ACTIVA (mismo proyecto para ambos ambientes)
    FIREBASE_CONFIG: {
      apiKey: "AIzaSyBINCTkXd77-SKnCAlcT1wU6d-kpEkEAHs",
      authDomain: "cespsic-asistencias.firebaseapp.com",
      projectId: "cespsic-asistencias",
      storageBucket: "cespsic-asistencias.firebasestorage.app",
      messagingSenderId: "249910813853",
      appId: "1:249910813853:web:f0764208f9db7727046074",
      measurementId: "G-TXEEEQGY1X"
    },
    
    // Colección de Firestore para asistencias
    FIRESTORE_COLLECTION: 'asistencias'
  }
};

// ========== CONFIGURACIÓN DE AUTENTICACIÓN ==========
const AUTH_CONFIG = {
  // Google Client ID para Google Sign-In
  //PRODUCCION
  //GOOGLE_CLIENT_ID: '799841037062-kal4vump3frc2f8d33bnp4clc9amdnng.apps.googleusercontent.com',
	//PRUEBAS
	GOOGLE_CLIENT_ID: '154864030871-ck4l5krb7qm68kmp6a7rcq7h072ldm6g.apps.googleusercontent.com',
  
  // Usuarios administradores con acceso completo
  ADMIN_USERS: [
    'jose.lino.flores.madrigal@gmail.com',
    'cepsic.atencionpsicologica@gmail.com',
    'cespsic@uas.edu.mx',
    'adymadrid.22@gmail.com'
  ],
  
  // Configuración de intentos de autenticación
  MAX_AUTH_ATTEMPTS: 3
};

// ========== CONFIGURACIÓN DE CONEXIÓN ==========
const CONNECTION_CONFIG = {
  timeout: 90000,        // 90 segundos
  maxRetries: 3,         // Máximo de reintentos
  retryDelay: 2000       // Delay entre reintentos (ms)
};

// ========== MAPEO DE CAMPOS FIREBASE ==========
// Nombres de campos en Firestore (todos los 43 campos)
const FIREBASE_FIELD_MAPPING = {
  // Información de sistema
  'timestamp': 'Timestamp',
  'email': 'Email',
  'googleUserId': 'Google_User_ID',
  'nombreAutenticado': 'Nombre_Autenticado',
  'timestampAutenticacion': 'Timestamp_Autenticacion',
  
  // Ubicación
  'latitud': 'Latitud',
  'longitud': 'Longitud',
  'estadoUbicacion': 'Estado_Ubicacion',
  'ubicacionDetectada': 'Ubicacion_Detectada',
  'direccionCompleta': 'Direccion_Completa',
  'precisionGPS': 'Precision_GPS',
  'precisionGPSMetros': 'Precision_GPS_Metros',
  'validacionUbicacion': 'Validacion_Ubicacion',
  
  // Información personal
  'nombre': 'Nombre',
  'apellidoPaterno': 'Apellido_Paterno',
  'apellidoMaterno': 'Apellido_Materno',
  'tipoEstudiante': 'Tipo_Estudiante',
  'modalidad': 'Modalidad',
  
  // Registro de asistencia
  'fecha': 'Fecha',
  'hora': 'Hora',
  'tipoRegistro': 'Tipo_Registro',
  'permisoDetalle': 'Permiso_Detalle',
  'otroDetalle': 'Otro_Detalle',
  
  // Intervenciones
  'intervencionesPsicologicas': 'Intervenciones_Psicologicas',
  'ninosNinas': 'Ninos_Ninas',
  'adolescentes': 'Adolescentes',
  'adultos': 'Adultos',
  'mayores60': 'Mayores_60',
  'familia': 'Familia',
  
  // Actividades
  'actividadesRealizadas': 'Actividades_Realizadas',
  'actividadesVariasDetalle': 'Actividades_Varias_Detalle',
  'pruebasPsicologicasDetalle': 'Pruebas_Psicologicas_Detalle',
  'comentariosAdicionales': 'Comentarios_Adicionales',
  
  // Evidencias
  'totalEvidencias': 'Total_Evidencias',
  'nombresEvidencias': 'Nombres_Evidencias',
  'carpetaEvidencias': 'Carpeta_Evidencias',
  
  // Información técnica
  'tipoDispositivo': 'Tipo_Dispositivo',
  'esDesktop': 'Es_Desktop',
  'metodoGPS': 'Metodo_GPS',
  'precisionRequerida': 'Precision_Requerida',
  'infoDispositivoJSON': 'Info_Dispositivo_JSON',
  'versionHTML': 'Version_HTML',
  'registroId': 'Registro_ID'
};

// Orden de los 43 campos para exportación Excel
const EXCEL_FIELD_ORDER = [
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

// ========== OBTENER CONFIGURACIÓN ACTIVA ==========
function getConfigActual() {
  if (!AMBIENTES[AMBIENTE_ACTUAL]) {
    console.error(`❌ ERROR: Ambiente "${AMBIENTE_ACTUAL}" no existe. Usa 'PRUEBAS' o 'PRODUCCION'`);
    return AMBIENTES.PRUEBAS; // Fallback a PRUEBAS por seguridad
  }
  return AMBIENTES[AMBIENTE_ACTUAL];
}

// ========== EXPORTAR CONFIGURACIÓN ==========
const CONFIG = getConfigActual();

// Logs de confirmación
console.log('='.repeat(70));
console.log('🔧 CONFIGURACIÓN CARGADA - SISTEMA DE REPORTES CESPSIC');
console.log('='.repeat(70));
console.log(`🎯 Ambiente Activo: ${CONFIG.nombre}`);
console.log(`🔥 Firebase Project: ${CONFIG.FIREBASE_CONFIG.projectId}`);
console.log(`📊 Firestore Collection: ${CONFIG.FIRESTORE_COLLECTION}`);
console.log(`🔐 Google Client ID: ${AUTH_CONFIG.GOOGLE_CLIENT_ID.substring(0, 30)}...`);
console.log(`👥 Administradores: ${AUTH_CONFIG.ADMIN_USERS.length} usuarios`);
console.log('='.repeat(70));

// Exportar para uso en otros archivos
export { 
  CONFIG, 
  AMBIENTE_ACTUAL, 
  AUTH_CONFIG, 
  CONNECTION_CONFIG,
  FIREBASE_FIELD_MAPPING,
  EXCEL_FIELD_ORDER
};
