require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const initSqlJs = require("sql.js");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DB_DIR = path.join(ROOT, "database");
const DB_FILE = path.join(DB_DIR, "platform.sqlite");
const JWT_SECRET = process.env.JWT_SECRET || "development-only-change-this-secret-before-deployment";
const ALLOWED_GRADES = ["الصف الأول الإعدادي","الصف الثاني الإعدادي","الصف الثالث الإعدادي","الصف الأول الثانوي","الصف الثاني الثانوي","الصف الثالث الثانوي"];
const RESOURCE_UPLOAD_ROOT = path.join(ROOT, "uploads", "resources");
const MAX_PDF_BYTES = 25 * 1024 * 1024;

if (process.env.NODE_ENV === "production" && JWT_SECRET === "development-only-change-this-secret-before-deployment") {
  throw new Error("Set a strong JWT_SECRET before running in production.");
}

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(cookieParser());
app.use(express.static(path.join(ROOT, "public")));
app.use("/uploads", express.static(path.join(ROOT, "uploads")));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 25, standardHeaders: "draft-8", legacyHeaders: false });
let db;

function saveDb() {
  fs.mkdirSync(DB_DIR, { recursive: true });
  const bytes = db.export();
  const temp = DB_FILE + ".tmp";
  fs.writeFileSync(temp, Buffer.from(bytes));
  fs.renameSync(temp, DB_FILE);
}
function run(sql, params = []) {
  db.run(sql, params);
  return db.exec("SELECT last_insert_rowid() AS id")[0]?.values?.[0]?.[0] ?? null;
}
function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}
function one(sql, params = []) { return all(sql, params)[0] || null; }
function changed(sql, params = []) { db.run(sql, params); saveDb(); }
function created(sql, params = []) { const id = run(sql, params); saveDb(); return id; }
function cleanText(value, max = 5000) {
  return String(value ?? "").trim().slice(0, max);
}
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "")); }
function publicUser(user) {
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role, grade: user.grade, status: user.status, created_at: user.created_at };
}
function tokenFor(user) {
  return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: "8h" });
}
function setAuthCookie(res, token) {
  res.cookie("edu_session", token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    maxAge: 8 * 60 * 60 * 1000, path: "/"
  });
}
function requireAuth(req, res, next) {
  try {
    const token = req.cookies.edu_session;
    if (!token) return res.status(401).json({ error: "Please sign in to continue." });
    const payload = jwt.verify(token, JWT_SECRET);
    const user = one("SELECT * FROM users WHERE id = ? AND status = 'active'", [payload.id]);
    if (!user) return res.status(401).json({ error: "Your account is unavailable. Please contact the teacher." });
    req.user = user;
    next();
  } catch {
    res.clearCookie("edu_session", { path: "/" });
    return res.status(401).json({ error: "Your session has expired. Please sign in again." });
  }
}
function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Administrator access required." });
  next();
}
function asyncRoute(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }
function parseJson(value, fallback = []) {
  try { return JSON.parse(value || ""); } catch { return fallback; }
}

async function initialize() {
  fs.mkdirSync(DB_DIR, { recursive: true });
  const SQL = await initSqlJs({ locateFile: file => path.join(ROOT, "node_modules", "sql.js", "dist", file) });
  if (fs.existsSync(DB_FILE)) db = new SQL.Database(new Uint8Array(fs.readFileSync(DB_FILE)));
  else db = new SQL.Database();

  db.run(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'student',
      grade TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT DEFAULT '',
      subject TEXT NOT NULL, grade TEXT NOT NULL, video_url TEXT DEFAULT '',
      material_url TEXT DEFAULT '', thumbnail_url TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS homework (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT DEFAULT '',
      subject TEXT NOT NULL, grade TEXT NOT NULL, due_date TEXT DEFAULT '',
      attachment_url TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'published',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS homework_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, homework_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL, answer TEXT NOT NULL, submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(homework_id, student_id),
      FOREIGN KEY(homework_id) REFERENCES homework(id) ON DELETE CASCADE,
      FOREIGN KEY(student_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT DEFAULT '',
      subject TEXT NOT NULL, grade TEXT NOT NULL, duration INTEGER NOT NULL DEFAULT 30,
      total_marks REAL NOT NULL DEFAULT 0, pass_marks REAL NOT NULL DEFAULT 0,
      start_at TEXT DEFAULT '', end_at TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft', questions_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS exam_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL, answers_json TEXT NOT NULL, score REAL NOT NULL,
      total_marks REAL NOT NULL, submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(exam_id, student_id),
      FOREIGN KEY(exam_id) REFERENCES exams(id) ON DELETE CASCADE,
      FOREIGN KEY(student_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT NOT NULL,
      audience TEXT NOT NULL DEFAULT 'all', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL
    );
  `);
  saveDb();
}

app.get("/api/health", (req, res) => res.json({ ok: true, service: "Mostafa Edu Platform", database: "connected" }));

// One-time administrator setup. This endpoint closes automatically after the first admin exists.
app.get("/api/setup/status", (req, res) => {
  res.json({ setupRequired: !one("SELECT id FROM users WHERE role = 'admin' LIMIT 1") });
});
app.post("/api/setup", authLimiter, asyncRoute(async (req, res) => {
  if (one("SELECT id FROM users WHERE role = 'admin' LIMIT 1")) return res.status(403).json({ error: "Initial setup has already been completed." });
  const name = cleanText(req.body.name, 100);
  const email = cleanText(req.body.email, 160).toLowerCase();
  const password = String(req.body.password || "");
  if (name.length < 2 || !validEmail(email) || password.length < 10) {
    return res.status(400).json({ error: "Enter a name, a valid email, and a password with at least 10 characters." });
  }
  const hash = await bcrypt.hash(password, 12);
  const id = created("INSERT INTO users(name,email,password_hash,role,grade) VALUES(?,?,?,'admin','')", [name, email, hash]);
  const user = one("SELECT * FROM users WHERE id = ?", [id]);
  setAuthCookie(res, tokenFor(user));
  res.status(201).json({ user: publicUser(user) });
}));
app.post("/api/auth/register", authLimiter, asyncRoute(async (req, res) => {
  const name = cleanText(req.body.name, 100);
  const email = cleanText(req.body.email, 160).toLowerCase();
  const password = String(req.body.password || "");
  const grade = cleanText(req.body.grade, 80);
  if (name.length < 2 || !validEmail(email) || password.length < 8 || !ALLOWED_GRADES.includes(grade)) {
    return res.status(400).json({ error: "أكمل البيانات واختر صفًا دراسيًا صحيحًا من الصفوف المتاحة. يجب ألا تقل كلمة المرور عن 8 أحرف." });
  }
  if (one("SELECT id FROM users WHERE email = ?", [email])) return res.status(409).json({ error: "An account with this email already exists." });
  const hash = await bcrypt.hash(password, 12);
  const id = created("INSERT INTO users(name,email,password_hash,role,grade) VALUES(?,?,?,'student',?)", [name, email, hash, grade]);
  const user = one("SELECT * FROM users WHERE id = ?", [id]);
  setAuthCookie(res, tokenFor(user));
  res.status(201).json({ user: publicUser(user) });
}));
app.post("/api/auth/login", authLimiter, asyncRoute(async (req, res) => {
  const email = cleanText(req.body.email, 160).toLowerCase();
  const password = String(req.body.password || "");
  const user = one("SELECT * FROM users WHERE email = ?", [email]);
  if (!user || user.status !== "active" || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: "The email or password is incorrect." });
  }
  setAuthCookie(res, tokenFor(user));
  res.json({ user: publicUser(user) });
}));
app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("edu_session", { path: "/" });
  res.json({ ok: true });
});
app.get("/api/auth/me", requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

// Secure administrator account update
app.put("/api/admin/account", authLimiter, requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const currentEmail = cleanText(req.body.currentEmail, 160).toLowerCase();
  const currentPassword = String(req.body.currentPassword || "");

  const newName = cleanText(req.body.newName, 100);
  const newEmail = cleanText(req.body.newEmail, 160).toLowerCase();
  const newPassword = String(req.body.newPassword || "");
  const confirmPassword = String(req.body.confirmPassword || "");

  // Verify the current administrator credentials
  if (
    currentEmail !== req.user.email ||
    !(await bcrypt.compare(currentPassword, req.user.password_hash))
  ) {
    return res.status(401).json({
      error: "Your current email or password is incorrect."
    });
  }

  if (!validEmail(newEmail)) {
    return res.status(400).json({ error: "Enter a valid new email." });
  }

  if (newName.length < 2) {
    return res.status(400).json({ error: "Enter a valid name." });
  }

  if (newPassword.length < 10) {
    return res.status(400).json({
      error: "Your new password must contain at least 10 characters."
    });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({
      error: "The new passwords do not match."
    });
  }

  const existing = one(
    "SELECT id FROM users WHERE email = ? AND id != ?",
    [newEmail, req.user.id]
  );

  if (existing) {
    return res.status(409).json({
      error: "This email is already being used by another account."
    });
  }

  const hash = await bcrypt.hash(newPassword, 12);

  changed(
    "UPDATE users SET name = ?, email = ?, password_hash = ? WHERE id = ? AND role = 'admin'",
    [newName, newEmail, hash, req.user.id]
  );

  const updatedUser = one(
    "SELECT * FROM users WHERE id = ?",
    [req.user.id]
  );

  // Refresh the administrator session
  setAuthCookie(res, tokenFor(updatedUser));

  res.json({
    ok: true,
    message: "Administrator account updated successfully.",
    user: publicUser(updatedUser)
  });
}));

// Student workspace
app.get("/api/student/overview", requireAuth, (req, res) => {
  const id = req.user.id;
  res.json({
    lessons: one("SELECT COUNT(*) AS n FROM lessons WHERE status='published' AND grade=?", [req.user.grade])?.n || 0,
    homework: one("SELECT COUNT(*) AS n FROM homework WHERE status='published' AND grade=?", [req.user.grade])?.n || 0,
    exams: one("SELECT COUNT(*) AS n FROM exams WHERE status IN ('published','active') AND grade=?", [req.user.grade])?.n || 0,
    results: all("SELECT a.id,a.score,a.total_marks,a.submitted_at,e.title,e.subject FROM exam_attempts a JOIN exams e ON e.id=a.exam_id WHERE a.student_id=? ORDER BY a.submitted_at DESC LIMIT 5", [id])
  });
});
app.get("/api/student/lessons", requireAuth, (req, res) => {
  res.json(all("SELECT id,title,description,subject,grade,video_url,material_url,thumbnail_url,created_at FROM lessons WHERE status='published' AND grade=? ORDER BY id DESC", [req.user.grade]));
});
app.get("/api/student/homework", requireAuth, (req, res) => {
  res.json(all(`SELECT h.*,s.id AS submission_id,s.answer,s.submitted_at FROM homework h
    LEFT JOIN homework_submissions s ON s.homework_id=h.id AND s.student_id=?
    WHERE h.status='published' AND h.grade=? ORDER BY h.due_date ASC,h.id DESC`, [req.user.id, req.user.grade]));
});
app.post("/api/student/homework/:id/submit", requireAuth, (req, res) => {
  const homework = one("SELECT * FROM homework WHERE id=? AND grade=? AND status='published'", [Number(req.params.id), req.user.grade]);
  const answer = cleanText(req.body.answer, 10000);
  if (!homework) return res.status(404).json({ error: "This assignment is no longer available." });
  if (answer.length < 2) return res.status(400).json({ error: "Write your answer before submitting." });
  changed(`INSERT INTO homework_submissions(homework_id,student_id,answer) VALUES(?,?,?)
    ON CONFLICT(homework_id,student_id) DO UPDATE SET answer=excluded.answer,submitted_at=CURRENT_TIMESTAMP`,
    [homework.id, req.user.id, answer]);
  res.json({ ok: true, message: "Your work has been submitted." });
});
app.get("/api/student/exams", requireAuth, (req, res) => {
  const exams = all("SELECT id,title,description,subject,grade,duration,total_marks,pass_marks,start_at,end_at,status FROM exams WHERE status IN ('published','active') AND grade=? ORDER BY id DESC", [req.user.grade]);
  res.json(exams.map(e => ({ ...e, attempted: !!one("SELECT id FROM exam_attempts WHERE exam_id=? AND student_id=?", [e.id, req.user.id]) })));
});
app.get("/api/student/exams/:id", requireAuth, (req, res) => {
  const exam = one("SELECT id,title,description,subject,grade,duration,total_marks,start_at,end_at,status,questions_json FROM exams WHERE id=? AND grade=? AND status IN ('published','active')", [Number(req.params.id), req.user.grade]);
  if (!exam) return res.status(404).json({ error: "Exam not found." });
  if (one("SELECT id FROM exam_attempts WHERE exam_id=? AND student_id=?", [exam.id, req.user.id])) return res.status(409).json({ error: "You have already submitted this exam." });
  res.json({ ...exam, questions: parseJson(exam.questions_json).map(q => ({ id: q.id, text: q.text, options: q.options })) });
});
app.post("/api/student/exams/:id/submit", requireAuth, (req, res) => {
  const exam = one("SELECT * FROM exams WHERE id=? AND grade=? AND status IN ('published','active')", [Number(req.params.id), req.user.grade]);
  if (!exam) return res.status(404).json({ error: "Exam not found." });
  if (one("SELECT id FROM exam_attempts WHERE exam_id=? AND student_id=?", [exam.id, req.user.id])) return res.status(409).json({ error: "This exam has already been submitted." });
  const questions = parseJson(exam.questions_json);
  const answers = req.body.answers && typeof req.body.answers === "object" ? req.body.answers : {};
  const total = questions.reduce((sum, q) => sum + Number(q.marks || 1), 0);
  const score = questions.reduce((sum, q) => sum + (String(answers[q.id] ?? "") === String(q.correct) ? Number(q.marks || 1) : 0), 0);
  created("INSERT INTO exam_attempts(exam_id,student_id,answers_json,score,total_marks) VALUES(?,?,?,?,?)",
    [exam.id, req.user.id, JSON.stringify(answers), score, total || Number(exam.total_marks || 0)]);
  res.json({ ok: true, score, total_marks: total || Number(exam.total_marks || 0) });
});
app.get("/api/student/results", requireAuth, (req, res) => {
  res.json(all(`SELECT a.id,a.score,a.total_marks,a.submitted_at,e.title,e.subject,e.pass_marks
    FROM exam_attempts a JOIN exams e ON e.id=a.exam_id WHERE a.student_id=? ORDER BY a.submitted_at DESC`, [req.user.id]));
});
app.get("/api/student/notifications", requireAuth, (req, res) => {
  res.json(all("SELECT id,title,body,created_at FROM notifications WHERE audience IN ('all','students') ORDER BY id DESC LIMIT 30"));
});

// Admin workspace
app.get("/api/admin/overview", requireAuth, requireAdmin, (req, res) => {
  const stats = {
    students: one("SELECT COUNT(*) AS n FROM users WHERE role='student'")?.n || 0,
    lessons: one("SELECT COUNT(*) AS n FROM lessons")?.n || 0,
    publishedLessons: one("SELECT COUNT(*) AS n FROM lessons WHERE status='published'")?.n || 0,
    homework: one("SELECT COUNT(*) AS n FROM homework")?.n || 0,
    exams: one("SELECT COUNT(*) AS n FROM exams")?.n || 0,
    attempts: one("SELECT COUNT(*) AS n FROM exam_attempts")?.n || 0,
    submissions: one("SELECT COUNT(*) AS n FROM homework_submissions")?.n || 0
  };
  res.json({ stats, recentStudents: all("SELECT id,name,email,grade,created_at FROM users WHERE role='student' ORDER BY id DESC LIMIT 6") });
});
app.get("/api/admin/students", requireAuth, requireAdmin, (req, res) => {
  res.json(all(`SELECT u.id,u.name,u.email,u.grade,u.status,u.created_at,
    (SELECT COUNT(*) FROM exam_attempts a WHERE a.student_id=u.id) AS exams_taken,
    (SELECT COUNT(*) FROM homework_submissions s WHERE s.student_id=u.id) AS homework_submitted
    FROM users u WHERE u.role='student' ORDER BY u.id DESC`));
});
app.patch("/api/admin/students/:id", requireAuth, requireAdmin, (req, res) => {
  const status = req.body.status === "inactive" ? "inactive" : "active";
  changed("UPDATE users SET status=? WHERE id=? AND role='student'", [status, Number(req.params.id)]);
  res.json({ ok: true });
});

const resources = {
  lessons: { table: "lessons", fields: ["title","description","subject","grade","video_url","material_url","thumbnail_url","status"], required: ["title","grade"], allowedStatus: ["draft","published"] },
  homework: { table: "homework", fields: ["title","description","subject","grade","due_date","attachment_url","status"], required: ["title","grade"], allowedStatus: ["draft","published"] },
  exams: { table: "exams", fields: ["title","description","subject","grade","duration","total_marks","pass_marks","start_at","end_at","status","questions_json"], required: ["title","grade"], allowedStatus: ["draft","published","active","completed"] }
};
function resourceValue(type, body) {
  const cfg = resources[type];
  const values = {};
  for (const field of cfg.fields) {
    let value = body[field];
    if (field === "questions_json") {
      if (Array.isArray(body.questions)) value = JSON.stringify(body.questions);
      else if (typeof value === "string") { try { value = JSON.stringify(JSON.parse(value)); } catch { value = "[]"; } }
      else value = "[]";
    }
    if (["duration","total_marks","pass_marks"].includes(field)) value = Number(value || 0);
    else value = cleanText(value, field === "description" ? 10000 : 1000);
    values[field] = value;
  }
  if (!cfg.allowedStatus.includes(values.status)) values.status = "draft";
  if (!ALLOWED_GRADES.includes(values.grade)) values.grade = "";
  if (type === "exams" && !values.subject) {
    values.subject = "";
  }
  return values;
}
function isStoredPdfUrl(value) {
  const match = /^\/uploads\/resources\/([0-9a-f-]{36}\.pdf)$/i.exec(String(value || ""));
  return !!match && fs.existsSync(path.join(RESOURCE_UPLOAD_ROOT, match[1]));
}
function registerResourceRoutes(type) {
  const cfg = resources[type];
  app.get(`/api/admin/${type}`, requireAuth, requireAdmin, (req, res) => {
    const rows = all(`SELECT * FROM ${cfg.table} ORDER BY id DESC`);
    res.json(rows.map(row => type === "exams" ? ({ ...row, questions: parseJson(row.questions_json) }) : row));
  });
  app.post(`/api/admin/${type}`, requireAuth, requireAdmin, (req, res) => {
    const values = resourceValue(type, req.body);
    for (const key of cfg.required) if (!values[key]) return res.status(400).json({ error: `Please provide ${key.replace("_"," ")}.` });
    if (type === "lessons" && !isStoredPdfUrl(values.material_url)) return res.status(400).json({ error: "ارفع ملف PDF للدرس قبل الحفظ." });
    if (type === "homework" && !isStoredPdfUrl(values.attachment_url)) return res.status(400).json({ error: "ارفع ملف PDF للواجب قبل الحفظ." });
    const cols = cfg.fields.join(",");
    const marks = cfg.fields.map(() => "?").join(",");
    const id = created(`INSERT INTO ${cfg.table}(${cols}) VALUES(${marks})`, cfg.fields.map(f => values[f]));
    res.status(201).json({ id, ...values, ...(type === "exams" ? { questions: parseJson(values.questions_json) } : {}) });
  });
  app.put(`/api/admin/${type}/:id`, requireAuth, requireAdmin, (req, res) => {
    const values = resourceValue(type, req.body);
    const existing = one(`SELECT * FROM ${cfg.table} WHERE id=?`, [Number(req.params.id)]);
    if (!existing) return res.status(404).json({ error: "المحتوى المطلوب غير موجود." });
    // Keep legacy links and attachments when an edit does not replace them.
    if (type === "lessons") {
      values.subject = existing.subject || "";
      values.video_url = cleanText(req.body.video_url, 1000) || existing.video_url || "";
      const requestedMaterial = cleanText(req.body.material_url, 1000);
      if (requestedMaterial && requestedMaterial !== (existing.material_url || "") && !isStoredPdfUrl(requestedMaterial)) return res.status(400).json({ error: "ملف الدرس المرفوع غير صالح." });
      values.material_url = requestedMaterial || existing.material_url || "";
      values.thumbnail_url = cleanText(req.body.thumbnail_url, 1000) || existing.thumbnail_url || "";
    }
    if (type === "exams") {
      values.subject = cleanText(req.body.subject, 1000) || existing.subject || "";
    }
    if (type === "homework") {
      values.subject = existing.subject || "";
      const requestedAttachment = cleanText(req.body.attachment_url, 1000);
      if (requestedAttachment && requestedAttachment !== (existing.attachment_url || "") && !isStoredPdfUrl(requestedAttachment)) return res.status(400).json({ error: "ملف الواجب المرفوع غير صالح." });
      values.attachment_url = requestedAttachment || existing.attachment_url || "";
    }
    for (const key of cfg.required) if (!values[key]) return res.status(400).json({ error: `Please provide ${key.replace("_"," ")}.` });
    const set = cfg.fields.map(f => `${f}=?`).join(",");
    changed(`UPDATE ${cfg.table} SET ${set} WHERE id=?`, [...cfg.fields.map(f => values[f]), Number(req.params.id)]);
    res.json({ id: Number(req.params.id), ...values, ...(type === "exams" ? { questions: parseJson(values.questions_json) } : {}) });
  });
  app.delete(`/api/admin/${type}/:id`, requireAuth, requireAdmin, (req, res) => {
    changed(`DELETE FROM ${cfg.table} WHERE id=?`, [Number(req.params.id)]);
    res.json({ ok: true });
  });
}
for (const type of Object.keys(resources)) registerResourceRoutes(type);

// Secure PDF upload shared by lessons and homework. Only administrators can upload.
app.post("/api/admin/resources/pdf", requireAuth, requireAdmin,
  express.raw({ type: ["application/pdf", "application/x-pdf", "application/octet-stream"], limit: MAX_PDF_BYTES }), (req, res) => {
    const originalName = String(req.query.filename || "");
    if (!originalName.toLowerCase().endsWith(".pdf") || originalName.length > 255) {
      return res.status(400).json({ error: "يسمح برفع ملفات PDF فقط." });
    }
    if (!Buffer.isBuffer(req.body) || req.body.length < 8 || req.body.length > MAX_PDF_BYTES) {
      return res.status(400).json({ error: "اختر ملف PDF صالحًا لا يتجاوز حجمه 25 ميجابايت." });
    }
    const header = req.body.subarray(0, 8).toString("ascii");
    const tail = req.body.subarray(Math.max(0, req.body.length - 2048)).toString("latin1");
    if (!header.startsWith("%PDF-") || !tail.includes("%%EOF")) {
      return res.status(400).json({ error: "محتوى الملف ليس ملف PDF صالحًا." });
    }
    const id = `${crypto.randomUUID()}.pdf`;
    fs.mkdirSync(RESOURCE_UPLOAD_ROOT, { recursive: true });
    fs.writeFileSync(path.join(RESOURCE_UPLOAD_ROOT, id), req.body, { flag: "wx" });
    res.status(201).json({ ok: true, url: `/uploads/resources/${id}`, filename: id, size: req.body.length });
  });

app.get("/api/admin/results", requireAuth, requireAdmin, (req, res) => {
  res.json(all(`SELECT a.id,a.score,a.total_marks,a.submitted_at,u.name AS student_name,u.email,e.title AS exam_title,e.subject
    FROM exam_attempts a JOIN users u ON u.id=a.student_id JOIN exams e ON e.id=a.exam_id ORDER BY a.submitted_at DESC`));
});
app.get("/api/admin/submissions", requireAuth, requireAdmin, (req, res) => {
  res.json(all(`SELECT s.id,s.answer,s.submitted_at,u.name AS student_name,u.email,h.title AS homework_title,h.subject
    FROM homework_submissions s JOIN users u ON u.id=s.student_id JOIN homework h ON h.id=s.homework_id ORDER BY s.submitted_at DESC`));
});
app.get("/api/admin/notifications", requireAuth, requireAdmin, (req, res) => {
  res.json(all("SELECT * FROM notifications ORDER BY id DESC"));
});
app.post("/api/admin/notifications", requireAuth, requireAdmin, (req, res) => {
  const title = cleanText(req.body.title, 180), body = cleanText(req.body.body, 3000);
  const audience = ["all","students"].includes(req.body.audience) ? req.body.audience : "students";
  if (!title || !body) return res.status(400).json({ error: "A title and message are required." });
  const id = created("INSERT INTO notifications(title,body,audience) VALUES(?,?,?)", [title, body, audience]);
  res.status(201).json(one("SELECT * FROM notifications WHERE id=?", [id]));
});
app.delete("/api/admin/notifications/:id", requireAuth, requireAdmin, (req, res) => {
  changed("DELETE FROM notifications WHERE id=?", [Number(req.params.id)]);
  res.json({ ok: true });
});
// Public platform settings
app.get("/api/settings", (req, res) => {
  const rows = all("SELECT key, value FROM settings");

  const getSetting = (key, fallback = "") =>
    rows.find(x => x.key === key)?.value || fallback;

  res.json({
    platform_name: getSetting("platform_name", "منصة مستر أحمد"),
    teacher_name: getSetting("teacher_name", "مستر أحمد"),
    support_email: getSetting("support_email"),
    announcement: getSetting("announcement")
  });
});

// Public platform settings
app.get("/api/public/settings", (req, res) => {
  const rows = all("SELECT key, value FROM settings");

  res.json({
    platform_name: rows.find(x => x.key === "platform_name")?.value || "منصة مستر أحمد",
    teacher_name: rows.find(x => x.key === "teacher_name")?.value || "مستر أحمد",
    announcement: rows.find(x => x.key === "announcement")?.value || ""
  });
});

// Get platform settings
app.get("/api/admin/settings", requireAuth, requireAdmin, (req, res) => {
  const rows = all("SELECT key, value FROM settings");

  res.json({
    platform_name: rows.find(x => x.key === "platform_name")?.value || "منصة مستر أحمد",
    teacher_name: rows.find(x => x.key === "teacher_name")?.value || "مستر أحمد",
    support_email: rows.find(x => x.key === "support_email")?.value || "",
    announcement: rows.find(x => x.key === "announcement")?.value || ""
  });
});

// Update platform settings
app.put("/api/admin/settings", requireAuth, requireAdmin, (req, res) => {
  const allowed = [
    "platform_name",
    "teacher_name",
    "support_email",
    "announcement"
  ];

  for (const key of allowed) {
    if (req.body[key] === undefined) continue;

    const value = cleanText(
      req.body[key],
      key === "announcement" ? 3000 : 500
    );

    db.run(`
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key)
      DO UPDATE SET value = excluded.value
    `, [key, value]);
  }

  saveDb();

  res.json({
    ok: true,
    message: "تم تحديث إعدادات المنصة بنجاح."
  });
});

app.get("/admin", (req, res) => res.sendFile(path.join(ROOT, "public", "admin.html")));

// Verify the current administrator credentials
app.post("/api/admin/account/verify", requireAuth, requireAdmin, authLimiter, asyncRoute(async (req, res) => {
  const email = cleanText(req.body.email, 160).toLowerCase();
  const password = String(req.body.password || "");

  if (email !== req.user.email.toLowerCase() ||
      !(await bcrypt.compare(password, req.user.password_hash))) {
    return res.status(401).json({
      error: "البريد الإلكتروني أو كلمة المرور الحالية غير صحيحة."
    });
  }

  res.json({ ok: true });
}));

// Change administrator account details
app.post("/api/admin/account/change", requireAuth, requireAdmin, authLimiter, asyncRoute(async (req, res) => {
  const currentEmail = cleanText(req.body.current_email, 160).toLowerCase();
  const currentPassword = String(req.body.current_password || "");

  // Verify old credentials again before making changes
  if (
    currentEmail !== req.user.email.toLowerCase() ||
    !(await bcrypt.compare(currentPassword, req.user.password_hash))
  ) {
    return res.status(401).json({
      error: "بيانات الحساب الحالي غير صحيحة."
    });
  }

  const name = cleanText(req.body.name, 100);
  const email = cleanText(req.body.email, 160).toLowerCase();
  const password = String(req.body.password || "");
  const confirmPassword = String(req.body.confirm_password || "");

  if (name.length < 2 || !validEmail(email) || password.length < 10) {
    return res.status(400).json({
      error: "تأكد من الاسم والبريد الإلكتروني وكلمة المرور (10 أحرف على الأقل)."
    });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({
      error: "كلمتا المرور غير متطابقتين."
    });
  }

  const existing = one(
    "SELECT id FROM users WHERE email = ? AND id <> ?",
    [email, req.user.id]
  );

  if (existing) {
    return res.status(409).json({
      error: "هذا البريد الإلكتروني مستخدم بالفعل."
    });
  }

  const hash = await bcrypt.hash(password, 12);

  changed(
    "UPDATE users SET name = ?, email = ?, password_hash = ? WHERE id = ? AND role = 'admin'",
    [name, email, hash, req.user.id]
  );

  const updatedUser = one(
    "SELECT * FROM users WHERE id = ?",
    [req.user.id]
  );

  setAuthCookie(res, tokenFor(updatedUser));

  res.json({
    ok: true,
    user: publicUser(updatedUser)
  });
}));

app.get("/student", (req, res) => res.sendFile(path.join(ROOT, "public", "student.html")));
app.get("/login", (req, res) => res.sendFile(path.join(ROOT, "public", "index.html")));
app.get("/", (req, res) => res.sendFile(path.join(ROOT, "public", "index.html")));

app.use((err, req, res, next) => {
  if (err?.status === 413 || err?.type === "entity.too.large") {
    return res.status(413).json({ error: "حجم الملف أكبر من الحد المسموح (25 ميجابايت)." });
  }
  if (err?.status >= 400 && err?.status < 500) {
    return res.status(err.status).json({ error: "تعذر معالجة الطلب أو الملف المرسل." });
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

initialize().then(() => {
  app.listen(PORT, () => console.log(`Mostafa Edu Platform is running at http://localhost:${PORT}`));
}).catch(error => {
  console.error("Could not initialize the platform database:", error);
  process.exit(1);
});
