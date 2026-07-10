import { DataTypes, InferAttributes, InferCreationAttributes, Model, Sequelize } from 'sequelize';

const MYSQL_DATABASE = process.env.MYSQL_DATABASE;
const MYSQL_USERNAME = process.env.MYSQL_USERNAME;
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD;
const MYSQL_HOST = process.env.MYSQL_HOST;
const MYSQL_PORT = process.env.MYSQL_PORT;

if (!MYSQL_DATABASE || !MYSQL_USERNAME || !MYSQL_HOST || !MYSQL_PORT) {
  throw new Error('MYSQL_DATABASE, MYSQL_USERNAME, MYSQL_HOST, dan MYSQL_PORT wajib diisi di .env');
}

export const sequelize = new Sequelize(
  MYSQL_DATABASE,
  MYSQL_USERNAME,
  MYSQL_PASSWORD || '',
  {
    host: MYSQL_HOST,
    port: Number(MYSQL_PORT),
    dialect: 'mysql',
    logging: false,
  }
);

export class SchoolModel extends Model<InferAttributes<SchoolModel>, InferCreationAttributes<SchoolModel>> {
  declare id: string;
  declare name: string;
  declare address: string;
  declare subscriptionPlan: 'bulanan' | 'tahunan' | 'selamanya';
  declare subscriptionStatus: 'aktif' | 'nonaktif';
  declare createdAt: Date;
}

export class UserModel extends Model<InferAttributes<UserModel>, InferCreationAttributes<UserModel>> {
  declare id: string;
  declare schoolId: string | null;
  declare username: string;
  declare name: string;
  declare role: 'super_admin' | 'admin' | 'teacher';
  declare initialPassword: string | null;
  declare passwordHash: string;
  declare createdAt: Date;
}

export class ClassModel extends Model<InferAttributes<ClassModel>, InferCreationAttributes<ClassModel>> {
  declare id: string;
  declare schoolId: string;
  declare name: string;
  declare createdAt: Date;
}

export class StudentModel extends Model<InferAttributes<StudentModel>, InferCreationAttributes<StudentModel>> {
  declare id: string;
  declare schoolId: string;
  declare classId: string;
  declare name: string;
  declare nisn: string;
  declare username: string;
  declare initialPassword: string | null;
  declare qrCode: string;
  declare createdAt: Date;
}

export class AttendanceModel extends Model<InferAttributes<AttendanceModel>, InferCreationAttributes<AttendanceModel>> {
  declare id: string;
  declare schoolId: string;
  declare studentId: string;
  declare classId: string;
  declare date: string;
  declare time: string;
  declare status: 'hadir' | 'sakit' | 'izin' | 'alfa';
  declare method: 'qr' | 'manual';
  declare scannedByUserId: string;
  declare createdAt: Date;
}

export class SubjectModel extends Model<InferAttributes<SubjectModel>, InferCreationAttributes<SubjectModel>> {
  declare id: string;
  declare schoolId: string;
  declare code: string;
  declare name: string;
  declare teacherName: string;
  declare classId: string;
  declare isActive: boolean;
  declare createdAt: Date;
}

export class AcademicYearModel extends Model<InferAttributes<AcademicYearModel>, InferCreationAttributes<AcademicYearModel>> {
  declare id: string;
  declare schoolId: string;
  declare name: string;
  declare isActive: boolean;
  declare createdAt: Date;
}

export class AssessmentWeightModel extends Model<InferAttributes<AssessmentWeightModel>, InferCreationAttributes<AssessmentWeightModel>> {
  declare id: string;
  declare schoolId: string;
  declare subjectId: string | null;
  declare name: string;
  declare code: 'nh' | 'pas';
  declare weight: number;
}

export class AssessmentModel extends Model<InferAttributes<AssessmentModel>, InferCreationAttributes<AssessmentModel>> {
  declare id: string;
  declare schoolId: string;
  declare academicYearId: string;
  declare semester: 'ganjil' | 'genap';
  declare classId: string;
  declare subjectId: string;
  declare categoryCode: 'nh' | 'pas';
  declare name: string;
  declare date: string;
  declare createdAt: Date;
}

export class StudentGradeModel extends Model<InferAttributes<StudentGradeModel>, InferCreationAttributes<StudentGradeModel>> {
  declare id: string;
  declare schoolId: string;
  declare studentId: string;
  declare assessmentId: string;
  declare value: number;
  declare createdAt: Date;
}

export class PricingPlanModel extends Model<InferAttributes<PricingPlanModel>, InferCreationAttributes<PricingPlanModel>> {
  declare id: string;
  declare name: string;
  declare price: string;
  declare period: string;
  declare description: string;
  declare features: string;
  declare isHighlighted: boolean;
  declare isActive: boolean;
  declare sortOrder: number;
  declare createdAt: Date;
}

export class SiteSettingModel extends Model<InferAttributes<SiteSettingModel>, InferCreationAttributes<SiteSettingModel>> {
  declare id: string;
  declare whatsappNumber: string;
  declare whatsappMessageTemplate: string;
}

export function initModels() {
  SchoolModel.init(
    {
      id: { type: DataTypes.STRING, primaryKey: true },
      name: { type: DataTypes.STRING, allowNull: false },
      address: { type: DataTypes.STRING, allowNull: false },
      subscriptionPlan: { type: DataTypes.ENUM('bulanan', 'tahunan', 'selamanya'), allowNull: false },
      subscriptionStatus: { type: DataTypes.ENUM('aktif', 'nonaktif'), allowNull: false, defaultValue: 'aktif' },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { sequelize, tableName: 'schools', timestamps: false }
  );

  UserModel.init(
    {
      id: { type: DataTypes.STRING, primaryKey: true },
      schoolId: { type: DataTypes.STRING, allowNull: true },
      username: { type: DataTypes.STRING, allowNull: true, unique: true },
      name: { type: DataTypes.STRING, allowNull: false },
      role: { type: DataTypes.ENUM('super_admin', 'admin', 'teacher'), allowNull: false },
      initialPassword: { type: DataTypes.STRING, allowNull: true },
      passwordHash: { type: DataTypes.STRING, allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { sequelize, tableName: 'users', timestamps: false }
  );

  ClassModel.init(
    {
      id: { type: DataTypes.STRING, primaryKey: true },
      schoolId: { type: DataTypes.STRING, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { sequelize, tableName: 'classes', timestamps: false }
  );

  StudentModel.init(
    {
      id: { type: DataTypes.STRING, primaryKey: true },
      schoolId: { type: DataTypes.STRING, allowNull: false },
      classId: { type: DataTypes.STRING, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: false },
      nisn: { type: DataTypes.STRING, allowNull: false },
      username: { type: DataTypes.STRING, allowNull: true },
      initialPassword: { type: DataTypes.STRING, allowNull: true },
      qrCode: { type: DataTypes.STRING, allowNull: false, unique: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { sequelize, tableName: 'students', timestamps: false }
  );

  AttendanceModel.init(
    {
      id: { type: DataTypes.STRING, primaryKey: true },
      schoolId: { type: DataTypes.STRING, allowNull: false },
      studentId: { type: DataTypes.STRING, allowNull: false },
      classId: { type: DataTypes.STRING, allowNull: false },
      date: { type: DataTypes.STRING, allowNull: false },
      time: { type: DataTypes.STRING, allowNull: false },
      status: { type: DataTypes.ENUM('hadir', 'sakit', 'izin', 'alfa'), allowNull: false },
      method: { type: DataTypes.ENUM('qr', 'manual'), allowNull: false },
      scannedByUserId: { type: DataTypes.STRING, allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { sequelize, tableName: 'attendances', timestamps: false }
  );

  SubjectModel.init(
    {
      id: { type: DataTypes.STRING, primaryKey: true },
      schoolId: { type: DataTypes.STRING, allowNull: false },
      code: { type: DataTypes.STRING, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: false },
      teacherName: { type: DataTypes.STRING, allowNull: false },
      classId: { type: DataTypes.STRING, allowNull: false },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { sequelize, tableName: 'subjects', timestamps: false }
  );

  AcademicYearModel.init(
    {
      id: { type: DataTypes.STRING, primaryKey: true },
      schoolId: { type: DataTypes.STRING, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: false },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { sequelize, tableName: 'academic_years', timestamps: false }
  );

  AssessmentWeightModel.init(
    {
      id: { type: DataTypes.STRING, primaryKey: true },
      schoolId: { type: DataTypes.STRING, allowNull: false },
      subjectId: { type: DataTypes.STRING, allowNull: true },
      name: { type: DataTypes.STRING, allowNull: false },
      code: { type: DataTypes.ENUM('nh', 'pas'), allowNull: false },
      weight: { type: DataTypes.INTEGER, allowNull: false },
    },
    { sequelize, tableName: 'assessment_weights', timestamps: false }
  );

  AssessmentModel.init(
    {
      id: { type: DataTypes.STRING, primaryKey: true },
      schoolId: { type: DataTypes.STRING, allowNull: false },
      academicYearId: { type: DataTypes.STRING, allowNull: false },
      semester: { type: DataTypes.ENUM('ganjil', 'genap'), allowNull: false },
      classId: { type: DataTypes.STRING, allowNull: false },
      subjectId: { type: DataTypes.STRING, allowNull: false },
      categoryCode: { type: DataTypes.ENUM('nh', 'pas'), allowNull: false },
      name: { type: DataTypes.STRING, allowNull: false },
      date: { type: DataTypes.STRING, allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { sequelize, tableName: 'assessments', timestamps: false }
  );

  StudentGradeModel.init(
    {
      id: { type: DataTypes.STRING, primaryKey: true },
      schoolId: { type: DataTypes.STRING, allowNull: false },
      studentId: { type: DataTypes.STRING, allowNull: false },
      assessmentId: { type: DataTypes.STRING, allowNull: false },
      value: { type: DataTypes.FLOAT, allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { sequelize, tableName: 'student_grades', timestamps: false }
  );

  PricingPlanModel.init(
    {
      id: { type: DataTypes.STRING, primaryKey: true },
      name: { type: DataTypes.STRING, allowNull: false },
      price: { type: DataTypes.STRING, allowNull: false },
      period: { type: DataTypes.STRING, allowNull: false },
      description: { type: DataTypes.STRING, allowNull: false, defaultValue: '' },
      features: { type: DataTypes.TEXT, allowNull: false, defaultValue: '[]' },
      isHighlighted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { sequelize, tableName: 'pricing_plans', timestamps: false }
  );

  SiteSettingModel.init(
    {
      id: { type: DataTypes.STRING, primaryKey: true },
      whatsappNumber: { type: DataTypes.STRING, allowNull: false, defaultValue: '' },
      whatsappMessageTemplate: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    },
    { sequelize, tableName: 'site_settings', timestamps: false }
  );

  SchoolModel.hasMany(UserModel, { foreignKey: 'schoolId', onDelete: 'CASCADE' });
  SchoolModel.hasMany(ClassModel, { foreignKey: 'schoolId', onDelete: 'CASCADE' });
  SchoolModel.hasMany(StudentModel, { foreignKey: 'schoolId', onDelete: 'CASCADE' });
  SchoolModel.hasMany(AttendanceModel, { foreignKey: 'schoolId', onDelete: 'CASCADE' });
  SchoolModel.hasMany(SubjectModel, { foreignKey: 'schoolId', onDelete: 'CASCADE' });
  SchoolModel.hasMany(AcademicYearModel, { foreignKey: 'schoolId', onDelete: 'CASCADE' });
  SchoolModel.hasMany(AssessmentWeightModel, { foreignKey: 'schoolId', onDelete: 'CASCADE' });
  SchoolModel.hasMany(AssessmentModel, { foreignKey: 'schoolId', onDelete: 'CASCADE' });
  SchoolModel.hasMany(StudentGradeModel, { foreignKey: 'schoolId', onDelete: 'CASCADE' });

  ClassModel.belongsTo(SchoolModel, { foreignKey: 'schoolId', onDelete: 'CASCADE' });
  StudentModel.belongsTo(SchoolModel, { foreignKey: 'schoolId', onDelete: 'CASCADE' });
  StudentModel.belongsTo(ClassModel, { foreignKey: 'classId', onDelete: 'CASCADE' });
  AttendanceModel.belongsTo(SchoolModel, { foreignKey: 'schoolId', onDelete: 'CASCADE' });
  AttendanceModel.belongsTo(StudentModel, { foreignKey: 'studentId', onDelete: 'CASCADE' });
  AttendanceModel.belongsTo(ClassModel, { foreignKey: 'classId', onDelete: 'CASCADE' });
  AttendanceModel.belongsTo(UserModel, { foreignKey: 'scannedByUserId' });
  SubjectModel.belongsTo(ClassModel, { foreignKey: 'classId', onDelete: 'CASCADE' });
  AcademicYearModel.belongsTo(SchoolModel, { foreignKey: 'schoolId', onDelete: 'CASCADE' });
  AssessmentWeightModel.belongsTo(SchoolModel, { foreignKey: 'schoolId', onDelete: 'CASCADE' });
  AssessmentWeightModel.belongsTo(SubjectModel, { foreignKey: 'subjectId', onDelete: 'CASCADE' });
  AssessmentModel.belongsTo(SchoolModel, { foreignKey: 'schoolId', onDelete: 'CASCADE' });
  AssessmentModel.belongsTo(AcademicYearModel, { foreignKey: 'academicYearId', onDelete: 'CASCADE' });
  AssessmentModel.belongsTo(ClassModel, { foreignKey: 'classId', onDelete: 'CASCADE' });
  AssessmentModel.belongsTo(SubjectModel, { foreignKey: 'subjectId', onDelete: 'CASCADE' });
  StudentGradeModel.belongsTo(SchoolModel, { foreignKey: 'schoolId', onDelete: 'CASCADE' });
  StudentGradeModel.belongsTo(StudentModel, { foreignKey: 'studentId', onDelete: 'CASCADE' });
  StudentGradeModel.belongsTo(AssessmentModel, { foreignKey: 'assessmentId', onDelete: 'CASCADE' });
}
