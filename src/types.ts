export type SubscriptionPlan = 'bulanan' | 'tahunan' | 'selamanya';
export type SubscriptionStatus = 'aktif' | 'nonaktif';
export type UserRole = 'super_admin' | 'admin' | 'teacher';
export type AttendanceStatus = 'hadir' | 'sakit' | 'izin' | 'alfa';
export type AttendanceMethod = 'qr' | 'manual';

export interface School {
  id: string;
  name: string;
  address: string;
  subscriptionPlan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  createdAt: string;
}

export interface User {
  id: string;
  schoolId: string | null;
  username: string;
  role: UserRole;
  name: string;
  initialPassword?: string | null;
  createdAt: string;
}

export interface Class {
  id: string;
  schoolId: string;
  name: string;
  createdAt: string;
}

export interface Student {
  id: string;
  schoolId: string;
  classId: string;
  name: string;
  nisn: string;
  username?: string | null;
  initialPassword?: string | null;
  qrCode: string;
  createdAt: string;
}

export interface Attendance {
  id: string;
  schoolId: string;
  studentId: string;
  classId: string;
  date: string;
  time: string;
  status: AttendanceStatus;
  method: AttendanceMethod;
  scannedByUserId: string;
  createdAt: string;
}

export interface Subject {
  id: string;
  schoolId: string;
  code: string;
  name: string;
  teacherName: string;
  classId: string;
  isActive: boolean;
  createdAt: string;
}

export interface AcademicYear {
  id: string;
  schoolId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export interface AssessmentWeight {
  id: string;
  schoolId: string;
  subjectId: string | null;
  name: string;
  code: 'nh' | 'pas';
  weight: number;
}

export interface Assessment {
  id: string;
  schoolId: string;
  academicYearId: string;
  semester: 'ganjil' | 'genap';
  classId: string;
  subjectId: string;
  categoryCode: 'nh' | 'pas';
  name: string;
  date: string;
  createdAt: string;
}

export interface StudentGrade {
  id: string;
  schoolId: string;
  studentId: string;
  assessmentId: string;
  value: number;
  createdAt: string;
}

export interface StudentWithClass extends Student {
  className: string;
}

export interface AttendanceWithDetails extends Attendance {
  studentName: string;
  nisn: string;
  className: string;
  scannedByName: string;
}

export interface SchoolWithStats extends School {
  totalTeachers: number;
  totalStudents: number;
  totalClasses: number;
}

export interface AssessmentWithDetails extends Assessment {
  academicYearName: string;
  className: string;
  subjectName: string;
}
