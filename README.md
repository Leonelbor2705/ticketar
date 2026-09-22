# TicketAR — Plataforma de Venta de Entradas

Sistema completo de ticketing con:
- Venta de entradas con etapas de precios (Early Bird / Preventa / General / VIP)
- Pago con Mercado Pago QR, tarjeta de crédito/débito, transferencia
- Entradas personalizadas con QR único por comprador
- Panel de administración completo (ABM de eventos, órdenes, usuarios)
- Escáner/validador de QR para control de ingreso
- Envío de entradas por email

---

## 🚀 INSTALACIÓN LOCAL (desarrollo)

### Requisitos
- Node.js 18 o superior
- npm

### Pasos

```bash
# 1. Entrar al backend
cd backend

# 2. Instalar dependencias
npm install

# 3. Copiar el archivo de configuración
cp .env.example .env

# 4. Editar .env con tus datos (credenciales MP, email SMTP, etc.)
nano .env   # o cualquier editor

# 5. Inicializar la base de datos
npm run init-db

# 6. Iniciar el servidor
npm start

# El servidor corre en http://localhost:3000
# API disponible en http://localhost:3000/api
# Frontend servido desde http://localhost:3000
```

---

## 🌐 DEPLOY EN HOSTING

### Opción A — Railway.app (recomendado, gratis)

1. Creá una cuenta en https://railway.app
2. Conectá tu repositorio de GitHub
3. Seleccioná la carpeta `backend` como raíz del proyecto
4. Añadí las variables de entorno desde el panel de Railway (copiá el contenido de `.env.example`)
5. Railway detecta Node.js automáticamente y despliega

### Opción B — Render.com (gratis)

1. Creá cuenta en https://render.com
2. New Web Service → conectá tu repo
3. Root Directory: `backend`
4. Build Command: `npm install && npm run init-db`
5. Start Command: `npm start`
6. Añadí las variables de entorno en la sección "Environment"

### Opción C — VPS (DigitalOcean, Vultr, etc.)

```bash
# En el servidor
git clone tu-repo
cd ticketar/backend
npm install
npm run init-db

# Con PM2 para mantenerlo corriendo
npm install -g pm2
pm2 start server.js --name ticketar
pm2 save
pm2 startup

# Nginx como reverse proxy (recomendado)
# /etc/nginx/sites-available/ticketar
server {
    listen 80;
    server_name tudominio.com;
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Opción D — Heroku

```bash
# Agregar Procfile en backend/
echo "web: node server.js" > Procfile

heroku create ticketar-app
heroku config:set $(cat .env | grep -v '^#' | xargs)
git push heroku main
```

---

## ⚙️ CONFIGURACIÓN DE MERCADO PAGO

1. Ingresá a https://mercadopago.com.ar/developers
2. Creá una nueva aplicación
3. Copiá las credenciales en el archivo `.env`:
   ```
   MP_ACCESS_TOKEN=APP_USR-tu-token-real
   MP_PUBLIC_KEY=APP_USR-tu-public-key
   ```
4. En la sección "Webhooks" de MP Developer, configurá:
   - URL: `https://tu-dominio.com/api/payments/mp/webhook`
   - Eventos: `payment`
5. Reiniciá el servidor

---

## 📧 CONFIGURACIÓN DE EMAIL (Gmail)

1. Activá la verificación en 2 pasos en tu cuenta Gmail
2. Generá una "App Password" en https://myaccount.google.com/apppasswords
3. Configurá en `.env`:
   ```
   SMTP_USER=tu-email@gmail.com
   SMTP_PASS=la-app-password-generada
   ```

---

## 📁 ESTRUCTURA DEL PROYECTO

```
ticketar/
├── backend/
│   ├── server.js          ← Servidor principal Express
│   ├── package.json
│   ├── .env.example       ← Plantilla de configuración
│   ├── routes/
│   │   ├── auth.js        ← Login, usuarios (ABM)
│   │   ├── events.js      ← Eventos y etapas (ABM)
│   │   ├── orders.js      ← Órdenes de compra
│   │   ├── payments.js    ← Mercado Pago integration
│   │   └── tickets.js     ← Validación QR
│   ├── middleware/
│   │   └── auth.js        ← JWT middleware
│   └── utils/
│       ├── db.js          ← Conexión SQLite
│       ├── initDb.js      ← Inicialización DB
│       └── mailer.js      ← Envío de emails
└── frontend/
    └── public/
        ├── index.html     ← SPA principal
        ├── css/
        │   └── style.css  ← Estilos (azul/rojo/blanco)
        └── js/
            ├── api.js     ← Cliente API
            └── app.js     ← Lógica SPA completa
```

---

## 🔐 USUARIOS POR DEFECTO

| Usuario   | Contraseña           | Rol         |
|-----------|---------------------|-------------|
| admin     | (definido en .env)  | Administrador |

> ⚠️ Cambiá la contraseña del admin en el archivo `.env` antes de hacer el deploy

---

## 🛠️ API ENDPOINTS

### Públicos (sin autenticación)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | /api/events | Lista de eventos activos |
| GET | /api/events/:id | Detalle de evento |
| POST | /api/orders | Crear orden de compra |
| GET | /api/orders/:id | Detalle de orden |
| POST | /api/payments/mp/preference | Crear preferencia MP |
| POST | /api/payments/mp/webhook | Webhook de Mercado Pago |

### Protegidos (requieren JWT)
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | /api/auth/login | Login |
| GET | /api/auth/me | Datos del usuario actual |
| GET | /api/auth/users | Listar usuarios (admin) |
| POST | /api/auth/users | Crear usuario (admin) |
| GET | /api/events/all | Todos los eventos (admin) |
| POST | /api/events | Crear evento |
| PUT | /api/events/:id | Editar evento |
| GET | /api/orders | Listar órdenes |
| POST | /api/tickets/validate | Validar entrada QR |
| GET | /api/payments/dashboard | Stats financieras |

---

## 📄 LICENCIA

MIT — Libre para uso comercial y personal

