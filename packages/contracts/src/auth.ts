import { z } from 'zod';

export const userRoleSchema = z.enum(['ADMIN', 'DOCTOR', 'PATIENT']);
export const accountStatusSchema = z.enum(['ACTIVE', 'PENDING', 'SUSPENDED']);
export const verificationStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED']);

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const emailSchema = z.string().trim().toLowerCase().max(255, 'Email must be at most 255 characters.').pipe(z.email('Enter a valid email address.'));

export const passwordSchema = z.string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`)
  .regex(/[a-z]/, 'Password must contain a lowercase letter.')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter.')
  .regex(/[0-9]/, 'Password must contain a digit.');

const personNameSchema = z.string().trim().min(2, 'Enter your full name.').max(150, 'Name must be at most 150 characters.');

export const registerPatientRequestSchema = z.object({
  fullName: personNameSchema,
  email: emailSchema,
  password: passwordSchema,
  birthDate: z.iso.date('Enter your date of birth.').refine(value => value >= '1900-01-01' && value <= new Date().toISOString().slice(0, 10), 'Birth date must be between 1900-01-01 and today.'),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,30}$/, 'Phone number format is invalid.').optional(),
}).strict();

export const registerDoctorRequestSchema = z.object({
  fullName: personNameSchema,
  email: emailSchema,
  password: passwordSchema,
  specialty: z.string().trim().min(2, 'Enter your specialty.').max(120, 'Specialty must be at most 120 characters.'),
  licenseNumber: z.string().trim().min(3, 'License number must be at least 3 characters.').max(60, 'License number must be at most 60 characters.').optional(),
}).strict();

export const loginRequestSchema = z.object({
  email: emailSchema,
  // Login only bounds the length; the strength policy applies when a password is set.
  password: z.string().min(1, 'Enter your password.').max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`),
}).strict();

export const otpCodeSchema = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from your email.');

export const verifyEmailRequestSchema = z.object({
  email: emailSchema,
  code: otpCodeSchema,
}).strict();

export const resendOtpRequestSchema = z.object({
  email: emailSchema,
}).strict();

export const forgotPasswordRequestSchema = resendOtpRequestSchema;
export const resetPasswordRequestSchema = verifyEmailRequestSchema.extend({
  password: passwordSchema,
});

/** Returned after patient registration until the email OTP is confirmed. No session is issued yet. */
export const registrationPendingSchema = z.object({
  status: z.literal('PENDING_EMAIL_VERIFICATION'),
  email: z.email(),
  expiresIn: z.number().int().positive(),
});

export const authUserSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  role: userRoleSchema,
  status: accountStatusSchema,
  emailVerified: z.boolean(),
  patientId: z.uuid().nullable(),
  doctorId: z.uuid().nullable(),
  doctorVerification: verificationStatusSchema.nullable(),
});

export const authSessionSchema = z.object({
  accessToken: z.string(),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int().positive(),
  user: authUserSchema,
});

export const errorResponseSchema = z.object({
  statusCode: z.number().int(),
  code: z.string(),
  message: z.string(),
  requestId: z.string(),
  timestamp: z.iso.datetime(),
  details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});

export type UserRole = z.infer<typeof userRoleSchema>;
export type AccountStatus = z.infer<typeof accountStatusSchema>;
export type RegisterPatientRequest = z.infer<typeof registerPatientRequestSchema>;
export type RegisterDoctorRequest = z.infer<typeof registerDoctorRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;
export type ResendOtpRequest = z.infer<typeof resendOtpRequestSchema>;
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
export type RegistrationPending = z.infer<typeof registrationPendingSchema>;
export type AuthUser = z.infer<typeof authUserSchema>;
export type AuthSession = z.infer<typeof authSessionSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
