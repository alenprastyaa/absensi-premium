import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from './services/database.service.js';
import { randomId } from './utils/id.js';
const PORT = Number(process.env.PORT || 3401);
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 7);
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * SESSION_TTL_DAYS;
const SESSION_SECRET = process.env.SESSION_SECRET || 'administrasi-guru-premium-session-secret';
const getSafeUser = (user) => {
    const { passwordHash, initialPassword, ...safeUser } = user;
    return safeUser;
};
const slugify = (value) => value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .replace(/^_+|_+$/g, '') || 'sekolah';
const normalizeComparableText = (value) => value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
const generateSchoolAdminCredentials = async (schoolName) => {
    const baseUsername = `admin-${slugify(schoolName)}`;
    let username = baseUsername;
    let attempt = 0;
    while (await db.getUserByUsername(username)) {
        attempt += 1;
        username = `${baseUsername}${attempt + 1}`;
    }
    const password = `Adm-${randomId(8).toUpperCase()}`;
    return { username, password };
};
const normalizeTeacherNames = (value) => {
    if (!Array.isArray(value))
        return [];
    return value
        .map((item) => (typeof item === 'string' ? item : item && typeof item === 'object' && 'name' in item ? String(item.name ?? '') : ''))
        .map((name) => name.trim())
        .filter((name) => name.length > 0);
};
const normalizeStudentRows = (value) => {
    if (!Array.isArray(value))
        return [];
    return value
        .map((item) => {
        if (item && typeof item === 'object') {
            const row = item;
            return {
                name: String(row.name ?? row.Nama ?? row['Nama Siswa'] ?? row['Nama'] ?? '').trim(),
                nisn: String(row.nisn ?? row.NISN ?? row['Nomor NISN'] ?? '').trim(),
                className: String(row.className ?? row.Kelas ?? row['Nama Kelas'] ?? row['Kelas'] ?? '').trim(),
            };
        }
        return { name: '', nisn: '', className: '' };
    })
        .filter((row) => row.name && row.nisn && row.className);
};
const base64UrlEncode = (value) => Buffer.from(value).toString('base64url');
const base64UrlDecode = (value) => Buffer.from(value, 'base64url').toString('utf8');
const createSessionToken = (userId) => {
    const payload = {
        sub: userId,
        exp: Date.now() + SESSION_TTL_MS,
    };
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signature = crypto.createHmac('sha256', SESSION_SECRET).update(encodedPayload).digest('base64url');
    return `${encodedPayload}.${signature}`;
};
const verifySessionToken = (token) => {
    const [encodedPayload, signature] = token.split('.');
    if (!encodedPayload || !signature)
        return null;
    const expectedSignature = crypto.createHmac('sha256', SESSION_SECRET).update(encodedPayload).digest('base64url');
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
        return null;
    }
    try {
        const payload = JSON.parse(base64UrlDecode(encodedPayload));
        if (!payload.sub || !payload.exp || Date.now() > payload.exp) {
            return null;
        }
        return payload;
    }
    catch {
        return null;
    }
};
async function main() {
    await db.init();
    const app = express();
    app.use(cors({ origin: true, credentials: true }));
    app.use(express.json());
    const authenticateToken = async (req, res, next) => {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        if (!token) {
            res.status(401).json({ error: 'Token tidak ditemukan. Silakan login kembali.' });
            return;
        }
        const payload = verifySessionToken(token);
        if (!payload) {
            res.status(403).json({ error: 'Sesi kedaluwarsa atau tidak valid.' });
            return;
        }
        const liveUser = await db.getUser(payload.sub);
        if (!liveUser) {
            res.status(403).json({ error: 'Sesi kedaluwarsa atau tidak valid.' });
            return;
        }
        req.user = liveUser;
        next();
    };
    const requireRole = (roles) => {
        return (req, res, next) => {
            if (!req.user || !roles.includes(req.user.role)) {
                res.status(403).json({ error: 'Anda tidak memiliki hak akses untuk tindakan ini.' });
                return;
            }
            next();
        };
    };
    app.get('/api/health', (req, res) => {
        res.json({ status: 'ok', time: new Date().toISOString() });
    });
    app.get('/api/public/pricing-plans', async (req, res) => {
        res.json(await db.getPricingPlans(true));
    });
    app.get('/api/public/settings', async (req, res) => {
        res.json(await db.getSiteSettings());
    });
    app.post('/api/auth/login', async (req, res) => {
        const username = String(req.body?.username ?? '').trim();
        const password = String(req.body?.password ?? '').trim();
        if (!username || !password) {
            res.status(400).json({ error: 'Username dan password wajib diisi.' });
            return;
        }
        const user = await db.getUserByUsername(username);
        if (!user) {
            res.status(401).json({ error: 'Username atau password salah.' });
            return;
        }
        const isPasswordCorrect = bcrypt.compareSync(password, user.passwordHash);
        if (!isPasswordCorrect) {
            res.status(401).json({ error: 'Username atau password salah.' });
            return;
        }
        if (user.schoolId) {
            const school = await db.getSchool(user.schoolId);
            if (!school || school.subscriptionStatus === 'nonaktif') {
                res.status(403).json({ error: 'Sekolah Anda dinonaktifkan atau masa langganan habis. Hubungi Super Admin.' });
                return;
            }
        }
        const token = createSessionToken(user.id);
        res.json({ token, user: getSafeUser(user) });
    });
    app.get('/api/auth/current', async (req, res) => {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        if (!token) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        const payload = verifySessionToken(token);
        if (!payload) {
            res.status(401).json({ error: 'Session expired' });
            return;
        }
        const user = await db.getUser(payload.sub);
        if (!user) {
            res.status(401).json({ error: 'Session expired' });
            return;
        }
        const school = user.schoolId ? await db.getSchool(user.schoolId) : null;
        res.json({ user: getSafeUser(user), school });
    });
    app.post('/api/auth/logout', (req, res) => {
        res.json({ success: true });
    });
    app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
        const { oldPassword, newPassword } = req.body;
        const currentUser = req.user;
        if (!oldPassword || !newPassword) {
            res.status(400).json({ error: 'Password lama dan password baru wajib diisi.' });
            return;
        }
        if (newPassword.trim().length < 4) {
            res.status(400).json({ error: 'Password baru minimal harus 4 karakter.' });
            return;
        }
        const isPasswordCorrect = bcrypt.compareSync(oldPassword, currentUser.passwordHash);
        if (!isPasswordCorrect) {
            res.status(400).json({ error: 'Password lama yang Anda masukkan salah.' });
            return;
        }
        const updated = await db.updateUser(currentUser.id, currentUser.schoolId, { passwordPlain: newPassword.trim() });
        if (!updated) {
            res.status(500).json({ error: 'Gagal memperbarui password.' });
            return;
        }
        res.json({ success: true, message: 'Password berhasil diubah.' });
    });
    app.get('/api/superadmin/schools', authenticateToken, requireRole(['super_admin']), async (req, res) => {
        const schools = await db.getSchools();
        const enrichedSchools = await Promise.all(schools.map(async (school) => {
            const allUsers = await db.getUsers(school.id);
            const totalTeachers = allUsers.filter((u) => u.role === 'teacher').length;
            const totalStudents = (await db.getStudents(school.id)).length;
            const totalClasses = (await db.getClasses(school.id)).length;
            return { ...school, totalTeachers, totalStudents, totalClasses };
        }));
        res.json(enrichedSchools);
    });
    app.post('/api/superadmin/schools', authenticateToken, requireRole(['super_admin']), async (req, res) => {
        const { name, address, subscriptionPlan, adminName } = req.body;
        if (!name || !address || !subscriptionPlan || !adminName) {
            res.status(400).json({ error: 'Seluruh data sekolah dan nama admin wajib diisi.' });
            return;
        }
        const school = await db.createSchool(name, address, subscriptionPlan);
        const { username, password } = await generateSchoolAdminCredentials(school.name);
        const adminUser = await db.createUser(school.id, username, password, 'admin', adminName, password);
        if (!adminUser) {
            res.status(500).json({ error: 'Gagal membuat akun admin sekolah.' });
            return;
        }
        res.status(201).json({
            school,
            admin: {
                id: adminUser.id,
                username: adminUser.username,
                password,
                name: adminUser.name,
            },
        });
    });
    app.put('/api/superadmin/schools/:id', authenticateToken, requireRole(['super_admin']), async (req, res) => {
        const { id } = req.params;
        const { name, address, subscriptionPlan, subscriptionStatus } = req.body;
        const updated = await db.updateSchool(id, {
            name,
            address,
            subscriptionPlan: subscriptionPlan,
            subscriptionStatus: subscriptionStatus,
        });
        if (!updated) {
            res.status(404).json({ error: 'Sekolah tidak ditemukan.' });
            return;
        }
        res.json(updated);
    });
    app.post('/api/superadmin/schools/:id/reset-password', authenticateToken, requireRole(['super_admin']), async (req, res) => {
        const { id } = req.params;
        const school = await db.getSchool(id);
        if (!school) {
            res.status(404).json({ error: 'Sekolah tidak ditemukan.' });
            return;
        }
        const schoolUsers = await db.getUsers(id);
        const adminUser = schoolUsers.find((user) => user.role === 'admin');
        if (!adminUser) {
            res.status(404).json({ error: 'Akun admin sekolah tidak ditemukan.' });
            return;
        }
        const password = `Adm-${randomId(8).toUpperCase()}`;
        const updatedAdmin = await db.updateUser(adminUser.id, id, { passwordPlain: password });
        if (!updatedAdmin) {
            res.status(500).json({ error: 'Gagal mereset password admin sekolah.' });
            return;
        }
        res.json({
            success: true,
            schoolId: school.id,
            schoolName: school.name,
            admin: {
                id: updatedAdmin.id,
                username: updatedAdmin.username,
                password,
                name: updatedAdmin.name,
            },
        });
    });
    app.delete('/api/superadmin/schools/:id', authenticateToken, requireRole(['super_admin']), async (req, res) => {
        const { id } = req.params;
        const school = await db.getSchool(id);
        if (!school) {
            res.status(404).json({ error: 'Sekolah tidak ditemukan.' });
            return;
        }
        await db.deleteSchool(id);
        res.json({ success: true, message: `Sekolah ${school.name} berhasil dihapus beserta seluruh datanya.` });
    });
    app.get('/api/superadmin/pricing-plans', authenticateToken, requireRole(['super_admin']), async (req, res) => {
        res.json(await db.getPricingPlans());
    });
    app.post('/api/superadmin/pricing-plans', authenticateToken, requireRole(['super_admin']), async (req, res) => {
        const { name, price, period, description, features, isHighlighted, isActive, sortOrder } = req.body;
        if (!name || !price || !period) {
            res.status(400).json({ error: 'Nama, harga, dan periode paket wajib diisi.' });
            return;
        }
        const created = await db.createPricingPlan({
            name,
            price,
            period,
            description: description ?? '',
            features: Array.isArray(features) ? features.map((f) => String(f)) : [],
            isHighlighted: isHighlighted === true,
            isActive: isActive !== false,
            sortOrder: Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
        });
        res.status(201).json(created);
    });
    app.put('/api/superadmin/pricing-plans/:id', authenticateToken, requireRole(['super_admin']), async (req, res) => {
        const { id } = req.params;
        const { name, price, period, description, features, isHighlighted, isActive, sortOrder } = req.body;
        if (!name || !price || !period) {
            res.status(400).json({ error: 'Nama, harga, dan periode paket wajib diisi.' });
            return;
        }
        const updated = await db.updatePricingPlan(id, {
            name,
            price,
            period,
            description: description ?? '',
            features: Array.isArray(features) ? features.map((f) => String(f)) : [],
            isHighlighted: isHighlighted === true,
            isActive: isActive !== false,
            sortOrder: Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
        });
        if (!updated) {
            res.status(404).json({ error: 'Paket tidak ditemukan.' });
            return;
        }
        res.json(updated);
    });
    app.delete('/api/superadmin/pricing-plans/:id', authenticateToken, requireRole(['super_admin']), async (req, res) => {
        const deleted = await db.deletePricingPlan(req.params.id);
        if (!deleted) {
            res.status(404).json({ error: 'Paket tidak ditemukan.' });
            return;
        }
        res.json({ success: true, message: 'Paket berhasil dihapus.' });
    });
    app.get('/api/superadmin/settings', authenticateToken, requireRole(['super_admin']), async (req, res) => {
        res.json(await db.getSiteSettings());
    });
    app.put('/api/superadmin/settings', authenticateToken, requireRole(['super_admin']), async (req, res) => {
        const { whatsappNumber, whatsappMessageTemplate } = req.body;
        if (!whatsappNumber) {
            res.status(400).json({ error: 'Nomor WhatsApp wajib diisi.' });
            return;
        }
        const updated = await db.updateSiteSettings({
            whatsappNumber,
            whatsappMessageTemplate: whatsappMessageTemplate ?? '',
        });
        res.json(updated);
    });
    app.get('/api/admin/classes', authenticateToken, requireRole(['admin', 'teacher']), async (req, res) => {
        const schoolId = req.user.schoolId;
        res.json(await db.getClasses(schoolId));
    });
    app.post('/api/admin/classes', authenticateToken, requireRole(['teacher']), async (req, res) => {
        const schoolId = req.user.schoolId;
        const { name } = req.body;
        if (!name || name.trim() === '') {
            res.status(400).json({ error: 'Nama kelas wajib diisi.' });
            return;
        }
        res.status(201).json(await db.createClass(schoolId, name));
    });
    app.put('/api/admin/classes/:id', authenticateToken, requireRole(['teacher']), async (req, res) => {
        const schoolId = req.user.schoolId;
        const { id } = req.params;
        const { name } = req.body;
        if (!name || name.trim() === '') {
            res.status(400).json({ error: 'Nama kelas wajib diisi.' });
            return;
        }
        const updated = await db.updateClass(id, schoolId, name);
        if (!updated) {
            res.status(404).json({ error: 'Kelas tidak ditemukan.' });
            return;
        }
        res.json(updated);
    });
    app.delete('/api/admin/classes/:id', authenticateToken, requireRole(['teacher']), async (req, res) => {
        const schoolId = req.user.schoolId;
        const { id } = req.params;
        const cls = await db.getClass(id, schoolId);
        if (!cls) {
            res.status(404).json({ error: 'Kelas tidak ditemukan.' });
            return;
        }
        await db.deleteClass(id, schoolId);
        res.json({ success: true, message: `Kelas ${cls.name} berhasil dihapus beserta siswa di dalamnya.` });
    });
    app.get('/api/admin/teachers', authenticateToken, requireRole(['admin']), async (req, res) => {
        const schoolId = req.user.schoolId;
        const teachers = (await db.getUsers(schoolId))
            .filter((u) => u.role === 'teacher')
            .map(({ passwordHash, ...safeUser }) => safeUser);
        res.json(teachers);
    });
    app.post('/api/admin/teachers', authenticateToken, requireRole(['admin']), async (req, res) => {
        const schoolId = req.user.schoolId;
        const { name, username, password } = req.body;
        if (!name) {
            res.status(400).json({ error: 'Seluruh kolom wajib diisi.' });
            return;
        }
        const teacher = username && password
            ? await db.createUser(schoolId, username, password, 'teacher', name, password)
            : await db.createTeacherFromName(schoolId, name);
        if (!teacher) {
            res.status(500).json({ error: 'Gagal membuat akun guru.' });
            return;
        }
        const { passwordHash, ...safeTeacher } = teacher;
        res.status(201).json(safeTeacher);
    });
    app.post('/api/admin/teachers/import', authenticateToken, requireRole(['admin']), async (req, res) => {
        const schoolId = req.user.schoolId;
        const names = normalizeTeacherNames(req.body?.names ?? req.body?.teachers);
        if (names.length === 0) {
            res.status(400).json({ error: 'Daftar nama guru wajib diisi.' });
            return;
        }
        const createdTeachers = [];
        for (const name of names) {
            const teacher = await db.createTeacherFromName(schoolId, name);
            if (!teacher) {
                continue;
            }
            const { passwordHash, ...safeTeacher } = teacher;
            createdTeachers.push(safeTeacher);
        }
        res.status(201).json({
            success: true,
            totalRequested: names.length,
            totalCreated: createdTeachers.length,
            teachers: createdTeachers,
        });
    });
    app.put('/api/admin/teachers/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
        const schoolId = req.user.schoolId;
        const { id } = req.params;
        const { name, password } = req.body;
        const updated = await db.updateUser(id, schoolId, { name, passwordPlain: password });
        if (!updated) {
            res.status(404).json({ error: 'Guru tidak ditemukan.' });
            return;
        }
        const { passwordHash, ...safeTeacher } = updated;
        res.json(safeTeacher);
    });
    app.delete('/api/admin/teachers/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
        const schoolId = req.user.schoolId;
        const { id } = req.params;
        const user = await db.getUser(id);
        if (!user || user.schoolId !== schoolId || user.role !== 'teacher') {
            res.status(404).json({ error: 'Guru tidak ditemukan.' });
            return;
        }
        await db.deleteUser(id, schoolId);
        res.json({ success: true, message: `Akun Guru ${user.name} berhasil dihapus.` });
    });
    app.get('/api/admin/students', authenticateToken, requireRole(['admin', 'teacher']), async (req, res) => {
        const schoolId = req.user.schoolId;
        const students = await db.getStudents(schoolId);
        const classes = await db.getClasses(schoolId);
        const enrichedStudents = students.map((student) => {
            const cls = classes.find((c) => c.id === student.classId);
            return { ...student, className: cls ? cls.name : 'Tanpa Kelas' };
        });
        res.json(enrichedStudents);
    });
    app.post('/api/admin/students', authenticateToken, requireRole(['teacher']), async (req, res) => {
        const schoolId = req.user.schoolId;
        const { name, nisn, classId } = req.body;
        if (!name || !nisn || !classId) {
            res.status(400).json({ error: 'Seluruh data siswa wajib diisi.' });
            return;
        }
        const cls = await db.getClass(classId, schoolId);
        if (!cls) {
            res.status(400).json({ error: 'Kelas tidak valid untuk sekolah Anda.' });
            return;
        }
        const allStudents = await db.getStudents(schoolId);
        if (allStudents.some((s) => s.nisn === nisn.trim())) {
            res.status(400).json({ error: 'Siswa dengan NISN tersebut sudah terdaftar di sekolah ini.' });
            return;
        }
        const student = await db.createStudent(schoolId, classId, name, nisn);
        if (!student) {
            res.status(500).json({ error: 'Gagal mendaftarkan siswa.' });
            return;
        }
        res.status(201).json({ ...student, className: cls.name });
    });
    app.post('/api/admin/students/import', authenticateToken, requireRole(['teacher']), async (req, res) => {
        const schoolId = req.user.schoolId;
        const rows = normalizeStudentRows(req.body?.students ?? req.body?.rows ?? req.body?.items);
        if (rows.length === 0) {
            res.status(400).json({ error: 'Daftar siswa wajib diisi.' });
            return;
        }
        const classes = await db.getClasses(schoolId);
        const existingStudents = await db.getStudents(schoolId);
        const usedNisn = new Set(existingStudents.map((student) => student.nisn.trim()));
        const createdStudents = [];
        const skipped = [];
        for (const row of rows) {
            const normalizedClassName = normalizeComparableText(row.className);
            const cls = classes.find((item) => normalizeComparableText(item.name) === normalizedClassName);
            if (!cls) {
                skipped.push({ name: row.name, reason: `Kelas "${row.className}" tidak ditemukan` });
                continue;
            }
            if (usedNisn.has(row.nisn)) {
                skipped.push({ name: row.name, reason: `NISN ${row.nisn} sudah terdaftar` });
                continue;
            }
            const created = await db.createStudentFromImport(schoolId, cls.id, row.name, row.nisn);
            if (!created) {
                skipped.push({ name: row.name, reason: 'Gagal membuat data siswa' });
                continue;
            }
            createdStudents.push({ ...created, className: cls.name });
            usedNisn.add(row.nisn);
        }
        res.status(201).json({
            success: true,
            totalRequested: rows.length,
            totalCreated: createdStudents.length,
            totalSkipped: skipped.length,
            skipped,
            students: createdStudents,
        });
    });
    app.post('/api/admin/students/promote', authenticateToken, requireRole(['teacher']), async (req, res) => {
        const schoolId = req.user.schoolId;
        const fromClassId = String(req.body?.fromClassId ?? '').trim();
        const targetClassId = String(req.body?.targetClassId ?? '').trim();
        const requestedStudentIds = Array.isArray(req.body?.studentIds)
            ? req.body.studentIds.map((id) => String(id).trim()).filter(Boolean)
            : [];
        if (!fromClassId || !targetClassId) {
            res.status(400).json({ error: 'Kelas asal dan kelas tujuan wajib dipilih.' });
            return;
        }
        if (fromClassId === targetClassId) {
            res.status(400).json({ error: 'Kelas tujuan harus berbeda dari kelas asal.' });
            return;
        }
        const fromClass = await db.getClass(fromClassId, schoolId);
        const targetClass = await db.getClass(targetClassId, schoolId);
        if (!fromClass || !targetClass) {
            res.status(404).json({ error: 'Kelas asal atau kelas tujuan tidak ditemukan.' });
            return;
        }
        const schoolStudents = await db.getStudents(schoolId);
        const promotableStudents = schoolStudents.filter((student) => student.classId === fromClassId && (requestedStudentIds.length === 0 || requestedStudentIds.includes(student.id)));
        if (promotableStudents.length === 0) {
            res.status(400).json({ error: 'Tidak ada siswa yang bisa dipromosikan dari kelas asal.' });
            return;
        }
        const updatedCount = await db.promoteStudents(promotableStudents.map((student) => student.id), schoolId, targetClassId);
        res.json({
            success: true,
            fromClassName: fromClass.name,
            targetClassName: targetClass.name,
            totalPromoted: updatedCount,
            studentIds: promotableStudents.map((student) => student.id),
        });
    });
    app.put('/api/admin/students/:id', authenticateToken, requireRole(['teacher']), async (req, res) => {
        const schoolId = req.user.schoolId;
        const { id } = req.params;
        const { name, nisn, classId } = req.body;
        if (!name || !nisn || !classId) {
            res.status(400).json({ error: 'Seluruh data siswa wajib diisi.' });
            return;
        }
        const allStudents = await db.getStudents(schoolId);
        if (allStudents.some((s) => s.nisn === nisn.trim() && s.id !== id)) {
            res.status(400).json({ error: 'NISN sudah digunakan oleh siswa lain.' });
            return;
        }
        const updated = await db.updateStudent(id, schoolId, classId, name, nisn);
        if (!updated) {
            res.status(404).json({ error: 'Siswa tidak ditemukan atau data kelas tidak valid.' });
            return;
        }
        const cls = await db.getClass(classId, schoolId);
        res.json({ ...updated, className: cls ? cls.name : 'Tanpa Kelas' });
    });
    app.delete('/api/admin/students/:id', authenticateToken, requireRole(['teacher']), async (req, res) => {
        const schoolId = req.user.schoolId;
        const { id } = req.params;
        const student = await db.getStudent(id, schoolId);
        if (!student) {
            res.status(404).json({ error: 'Siswa tidak ditemukan.' });
            return;
        }
        await db.deleteStudent(id, schoolId);
        res.json({ success: true, message: `Data siswa ${student.name} berhasil dihapus.` });
    });
    app.get('/api/admin/attendances', authenticateToken, requireRole(['admin', 'teacher']), async (req, res) => {
        const schoolId = req.user.schoolId;
        const attendances = await db.getAttendances(schoolId);
        const students = await db.getStudents(schoolId);
        const classes = await db.getClasses(schoolId);
        const users = await db.getUsers(schoolId);
        const enrichedAttendances = attendances.map((att) => {
            const student = students.find((s) => s.id === att.studentId);
            const cls = classes.find((c) => c.id === att.classId);
            const user = users.find((u) => u.id === att.scannedByUserId);
            return {
                ...att,
                studentName: student ? student.name : 'Siswa Terhapus',
                nisn: student ? student.nisn : '-',
                className: cls ? cls.name : 'Tanpa Kelas',
                scannedByName: user ? user.name : 'Sistem',
            };
        });
        res.json(enrichedAttendances);
    });
    app.post('/api/admin/attendances', authenticateToken, requireRole(['teacher']), async (req, res) => {
        const schoolId = req.user.schoolId;
        const scannedByUserId = req.user.id;
        const { studentId, status, date } = req.body;
        if (!studentId || !status) {
            res.status(400).json({ error: 'Data studentId dan status wajib diisi.' });
            return;
        }
        const student = await db.getStudent(studentId, schoolId);
        if (!student) {
            res.status(404).json({ error: 'Siswa tidak ditemukan di sekolah Anda.' });
            return;
        }
        const att = await db.recordAttendance(schoolId, studentId, student.classId, status, 'manual', scannedByUserId, date);
        if (!att) {
            res.status(500).json({ error: 'Gagal mencatat absensi.' });
            return;
        }
        if (att.duplicate) {
            res.json({
                success: true,
                duplicate: true,
                message: 'Siswa ini sudah absen hari ini.',
                attendance: att,
            });
            return;
        }
        res.status(201).json({
            success: true,
            duplicate: false,
            message: 'Absensi berhasil dicatat.',
            attendance: att,
        });
    });
    app.delete('/api/admin/attendances/:id', authenticateToken, requireRole(['teacher']), async (req, res) => {
        const schoolId = req.user.schoolId;
        await db.deleteAttendance(req.params.id, schoolId);
        res.json({ success: true, message: 'Catatan absensi berhasil dihapus.' });
    });
    app.post('/api/teacher/scan', authenticateToken, requireRole(['teacher']), async (req, res) => {
        const schoolId = req.user.schoolId;
        const scannedByUserId = req.user.id;
        const { qrCode, status } = req.body;
        if (!qrCode) {
            res.status(400).json({ error: 'QR Code tidak terbaca atau kosong.' });
            return;
        }
        const attendStatus = (status || 'hadir');
        const student = await db.getStudentByQrCode(qrCode);
        if (!student) {
            res.status(404).json({ error: 'Siswa dengan QR Code ini tidak ditemukan.' });
            return;
        }
        if (student.schoolId !== schoolId) {
            res.status(403).json({ error: 'Akses Ditolak! Siswa terdaftar di sekolah lain.' });
            return;
        }
        const attendance = await db.recordAttendance(schoolId, student.id, student.classId, attendStatus, 'qr', scannedByUserId);
        if (!attendance) {
            res.status(500).json({ error: 'Gagal memproses absensi.' });
            return;
        }
        const cls = await db.getClass(student.classId, schoolId);
        res.json({
            success: true,
            duplicate: !!attendance.duplicate,
            message: attendance.duplicate ? 'Siswa ini sudah absen hari ini.' : 'Absensi berhasil dicatat.',
            student: {
                id: student.id,
                name: student.name,
                nisn: student.nisn,
                className: cls ? cls.name : 'Tanpa Kelas',
            },
            attendance: {
                id: attendance.id,
                date: attendance.date,
                time: attendance.time,
                status: attendance.status,
                method: attendance.method,
            },
        });
    });
    app.get('/api/teacher/history', authenticateToken, requireRole(['teacher', 'admin']), async (req, res) => {
        const schoolId = req.user.schoolId;
        const today = new Date().toISOString().split('T')[0];
        const attendances = (await db.getAttendances(schoolId)).filter((a) => a.date === today);
        const students = await db.getStudents(schoolId);
        const classes = await db.getClasses(schoolId);
        const users = await db.getUsers(schoolId);
        const enriched = attendances.map((att) => {
            const student = students.find((s) => s.id === att.studentId);
            const cls = classes.find((c) => c.id === att.classId);
            const user = users.find((u) => u.id === att.scannedByUserId);
            return {
                ...att,
                studentName: student ? student.name : 'Siswa Terhapus',
                nisn: student ? student.nisn : '-',
                className: cls ? cls.name : 'Tanpa Kelas',
                scannedByName: user ? user.name : 'Sistem',
            };
        });
        res.json(enriched.sort((a, b) => b.time.localeCompare(a.time)));
    });
    app.get('/api/academic/subjects', authenticateToken, requireRole(['admin', 'teacher']), async (req, res) => {
        const schoolId = req.user.schoolId;
        const subjects = await db.getSubjects(schoolId);
        const classes = await db.getClasses(schoolId);
        res.json(subjects.map((s) => ({ ...s, className: classes.find((c) => c.id === s.classId)?.name || 'Tanpa Kelas' })));
    });
    app.post('/api/academic/subjects', authenticateToken, requireRole(['admin', 'teacher']), async (req, res) => {
        const schoolId = req.user.schoolId;
        const { code, name, teacherName, classId, isActive } = req.body;
        if (!code || !name || !teacherName || !classId) {
            res.status(400).json({ error: 'Seluruh kolom wajib diisi.' });
            return;
        }
        const created = await db.createSubject(schoolId, code, name, teacherName, classId, isActive !== false);
        if (!created) {
            res.status(400).json({ error: 'Kode Mata Pelajaran sudah digunakan.' });
            return;
        }
        const cls = await db.getClass(classId, schoolId);
        res.status(201).json({ ...created, className: cls ? cls.name : 'Tanpa Kelas' });
    });
    app.put('/api/academic/subjects/:id', authenticateToken, requireRole(['admin', 'teacher']), async (req, res) => {
        const schoolId = req.user.schoolId;
        const { id } = req.params;
        const { code, name, teacherName, classId, isActive } = req.body;
        if (!code || !name || !teacherName || !classId) {
            res.status(400).json({ error: 'Seluruh kolom wajib diisi.' });
            return;
        }
        const updated = await db.updateSubject(id, schoolId, code, name, teacherName, classId, isActive !== false);
        if (!updated) {
            res.status(400).json({ error: 'Gagal memperbarui. Pastikan Kode Mata Pelajaran unik.' });
            return;
        }
        const cls = await db.getClass(classId, schoolId);
        res.json({ ...updated, className: cls ? cls.name : 'Tanpa Kelas' });
    });
    app.delete('/api/academic/subjects/:id', authenticateToken, requireRole(['admin', 'teacher']), async (req, res) => {
        const deleted = await db.deleteSubject(req.params.id, req.user.schoolId);
        if (!deleted) {
            res.status(404).json({ error: 'Mata pelajaran tidak ditemukan.' });
            return;
        }
        res.json({ success: true, message: 'Mata pelajaran berhasil dihapus.' });
    });
    app.get('/api/academic/academic-years', authenticateToken, requireRole(['admin', 'teacher']), async (req, res) => {
        res.json(await db.getAcademicYears(req.user.schoolId));
    });
    app.post('/api/academic/academic-years', authenticateToken, requireRole(['admin', 'teacher']), async (req, res) => {
        const { name, isActive } = req.body;
        if (!name) {
            res.status(400).json({ error: 'Tahun Ajaran wajib diisi.' });
            return;
        }
        res.status(201).json(await db.createAcademicYear(req.user.schoolId, name, isActive === true));
    });
    app.put('/api/academic/academic-years/:id', authenticateToken, requireRole(['admin', 'teacher']), async (req, res) => {
        const { name, isActive } = req.body;
        if (!name) {
            res.status(400).json({ error: 'Tahun Ajaran wajib diisi.' });
            return;
        }
        const updated = await db.updateAcademicYear(req.params.id, req.user.schoolId, name, isActive === true);
        if (!updated) {
            res.status(404).json({ error: 'Tahun ajaran tidak ditemukan.' });
            return;
        }
        res.json(updated);
    });
    app.delete('/api/academic/academic-years/:id', authenticateToken, requireRole(['admin', 'teacher']), async (req, res) => {
        const deleted = await db.deleteAcademicYear(req.params.id, req.user.schoolId);
        if (!deleted) {
            res.status(404).json({ error: 'Tahun ajaran tidak ditemukan.' });
            return;
        }
        res.json({ success: true, message: 'Tahun ajaran berhasil dihapus.' });
    });
    app.get('/api/academic/weights', authenticateToken, requireRole(['admin', 'teacher']), async (req, res) => {
        const subjectId = typeof req.query.subjectId === 'string' ? req.query.subjectId : null;
        res.json(await db.getAssessmentWeights(req.user.schoolId, subjectId));
    });
    app.put('/api/academic/weights', authenticateToken, requireRole(['admin', 'teacher']), async (req, res) => {
        const { weights, subjectId } = req.body;
        if (!weights || !Array.isArray(weights)) {
            res.status(400).json({ error: 'Format data tidak valid.' });
            return;
        }
        const success = await db.updateAssessmentWeights(req.user.schoolId, subjectId ?? null, weights);
        if (!success) {
            res.status(400).json({ error: 'Gagal memperbarui bobot. Total bobot NH dan PAS harus tepat 100%.' });
            return;
        }
        res.json({ success: true, weights: await db.getAssessmentWeights(req.user.schoolId, subjectId ?? null) });
    });
    app.get('/api/academic/assessments', authenticateToken, requireRole(['admin', 'teacher']), async (req, res) => {
        res.json(await db.getAssessments(req.user.schoolId));
    });
    app.post('/api/academic/assessments', authenticateToken, requireRole(['admin', 'teacher']), async (req, res) => {
        const { academicYearId, semester, classId, subjectId, categoryCode, name, date } = req.body;
        if (!academicYearId || !semester || !classId || !subjectId || !categoryCode || !name || !date) {
            res.status(400).json({ error: 'Seluruh kolom wajib diisi.' });
            return;
        }
        if (categoryCode === 'pas') {
            const existing = (await db.getAssessments(req.user.schoolId)).find((a) => a.academicYearId === academicYearId && a.semester === semester && a.classId === classId && a.subjectId === subjectId && a.categoryCode === 'pas');
            if (existing) {
                res.json(existing);
                return;
            }
        }
        res.status(201).json(await db.createAssessment(req.user.schoolId, academicYearId, semester, classId, subjectId, categoryCode, name, date));
    });
    app.delete('/api/academic/assessments/:id', authenticateToken, requireRole(['admin', 'teacher']), async (req, res) => {
        const deleted = await db.deleteAssessment(req.params.id, req.user.schoolId);
        if (!deleted) {
            res.status(404).json({ error: 'Penilaian tidak ditemukan.' });
            return;
        }
        res.json({ success: true });
    });
    app.get('/api/academic/grades', authenticateToken, requireRole(['admin', 'teacher']), async (req, res) => {
        res.json(await db.getStudentGrades(req.user.schoolId));
    });
    app.post('/api/academic/grades', authenticateToken, requireRole(['admin', 'teacher']), async (req, res) => {
        const { assessmentId, grades } = req.body;
        if (!assessmentId || !grades || !Array.isArray(grades)) {
            res.status(400).json({ error: 'Data tidak lengkap atau format salah.' });
            return;
        }
        await db.saveGrades(req.user.schoolId, assessmentId, grades);
        res.json({ success: true, message: 'Nilai berhasil disimpan.' });
    });
    app.get('/api/academic/recap', authenticateToken, requireRole(['admin', 'teacher']), async (req, res) => {
        const { academicYearId, semester, classId, subjectId } = req.query;
        if (!academicYearId || !semester || !classId || !subjectId) {
            res.status(400).json({ error: 'Parameter filter tidak lengkap.' });
            return;
        }
        const schoolId = req.user.schoolId;
        const students = (await db.getStudents(schoolId)).filter((s) => s.classId === String(classId));
        const classes = await db.getClasses(schoolId);
        const assessments = (await db.getAssessments(schoolId)).filter((a) => a.academicYearId === String(academicYearId) && a.semester === String(semester) && a.classId === String(classId) && a.subjectId === String(subjectId));
        const allGrades = await db.getStudentGrades(schoolId);
        const weights = await db.getAssessmentWeights(schoolId, String(subjectId));
        const enrichedStudents = students.map((student) => ({
            ...student,
            className: classes.find((c) => c.id === student.classId)?.name || 'Tanpa Kelas',
        }));
        res.json({
            weights,
            assessments,
            students: enrichedStudents,
            grades: allGrades.filter((g) => assessments.map((a) => a.id).includes(g.assessmentId)),
        });
    });
    app.use((req, res) => {
        res.status(404).json({ error: 'Route tidak ditemukan.' });
    });
    app.listen(PORT, () => {
        console.log(`BE berjalan di http://localhost:${PORT}`);
    });
}
main().catch((error) => {
    console.error('Gagal menjalankan backend:', error);
    process.exit(1);
});
