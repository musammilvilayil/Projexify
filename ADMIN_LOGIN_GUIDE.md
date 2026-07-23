# Admin Login Guide & Troubleshooting

## Default Admin Credentials

When the server starts, it automatically creates a default admin user:

- **Email:** `admin@nexus.com`
- **Password:** `Admin@123456`

## How to Log In as Admin

1. Navigate to `http://localhost:3005/login.html`
2. Enter the admin credentials above
3. Click "Sign In"
4. You will be redirected to `/pages/admin/dashboard.html`

## Troubleshooting Admin Login Issues

### Issue: "Invalid email or password"

**Possible causes:**
1. **Wrong credentials** - Make sure you're using the exact credentials above
2. **Admin user was deleted** - The admin user might have been removed from the database
3. **Database connection issue** - MongoDB might not be running

**Solutions:**

#### 1. Verify MongoDB is running
```bash
# Check if MongoDB is running
mongod --version

# Start MongoDB if not running
sudo systemctl start mongod  # Linux
brew services start mongodb-community  # macOS
net start MongoDB  # Windows
```

#### 2. Check server logs
When you start the server, you should see:
```
🌱 Admin user already exists: admin@nexus.com
```
or
```
🌱 Seeding admin user...
✅ Created admin user (admin@nexus.com / Admin@123456)
```

If you don't see these messages, the seed might have failed.

#### 3. Reset the admin user
If the admin user was deleted, you can recreate it by:

**Option A: Restart the server**
```bash
npm start
```
The seed service will automatically create the admin user if it doesn't exist.

**Option B: Manually create admin via MongoDB**
```javascript
// Connect to MongoDB and run this in mongo shell
use nexus;
db.users.insertOne({
  email: 'admin@nexus.com',
  password: '$2a$10$...', // Will be hashed automatically
  firstName: 'System',
  lastName: 'Administrator',
  roles: ['admin'],
  verified: true,
  created_at: new Date(),
  updated_at: new Date()
});
```

**Option C: Use the API directly**
```bash
# First, if you have any other admin user, use them to create a new admin
curl -X POST http://localhost:3005/api/auth/admin/create-center-admin \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newadmin@nexus.com",
    "password": "NewAdmin@123",
    "firstName": "New",
    "lastName": "Admin",
    "centerName": "Main Center",
    "centerEmail": "center@nexus.com"
  }'
```

### Issue: Login succeeds but redirects to wrong page

**Cause:** The user's role might not be set to 'admin'

**Solution:** Check the user's roles in the database:
```javascript
// In MongoDB shell
db.users.findOne({ email: 'admin@nexus.com' }, { email: 1, roles: 1 })
```

The roles should be: `["admin"]`

If not, update it:
```javascript
db.users.updateOne(
  { email: 'admin@nexus.com' },
  { $set: { roles: ['admin'] } }
);
```

### Issue: "Center not found" error after login

**Cause:** This error occurs for center_admin users who don't have a center associated with their account.

**Solution:** This is expected behavior for center_admins created by admin without a center. They should:
1. See a message saying "No center found"
2. Click "Register Your Center" button
3. Fill out the center registration form
4. Wait for admin approval

For center_admins created via the admin dashboard using the "Center Admin" role, a center is automatically created and linked to their account.

## Creating Additional Admin Users

Currently, only the initial admin user is created automatically. To create additional admins:

1. Log in as the default admin
2. Use MongoDB directly or create an admin management interface
3. Or modify the seed service to create multiple admins

## Security Notes

- **Change the default admin password** immediately after first login
- Store admin credentials securely
- Use strong, unique passwords
- Consider implementing 2FA for admin accounts

## Support

If you continue to have login issues:
1. Check the browser console for JavaScript errors
2. Check the server logs for backend errors
3. Verify MongoDB connection string in `.env` file
4. Ensure all dependencies are installed: `npm install`