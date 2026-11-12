import { z } from "zod";
import { createRouter, publicQuery, lotteryAuthedQuery, adminLotteryQuery, managerLotteryQuery, creditOpsLotteryQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { lotteryUsers, creditAdjustments, tickets, plays } from "@db/schema";
import { eq, like, or, desc, and, inArray } from "drizzle-orm";
import { hashPassword, verifyPassword, isHashedPassword } from "./lib/password";
import { signLotterySession, lotterySessionCookie, clearLotterySessionCookie } from "./kimi/lottery-session";
import { TRPCError } from "@trpc/server";

export const lotteryUserRouter = createRouter({
  me: lotteryAuthedQuery.query(({ ctx }) => {
    const { password: _password, ...user } = ctx.lotteryUser!;
    return user;
  }),
  setLanguage: lotteryAuthedQuery
    .input(z.object({ language: z.enum(["es", "fr", "en"]) }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await db.update(lotteryUsers).set({ language: input.language }).where(eq(lotteryUsers.id, ctx.lotteryUser!.id));
      return { ok: true };
    }),

  changePassword: lotteryAuthedQuery
    .input(z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(4),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const rows = await db.select().from(lotteryUsers).where(eq(lotteryUsers.id, ctx.lotteryUser!.id));
      const user = rows[0];
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Usuario no encontrado." });
      if (!(await verifyPassword(input.currentPassword, user.password))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Contrasena actual incorrecta." });
      }
      await db.update(lotteryUsers).set({ password: await hashPassword(input.newPassword) }).where(eq(lotteryUsers.id, user.id));
      return { ok: true };
    }),

  // List all lottery users with optional search
  list: managerLotteryQuery
    .input(
      z.object({
        search: z.string().optional(),
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const search = input?.search;
      const actor = ctx.lotteryUser!;
      const groupFilter = (actor.role === "supervisor" || actor.role === "collector") ? eq(lotteryUsers.groupId, actor.groupId ?? -1) : undefined;
      if (search) {
        const searchFilter = or(
          like(lotteryUsers.name, `%${search}%`),
          like(lotteryUsers.username, `%${search}%`)
        );
        const rows = await db.select().from(lotteryUsers)
          .where(groupFilter ? and(searchFilter, groupFilter) : searchFilter)
          .orderBy(desc(lotteryUsers.createdAt));
        return rows.map(({ password: _password, ...user }) => user);
      }
      const rows = groupFilter
        ? await db.select().from(lotteryUsers).where(groupFilter).orderBy(desc(lotteryUsers.createdAt))
        : await db.select().from(lotteryUsers).orderBy(desc(lotteryUsers.createdAt));
      return rows.map(({ password: _password, ...user }) => user);
    }),

  // Get single user
  byId: lotteryAuthedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const actor = ctx.lotteryUser!;
      const isAdmin = actor.role === "admin";
      const isSupervisor = actor.role === "supervisor";
      if (!isAdmin && !isSupervisor && actor.id !== input.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acceso denegado." });
      }
      const db = getDb();
      const rows = await db.select().from(lotteryUsers).where(eq(lotteryUsers.id, input.id));
      if (isSupervisor && rows[0] && rows[0].groupId !== actor.groupId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Solo puede ver usuarios de su grupo." });
      }
      if (!rows[0]) return null;
      const { password: _password, ...user } = rows[0];
      return user;
    }),

  // Create user - auto-generates bankNumber
  create: managerLotteryQuery
    .input(
      z.object({
        bankNumber: z.string().optional(),
        name: z.string().min(1),
        username: z.string().min(1),
        password: z.string().min(1),
        phone: z.string().optional().nullable(),
        role: z.enum(["admin", "supervisor", "collector", "user"]).default("user"),
        groupId: z.number().optional().nullable(),
        credit: z.string().default("5000.00"),
        commission: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        // El supervisor no puede crear usuarios; solo modificar y bloquear los de su grupo.
        if (ctx.lotteryUser!.role === "supervisor") {
          throw new TRPCError({ code: "FORBIDDEN", message: "El supervisor no puede crear usuarios. Solo puede modificar y bloquear usuarios de su grupo." });
        }
        const effectiveGroupId = input.groupId;
        const db = getDb();
        
        // Check if username already exists
        const existing = await db.select().from(lotteryUsers).where(eq(lotteryUsers.username, input.username));
        if (existing.length > 0) {
          throw new Error("El nombre de usuario ya existe");
        }

        // Auto-generate bankNumber based on last user
        let bankNumber = input.bankNumber;
        if (!bankNumber) {
          const allUsers = await db.select().from(lotteryUsers).orderBy(desc(lotteryUsers.id));
          let maxNum = 0;
          for (const u of allUsers) {
            const match = u.bankNumber.match(/(\d+)/);
            if (match) {
              const num = parseInt(match[1]);
              if (num > maxNum) maxNum = num;
            }
          }
          bankNumber = `B-${(maxNum + 1).toString().padStart(3, "0")}`;
        }
        
        // Check if bankNumber already exists
        const existingBank = await db.select().from(lotteryUsers).where(eq(lotteryUsers.bankNumber, bankNumber));
        if (existingBank.length > 0) {
          // Generate unique one
          const allUsers = await db.select().from(lotteryUsers).orderBy(desc(lotteryUsers.id));
          let maxNum = 0;
          for (const u of allUsers) {
            const match = u.bankNumber.match(/(\d+)/);
            if (match) {
              const num = parseInt(match[1]);
              if (num > maxNum) maxNum = num;
            }
          }
          bankNumber = `B-${(maxNum + 1).toString().padStart(3, "0")}`;
        }
        
        const isAdminRole = ["admin", "supervisor", "collector"].includes(input.role);
        const values: any = {
          bankNumber,
          name: input.name,
          username: input.username,
          password: await hashPassword(input.password),
          role: input.role,
          // Las cuentas administrativas (admin/supervisor/cobrador) no manejan credito, comision
          // ni tickets propios; solo administran la informacion y actividad de los vendedores.
          credit: isAdminRole ? "0.00" : input.credit,
          commission: isAdminRole ? "0.00" : (input.commission || "10.00"),
          active: true,
        };
        
        // Only include optional fields if they have values
        if (input.phone !== undefined && input.phone !== null && input.phone !== "") {
          values.phone = input.phone;
        }
        if (effectiveGroupId !== undefined && effectiveGroupId !== null) {
          values.groupId = effectiveGroupId;
        }
        
        const result = await db.insert(lotteryUsers).values(values).returning();
        return { id: result[0].id, bankNumber };
      } catch (err: any) {
        console.error("Create user error:", err);
        throw new Error(err.message || "Error al crear usuario");
      }
    }),

  // Update user
  update: managerLotteryQuery
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        username: z.string().optional(),
        password: z.string().optional(),
        phone: z.string().optional().nullable(),
        role: z.enum(["admin", "supervisor", "collector", "user"]).optional(),
        credit: z.string().optional(),
        commission: z.string().optional(),
        groupId: z.number().optional().nullable(),
        active: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const { id, ...data } = input;
      const actor = ctx.lotteryUser!;

      if (actor.role === "supervisor") {
        const targetRows = await db.select().from(lotteryUsers).where(eq(lotteryUsers.id, id));
        const target = targetRows[0];
        if (!target || !actor.groupId || target.groupId !== actor.groupId) {
          throw new Error("Solo puede editar usuarios de su propio grupo.");
        }
        if (data.role !== undefined && ["admin", "supervisor"].includes(data.role)) {
          throw new Error("Un supervisor no puede asignar roles administrativos.");
        }
        if (data.groupId !== undefined && data.groupId !== null && data.groupId !== actor.groupId) {
          throw new Error("No puede mover usuarios fuera de su grupo.");
        }
      }

      const updateData: Record<string, any> = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.username !== undefined) updateData.username = data.username;
      if (data.password !== undefined && data.password.trim()) updateData.password = await hashPassword(data.password);
      if (data.phone !== undefined) updateData.phone = data.phone;
      if (data.role !== undefined) updateData.role = data.role;
      // Las cuentas administrativas no manejan credito ni comision propia.
      const becomingAdminRole = data.role !== undefined && ["admin", "supervisor", "collector"].includes(data.role);
      if (becomingAdminRole) {
        updateData.credit = "0.00";
        updateData.commission = "0.00";
      } else {
        if (data.credit !== undefined) updateData.credit = data.credit;
        if (data.commission !== undefined) updateData.commission = data.commission;
      }
      if (data.groupId !== undefined) updateData.groupId = data.groupId;
      if (data.active !== undefined) updateData.active = data.active;
      await db.update(lotteryUsers).set(updateData).where(eq(lotteryUsers.id, id));
      return { ok: true };
    }),

  // Toggle user active
  toggleActive: managerLotteryQuery
    .input(z.object({ id: z.number(), active: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const actor = ctx.lotteryUser!;
      if (actor.role === "supervisor") {
        const targetRows = await db.select().from(lotteryUsers).where(eq(lotteryUsers.id, input.id));
        const target = targetRows[0];
        if (!target || !actor.groupId || target.groupId !== actor.groupId) {
          throw new Error("Solo puede modificar usuarios de su propio grupo.");
        }
      }
      await db.update(lotteryUsers).set({ active: input.active }).where(eq(lotteryUsers.id, input.id));
      return { ok: true };
    }),

  // Login
  login: publicQuery
    .input(
      z.object({
        username: z.string().min(1),
        password: z.string().min(1),
        deviceId: z.string().min(8).max(128).optional(),
        deviceLabel: z.string().max(120).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(lotteryUsers)
        .where(eq(lotteryUsers.username, input.username));
      const user = rows[0];
      if (!user) return { success: false, error: "Usuario no encontrado" };
      if (!user.active) return { success: false, error: "Usuario bloqueado" };
      if (!(await verifyPassword(input.password, user.password))) return { success: false, error: "Contrasena incorrecta" };
      if (!isHashedPassword(user.password)) {
        await db.update(lotteryUsers).set({ password: await hashPassword(input.password) }).where(eq(lotteryUsers.id, user.id));
      }

      // Device Binding: obligatorio excepto admin
      if (user.role !== "admin" && input.deviceId) {
        if (user.boundDeviceId && user.boundDeviceId !== input.deviceId) {
          return {
            success: false,
            error: "Este usuario esta vinculado a otro dispositivo. Contacte al administrador para desbloquear.",
          };
        }
        if (!user.boundDeviceId) {
          await db.update(lotteryUsers).set({
            boundDeviceId: input.deviceId,
            boundDeviceLabel: input.deviceLabel || "Dispositivo",
            boundAt: new Date(),
          }).where(eq(lotteryUsers.id, user.id));
        }
      }

      const token = await signLotterySession({ lotteryUserId: user.id, role: user.role });
      ctx.resHeaders.append("set-cookie", lotterySessionCookie(token, ctx.req.headers));
      return {
        success: true,
        user: {
          id: user.id,
          bankNumber: user.bankNumber,
          name: user.name,
          username: user.username,
          role: user.role,
          credit: user.credit,
          commission: user.commission,
          groupId: user.groupId,
          language: user.language,
        },
      };
    }),

  
  /** Guardar token de huella (tras WebAuthn en el cliente). */
  
  /** Admin: desvincular dispositivo de un usuario (cambio de celular). */
  clearDeviceBinding: adminLotteryQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(lotteryUsers).set({
        boundDeviceId: null,
        boundDeviceLabel: null,
        boundAt: null,
      }).where(eq(lotteryUsers.id, input.id));
      return { ok: true };
    }),

  registerFingerprint: lotteryAuthedQuery
    .input(z.object({ token: z.string().min(16).max(128) }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await db.update(lotteryUsers).set({ fingerprintToken: input.token }).where(eq(lotteryUsers.id, ctx.lotteryUser!.id));
      return { success: true };
    }),

  /** Login con huella: requiere token de dispositivo registrado + biometria en el cliente. */
  fingerprintLogin: publicQuery
    .input(z.object({
      userId: z.number(),
      token: z.string().min(16).max(128),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const rows = await db.select().from(lotteryUsers).where(eq(lotteryUsers.id, input.userId));
      const user = rows[0];
      if (!user) return { success: false, error: "Usuario no encontrado" };
      if (!user.active) return { success: false, error: "Usuario bloqueado" };
      if (!user.fingerprintToken || user.fingerprintToken !== input.token) {
        return { success: false, error: "Huella no registrada o token invalido" };
      }
      const sessionToken = await signLotterySession({ lotteryUserId: user.id, role: user.role });
      ctx.resHeaders.append("set-cookie", lotterySessionCookie(sessionToken, ctx.req.headers));
      return {
        success: true,
        user: {
          id: user.id,
          bankNumber: user.bankNumber,
          name: user.name,
          username: user.username,
          role: user.role,
          credit: user.credit,
          commission: user.commission,
          groupId: user.groupId,
          language: user.language,
        },
      };
    }),

  /** Quitar huella del servidor. */
  clearFingerprint: lotteryAuthedQuery
    .mutation(async ({ ctx }) => {
      const db = getDb();
      await db.update(lotteryUsers).set({ fingerprintToken: null }).where(eq(lotteryUsers.id, ctx.lotteryUser!.id));
      return { success: true };
    }),

logout: lotteryAuthedQuery.mutation(async ({ ctx }) => {
    ctx.resHeaders.append("set-cookie", clearLotterySessionCookie(ctx.req.headers));
    return { success: true };
  }),

  // Ajustar credito (agregar o descontar) con historial - contabilidad real.
  // admin: cualquier usuario. supervisor/collector: solo usuarios de su propio grupo.
  adjustCredit: creditOpsLotteryQuery
    .input(z.object({
      id: z.number(),
      direction: z.enum(["add", "subtract"]),
      amount: z.string(),
      type: z.enum(["deposit", "payout", "correction"]),
      note: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const amountNum = Number(input.amount);
      if (!Number.isFinite(amountNum) || amountNum <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Monto invalido." });
      }
      return db.transaction(async (tx) => {
        const rows = await tx.select().from(lotteryUsers).where(eq(lotteryUsers.id, input.id));
        const target = rows[0];
        if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Usuario no encontrado." });
        if (target.role !== "user") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Las cuentas administrativas no manejan credito propio." });
        }

        const actor = ctx.lotteryUser!;
        if (actor.role !== "admin") {
          if (!actor.groupId || target.groupId !== actor.groupId) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Solo puede ajustar credito de usuarios de su propio grupo." });
          }
        }

        const currentCredit = Number(target.credit);
        const newCredit = input.direction === "add" ? currentCredit + amountNum : currentCredit - amountNum;
        if (newCredit < 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "El credito no puede quedar negativo." });
        }

        await tx.update(lotteryUsers).set({ credit: newCredit.toFixed(2) }).where(eq(lotteryUsers.id, input.id));
        await tx.insert(creditAdjustments).values({
          userId: input.id,
          adjustedBy: actor.id,
          type: input.direction === "subtract" ? "payout" : input.type,
          direction: input.direction,
          amount: amountNum.toFixed(2),
          balanceAfter: newCredit.toFixed(2),
          note: input.note || null,
        });

        return { ok: true, newCredit: newCredit.toFixed(2) };
      });
    }),

  // Historial de ajustes de credito (agregado y descontado) - contabilidad.
  // admin: cualquier usuario. supervisor/collector: solo de su grupo. vendedor: solo el suyo.
  creditHistory: lotteryAuthedQuery
    .input(z.object({ userId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const actor = ctx.lotteryUser!;
      const targetId = input.userId ?? actor.id;

      if (actor.role !== "admin" && targetId !== actor.id) {
        if (!["supervisor", "collector"].includes(actor.role)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Acceso denegado." });
        }
        const targetRows = await db.select().from(lotteryUsers).where(eq(lotteryUsers.id, targetId));
        const target = targetRows[0];
        if (!target || !actor.groupId || target.groupId !== actor.groupId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Solo puede ver el historial de usuarios de su grupo." });
        }
      }

      return db.select().from(creditAdjustments).where(eq(creditAdjustments.userId, targetId)).orderBy(desc(creditAdjustments.createdAt));
    }),

  // Estado de perdidas y ganancias: credito agregado (vendedor entrega dinero de venta) = ganancia,
  // credito descontado por pago de premio = perdida. Sin userId: resumen de todo el alcance del rol
  // (admin = todo el sistema, supervisor/collector = su grupo, vendedor = solo lo suyo).
  // from/to (opcionales, formato YYYY-MM-DD) filtran por fecha; sin ellos, trae todo el historial.
  creditSummary: lotteryAuthedQuery
    .input(z.object({ userId: z.number().optional(), from: z.string().optional(), to: z.string().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const actor = ctx.lotteryUser!;
      let userIds: number[] | null = null;

      if (input?.userId) {
        if (actor.role !== "admin" && input.userId !== actor.id) {
          if (!["supervisor", "collector"].includes(actor.role)) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Acceso denegado." });
          }
          const targetRows = await db.select().from(lotteryUsers).where(eq(lotteryUsers.id, input.userId));
          const target = targetRows[0];
          if (!target || !actor.groupId || target.groupId !== actor.groupId) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Solo puede ver el resumen de usuarios de su grupo." });
          }
        }
        userIds = [input.userId];
      } else if (actor.role === "admin") {
        userIds = null; // todo el sistema
      } else if (["supervisor", "collector"].includes(actor.role)) {
        const groupUsers = await db.select({ id: lotteryUsers.id }).from(lotteryUsers).where(eq(lotteryUsers.groupId, actor.groupId ?? -1));
        userIds = groupUsers.map((u) => u.id);
      } else {
        userIds = [actor.id];
      }

      let rows = userIds && userIds.length > 0
        ? await db.select().from(creditAdjustments).where(inArray(creditAdjustments.userId, userIds))
        : userIds === null
          ? await db.select().from(creditAdjustments)
          : [];

      if (input?.from) {
        const fromMs = new Date(input.from + "T00:00:00").getTime();
        rows = rows.filter((r) => new Date(r.createdAt).getTime() >= fromMs);
      }
      if (input?.to) {
        const toMs = new Date(input.to + "T00:00:00").getTime() + 24 * 60 * 60 * 1000;
        rows = rows.filter((r) => new Date(r.createdAt).getTime() < toMs);
      }

      let totalGanancias = 0, totalPerdidas = 0;
      for (const r of rows) {
        const amt = Number(r.amount);
        if (r.type === "deposit") totalGanancias += amt;
        else if (r.type === "payout") totalPerdidas += amt;
        else if (r.type === "reversal") totalPerdidas -= amt;
        else if (r.direction === "add") totalGanancias += amt;
        else totalPerdidas += amt;
      }

      return {
        totalGanancias,
        totalPerdidas,
        neto: totalGanancias - totalPerdidas,
        movimientos: rows.length,
        rows: rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      };
    }),

  // Update credit (uso interno/legacy: sobreescribe el valor directo, sin historial)
  updateCredit: managerLotteryQuery
    .input(z.object({ id: z.number(), credit: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const actor = ctx.lotteryUser!;
      const targetRows = await db.select().from(lotteryUsers).where(eq(lotteryUsers.id, input.id));
      const target = targetRows[0];
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Usuario no encontrado." });
      if (target.role !== "user") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Las cuentas administrativas no manejan credito propio." });
      }
      if (actor.role === "supervisor") {
        if (!actor.groupId || target.groupId !== actor.groupId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Solo puede modificar credito de usuarios de su propio grupo." });
        }
      }
      await db.update(lotteryUsers).set({ credit: input.credit }).where(eq(lotteryUsers.id, input.id));
      return { ok: true };
    }),

  // Delete user
  delete: adminLotteryQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(lotteryUsers).where(eq(lotteryUsers.id, input.id));
      return { ok: true };
    }),

  // Delete user (para supervisor, limitado a su propio grupo y sin poder borrar admin/supervisor)
  deleteScoped: managerLotteryQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const actor = ctx.lotteryUser!;
      if (actor.role === "admin") {
        await db.delete(lotteryUsers).where(eq(lotteryUsers.id, input.id));
        return { ok: true };
      }
      const targetRows = await db.select().from(lotteryUsers).where(eq(lotteryUsers.id, input.id));
      const target = targetRows[0];
      if (!target || !actor.groupId || target.groupId !== actor.groupId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Solo puede eliminar usuarios de su propio grupo." });
      }
      if (["admin", "supervisor"].includes(target.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No puede eliminar cuentas administrativas." });
      }
      await db.delete(lotteryUsers).where(eq(lotteryUsers.id, input.id));
      return { ok: true };
    }),

  // Reset accounting data for a user (keeps the user, wipes tickets/plays/credit history and resets credit)
  resetUserAccounting: adminLotteryQuery
    .input(z.object({ id: z.number(), resetCreditTo: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      return db.transaction(async (tx) => {
        const userTickets = await tx.select({ id: tickets.id }).from(tickets).where(eq(tickets.userId, input.id));
        const ticketIds = userTickets.map((t) => t.id);
        if (ticketIds.length > 0) {
          await tx.delete(plays).where(inArray(plays.ticketId, ticketIds));
          await tx.delete(tickets).where(eq(tickets.userId, input.id));
        }
        await tx.delete(creditAdjustments).where(eq(creditAdjustments.userId, input.id));
        const creditVal = input.resetCreditTo ?? "500.00";
        await tx.update(lotteryUsers).set({ credit: creditVal }).where(eq(lotteryUsers.id, input.id));
        return { ok: true, ticketsRemoved: ticketIds.length };
      });
    }),

  // Reset accounting for an entire group
  resetGroupAccounting: adminLotteryQuery
    .input(z.object({ groupId: z.number(), resetCreditTo: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      return db.transaction(async (tx) => {
        const groupUsers = await tx.select({ id: lotteryUsers.id }).from(lotteryUsers).where(eq(lotteryUsers.groupId, input.groupId));
        const userIds = groupUsers.map((u) => u.id);
        if (userIds.length === 0) return { ok: true, usersAffected: 0 };
        const userTickets = await tx.select({ id: tickets.id }).from(tickets).where(inArray(tickets.userId, userIds));
        const ticketIds = userTickets.map((t) => t.id);
        if (ticketIds.length > 0) {
          await tx.delete(plays).where(inArray(plays.ticketId, ticketIds));
          await tx.delete(tickets).where(inArray(tickets.userId, userIds));
        }
        await tx.delete(creditAdjustments).where(inArray(creditAdjustments.userId, userIds));
        const creditVal = input.resetCreditTo ?? "500.00";
        for (const uid of userIds) {
          await tx.update(lotteryUsers).set({ credit: creditVal }).where(eq(lotteryUsers.id, uid));
        }
        return { ok: true, usersAffected: userIds.length, ticketsRemoved: ticketIds.length };
      });
    }),

  // Reset all system accounting (all tickets, plays, credit adjustments; reset all user credits)
  resetSystemAccounting: adminLotteryQuery
    .input(z.object({ resetCreditTo: z.string().optional(), confirm: z.literal("RESET_ALL") }))
    .mutation(async ({ input }) => {
      const db = getDb();
      return db.transaction(async (tx) => {
        await tx.delete(plays);
        await tx.delete(tickets);
        await tx.delete(creditAdjustments);
        const creditVal = input.resetCreditTo ?? "500.00";
        await tx.update(lotteryUsers).set({ credit: creditVal });
        return { ok: true };
      });
    }),
});
