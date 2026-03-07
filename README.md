# VTI Gap Trading Alert Bot

Sistema automatizado de alertas de trading que monitorea múltiples activos financieros (ETFs y acciones) durante la ventana de oportunidad entre la apertura de NYSE y la actualización de precios de Fintual.

## Descripción

Este bot detecta subidas significativas (≥1.5%) en activos configurados durante el período entre las 11:30 y 13:30 hora Chile, enviando alertas vía Telegram para aprovechar oportunidades de arbitraje antes de que Fintual actualice sus precios.

## Características

- Monitoreo simultáneo de múltiples activos (ETFs y acciones)
- Detección independiente de cambios porcentuales por activo
- Alertas automáticas vía Telegram
- Persistencia de señales en MongoDB para análisis histórico
- Ejecución automatizada mediante cron jobs
- Manejo robusto de errores por activo

## Requisitos Previos

- Node.js 18 o superior
- MongoDB (local o Atlas)
- Bot de Telegram configurado
- API key para datos de mercado (Alpha Vantage, Yahoo Finance, etc.)

## Instalación

### 1. Clonar el repositorio

```bash
git clone <repository-url>
cd RiskyNorris
```

### 2. Instalar dependencias

```bash
npm install
```

Las dependencias principales incluyen:
- `mongoose`: Cliente MongoDB para persistencia de datos
- `node-telegram-bot-api`: Cliente para envío de notificaciones
- `node-cron`: Programación de tareas automatizadas
- `axios`: Cliente HTTP para APIs de mercado
- `moment-timezone`: Manejo de zonas horarias
- `dotenv`: Gestión de variables de entorno

### 3. Dependencias de desarrollo

```bash
npm install --save-dev
```

Incluye:
- `jest`: Framework de testing
- `fast-check`: Property-based testing
- `typescript`: Compilador TypeScript
- `ts-node`: Ejecución directa de TypeScript
- `mongodb-memory-server`: Base de datos en memoria para tests

## Configuración

### 1. Variables de Entorno

Copia el archivo de ejemplo y configura tus valores:

```bash
cp .env.example .env
```

Edita el archivo `.env` con tus credenciales:

```env
# Telegram Configuration (REQUERIDO)
TELEGRAM_TOKEN=tu_token_de_telegram
TELEGRAM_CHAT_ID=tu_chat_id

# Database Configuration (REQUERIDO)
MONGO_URI=mongodb://localhost:27017/trading-bot

# Market Data API (REQUERIDO)
PRIMARY_API_KEY=tu_api_key_primaria
SECONDARY_API_KEY=tu_api_key_secundaria  # Opcional

# Trading Configuration (OPCIONAL)
ASSET_LIST=VTI,SPY,QQQ
PRICE_CHANGE_THRESHOLD=1.5
MONITORING_INTERVAL=5

# Schedule Configuration (OPCIONAL)
START_TIME=11:30
END_TIME=13:30
TIMEZONE=America/Santiago
```

### 2. Configurar Bot de Telegram

1. Abre Telegram y busca `@BotFather`
2. Envía `/newbot` y sigue las instrucciones
3. Copia el token que te proporciona
4. Para obtener tu Chat ID:
   - Envía un mensaje a tu bot
   - Visita: `https://api.telegram.org/bot<TU_TOKEN>/getUpdates`
   - Busca el campo `"chat":{"id":...}`

### 3. Configurar MongoDB

**Opción A: MongoDB Local**
```bash
# Instalar MongoDB
# En Ubuntu/Debian:
sudo apt-get install mongodb

# Iniciar servicio
sudo systemctl start mongodb

# Usar en .env:
MONGO_URI=mongodb://localhost:27017/trading-bot
```

**Opción B: MongoDB Atlas (Cloud)**
1. Crea una cuenta en [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Crea un cluster gratuito
3. Configura acceso de red (IP whitelist)
4. Obtén la connection string
5. Usa en `.env`:
```env
MONGO_URI=mongodb+srv://usuario:password@cluster.mongodb.net/trading-bot
```

### 4. Obtener API Key para Datos de Mercado

**Opción recomendada: Alpha Vantage**
1. Visita [Alpha Vantage](https://www.alphavantage.co/support/#api-key)
2. Registra una cuenta gratuita
3. Copia tu API key
4. Configura en `.env`:
```env
PRIMARY_API_KEY=tu_api_key_de_alpha_vantage
```

## Gestión de Activos

### Agregar o Quitar Activos de la Lista

La lista de activos a monitorear se configura mediante la variable de entorno `ASSET_LIST`:

```env
# Monitorear un solo activo
ASSET_LIST=VTI

# Monitorear múltiples activos (separados por comas)
ASSET_LIST=VTI,SPY,QQQ,AAPL,MSFT,GOOGL

# Mezclar ETFs y acciones
ASSET_LIST=VTI,SPY,AAPL,TSLA
```

**Pasos para modificar la lista:**

1. Edita el archivo `.env`
2. Actualiza la variable `ASSET_LIST` con los símbolos deseados
3. Reinicia el bot para aplicar los cambios

**Símbolos válidos:**
- ETFs: VTI, SPY, QQQ, IWM, DIA, etc.
- Acciones: AAPL, MSFT, GOOGL, AMZN, TSLA, etc.
- Formato: Símbolos en mayúsculas, separados por comas, sin espacios

**Notas importantes:**
- El bot valida cada símbolo al iniciar
- Símbolos inválidos se excluyen automáticamente con advertencia en logs
- Cada activo se monitorea independientemente
- El historial de señales de activos removidos se mantiene en la base de datos

## Ejecución

### Modo Desarrollo

Ejecuta el bot directamente con TypeScript:

```bash
npm run dev
```

### Modo Producción

Compila y ejecuta el código JavaScript:

```bash
# Compilar TypeScript a JavaScript
npm run build

# Ejecutar el bot
npm start
```

### Ejecución Automatizada

El bot está diseñado para ejecutarse automáticamente mediante cron jobs internos. Una vez iniciado:

- Se activa automáticamente a las 11:30 hora Chile (lunes a viernes)
- Monitorea precios cada 5 minutos (configurable)
- Finaliza automáticamente a las 13:30 hora Chile
- Envía resumen diario al finalizar

Para mantener el bot corriendo permanentemente, usa un process manager como PM2:

```bash
# Instalar PM2
npm install -g pm2

# Iniciar bot con PM2
pm2 start dist/index.js --name trading-bot

# Ver logs
pm2 logs trading-bot

# Reiniciar
pm2 restart trading-bot

# Detener
pm2 stop trading-bot

# Configurar inicio automático al reiniciar el sistema
pm2 startup
pm2 save
```

## Testing

### Ejecutar Todos los Tests

```bash
npm test
```

### Ejecutar Tests en Modo Watch

```bash
npm run test:watch
```

### Ejecutar Tests con Cobertura

```bash
npm run test:coverage
```

### Tipos de Tests

El proyecto incluye tres tipos de tests:

**1. Unit Tests**
- Verifican funcionalidad específica de componentes individuales
- Ubicación: `tests/*.test.ts`
- Ejemplo: `tests/config.test.ts`, `tests/alert-generator.test.ts`

**2. Property-Based Tests**
- Verifican propiedades universales con datos aleatorios
- Usan la librería `fast-check`
- Ubicación: `tests/*.property.test.ts`
- Ejemplo: `tests/percentage-calculation.property.test.ts`

**3. Integration Tests**
- Verifican flujos completos del sistema
- Usan MongoDB en memoria
- Ubicación: `tests/integration.test.ts`

### Ejecutar Tests Específicos

```bash
# Solo unit tests
npm test -- --testPathPattern="test.ts$"

# Solo property tests
npm test -- --testPathPattern="property.test.ts$"

# Test específico
npm test -- tests/config.test.ts

# Con verbose output
npm test -- --verbose
```

## Estructura del Proyecto

```
RiskyNorris/
├── src/
│   ├── services/          # Servicios principales
│   │   ├── TradingBotController.ts
│   │   ├── AssetMonitor.ts
│   │   ├── AlertGenerator.ts
│   │   ├── PriceTracker.ts
│   │   ├── NotificationService.ts
│   │   ├── MarketAPIClient.ts
│   │   ├── DatabaseService.ts
│   │   ├── TradingScheduler.ts
│   │   └── Logger.ts
│   ├── models/            # Modelos de datos (Mongoose)
│   ├── types/             # Definiciones de tipos TypeScript
│   ├── utils/             # Utilidades y helpers
│   │   ├── config.ts
│   │   └── errorHandling.ts
│   └── index.ts           # Punto de entrada
├── tests/                 # Tests unitarios y de integración
├── dist/                  # Código compilado (generado)
├── .env                   # Variables de entorno (no versionado)
├── .env.example           # Plantilla de configuración
├── package.json           # Dependencias y scripts
├── tsconfig.json          # Configuración TypeScript
├── jest.config.js         # Configuración Jest
└── README.md              # Este archivo
```

## Funcionamiento

### Flujo de Operación

1. **Inicio (11:30 AM Chile)**
   - El bot se activa automáticamente
   - Obtiene el precio base de cada activo en `ASSET_LIST`
   - Almacena los precios base en memoria y base de datos

2. **Monitoreo (11:30 - 13:30)**
   - Cada 5 minutos (configurable):
     - Obtiene precio actual de cada activo
     - Calcula cambio porcentual: `((precio_actual - precio_base) / precio_base) * 100`
     - Si cambio ≥ 1.5% y no se ha alertado hoy:
       - Crea señal en base de datos
       - Envía alerta vía Telegram

3. **Finalización (13:30 PM Chile)**
   - Detiene el monitoreo
   - Envía resumen diario
   - Limpia estado en memoria

### Formato de Alertas

Las alertas de Telegram incluyen:
- Símbolo del activo (ej: VTI)
- Precio actual del mercado
- Cambio porcentual desde las 11:30
- Hora de la alerta
- Recomendación de acción

Ejemplo:
```
🚀 Alerta de Trading

Activo: VTI
Precio Mercado: $245.80
Cambio: +2.15%
Hora: 12:05 PM

💡 Recomendación: Comprar en Fintual antes de las 13:30
```

## Solución de Problemas

### El bot no inicia

**Verificar configuración:**
```bash
# Revisar que todas las variables requeridas estén configuradas
cat .env

# Verificar conexión a MongoDB
mongosh $MONGO_URI

# Verificar que el bot de Telegram responde
curl https://api.telegram.org/bot<TU_TOKEN>/getMe
```

### No se reciben alertas

**Posibles causas:**
1. Ningún activo superó el umbral del 1.5%
2. Ya se envió una alerta para ese activo hoy
3. Error en la API de Telegram

**Verificar logs:**
```bash
# Si usas PM2
pm2 logs trading-bot

# Si ejecutas directamente
# Los logs se muestran en consola
```

### Errores de API de mercado

**Si la API primaria falla:**
- El bot automáticamente intenta la API secundaria
- Configura `SECONDARY_API_KEY` para mayor resiliencia

**Rate limiting:**
- Alpha Vantage free tier: 5 llamadas/minuto, 500/día
- Ajusta `MONITORING_INTERVAL` si es necesario
- Considera una API key premium para más activos

### Errores de base de datos

**Conexión rechazada:**
```bash
# Verificar que MongoDB está corriendo
sudo systemctl status mongodb

# O para MongoDB Atlas, verificar IP whitelist
```

**Reintentos automáticos:**
- El bot reintenta conexión cada 30 segundos
- Revisa logs para detalles del error

## Logs y Monitoreo

### Niveles de Log

- **ERROR**: Errores fatales, configuración faltante
- **WARN**: Errores recuperables, símbolos inválidos
- **INFO**: Operaciones normales, señales generadas
- **DEBUG**: Detalles de flujo, actualizaciones de precio

### Eventos Importantes Registrados

- Inicio del bot con configuración
- Captura de precios base por activo
- Actualizaciones de precio (DEBUG)
- Generación de señales
- Errores de API o base de datos
- Resumen diario al finalizar

## Contribuir

### Ejecutar Tests Antes de Commit

```bash
npm test
npm run test:coverage
```

### Compilar TypeScript

```bash
npm run build
```

### Estilo de Código

El proyecto usa TypeScript con configuración estricta. Asegúrate de que tu código:
- Pasa la compilación sin errores: `npm run build`
- Pasa todos los tests: `npm test`
- Sigue las convenciones de nombres del proyecto

## Licencia

ISC

## Soporte

Para reportar problemas o solicitar funcionalidades, abre un issue en el repositorio.
