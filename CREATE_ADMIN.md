# Create First Admin User

## Option 1: Using Backend API (Easiest)

1. Start the backend server:
```bash
cd backend
npm start
```

2. Create the first admin using curl or Postman:

**PowerShell:**
```powershell
$body = @{
    userId = "admin"
    email = "admin@example.com"
    password = "Admin123!"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3001/api/auth/setup-admin" -Method POST -Body $body -ContentType "application/json"
```

**curl:**
```bash
curl -X POST http://localhost:3001/api/auth/setup-admin \
  -H "Content-Type: application/json" \
  -d '{"userId":"admin","email":"admin@example.com","password":"Admin123!"}'
```

3. Use these credentials:
   - **Username**: `admin`
   - **Password**: `Admin123!`

4. Login to admin dashboard or Chrome extension with these credentials

---

## Option 2: Create Regular User

After admin is created, you can create additional users via:

**PowerShell:**
```powershell
$token = "YOUR_ADMIN_TOKEN_HERE"
$body = @{
    userId = "salesperson1"
    email = "sales@example.com"
    password = "Pass123!"
    role = "user"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3001/api/auth/register" -Method POST -Body $body -ContentType "application/json" -Headers @{Authorization="Bearer $token"}
```

---

## Security Note

**IMPORTANT**: After creating your first admin, you should:
1. Remove or disable the `/api/auth/setup-admin` endpoint in production
2. Change the default password immediately
3. Use strong passwords for all accounts
