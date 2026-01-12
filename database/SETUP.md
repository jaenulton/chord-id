# Chord-ID Database Setup Instructions

## Prerequisites
- Hostinger account with MySQL access
- Access to hPanel (Hostinger control panel)

## Step 1: Create the Database

1. Log into your Hostinger hPanel
2. Navigate to **Databases** > **MySQL Databases**
3. Create a new database:
   - Database name: `u883233744_chordid`
4. Create a database user:
   - Username: `u883233744_chordid` (or your preferred username)
   - Password: Generate a strong password and save it securely
5. Add the user to the database with **All Privileges**

## Step 2: Import the Schema

### Option A: Using phpMyAdmin

1. In hPanel, go to **Databases** > **phpMyAdmin**
2. Select the `u883233744_chordid` database from the left sidebar
3. Click the **Import** tab
4. Choose the file: `database/schema.sql`
5. Click **Go** to import

### Option B: Using MySQL CLI

If you have SSH access:

```bash
mysql -u u883233744_chordid -p u883233744_chordid < database/schema.sql
```

## Step 3: Create Admin User

After importing the schema, you need to create an admin user for the poll management panel.

### Using phpMyAdmin:

1. Go to the **SQL** tab
2. Run this query (replace `your_password` with your actual password):

```sql
INSERT INTO admin_users (username, password_hash) VALUES (
    'admin',
    '$2y$10$YOUR_BCRYPT_HASH_HERE'
);
```

### Generate Password Hash:

You can generate a bcrypt hash using PHP:

```php
<?php
echo password_hash('your_password', PASSWORD_BCRYPT);
```

Or use an online bcrypt generator (ensure you trust the site).

## Step 4: Update Configuration

Edit `public/api/config.php` with your credentials:

```php
define('DB_HOST', 'localhost');
define('DB_NAME', 'u883233744_chordid');
define('DB_USER', 'u883233744_chordid');
define('DB_PASS', 'your_database_password');
```

**Important**: Also update these security settings:
- `IP_SALT`: Change to a unique random string
- `ALLOWED_ORIGINS`: Add your production domain

## Step 5: Deploy Files

Upload the API files to your Hostinger server:

```bash
# Using FTP
curl --user "u883233744.prolix.fun:Laos@2022!2022!" -T "public/api/config.php" "ftp://82.197.83.185/chord-id/api/config.php"
curl --user "u883233744.prolix.fun:Laos@2022!2022!" -T "public/api/db_connect.php" "ftp://82.197.83.185/chord-id/api/db_connect.php"
curl --user "u883233744.prolix.fun:Laos@2022!2022!" -T "public/api/polls.php" "ftp://82.197.83.185/chord-id/api/polls.php"
curl --user "u883233744.prolix.fun:Laos@2022!2022!" -T "public/api/admin.php" "ftp://82.197.83.185/chord-id/api/admin.php"
curl --user "u883233744.prolix.fun:Laos@2022!2022!" -T "public/api/admin-panel.html" "ftp://82.197.83.185/chord-id/api/admin-panel.html"
```

## Step 6: Test the API

### Test Poll Retrieval:
```bash
curl https://chord-id.jaes.online/api/polls.php
```

Expected response:
```json
{"polls":[]}
```

### Test Admin Login:
```bash
curl -X POST https://chord-id.jaes.online/api/admin.php?action=check
```

## API Endpoints

### Public Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/polls.php` | Get all active polls with vote counts |
| GET | `/api/polls.php?id=1` | Get specific poll |
| POST | `/api/polls.php` | Submit a vote |

### Admin Endpoints (require authentication)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin.php?action=login` | Admin login |
| POST | `/api/admin.php?action=logout` | Admin logout |
| GET | `/api/admin.php?action=polls` | Get all polls |
| POST | `/api/admin.php?action=create` | Create new poll |
| POST | `/api/admin.php?action=update` | Update poll |
| POST | `/api/admin.php?action=delete` | Delete poll |
| POST | `/api/admin.php?action=toggle` | Toggle poll active status |

## Security Notes

1. **Never commit `config.php`** with real credentials to version control
2. Change the default admin password immediately after setup
3. Consider using `.htaccess` to restrict access to the admin panel by IP
4. Set `DEBUG_MODE` to `false` in production
5. Use HTTPS for all API calls

## Troubleshooting

### "Database connection failed"
- Verify database credentials in `config.php`
- Ensure the database user has proper privileges
- Check if the database exists

### CORS errors
- Add your domain to the `ALLOWED_ORIGINS` array in `config.php`
- Ensure you're using HTTPS in production

### Session issues
- Check PHP session configuration on the server
- Ensure cookies are enabled in the browser
