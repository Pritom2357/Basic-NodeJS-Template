# Basic NodeJS Template

A reusable Node.js backend template with authentication flow, user + subscription + avatar management, email verification, password reset, notifications (event bus + websockets) and API docs.  
I built this so I don’t need to rewrite the same boring auth + profile stuff every project 😎. Kept it simple but tried to stay mindful about basic security.

## Used stacks & packages
- PostgreSQL ([Neon](https://console.neon.tech/) hosting)  
- Express + NodeJS  
- JWT (access + refresh)  
- Google Login (idToken flow)  
- Mailtrap (email sending)  
- Cloudinary (avatar storage + basic transform) with multer memoryStorage
- Socket.io (real-time notifications)  
- Swagger (API docs)  
- [Helmet](https://helmetjs.github.io/) + Rate limit + CORS  
- [Morgan](https://www.npmjs.com/package/morgan) for better logging

---

## Why this exists
When I start a full‑stack project usually I have to 😫😫:
- Register / login / email verify
- Password reset / change
- Manage profile + avatar
- Basic subscription tiers
- Event → notification → socket chain
- Docs + rate limiting

So this template covers those into something I can plug in fast and extend.

---

## How to run
1. Copy `src/.env.example` to `.env` (leave in `src`  at the root but **never commit the real one**)
2. Fill values (DB URL, JWT secrets, etc.)
3. Install + start:
```bash
npm install
npm run start
```
4. (First time) create table:
```
GET /api/auth/init-table
```
5. Visit API docs:  
`http://localhost:3000/api/docs`  
JSON spec: `http://localhost:3000/api/docs.json`

---

## High level features 😎😎
- Local username/email + password auth
- Optional email verification (`REQUIRE_EMAIL_VERIFICATION`)
- Google OAuth login (idToken POST flow)
- Password reset (token + expiry)
- Account lock after repeated failed logins
- Subscription type update (free | plus | premium)
- Avatar upload (memory → Cloudinary with face crop + resize)
- Event bus → Notification service → Socket.io emit
- Swagger docs generation
- Rate limiting (general vs login)
- Basic logging with redaction of sensitive fields by Morgan

---

## Folder peek
```
src/
  index.js                # Entry point
  routes/                 # authRoutes.js, userRoutes.js
  controllers/            # userController.js (big brain)
  models/                 # userModel.js (Postgres queries)
  middlewares/            # authenticateToken.js (attaches user info with the requset headers)
  utils/                  # emailUtils, cloudinary helper
  events/                 # eventBus.js + eventsNames.js
  notifications/          # notificationService.js
  realtime/               # socketServer.js
  docs/                   # swaggerConfig.js
```

---

## 👉🏼👉🏼 Auth flow (quick) 
1. Register → (maybe email verify)  
2. Login → returns `accessToken` + `refreshToken` (refresh stored in DB plain for now)  
3. Frontend saves access token (currently localStorage style) → calls `/api/auth/verify-token` on load  
4. Logout → clears stored refresh token  
5. Password reset → token emailed (Mailtrap) → confirm reset  
6. Google login → verify idToken → create or link account  

---

## Subscriptions
Simple column: `subscription_type` with enum values: `free | plus | premium`.  
Update endpoint:
```
PATCH /api/user/subscription/:userId
{ "subscription_type": "plus" }
```
👉🏼 (You can later hook Stripe/Paddle webhooks to set this server-side.)

---

## Avatar upload
Flow:
1. `POST /api/user/avatar/:userId` with multipart field `avatar`
2. Multer keeps it in memory (no disk clutter)
3. Piped to Cloudinary with:
   - Resize square 400x400
   - Face crop if detectable
   - Auto quality / format
4. DB updated with `avatar_url`
5. Event emitted → socket broadcast (if you wire client side)

> 👉🏼 Old images are not deleted right now (could store `public_id` and remove previous).

---

## Notification pipeline ❕❗
Pieces:
- `eventBus` (Node EventEmitter) → pub(publisher) inside process
- `eventsNames.js` → keeps constants (e.g. `USER_LOGIN`, `USER_PROFILE_UPDATED`, `PASSWORD_RESET_REQUESTED`)
- Controllers emit events after important actions
- `notificationService.js` listens to those events and decides what to do (right now: emit over socket)
- `socketServer.js` attaches to the HTTP server and authenticates on connection (JWT at handshake)

Example path:
```
User updates profile
→ userController.updateProfile()
→ bus.emit(Events.USER_PROFILE_UPDATED, { userId, changed: [...] })
→ notificationService catches it
→ emits through socket.io to room "user:<id>" (extend this)
→ frontend listens → updates UI live
```

Future ideas:
- Persist notifications in DB
- Add unread/read states
- Swap EventEmitter with Redis Pub/Sub for multi-instance scaling
- Add email fallback for critical events

---

## Endpoints (short list) 😎😎
Full details already documented with Swagger:
```
Auth:
  GET  /api/auth/init-table
  POST /api/auth/register
  POST /api/auth/login
  POST /api/auth/google-login
  POST /api/auth/send-verification-email
  GET  /api/auth/verify-email?token=...
  GET  /api/auth/verify-token
  POST /api/auth/logout/:userId
  POST /api/auth/password/request
  POST /api/auth/password/reset
  POST /api/auth/password/change

User:
  GET    /api/user/get-profile/:userId
  PATCH  /api/user/update-profile/:userId
  PATCH  /api/user/subscription/:userId
  POST   /api/user/avatar/:userId
```
Go to `/api/docs` for schemas + payload examples.

---

## Detailed Endpoint Reference

### 0. Init Table
```
GET /api/auth/init-table
Headers: (none)
```
Creates users table if missing (idempotent). Use once at start.
Response:
```json
{ "success": true, "message": "users table ready" }
```

---

### 1. Register
```
POST /api/auth/register
Content-Type: application/json
```
Body:
```json
{
  "username": "catman",
  "email": "cat@meow.com",
  "password": "secret123"
}
```
Response (verification required):
```json
{
  "success": true,
  "message": "User registered. Please verify email.",
  "user": {
    "id": 1,
    "username": "catman",
    "email": "cat@meow.com",
    "email_verified": false,
    "subscription_type": "free",
    "requires_verification": true
  }
}
```

---

### 2. Login
```
POST /api/auth/login
Content-Type: application/json
```
Body (identifier can be username or email):
```json
{ "identifier": "catman", "password": "secret123" }
```
Success:
```json
{
  "success": true,
  "tokens": {
    "accessToken": "JWT_ACCESS",
    "refreshToken": "JWT_REFRESH"
  },
  "user": {
    "id": 1,
    "username": "catman",
    "email": "cat@meow.com",
    "subscription_type": "free"
  }
}
```
Fail (wrong creds):
```json
{ "success": false, "error": "Invalid credentials" }
```

---

### 3. Google Login
```
POST /api/auth/google-login
Content-Type: application/json
```
Body:
```json
{ "idToken": "GOOGLE_ID_TOKEN" }
```
Response similar to login (creates user if new).

---

### 4. Send Verification Email
```
POST /api/auth/send-verification-email
Content-Type: application/json
```
Body:
```json
{ "email": "cat@meow.com" }
```
Always returns success (unless spam limited):
```json
{ "success": true, "message": "If not verified, verification email sent" }
```

---

### 5. Verify Email
```
GET /api/auth/verify-email?token=VERIFICATION_TOKEN
```
Success:
```json
{ "success": true, "message": "Email verified" }
```
Fail:
```json
{ "success": false, "error": "Invalid or expired token" }
```

---

### 6. Verify Access Token
```
GET /api/auth/verify-token
Authorization: Bearer <accessToken>
```
Success:
```json
{ "success": true, "user": { "id": 1, "username": "catman", "subscription_type": "free" } }
```
401 if token bad/expired.

---

### 7. Logout
```
POST /api/auth/logout/1
Authorization: Bearer <accessToken>
```
Clears stored refresh token.
```json
{ "success": true, "message": "Logged out" }
```

---

### 8. Request Password Reset
```
POST /api/auth/password/request
Content-Type: application/json
```
Body:
```json
{ "email": "cat@meow.com" }
```
Always generic:
```json
{ "success": true, "message": "If account exists, reset email sent" }
```

---

### 9. Reset Password
```
POST /api/auth/password/reset
Content-Type: application/json
```
Body:
```json
{ "token": "RESET_TOKEN", "newPassword": "newSecret123" }
```
Success:
```json
{ "success": true, "message": "Password updated" }
```

---

### 10. Change Password (logged in)
```
POST /api/auth/password/change
Authorization: Bearer <accessToken>
Content-Type: application/json
```
Body:
```json
{ "oldPassword": "secret123", "newPassword": "evenBetter456" }
```
Success:
```json
{ "success": true, "message": "Password changed" }
```

---

### 11. Get Profile
```
GET /api/user/get-profile/1
Authorization: Bearer <accessToken>
```
Response:
```json
{
  "success": true,
  "user": {
    "id": 1,
    "username": "catman",
    "email": "cat@meow.com",
    "subscription_type": "free",
    "avatar_url": null
  }
}
```

---

### 12. Update Profile
```
PATCH /api/user/update-profile/1
Authorization: Bearer <accessToken>
Content-Type: application/json
```
Body (any allowed subset):
```json
{ "full_name": "Cat Man", "username": "catman2" }
```
Response:
```json
{ "success": true, "user": { "id": 1, "username": "catman2", "full_name": "Cat Man" } }
```

---

### 13. Change Subscription
```
PATCH /api/user/subscription/1
Authorization: Bearer <accessToken>
Content-Type: application/json
```
Body:
```json
{ "subscription_type": "plus" }
```
Success:
```json
{ "success": true, "subscription_type": "plus" }
```

---

### 14. Upload Avatar
```
POST /api/user/avatar/1
Authorization: Bearer <accessToken>
Content-Type: multipart/form-data
Field: avatar=<image file>
```
Response:
```json
{
  "success": true,
  "message": "Avatar updated",
  "avatar_url": "https://res.cloudinary.com/.../user_1_..."
}
```
Errors:
```json
{ "success": false, "error": "File too large (max 2MB)" }
```

---

## Environment variables (summary)
See `.env.example` for full list. Main ones:
```
DATABASE_URL=
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
ACCESS_TOKEN_TTL=30m
REFRESH_TOKEN_DAYS=30
REQUIRE_EMAIL_VERIFICATION=true
MAILTRAP_TOKEN=
CLOUDINARY_*= 
ENABLE_WEBSOCKETS=true
ENABLE_SWAGGER=true
```

---

## Notification rooms (you can add)
```
socket.join('user:' + userId)
io.to('user:' + userId).emit('something', payload)
```

It is important for extending the notifications features. ❕❕

---

## API Docs
Swagger UI:
```
http://localhost:3000/api/docs
```
Raw JSON:
```
http://localhost:3000/api/docs.json
```

---

## Common gotchas 🤯🤯
| Issue | Fix |
|-------|-----|
| 401 on protected route | Ensure `Authorization: Bearer <accessToken>` header |
| Avatar upload fails | Check mimetype + size < `MAX_AVATAR_SIZE_BYTES` |
| Google login fails | Wrong `GOOGLE_CLIENT_ID` or invalid idToken |
| Verification email not sending | Missing `MAILTRAP_TOKEN` or disabled flag |
| Socket not connecting | Check `ENABLE_WEBSOCKETS=true` |

---

## Contributing
1. Fork / branch
2. Add feature
3. Run lints/tests (when added)
4. PR with short description

---

## Disclaimer
It is moderately basic implementation. There are a lot of ways to make it more robust, more secure and more user friendly. But this is the limit of me until now 🙂🙂, hopefully, I will update it as I learn new things.

