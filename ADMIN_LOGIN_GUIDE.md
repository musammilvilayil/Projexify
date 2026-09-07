# Admin Bootstrap & Login

Projexify does not ship with a default admin password.

## Bootstrap the first admin

Set these environment variables before the first server start:

```env
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=use-a-long-random-password
ADMIN_FIRST_NAME=System
ADMIN_LAST_NAME=Administrator
```

`ADMIN_PASSWORD` must be at least 12 characters. If an admin already exists, the bootstrap step is skipped.

After the first admin is created, remove `ADMIN_PASSWORD` from the runtime environment if your hosting workflow allows it.

## Login

Open `/login.html` and use the admin account configured above. Admin users are redirected to `/pages/admin/dashboard.html`.

## Creating users

- Public registration creates **student accounts only**.
- Admins can create student, mentor, and admin accounts from User Management.
- Creating a Center Admin requires center details and uses the protected `POST /api/auth/admin/create-center-admin` endpoint.

## Security notes

- Never commit real credentials or secrets.
- Use a long random `JWT_SECRET` in production.
- Configure SMTP credentials with your provider's app-password/API-key mechanism.
- Use HTTPS in production.
