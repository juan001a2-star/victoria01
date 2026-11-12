import { useState, useEffect, useCallback, useRef } from "react";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import {
  saveDraft, loadDraft, clearDraft, detectPlayType,
  generatePaleCombos, generateDirectoCombos,
  generateTicketCode, calculateNetDeduction,
  formatMoney, logAudit, displayNumber, PENDING_COPY_KEY, formatTicketShareText,
  generateParPlays, generateDecimalPlays, generateUnidadPlays,
  generateAzarPlays, generateMezclarPlays,
  normalizeCombo,
} from "@/store";
import { trpc } from "@/providers/trpc";
import type { Play, PlayType, SessionUser } from "@/store";
import { t } from "@/i18n";
import {
  Trash2, Edit2, Check, X, Share2, Ticket,
  ChevronDown, ChevronUp, Plus, Save, FileText,
  Keyboard, Lock, Wallet, Percent, Zap, Dices, Shuffle, Hash, Copy, Repeat, Pin, PinOff
} from "lucide-react";

interface VenderScreenProps {
  user: SessionUser;
}

interface Lottery {
  id: number;
  name: string;
  drawTime: string;
  closeTime: string;
  active: boolean;
  schedule: Record<string, { open: string; close: string }>;
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function getGuianaNow(): { dayKey: typeof DAY_KEYS[number]; mins: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Cayenne",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const weekdayMap: Record<string, typeof DAY_KEYS[number]> = { Sun: "sun", Mon: "mon", Tue: "tue", Wed: "wed", Thu: "thu", Fri: "fri", Sat: "sat" };
  const dayKey = weekdayMap[map.weekday] || "sun";
  let hour = Number(map.hour);
  if (hour === 24) hour = 0;
  const mins = hour * 60 + Number(map.minute);
  return { dayKey, mins };
}

function isLotteryOpenNow(lottery: Lottery): boolean {
  const { dayKey, mins: currentMins } = getGuianaNow();
  const daySched = lottery.schedule?.[dayKey];
  if (!daySched) return true; // If no schedule, assume open
  const [openH, openM] = daySched.open.split(":").map(Number);
  const [closeH, closeM] = daySched.close.split(":").map(Number);
  const openMins = openH * 60 + openM;
  const closeMins = closeH * 60 + closeM;
  return currentMins >= openMins && currentMins < closeMins;
}

function getMinutesRemaining(lottery: Lottery): number | null {
  const { dayKey, mins: currentMins } = getGuianaNow();
  const daySched = lottery.schedule?.[dayKey];
  if (!daySched) return null;
  const [closeH, closeM] = daySched.close.split(":").map(Number);
  const closeMins = closeH * 60 + closeM;
  const diff = closeMins - currentMins;
  return diff > 0 ? diff : null;
}

function migrateLottery(lottery: any): Lottery {
  let schedule = lottery.schedule;
  if (typeof schedule === "string") {
    try { schedule = JSON.parse(schedule); } catch { schedule = null; }
  }
  if (schedule && typeof schedule === "object") {
    return { ...lottery, schedule };
  }
  const closeTime = lottery.closeTime || lottery.drawTime || "20:00";
  const defaultSched = { open: "07:00", close: closeTime };
  return {
    ...lottery,
    schedule: {
      mon: { ...defaultSched }, tue: { ...defaultSched }, wed: { ...defaultSched },
      thu: { ...defaultSched }, fri: { ...defaultSched }, sat: { ...defaultSched }, sun: { ...defaultSched },
    },
  };
}

export default function VenderScreen({ user }: VenderScreenProps) {
  // tRPC hooks
  const utils = trpc.useUtils();
  const userQuery = trpc.lotteryUser.byId.useQuery({ id: user.id }, { refetchInterval: 10000 });
  const createTicketMut = trpc.ticket.create.useMutation({
    onSuccess: () => utils.ticket.list.invalidate(),
  });
  const lotteryListQuery = trpc.lottery.list.useQuery();
  const prizeListQuery = trpc.prize.list.useQuery();
  const groupListQuery = trpc.group.list.useQuery();
  const configQuery = trpc.config.get.useQuery({ key: "system" });
  const limitsConfigQuery = trpc.config.get.useQuery({ key: "limits" });
  const playLimitsQuery = trpc.lottery.getLimits.useQuery();

  // Get lotteries from API
  const allLotteries: Lottery[] = (lotteryListQuery.data || []).map(migrateLottery).filter((l: Lottery) => l.active !== false);
  const openLotteries = allLotteries.filter(isLotteryOpenNow);
  const prizeList = prizeListQuery.data || [];

  // Credit from API
  const apiCredit = userQuery.data ? Number(userQuery.data.credit) || 0 : Number(user.credit) || 0;

  const [plays, setPlays] = useState<Play[]>(() => loadDraft());

  // Cargar jugadas copiadas desde la pantalla Tickets (cuando ya hay loterias)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PENDING_COPY_KEY);
      if (!raw) return;
      if (allLotteries.length === 0) return; // esperar listado
      const data = JSON.parse(raw);
      sessionStorage.removeItem(PENDING_COPY_KEY);
      if (Array.isArray(data?.plays) && data.plays.length > 0) {
        setPlays(data.plays.map((p: any) => ({
          id: Math.random().toString(36).substr(2, 9),
          number: String(p.number),
          amount: Number(p.amount),
          type: p.type,
          lotteryId: Number(p.lotteryId),
          lotteryName: p.lotteryName || "",
        })));
        if (data.lotteryId) {
          const lot = allLotteries.find((l) => l.id === Number(data.lotteryId));
          if (lot) setSelectedLotteries([lot]);
        }
      }
    } catch { /* ignore */ }
  }, [allLotteries]);
  const [input, setInput] = useState("");
  const [amount, setAmount] = useState("");
  const [amountPinned, setAmountPinned] = useState(false);
  const [selectedLotteries, setSelectedLotteries] = useState<Lottery[]>([]);
  const [showLotteryModal, setShowLotteryModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [message, setMessage] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [lastTicket, setLastTicket] = useState<any>(null);
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [activeField, setActiveField] = useState<"numero" | "monto">("numero");
  const [showKeypad, setShowKeypad] = useState(true);
  const [userCredit, setUserCredit] = useState<number>(Number(user.credit) || 0);
  const [userCommission] = useState<number>(Number(user.commission) || 0);
  const touchStartY = useRef<number>(0);
  // Cursor position inside the number input for left/right navigation
  const [cursorPos, setCursorPos] = useState<number | null>(null);
  // Double-tap detection for OK button (opens quick menu on second tap)
  const lastOkTapRef = useRef<number>(0);

  // Quick play modal state
  const [showQuickPlay, setShowQuickPlay] = useState(false);
  const [quickType, setQuickType] = useState<"par" | "decimal" | "unidad" | "azar" | "mezclar" | null>(null);
  const [quickDigit, setQuickDigit] = useState("");
  const [quickNumbers, setQuickNumbers] = useState("");
  const [quickCount, setQuickCount] = useState("5");
  const [quickPlayType, setQuickPlayType] = useState<PlayType>("directo");

  // Sync credit from API
  useEffect(() => {
    if (apiCredit !== userCredit) {
      setUserCredit(apiCredit);
    }
  }, [apiCredit]);

  useEffect(() => {
    if (openLotteries.length > 0 && selectedLotteries.length === 0) {
      setSelectedLotteries([openLotteries[0]]);
    }
  }, [openLotteries.length]);

  // Si una loteria seleccionada cierra (llega su hora de cierre), se quita sola de la seleccion.
  useEffect(() => {
    setSelectedLotteries((prev) => {
      const stillOpenIds = new Set(openLotteries.map((l) => l.id));
      const filtered = prev.filter((l) => stillOpenIds.has(l.id));
      if (filtered.length !== prev.length) {
        showMsg("Una loteria selecionada cerro y fue quitada de la seleccion");
      }
      return filtered;
    });
  }, [openLotteries.map((l) => l.id).join(",")]);

  // Refresca el reloj cada 15s para que el cierre de loterias se detecte a tiempo, no solo cuando otra query refresca.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => forceTick((t) => t + 1), 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => { saveDraft(plays); }, [plays]);

  const total = plays.reduce((sum, p) => sum + p.amount, 0);
  const minRemainingMins = selectedLotteries.length > 0
    ? Math.min(...selectedLotteries.map((l) => getMinutesRemaining(l) ?? Infinity))
    : null;
  const minRemainingLabel = minRemainingMins === null || !Number.isFinite(minRemainingMins)
    ? null
    : minRemainingMins >= 60
      ? `${Math.floor(minRemainingMins / 60)}h ${minRemainingMins % 60}m`
      : `${minRemainingMins}m`;
  const showMsg = useCallback((msg: string) => { setMessage(msg); setTimeout(() => setMessage(""), 3000); }, []);

  const getPotentialPrize = useCallback((play: Play): string => {
    const prize = prizeList.find((p: any) => p.playType === play.type);
    if (!prize) return "0";
    const amt = play.amount;
    let mult = 0;
    switch (play.type) {
      case "directo": mult = Number(prize.firstPrizeMultiplier || 0); break;
      case "pale": mult = Number(prize.paleFirstSecondMultiplier || 0); break;
      case "terna": mult = Number(prize.fixedMultiplier || 0); break;
      case "cuatrena": mult = Number(prize.fixedMultiplier || 0); break;
      case "tripleta": mult = Number(prize.fixedMultiplier || 0); break;
    }
    return formatMoney(amt * mult);
  }, [prizeList]);

  function getMaxBetLimit(): number {
    try { return Number((configQuery.data ? JSON.parse(configQuery.data) : {}).maxBetAmount) || 0; } catch { return 0; }
  }

  interface LimitEntry {
    id: number; type: "global" | "user"; userId: number | null; lotteryId: number | null;
    playType: string | null; maxAmount: number; blockedNumbers: string[]; active: boolean;
  }

  function normalizeBlockedNumber(number: string, type: string): string {
    const digits = number.replace(/[^0-9]/g, "");
    if ((type === "pale" || type === "terna" || type === "cuatrena") && digits.length === 4 && !number.includes("+")) {
      return [digits.slice(0, 2), digits.slice(2, 4)].sort().join("+");
    }
    if ((type === "tripleta") && digits.length === 6 && !number.includes("+")) {
      return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6)].sort().join("+");
    }
    const parts = number.split("+").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) return parts.sort().join("+");
    return number.trim();
  }

  function checkPlayLimit(lotteryId: number, playType: string, number: string, amount: number, userId: number, currentPlays: Play[], excludeId?: string): { allowed: boolean; reason?: string } {
    const limitsRaw = limitsConfigQuery.data;
    if (!limitsRaw) return { allowed: true };
    let limits: LimitEntry[] = [];
    try { limits = JSON.parse(limitsRaw); } catch { return { allowed: true }; }
    const normalizedNum = normalizeBlockedNumber(number, playType);
    const applicable = limits.filter((l) => {
      if (!l.active) return false;
      if (l.type === "user" && l.userId !== userId) return false;
      if (l.lotteryId !== null && l.lotteryId !== lotteryId) return false;
      if (l.playType !== null && l.playType !== playType) return false;
      return true;
    });
    for (const limit of applicable) {
      for (const blocked of limit.blockedNumbers) {
        const normalizedBlocked = normalizeBlockedNumber(blocked, playType);
        if (normalizedNum === normalizedBlocked) {
          return { allowed: false, reason: `"${number}" esta BLOQUEADO` };
        }
      }
    }
    for (const limit of applicable) {
      if (limit.maxAmount > 0) {
        // Suma lo que ya hay en el carrito actual para esta misma combinacion
        // (normalizada: 25+18 y 18+25 cuentan como el mismo pale), no solo el monto nuevo.
        const currentTotal = currentPlays
          .filter((p) => p.id !== excludeId && p.lotteryId === lotteryId && p.type === playType && normalizeBlockedNumber(p.number, playType) === normalizedNum)
          .reduce((sum, p) => sum + p.amount, 0);
        const wouldBe = currentTotal + amount;
        if (wouldBe > limit.maxAmount) {
          return { allowed: false, reason: `Limite $${formatMoney(limit.maxAmount)} para ${playType}. Ya tiene $${formatMoney(currentTotal)} + $${formatMoney(amount)} = $${formatMoney(wouldBe)}` };
        }
      }
    }
    return { allowed: true };
  }

  interface SpecificLimit { lotteryId: number; playType: string; numberCombo: string; maxAmount: string; }

  function checkCombinedLimit(lotteryId: number, playType: string, number: string, amount: number, userId: number, currentPlays: Play[], excludeId?: string): { allowed: boolean; reason?: string } {
    const generalCheck = checkPlayLimit(lotteryId, playType, number, amount, userId, currentPlays, excludeId);
    if (!generalCheck.allowed) return generalCheck;

    if (playType === "pale" || playType === "tripleta") {
      const normalizedNum = normalizeBlockedNumber(number, playType);
      const specificLimits: SpecificLimit[] = playLimitsQuery.data || [];
      const match = specificLimits.find(
        (l) => l.lotteryId === lotteryId && l.playType === playType && normalizeBlockedNumber(l.numberCombo, playType) === normalizedNum
      );
      if (match) {
        const maxAmount = Number(match.maxAmount);
        const currentTotal = currentPlays
          .filter((p) => p.id !== excludeId && p.lotteryId === lotteryId && p.type === playType && normalizeBlockedNumber(p.number, playType) === normalizedNum)
          .reduce((sum, p) => sum + p.amount, 0);
        const wouldBe = currentTotal + amount;
        if (wouldBe > maxAmount) {
          return { allowed: false, reason: `Limite $${formatMoney(maxAmount)} para ${normalizedNum}. Ya tiene $${formatMoney(currentTotal)} + $${formatMoney(amount)} = $${formatMoney(wouldBe)}` };
        }
      }
    }
    return { allowed: true };
  }

  const normalizePlayNumber = useCallback((number: string, type: PlayType): string => {
    const digits = number.replace(/[^0-9]/g, "");
    if (type === "pale") {
      if (digits.length === 4 && !number.includes("+")) {
        const parts = [digits.slice(0, 2), digits.slice(2, 4)];
        return parts.sort().join("+");
      }
      const parts = number.split("+").map((p) => p.trim()).filter(Boolean);
      if (parts.length === 2) return parts.sort().join("+");
    }
    if (type === "tripleta") {
      if (digits.length === 6 && !number.includes("+")) {
        const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6)];
        return parts.sort().join("+");
      }
      const parts = number.split("+").map((p) => p.trim()).filter(Boolean);
      if (parts.length === 3) return parts.sort().join("+");
    }
    return number;
  }, []);

  const addPlay = useCallback(() => {
    if (selectedLotteries.length === 0) { showMsg("Seleccione al menos una loteria"); return; }
    const playCost = Number(amount) || 0;
    if (playCost > 0 && playCost > userCredit) { showMsg(`Credito insuficiente. Disponible: $${formatMoney(userCredit)}`); return; }
    if (!input.trim()) { showMsg("Ingrese un numero"); return; }
    if (!amount || Number(amount) <= 0) { showMsg("Ingrese monto valido"); return; }

    const trimmed = input.trim();
    // Cada segmento separado por + es una jugada independiente.
    // "12+34" = 2 directos (NO un pale). Pale = 4 cifras juntas "1234".
    const chainParts = trimmed.split("+").map((s) => s.trim()).filter(Boolean);

    setPlays((prevPlays) => {
      const newPlays = [...prevPlays];
      for (const lottery of selectedLotteries) {
        for (const part of chainParts) {
          const partCombo = part.endsWith("/");
          const partBase = partCombo ? part.slice(0, -1) : part;
          const cleanDigits = partBase.replace(/[^0-9]/g, "");
          let combosToAdd: { number: string; type: PlayType }[] = [];

          if (partCombo) {
            // / al final del segmento → generar combinaciones
            if (cleanDigits.length === 4) {
              generatePaleCombos(cleanDigits).forEach((combo) => combosToAdd.push({ number: combo.replace(/[^0-9]/g, ""), type: "pale" }));
            } else if (cleanDigits.length >= 2 && cleanDigits.length <= 3) {
              generateDirectoCombos(cleanDigits).forEach((combo) => combosToAdd.push({ number: combo, type: "directo" }));
            } else {
              const detectedType = detectPlayType(partBase);
              if (detectedType === "invalido" as PlayType) { showMsg(`"${part}" no es valido`); continue; }
              const cleanNumber = (detectedType === "pale" || detectedType === "tripleta") ? cleanDigits : partBase.replace(/[^0-9.]/g, "");
              combosToAdd.push({ number: cleanNumber.replace(".", ""), type: detectedType });
            }
          } else {
            // Sin /: tipo por longitud / punto (cuatrena)
            // 2 cifras → directo; 3 → terna; 4 → pale; 6 → tripleta; con . → cuatrena
            const detectedType = detectPlayType(partBase);
            if (detectedType === "invalido" as PlayType) { showMsg(`"${part}" no es valido`); continue; }
            const cleanNumber = (detectedType === "pale" || detectedType === "tripleta")
              ? cleanDigits
              : partBase.replace(/[^0-9]/g, "");
            combosToAdd.push({ number: cleanNumber, type: detectedType });
          }

          for (const combo of combosToAdd) {
            const limitCheck = checkCombinedLimit(lottery.id, combo.type, combo.number, Number(amount), user.id, newPlays);
            if (!limitCheck.allowed) { showMsg(limitCheck.reason || "No permitido"); continue; }

            const existingIndex = newPlays.findIndex(
              (p) => p.type === combo.type && p.lotteryId === lottery.id && normalizePlayNumber(p.number, p.type) === normalizePlayNumber(combo.number, combo.type)
            );
            const limit = getMaxBetLimit();
            if (existingIndex >= 0) {
              const currentAmt = newPlays[existingIndex].amount;
              const newAmt = currentAmt + Number(amount);
              if (limit > 0 && newAmt > limit) {
                newPlays[existingIndex] = { ...newPlays[existingIndex], amount: limit };
                showMsg(`Limite de $${limit} alcanzado`);
              } else {
                newPlays[existingIndex] = { ...newPlays[existingIndex], amount: newAmt };
              }
            } else if (limit > 0 && Number(amount) > limit) {
              newPlays.push({ id: Math.random().toString(36).substr(2, 9), number: combo.number, amount: limit, type: combo.type, lotteryId: lottery.id, lotteryName: lottery.name });
              showMsg(`Monto limitado a $${limit}`);
            } else {
              newPlays.push({ id: Math.random().toString(36).substr(2, 9), number: combo.number, amount: Number(amount), type: combo.type, lotteryId: lottery.id, lotteryName: lottery.name });
            }
          }
        }
      }
      return newPlays;
    });
    setInput("");
    setCursorPos(0);
    if (!amountPinned) setAmount("");
    // Después de agregar jugada, el foco vuelve siempre a la casilla de números
    setActiveField("numero");
  }, [input, amount, amountPinned, selectedLotteries, showMsg, normalizePlayNumber, userCredit, user.id]);

  const handleKeypad = useCallback((key: string) => {
    if (activeField === "monto") {
      if (amountPinned && amount.trim() !== "") {
        showMsg("Monto fijado. Toca el alfiler para poder cambiarlo.");
        return;
      }
      // Solo números enteros en el monto (sin punto decimal)
      if (key === "C") setAmount("");
      else if (key === "DEL") setAmount((prev) => prev.slice(0, -1));
      else if (key === "." || key === "+" || key === "/") return; // ignorar
      else if (/^\d$/.test(key)) setAmount((prev) => prev + key);
    } else {
      // Campo números: soporta inserción en posición de cursor + navegación
      if (key === "C") {
        setInput("");
        setCursorPos(0);
        return;
      }
      if (key === "LEFT") {
        setCursorPos((pos) => {
          const p = pos === null ? input.length : pos;
          return Math.max(0, p - 1);
        });
        return;
      }
      if (key === "RIGHT") {
        setCursorPos((pos) => {
          const p = pos === null ? input.length : pos;
          return Math.min(input.length, p + 1);
        });
        return;
      }
      if (key === "DEL") {
        setInput((prev) => {
          const p = cursorPos === null ? prev.length : cursorPos;
          if (p <= 0) return prev;
          const next = prev.slice(0, p - 1) + prev.slice(p);
          setCursorPos(p - 1);
          return next;
        });
        return;
      }
      // Insertar carácter en la posición del cursor
      const insertChar = (ch: string) => {
        setInput((prev) => {
          const p = cursorPos === null ? prev.length : cursorPos;
          const next = prev.slice(0, p) + ch + prev.slice(p);
          setCursorPos(p + ch.length);
          return next;
        });
      };
      if (key === "+" || key === "." || key === "/") insertChar(key);
      else if (/^\d$/.test(key)) insertChar(key);
    }
  }, [activeField, input, amount, amountPinned, showMsg, cursorPos]);

  const deletePlay = useCallback((id: string) => { setPlays((prev) => prev.filter((p) => p.id !== id)); }, []);
  const startEdit = useCallback((play: Play) => { setEditingId(play.id); setEditAmount(play.amount.toString()); }, []);
  const saveEdit = useCallback((id: string) => {
    const newAmount = Number(editAmount) || 0;
    const editingPlay = plays.find((p) => p.id === id);
    if (!editingPlay) { setEditingId(null); return; }

    const limitCheck = checkCombinedLimit(editingPlay.lotteryId, editingPlay.type, editingPlay.number, newAmount, user.id, plays, id);
    if (!limitCheck.allowed) {
      showMsg(limitCheck.reason || "Monto no permitido");
      setEditingId(null);
      return;
    }

    const limit = getMaxBetLimit();
    if (limit > 0 && newAmount > limit) {
      setPlays((prev) => prev.map((p) => p.id === id ? { ...p, amount: limit } : p));
      showMsg(`Monto limitado a $${limit}`);
    } else {
      setPlays((prev) => prev.map((p) => p.id === id ? { ...p, amount: newAmount } : p));
    }
    setEditingId(null);
  }, [editAmount, showMsg, plays, user.id]);
  const clearAll = useCallback(() => { setPlays([]); setInput(""); clearDraft(); }, []);

  // ─── Cambiar / Duplicar loteria de una jugada ya en pantalla ─────
  const [lotteryActionFor, setLotteryActionFor] = useState<{ playId: string; mode: "change" | "duplicate" } | null>(null);
  const [lotteryActionSelection, setLotteryActionSelection] = useState<number[]>([]);

  const openLotteryAction = useCallback((play: Play, mode: "change" | "duplicate") => {
    setLotteryActionFor({ playId: play.id, mode });
    setLotteryActionSelection(mode === "change" ? [play.lotteryId] : []);
  }, []);

  const toggleLotteryActionSelection = useCallback((id: number, mode: "change" | "duplicate") => {
    setLotteryActionSelection((prev) => {
      if (mode === "change") return [id];
      return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
    });
  }, []);

  const applyLotteryAction = useCallback(() => {
    if (!lotteryActionFor) return;
    const play = plays.find((p) => p.id === lotteryActionFor.playId);
    if (!play) { setLotteryActionFor(null); return; }

    if (lotteryActionFor.mode === "change") {
      const targetId = lotteryActionSelection[0];
      const target = openLotteries.find((l) => l.id === targetId);
      if (!target) { showMsg("Seleccione una loteria"); return; }
      const limitCheck = checkCombinedLimit(target.id, play.type, play.number, play.amount, user.id, plays.filter((p) => p.id !== play.id));
      if (!limitCheck.allowed) { showMsg(limitCheck.reason || "No permitido"); return; }
      setPlays((prev) => prev.map((p) => p.id === play.id ? { ...p, lotteryId: target.id, lotteryName: target.name } : p));
    } else {
      if (lotteryActionSelection.length === 0) { showMsg("Seleccione al menos una loteria"); return; }
      setPlays((prev) => {
        const additions: Play[] = [];
        for (const targetId of lotteryActionSelection) {
          const target = openLotteries.find((l) => l.id === targetId);
          if (!target) continue;
          const limitCheck = checkCombinedLimit(target.id, play.type, play.number, play.amount, user.id, [...prev, ...additions]);
          if (!limitCheck.allowed) { showMsg(limitCheck.reason || `No permitido en ${target.name}`); continue; }
          additions.push({ ...play, id: Math.random().toString(36).substr(2, 9), lotteryId: target.id, lotteryName: target.name });
        }
        return [...prev, ...additions];
      });
    }
    setLotteryActionFor(null);
    setLotteryActionSelection([]);
  }, [lotteryActionFor, lotteryActionSelection, plays, openLotteries, user.id, showMsg]);

  // ─── Quick Play Functions ────────────────────────────────────────
  const executeQuickPlay = useCallback((newPlays: Play[]) => {
    if (selectedLotteries.length === 0) { showMsg("Seleccione loteria primero"); return; }
    const amt = Number(amount) || 0;
    if (amt <= 0) { showMsg("Ingrese monto primero"); return; }
    const totalCost = newPlays.length * amt;
    if (totalCost > userCredit) { showMsg(`Credito insuficiente. Necesita: $${formatMoney(totalCost)}`); return; }

    setPlays((prev) => {
      const all = [...prev];
      for (const play of newPlays) {
        const existingIndex = all.findIndex(
          (p) => p.type === play.type && p.lotteryId === selectedLotteries[0].id && normalizeCombo(p.number) === normalizeCombo(play.number)
        );
        if (existingIndex >= 0) {
          all[existingIndex] = { ...all[existingIndex], amount: all[existingIndex].amount + amt };
        } else {
          all.push({ ...play, amount: amt, lotteryId: selectedLotteries[0].id, lotteryName: selectedLotteries[0].name });
        }
      }
      return all;
    });
    setShowQuickPlay(false);
    setQuickType(null);
    showMsg(`${newPlays.length} jugadas agregadas!`);
  }, [selectedLotteries, amount, userCredit, showMsg]);

  const handlePar = useCallback(() => {
    if (selectedLotteries.length === 0) return;
    const plays = generateParPlays(selectedLotteries[0].id, selectedLotteries[0].name, 0);
    executeQuickPlay(plays);
  }, [selectedLotteries, executeQuickPlay]);

  const handleDecimal = useCallback(() => {
    if (selectedLotteries.length === 0 || quickDigit === "") return;
    const plays = generateDecimalPlays(Number(quickDigit), selectedLotteries[0].id, selectedLotteries[0].name, 0);
    executeQuickPlay(plays);
    setQuickDigit("");
  }, [selectedLotteries, quickDigit, executeQuickPlay]);

  const handleUnidad = useCallback(() => {
    if (selectedLotteries.length === 0 || quickDigit === "") return;
    const plays = generateUnidadPlays(Number(quickDigit), selectedLotteries[0].id, selectedLotteries[0].name, 0);
    executeQuickPlay(plays);
    setQuickDigit("");
  }, [selectedLotteries, quickDigit, executeQuickPlay]);

  const handleAzar = useCallback(() => {
    if (selectedLotteries.length === 0) return;
    const count = Number(quickCount) || 5;
    const plays = generateAzarPlays(quickPlayType, count, selectedLotteries[0].id, selectedLotteries[0].name, 0);
    executeQuickPlay(plays);
  }, [selectedLotteries, quickCount, quickPlayType, executeQuickPlay]);

  const handleMezclar = useCallback(() => {
    if (selectedLotteries.length === 0 || !quickNumbers.trim()) return;
    const nums = quickNumbers.split(/[+,\s]+/).map(s => s.trim()).filter(s => s.length === 2 && /^\d+$/.test(s));
    if (nums.length < 2) { showMsg("Ingrese al menos 2 numeros de 2 cifras"); return; }
    if (quickPlayType !== "pale" && quickPlayType !== "tripleta") { showMsg("Seleccione pale o tripleta"); return; }
    const plays = generateMezclarPlays(quickPlayType, nums, selectedLotteries[0].id, selectedLotteries[0].name, 0);
    executeQuickPlay(plays);
    setQuickNumbers("");
  }, [selectedLotteries, quickNumbers, quickPlayType, executeQuickPlay, showMsg]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => { touchStartY.current = e.touches[0].clientY; }, []);
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const diff = e.changedTouches[0].clientY - touchStartY.current;
    if (diff > 50) setShowKeypad(false);
    else if (diff < -50) setShowKeypad(true);
  }, []);

  const generateQR = async (data: string): Promise<string> => {
    try { return await QRCode.toDataURL(data, { width: 200, margin: 2 }); } catch { return ""; }
  };

  const buildPDF = async (ticketData: any): Promise<jsPDF> => {
    const lang = user.language || "es";
    const playCount = ticketData.plays?.length || 1;
    const doc = new jsPDF({ unit: "mm", format: [80, 155 + playCount * 9] });
    const pageWidth = 80;
    let y = 8;
    doc.setFillColor(22, 163, 74);
    doc.rect(0, 0, pageWidth, 24, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16); doc.setFont("helvetica", "bold");
    doc.text(ticketData.groupName || "BANCA VICTORIA", pageWidth / 2, y + 6, { align: "center" });
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.text(t(lang, "ticket_title") || "Gracias por jugar con nosotros!", pageWidth / 2, y + 13, { align: "center" });
    y = 30;
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    const infoRows: [string, string][] = [
      [`${t(lang, "ticket_no") || "Ticket No"}:`, ticketData.code],
      [`${t(lang, "ticket_date") || "Fecha"}:`, ticketData.date],
      [`${t(lang, "ticket_time") || "Hora"}:`, ticketData.time],
      [`${t(lang, "ticket_terminal") || "Terminal"}:`, ticketData.terminal],
    ];
    if (ticketData.groupName) infoRows.push([`${t(lang, "ticket_group") || "Grupo"}:`, ticketData.groupName]);
    infoRows.push([`${t(lang, "ticket_lottery") || "Loteria"}:`, ticketData.lottery]);
    for (const [label, value] of infoRows) {
      doc.setTextColor(100, 100, 100);
      doc.setFont("helvetica", "normal");
      doc.text(label, 5, y);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.text(String(value), pageWidth - 5, y, { align: "right" });
      y += 5.8;
    }
    y += 3;
    doc.setDrawColor(22, 163, 74);
    doc.line(5, y - 1, pageWidth - 5, y - 1);
    doc.setTextColor(22, 163, 74);
    doc.setFontSize(12); doc.setFont("helvetica", "bold");
    doc.text(t(lang, "ticket_plays") || "JUGADAS", 5, y + 4); y += 8;
    doc.setFontSize(8); doc.setTextColor(100, 100, 100);
    doc.text("NUMERO", 5, y);
    doc.text("TIPO", 32, y);
    doc.text("MONTO", pageWidth - 5, y, { align: "right" });
    y += 5;
    doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    ticketData.plays.forEach((play: any) => {
      doc.setTextColor(0, 0, 0);
      doc.text(`${displayNumber(play.number)}`, 5, y);
      doc.text(`${String(play.type).toUpperCase()}`, 32, y);
      doc.text(`$${formatMoney(play.amount)}`, pageWidth - 5, y, { align: "right" });
      y += 7.5;
    });
    y += 2;
    doc.setDrawColor(22, 163, 74);
    doc.line(5, y - 3, pageWidth - 5, y - 3);
    doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(`${t(lang, "ticket_total") || "TOTAL"}:`, 5, y + 5);
    doc.text(`$${formatMoney(Number(ticketData.total))}`, pageWidth - 5, y + 5, { align: "right" });
    y += 14;
    const qrData = `TICKET:${ticketData.code}|DATE:${ticketData.date}|TIME:${ticketData.time}|TERMINAL:${ticketData.terminal}|TOTAL:${ticketData.total}`;
    const qrDataUrl = await generateQR(qrData);
    if (qrDataUrl) { doc.addImage(qrDataUrl, "PNG", (pageWidth - 32) / 2, y, 32, 32); y += 36; }
    doc.setFontSize(8); doc.setFont("helvetica", "bold");
    doc.setTextColor(40, 40, 40);
    doc.text("Nous payons les tickets. Pas d'erreurs.", pageWidth / 2, y, { align: "center" }); y += 4.5;
    doc.text("Verifiez bien vos jeux. Bonne chance.", pageWidth / 2, y, { align: "center" });
    return doc;
  };

  const downloadPDF = async (ticketData: any) => {
    const doc = await buildPDF(ticketData);
    doc.save(`${ticketData.code}.pdf`);
  };

  const generatePDFDataUrl = async (ticketData: any): Promise<string> => {
    const doc = await buildPDF(ticketData);
    return doc.output("datauristring");
  };

  const doSaveTicket = useCallback(async (): Promise<any | null> => {
    if (selectedLotteries.length === 0) return null;
    const netDeduction = calculateNetDeduction(total, userCommission);
    if (netDeduction > userCredit) { showMsg(`Credito insuficiente. Necesita: $${formatMoney(netDeduction)}`); return null; }

    const newCredit = userCredit - netDeduction;
    const code = generateTicketCode();
    const now = new Date();
    const date = now.toLocaleDateString();
    const time = now.toLocaleTimeString();
    const lotteryNames = selectedLotteries.map((l) => l.name).join(", ");
    const groupName = user.groupId ? ((groupListQuery.data || []).find((g: any) => g.id === user.groupId)?.name || "") : "";

    const ticketData: any = {
      id: Date.now(), code, userId: user.id,
      lotteryId: selectedLotteries[0].id,
      total: formatMoney(total), status: "active", date, time,
      createdAt: now.toISOString(),
      netDeduction: netDeduction.toFixed(2),
      commission: String(userCommission),
      plays: plays.map((p) => ({ ...p, id: Math.random().toString(36).substr(2, 9) })),
      terminal: user.bankNumber, seller: user.name, lottery: lotteryNames, groupName,
    };

    try {
      const pdfDataUrl = await generatePDFDataUrl(ticketData);
      ticketData.pdfDataUrl = pdfDataUrl;
    } catch { /* PDF failed */ }

    try {
      const playList = ticketData.plays.map((p: any) => ({
        number: p.number,
        amount: String(p.amount),
        type: p.type,
        lotteryId: p.lotteryId,
      }));
      const saved = await createTicketMut.mutateAsync({
        code,
        userId: user.id,
        lotteryId: selectedLotteries[0].id,
        total: formatMoney(total),
        commission: String(userCommission),
        netDeduction: String(netDeduction),
        playList,
      });
      setUserCredit(Number(saved.credit));
    } catch (err: any) {
      showMsg("Error al guardar ticket: " + (err.message || "Verifique conexion"));
      return null;
    }

    clearDraft();
    setPlays([]);
    setLastTicket(ticketData);
    setMessage(`Ticket ${code} guardado! -$${formatMoney(netDeduction)}`);
    setTimeout(() => setMessage(""), 5000);
    return ticketData;
  }, [plays, selectedLotteries, total, user, userCredit, userCommission, createTicketMut, showMsg, groupListQuery.data]);

  const confirmSave = useCallback(async () => {
    const ticketData = await doSaveTicket();
    setShowConfirmModal(false);
    if (ticketData) setShowTicketModal(true);
  }, [doSaveTicket]);

  const shareFromPreview = useCallback(async () => {
    const ticketData = await doSaveTicket();
    setShowConfirmModal(false);
    if (ticketData) {
      setShowTicketModal(true);
      await shareWhatsAppTicket(ticketData);
    }
  }, [doSaveTicket]);

  const openTicketPreview = useCallback(() => {
    if (plays.length === 0) { showMsg("Agregue jugadas primero"); return; }
    setShowConfirmModal(true);
  }, [plays.length, showMsg]);


  const buildTicketImageFromData = async (ticket: any): Promise<Blob | null> => {
    try {
      const groupName = ticket.groupName || "BANCA VICTORIA";
      const plays = ticket.plays || [];
      const W = 480;
      const rowH = 36;
      const H = 100 + 180 + Math.max(plays.length, 1) * rowH + 50 + 220;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#16a34a";
      ctx.fillRect(0, 0, W, 100);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 34px Helvetica, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(groupName, W / 2, 44);
      ctx.font = "18px Helvetica, Arial, sans-serif";
      ctx.fillText("Gracias por jugar con nosotros!", W / 2, 74);
      let y = 130;
      const infoRows: [string, string][] = [
        ["Ticket No:", ticket.code],
        ["Fecha:", ticket.date],
        ["Hora:", ticket.time],
        ["Terminal:", ticket.terminal],
        ["Grupo:", groupName],
        ["Loteria:", ticket.lottery],
      ];
      for (const [label, value] of infoRows) {
        ctx.font = "16px Helvetica, Arial, sans-serif";
        ctx.fillStyle = "#6b7280";
        ctx.textAlign = "left";
        ctx.fillText(label, 24, y);
        ctx.font = "bold 18px Helvetica, Arial, sans-serif";
        ctx.fillStyle = label.startsWith("Loteria") ? "#15803d" : "#000000";
        ctx.textAlign = "right";
        ctx.fillText(String(value ?? ""), W - 24, y);
        y += 26;
      }
      y += 12;
      ctx.fillStyle = "#15803d";
      ctx.font = "bold 20px Helvetica, Arial, sans-serif";
      ctx.fillText("JUGADAS", 24, y); y += 10;
      ctx.strokeStyle = "#16a34a";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(24, y); ctx.lineTo(W - 24, y); ctx.stroke(); y += 28;
      ctx.fillStyle = "#000000";
      ctx.font = "bold 22px Helvetica, Arial, sans-serif";
      for (const p of plays) {
        ctx.textAlign = "left"; ctx.fillText(displayNumber(String(p.number)), 24, y);
        ctx.textAlign = "center"; ctx.fillText(String(p.type).toUpperCase(), W / 2, y);
        ctx.textAlign = "right"; ctx.fillText(`$${formatMoney(p.amount)}`, W - 24, y);
        y += rowH;
      }
      y += 6;
      ctx.strokeStyle = "#16a34a";
      ctx.beginPath(); ctx.moveTo(24, y); ctx.lineTo(W - 24, y); ctx.stroke(); y += 32;
      ctx.fillStyle = "#000000";
      ctx.font = "bold 26px Helvetica, Arial, sans-serif";
      ctx.textAlign = "left"; ctx.fillText("TOTAL:", 24, y);
      ctx.textAlign = "right"; ctx.fillText(`$${formatMoney(ticket.total)}`, W - 24, y);
      y += 44;
      const qrData = `TICKET:${ticket.code}|DATE:${ticket.date}|TIME:${ticket.time}|TERMINAL:${ticket.terminal}|TOTAL:${ticket.total}`;
      const qrDataUrl = await generateQR(qrData);
      if (qrDataUrl) {
        const img = new Image();
        await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(); img.src = qrDataUrl; });
        ctx.drawImage(img, (W - 130) / 2, y, 130, 130);
        y += 146;
      }
      ctx.fillStyle = "#374151";
      ctx.font = "14px Helvetica, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Escanea para verificar", W / 2, y); y += 20;
      ctx.fillStyle = "#111827";
      ctx.font = "bold 14px Helvetica, Arial, sans-serif";
      ctx.fillText("Nous payons les tickets. Pas d'erreurs.", W / 2, y); y += 18;
      ctx.fillText("Verifiez bien vos jeux. Bonne chance.", W / 2, y);
      return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png", 0.95));
    } catch { return null; }
  };

  const shareWhatsAppTicket = useCallback(async (ticketOverride?: any) => {
    const ticket = ticketOverride || lastTicket;
    if (!ticket) { showMsg("Guarde un ticket primero"); return; }

    const groupName = user.groupId ? ((groupListQuery.data || []).find((g: any) => g.id === user.groupId)?.name || "") : "";
    const textMsg = formatTicketShareText({
      groupName: groupName || "BANCA VICTORIA",
      code: ticket.code,
      date: ticket.date || new Date().toLocaleDateString(),
      time: ticket.time || new Date().toLocaleTimeString(),
      terminal: ticket.terminal || user.bankNumber || "-",
      lottery: ticket.lottery || "",
      plays: ticket.plays || [],
      total: ticket.total,
    });
    const mode = (() => {
      try {
        const v = localStorage.getItem("bv_tickets_filter") || "pdf";
        if (v === "open" || v === "img") return "img" as const;
        return "pdf" as const;
      } catch { return "pdf" as const; }
    })();

    try {
      let file: File | null = null;
      let url: string | null = null;
      if (mode === "img") {
        const blob = await buildTicketImageFromData(ticket);
        if (blob) {
          file = new File([blob], `Ticket-${ticket.code}.png`, { type: "image/png" });
          url = URL.createObjectURL(blob);
        }
      }
      if (!file) {
        const doc = await buildPDF(ticket);
        const pdfBlob = doc.output("blob");
        file = new File([pdfBlob], `Ticket-${ticket.code}.pdf`, { type: "application/pdf" });
        url = URL.createObjectURL(pdfBlob);
      }

      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `Ticket ${ticket.code}`,
          });
          return;
        } catch (err: any) {
          if (err?.name === "AbortError") return;
        }
      }
      // Solo vista previa del archivo, sin texto duplicado
      if (url) {
        window.open(url, "_blank");
        return;
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
    }

    // Solo si no hay archivo
    window.open(`https://wa.me/?text=${encodeURIComponent(textMsg)}`, "_blank");
  }, [lastTicket, showMsg, user, groupListQuery.data]);

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-1.5 bg-gradient-to-r from-[var(--bv-primary)] to-[var(--bv-primary-dark)] shrink-0 flex items-center gap-2">
        <button onClick={() => setShowLotteryModal(true)} className="flex-1 min-w-0 flex items-center justify-between px-3 py-1.5 bg-white/15 backdrop-blur rounded-lg hover:bg-white/25 transition-all border border-white/20">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Ticket size={16} className="text-white shrink-0" />
            <div className="text-left min-w-0 flex-1">
              <p className="text-sm font-bold text-white truncate">
                {selectedLotteries.length === 0 ? "Seleccionar Loterias" : selectedLotteries.length === 1 ? selectedLotteries[0].name : `${selectedLotteries.length} loterias`}
              </p>
              <p className="text-[10px] text-green-200">
                {selectedLotteries.length > 0 ? selectedLotteries.map((l) => l.name).join(", ") : "Toca para seleccionar"}
              </p>
            </div>
          </div>
          <ChevronDown size={16} className="text-white/80 shrink-0 ml-2" />
        </button>
        {minRemainingLabel && (
          <div className={`shrink-0 px-2.5 py-1.5 rounded-lg text-center ${minRemainingMins !== null && minRemainingMins <= 15 ? "bg-red-500/90 animate-pulse" : "bg-white/15"}`} title="Tiempo restante para el cierre (la loteria seleccionada que cierra mas pronto)">
            <p className="text-[9px] text-green-100 leading-none mb-0.5">Cierra en</p>
            <p className="text-sm font-extrabold text-white leading-none">{minRemainingLabel}</p>
          </div>
        )}
      </div>

      <div className="px-3 py-1 bg-green-800/50 shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Wallet size={12} className="text-green-200" />
          <span className="text-[10px] text-green-200">Credito: <span className="font-bold text-white">${formatMoney(userCredit)}</span></span>
        </div>
        <div className="flex items-center gap-1.5">
          <Percent size={12} className="text-green-200" />
          <span className="text-[10px] text-green-200">Comision: <span className="font-bold text-white">{userCommission}%</span></span>
        </div>
      </div>

      {openLotteries.length === 0 && (
        <div className="mx-3 mt-2 bg-red-600 text-white px-3 py-2 rounded-lg text-sm text-center flex items-center justify-center gap-2">
          <Lock size={14} /> No hay loterias abiertas
        </div>
      )}

      {message && <div className="mx-3 mt-2 bg-[var(--bv-primary)] text-white px-3 py-2 rounded-lg text-sm text-center">{message}</div>}

      <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-2">
        {plays.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 py-8">
            <Ticket size={48} className="mb-3 text-green-200" />
            <p className="text-sm">Sin jugadas. Ingrese numeros y monto.</p>
            <p className="text-xs mt-1 text-gray-300">Use + para cadenas, / para combos</p>
          </div>
        ) : (
          <div className="space-y-2">
            {plays.map((play) => (
              <div key={play.id} className="play-row bg-white rounded-xl border border-[var(--bv-primary-soft)] p-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-lg font-bold text-gray-900">{displayNumber(play.number)}</p>
                    <p className="text-xs text-[var(--bv-primary)] font-semibold uppercase tracking-wide">{play.type} - {play.lotteryName}</p>
                  </div>
                  {editingId === play.id ? (
                    <div className="flex items-center gap-1.5">
                      <input type="number" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} className="w-20 px-2 py-1.5 text-base border border-[var(--bv-primary-soft)] rounded-lg text-right font-bold" autoFocus />
                      <button onClick={() => saveEdit(play.id)} className="p-2 bg-green-100 rounded-lg"><Check size={16} className="text-[var(--bv-primary-dark)]" /></button>
                      <button onClick={() => setEditingId(null)} className="p-2 bg-gray-100 rounded-lg"><X size={16} className="text-gray-600" /></button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="text-right mr-2">
                        <span className="text-lg font-bold text-[var(--bv-primary-dark)]">${formatMoney(play.amount)}</span>
                        <span className="text-[10px] block text-yellow-600 font-medium">Paga: ${getPotentialPrize(play)}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <button onClick={() => startEdit(play)} className="p-1.5 bg-blue-50 rounded-md hover:bg-blue-100"><Edit2 size={14} className="text-blue-600" /></button>
                        <button onClick={() => deletePlay(play.id)} className="p-1.5 bg-red-50 rounded-md hover:bg-red-100"><Trash2 size={14} className="text-red-500" /></button>
                        <button onClick={() => openLotteryAction(play, "change")} title="Cambiar loteria" className="p-1.5 bg-purple-50 rounded-md hover:bg-purple-100"><Repeat size={14} className="text-purple-600" /></button>
                        <button onClick={() => openLotteryAction(play, "duplicate")} title="Duplicar en otra loteria" className="p-1.5 bg-amber-50 rounded-md hover:bg-amber-100"><Copy size={14} className="text-amber-600" /></button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {plays.length > 0 && (
        <div className="px-3 py-2 bg-gradient-to-r from-[var(--bv-primary)] to-[var(--bv-primary-dark)] text-white shrink-0">
          <div className="flex items-center justify-between">
            <button onClick={clearAll} className="flex items-center gap-1.5 text-xs text-red-200"><Trash2 size={14} /> Limpiar</button>
            <p className="text-[10px] text-green-200">{plays.length} jugada(s)</p>
            <p className="text-xl font-extrabold">${formatMoney(total)}</p>
          </div>
          {userCommission > 0 && (
            <div className="flex items-center justify-between mt-1 pt-1 border-t border-white/20">
              <p className="text-[10px] text-green-200">Desc. comision ({userCommission}%):</p>
              <p className="text-[10px] font-bold text-yellow-200">-${formatMoney(total * (userCommission / 100))}</p>
            </div>
          )}
        </div>
      )}

      <div className="px-3 pt-2 pb-1 bg-white border-t border-green-100 shrink-0 space-y-1.5">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <div
              className={`w-full px-3 py-2 text-base font-bold border-2 rounded-xl outline-none bg-[var(--bv-primary-light)]/50 text-gray-900 cursor-pointer transition-all min-h-[42px] flex items-center ${activeField === "numero" ? "border-[var(--bv-primary)] ring-2 ring-[var(--bv-primary-soft)]" : "border-[var(--bv-primary-soft)]"}`}
              onClick={() => { setActiveField("numero"); setShowKeypad(true); setCursorPos(input.length); }}
            >
              <span className="break-all min-h-[1.25rem]">
                {cursorPos !== null && activeField === "numero" ? (
                  <>
                    <span>{input.slice(0, cursorPos)}</span>
                    <span className="inline-block w-0.5 h-5 bg-[var(--bv-primary)] align-middle animate-pulse mx-px" />
                    <span>{input.slice(cursorPos)}</span>
                  </>
                ) : (
                  input
                )}
              </span>
            </div>

          </div>
          <div className="w-28 relative">
            <input type="text" value={amount} readOnly inputMode="none" className={`w-full px-3 py-2 pr-7 text-base font-bold border-2 rounded-xl outline-none bg-[var(--bv-primary-light)]/50 text-[var(--bv-primary-dark)] placeholder-green-300 text-right cursor-pointer transition-all ${activeField === "monto" ? "border-[var(--bv-primary)] ring-2 ring-[var(--bv-primary-soft)]" : "border-[var(--bv-primary-soft)]"}`} placeholder="Monto" onClick={() => { setActiveField("monto"); setShowKeypad(true); }} />
            <button
              onClick={() => setAmountPinned((p) => !p)}
              title={amountPinned ? "Monto fijado: no se puede cambiar hasta que lo desfijes. Toca para desfijar." : "Monto libre. Toca para fijar."}
              className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded ${amountPinned ? "text-[var(--bv-primary)]" : "text-gray-300"}`}
            >
              {amountPinned ? <Pin size={14} /> : <PinOff size={14} />}
            </button>
          </div>
        </div>
      </div>

      {showKeypad && (
        <div className="shrink-0 bg-white px-3 pb-1 pt-0 cursor-grab active:cursor-grabbing select-none" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onClick={() => setShowKeypad(false)}>
          <div className="flex flex-col items-center gap-0.5">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
            <span className="text-[9px] text-gray-400">Desliza o toca para ocultar</span>
          </div>
        </div>
      )}

      {!showKeypad && (
        <div className="shrink-0 bg-white px-3 py-1 border-t border-green-100">
          <button onClick={() => setShowKeypad(true)} className="w-full flex items-center justify-center gap-2 py-2 bg-[var(--bv-primary-light)] rounded-xl border border-[var(--bv-primary-soft)] hover:bg-[var(--bv-primary-soft)] transition-all">
            <Keyboard size={16} className="text-[var(--bv-primary)]" />
            <ChevronUp size={14} className="text-[var(--bv-primary)]" />
            <span className="text-xs font-semibold text-[var(--bv-primary-dark)]">Mostrar Teclado</span>
          </button>
        </div>
      )}

      {showKeypad && (
        <div className="px-3 pb-1.5 pt-1 bg-white shrink-0 transition-all" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          <div className="grid grid-cols-4 gap-1">
            <button onClick={() => handleKeypad("1")} className="keypad-btn">1</button>
            <button onClick={() => handleKeypad("2")} className="keypad-btn">2</button>
            <button onClick={() => handleKeypad("3")} className="keypad-btn">3</button>
            {/* Navegación del cursor en casilla de números */}
            <button onClick={() => handleKeypad("LEFT")} className="keypad-btn text-xs" title="Mover cursor izquierda">◀</button>
            <button onClick={() => handleKeypad("4")} className="keypad-btn">4</button>
            <button onClick={() => handleKeypad("5")} className="keypad-btn">5</button>
            <button onClick={() => handleKeypad("6")} className="keypad-btn">6</button>
            <button onClick={() => handleKeypad("RIGHT")} className="keypad-btn text-xs" title="Mover cursor derecha">▶</button>
            <button onClick={() => handleKeypad("7")} className="keypad-btn">7</button>
            <button onClick={() => handleKeypad("8")} className="keypad-btn">8</button>
            <button onClick={() => handleKeypad("9")} className="keypad-btn">9</button>
            <button onClick={() => handleKeypad("/")} className="keypad-btn-green text-sm" title="Combinar">/</button>
            <button onClick={() => handleKeypad("C")} className="keypad-btn-red">C</button>
            <button onClick={() => handleKeypad("0")} className="keypad-btn">0</button>
            <button onClick={() => handleKeypad("DEL")} className="keypad-btn-red text-xs">DEL</button>
            <button onClick={() => handleKeypad(".")} className="keypad-btn-green text-lg font-bold" title="Punto (4 cifras)">.</button>
            <button onClick={() => handleKeypad("+")} className="keypad-btn-green text-lg font-bold" title="Agregar separador +">+</button>
            {/* Rapida y Compartir: mismo tamaño que DEL, solo símbolo */}
            <button onClick={() => setShowQuickPlay(true)} className="keypad-btn-green flex items-center justify-center" title="Rápida"><Zap size={16} /></button>
            <button onClick={openTicketPreview} className="keypad-btn-green flex items-center justify-center" title="Compartir"><Share2 size={16} /></button>
            {/* OK: un toque agrega la jugada; doble toque abre el menú rápido (evita abrir menú por accidente) */}
            <button
              onClick={() => {
                const now = Date.now();
                if (now - lastOkTapRef.current < 350) {
                  lastOkTapRef.current = 0;
                  setShowQuickPlay(true);
                } else {
                  lastOkTapRef.current = now;
                  // Un solo toque: agregar jugada después de un pequeño delay para detectar doble toque
                  setTimeout(() => {
                    if (lastOkTapRef.current !== 0 && Date.now() - lastOkTapRef.current >= 300) {
                      lastOkTapRef.current = 0;
                      addPlay();
                    }
                  }, 320);
                }
              }}
              className="keypad-btn-green font-bold text-sm"
              title="OK (doble toque = menú)"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {showLotteryModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[80%] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="font-bold text-lg text-gray-900">Seleccionar Loterias</h3>
              <button onClick={() => setShowLotteryModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={20} className="text-gray-500" /></button>
            </div>
            <div className="px-4 py-2 bg-[var(--bv-primary-light)] border-b border-green-100">
              <p className="text-xs text-[var(--bv-primary-dark)]">Toca para seleccionar multiples loterias.</p>
            </div>
            <div className="overflow-y-auto custom-scrollbar p-3 space-y-2 flex-1">
              {openLotteries.length > 0 && <div className="text-[10px] font-bold text-[var(--bv-primary-dark)] mb-1">ABIERTAS AHORA</div>}
              {openLotteries.map((lottery) => {
                const isSelected = selectedLotteries.some((l) => l.id === lottery.id);
                return (
                  <button key={lottery.id} onClick={() => { setSelectedLotteries((prev) => isSelected ? prev.filter((l) => l.id !== lottery.id) : [...prev, lottery]); }} className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${isSelected ? "bg-[var(--bv-primary-light)] border-[var(--bv-primary)]" : "bg-white border-gray-200 hover:border-[var(--bv-primary-soft)]"}`}>
                    <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 ${isSelected ? "bg-[var(--bv-primary-light)]0 border-[var(--bv-primary)]" : "border-gray-300"}`}>{isSelected && <Check size={14} className="text-white" />}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{lottery.name}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="p-3 border-t border-gray-100">
              <button onClick={() => setShowLotteryModal(false)} className="w-full py-2.5 bg-[var(--bv-primary)] text-white rounded-xl font-bold text-sm hover:bg-[var(--bv-primary-dark)]">
                {selectedLotteries.length} loteria(s) seleccionada(s) - Listo
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfirmModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 max-h-[85vh] flex flex-col">
            <h3 className="font-bold text-lg text-gray-900 text-center mb-1">Vista Previa del Ticket</h3>
            <p className="text-[11px] text-gray-400 text-center mb-3">Revise bien antes de confirmar</p>
            <div className="bg-gray-50 rounded-lg p-3 mb-3 space-y-1 text-xs overflow-y-auto">
              <div className="flex justify-between"><span className="text-gray-500">Fecha:</span><span className="font-medium">{new Date().toLocaleDateString()}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Hora:</span><span className="font-medium">{new Date().toLocaleTimeString()}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Terminal:</span><span className="font-medium">{user.bankNumber}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Loteria(s):</span><span className="font-medium text-right">{selectedLotteries.map((l) => l.name).join(", ")}</span></div>
              <div className="border-t border-gray-200 my-1.5 pt-1.5">
                <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Jugadas ({plays.length})</p>
                {plays.map((p, i) => (
                  <div key={i} className="flex justify-between py-0.5">
                    <span className="text-gray-700">{displayNumber(p.number)} <span className="text-gray-400">({p.type})</span> <span className="text-gray-400">- {p.lotteryName}</span></span>
                    <span className="text-[var(--bv-primary-dark)] font-medium shrink-0 ml-2">${formatMoney(p.amount)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-1.5 mt-1"><span className="text-gray-700 font-bold">Total:</span><span className="font-bold text-[var(--bv-primary-dark)] text-sm">${formatMoney(total)}</span></div>
            </div>
            <div className="text-center mb-3">
              <p className="text-[10px] font-bold text-gray-400 italic">Nous payons les tickets. Pas d'erreurs.</p>
              <p className="text-[10px] font-bold text-gray-400 italic">Verifiez bien vos jeux. Bonne chance.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowConfirmModal(false)} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm hover:bg-gray-200">Cancelar</button>
              <button onClick={confirmSave} className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 flex items-center justify-center gap-1.5"><Save size={16} /> Guardar</button>
              <button onClick={shareFromPreview} className="flex-1 py-3 rounded-xl bg-[var(--bv-primary)] text-white font-bold text-sm hover:bg-[var(--bv-primary-dark)] flex items-center justify-center gap-1.5"><Share2 size={16} /> WhatsApp</button>
            </div>
          </div>
        </div>
      )}

      {showTicketModal && lastTicket && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
            <div className="text-center mb-4">
              <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-3"><Check size={32} className="text-[var(--bv-primary)]" /></div>
              <h3 className="font-bold text-xl text-gray-900">Ticket Guardado!</h3>
              <p className="text-sm text-gray-500 mt-1">{lastTicket.code}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 mb-4 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Fecha:</span><span className="font-medium">{lastTicket.date}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Hora:</span><span className="font-medium">{lastTicket.time}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Terminal:</span><span className="font-medium">{lastTicket.terminal}</span></div>
              {lastTicket.groupName && <div className="flex justify-between"><span className="text-gray-500">Grupo:</span><span className="font-medium text-[var(--bv-primary-dark)]">{lastTicket.groupName}</span></div>}
              <div className="flex justify-between"><span className="text-gray-500">Loteria:</span><span className="font-medium">{lastTicket.lottery}</span></div>
              <div className="flex justify-between border-t border-gray-200 pt-1 mt-1"><span className="text-gray-700 font-bold">Total:</span><span className="font-bold text-[var(--bv-primary-dark)]">${formatMoney(Number(lastTicket.total))}</span></div>
            </div>
            <div className="text-center mb-3 px-2">
              <p className="text-[11px] font-bold text-gray-500 italic">Nous payons les tickets. Pas d'erreurs.</p>
              <p className="text-[11px] font-bold text-gray-500 italic">Verifiez bien vos jeux. Bonne chance.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => downloadPDF(lastTicket)} className="py-3 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 flex items-center justify-center gap-2"><FileText size={16} /> PDF</button>
              <button onClick={() => shareWhatsAppTicket()} className="py-3 rounded-xl bg-[var(--bv-primary)] text-white font-bold text-sm hover:bg-[var(--bv-primary-dark)] flex items-center justify-center gap-2"><Share2 size={16} /> WhatsApp</button>
            </div>
            <button onClick={() => setShowTicketModal(false)} className="w-full mt-2 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm hover:bg-gray-200">Cerrar</button>
          </div>
        </div>
      )}

      {/* Quick Play Modal */}
      {showQuickPlay && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[85%] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="font-bold text-lg text-gray-900">Jugada Rapida</h3>
              <button onClick={() => { setShowQuickPlay(false); setQuickType(null); }} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={20} className="text-gray-500" /></button>
            </div>

            {!quickType ? (
              <div className="p-4 grid grid-cols-2 gap-3">
                <button onClick={() => setQuickType("par")} className="flex flex-col items-center gap-2 p-4 bg-[var(--bv-primary-light)] rounded-xl border border-[var(--bv-primary-soft)] hover:bg-[var(--bv-primary-soft)] transition-all">
                  <Hash size={24} className="text-[var(--bv-primary)]" />
                  <span className="text-sm font-bold text-[var(--bv-primary-dark)]">PAR</span>
                  <span className="text-[10px] text-green-500">11,22,33...00</span>
                </button>
                <button onClick={() => setQuickType("decimal")} className="flex flex-col items-center gap-2 p-4 bg-blue-50 rounded-xl border border-blue-200 hover:bg-blue-100 transition-all">
                  <Hash size={24} className="text-blue-600" />
                  <span className="text-sm font-bold text-blue-700">DECIMAL</span>
                  <span className="text-[10px] text-blue-500">02,12,22...92</span>
                </button>
                <button onClick={() => setQuickType("unidad")} className="flex flex-col items-center gap-2 p-4 bg-purple-50 rounded-xl border border-purple-200 hover:bg-purple-100 transition-all">
                  <Hash size={24} className="text-purple-600" />
                  <span className="text-sm font-bold text-purple-700">UNIDAD</span>
                  <span className="text-[10px] text-purple-500">20,21,22...29</span>
                </button>
                <button onClick={() => setQuickType("azar")} className="flex flex-col items-center gap-2 p-4 bg-orange-50 rounded-xl border border-orange-200 hover:bg-orange-100 transition-all">
                  <Dices size={24} className="text-orange-600" />
                  <span className="text-sm font-bold text-orange-700">AZAR</span>
                  <span className="text-[10px] text-orange-500">Aleatorio</span>
                </button>
                <button onClick={() => setQuickType("mezclar")} className="flex flex-col items-center gap-2 p-4 bg-pink-50 rounded-xl border border-pink-200 hover:bg-pink-100 transition-all col-span-2">
                  <Shuffle size={24} className="text-pink-600" />
                  <span className="text-sm font-bold text-pink-700">MEZCLAR</span>
                  <span className="text-[10px] text-pink-500">Todas las combinaciones</span>
                </button>
              </div>
            ) : quickType === "par" ? (
              <div className="p-4 space-y-4">
                <p className="text-sm text-gray-600">Genera todos los numeros pares: 11, 22, 33, 44, 55, 66, 77, 88, 99, 00</p>
                <p className="text-xs text-gray-500">Monto por jugada: <strong className="text-[var(--bv-primary-dark)]">${amount || "0"}</strong></p>
                <button onClick={handlePar} className="w-full py-3 bg-[var(--bv-primary)] text-white rounded-xl font-bold hover:bg-[var(--bv-primary-dark)]">Generar 10 jugadas</button>
              </div>
            ) : quickType === "decimal" ? (
              <div className="p-4 space-y-4">
                <p className="text-sm text-gray-600">Elije un digito (0-9) para fijar el segundo numero.</p>
                <p className="text-xs text-gray-500">Ejemplo: 2 genera 02, 12, 22, 32, 42, 52, 62, 72, 82, 92</p>
                <input type="number" min="0" max="9" value={quickDigit} onChange={(e) => setQuickDigit(e.target.value.slice(-1))} className="w-full px-4 py-3 text-center text-2xl font-bold border-2 border-[var(--bv-primary-soft)] rounded-xl" placeholder="0-9" />
                <p className="text-xs text-gray-500">Monto: <strong className="text-[var(--bv-primary-dark)]">${amount || "0"}</strong></p>
                <button onClick={handleDecimal} disabled={quickDigit === ""} className="w-full py-3 bg-[var(--bv-primary)] text-white rounded-xl font-bold hover:bg-[var(--bv-primary-dark)] disabled:opacity-50">Generar</button>
              </div>
            ) : quickType === "unidad" ? (
              <div className="p-4 space-y-4">
                <p className="text-sm text-gray-600">Elije un digito (0-9) para fijar el primer numero.</p>
                <p className="text-xs text-gray-500">Ejemplo: 2 genera 20, 21, 22, 23, 24, 25, 26, 27, 28, 29</p>
                <input type="number" min="0" max="9" value={quickDigit} onChange={(e) => setQuickDigit(e.target.value.slice(-1))} className="w-full px-4 py-3 text-center text-2xl font-bold border-2 border-purple-300 rounded-xl" placeholder="0-9" />
                <p className="text-xs text-gray-500">Monto: <strong className="text-[var(--bv-primary-dark)]">${amount || "0"}</strong></p>
                <button onClick={handleUnidad} disabled={quickDigit === ""} className="w-full py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 disabled:opacity-50">Generar</button>
              </div>
            ) : quickType === "azar" ? (
              <div className="p-4 space-y-4">
                <p className="text-sm text-gray-600">Genera jugadas aleatorias.</p>
                <select value={quickPlayType} onChange={(e) => setQuickPlayType(e.target.value as PlayType)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="directo">Directo (2 cifras)</option>
                  <option value="pale">Pale (4 cifras)</option>
                  <option value="tripleta">Tripleta (6 cifras)</option>
                </select>
                <div>
                  <label className="text-xs text-gray-500">Cantidad de jugadas</label>
                  <input type="number" min="1" max="50" value={quickCount} onChange={(e) => setQuickCount(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-bold" />
                </div>
                <p className="text-xs text-gray-500">Monto: <strong className="text-[var(--bv-primary-dark)]">${amount || "0"}</strong></p>
                <button onClick={handleAzar} className="w-full py-3 bg-orange-600 text-white rounded-xl font-bold hover:bg-orange-700">Generar {quickCount} jugadas {quickPlayType}</button>
              </div>
            ) : quickType === "mezclar" ? (
              <div className="p-4 space-y-4">
                <p className="text-sm text-gray-600">Introduce numeros de 2 cifras separados por coma, espacio o +.</p>
                <p className="text-xs text-gray-500">Ejemplo: 12, 34, 56, 78</p>
                <textarea value={quickNumbers} onChange={(e) => setQuickNumbers(e.target.value)} className="w-full px-3 py-2 border border-pink-300 rounded-lg text-sm font-mono" rows={3} placeholder="12, 34, 56, 78" />
                <select value={quickPlayType} onChange={(e) => setQuickPlayType(e.target.value as PlayType)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="pale">Pale (combinaciones de 2)</option>
                  <option value="tripleta">Tripleta (combinaciones de 3)</option>
                </select>
                <p className="text-xs text-gray-500">Monto: <strong className="text-[var(--bv-primary-dark)]">${amount || "0"}</strong></p>
                <button onClick={handleMezclar} disabled={!quickNumbers.trim()} className="w-full py-3 bg-pink-600 text-white rounded-xl font-bold hover:bg-pink-700 disabled:opacity-50">Mezclar</button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Cambiar / Duplicar loteria de una jugada */}
      {lotteryActionFor && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
            <h3 className="font-bold text-lg text-gray-900 text-center mb-1">
              {lotteryActionFor.mode === "change" ? "Cambiar loteria" : "Duplicar en otra(s) loteria(s)"}
            </h3>
            <p className="text-xs text-gray-500 text-center mb-3">
              {lotteryActionFor.mode === "change" ? "Elija la nueva loteria para esta jugada" : "Elija a que loteria(s) agregar una copia de esta jugada"}
            </p>
            <div className="max-h-56 overflow-y-auto space-y-1.5 mb-3">
              {openLotteries.length === 0 && (
                <p className="text-xs text-center text-gray-400 py-3">No hay loterias abiertas ahora mismo</p>
              )}
              {openLotteries.map((l) => (
                <label key={l.id} className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-purple-50">
                  <input
                    type={lotteryActionFor.mode === "change" ? "radio" : "checkbox"}
                    checked={lotteryActionSelection.includes(l.id)}
                    onChange={() => toggleLotteryActionSelection(l.id, lotteryActionFor.mode)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium text-gray-800">{l.name}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setLotteryActionFor(null); setLotteryActionSelection([]); }} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-bold text-sm">Cancelar</button>
              <button onClick={applyLotteryAction} className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl font-bold text-sm hover:bg-purple-700 flex items-center justify-center gap-2">
                {lotteryActionFor.mode === "change" ? <Repeat size={16} /> : <Copy size={16} />} Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


