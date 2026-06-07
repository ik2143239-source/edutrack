// ═══════════════════════════════════════════════════════════════
//  EduTrack Backend — Node.js + Express + SQLite
//  Full REST API for School Management System
// ═══════════════════════════════════════════════════════════════

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'edutrack_secret_2026_change_in_production';

// ── Middleware ──────────────────────────────────────────────────
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

// ── Database Setup ──────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'edutrack.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Create Tables ───────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','teacher','student','parent')),
    phone TEXT,
    address TEXT,
    avatar TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    grade TEXT NOT NULL,
    teacher_id INTEGER,
    room TEXT,
    schedule TEXT,
    capacity INTEGER DEFAULT 30,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active INTEGER DEFAULT 1,
    FOREIGN KEY(teacher_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS class_enrollments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(class_id, student_id),
    FOREIGN KEY(class_id) REFERENCES classes(id),
    FOREIGN KEY(student_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('present','absent','late','excused')),
    note TEXT,
    recorded_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(class_id, student_id, date),
    FOREIGN KEY(class_id) REFERENCES classes(id),
    FOREIGN KEY(student_id) REFERENCES users(id),
    FOREIGN KEY(recorded_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT DEFAULT 'homework' CHECK(type IN ('homework','quiz','exam','project','lab')),
    max_score INTEGER DEFAULT 100,
    due_date TEXT NOT NULL,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_published INTEGER DEFAULT 1,
    FOREIGN KEY(class_id) REFERENCES classes(id),
    FOREIGN KEY(created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS grades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assignment_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    score REAL,
    feedback TEXT,
    graded_by INTEGER,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    graded_at DATETIME,
    UNIQUE(assignment_id, student_id),
    FOREIGN KEY(assignment_id) REFERENCES assignments(id),
    FOREIGN KEY(student_id) REFERENCES users(id),
    FOREIGN KEY(graded_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    recipient_id INTEGER NOT NULL,
    subject TEXT,
    body TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(sender_id) REFERENCES users(id),
    FOREIGN KEY(recipient_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    target_role TEXT DEFAULT 'all',
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS parent_student (
    parent_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    PRIMARY KEY(parent_id, student_id),
    FOREIGN KEY(parent_id) REFERENCES users(id),
    FOREIGN KEY(student_id) REFERENCES users(id)
  );
`);

// ── Seed Default Admin ──────────────────────────────────────────
const adminExists = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
if (!adminExists) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare(`INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)`)
    .run('Dr. Patel', 'admin@edutrack.com', hash, 'admin');

  // Seed some teachers
  const teacherHash = bcrypt.hashSync('teacher123', 10);
  ['Ms. Rivera|math@edutrack.com|Mathematics',
   'Mr. Jones|english@edutrack.com|English',
   'Dr. Lam|science@edutrack.com|Science'].forEach(t => {
    const [name, email, subject] = t.split('|');
    const tid = db.prepare(`INSERT INTO users (name,email,password,role) VALUES (?,?,?,?)`)
      .run(name, email, teacherHash, 'teacher').lastInsertRowid;
    const cid = db.prepare(`INSERT INTO classes (name,subject,grade,teacher_id,room,schedule) VALUES (?,?,?,?,?,?)`)
      .run(`${subject} 10A`, subject, 'Grade 10', tid, '204', 'Mon/Wed/Fri 8:00-9:00').lastInsertRowid;

    // Seed students
    const studentHash = bcrypt.hashSync('student123', 10);
    ['Alex Lee','Maria Gonzalez','James Park','Sophie Turner','Noah Williams'].forEach(sn => {
      const email2 = sn.toLowerCase().replace(' ','.')+`@student.edutrack.com`;
      const sid = db.prepare(`INSERT OR IGNORE INTO users (name,email,password,role) VALUES (?,?,?,?)`)
        .run(sn, email2, studentHash, 'student').lastInsertRowid;
      if (sid) db.prepare(`INSERT OR IGNORE INTO class_enrollments (class_id,student_id) VALUES (?,?)`)
        .run(cid, sid);
    });
  });
  console.log('✅ Database seeded with default data');
  console.log('   Admin: admin@edutrack.com / admin123');
  console.log('   Teacher: math@edutrack.com / teacher123');
  console.log('   Student: alex.lee@student.edutrack.com / student123');
}

// ── Auth Middleware ─────────────────────────────────────────────
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

function teacherOrAdmin(req, res, next) {
  if (!['teacher','admin'].includes(req.user.role))
    return res.status(403).json({ error: 'Teacher or Admin access required' });
  next();
}

// ═══════════════════════════════════════════════════════════════
//  AUTH ROUTES
// ═══════════════════════════════════════════════════════════════
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
  const { password: _, ...safeUser } = user;
  res.json({ token, user: safeUser });
});

app.post('/api/auth/change-password', auth, (req, res) => {
  const { current, newPassword } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(current, user.password))
    return res.status(400).json({ error: 'Current password incorrect' });
  db.prepare('UPDATE users SET password = ? WHERE id = ?')
    .run(bcrypt.hashSync(newPassword, 10), req.user.id);
  res.json({ success: true });
});

app.get('/api/auth/me', auth, (req, res) => {
  const user = db.prepare('SELECT id,name,email,role,phone,address,avatar,created_at FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

// ═══════════════════════════════════════════════════════════════
//  USERS (Admin: full CRUD for students & teachers)
// ═══════════════════════════════════════════════════════════════
// GET all users (with role filter)
app.get('/api/users', auth, teacherOrAdmin, (req, res) => {
  const { role, search, page = 1, limit = 20 } = req.query;
  let query = 'SELECT id,name,email,role,phone,address,avatar,created_at,is_active FROM users WHERE 1=1';
  const params = [];
  if (role) { query += ' AND role = ?'; params.push(role); }
  if (search) { query += ' AND (name LIKE ? OR email LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
  const users = db.prepare(query).all(...params);
  const total = db.prepare('SELECT COUNT(*) as c FROM users WHERE 1=1' + (role ? ' AND role=?' : '') + (search ? ' AND (name LIKE ? OR email LIKE ?)' : '')).get(...params.slice(0, -2)).c;
  res.json({ users, total, page: parseInt(page), limit: parseInt(limit) });
});

// GET single user
app.get('/api/users/:id', auth, (req, res) => {
  const user = db.prepare('SELECT id,name,email,role,phone,address,avatar,created_at FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// POST create user (admin only)
app.post('/api/users', auth, adminOnly, (req, res) => {
  const { name, email, password, role, phone, address } = req.body;
  if (!name || !email || !password || !role)
    return res.status(400).json({ error: 'Name, email, password and role are required' });
  if (!['teacher','student','parent'].includes(role))
    return res.status(400).json({ error: 'Invalid role' });
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already in use' });
  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (name,email,password,role,phone,address) VALUES (?,?,?,?,?,?)')
    .run(name, email, hash, role, phone || null, address || null);
  const user = db.prepare('SELECT id,name,email,role,phone,address,created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(user);
});

// PUT update user (admin only, or self for limited fields)
app.put('/api/users/:id', auth, (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const isSelf = req.user.id === parseInt(req.params.id);
  if (!isAdmin && !isSelf) return res.status(403).json({ error: 'Forbidden' });
  const { name, email, phone, address, role, is_active } = req.body;
  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!current) return res.status(404).json({ error: 'User not found' });
  db.prepare(`UPDATE users SET name=?,email=?,phone=?,address=?,${isAdmin ? 'role=?,is_active=?,' : ''}updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(...(isAdmin
      ? [name||current.name, email||current.email, phone||current.phone, address||current.address, role||current.role, is_active!=null?is_active:current.is_active, req.params.id]
      : [name||current.name, email||current.email, phone||current.phone, address||current.address, req.params.id]));
  const updated = db.prepare('SELECT id,name,email,role,phone,address,is_active FROM users WHERE id=?').get(req.params.id);
  res.json(updated);
});

// DELETE user (admin only - soft delete)
app.delete('/api/users/:id', auth, adminOnly, (req, res) => {
  const user = db.prepare('SELECT id,role FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role === 'admin') return res.status(400).json({ error: 'Cannot delete admin accounts' });
  db.prepare('UPDATE users SET is_active=0 WHERE id=?').run(req.params.id);
  res.json({ success: true, message: 'User deactivated' });
});

// Hard delete (permanent)
app.delete('/api/users/:id/permanent', auth, adminOnly, (req, res) => {
  db.prepare('DELETE FROM class_enrollments WHERE student_id=?').run(req.params.id);
  db.prepare('DELETE FROM attendance WHERE student_id=?').run(req.params.id);
  db.prepare('DELETE FROM grades WHERE student_id=?').run(req.params.id);
  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  res.json({ success: true, message: 'User permanently deleted' });
});

// ═══════════════════════════════════════════════════════════════
//  CLASSES (Admin: full CRUD)
// ═══════════════════════════════════════════════════════════════
app.get('/api/classes', auth, (req, res) => {
  const classes = db.prepare(`
    SELECT c.*, u.name as teacher_name,
      (SELECT COUNT(*) FROM class_enrollments ce WHERE ce.class_id = c.id) as student_count
    FROM classes c LEFT JOIN users u ON c.teacher_id = u.id
    WHERE c.is_active = 1 ORDER BY c.name
  `).all();
  res.json(classes);
});

app.get('/api/classes/:id', auth, (req, res) => {
  const cls = db.prepare(`
    SELECT c.*, u.name as teacher_name FROM classes c
    LEFT JOIN users u ON c.teacher_id = u.id WHERE c.id = ?
  `).get(req.params.id);
  if (!cls) return res.status(404).json({ error: 'Class not found' });
  const students = db.prepare(`
    SELECT u.id,u.name,u.email FROM users u
    JOIN class_enrollments ce ON ce.student_id = u.id
    WHERE ce.class_id = ? AND u.is_active = 1
  `).all(req.params.id);
  res.json({ ...cls, students });
});

app.post('/api/classes', auth, adminOnly, (req, res) => {
  const { name, subject, grade, teacher_id, room, schedule, capacity, description } = req.body;
  if (!name || !subject || !grade) return res.status(400).json({ error: 'Name, subject, grade required' });
  const result = db.prepare('INSERT INTO classes (name,subject,grade,teacher_id,room,schedule,capacity,description) VALUES (?,?,?,?,?,?,?,?)')
    .run(name, subject, grade, teacher_id||null, room||null, schedule||null, capacity||30, description||null);
  res.status(201).json(db.prepare('SELECT * FROM classes WHERE id=?').get(result.lastInsertRowid));
});

app.put('/api/classes/:id', auth, adminOnly, (req, res) => {
  const { name, subject, grade, teacher_id, room, schedule, capacity, description, is_active } = req.body;
  const cls = db.prepare('SELECT * FROM classes WHERE id=?').get(req.params.id);
  if (!cls) return res.status(404).json({ error: 'Class not found' });
  db.prepare('UPDATE classes SET name=?,subject=?,grade=?,teacher_id=?,room=?,schedule=?,capacity=?,description=?,is_active=? WHERE id=?')
    .run(name||cls.name, subject||cls.subject, grade||cls.grade, teacher_id||cls.teacher_id,
      room||cls.room, schedule||cls.schedule, capacity||cls.capacity, description||cls.description,
      is_active!=null?is_active:cls.is_active, req.params.id);
  res.json(db.prepare('SELECT * FROM classes WHERE id=?').get(req.params.id));
});

app.delete('/api/classes/:id', auth, adminOnly, (req, res) => {
  db.prepare('UPDATE classes SET is_active=0 WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// Enroll / remove student
app.post('/api/classes/:id/enroll', auth, adminOnly, (req, res) => {
  const { student_id } = req.body;
  db.prepare('INSERT OR IGNORE INTO class_enrollments (class_id,student_id) VALUES (?,?)').run(req.params.id, student_id);
  res.json({ success: true });
});

app.delete('/api/classes/:id/enroll/:studentId', auth, adminOnly, (req, res) => {
  db.prepare('DELETE FROM class_enrollments WHERE class_id=? AND student_id=?').run(req.params.id, req.params.studentId);
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════
//  ATTENDANCE
// ═══════════════════════════════════════════════════════════════
app.get('/api/attendance', auth, (req, res) => {
  const { class_id, student_id, date, month } = req.query;
  let query = `SELECT a.*,u.name as student_name,c.name as class_name FROM attendance a
    JOIN users u ON a.student_id = u.id JOIN classes c ON a.class_id = c.id WHERE 1=1`;
  const params = [];
  if (class_id) { query += ' AND a.class_id=?'; params.push(class_id); }
  if (student_id) { query += ' AND a.student_id=?'; params.push(student_id); }
  if (date) { query += ' AND a.date=?'; params.push(date); }
  if (month) { query += ' AND a.date LIKE ?'; params.push(`${month}%`); }
  query += ' ORDER BY a.date DESC';
  res.json(db.prepare(query).all(...params));
});

app.post('/api/attendance', auth, teacherOrAdmin, (req, res) => {
  const { class_id, records } = req.body; // records: [{student_id, status, note}]
  if (!Array.isArray(records)) return res.status(400).json({ error: 'records must be array' });
  const date = req.body.date || new Date().toISOString().split('T')[0];
  const upsert = db.prepare(`INSERT INTO attendance (class_id,student_id,date,status,note,recorded_by)
    VALUES (?,?,?,?,?,?) ON CONFLICT(class_id,student_id,date) DO UPDATE SET status=excluded.status,note=excluded.note`);
  const insertMany = db.transaction(recs => recs.forEach(r =>
    upsert.run(class_id, r.student_id, date, r.status, r.note||null, req.user.id)));
  insertMany(records);
  res.json({ success: true, count: records.length });
});

// Attendance summary for a student
app.get('/api/attendance/summary/:studentId', auth, (req, res) => {
  const rows = db.prepare(`SELECT status, COUNT(*) as count FROM attendance WHERE student_id=? GROUP BY status`).all(req.params.studentId);
  const total = rows.reduce((a, r) => a + r.count, 0);
  const present = (rows.find(r=>r.status==='present')?.count||0) + (rows.find(r=>r.status==='excused')?.count||0);
  res.json({ rows, total, present, rate: total ? Math.round(present/total*100) : 0 });
});

// ═══════════════════════════════════════════════════════════════
//  ASSIGNMENTS
// ═══════════════════════════════════════════════════════════════
app.get('/api/assignments', auth, (req, res) => {
  const { class_id, student_id } = req.query;
  let query = `SELECT a.*,c.name as class_name,c.subject,u.name as teacher_name FROM assignments a
    JOIN classes c ON a.class_id=c.id LEFT JOIN users u ON c.teacher_id=u.id WHERE a.is_published=1`;
  const params = [];
  if (class_id) { query += ' AND a.class_id=?'; params.push(class_id); }
  if (student_id) {
    query = `SELECT a.*,c.name as class_name,c.subject,g.score,g.feedback FROM assignments a
      JOIN classes c ON a.class_id=c.id
      JOIN class_enrollments ce ON ce.class_id=c.id AND ce.student_id=?
      LEFT JOIN grades g ON g.assignment_id=a.id AND g.student_id=?
      WHERE a.is_published=1`;
    params.unshift(student_id, student_id);
  }
  query += ' ORDER BY a.due_date ASC';
  res.json(db.prepare(query).all(...params));
});

app.post('/api/assignments', auth, teacherOrAdmin, (req, res) => {
  const { class_id, title, description, type, max_score, due_date } = req.body;
  if (!class_id || !title || !due_date) return res.status(400).json({ error: 'class_id, title, due_date required' });
  const result = db.prepare('INSERT INTO assignments (class_id,title,description,type,max_score,due_date,created_by) VALUES (?,?,?,?,?,?,?)')
    .run(class_id, title, description||null, type||'homework', max_score||100, due_date, req.user.id);
  res.status(201).json(db.prepare('SELECT * FROM assignments WHERE id=?').get(result.lastInsertRowid));
});

app.put('/api/assignments/:id', auth, teacherOrAdmin, (req, res) => {
  const { title, description, type, max_score, due_date, is_published } = req.body;
  const a = db.prepare('SELECT * FROM assignments WHERE id=?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE assignments SET title=?,description=?,type=?,max_score=?,due_date=?,is_published=? WHERE id=?')
    .run(title||a.title, description||a.description, type||a.type, max_score||a.max_score, due_date||a.due_date, is_published!=null?is_published:a.is_published, req.params.id);
  res.json(db.prepare('SELECT * FROM assignments WHERE id=?').get(req.params.id));
});

app.delete('/api/assignments/:id', auth, teacherOrAdmin, (req, res) => {
  db.prepare('UPDATE assignments SET is_published=0 WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════
//  GRADES
// ═══════════════════════════════════════════════════════════════
app.get('/api/grades', auth, (req, res) => {
  const { student_id, class_id, assignment_id } = req.query;
  let query = `SELECT g.*,a.title,a.max_score,a.type,a.due_date,c.name as class_name,c.subject,
    u.name as student_name FROM grades g
    JOIN assignments a ON g.assignment_id=a.id JOIN classes c ON a.class_id=c.id
    JOIN users u ON g.student_id=u.id WHERE 1=1`;
  const params = [];
  if (student_id) { query += ' AND g.student_id=?'; params.push(student_id); }
  if (class_id) { query += ' AND a.class_id=?'; params.push(class_id); }
  if (assignment_id) { query += ' AND g.assignment_id=?'; params.push(assignment_id); }
  res.json(db.prepare(query + ' ORDER BY g.submitted_at DESC').all(...params));
});

app.post('/api/grades', auth, teacherOrAdmin, (req, res) => {
  const { assignment_id, student_id, score, feedback } = req.body;
  db.prepare(`INSERT INTO grades (assignment_id,student_id,score,feedback,graded_by,graded_at)
    VALUES (?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(assignment_id,student_id)
    DO UPDATE SET score=excluded.score,feedback=excluded.feedback,graded_at=CURRENT_TIMESTAMP`)
    .run(assignment_id, student_id, score, feedback||null, req.user.id);
  res.json({ success: true });
});

// Bulk grade
app.post('/api/grades/bulk', auth, teacherOrAdmin, (req, res) => {
  const { grades } = req.body; // [{assignment_id, student_id, score, feedback}]
  const upsert = db.prepare(`INSERT INTO grades (assignment_id,student_id,score,feedback,graded_by,graded_at)
    VALUES (?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(assignment_id,student_id)
    DO UPDATE SET score=excluded.score,feedback=excluded.feedback,graded_at=CURRENT_TIMESTAMP`);
  const insertMany = db.transaction(gs => gs.forEach(g => upsert.run(g.assignment_id, g.student_id, g.score, g.feedback||null, req.user.id)));
  insertMany(grades);
  res.json({ success: true, count: grades.length });
});

// GPA for student
app.get('/api/grades/gpa/:studentId', auth, (req, res) => {
  const rows = db.prepare(`SELECT AVG(g.score/a.max_score*100) as pct FROM grades g
    JOIN assignments a ON g.assignment_id=a.id WHERE g.student_id=?`).get(req.params.studentId);
  const pct = rows?.pct || 0;
  const gpa = pct >= 93 ? 4.0 : pct >= 90 ? 3.7 : pct >= 87 ? 3.3 : pct >= 83 ? 3.0 : pct >= 80 ? 2.7 : pct >= 77 ? 2.3 : pct >= 73 ? 2.0 : pct >= 70 ? 1.7 : 1.0;
  res.json({ percentage: Math.round(pct * 10) / 10, gpa: gpa.toFixed(1) });
});

// ═══════════════════════════════════════════════════════════════
//  MESSAGES
// ═══════════════════════════════════════════════════════════════
app.get('/api/messages', auth, (req, res) => {
  const inbox = db.prepare(`SELECT m.*,u.name as sender_name,u.role as sender_role FROM messages m
    JOIN users u ON m.sender_id=u.id WHERE m.recipient_id=? ORDER BY m.sent_at DESC`).all(req.user.id);
  res.json(inbox);
});

app.post('/api/messages', auth, (req, res) => {
  const { recipient_id, subject, body } = req.body;
  if (!recipient_id || !body) return res.status(400).json({ error: 'recipient_id and body required' });
  const result = db.prepare('INSERT INTO messages (sender_id,recipient_id,subject,body) VALUES (?,?,?,?)')
    .run(req.user.id, recipient_id, subject||null, body);
  res.status(201).json({ id: result.lastInsertRowid });
});

app.put('/api/messages/:id/read', auth, (req, res) => {
  db.prepare('UPDATE messages SET is_read=1 WHERE id=? AND recipient_id=?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════
//  ANNOUNCEMENTS
// ═══════════════════════════════════════════════════════════════
app.get('/api/announcements', auth, (req, res) => {
  const rows = db.prepare(`SELECT a.*,u.name as author FROM announcements a
    LEFT JOIN users u ON a.created_by=u.id
    WHERE a.target_role='all' OR a.target_role=?
    ORDER BY a.created_at DESC LIMIT 20`).all(req.user.role);
  res.json(rows);
});

app.post('/api/announcements', auth, teacherOrAdmin, (req, res) => {
  const { title, body, target_role } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'title and body required' });
  const result = db.prepare('INSERT INTO announcements (title,body,target_role,created_by) VALUES (?,?,?,?)')
    .run(title, body, target_role||'all', req.user.id);
  res.status(201).json({ id: result.lastInsertRowid });
});

// ═══════════════════════════════════════════════════════════════
//  ANALYTICS (Admin)
// ═══════════════════════════════════════════════════════════════
app.get('/api/analytics/overview', auth, adminOnly, (req, res) => {
  const totalStudents = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='student' AND is_active=1").get().c;
  const totalTeachers = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='teacher' AND is_active=1").get().c;
  const totalClasses = db.prepare("SELECT COUNT(*) as c FROM classes WHERE is_active=1").get().c;
  const avgAttendance = db.prepare("SELECT ROUND(AVG(CASE WHEN status='present' THEN 100 ELSE 0 END),1) as rate FROM attendance").get().rate;
  const avgGrade = db.prepare("SELECT ROUND(AVG(g.score/a.max_score*100),1) as avg FROM grades g JOIN assignments a ON g.assignment_id=a.id").get().avg;
  res.json({ totalStudents, totalTeachers, totalClasses, avgAttendance, avgGrade });
});

// ── Health check ─────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.listen(PORT, () => {
  console.log(`\n🚀 EduTrack API running on http://localhost:${PORT}`);
  console.log(`📖 API Docs: See README.md`);
});
