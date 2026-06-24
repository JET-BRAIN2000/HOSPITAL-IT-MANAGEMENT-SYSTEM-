// ============================================================
// Hospital IT Management System — Express + MySQL Backend
// ============================================================
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

const app = express();
app.use(cors());
app.use(express.json());

// ------------------------------------------------------------
// MySQL Connection Pool
// ------------------------------------------------------------
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'hospital_it_management',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Verify connection on startup
async function verifyConnection() {
  try {
    const conn = await pool.getConnection();
    console.log('✅ Connected to MySQL database: ' + process.env.DB_NAME);
    conn.release();
  } catch (err) {
    console.error('❌ MySQL connection failed:', err.message);
    console.error('   Make sure MySQL is running and your .env settings are correct.');
    process.exit(1);
  }
}

// ============================================================
//  USERS ENDPOINTS
// ============================================================

// GET all users
app.get('/api/users', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single user by ID
app.get('/api/users/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create new user (register)
app.post('/api/users', async (req, res) => {
  try {
    const {
      full_name, email, password, role, status,
      department_id, department_name, rank, staff_type,
      supervisor_id, supervisor_name, phone, employee_id,
      security_question, security_answer
    } = req.body;

    // Check if email already exists
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const id = uuidv4();
    const userStatus = role === 'IT_HEAD' ? 'active' : (status || 'pending');
    const empId = employee_id || `EMP-${Date.now()}`;

    // Hash the password before storing
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    await pool.query(
      `INSERT INTO users (id, full_name, email, password, role, status,
        department_id, department_name, \`rank\`, staff_type,
        supervisor_id, supervisor_name, login_attempts,
        phone, employee_id, security_question, security_answer)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
      [id, full_name, email, hashedPassword, role, userStatus,
       department_id || null, department_name || null, rank || null, staff_type || null,
       supervisor_id || null, supervisor_name || null,
       phone || null, empId, security_question || null, security_answer || null]
    );

    const [newUser] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
    res.status(201).json({ success: true, message: 'User created successfully', user: newUser[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update user
app.put('/api/users/:id', async (req, res) => {
  try {
    const fields = req.body;
    const id = req.params.id;

    // Check user exists
    const [existing] = await pool.query('SELECT id FROM users WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'User not found' });

    // Build dynamic SET clause
    const allowedFields = [
      'full_name', 'email', 'password', 'role', 'status',
      'department_id', 'department_name', 'rank', 'staff_type',
      'supervisor_id', 'supervisor_name', 'login_attempts',
      'profile_picture', 'phone', 'employee_id',
      'security_question', 'security_answer'
    ];

    const setClauses = [];
    const values = [];

    for (const field of allowedFields) {
      if (fields[field] !== undefined) {
        // Escape 'rank' since it's a reserved word
        const colName = field === 'rank' ? '`rank`' : field;
        setClauses.push(`${colName} = ?`);
        // Hash password if it's being updated
        if (field === 'password') {
          values.push(await bcrypt.hash(fields[field], SALT_ROUNDS));
        } else {
          values.push(fields[field]);
        }
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    values.push(id);
    await pool.query(`UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`, values);

    const [updated] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
    res.json({ success: true, message: 'User updated successfully', user: updated[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE user
app.delete('/api/users/:id', async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT id FROM users WHERE id = ?', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ error: 'User not found' });

    await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST login (validates credentials against DB)
app.post('/api/users/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'No account found with this email address.' });
    }

    const user = rows[0];

    if (user.status === 'frozen') {
      return res.status(403).json({ success: false, message: 'Your account has been frozen. Contact the IT Head.' });
    }
    if (user.role !== 'IT_HEAD' && user.status === 'pending') {
      return res.status(403).json({ success: false, message: 'Your account is pending approval.' });
    }
    if (user.status === 'rejected') {
      return res.status(403).json({ success: false, message: 'Your account registration was rejected.' });
    }

    // Compare plaintext password against the bcrypt hash
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      const newAttempts = user.login_attempts + 1;
      const shouldFreeze = newAttempts >= 10;
      const newStatus = shouldFreeze ? 'frozen' : user.status;

      await pool.query(
        'UPDATE users SET login_attempts = ?, status = ? WHERE id = ?',
        [newAttempts, newStatus, user.id]
      );

      if (shouldFreeze) {
        return res.status(403).json({ success: false, message: 'Account frozen due to 10 failed login attempts.' });
      }
      return res.status(401).json({
        success: false,
        message: `Incorrect password. ${10 - newAttempts} attempt(s) remaining.`
      });
    }

    // Successful login — reset attempts
    await pool.query('UPDATE users SET login_attempts = 0 WHERE id = ?', [user.id]);
    const [updatedUser] = await pool.query('SELECT * FROM users WHERE id = ?', [user.id]);

    res.json({ success: true, message: 'Login successful!', user: updatedUser[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT approve user
app.put('/api/users/:id/approve', async (req, res) => {
  try {
    await pool.query('UPDATE users SET status = ? WHERE id = ?', ['active', req.params.id]);
    res.json({ success: true, message: 'User approved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT freeze user
app.put('/api/users/:id/freeze', async (req, res) => {
  try {
    await pool.query('UPDATE users SET status = ? WHERE id = ?', ['frozen', req.params.id]);
    res.json({ success: true, message: 'User frozen' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT unfreeze user
app.put('/api/users/:id/unfreeze', async (req, res) => {
  try {
    await pool.query('UPDATE users SET status = ?, login_attempts = 0 WHERE id = ?', ['active', req.params.id]);
    res.json({ success: true, message: 'User unfrozen' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT reset password
app.put('/api/users/:id/reset-password', async (req, res) => {
  try {
    const { new_password } = req.body;
    // Hash the new password before storing
    const hashedPassword = await bcrypt.hash(new_password, SALT_ROUNDS);
    await pool.query('UPDATE users SET password = ?, login_attempts = 0 WHERE id = ?', [hashedPassword, req.params.id]);
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ============================================================
//  DEPARTMENTS ENDPOINTS
// ============================================================

// GET all departments
app.get('/api/departments', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM departments ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single department
app.get('/api/departments/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM departments WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Department not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create department
app.post('/api/departments', async (req, res) => {
  try {
    const { name, description } = req.body;
    const id = uuidv4();

    await pool.query(
      'INSERT INTO departments (id, name, description) VALUES (?, ?, ?)',
      [id, name, description || null]
    );

    const [newDept] = await pool.query('SELECT * FROM departments WHERE id = ?', [id]);
    res.status(201).json({ success: true, message: 'Department created', department: newDept[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update department
app.put('/api/departments/:id', async (req, res) => {
  try {
    const { name, description, assigned_it_sub_boss_id, assigned_it_sub_boss_name } = req.body;
    const id = req.params.id;

    const [existing] = await pool.query('SELECT id FROM departments WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Department not found' });

    const setClauses = [];
    const values = [];

    if (name !== undefined) { setClauses.push('name = ?'); values.push(name); }
    if (description !== undefined) { setClauses.push('description = ?'); values.push(description); }
    if (assigned_it_sub_boss_id !== undefined) { setClauses.push('assigned_it_sub_boss_id = ?'); values.push(assigned_it_sub_boss_id); }
    if (assigned_it_sub_boss_name !== undefined) { setClauses.push('assigned_it_sub_boss_name = ?'); values.push(assigned_it_sub_boss_name); }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    values.push(id);
    await pool.query(`UPDATE departments SET ${setClauses.join(', ')} WHERE id = ?`, values);

    const [updated] = await pool.query('SELECT * FROM departments WHERE id = ?', [id]);
    res.json({ success: true, message: 'Department updated', department: updated[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE department
app.delete('/api/departments/:id', async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT id FROM departments WHERE id = ?', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Department not found' });

    await pool.query('DELETE FROM departments WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Department deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT assign IT Sub-Boss to department
app.put('/api/departments/:id/assign-sub-boss', async (req, res) => {
  try {
    const { it_sub_boss_id } = req.body;
    const deptId = req.params.id;

    // Get the sub-boss user
    const [bossRows] = await pool.query('SELECT * FROM users WHERE id = ?', [it_sub_boss_id]);
    if (bossRows.length === 0) return res.status(404).json({ error: 'IT Sub-Boss user not found' });

    const boss = bossRows[0];

    // Get the department
    const [deptRows] = await pool.query('SELECT * FROM departments WHERE id = ?', [deptId]);
    if (deptRows.length === 0) return res.status(404).json({ error: 'Department not found' });

    const dept = deptRows[0];

    // Update department with assigned sub-boss
    await pool.query(
      'UPDATE departments SET assigned_it_sub_boss_id = ?, assigned_it_sub_boss_name = ? WHERE id = ?',
      [it_sub_boss_id, boss.full_name, deptId]
    );

    // Update the sub-boss user's department
    await pool.query(
      'UPDATE users SET department_id = ?, department_name = ? WHERE id = ?',
      [deptId, dept.name, it_sub_boss_id]
    );

    res.json({ success: true, message: `Assigned ${boss.full_name} to ${dept.name}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ============================================================
//  NOTIFICATIONS ENDPOINTS
// ============================================================

// GET all notifications
app.get('/api/notifications', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM notifications ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single notification
app.get('/api/notifications/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM notifications WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Notification not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create notification (distress call)
app.post('/api/notifications', async (req, res) => {
  try {
    const {
      type, title, message,
      from_user_id, from_user_name, from_department_id, from_department_name,
      to_user_id, assigned_it_sub_boss_id,
      assigned_it_personnel_id, assigned_it_personnel_name
    } = req.body;

    const id = uuidv4();

    await pool.query(
      `INSERT INTO notifications (id, type, title, message,
        from_user_id, from_user_name, from_department_id, from_department_name,
        to_user_id, assigned_it_sub_boss_id,
        assigned_it_personnel_id, assigned_it_personnel_name, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [id, type || 'distress', title || '🚨 IT Support Requested', message,
       from_user_id || null, from_user_name || null,
       from_department_id || null, from_department_name || null,
       to_user_id || null, assigned_it_sub_boss_id || null,
       assigned_it_personnel_id || null, assigned_it_personnel_name || null]
    );

    const [newNotif] = await pool.query('SELECT * FROM notifications WHERE id = ?', [id]);
    res.status(201).json({ success: true, message: 'Notification created', notification: newNotif[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update notification status
app.put('/api/notifications/:id', async (req, res) => {
  try {
    const { status } = req.body;
    const id = req.params.id;

    const [existing] = await pool.query('SELECT id FROM notifications WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Notification not found' });

    await pool.query('UPDATE notifications SET status = ? WHERE id = ?', [status, id]);

    const [updated] = await pool.query('SELECT * FROM notifications WHERE id = ?', [id]);
    res.json({ success: true, message: 'Notification updated', notification: updated[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT rate a resolved notification
app.put('/api/notifications/:id/rate', async (req, res) => {
  try {
    const { rating, rating_comment } = req.body;
    const id = req.params.id;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    const [existing] = await pool.query('SELECT id FROM notifications WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Notification not found' });

    await pool.query(
      'UPDATE notifications SET status = ?, rating = ?, rating_comment = ? WHERE id = ?',
      ['rated', rating, rating_comment || null, id]
    );

    const [updated] = await pool.query('SELECT * FROM notifications WHERE id = ?', [id]);
    res.json({ success: true, message: 'Service rated successfully', notification: updated[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE notification
app.delete('/api/notifications/:id', async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT id FROM notifications WHERE id = ?', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Notification not found' });

    await pool.query('DELETE FROM notifications WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Notification deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET notifications for a specific user
app.get('/api/notifications/user/:userId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM notifications 
       WHERE from_user_id = ? OR to_user_id = ? OR assigned_it_personnel_id = ?
       ORDER BY created_at DESC`,
      [req.params.userId, req.params.userId, req.params.userId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ============================================================
//  HEALTH CHECK
// ============================================================
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', database: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', database: 'disconnected', error: err.message });
  }
});


// ============================================================
//  START SERVER
// ============================================================
const PORT = process.env.PORT || 3001;

verifyConnection().then(() => {
  app.listen(PORT, () => {
    console.log('');
    console.log('🏥 Hospital IT Management System — Backend API');
    console.log(`🚀 Server running at: http://localhost:${PORT}`);
    console.log('');
    console.log('Available endpoints:');
    console.log('  GET    /api/health');
    console.log('');
    console.log('  Users:');
    console.log('  GET    /api/users');
    console.log('  GET    /api/users/:id');
    console.log('  POST   /api/users');
    console.log('  POST   /api/users/login');
    console.log('  PUT    /api/users/:id');
    console.log('  PUT    /api/users/:id/approve');
    console.log('  PUT    /api/users/:id/freeze');
    console.log('  PUT    /api/users/:id/unfreeze');
    console.log('  PUT    /api/users/:id/reset-password');
    console.log('  DELETE /api/users/:id');
    console.log('');
    console.log('  Departments:');
    console.log('  GET    /api/departments');
    console.log('  GET    /api/departments/:id');
    console.log('  POST   /api/departments');
    console.log('  PUT    /api/departments/:id');
    console.log('  PUT    /api/departments/:id/assign-sub-boss');
    console.log('  DELETE /api/departments/:id');
    console.log('');
    console.log('  Notifications:');
    console.log('  GET    /api/notifications');
    console.log('  GET    /api/notifications/:id');
    console.log('  GET    /api/notifications/user/:userId');
    console.log('  POST   /api/notifications');
    console.log('  PUT    /api/notifications/:id');
    console.log('  PUT    /api/notifications/:id/rate');
    console.log('  DELETE /api/notifications/:id');
    console.log('');
  });
});
