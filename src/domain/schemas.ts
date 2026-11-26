import { z } from "zod";

const WEAK_PASSWORDS = new Set(["1234567890", "password123", "qwertyuiop", "adminadmin"]);

export const passwordSchema = z
  .string()
  .min(10, "Use pelo menos 10 caracteres.")
  .refine((value) => !WEAK_PASSWORDS.has(value.toLowerCase()), "Escolha uma senha menos óbvia.");

export const emailSchema = z.string().trim().email("Informe um e-mail válido.").max(200);

export const newPasswordSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, {
    message: "As senhas não conferem.",
    path: ["confirm"],
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe a senha."),
});

export const signupSchema = z.object({
  displayName: z.string().trim().min(2, "O nome precisa de pelo menos 2 caracteres.").max(80),
  teamName: z.string().trim().min(2, "O time precisa de pelo menos 2 caracteres.").max(80),
  email: emailSchema,
  password: passwordSchema,
});

export const projectSchema = z.object({
  title: z.string().trim().min(2, "O título precisa de pelo menos 2 caracteres.").max(120),
  brief: z.string().trim().max(2000, "A ideia passa de 2000 caracteres.").default(""),
  visibility: z.enum(["privado", "compartilhado"]),
  nextMilestone: z.string().trim().max(200, "O marco passa de 200 caracteres.").default(""),
  nextMilestoneOn: z
    .string()
    .trim()
    .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), "Data inválida.")
    .default(""),
  chargeOn: z
    .string()
    .trim()
    .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), "Data inválida.")
    .default(""),
});

export const manualStepSchema = z.object({
  title: z.string().trim().min(1, "Dê um nome ao passo.").max(160),
  doneWhen: z.string().trim().min(1, "Descreva quando está pronto.").max(400),
  minutes: z.coerce.number().int().min(5, "Entre 5 e 25 minutos.").max(25, "Entre 5 e 25 minutos."),
});

export const weeklyCheckinSchema = z.object({
  andou: z.string().trim().max(400, "Use até 400 caracteres."),
  travou: z.string().trim().max(400, "Use até 400 caracteres."),
});

export const channelSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  notifyWhatsapp: z.boolean(),
  notifyGoogleChat: z.boolean(),
  phone: z.string().trim().default(""),
  optIn: z.boolean(),
});

export const teamSettingsSchema = z.object({
  morningHour: z.string().regex(/^\d{2}:\d{2}$/, "Horário inválido."),
  eveningHour: z.string().regex(/^\d{2}:\d{2}$/, "Horário inválido."),
  stallDays: z.coerce.number().int().min(1).max(30),
  weeklyCheckinWeekday: z.coerce.number().int().min(0).max(6),
  weeklyCheckinHour: z.string().regex(/^\d{2}:\d{2}$/, "Horário inválido."),
});

export const inviteSchema = z.object({
  email: emailSchema,
});

export const acceptInviteSchema = z
  .object({
    token: z.string().min(20),
    displayName: z.string().trim().min(2).max(80),
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, {
    message: "As senhas não conferem.",
    path: ["confirm"],
  });

export const quickIdeaSchema = z.object({
  title: z.string().trim().min(2, "Dê um nome curto à ideia.").max(120),
});

export const noteSchema = z.object({
  body: z.string().trim().min(1, "Escreva a nota.").max(2000),
});
