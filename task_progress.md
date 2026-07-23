# Task Progress - Fix Center Admin & Project Creation Issues

## Problems Identified

1. **Admin creates center_admin user via user management page** - The form at `/pages/admin/user-management.html` uses `window.api.register()` which hits `POST /api/auth/register`. This only creates the user, but does NOT create a center. No center record exists for this admin, so when they login and `getMyCenter()` is called, it returns 404.

2. **Project creation & marketplace visibility** - Since center admins have no center, they can't create projects (projects require a valid centerId linked to the admin). Projects also need `status: 'active'` to appear on marketplace.

3. **Admin user management page should use the `create-center-admin` endpoint** when creating center_admin users, which creates BOTH the user AND the center simultaneously.

## Fixes Needed

- [ ] Fix admin user management page to use `POST /api/auth/admin/create-center-admin` when creating center_admin users
- [ ] Add center registration fields to the user creation form when role is "center_admin"
- [ ] Center admin dashboard should handle the case when no center exists
- [ ] Ensure projects created have proper status for marketplace visibility
- [ ] Add missing `createCenterAdmin` method to APIClient
- [ ] Update center dashboard to redirect to registration if no center exists