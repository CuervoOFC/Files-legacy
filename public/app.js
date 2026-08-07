let currentUser = null

async function checkSession() {
   const res = await fetch('/api/me')
   const data = await res.json()
   if (data.user) {
      currentUser = data.user
      renderUI()
   }
   if (data.config && data.config.apiKey) {
      document.getElementById('apiKeyInput').value = data.config.apiKey
   }
}

function renderUI() {
   if (!currentUser) return
   document.getElementById('authSection').style.display = 'none'

   if (currentUser.role === 'owner') {
      document.getElementById('ownerSection').style.display = 'block'
      loadOwnerUsers()
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
         <td><strong>${u.role}</strong></td>
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
