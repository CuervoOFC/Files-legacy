import express from 'express'
import session from 'express-session'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pino from 'pino'
import { Boom } from '@hapi/boom'
import 'dotenv/config'
import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@itsliaaa/baileys'

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
const loadDB = () => {
   if (!fs.existsSync(DB_FILE)) {
      const initial = { config: { apiKey: '' }, users: [], verificationCodes: {} }
      fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2))
      return initial
   }
   return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'))
}

const saveDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2))

let sock = null
const logger = pino({ level: 'silent' })

// --- Vinculación e Inicio de WhatsApp
const connectToWhatsApp = async (phoneNumber = null) => {
   const { state, saveCreds } = await useMultiFileAuthState('sessions')

   sock = makeWASocket({
      logger,
      auth: state,
      printQRInTerminal: false
   })

   sock.ev.on('creds.update', saveCreds)

   sock.ev.on('connection.update', async (update) => {
      const { connection } = update
      if (connection === 'close') {
         connectToWhatsApp()
      } else if (connection === 'open') {
         console.log('✅ Bot conectado a WhatsApp')
      }
   })

   // Generar Pairing Code si se recibe un número de teléfono
   if (phoneNumber && !sock.authState.creds.registered) {
      setTimeout(async () => {
         try {
            const cleanPhone = phoneNumber.replace(/[^0-9]/g, '')
            const code = await sock.requestPairingCode(cleanPhone)
            console.log(`📱 Código generado: ${code}`)
            return code
         } catch (err) {
            console.error('Error al generar código:', err)
         }
      }, 3000)
   }
}

connectToWhatsApp()

// --- Middlewares de Permisos
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
   else res.status(403).json({ success: false, message: '⛔ Requiere rol ADMIN o OWNER' })
}

// --- Rutas de Autenticación
app.post('/api/register', (req, res) => {
   const { name, password, phone } = req.body
   const db = loadDB()

   if (db.users.some(u => u.phone === phone)) {
      return res.status(400).json({ success: false, message: 'El número ya existe.' })
   }

   const isFirstUser = db.users.length === 0
   const newUser = {
      id: Date.now().toString(),
      name,
      password,
      phone,
      verified: false,
      role: isFirstUser ? 'owner' : 'user' // El primer usuario registrado es OWNER
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

// --- Rutas exclusivas del OWNER
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
   saveDB(db)
   res.json({ success: true, message: `Rol cambiado a ${newRole}` })
})

// --- Generar código de vinculación de WhatsApp (Owner/Admin)
app.post('/api/admin/pair-whatsapp', isAdmin, async (req, res) => {
   const { botPhone } = req.body
   if (!botPhone) return res.status(400).json({ success: false, message: 'Ingresa un número' })

   try {
      if (!sock || sock.authState.creds.registered) {
         await connectToWhatsApp()
      }
      const cleanPhone = botPhone.replace(/[^0-9]/g, '')
      const code = await sock.requestPairingCode(cleanPhone)
      res.json({ success: true, code })
   } catch (err) {
      res.status(500).json({ success: false, message: 'Error generando el código de vinculación' })
   }
})

app.listen(PORT, () => console.log(`🚀 Servidor listo en puerto ${PORT}`))
