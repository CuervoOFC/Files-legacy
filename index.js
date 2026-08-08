import express from 'express'
import session from 'express-session'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pino from 'pino'
import 'dotenv/config'
import { makeWASocket, useMultiFileAuthState } from '@itsliaaa/baileys'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))
app.use(express.static(path.join(__dirname, 'public')))
app.use(session({
   secret: process.env.SESSION_SECRET || 'secreto',
   resave: false,
   saveUninitialized: true,
   cookie: { maxAge: 24 * 60 * 60 * 1000 }
}))

const DB_FILE = './database.json'

const getStorageLimit = (role) => {
   if (role === 'owner') return 'Infinity'
   if (role === 'admin') return 225
   return 75
}

const loadDB = () => {
   if (!fs.existsSync(DB_FILE)) {
      const initial = { config: { apiKey: '' }, users: [] }
      fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2))
      return initial
   }
   return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'))
}

const saveDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2))

let sock = null
const logger = pino({ level: 'silent' })

const connectToWhatsApp = async () => {
   const { state, saveCreds } = await useMultiFileAuthState('sessions')
   sock = makeWASocket({ logger, auth: state, printQRInTerminal: false })
   sock.ev.on('creds.update', saveCreds)
   sock.ev.on('connection.update', (update) => {
      const { connection } = update
      if (connection === 'close') connectToWhatsApp()
      else if (connection === 'open') console.log('✅ Bot conectado a WhatsApp')
   })
}
connectToWhatsApp()

// --- Helper para formatear nombres de archivo ---
export const generateFileName = (userName, originalName) => {
   const ext = path.extname(originalName).toLowerCase()
   const validExtensions = ['.jpg', '.mp4', '.webp', '.gif']
   const finalExt = validExtensions.includes(ext) ? ext : '.jpg'
   const cleanName = userName.toLowerCase().replace(/\s+/g, '_')
   const randomNum = Math.floor(100000 + Math.random() * 900000)
   return `${cleanName}-${randomNum}${finalExt}`
}

// --- Middlewares de Permisos ---
const isOwner = (req, res, next) => {
   const db = loadDB()
   const user = db.users.find(u => u.id === req.session.userId)
   if (user && user.role === 'owner') next()
   else res.status(403).json({ success: false, message: '⛔ Requiere rol OWNER' })
}

const isAdmin = (req, res, next) => {
   const db = loadDB()
   const user = db.users.find(u => u.id === req.session.userId)
   if (user && (user.role === 'admin' || user.role === 'owner')) next()
   else res.status(403).json({ success: false, message: '⛔ Requiere rol ADMIN u OWNER' })
}

// --- Rutas de Usuarios ---
app.post('/api/register', (req, res) => {
   const { name, password, phone } = req.body
   const db = loadDB()
   if (db.users.some(u => u.phone === phone)) {
      return res.status(400).json({ success: false, message: 'El número ya existe.' })
   }
   const isFirstUser = db.users.length === 0
   const role = isFirstUser ? 'owner' : 'user'
   const newUser = {
      id: Date.now().toString(),
      name,
      password,
      phone,
      verified: false,
      role,
      avatar: '',
      storageLimitMB: getStorageLimit(role),
      storageUsedMB: 0
   }
   db.users.push(newUser)
   saveDB(db)
   req.session.userId = newUser.id
   res.json({ success: true, user: newUser })
})

app.post('/api/login', (req, res) => {
   const { phone, password } = req.body
   const db = loadDB()
   const user = db.users.find(u => u.phone === phone && u.password === password)
   if (!user) return res.status(401).json({ success: false, message: 'Credenciales inválidas' })
   req.session.userId = user.id
   res.json({ success: true, user })
})

app.get('/api/me', (req, res) => {
   const db = loadDB()
   const user = db.users.find(u => u.id === req.session.userId)
   res.json({ user: user || null, config: db.config || {} })
})

app.post('/api/update-profile', (req, res) => {
   const { name, password, avatar } = req.body
   const db = loadDB()
   const user = db.users.find(u => u.id === req.session.userId)
   if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado' })

   if (name) user.name = name
   if (password) user.password = password
   if (avatar) user.avatar = avatar

   saveDB(db)
   res.json({ success: true, user })
})

// --- Rutas Admin ---
app.get('/api/admin/users', isAdmin, (req, res) => {
   const db = loadDB()
   res.json({ success: true, users: db.users })
})

app.post('/api/admin/edit-user', isAdmin, (req, res) => {
   const { userId, newName, newPassword, customStorageMB } = req.body
   const db = loadDB()
   const user = db.users.find(u => u.id === userId)
   if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado' })

   if (newName) user.name = newName
   if (newPassword) user.password = newPassword
   if (customStorageMB !== undefined) user.storageLimitMB = Number(customStorageMB)

   saveDB(db)
   res.json({ success: true, message: 'Usuario actualizado correctamente.' })
})

app.post('/api/admin/pair-whatsapp', isAdmin, async (req, res) => {
   const { botPhone } = req.body
   if (!botPhone) return res.status(400).json({ success: false, message: 'Ingresa un número' })
   try {
      if (!sock || sock.authState.creds.registered) await connectToWhatsApp()
      const cleanPhone = botPhone.replace(/[^0-9]/g, '')
      const code = await sock.requestPairingCode(cleanPhone)
      res.json({ success: true, code })
   } catch (err) {
      res.status(500).json({ success: false, message: 'Error generando código de vinculación' })
   }
})

// --- Rutas Owner ---
app.get('/api/owner/users', isOwner, (req, res) => {
   const db = loadDB()
   res.json({ success: true, users: db.users })
})

app.post('/api/owner/set-api-key', isOwner, (req, res) => {
   const { apiKey } = req.body
   const db = loadDB()
   db.config.apiKey = apiKey
   saveDB(db)
   res.json({ success: true, message: 'API Key actualizada correctamente.' })
})

app.post('/api/owner/change-role', isOwner, (req, res) => {
   const { userId, newRole } = req.body
   const db = loadDB()
   const user = db.users.find(u => u.id === userId)
   if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado' })

   user.role = newRole
   user.storageLimitMB = getStorageLimit(newRole)
   saveDB(db)
   res.json({ success: true, message: `Rol actualizado a ${newRole}` })
})

app.listen(PORT, () => console.log(`🚀 Servidor ejecutándose en el puerto ${PORT}`))
