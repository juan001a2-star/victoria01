import { useState } from "react";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import type { SessionUser } from "@/store"
import { formatMoney, logAudit, calculateNetDeduction, displayNumber, formatTicketShareText, PENDING_COPY_KEY } from "@/store";
import { trpc } from "@/providers/trpc";
import { Receipt, Search, X, ChevronRight, Ban, Share2, Clock, FileText, Copy, QrCode, CheckCircle } from "lucide-react";
import { t } from "@/i18n";

interface TicketsScreenProps {
  user: SessionUser;
  onGoVender?: () => void;
}

const ANNUL_WINDOW_MS = 5 * 60 * 1000;

function isLotteryOpenNow(lottery: any): boolean {
  if (!lottery) return true;
  let schedule: Record<string, { open: string; close: string }> | null = null;
  if (lottery.schedule) {
    try { schedule = JSON.parse(lottery.schedule); } catch { schedule = null; }
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Cayenne",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const weekdayMap: Record<string, string> = { Sun: "sun", Mon: "mon", Tue: "tue", Wed: "wed", Thu: "thu", Fri: "fri", Sat: "sat" };
  const dayKey = weekdayMap[map.weekday] || "sun";
  let hour = Number(map.hour);
  if (hour === 24) hour = 0;
  const currentMins = hour * 60 + Number(map.minute);
  const daySched = schedule?.[dayKey];
  const closeTime = daySched?.close || lottery.closeTime || lottery.drawTime || "20:00";
  const openTime = daySched?.open || "07:00";
  const [openH, openM] = openTime.split(":").map(Number);
  const [closeH, closeM] = closeTime.split(":").map(Number);
  return currentMins >= (openH * 60 + openM) && currentMins < (closeH * 60 + closeM);
}

function getTimeElapsed(createdAt: string): { elapsedMs: number; canAnnul: boolean; timeLeft: string } {
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  const elapsedMs = now - created;
  const remainingMs = Math.max(0, ANNUL_WINDOW_MS - elapsedMs);
  const canAnnul = remainingMs > 0;
  const mins = Math.floor(remainingMs / 60000);
  const secs = Math.floor((remainingMs % 60000) / 1000);
  const timeLeft = remainingMs > 0 ? `${mins}m ${secs}s` : "Expirado";
  return { elapsedMs, canAnnul, timeLeft };
}

export default function TicketsScreen({ user, onGoVender }: TicketsScreenProps) {
  const lang = user.language || "es";
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const ticketsOpenPref = (() => {
    try { return localStorage.getItem("bv_tickets_filter") || "open"; } catch { return "open"; }
  })();
  const [filterUser, setFilterUser] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [actionMenuTicket, setActionMenuTicket] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [copyCode, setCopyCode] = useState("");
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copySourcePlays, setCopySourcePlays] = useState<any[] | null>(null);
  const [selectedCopyLotteries, setSelectedCopyLotteries] = useState<number[]>([]);
  const [copyMode, setCopyMode] = useState<"create" | "vender">("create");
  const [showValidateModal, setShowValidateModal] = useState(false);
  const [validateCode, setValidateCode] = useState("");
  const [validationResult, setValidationResult] = useState<any>(null);

  const isAdmin = user.role === "admin" || user.role === "supervisor";

  // tRPC hooks
  const utils = trpc.useUtils();
  const groupQuery = trpc.group.list.useQuery();
  const trpcUsers = trpc.lotteryUser.list.useQuery();
  const trpcLotteries = trpc.lottery.list.useQuery();
  const trpcTickets = trpc.ticket.list.useQuery(
    isAdmin ? undefined : { userId: user.id }
  );
  const annulTicketMut = trpc.ticket.annul.useMutation({
    onSuccess: () => { utils.ticket.list.invalidate(); },
  });
  const ticketWithPlays = trpc.ticket.withPlays.useQuery(
    { id: selectedTicket?.id || 0 },
    { enabled: !!selectedTicket }
  );
  const ticketByCode = trpc.ticket.byCode.useQuery(
    { code: copyCode },
    { enabled: false }
  );
  const validateTicket = trpc.ticket.validate.useQuery(
    { code: validateCode },
    { enabled: false }
  );
  const createTicketMut = trpc.ticket.create.useMutation({
    onSuccess: () => { utils.ticket.list.invalidate(); setMsg("Ticket copiado!"); setTimeout(() => setMsg(""), 3000); },
    onError: (err: any) => { setMsg("Error: " + err.message); setTimeout(() => setMsg(""), 3000); },
  });

  const users = trpcUsers.data || [];
  const allTickets = trpcTickets.data || [];

  const filtered = allTickets.filter((t: any) => {
    const matchCode = t.code.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !filterStatus || t.status === filterStatus;
    const matchUser = !filterUser || t.userId === Number(filterUser);
    return matchCode && matchStatus && matchUser;
  });

  const lotteries = trpcLotteries.data || [];

  const annulTicket = async (ticket: any) => {
    if (!isAdmin) {
      const { canAnnul, timeLeft } = getTimeElapsed(ticket.createdAt);
      if (!canAnnul) { setMsg("Solo puedes anular dentro de 5 minutos"); setTimeout(() => setMsg(""), 3000); return; }
      const lottery = lotteries.find((l: any) => l.id === ticket.lotteryId);
      if (!isLotteryOpenNow(lottery)) { setMsg("La loteria ya cerro; no puedes anular este ticket"); setTimeout(() => setMsg(""), 3000); return; }
      if (!confirm(`Anular este ticket? Tiempo restante: ${timeLeft}`)) return;
    } else {
      if (!confirm("Anular este ticket?")) return;
    }

    // Calculate what was actually deducted from seller's credit (total - commission)
    const total = Number(ticket.total) || 0;
    const commission = Number(ticket.commission || 0);
    const netDeduction = calculateNetDeduction(total, commission);
    const commissionKept = total - netDeduction;

    try {
      // Annul ticket via API
      await annulTicketMut.mutateAsync({ id: ticket.id, annulledBy: user.id });

      logAudit({ type: "ticket_annul", userId: ticket.userId, userName: ticket.seller || "", groupId: user.groupId, amount: Number(ticket.total) || 0, description: `Ticket anulado: ${ticket.code}`, ticketCode: ticket.code });

      setSelectedTicket(null);
      utils.ticket.list.invalidate();
      setMsg("Ticket anulado y crédito restaurado.");
      setTimeout(() => setMsg(""), 3000);
    } catch (err: any) {
      setMsg("Error al anular: " + (err.message || "Intente de nuevo"));
      setTimeout(() => setMsg(""), 3000);
    }
  };

  const downloadTicketPDF = (ticket: any) => {
    if (ticket.pdfDataUrl) {
      window.open(ticket.pdfDataUrl, "_blank");
    } else {
      setMsg("PDF no disponible");
      setTimeout(() => setMsg(""), 2000);
    }
  };

  const shareWhatsApp = (ticket: any) => {
    const lines = (ticket.plays || []).map((p: any) => `${displayNumber(p.number)} - ${p.type.toUpperCase()} - $${formatMoney(p.amount)}`).join("\n");
    const groupName = ticket.groupName || "";
    const appName = groupName || "BANCA VICTORIA";
    const subLine = groupName ? "\n_Banca Victoria_" : "";
    const text = `*${appName}*${subLine}\nTicket: *${ticket.code}*\nFecha: ${ticket.date || new Date(ticket.createdAt).toLocaleDateString()}\nHora: ${ticket.time || new Date(ticket.createdAt).toLocaleTimeString()}\nTerminal: ${ticket.terminal}\nLoteria: ${ticket.lottery}\n\n*JUGADAS:*\n${lines}\n\n*Total: $${formatMoney(ticket.total)}*`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const getSellerName = (userId: number) => {
    const u = users.find((usr: any) => usr.id === userId);
    return u ? `${u.name} (${u.bankNumber})` : `Usuario #${userId}`;
  };

  const fetchTicketToCopy = async () => {
    if (!copyCode.trim()) { setMsg("Ingrese un codigo"); setTimeout(() => setMsg(""), 3000); return; }
    try {
      const data = await utils.ticket.byCode.fetch({ code: copyCode.trim() });
      if (!data || !data.ticket) { setMsg("Ticket no encontrado"); setTimeout(() => setMsg(""), 3000); return; }
      const tPlays = data.plays || [];
      if (tPlays.length === 0) { setMsg("El ticket no tiene jugadas"); setTimeout(() => setMsg(""), 3000); return; }
      setCopySourcePlays(tPlays);
      setSelectedCopyLotteries([data.ticket.lotteryId]);
    } catch (err: any) {
      setMsg("Error: " + (err.message || "No se pudo buscar el ticket"));
      setTimeout(() => setMsg(""), 3000);
    }
  };

  const getGroupName = () => {
    const groups = groupQuery.data || [];
    const g = groups.find((x: any) => x.id === user.groupId);
    return g?.name || "BANCA VICTORIA";
  };

  /** Copiar ticket: abre modal para elegir loteria(s) destino */
  const startCopyFromMenu = async (ticket: any) => {
    setActionMenuTicket(null);
    setCopyMode("create");
    setCopyCode(ticket.code);
    setShowCopyModal(true);
    setCopySourcePlays(null);
    setSelectedCopyLotteries([]);
    try {
      const data = await utils.ticket.byCode.fetch({ code: ticket.code });
      const tPlays = data?.plays || [];
      if (!data?.ticket || tPlays.length === 0) {
        setMsg("No se pudieron cargar las jugadas del ticket");
        setTimeout(() => setMsg(""), 3000);
        return;
      }
      setCopySourcePlays(tPlays);
      // El usuario elige las loterias (ninguna preseleccionada)
      setSelectedCopyLotteries([]);
    } catch (err: any) {
      setMsg("Error al copiar: " + (err?.message || "intente de nuevo"));
      setTimeout(() => setMsg(""), 3000);
    }
  };

  /** Editar en Vender: primero elegir loteria, luego ir a Vender */
  const copyToVender = async (ticket: any) => {
    setActionMenuTicket(null);
    setCopyMode("vender");
    setCopyCode(ticket.code);
    setShowCopyModal(true);
    setCopySourcePlays(null);
    setSelectedCopyLotteries([]);
    try {
      const data = await utils.ticket.byCode.fetch({ code: ticket.code });
      const tPlays = data?.plays || [];
      if (!data?.ticket || tPlays.length === 0) {
        setMsg("No se pudieron cargar las jugadas");
        setTimeout(() => setMsg(""), 3000);
        return;
      }
      setCopySourcePlays(tPlays);
      setSelectedCopyLotteries([]);
    } catch (err: any) {
      setMsg("Error: " + (err?.message || "intente de nuevo"));
      setTimeout(() => setMsg(""), 3000);
    }
  };

  const confirmCopyToVender = () => {
    if (!copySourcePlays || selectedCopyLotteries.length === 0) {
      setMsg("Seleccione al menos una loteria");
      setTimeout(() => setMsg(""), 3000);
      return;
    }
    const lotteryId = selectedCopyLotteries[0];
    const lottery = lotteries.find((l: any) => l.id === lotteryId);
    sessionStorage.setItem(PENDING_COPY_KEY, JSON.stringify({
      plays: copySourcePlays.map((p: any) => ({
        number: p.number,
        amount: Number(p.amount),
        type: p.type,
        lotteryId,
        lotteryName: lottery?.name || "",
      })),
      lotteryId,
    }));
    setShowCopyModal(false);
    setCopySourcePlays(null);
    setSelectedCopyLotteries([]);
    onGoVender?.();
  };

  const buildShareText = (ticket: any, ticketPlays: any[], lotteryName: string) => {
    const created = ticket.createdAt ? new Date(ticket.createdAt) : new Date();
    return formatTicketShareText({
      groupName: getGroupName(),
      code: ticket.code,
      date: created.toLocaleDateString(),
      time: created.toLocaleTimeString(),
      terminal: user.bankNumber || ticket.terminal || "-",
      lottery: lotteryName,
      plays: ticketPlays,
      total: ticket.total,
    });
  };

  const generateQR = async (data: string): Promise<string> => {
    try { return await QRCode.toDataURL(data, { width: 200, margin: 2 }); } catch { return ""; }
  };

  /** PDF con el mismo formato del ticket vendido (cabecera verde, jugadas, QR) */
  const buildTicketPDF = async (ticket: any, ticketPlays: any[], lotteryName: string): Promise<jsPDF> => {
    const groupName = getGroupName();
    const created = ticket.createdAt ? new Date(ticket.createdAt) : new Date();
    const dateStr = created.toLocaleDateString();
    const timeStr = created.toLocaleTimeString();
    const terminal = user.bankNumber || ticket.terminal || "-";
    const total = ticket.total;
    const height = Math.max(170, 100 + (ticketPlays.length || 1) * 9.5);
    const doc = new jsPDF({ unit: "mm", format: [80, height] });
    const pageWidth = 80;
    let y = 8;

    doc.setFillColor(22, 163, 74);
    doc.rect(0, 0, pageWidth, 24, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16); doc.setFont("helvetica", "bold");
    doc.text(groupName, pageWidth / 2, 11, { align: "center" });
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.text("Gracias por jugar con nosotros!", pageWidth / 2, 18, { align: "center" });

    y = 30;
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    const infoRows: [string, string][] = [
      ["Ticket No:", ticket.code],
      ["Fecha:", dateStr],
      ["Hora:", timeStr],
      ["Terminal:", terminal],
      ["Grupo:", groupName],
      ["Loteria:", lotteryName],
    ];
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

    doc.setTextColor(22, 163, 74);
    doc.setFontSize(12); doc.setFont("helvetica", "bold");
    doc.text("JUGADAS", 5, y); y += 3;
    doc.setDrawColor(22, 163, 74);
    doc.line(5, y, pageWidth - 5, y); y += 5;
    // Column headers
    doc.setFontSize(8); doc.setFont("helvetica", "bold");
    doc.setTextColor(100, 100, 100);
    doc.text("NUMERO", 5, y);
    doc.text("TIPO", 32, y);
    doc.text("MONTO", pageWidth - 5, y, { align: "right" });
    y += 5;

    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    for (const p of ticketPlays) {
      doc.text(displayNumber(String(p.number)), 5, y);
      doc.text(String(p.type).toUpperCase(), 32, y);
      doc.text(`$${formatMoney(p.amount)}`, pageWidth - 5, y, { align: "right" });
      y += 7.5;
    }
    y += 2;
    doc.setDrawColor(22, 163, 74);
    doc.line(5, y, pageWidth - 5, y); y += 7;
    doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("TOTAL:", 5, y);
    doc.text(`$${formatMoney(total)}`, pageWidth - 5, y, { align: "right" });
    y += 12;

    const qrPayload = `TICKET:${ticket.code}|DATE:${dateStr}|TIME:${timeStr}|TERMINAL:${terminal}|TOTAL:${total}`;
    const qrDataUrl = await generateQR(qrPayload);
    if (qrDataUrl) {
      doc.addImage(qrDataUrl, "PNG", (pageWidth - 32) / 2, y, 32, 32);
      y += 36;
    }
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(55, 65, 81);
    doc.text("Escanea para verificar", pageWidth / 2, y, { align: "center" }); y += 5;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(17, 24, 39);
    doc.text("Nous payons les tickets. Pas d'erreurs.", pageWidth / 2, y, { align: "center" }); y += 4.5;
    doc.text("Verifiez bien vos jeux. Bonne chance.", pageWidth / 2, y, { align: "center" });
    return doc;
  };


  /** Genera imagen PNG del ticket (modo IMG) */
  const buildTicketImage = async (ticket: any, ticketPlays: any[], lotteryName: string): Promise<Blob | null> => {
    try {
      const groupName = getGroupName();
      const created = ticket.createdAt ? new Date(ticket.createdAt) : new Date();
      const dateStr = created.toLocaleDateString();
      const timeStr = created.toLocaleTimeString();
      const terminal = user.bankNumber || ticket.terminal || "-";
      const total = ticket.total;
      const W = 480;
      const rowH = 36;
      const headerH = 100;
      const infoH = 180;
      const playsH = Math.max(ticketPlays.length, 1) * rowH + 40;
      const footerH = 220;
      const H = headerH + infoH + playsH + footerH;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      // fondo
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);

      // cabecera verde
      ctx.fillStyle = "#16a34a";
      ctx.fillRect(0, 0, W, headerH);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 34px Helvetica, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(groupName, W / 2, 40);
      ctx.font = "18px Helvetica, Arial, sans-serif";
      ctx.fillText("Gracias por jugar con nosotros!", W / 2, 68);

      // info
      let y = headerH + 28;
      const infoRows: [string, string][] = [
        ["Ticket No:", ticket.code],
        ["Fecha:", dateStr],
        ["Hora:", timeStr],
        ["Terminal:", terminal],
        ["Grupo:", groupName],
        ["Loteria:", lotteryName],
      ];
      for (const [label, value] of infoRows) {
        ctx.font = "16px Helvetica, Arial, sans-serif";
        ctx.fillStyle = "#6b7280";
        ctx.textAlign = "left";
        ctx.fillText(label, 24, y);
        ctx.font = "bold 18px Helvetica, Arial, sans-serif";
        ctx.fillStyle = label.startsWith("Loteria") ? "#15803d" : "#000000";
        ctx.textAlign = "right";
        ctx.fillText(String(value), W - 24, y);
        y += 26;
      }
      y += 10;

      // JUGADAS
      ctx.fillStyle = "#16a34a";
      ctx.font = "bold 20px Helvetica, Arial, sans-serif";
      ctx.fillText("JUGADAS", 24, y);
      y += 8;
      ctx.strokeStyle = "#16a34a";
      ctx.beginPath();
      ctx.moveTo(24, y);
      ctx.lineTo(W - 24, y);
      ctx.stroke();
      y += 24;

      ctx.fillStyle = "#000000";
      ctx.font = "bold 22px Helvetica, Arial, sans-serif";
      for (const p of ticketPlays) {
        ctx.textAlign = "left";
        ctx.fillText(displayNumber(String(p.number)), 24, y);
        ctx.textAlign = "center";
        ctx.fillText(String(p.type).toUpperCase(), W / 2, y);
        ctx.textAlign = "right";
        ctx.fillText(`$${formatMoney(p.amount)}`, W - 24, y);
        y += rowH;
      }

      y += 4;
      ctx.strokeStyle = "#16a34a";
      ctx.beginPath();
      ctx.moveTo(24, y);
      ctx.lineTo(W - 24, y);
      ctx.stroke();
      y += 28;
      ctx.fillStyle = "#16a34a";
      ctx.font = "bold 26px Helvetica, Arial, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("TOTAL:", 24, y);
      ctx.textAlign = "right";
      ctx.fillText(`$${formatMoney(total)}`, W - 24, y);
      y += 40;

      // QR
      const qrPayload = `TICKET:${ticket.code}|DATE:${dateStr}|TIME:${timeStr}|TERMINAL:${terminal}|TOTAL:${total}`;
      const qrDataUrl = await generateQR(qrPayload);
      if (qrDataUrl) {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject();
          img.src = qrDataUrl;
        });
        const qrSize = 120;
        ctx.drawImage(img, (W - qrSize) / 2, y, qrSize, qrSize);
        y += qrSize + 16;
      }

      ctx.fillStyle = "#9ca3af";
      ctx.font = "12px Helvetica, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Escanea para verificar", W / 2, y);
      y += 18;
      ctx.fillStyle = "#4b5563";
      ctx.font = "bold 12px Helvetica, Arial, sans-serif";
      ctx.fillText("Nous payons les tickets. Pas d'erreurs.", W / 2, y);
      y += 16;
      ctx.fillText("Verifiez bien vos jeux. Bonne chance.", W / 2, y);

      return await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/png", 0.95);
      });
    } catch {
      return null;
    }
  };

  const shareTicketWhatsApp = async (ticket: any) => {
    setActionMenuTicket(null);
    let ticketPlays: any[] = Array.isArray(ticket.plays) ? ticket.plays : [];
    if (ticketPlays.length === 0) {
      try {
        const data = await utils.ticket.byCode.fetch({ code: ticket.code });
        ticketPlays = data?.plays || [];
      } catch { ticketPlays = []; }
    }
    if (ticketPlays.length === 0 && ticket.id) {
      try {
        const data = await utils.ticket.withPlays.fetch({ id: Number(ticket.id) });
        ticketPlays = data?.plays || [];
      } catch { ticketPlays = []; }
    }
    const lottery = lotteries.find((l: any) => l.id === ticket.lotteryId);
    const lotteryName = lottery?.name || ticket.lottery || `#${ticket.lotteryId}`;
    const textMsg = buildShareText(ticket, ticketPlays, lotteryName);
    const mode = (() => {
      try {
        const v = localStorage.getItem("bv_tickets_filter") || "pdf";
        if (v === "open" || v === "img") return "img" as const;
        return "pdf" as const;
      } catch { return "pdf" as const; }
    })();

    let file: File | null = null;
    let url: string | null = null;

    try {
      if (mode === "img" && ticketPlays.length > 0) {
        const blob = await buildTicketImage(ticket, ticketPlays, lotteryName);
        if (blob) {
          file = new File([blob], `Ticket-${ticket.code}.png`, { type: "image/png" });
          url = URL.createObjectURL(blob);
        }
      }
      if (!file && ticketPlays.length > 0) {
        const doc = await buildTicketPDF(ticket, ticketPlays, lotteryName);
        const pdfBlob = doc.output("blob");
        file = new File([pdfBlob], `Ticket-${ticket.code}.pdf`, { type: "application/pdf" });
        url = URL.createObjectURL(pdfBlob);
      }
    } catch (err) {
      console.error("share build error", err);
    }

    // Compartir SOLO el archivo (IMG o PDF), sin texto duplicado
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

    // Si no se pudo compartir archivo: abrir vista previa (sin texto WhatsApp extra)
    if (url) {
      window.open(url, "_blank");
      return;
    }

    // Ultimo recurso: solo texto si no hay imagen/PDF
    window.open(`https://wa.me/?text=${encodeURIComponent(textMsg)}`, "_blank");
  };

  const toggleCopyLottery = (id: number) => {
    if (copyMode === "vender") {
      // Una sola loteria para editar en Vender
      setSelectedCopyLotteries((prev) => (prev[0] === id ? [] : [id]));
      return;
    }
    setSelectedCopyLotteries((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const confirmCopyToLotteries = async () => {
    if (!copySourcePlays || selectedCopyLotteries.length === 0) { setMsg("Seleccione al menos una loteria"); setTimeout(() => setMsg(""), 3000); return; }
    try {
      for (const lotteryId of selectedCopyLotteries) {
        const code = `TKT-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
        const playList = copySourcePlays.map((p: any) => ({
          number: p.number,
          amount: String(p.amount),
          type: p.type,
          lotteryId,
        }));
        const total = playList.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
        await createTicketMut.mutateAsync({
          code,
          userId: user.id,
          lotteryId,
          total: total.toFixed(2),
          playList,
        });
      }
      setMsg(`Ticket copiado a ${selectedCopyLotteries.length} loteria(s)!`);
      setTimeout(() => setMsg(""), 3000);
      setCopyCode("");
      setCopySourcePlays(null);
      setSelectedCopyLotteries([]);
      setShowCopyModal(false);
    } catch (err: any) {
      setMsg("Error: " + (err.message || "No se pudo copiar"));
      setTimeout(() => setMsg(""), 3000);
    }
  };

  const validateTicketByCode = async () => {
    if (!validateCode.trim()) { setMsg("Ingrese codigo"); setTimeout(() => setMsg(""), 3000); return; }
    try {
      const result = await validateTicket.refetch({ queryKey: ["ticket.validate", { code: validateCode.trim() }] } as any);
      setValidationResult(result.data || { valid: false, reason: "Error" });
    } catch {
      setValidationResult({ valid: false, reason: "Error de conexion" });
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-4 shrink-0 space-y-3">
        <h2 className="text-xl font-bold text-gray-900">{t(lang, "tickets_title")}</h2>
        {msg && <div className="bg-[var(--bv-primary)] text-white px-3 py-2 rounded-lg text-sm text-center">{msg}</div>}

        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-[var(--bv-primary-soft)] rounded-xl focus:outline-none focus:border-[var(--bv-primary)] bg-white text-sm" placeholder={t(lang, "tickets_search_placeholder")} />
          {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2"><X size={16} className="text-gray-400" /></button>}
        </div>

        <div className="flex gap-2">
          <button onClick={() => setShowCopyModal(true)} className="flex-1 py-2 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-100 flex items-center justify-center gap-1"><Copy size={14} /> Copiar</button>
          <button onClick={() => setShowValidateModal(true)} className="flex-1 py-2 bg-purple-50 text-purple-600 rounded-lg text-xs font-bold hover:bg-purple-100 flex items-center justify-center gap-1"><CheckCircle size={14} /> Validar</button>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="flex-1 px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm">
              <option value="">{t(lang, "tickets_all_status")}</option>
              <option value="active">Activos</option>
              <option value="cancelled">Anulados</option>
            </select>
            <select value={filterUser} onChange={(e) => setFilterUser(e.target.value)} className="flex-1 px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm">
              <option value="">{t(lang, "tickets_all_sellers")}</option>
              {users.filter((u: any) => u.role !== "admin").map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-4 space-y-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400"><Receipt size={48} className="mb-3 text-green-200" /><p className="text-sm">No hay tickets</p></div>
        ) : (
          filtered.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((ticket: any) => {
            const { canAnnul, timeLeft } = getTimeElapsed(ticket.createdAt);
            return (
              <button key={ticket.id} onClick={() => setActionMenuTicket(ticket)} className="w-full bg-white rounded-xl border border-gray-100 p-3 shadow-sm flex items-center justify-between hover:border-[var(--bv-primary-soft)] transition-colors text-left">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-900">{ticket.code}</p>
                  <p className="text-[10px] text-gray-500">{new Date(ticket.createdAt).toLocaleDateString()} {new Date(ticket.createdAt).toLocaleTimeString()}</p>
                  {isAdmin && <p className="text-[10px] text-blue-600 font-medium">{getSellerName(ticket.userId)}</p>}
                  {!isAdmin && ticket.status === "active" && (
                    <p className={`text-[10px] font-medium ${canAnnul ? "text-yellow-600" : "text-red-400"}`}>
                      <Clock size={10} className="inline mr-0.5" />{canAnnul ? `Anular: ${timeLeft}` : "No anulable"}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-sm font-bold text-[var(--bv-primary-dark)]">${formatMoney(ticket.total)}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ticket.status === "active" ? "bg-green-100 text-[var(--bv-primary-dark)]" : ticket.status === "cancelled" ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-700"}`}>{ticket.status}</span>
                  </div>
                  <ChevronRight size={16} className="text-gray-300" />
                </div>
              </button>
            );
          })
        )}
      </div>

      {actionMenuTicket && (
        <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/50" onClick={() => setActionMenuTicket(null)}>
          <div className="bg-white rounded-t-2xl shadow-2xl w-full max-w-sm p-4 pb-6" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3" />
            <p className="text-center text-sm font-bold text-gray-900 mb-1">{actionMenuTicket.code}</p>
            <p className="text-center text-xs text-gray-400 mb-4">${formatMoney(actionMenuTicket.total)}</p>
            <div className="space-y-1.5">
              <button onClick={() => { setSelectedTicket(actionMenuTicket); setActionMenuTicket(null); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 text-left">
                <Receipt size={18} className="text-gray-500" /><span className="text-sm font-medium text-gray-800">{t(lang, "tickets_view_detail")}</span>
              </button>
              {actionMenuTicket.status === "active" && (
                <button onClick={() => { const t = actionMenuTicket; setActionMenuTicket(null); annulTicket(t); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-red-50 text-left">
                  <Ban size={18} className="text-red-500" /><span className="text-sm font-medium text-red-600">{t(lang, "tickets_annul")}</span>
                </button>
              )}
              <button onClick={() => startCopyFromMenu(actionMenuTicket)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-blue-50 text-left">
                <Copy size={18} className="text-blue-500" /><span className="text-sm font-medium text-blue-600">{t(lang, "tickets_copy")} (otras loterias)</span>
              </button>
              <button onClick={() => copyToVender(actionMenuTicket)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-indigo-50 text-left">
                <FileText size={18} className="text-indigo-500" /><span className="text-sm font-medium text-indigo-600">Editar en Vender</span>
              </button>
              <button onClick={() => shareTicketWhatsApp(actionMenuTicket)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[var(--bv-primary-light)] text-left">
                <Share2 size={18} className="text-[var(--bv-primary)]" /><span className="text-sm font-medium text-[var(--bv-primary-dark)]">{t(lang, "tickets_whatsapp")}</span>
              </button>
            </div>
            <button onClick={() => setActionMenuTicket(null)} className="w-full mt-3 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-bold">Cerrar</button>
          </div>
        </div>
      )}

      {selectedTicket && (
        <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/50">
          <div className="bg-white rounded-t-2xl shadow-2xl w-full max-h-[80%] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <div><h3 className="font-bold text-lg">{selectedTicket.code}</h3><p className="text-xs text-gray-500">{new Date(selectedTicket.createdAt).toLocaleString()}</p></div>
              <button onClick={() => setSelectedTicket(null)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={20} className="text-gray-500" /></button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
              <div className="bg-gray-50 rounded-lg p-3 mb-3 space-y-1">
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <div>
                    <span className="text-gray-500 block">{t(lang, "tickets_date") || "Fecha"}</span>
                    <span className="font-medium text-gray-900">{new Date(selectedTicket.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-gray-500 block">{t(lang, "tickets_time") || "Hora"}</span>
                    <span className="font-medium text-gray-900">{new Date(selectedTicket.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">{t(lang, "tickets_terminal")}</span>
                    <span className="font-medium text-gray-900">{user.bankNumber}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-gray-500 block">{t(lang, "tickets_status")}</span>
                    <span className={`font-medium ${selectedTicket.status === "active" ? "text-[var(--bv-primary-dark)]" : "text-red-600"}`}>{selectedTicket.status}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">{t(lang, "tickets_lottery")}</span>
                    <span className="font-bold text-gray-900">{lotteries.find((l: any) => l.id === selectedTicket.lotteryId)?.name || `#${selectedTicket.lotteryId}`}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-gray-500 block">Grupo</span>
                    <span className="font-medium text-gray-900">{getGroupName()}</span>
                  </div>
                  {selectedTicket.status === "cancelled" && selectedTicket.annulledBy && (
                    <div className="col-span-2">
                      <span className="text-gray-500 block">{t(lang, "tickets_annulled_by")}</span>
                      <span className="font-medium text-red-600">{getSellerName(selectedTicket.annulledBy)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between mb-3 p-3 bg-[var(--bv-primary-light)] rounded-lg"><span className="text-sm font-medium text-gray-700">Total</span><span className="text-xl font-extrabold text-[var(--bv-primary-dark)]">${formatMoney(selectedTicket.total || 0)}</span></div>

              <h4 className="text-sm font-bold text-gray-900 mb-2">{t(lang, "tickets_plays")}</h4>
              <div className="space-y-2">
                {(ticketWithPlays.data?.plays || selectedTicket.plays || []).map((play: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2"><span className="text-sm font-bold text-gray-900">{displayNumber(play.number)}</span><span className="text-[10px] text-[var(--bv-primary)] uppercase bg-green-100 px-1.5 py-0.5 rounded">{play.type}</span></div>
                    <span className="text-sm font-bold text-[var(--bv-primary-dark)]">${formatMoney(play.amount)}</span>
                  </div>
                ))}
              </div>
              <div className="text-center my-3 px-2">
                <p className="text-[11px] font-bold text-gray-400 italic">Nous payons les tickets. Pas d'erreurs.</p>
                <p className="text-[11px] font-bold text-gray-400 italic">Verifiez bien vos jeux. Bonne chance.</p>
              </div>

              {selectedTicket.status === "active" && (
                <div className="flex gap-2 mt-4">
                  <button onClick={() => shareTicketWhatsApp(selectedTicket)} className="flex-1 py-2.5 bg-green-100 text-[var(--bv-primary)] rounded-lg text-sm font-bold hover:bg-green-200 flex items-center justify-center gap-2"><Share2 size={16} /> WhatsApp</button>
                  {isAdmin ? (
                    <button onClick={() => annulTicket(selectedTicket)} className="flex-1 py-2.5 bg-red-100 text-red-600 rounded-lg text-sm font-bold hover:bg-red-200 flex items-center justify-center gap-2"><Ban size={16} /> Anular</button>
                  ) : (
                    (() => {
                      const { canAnnul, timeLeft } = getTimeElapsed(selectedTicket.createdAt);
                      return (
                        <button onClick={() => annulTicket(selectedTicket)} disabled={!canAnnul}
                          className={`flex-1 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 ${canAnnul ? "bg-red-100 text-red-600 hover:bg-red-200" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
                          <Ban size={16} /> {canAnnul ? `Anular (${timeLeft})` : "Expirado"}
                        </button>
                      );
                    })()
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Copy Ticket Modal */}
      {showCopyModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
            <h3 className="font-bold text-lg text-gray-900 text-center mb-3">{copyMode === "vender" ? "Elegir loteria para Vender" : "Copiar Ticket"}</h3>
            {!copySourcePlays ? (
              <>
                <p className="text-xs text-gray-500 text-center mb-3">Ingrese el codigo del ticket que desea copiar</p>
                <input value={copyCode} onChange={(e) => setCopyCode(e.target.value)} placeholder="Ej: TKT-ABC123" className="w-full px-4 py-3 border border-blue-200 rounded-xl text-sm font-bold mb-3" />
                <div className="flex gap-2">
                  <button onClick={() => { setShowCopyModal(false); setCopyCode(""); }} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-bold text-sm">{t(lang, "tickets_cancel")}</button>
                  <button onClick={fetchTicketToCopy} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 flex items-center justify-center gap-2"><Search size={16} /> Buscar</button>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-gray-500 text-center mb-3">{copyMode === "vender" ? `Elija la loteria para editar/vender (${copySourcePlays.length} jugada(s))` : `Elija a que loteria(s) copiar las jugadas (${copySourcePlays.length} jugada(s))`}</p>
                <div className="max-h-56 overflow-y-auto space-y-1.5 mb-3">
                  {lotteries.length === 0 && (
                    <p className="text-xs text-center text-gray-400 py-3">No hay loterias disponibles</p>
                  )}
                  {lotteries.map((l: any) => {
                    const open = isLotteryOpenNow(l);
                    return (
                      <label key={l.id} className={`flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer ${open ? "border-blue-200 hover:bg-blue-50" : "border-gray-100 opacity-70 hover:bg-gray-50"}`}>
                        <input type="checkbox" checked={selectedCopyLotteries.includes(l.id)} onChange={() => toggleCopyLottery(l.id)} className="w-4 h-4" />
                        <span className="text-sm font-medium text-gray-800 flex-1">{l.name}</span>
                        <span className={`text-[10px] ${open ? "text-green-600" : "text-gray-400"}`}>{open ? "Abierta" : "Cerrada"}</span>
                      </label>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setShowCopyModal(false); setCopyCode(""); setCopySourcePlays(null); setSelectedCopyLotteries([]); }} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-bold text-sm">{t(lang, "tickets_cancel")}</button>
                  <button
                    onClick={copyMode === "vender" ? confirmCopyToVender : confirmCopyToLotteries}
                    className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 flex items-center justify-center gap-2"
                  >
                    {copyMode === "vender" ? (
                      <><FileText size={16} /> Ir a Vender ({selectedCopyLotteries.length})</>
                    ) : (
                      <><Copy size={16} /> Copiar ({selectedCopyLotteries.length})</>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Validate Ticket Modal */}
      {showValidateModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
            <h3 className="font-bold text-lg text-gray-900 text-center mb-3">Validar Ticket</h3>
            <p className="text-xs text-gray-500 text-center mb-3">Verifique si un ticket es valido y esta dentro del periodo permitido</p>
            <input value={validateCode} onChange={(e) => setValidateCode(e.target.value)} placeholder="Codigo del ticket" className="w-full px-4 py-3 border border-purple-200 rounded-xl text-sm font-bold mb-3" />
            <button onClick={validateTicketByCode} className="w-full py-2.5 bg-purple-600 text-white rounded-xl font-bold text-sm hover:bg-purple-700 mb-3">Validar</button>
            {validationResult && (
              <div className={`rounded-xl p-3 text-center ${validationResult.valid ? "bg-[var(--bv-primary-light)] border border-[var(--bv-primary-soft)]" : "bg-red-50 border border-red-200"}`}>
                {validationResult.valid ? (
                  <>
                    <CheckCircle size={24} className="mx-auto text-[var(--bv-primary)] mb-1" />
                    <p className="text-sm font-bold text-[var(--bv-primary-dark)]">Ticket VALIDO</p>
                    {validationResult.warning && <p className="text-xs text-yellow-600 mt-1">{validationResult.warning}</p>}
                  </>
                ) : (
                  <>
                    <X size={24} className="mx-auto text-red-600 mb-1" />
                    <p className="text-sm font-bold text-red-700">{validationResult.reason || "Invalido"}</p>
                  </>
                )}
              </div>
            )}
            <button onClick={() => { setShowValidateModal(false); setValidateCode(""); setValidationResult(null); }} className="w-full mt-3 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-bold text-sm">Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}
