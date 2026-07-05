// @ts-nocheck
import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { AcademicYearModel, AssessmentModel, AssessmentWeightModel, AttendanceModel, ClassModel, SchoolModel, StudentGradeModel, StudentModel, SubjectModel, UserModel, initModels, } from '../models.js';
import { randomId } from '../utils/id.js';
const slugify = (value) => value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .replace(/^_+|_+$/g, '') || 'guru';
const studentSlugify = (value) => slugify(value).replace(/^guru-/, '') || 'siswa';
const defaultWeights = (schoolId, subjectId) => ([
    { id: `wt-nh-${schoolId}-${subjectId || 'global'}`, schoolId, subjectId, name: 'NH (Nilai Harian)', code: 'nh', weight: 70 },
    { id: `wt-pas-${schoolId}-${subjectId || 'global'}`, schoolId, subjectId, name: 'PAS', code: 'pas', weight: 30 },
]);
const toISO = (value) => {
    if (!value)
        return new Date().toISOString();
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};
export class DatabaseService {
    async init() {
        initModels();
        await SchoolModel.sequelize.authenticate();
        await SchoolModel.sequelize.sync({ alter: true });
        await this.backfillStudentCredentials();
        await this.backfillSubjectWeights();
        await this.ensureSuperAdminAccount();
        await this.seedIfEmpty();
    }
    async ensureSuperAdminAccount() {
        const salt = bcrypt.genSaltSync(10);
        const passwordHash = bcrypt.hashSync('admin123', salt);
        const existing = await UserModel.findOne({ where: { id: 'usr-super' } });
        if (existing) {
            await existing.update({
                schoolId: null,
                username: 'superadmin',
                name: 'Budi Santoso (Super Admin)',
                role: 'super_admin',
                initialPassword: 'admin123',
                passwordHash,
            });
            return;
        }
        await UserModel.create({
            id: 'usr-super',
            schoolId: null,
            username: 'superadmin',
            name: 'Budi Santoso (Super Admin)',
            role: 'super_admin',
            initialPassword: 'admin123',
            passwordHash,
            createdAt: new Date(),
        });
    }
    async backfillSubjectWeights() {
        const subjects = await SubjectModel.findAll();
        for (const subject of subjects) {
            const existing = await AssessmentWeightModel.findAll({
                where: { schoolId: subject.schoolId, subjectId: subject.id },
            });
            if (existing.length > 0)
                continue;
            const legacy = await AssessmentWeightModel.findAll({
                where: { schoolId: subject.schoolId, subjectId: null },
                order: [['code', 'ASC']],
            });
            if (legacy.length > 0) {
                await AssessmentWeightModel.bulkCreate(legacy.map((item) => ({
                    id: this.genId('wt'),
                    schoolId: subject.schoolId,
                    subjectId: subject.id,
                    name: item.name,
                    code: item.code,
                    weight: item.weight,
                })));
            }
            else {
                await AssessmentWeightModel.bulkCreate(defaultWeights(subject.schoolId, subject.id));
            }
        }
    }
    async backfillStudentCredentials() {
        const students = await StudentModel.findAll();
        for (const student of students) {
            if (student.username && student.initialPassword) {
                continue;
            }
            const cleanNisn = String(student.nisn || '').trim();
            const baseUsername = `siswa-${studentSlugify(student.name)}-${cleanNisn.slice(-4) || randomId(4)}`;
            let username = student.username || baseUsername;
            let attempt = 0;
            while (true) {
                const existing = await UserModel.findOne({ where: { username } });
                const conflict = existing && existing.id !== student.id;
                if (!conflict)
                    break;
                attempt += 1;
                username = `${baseUsername}${attempt + 1}`;
            }
            const initialPassword = student.initialPassword || `Siswa-${randomId(8).toUpperCase()}`;
            await student.update({ username, initialPassword });
        }
    }
    async seedIfEmpty() {
        const schoolCount = await SchoolModel.count();
        if (schoolCount > 0)
            return;
        const salt = bcrypt.genSaltSync(10);
        const defaultPasswordHash = bcrypt.hashSync('admin123', salt);
        const sampleSchool = await SchoolModel.create({
            id: 'sch-sma1',
            name: 'SMA Negeri 1 Jakarta',
            address: 'Jl. Budi Utomo No.7, Jakarta Pusat',
            subscriptionPlan: 'tahunan',
            subscriptionStatus: 'aktif',
            createdAt: new Date(),
        });
        await UserModel.bulkCreate([
            {
                id: 'usr-super',
                schoolId: null,
                username: 'superadmin',
                name: 'Budi Santoso (Super Admin)',
                role: 'super_admin',
                initialPassword: 'admin123',
                passwordHash: defaultPasswordHash,
                createdAt: new Date(),
            },
            {
                id: 'usr-admin1',
                schoolId: sampleSchool.id,
                username: 'adminsma1',
                name: 'Siti Rahma (Admin Sekolah)',
                role: 'admin',
                initialPassword: 'admin123',
                passwordHash: defaultPasswordHash,
                createdAt: new Date(),
            },
            {
                id: 'usr-teacher1',
                schoolId: sampleSchool.id,
                username: 'gurusma1',
                name: 'Eko Prasetyo, S.Pd. (Guru Kelas)',
                role: 'teacher',
                initialPassword: 'admin123',
                passwordHash: defaultPasswordHash,
                createdAt: new Date(),
            },
        ]);
        const classes = await ClassModel.bulkCreate([
            { id: 'cls-10a', schoolId: sampleSchool.id, name: 'Kelas X-A', createdAt: new Date() },
            { id: 'cls-11a', schoolId: sampleSchool.id, name: 'Kelas XI-A', createdAt: new Date() },
            { id: 'cls-12a', schoolId: sampleSchool.id, name: 'Kelas XII-A', createdAt: new Date() },
        ]);
        const students = await StudentModel.bulkCreate([
            { id: 'std-1', schoolId: sampleSchool.id, classId: classes[0].id, name: 'Aditya Pratama', nisn: '0012345678', username: 'siswa-aditya-5678', initialPassword: 'Siswa-ADITYA1', qrCode: 'QR-0012345678-ADITYA', createdAt: new Date() },
            { id: 'std-2', schoolId: sampleSchool.id, classId: classes[0].id, name: 'Anisa Lestari', nisn: '0012345679', username: 'siswa-anisa-5679', initialPassword: 'Siswa-ANISA22', qrCode: 'QR-0012345679-ANISA', createdAt: new Date() },
            { id: 'std-3', schoolId: sampleSchool.id, classId: classes[1].id, name: 'Bagas Wibowo', nisn: '0012345680', username: 'siswa-bagas-5680', initialPassword: 'Siswa-BAGAS33', qrCode: 'QR-0012345680-BAGAS', createdAt: new Date() },
            { id: 'std-4', schoolId: sampleSchool.id, classId: classes[1].id, name: 'Citra Kirana', nisn: '0012345681', username: 'siswa-citra-5681', initialPassword: 'Siswa-CITRA44', qrCode: 'QR-0012345681-CITRA', createdAt: new Date() },
            { id: 'std-5', schoolId: sampleSchool.id, classId: classes[2].id, name: 'Dimas Saputra', nisn: '0012345682', username: 'siswa-dimas-5682', initialPassword: 'Siswa-DIMAS55', qrCode: 'QR-0012345682-DIMAS', createdAt: new Date() },
        ]);
        const today = new Date().toISOString().split('T')[0];
        const yesterdayDate = new Date();
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterday = yesterdayDate.toISOString().split('T')[0];
        await AttendanceModel.bulkCreate([
            { id: 'att-1', schoolId: sampleSchool.id, studentId: students[0].id, classId: classes[0].id, date: yesterday, time: '07:15:30', status: 'hadir', method: 'qr', scannedByUserId: 'usr-teacher1', createdAt: new Date(`${yesterday}T07:15:30Z`) },
            { id: 'att-2', schoolId: sampleSchool.id, studentId: students[1].id, classId: classes[0].id, date: yesterday, time: '07:22:15', status: 'hadir', method: 'qr', scannedByUserId: 'usr-teacher1', createdAt: new Date(`${yesterday}T07:22:15Z`) },
            { id: 'att-3', schoolId: sampleSchool.id, studentId: students[2].id, classId: classes[1].id, date: yesterday, time: '07:10:00', status: 'hadir', method: 'qr', scannedByUserId: 'usr-teacher1', createdAt: new Date(`${yesterday}T07:10:00Z`) },
            { id: 'att-4', schoolId: sampleSchool.id, studentId: students[3].id, classId: classes[1].id, date: yesterday, time: '08:00:00', status: 'izin', method: 'manual', scannedByUserId: 'usr-teacher1', createdAt: new Date(`${yesterday}T08:00:00Z`) },
            { id: 'att-5', schoolId: sampleSchool.id, studentId: students[0].id, classId: classes[0].id, date: today, time: '07:12:44', status: 'hadir', method: 'qr', scannedByUserId: 'usr-teacher1', createdAt: new Date() },
        ]);
        await SubjectModel.bulkCreate([
            { id: 'sub-mat-10a', schoolId: sampleSchool.id, code: 'MAT-10A', name: 'Matematika', teacherName: 'Eko Prasetyo, S.Pd.', classId: classes[0].id, isActive: true, createdAt: new Date() },
            { id: 'sub-ipa-10a', schoolId: sampleSchool.id, code: 'IPA-10A', name: 'Fisika', teacherName: 'Eko Prasetyo, S.Pd.', classId: classes[0].id, isActive: true, createdAt: new Date() },
        ]);
        await AcademicYearModel.create({
            id: 'ay-2026-2027',
            schoolId: sampleSchool.id,
            name: '2026/2027',
            isActive: true,
            createdAt: new Date(),
        });
        await AssessmentWeightModel.bulkCreate([
            ...defaultWeights(sampleSchool.id, 'sub-mat-10a'),
            ...defaultWeights(sampleSchool.id, 'sub-ipa-10a'),
        ]);
    }
    genId(prefix) {
        return `${prefix}-${randomId(10)}`;
    }
    async safeFindSchoolIds(schoolId) {
        if (schoolId === null)
            return { schoolId: null };
        return { schoolId };
    }
    async getSchools() {
        return (await SchoolModel.findAll({ order: [['createdAt', 'ASC']] })).map((item) => item.get({ plain: true }));
    }
    async getSchool(id) {
        const school = await SchoolModel.findByPk(id);
        return school ? school.get({ plain: true }) : null;
    }
    async createSchool(name, address, plan) {
        const school = await SchoolModel.create({
            id: this.genId('sch'),
            name,
            address,
            subscriptionPlan: plan,
            subscriptionStatus: 'aktif',
            createdAt: new Date(),
        });
        return school.get({ plain: true });
    }
    async updateSchool(id, updates) {
        const school = await SchoolModel.findByPk(id);
        if (!school)
            return null;
        await school.update({
            name: updates.name ?? school.name,
            address: updates.address ?? school.address,
            subscriptionPlan: updates.subscriptionPlan ?? school.subscriptionPlan,
            subscriptionStatus: updates.subscriptionStatus ?? school.subscriptionStatus,
        });
        return school.get({ plain: true });
    }
    async deleteSchool(id) {
        await SchoolModel.destroy({ where: { id } });
    }
    async getUsers(schoolId) {
        const users = await UserModel.findAll({ where: { schoolId }, order: [['createdAt', 'ASC']] });
        return users.map((item) => item.get({ plain: true }));
    }
    async getUser(id) {
        const user = await UserModel.findByPk(id);
        return user ? user.get({ plain: true }) : null;
    }
    async getUserByUsername(username) {
        const user = await UserModel.findOne({ where: { username: username.trim() } });
        return user ? user.get({ plain: true }) : null;
    }
    async createUser(schoolId, username, passwordPlain, role, name, initialPassword) {
        if (await this.getUserByUsername(username)) {
            return null;
        }
        const salt = bcrypt.genSaltSync(10);
        const passwordHash = bcrypt.hashSync(passwordPlain, salt);
        const user = await UserModel.create({
            id: this.genId('usr'),
            schoolId,
            username: username.trim(),
            name: name.trim(),
            role,
            initialPassword: initialPassword ?? passwordPlain,
            passwordHash,
            createdAt: new Date(),
        });
        return user.get({ plain: true });
    }
    async generateTeacherCredentials(name) {
        const baseUsername = `guru-${slugify(name)}`;
        let username = baseUsername;
        let attempt = 0;
        while (await this.getUserByUsername(username)) {
            attempt += 1;
            username = `${baseUsername}${attempt + 1}`;
        }
        const password = `Gr-${randomId(8).toUpperCase()}`;
        return { username, password };
    }
    async createTeacherFromName(schoolId, name) {
        const { username, password } = await this.generateTeacherCredentials(name);
        return this.createUser(schoolId, username, password, 'teacher', name, password);
    }
    async updateUser(id, schoolId, updates) {
        const user = await UserModel.findOne({ where: { id, ...(schoolId === null ? {} : { schoolId }) } });
        if (!user)
            return null;
        if (updates.name) {
            user.name = updates.name;
        }
        if (updates.passwordPlain) {
            const salt = bcrypt.genSaltSync(10);
            user.passwordHash = bcrypt.hashSync(updates.passwordPlain, salt);
        }
        await user.save();
        return user.get({ plain: true });
    }
    async deleteUser(id, schoolId) {
        await UserModel.destroy({ where: { id, ...(schoolId === null ? {} : { schoolId }) } });
    }
    async getClasses(schoolId) {
        return (await ClassModel.findAll({ where: { schoolId }, order: [['createdAt', 'ASC']] })).map((item) => item.get({ plain: true }));
    }
    async getClass(id, schoolId) {
        const cls = await ClassModel.findOne({ where: { id, schoolId } });
        return cls ? cls.get({ plain: true }) : null;
    }
    async createClass(schoolId, name) {
        const cls = await ClassModel.create({
            id: this.genId('cls'),
            schoolId,
            name: name.trim(),
            createdAt: new Date(),
        });
        return cls.get({ plain: true });
    }
    async updateClass(id, schoolId, name) {
        const cls = await ClassModel.findOne({ where: { id, schoolId } });
        if (!cls)
            return null;
        await cls.update({ name: name.trim() });
        return cls.get({ plain: true });
    }
    async deleteClass(id, schoolId) {
        await ClassModel.destroy({ where: { id, schoolId } });
    }
    async getStudents(schoolId) {
        return (await StudentModel.findAll({ where: { schoolId }, order: [['createdAt', 'ASC']] })).map((item) => item.get({ plain: true }));
    }
    async getStudent(id, schoolId) {
        const student = await StudentModel.findOne({ where: { id, schoolId } });
        return student ? student.get({ plain: true }) : null;
    }
    async getStudentByQrCode(qrCode) {
        const student = await StudentModel.findOne({ where: { qrCode } });
        return student ? student.get({ plain: true }) : null;
    }
    async generateStudentCredentials(name, nisn) {
        const cleanNisn = nisn.trim();
        const baseUsername = `siswa-${studentSlugify(name)}-${cleanNisn.slice(-4) || randomId(4)}`;
        let username = baseUsername;
        let attempt = 0;
        while (await this.getUserByUsername(username)) {
            attempt += 1;
            username = `${baseUsername}${attempt + 1}`;
        }
        const password = `Siswa-${randomId(8).toUpperCase()}`;
        return { username, password };
    }
    async createStudent(schoolId, classId, name, nisn) {
        const cls = await this.getClass(classId, schoolId);
        if (!cls)
            return null;
        const cleanNisn = nisn.trim();
        const qrCode = `QR-${cleanNisn}-${name.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 10)}`;
        const { username, password } = await this.generateStudentCredentials(name, cleanNisn);
        const student = await StudentModel.create({
            id: this.genId('std'),
            schoolId,
            classId,
            name: name.trim(),
            nisn: cleanNisn,
            username,
            initialPassword: password,
            qrCode,
            createdAt: new Date(),
        });
        return student.get({ plain: true });
    }
    async updateStudent(id, schoolId, classId, name, nisn) {
        const student = await StudentModel.findOne({ where: { id, schoolId } });
        if (!student)
            return null;
        const cls = await this.getClass(classId, schoolId);
        if (!cls)
            return null;
        const cleanNisn = nisn.trim();
        if (student.name !== name || student.nisn !== cleanNisn) {
            student.qrCode = `QR-${cleanNisn}-${name.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 10)}`;
        }
        await student.update({
            name: name.trim(),
            nisn: cleanNisn,
            classId,
        });
        return student.get({ plain: true });
    }
    async createStudentFromImport(schoolId, classId, name, nisn) {
        return this.createStudent(schoolId, classId, name, nisn);
    }
    async deleteStudent(id, schoolId) {
        await StudentModel.destroy({ where: { id, schoolId } });
    }
    async getAttendances(schoolId) {
        return (await AttendanceModel.findAll({ where: { schoolId }, order: [['date', 'DESC'], ['time', 'DESC']] })).map((item) => item.get({ plain: true }));
    }
    async recordAttendance(schoolId, studentId, classId, status, method, scannedByUserId, customDate) {
        const student = await this.getStudent(studentId, schoolId);
        if (!student)
            return null;
        const todayDate = customDate || new Date().toISOString().split('T')[0];
        const todayTime = new Date().toTimeString().split(' ')[0];
        const existing = await AttendanceModel.findOne({
            where: { studentId, date: todayDate, schoolId },
        });
        if (existing) {
            return {
                ...existing.get({ plain: true }),
                duplicate: true,
            };
        }
        const attendance = await AttendanceModel.create({
            id: this.genId('att'),
            schoolId,
            studentId,
            classId,
            date: todayDate,
            time: todayTime,
            status,
            method,
            scannedByUserId,
            createdAt: new Date(),
        });
        return {
            ...attendance.get({ plain: true }),
            duplicate: false,
        };
    }
    async deleteAttendance(id, schoolId) {
        await AttendanceModel.destroy({ where: { id, schoolId } });
    }
    async getSubjects(schoolId) {
        return (await SubjectModel.findAll({ where: { schoolId }, order: [['createdAt', 'ASC']] })).map((item) => item.get({ plain: true }));
    }
    async getSubject(id, schoolId) {
        const subject = await SubjectModel.findOne({ where: { id, schoolId } });
        return subject ? subject.get({ plain: true }) : null;
    }
    async getSubjectByCode(code, schoolId) {
        const subject = await SubjectModel.findOne({ where: { schoolId, code: code.trim() } });
        return subject ? subject.get({ plain: true }) : null;
    }
    async createSubject(schoolId, code, name, teacherName, classId, isActive) {
        if (await this.getSubjectByCode(code, schoolId))
            return null;
        const subject = await SubjectModel.create({
            id: this.genId('sub'),
            schoolId,
            code: code.trim(),
            name: name.trim(),
            teacherName: teacherName.trim(),
            classId,
            isActive,
            createdAt: new Date(),
        });
        return subject.get({ plain: true });
    }
    async updateSubject(id, schoolId, code, name, teacherName, classId, isActive) {
        const subject = await SubjectModel.findOne({ where: { id, schoolId } });
        if (!subject)
            return null;
        const existing = await this.getSubjectByCode(code, schoolId);
        if (existing && existing.id !== id)
            return null;
        await subject.update({
            code: code.trim(),
            name: name.trim(),
            teacherName: teacherName.trim(),
            classId,
            isActive,
        });
        return subject.get({ plain: true });
    }
    async deleteSubject(id, schoolId) {
        const deleted = await SubjectModel.destroy({ where: { id, schoolId } });
        if (deleted) {
            const assessments = await AssessmentModel.findAll({ where: { subjectId: id, schoolId } });
            const assessmentIds = assessments.map((a) => a.id);
            await AssessmentModel.destroy({ where: { subjectId: id, schoolId } });
            if (assessmentIds.length > 0) {
                await StudentGradeModel.destroy({ where: { schoolId, assessmentId: { [Op.in]: assessmentIds } } });
            }
        }
        return deleted > 0;
    }
    async getAcademicYears(schoolId) {
        return (await AcademicYearModel.findAll({ where: { schoolId }, order: [['createdAt', 'ASC']] })).map((item) => item.get({ plain: true }));
    }
    async getAcademicYear(id, schoolId) {
        const year = await AcademicYearModel.findOne({ where: { id, schoolId } });
        return year ? year.get({ plain: true }) : null;
    }
    async handleAcademicYearActiveStatus(schoolId, activeId) {
        await AcademicYearModel.update({ isActive: false }, { where: { schoolId } });
        await AcademicYearModel.update({ isActive: true }, { where: { id: activeId, schoolId } });
    }
    async createAcademicYear(schoolId, name, isActive) {
        const academicYear = await AcademicYearModel.create({
            id: this.genId('ay'),
            schoolId,
            name: name.trim(),
            isActive,
            createdAt: new Date(),
        });
        if (isActive) {
            await this.handleAcademicYearActiveStatus(schoolId, academicYear.id);
        }
        else {
            const count = await AcademicYearModel.count({ where: { schoolId } });
            if (count === 1) {
                await academicYear.update({ isActive: true });
            }
        }
        return academicYear.get({ plain: true });
    }
    async updateAcademicYear(id, schoolId, name, isActive) {
        const academicYear = await AcademicYearModel.findOne({ where: { id, schoolId } });
        if (!academicYear)
            return null;
        await academicYear.update({ name: name.trim(), isActive });
        if (isActive) {
            await this.handleAcademicYearActiveStatus(schoolId, id);
        }
        else {
            const activeCount = await AcademicYearModel.count({ where: { schoolId, isActive: true } });
            if (activeCount === 0) {
                await academicYear.update({ isActive: true });
            }
        }
        return academicYear.get({ plain: true });
    }
    async deleteAcademicYear(id, schoolId) {
        const deletedYear = await this.getAcademicYear(id, schoolId);
        if (!deletedYear)
            return false;
        await AcademicYearModel.destroy({ where: { id, schoolId } });
        const assessments = await AssessmentModel.findAll({ where: { academicYearId: id, schoolId } });
        const assessmentIds = assessments.map((a) => a.id);
        await AssessmentModel.destroy({ where: { academicYearId: id, schoolId } });
        if (assessmentIds.length) {
            await StudentGradeModel.destroy({ where: { schoolId, assessmentId: { [Op.in]: assessmentIds } } });
        }
        if (deletedYear.isActive) {
            const nextYear = await AcademicYearModel.findOne({ where: { schoolId } });
            if (nextYear) {
                await nextYear.update({ isActive: true });
            }
        }
        return true;
    }
    async getAssessmentWeights(schoolId, subjectId) {
        const where = subjectId ? { schoolId, subjectId } : { schoolId, subjectId: null };
        let weights = await AssessmentWeightModel.findAll({ where, order: [['code', 'ASC']] });
        if (weights.length === 0 && subjectId) {
            const fallback = await AssessmentWeightModel.findAll({ where: { schoolId, subjectId: null }, order: [['code', 'ASC']] });
            if (fallback.length > 0) {
                await AssessmentWeightModel.bulkCreate(fallback.map((item) => ({
                    id: this.genId('wt'),
                    schoolId,
                    subjectId,
                    name: item.name,
                    code: item.code,
                    weight: item.weight,
                })));
            }
            else {
                await AssessmentWeightModel.bulkCreate(defaultWeights(schoolId, subjectId));
            }
            weights = await AssessmentWeightModel.findAll({ where, order: [['code', 'ASC']] });
        }
        if (weights.length === 0) {
            await AssessmentWeightModel.bulkCreate(defaultWeights(schoolId, null));
            weights = await AssessmentWeightModel.findAll({ where, order: [['code', 'ASC']] });
        }
        return weights.map((item) => item.get({ plain: true }));
    }
    async updateAssessmentWeights(schoolId, subjectId, weights) {
        const total = weights.reduce((sum, item) => sum + item.weight, 0);
        if (total !== 100)
            return false;
        const existing = await this.getAssessmentWeights(schoolId, subjectId);
        for (const item of weights) {
            const row = existing.find((w) => w.code === item.code);
            if (row) {
                await AssessmentWeightModel.update({ weight: item.weight, name: item.code === 'nh' ? 'NH (Nilai Harian)' : 'PAS' }, { where: { schoolId, code: item.code, subjectId } });
            }
            else {
                await AssessmentWeightModel.create({
                    id: this.genId('wt'),
                    schoolId,
                    subjectId,
                    name: item.code === 'nh' ? 'NH (Nilai Harian)' : 'PAS',
                    code: item.code,
                    weight: item.weight,
                });
            }
        }
        return true;
    }
    async getAssessments(schoolId) {
        return (await AssessmentModel.findAll({ where: { schoolId }, order: [['createdAt', 'ASC']] })).map((item) => item.get({ plain: true }));
    }
    async createAssessment(schoolId, academicYearId, semester, classId, subjectId, categoryCode, name, date) {
        const assessment = await AssessmentModel.create({
            id: this.genId('ass'),
            schoolId,
            academicYearId,
            semester,
            classId,
            subjectId,
            categoryCode,
            name: name.trim(),
            date,
            createdAt: new Date(),
        });
        return assessment.get({ plain: true });
    }
    async deleteAssessment(id, schoolId) {
        const deleted = await AssessmentModel.destroy({ where: { id, schoolId } });
        if (deleted) {
            await StudentGradeModel.destroy({ where: { schoolId, assessmentId: id } });
        }
        return deleted > 0;
    }
    async getStudentGrades(schoolId) {
        return (await StudentGradeModel.findAll({ where: { schoolId }, order: [['createdAt', 'ASC']] })).map((item) => item.get({ plain: true }));
    }
    async saveGrades(schoolId, assessmentId, grades) {
        for (const item of grades) {
            const val = Math.min(100, Math.max(0, item.value));
            const existing = await StudentGradeModel.findOne({ where: { schoolId, assessmentId, studentId: item.studentId } });
            if (existing) {
                await existing.update({ value: val });
            }
            else {
                await StudentGradeModel.create({
                    id: this.genId('grd'),
                    schoolId,
                    studentId: item.studentId,
                    assessmentId,
                    value: val,
                    createdAt: new Date(),
                });
            }
        }
        return true;
    }
}
export const db = new DatabaseService();
