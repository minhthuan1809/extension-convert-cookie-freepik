# extension-convert-cookie-freepik

Cookie Switcher Backend (SQLite)

Backend receives requests from cookie-switcher-extension/popup.js and stores cookie profiles in SQLite.

Endpoints
- GET /api?action=list_profiles
- POST /api
  - upsert: body { id, cookie, status }
  - update: body { action: 'update', id, cookie, status }
  - delete: body { action: 'delete', id }

Run local
cd backend
npm install
set PORT=3000
node server.js

Extension API URL
http://localhost:3000/api
"# extension-convert-cookie-freepik" 
