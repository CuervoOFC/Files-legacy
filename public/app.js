let currentUser = null

// --- Toggle Tema Claro / Oscuro ---
document.getElementById('themeToggle').addEventListener('click', () => {
   const currentTheme = document.documentElement.getAttribute('data-theme')
   const newTheme = currentTheme === 'dark' ? 'light' : 'dark'
   document.documentElement.setAttribute('data-theme', newTheme)
})

async function checkSession() {
   const res = await fetch('/api/me')
   const data = await res.json()
   if (data.user) {
      currentUser = data.user
      renderUI()
   }
   if (data.config && data.config.apiKey) {
      const apiKeyElem = document.getElementById('apiKeyInput')
      if (apiKeyElem) apiKeyElem.value = data.config.apiKey
   }
}

function renderUI() {
   if (!currentUser) return

   document.getElementById('authSection').style.display = 'none'
   document.getElementById('profileSection').style.display = 'block'

   document.getElementById('userNameText').innerText = currentUser.name
   document.getElementById('userPhoneText').innerText = currentUser.phone
   document.getElementById('userRoleBadge').innerText = currentUser.role.toUpperCase()
   
   const storageLimit = currentUser.role === 'owner' ? '∞ Ilimitado' : `${currentUser.storageLimitMB || 75} MB`
   document.getElementById('userStorageText').innerText = `${currentUser.storageUsedMB || 0} MB / ${storageLimit}`

   if (currentUser.avatar) document.getElementById('userAvatar').src = currentUser.avatar

   const ownerSec = document.getElementById('ownerSection')
   const adminSec = document.getElementById('adminSection')

   if (currentUser.role === 'owner') {
      ownerSec.style.display = 'block'
      adminSec.style.display = 'none'
      loadOwnerUsers()
   } else if (currentUser.role === 'admin') {
      ownerSec.style.display = 'none'
      adminSec.style.display = 'block'
      loadAdminUsers()
   } else {
      ownerSec.style.display = 'none'
      adminSec.style.display = 'none'
   }
}

async function register() {
   const name = document.getElementById('authName').value
   const phone = document.getElementById('authPhone').value
   const password = document.getElementById('authPassword').value

   const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, password })
   })
   const data = await res.json()
   if (data.success) {
      currentUser = data.user
      renderUI()
   } else alert(data.message)
}

async function login() {
   const phone = document.getElementById('authPhone').value
   const password = document.getElementById('authPassword').value

   const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password })
   })
   const data = await res.json()
   if (data.success) {
      currentUser = data.user
      renderUI()
   } else alert(data.message)
}

async function updateProfile() {
   const name = document.getElementById('editName').value
   const password = document.getElementById('editPassword').value
   const avatar = document.getElementById('editAvatar').value

   const res = await fetch('/api/update-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password, avatar })
   })
   const data = await res.json()
   if (data.success) {
      currentUser = data.user
      renderUI()
      alert('Perfil actualizado con éxito.')
   }
}

function logout() {
   location.reload()
}

// --- Lógica de Admin ---
async function loadAdminUsers() {
   const res = await fetch('/api/admin/users')
   const data = await res.json()
   if (!data.success) return alert(data.message)

   const table = document.getElementById('adminUsersTable')
   table.innerHTML = ''
   
   data.users.forEach(u => {
      const limitText = u.role === 'owner' ? '∞ Ilimitado' : `${u.storageLimitMB || 75} MB`
      const row = document.createElement('tr')
      row.innerHTML = `
         <td>${u.name}</td>
         <td>${u.phone}</td>
         <td><strong>${u.role.toUpperCase()}</strong></td>
         <td>${limitText}</td>
         <td>
            <button style="padding:4px 8px;" onclick="openEditModal('${u.id}', '${u.name}', ${u.storageLimitMB || 75})">✏️ Editar</button>
         </td>
      `
      table.appendChild(row)
   })
}

function openEditModal(id, name, storage) {
   document.getElementById('editUserId').value = id
   document.getElementById('adminEditName').value = name
   document.getElementById('adminEditStorage').value = storage
   document.getElementById('adminEditModal').style.display = 'block'
}

function closeEditModal() {
   document.getElementById('adminEditModal').style.display = 'none'
}

async function saveUserFromAdmin() {
   const userId = document.getElementById('editUserId').value
   const newName = document.getElementById('adminEditName').value
   const newPassword = document.getElementById('adminEditPassword').value
   const customStorageMB = document.getElementById('adminEditStorage').value

   const res = await fetch('/api/admin/edit-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, newName, newPassword, customStorageMB })
   })
   const data = await res.json()
   alert(data.message)
   if (data.success) {
      closeEditModal()
      loadAdminUsers()
   }
}

async function requestPairingAdmin() {
   const botPhone = document.getElementById('adminBotPhoneInput').value
   const res = await fetch('/api/admin/pair-whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botPhone })
   })
   const data = await res.json()
   if (data.success) {
      document.getElementById('adminPairingCodeDisplay').innerText = `CÓDIGO: ${data.code}`
   } else alert(data.message)
}

// --- Lógica de Owner ---
async function saveApiKey() {
   const apiKey = document.getElementById('apiKeyInput').value
   const res = await fetch('/api/owner/set-api-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey })
   })
   const data = await res.json()
   alert(data.message)
}

async function requestPairing() {
   const botPhone = document.getElementById('botPhoneInput').value
   const res = await fetch('/api/admin/pair-whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botPhone })
   })
   const data = await res.json()
   if (data.success) {
      document.getElementById('pairingCodeDisplay').innerText = `CÓDIGO: ${data.code}`
   } else alert(data.message)
}

async function loadOwnerUsers() {
   const res = await fetch('/api/owner/users')
   const data = await res.json()
   if (!data.success) return

   const table = document.getElementById('ownerUsersTable')
   table.innerHTML = ''
   data.users.forEach(u => {
      const row = document.createElement('tr')
      row.innerHTML = `
         <td>${u.name}</td>
         <td>${u.phone}</td>
         <td><strong>${u.role.toUpperCase()}</strong></td>
         <td>
            <button onclick="changeRole('${u.id}', 'admin')">Dar Admin</button>
            <button onclick="changeRole('${u.id}', 'user')">Quitar Admin</button>
         </td>
      `
      table.appendChild(row)
   })
}

async function changeRole(userId, newRole) {
   const res = await fetch('/api/owner/change-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, newRole })
   })
   const data = await res.json()
   alert(data.message)
   loadOwnerUsers()
}

checkSession()
