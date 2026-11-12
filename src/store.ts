export type PlayType = "directo" | "pale" | "tripleta" | "cuatrena" | "terna" | "invalido";
export type QuickPlayType = "par" | "decimal" | "unidad" | "azar" | "mezclar";

export interface Play {
  id: string;
  number: string;
  amount: number;
  type: PlayType;
  lotteryId: number;
  lotteryName: string;
}

export interface DraftTicket {
  plays: Play[];
  savedAt: number;
}

export interface SessionUser {
  id: number;
  bankNumber: string;
  name: string;
  username: string;
  role: "admin" | "supervisor" | "collector" | "user";
  credit: string;
  commission: string;
  groupId: number | null;
  language?: "es" | "fr" | "en";
}

const SESSION_KEY = "loteria_session";
const DRAFT_KEY = "loteria_draft";
const USERS_KEY = "loteria_users";
const INIT_KEY = "loteria_initialized_v2";

interface LocalUser {
  id: number;
  bankNumber: string;
  name: string;
  username: string;
  password: string;
  phone?: string;
  role: "admin" | "supervisor" | "collector" | "user";
  groupId: number | null;
  credit: string;
  commission: string;
  active: boolean;
}

// ─── SAFE localStorage GETTER ────────────────────────────────────────
export function safeGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ─── ONE-TIME INITIALIZATION ─────────────────────────────────────────
export function initStorage(): void {
  const alreadyInit = localStorage.getItem(INIT_KEY);
  if (!alreadyInit) {
    localStorage.setItem(INIT_KEY, "true");
  }

  // Always ensure admin user exists (for offline login)
  const existingUsers = safeGet<any[]>(USERS_KEY, []);
  const hasAdmin = existingUsers.some((u: any) => u.username === "admin");
  if (!hasAdmin) {
    const usersWithAdmin = [
      { id: 1, bankNumber: "B-001", name: "Administrador", username: "admin", password: "admin123", role: "admin", credit: "100000.00", commission: "0", groupId: null, phone: "", active: true },
      { id: 2, bankNumber: "B-002", name: "Vendedor 1", username: "vendedor1", password: "1234", role: "user", credit: "5000.00", commission: "10", groupId: null, phone: "", active: true },
      ...existingUsers,
    ];
    localStorage.setItem(USERS_KEY, JSON.stringify(usersWithAdmin));
  } else if (!alreadyInit && !localStorage.getItem(USERS_KEY)) {
    // First time init
    localStorage.setItem(USERS_KEY, JSON.stringify([
      { id: 1, bankNumber: "B-001", name: "Administrador", username: "admin", password: "admin123", role: "admin", credit: "100000.00", commission: "0", groupId: null, phone: "", active: true },
      { id: 2, bankNumber: "B-002", name: "Vendedor 1", username: "vendedor1", password: "1234", role: "user", credit: "5000.00", commission: "10", groupId: null, phone: "", active: true },
    ]));
  }

  if (!localStorage.getItem("loteria_groups")) {
    localStorage.setItem("loteria_groups", JSON.stringify([{ id: 1, name: "Grupo Principal", active: true }]));
  }

  if (!localStorage.getItem("loteria_loterias")) {
    localStorage.setItem("loteria_loterias", JSON.stringify([
      { id: 1, name: "Loteria Nacional Noche", drawTime: "20:55", active: true },
      { id: 2, name: "Loteria Nacional Tarde", drawTime: "14:55", active: true },
      { id: 3, name: "Leidsa", drawTime: "20:55", active: true },
      { id: 4, name: "Loteria Real", drawTime: "12:55", active: true },
      { id: 5, name: "Loteka", drawTime: "19:55", active: true },
      { id: 6, name: "La Primera", drawTime: "11:55", active: true },
      { id: 7, name: "La Suerte", drawTime: "12:55", active: true },
      { id: 8, name: "LoteDom", drawTime: "20:00", active: true },
      { id: 9, name: "Anguilla", drawTime: "10:00", active: true },
      { id: 10, name: "New York Tarde", drawTime: "14:30", active: true },
      { id: 11, name: "New York Noche", drawTime: "22:30", active: true },
      { id: 12, name: "Florida Tarde", drawTime: "13:30", active: true },
      { id: 13, name: "Florida Noche", drawTime: "21:45", active: true },
    ]));
  }

  if (!localStorage.getItem("loteria_prizes")) {
    localStorage.setItem("loteria_prizes", JSON.stringify([
      { id: 1, playType: "directo", firstPrizeMultiplier: "50", secondPrizeMultiplier: "15", thirdPrizeMultiplier: "10", paleFirstSecondMultiplier: "0", paleFirstThirdMultiplier: "0", paleSecondThirdMultiplier: "0", fixedMultiplier: "0", description: "1er=50x, 2do=15x, 3ro=10x" },
      { id: 2, playType: "pale", firstPrizeMultiplier: "0", secondPrizeMultiplier: "0", thirdPrizeMultiplier: "0", paleFirstSecondMultiplier: "25", paleFirstThirdMultiplier: "20", paleSecondThirdMultiplier: "15", fixedMultiplier: "0", description: "1+2=25x, 1+3=20x, 2+3=15x" },
      { id: 3, playType: "terna", firstPrizeMultiplier: "0", secondPrizeMultiplier: "0", thirdPrizeMultiplier: "0", paleFirstSecondMultiplier: "0", paleFirstThirdMultiplier: "0", paleSecondThirdMultiplier: "0", fixedMultiplier: "500", description: "3 cifras = 500x" },
      { id: 4, playType: "cuatrena", firstPrizeMultiplier: "0", secondPrizeMultiplier: "0", thirdPrizeMultiplier: "0", paleFirstSecondMultiplier: "0", paleFirstThirdMultiplier: "0", paleSecondThirdMultiplier: "0", fixedMultiplier: "4000", description: "4 cifras = 4,000x" },
      { id: 5, playType: "tripleta", firstPrizeMultiplier: "0", secondPrizeMultiplier: "0", thirdPrizeMultiplier: "0", paleFirstSecondMultiplier: "0", paleFirstThirdMultiplier: "0", paleSecondThirdMultiplier: "0", fixedMultiplier: "10000", description: "Tripleta = 10,000x" },
    ]));
  }

  if (!localStorage.getItem("loteria_tickets")) {
    localStorage.setItem("loteria_tickets", JSON.stringify([]));
  }

  if (!localStorage.getItem("loteria_winners")) {
    localStorage.setItem("loteria_winners", JSON.stringify([]));
  }
}

// ─── USERS ───────────────────────────────────────────────────────────
function getLocalUsers(): LocalUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed.map((u: any) => ({ ...u, active: u.active !== false }));
    }
  } catch { /* ignore */ }
  return [];
}

export function localLogin(username: string, password: string): { success: boolean; error?: string; user?: SessionUser } {
  const users = getLocalUsers();
  const found = users.find((u) => u.username === username);
  if (!found) return { success: false, error: "Usuario no encontrado" };
  if (found.active === false) return { success: false, error: "Usuario bloqueado" };
  if (found.password !== password) return { success: false, error: "Contrasena incorrecta" };
  return {
    success: true,
    user: {
      id: found.id,
      bankNumber: found.bankNumber,
      name: found.name,
      username: found.username,
      role: found.role,
      credit: found.credit,
      commission: found.commission || "0",
      groupId: found.groupId,
    },
  };
}

export function localGetUsers(): LocalUser[] {
  return getLocalUsers();
}

export function localAddUser(user: Omit<LocalUser, "id" | "active">): LocalUser {
  const users = getLocalUsers();
  const newId = Math.max(0, ...users.map((u) => u.id)) + 1;
  const newUser: LocalUser = { ...(user as any), id: newId, active: true };
  users.push(newUser);
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  return newUser;
}

export function localUpdateUser(id: number, data: Partial<LocalUser>): boolean {
  const users = getLocalUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) return false;
  users[idx] = { ...users[idx], ...data };
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  return true;
}

export function localDeleteUser(id: number): boolean {
  const users = getLocalUsers();
  const filtered = users.filter((u) => u.id !== id);
  localStorage.setItem(USERS_KEY, JSON.stringify(filtered));
  return true;
}

export function getNextBankNumber(): string {
  const users = getLocalUsers();
  const max = Math.max(0, ...users.map((u) => {
    const match = u.bankNumber.match(/(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }));
  return `B-${(max + 1).toString().padStart(3, "0")}`;
}

// ─── Session ─────────────────────────────────────────────────────────
export function saveSession(user: SessionUser): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

export function loadSession(): SessionUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

// ─── Draft ───────────────────────────────────────────────────────────
export function saveDraft(plays: Play[]): void {
  const draft: DraftTicket = { plays, savedAt: Date.now() };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function loadDraft(): Play[] {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return [];
    const draft = JSON.parse(raw) as DraftTicket;
    const age = Date.now() - draft.savedAt;
    if (age > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(DRAFT_KEY);
      return [];
    }
    return draft.plays || [];
  } catch {
    return [];
  }
}

export function clearDraft(): void {
  localStorage.removeItem(DRAFT_KEY);
}

// ─── Helpers ─────────────────────────────────────────────────────────
export function detectPlayType(number: string): PlayType {
  const digits = number.replace(/[^0-9]/g, "");
  // 4 cifras = cuatrena (detected by decimal point, e.g. "1322.")
  if (number.includes(".")) return "cuatrena";
  // 2 digits = directo (e.g. "03")
  if (digits.length === 2) return "directo";
  // 4 digits = pale (e.g. "1323" → 13+23)
  if (digits.length === 4) return "pale";
  // 3 digits = terna (e.g. "123")
  if (digits.length === 3) return "terna";
  // 6 digits = tripleta (e.g. "042010" → 04+20+10)
  if (digits.length === 6) return "tripleta";
  // Invalid length - not a valid play type
  return "invalido" as PlayType;
}

// ─── Pale combos: 5687/ → 56+87, 56+78, 65+87, 65+78 ──────────────
export function generatePaleCombos(digits: string): string[] {
  const d = digits.replace(/[^0-9]/g, "").split("");
  if (d.length !== 4) return [digits];
  // Split into two groups of 2: [d0,d1] and [d2,d3]
  // Generate permutations for each group
  const group1 = [d[0] + d[1], d[1] + d[0]];
  const group2 = [d[2] + d[3], d[3] + d[2]];
  // Remove duplicates within each group
  const unique1 = [...new Set(group1)];
  const unique2 = [...new Set(group2)];
  // Generate all combinations: 2x2 = 4 combos
  const combos: string[] = [];
  for (const a of unique1) {
    for (const b of unique2) {
      combos.push(`${a} + ${b}`);
    }
  }
  return combos;
}

// ─── Directo combos: 030/ → 03, 30 ─────────────────────────────────
export function generateDirectoCombos(digits: string): string[] {
  const d = digits.replace(/[^0-9]/g, "").split("");
  if (d.length < 2) return [digits];
  // Use first 2 digits and generate permutations
  const base = d[0] + d[1];
  const reversed = d[1] + d[0];
  if (base === reversed) return [base];
  return [base, reversed];
}

export function parseChainInput(input: string): string[] {
  return input.split("+").map((s) => s.trim()).filter(Boolean);
}

export function generateTicketCode(): string {
  return "TKT-" + Math.random().toString(36).substr(2, 6).toUpperCase();
}

// ─── NUMBER FORMATTING ─────────────────────────────────────────────
/** Format number with comma for thousands and dot for decimals: 1,000.00 */
export function formatMoney(amount: number | string): string {
  const num = typeof amount === "string" ? Number(amount) : amount;
  if (isNaN(num)) return "0.00";
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Los simbolos (+ para pale, / para generar combinaciones, etc.) solo sirven para
 * TIPEAR o generar la jugada. Una vez agregada, nunca deben verse en pantalla ni
 * en el ticket - solo los digitos limpios. Esta funcion es solo para MOSTRAR;
 * el numero real (con el formato interno) sigue igual en la base de datos.
 */
export function displayNumber(number: string): string {
  return number.replace(/[^0-9]/g, "");
}

// ─── AUDIT LOG ─────────────────────────────────────────────────────
const LOG_KEY = "loteria_audit_log";

export interface AuditEntry {
  id: number;
  timestamp: string;
  date: string;
  time: string;
  type: "credit_add" | "credit_deduct" | "ticket_sale" | "ticket_annul" | "prize_win";
  userId: number;
  userName: string;
  groupId: number | null;
  amount: number;
  description: string;
  ticketCode?: string;
  balanceAfter?: number;
}

export function logAudit(entry: Omit<AuditEntry, "id" | "timestamp" | "date" | "time">): void {
  const logs: AuditEntry[] = JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
  const now = new Date();
  logs.unshift({
    ...entry,
    id: Date.now(),
    timestamp: now.toISOString(),
    date: now.toLocaleDateString(),
    time: now.toLocaleTimeString(),
  });
  localStorage.setItem(LOG_KEY, JSON.stringify(logs));
}

export function getAuditLog(): AuditEntry[] {
  return JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
}

export function getAuditLogForUser(userId: number): AuditEntry[] {
  return getAuditLog().filter((l) => l.userId === userId);
}

export function getAuditLogForGroup(groupId: number): AuditEntry[] {
  const users = getLocalUsers().filter((u) => u.groupId === groupId).map((u) => u.id);
  return getAuditLog().filter((l) => users.includes(l.userId));
}

// ─── CREDIT & COMMISSION MANAGEMENT ──────────────────────────────────

/** Add credit to a user (admin operation) */
export function addCredit(userId: number, amount: number): boolean {
  const users = getLocalUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) return false;
  const currentCredit = Number(users[idx].credit) || 0;
  const newCredit = currentCredit + amount;
  users[idx].credit = newCredit.toFixed(2);
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  // Log the credit change
  logAudit({
    type: amount >= 0 ? "credit_add" : "credit_deduct",
    userId,
    userName: users[idx].name,
    groupId: users[idx].groupId,
    amount: Math.abs(amount),
    description: amount >= 0 ? `Credito agregado: +$${formatMoney(amount)}` : `Credito reducido: -$${formatMoney(Math.abs(amount))}`,
    balanceAfter: newCredit,
  });
  return true;
}

/** Deduct credit from a user (after sale) */
export function deductCredit(userId: number, amount: number): boolean {
  const users = getLocalUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) return false;
  const currentCredit = Number(users[idx].credit) || 0;
  if (currentCredit < amount) return false;
  users[idx].credit = (currentCredit - amount).toFixed(2);
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  return true;
}

/** Set commission percentage for a user */
export function setCommission(userId: number, commission: string): boolean {
  const users = getLocalUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) return false;
  users[idx].commission = commission;
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  return true;
}

/** Get user's current credit */
export function getCredit(userId: number): number {
  const users = getLocalUsers();
  const user = users.find((u) => u.id === userId);
  return user ? Number(user.credit) || 0 : 0;
}

/** Calculate net deduction = total - commission */
export function calculateNetDeduction(total: number, commissionPercent: number): number {
  // Commission is what the seller EARNS, so they only "pay" total - commission
  const commissionAmount = total * (commissionPercent / 100);
  return total - commissionAmount;
}

/** Refresh session credit from storage */
export function refreshSessionCredit(): SessionUser | null {
  const session = loadSession();
  if (!session) return null;
  const users = getLocalUsers();
  const user = users.find((u) => u.id === session.id);
  if (user) {
    session.credit = user.credit;
    session.commission = user.commission || "0";
    saveSession(session);
  }
  return session;
}

// ─── PRIZE / WINNER CHECK ────────────────────────────────────────────

export interface WinnerEntry {
  id: number;
  lotteryId: number;
  lotteryName: string;
  playType: string;
  winningNumber: string;
  date: string;
  prizeAmount: string;
}

/** Check if a play matches a winning number and calculate prize */
export function checkWinningPlays(plays: Play[]): { prize: number; details: string[] } {
  const winnersRaw = localStorage.getItem("loteria_winners");
  if (!winnersRaw) return { prize: 0, details: [] };
  const winners: WinnerEntry[] = JSON.parse(winnersRaw);
  const prizesRaw = localStorage.getItem("loteria_prizes");
  const prizes = prizesRaw ? JSON.parse(prizesRaw) : [];

  let totalPrize = 0;
  const details: string[] = [];

  for (const play of plays) {
    // Find matching winner for same lottery and play type
    const matchingWinners = winners.filter(
      (w) => w.lotteryId === play.lotteryId && w.playType === play.type
    );
    for (const winner of matchingWinners) {
      const playNums = play.number.split("+").map((n) => n.trim());
      const winNums = winner.winningNumber.split("+").map((n) => n.trim());

      // For pale/tripleta, order doesn't matter
      const normalizedPlay = play.type === "pale" || play.type === "tripleta"
        ? [...playNums].sort().join("+")
        : play.number;
      const normalizedWin = play.type === "pale" || play.type === "tripleta"
        ? [...winNums].sort().join("+")
        : winner.winningNumber;

      if (normalizedPlay === normalizedWin) {
        const prizeConfig = prizes.find((p: any) => p.playType === play.type);
        if (prizeConfig) {
          let multiplier = 0;
          switch (play.type) {
            case "directo": multiplier = Number(prizeConfig.firstPrizeMultiplier || 0); break;
            case "pale": multiplier = Number(prizeConfig.paleFirstSecondMultiplier || 0); break;
            case "terna": multiplier = Number(prizeConfig.fixedMultiplier || 0); break;
            case "cuatrena": multiplier = Number(prizeConfig.fixedMultiplier || 0); break;
            case "tripleta": multiplier = Number(prizeConfig.fixedMultiplier || 0); break;
          }
          const prize = play.amount * multiplier;
          totalPrize += prize;
          details.push(`${play.number} (${play.type}) = $${formatMoney(prize)}`);
        }
      }
    }
  }

  return { prize: totalPrize, details };
}

// ─── QUICK PLAYS (Jugadas Rapidas) ────────────────────────────────────

/** Par: Generate even numbers 11,22,33,44,55,66,77,88,99,00 */
export function generateParPlays(lotteryId: number, lotteryName: string, amount: number): Play[] {
  const numbers = ["11", "22", "33", "44", "55", "66", "77", "88", "99", "00"];
  return numbers.map((n) => ({
    id: Math.random().toString(36).substr(2, 9),
    number: n,
    amount,
    type: "directo" as PlayType,
    lotteryId,
    lotteryName,
  }));
}

/** Decimal: Generate numbers with fixed second digit (e.g., 2 → 02,12,22,...,92) */
export function generateDecimalPlays(digit: number, lotteryId: number, lotteryName: string, amount: number): Play[] {
  if (digit < 0 || digit > 9) return [];
  const numbers: string[] = [];
  for (let i = 0; i < 10; i++) {
    numbers.push(`${i}${digit}`);
  }
  return numbers.map((n) => ({
    id: Math.random().toString(36).substr(2, 9),
    number: n,
    amount,
    type: "directo" as PlayType,
    lotteryId,
    lotteryName,
  }));
}

/** Unidad: Generate numbers with fixed first digit (e.g., 2 → 20,21,22,...,29) */
export function generateUnidadPlays(digit: number, lotteryId: number, lotteryName: string, amount: number): Play[] {
  if (digit < 0 || digit > 9) return [];
  const numbers: string[] = [];
  for (let i = 0; i < 10; i++) {
    numbers.push(`${digit}${i}`);
  }
  return numbers.map((n) => ({
    id: Math.random().toString(36).substr(2, 9),
    number: n,
    amount,
    type: "directo" as PlayType,
    lotteryId,
    lotteryName,
  }));
}

/** Azar: Generate random plays - type, count, amount */
export function generateAzarPlays(
  playType: PlayType,
  count: number,
  lotteryId: number,
  lotteryName: string,
  amount: number
): Play[] {
  const plays: Play[] = [];
  const used = new Set<string>();

  for (let i = 0; i < count; i++) {
    let number: string;
    let type: PlayType = playType;

    switch (playType) {
      case "directo": {
        do { number = `${Math.floor(Math.random() * 100)}`.padStart(2, "0"); }
        while (used.has(number));
        break;
      }
      case "pale": {
        do {
          const a = `${Math.floor(Math.random() * 100)}`.padStart(2, "0");
          const b = `${Math.floor(Math.random() * 100)}`.padStart(2, "0");
          number = [a, b].sort().join("+");
        } while (used.has(number));
        break;
      }
      case "tripleta": {
        do {
          const a = `${Math.floor(Math.random() * 100)}`.padStart(2, "0");
          const b = `${Math.floor(Math.random() * 100)}`.padStart(2, "0");
          const c = `${Math.floor(Math.random() * 100)}`.padStart(2, "0");
          number = [a, b, c].sort().join("+");
        } while (used.has(number));
        break;
      }
      case "terna": {
        do { number = `${Math.floor(Math.random() * 1000)}`.padStart(3, "0"); }
        while (used.has(number));
        break;
      }
      case "cuatrena": {
        do { number = `${Math.floor(Math.random() * 10000)}`.padStart(4, "0"); }
        while (used.has(number));
        break;
      }
      default:
        continue;
    }

    used.add(number);
    plays.push({
      id: Math.random().toString(36).substr(2, 9),
      number: number.replace(/[^0-9]/g, ""),
      amount,
      type,
      lotteryId,
      lotteryName,
    });
  }
  return plays;
}

/** Mezclar: Generate all possible pale/tripleta combinations from given numbers */
export function generateMezclarPlays(
  playType: "pale" | "tripleta",
  numbers: string[],
  lotteryId: number,
  lotteryName: string,
  amount: number
): Play[] {
  if (numbers.length < 2) return [];

  const plays: Play[] = [];

  if (playType === "pale" && numbers.length >= 2) {
    // Generate all 2-number combinations
    for (let i = 0; i < numbers.length; i++) {
      for (let j = i + 1; j < numbers.length; j++) {
        const combo = [numbers[i], numbers[j]].sort().join("+");
        plays.push({
          id: Math.random().toString(36).substr(2, 9),
          number: combo.replace(/[^0-9]/g, ""),
          amount,
          type: "pale" as PlayType,
          lotteryId,
          lotteryName,
        });
      }
    }
  } else if (playType === "tripleta" && numbers.length >= 3) {
    // Generate all 3-number combinations
    for (let i = 0; i < numbers.length; i++) {
      for (let j = i + 1; j < numbers.length; j++) {
        for (let k = j + 1; k < numbers.length; k++) {
          const combo = [numbers[i], numbers[j], numbers[k]].sort().join("+");
          plays.push({
            id: Math.random().toString(36).substr(2, 9),
            number: combo.replace(/[^0-9]/g, ""),
            amount,
            type: "tripleta" as PlayType,
            lotteryId,
            lotteryName,
          });
        }
      }
    }
  }

  return plays;
}

// ─── PALE LIMIT CHECKER ────────────────────────────────────────────────

/** Normalize a pale/tripleta number (sort parts) */
export function normalizeCombo(number: string): string {
  return number.split("+").map(s => s.trim()).filter(Boolean).sort().join("+");
}

/** Check if adding a pale/tripleta would exceed the limit */
export function checkPaleLimit(
  existingPlays: Play[],
  lotteryId: number,
  playType: "pale" | "tripleta",
  number: string,
  newAmount: number,
  limit: number
): { allowed: boolean; reason?: string; currentTotal: number } {
  const normalized = normalizeCombo(number);
  // Sum all existing plays of same type, same lottery, same normalized combo
  const currentTotal = existingPlays
    .filter(p =>
      p.lotteryId === lotteryId &&
      p.type === playType &&
      normalizeCombo(p.number) === normalized
    )
    .reduce((sum, p) => sum + p.amount, 0);
  const wouldBe = currentTotal + newAmount;
  if (wouldBe > limit) {
    return {
      allowed: false,
      reason: `Limite $${formatMoney(limit)} excedido para ${normalized}. Actual: $${formatMoney(currentTotal)} + $${formatMoney(newAmount)} = $${formatMoney(wouldBe)}`,
      currentTotal,
    };
  }
  return { allowed: true, currentTotal };
}


/** Texto de ticket para WhatsApp / compartir (formato tipo recibo). */
export function formatTicketShareText(opts: {
  groupName?: string;
  code: string;
  date: string;
  time: string;
  terminal: string;
  lottery: string;
  plays: { number: string; type: string; amount: string | number }[];
  total: string | number;
}): string {
  const appName = opts.groupName || "BANCA VICTORIA";
  const lines = (opts.plays || []).map((p) => {
    const num = displayNumber(String(p.number));
    const typ = String(p.type).toUpperCase();
    const amt = formatMoney(p.amount);
    return `${num}    ${typ}    $${amt}`;
  });
  return [
    `*${appName}*`,
    `Gracias por jugar con nosotros!`,
    ``,
    `Ticket No: ${opts.code}`,
    `Fecha: ${opts.date}`,
    `Hora: ${opts.time}`,
    `Terminal: ${opts.terminal}`,
    `Grupo: ${appName}`,
    `Loteria: ${opts.lottery}`,
    ``,
    `*JUGADAS*`,
    ...lines,
    ``,
    `*TOTAL:* $${formatMoney(opts.total)}`,
  ].join("\n");
}

/** Clave sessionStorage para pasar jugadas copiadas a la pantalla Vender. */
export const PENDING_COPY_KEY = "bv_pending_copy_plays";
