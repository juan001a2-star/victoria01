import { useState } from "react";
import type { SessionUser } from "@/store";
import { formatMoney, logAudit, calculateNetDeduction } from "@/store";
import { trpc } from "@/providers/trpc";
import { t } from "@/i18n";
import { pushAppNotification } from "@/sections/SettingsScreen";
import {
  Ticket, Users, Plus, ArrowLeft, Trash2,
  Settings, Trophy, Ban, BarChart3, ChevronRight, X, DollarSign, Wallet, Percent,
  ChevronLeft, UserPlus, Pencil, Shield, Lock, Check, Smartphone
} from "lucide-react";

type AdminSection = "menu" | "loterias" | "grupos" | "usuarios" | "premios" | "ganadores" | "anular" | "reportes" | "limites" | "config" | "dispositivos";

interface AdminPanelProps {
  user: SessionUser;
}

const MENU_ITEMS = [
  { id: "loterias" as AdminSection, labelKey: "admin_menu_loterias", descKey: "admin_menu_loterias_desc", icon: Ticket, roles: ["admin"] },
  { id: "grupos" as AdminSection, labelKey: "admin_menu_grupos", descKey: "admin_menu_grupos_desc", icon: Users, roles: ["admin"] },
  { id: "usuarios" as AdminSection, labelKey: "admin_menu_usuarios", descKey: "admin_menu_usuarios_desc", icon: Users, roles: ["admin", "supervisor"] },
  { id: "premios" as AdminSection, labelKey: "admin_menu_premios", descKey: "admin_menu_premios_desc", icon: DollarSign, roles: ["admin"] },
  { id: "ganadores" as AdminSection, labelKey: "admin_menu_ganadores", descKey: "admin_menu_ganadores_desc", icon: Trophy, roles: ["admin", "supervisor", "collector"] },
  { id: "anular" as AdminSection, labelKey: "admin_menu_anular", descKey: "admin_menu_anular_desc", icon: Ban, roles: ["admin", "supervisor"] },
  { id: "reportes" as AdminSection, labelKey: "admin_menu_reportes", descKey: "admin_menu_reportes_desc", icon: BarChart3, roles: ["admin", "supervisor", "collector"] },
  { id: "limites" as AdminSection, labelKey: "admin_menu_limites", descKey: "admin_menu_limites_desc", icon: Ban, roles: ["admin"] },
  { id: "config" as AdminSection, labelKey: "admin_menu_config", descKey: "admin_menu_config_desc", icon: Settings, roles: ["admin"] },
  { id: "dispositivos" as AdminSection, labelKey: "admin_menu_devices", descKey: "admin_menu_devices_desc", icon: Smartphone, roles: ["admin"] },
];

export default function AdminPanel({ user }: AdminPanelProps) {
  const lang = user.language || "es";
  const [section, setSection] = useState<AdminSection>("menu");
  const canAccess = (id: AdminSection) => MENU_ITEMS.find((m) => m.id === id)?.roles.includes(user.role) ?? false;
  return (
    <div className="h-full flex flex-col">
      {section === "menu" ? (
        <MenuScreen onNavigate={setSection} role={user.role} lang={lang} />
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-white sticky top-0 z-10">
            <button onClick={() => setSection("menu")} className="p-1.5 hover:bg-gray-100 rounded-lg">
              <ArrowLeft size={20} className="text-gray-600" />
            </button>
            <h2 className="text-lg font-bold text-gray-900">
              {t(lang, MENU_ITEMS.find((m) => m.id === section)?.labelKey || "")}
            </h2>
          </div>
          {section === "loterias" && (canAccess("loterias") ? <LoteriasSection user={user} /> : <AccessDenied lang={lang} />)}
          {section === "grupos" && (canAccess("grupos") ? <GruposSection user={user} /> : <AccessDenied lang={lang} />)}
          {section === "usuarios" && (canAccess("usuarios") ? <UsuariosSection user={user} /> : <AccessDenied lang={lang} />)}
          {section === "premios" && (canAccess("premios") ? <PremiosSection user={user} /> : <AccessDenied lang={lang} />)}
          {section === "ganadores" && (canAccess("ganadores") ? <GanadoresSection user={user} /> : <AccessDenied lang={lang} />)}
          {section === "anular" && (canAccess("anular") ? <AnularSection user={user} /> : <AccessDenied lang={lang} />)}
          {section === "reportes" && (canAccess("reportes") ? <ReportesGrupoSection user={user} /> : <AccessDenied lang={lang} />)}
          {section === "limites" && (canAccess("limites") ? <LimitesSection user={user} /> : <AccessDenied lang={lang} />)}
          {section === "config" && (canAccess("config") ? <ConfigSection user={user} /> : <AccessDenied lang={lang} />)}
          {section === "dispositivos" && (canAccess("dispositivos") ? <DispositivosSection user={user} /> : <AccessDenied lang={lang} />)}
        </div>
      )}
    </div>
  );
}

function AccessDenied({ lang }: { lang: any }) {
  return <p className="p-6 text-center text-sm text-gray-500">{t(lang, "admin_access_denied")}</p>;
}

function MenuScreen({ onNavigate, role, lang }: { onNavigate: (s: AdminSection) => void; role: string; lang: any }) {
  const visibleItems = MENU_ITEMS.filter((item) => item.roles.includes(role));
  const panelTitleKey = role === "collector" ? "admin_panel_collector" : role === "supervisor" ? "admin_panel_supervisor" : "admin_panel_admin";
  return (
    <div className="h-full overflow-y-auto custom-scrollbar px-4 py-4 space-y-2">
      <h2 className="text-xl font-bold text-gray-900 mb-4">{t(lang, panelTitleKey)}</h2>
      {visibleItems.map((item) => (
        <button key={item.id} onClick={() => onNavigate(item.id)}
          className="w-full flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 hover:border-[var(--bv-primary-soft)] shadow-sm transition-all text-left">
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
            <item.icon size={20} className="text-[var(--bv-primary)]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900">{t(lang, item.labelKey)}</p>
            <p className="text-xs text-gray-500">{t(lang, item.descKey)}</p>
          </div>
          <ChevronRight size={16} className="text-gray-300 shrink-0" />
        </button>
      ))}
    </div>
  );
}

// ─── LOTERIAS ──────────────────────────────────────────────────────
const DAY_LABELS: Record<string, string> = { mon: "Lun", tue: "Mar", wed: "Mie", thu: "Jue", fri: "Vie", sat: "Sab", sun: "Dom" };

function LoteriasSection({ user }: { user: SessionUser }) {
  const lang = user.language || "es";
  const utils = trpc.useUtils();
  const lotteryList = trpc.lottery.list.useQuery();
  const createLottery = trpc.lottery.create.useMutation({ onSuccess: () => utils.lottery.list.invalidate() });
  const updateLottery = trpc.lottery.update.useMutation({ onSuccess: () => utils.lottery.list.invalidate() });
  const deleteLottery = trpc.lottery.delete.useMutation({ onSuccess: () => utils.lottery.list.invalidate() });

  const [msg, setMsg] = useState("");
  const [name, setName] = useState("");
  const [drawTime, setDrawTime] = useState("12:00");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [schedules, setSchedules] = useState<Record<number, Record<string, { open: string; close: string }>>>({});
  const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  const lotteries = lotteryList.data || [];

  const getSchedule = (l: any): Record<string, { open: string; close: string }> => {
    if (schedules[l.id]) return schedules[l.id];
    if (l.schedule) { try { return JSON.parse(l.schedule); } catch { } }
    return { mon: { open: "06:00", close: l.closeTime || "20:00" }, tue: { open: "06:00", close: l.closeTime || "20:00" }, wed: { open: "06:00", close: l.closeTime || "20:00" }, thu: { open: "06:00", close: l.closeTime || "20:00" }, fri: { open: "06:00", close: l.closeTime || "20:00" }, sat: { open: "06:00", close: l.closeTime || "20:00" }, sun: { open: "06:00", close: l.closeTime || "20:00" } };
  };

  const updateSchedule = (lotteryId: number, day: string, field: "open" | "close", value: string) => {
    setSchedules(prev => {
      const current = prev[lotteryId] || getSchedule(lotteries.find((l: any) => l.id === lotteryId));
      return { ...prev, [lotteryId]: { ...current, [day]: { ...current[day], [field]: value } } };
    });
  };

  const saveSchedule = (lotteryId: number) => {
    const sched = schedules[lotteryId];
    if (sched) {
      updateLottery.mutate({ id: lotteryId, schedule: JSON.stringify(sched) }, {
        onSuccess: () => showMsg(t(lang, "ls_schedule_saved")),
        onError: (err) => showMsg("Error: " + err.message),
      });
    }
  };

  const add = () => {
    if (!name) { showMsg(t(lang, "ls_enter_name")); return; }
    const defaultSched = JSON.stringify({
      mon: { open: "06:00", close: drawTime }, tue: { open: "06:00", close: drawTime }, wed: { open: "06:00", close: drawTime },
      thu: { open: "06:00", close: drawTime }, fri: { open: "06:00", close: drawTime }, sat: { open: "06:00", close: drawTime }, sun: { open: "06:00", close: drawTime },
    });
    createLottery.mutate({ name, drawTime, openTime: "06:00", closeTime: drawTime, schedule: defaultSched }, {
      onSuccess: () => { setName(""); showMsg(t(lang, "ls_lottery_created")); },
      onError: (err) => showMsg("Error: " + err.message),
    });
  };

  const toggle = (id: number, current: boolean) => {
    updateLottery.mutate({ id, active: !current });
  };

  const [editingNameId, setEditingNameId] = useState<number | null>(null);
  const [editNameValue, setEditNameValue] = useState("");
  const startEditName = (l: any) => { setEditingNameId(l.id); setEditNameValue(l.name); };
  const saveEditName = (id: number) => {
    if (!editNameValue.trim()) { showMsg(t(lang, "ls_name_empty")); return; }
    updateLottery.mutate({ id, name: editNameValue.trim() }, {
      onSuccess: () => { setEditingNameId(null); showMsg(t(lang, "ls_name_updated")); },
      onError: (err) => showMsg("Error: " + err.message),
    });
  };
  const removeLottery = (id: number) => {
    if (!confirm(t(lang, "ls_delete_confirm"))) return;
    deleteLottery.mutate({ id }, {
      onSuccess: (res: any) => { showMsg(res?.deactivated ? t(lang, "ls_deactivated") : t(lang, "ls_deleted")); },
      onError: (err) => showMsg("Error: " + err.message),
    });
  };

  return (
    <div className="px-4 py-4 space-y-4">
      {msg && <div className="bg-[var(--bv-primary)] text-white px-3 py-2 rounded-lg text-sm text-center">{msg}</div>}
      <div className="bg-white rounded-xl border border-green-100 p-4 shadow-sm space-y-3">
        <h3 className="text-sm font-bold text-[var(--bv-primary-dark)]">{t(lang, "ls_new_lottery")}</h3>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t(lang, "ls_name_placeholder")} className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm" />
        <input type="time" value={drawTime} onChange={(e) => setDrawTime(e.target.value)} className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm" />
        <button onClick={add} className="w-full py-2.5 bg-[var(--bv-primary)] text-white rounded-lg font-bold text-sm hover:bg-[var(--bv-primary-dark)] flex items-center justify-center gap-2">
          <Plus size={16} /> {t(lang, "ls_create")}
        </button>
      </div>
      <div className="space-y-3">
        {lotteries.map((l: any) => (
          <div key={l.id} className="bg-white rounded-xl border border-gray-100 shadow-sm">
            <div className="p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-gray-900">{l.name}</p>
                <p className="text-[10px] text-gray-500">{t(lang, "ls_draw")}: {l.drawTime}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => toggle(l.id, l.active)} className={`px-2 py-1 rounded text-[10px] font-bold ${l.active ? "bg-green-100 text-[var(--bv-primary-dark)]" : "bg-gray-100 text-gray-500"}`}>
                  {l.active ? t(lang, "ls_active") : t(lang, "ls_inactive")}
                </button>
                <button onClick={() => startEditName(l)} className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500"><Pencil size={14} /></button>
                <button onClick={() => setExpandedId(expandedId === l.id ? null : l.id)} className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500">
                  <Settings size={14} />
                </button>
                <button onClick={() => removeLottery(l.id)} className="p-1.5 rounded-lg hover:bg-red-50"><Trash2 size={16} className="text-red-500" /></button>
              </div>
            </div>
            {editingNameId === l.id && (
              <div className="px-3 pb-3 flex items-center gap-2">
                <input value={editNameValue} onChange={(e) => setEditNameValue(e.target.value)} className="flex-1 px-3 py-2 border border-blue-200 rounded-lg text-sm" autoFocus />
                <button onClick={() => saveEditName(l.id)} className="p-2 bg-green-100 rounded-lg"><Check size={16} className="text-[var(--bv-primary-dark)]" /></button>
                <button onClick={() => setEditingNameId(null)} className="p-2 bg-gray-100 rounded-lg"><X size={16} className="text-gray-600" /></button>
              </div>
            )}
            {expandedId === l.id && (
              <div className="px-3 pb-3 border-t border-gray-100 pt-2">
                <p className="text-xs font-bold text-blue-700 mb-2">{t(lang, "ls_schedule_title")}</p>
                <div className="space-y-1.5">
                  {Object.entries(DAY_LABELS).map(([day, label]) => {
                    const sched = getSchedule(l);
                    return (
                      <div key={day} className="flex items-center gap-2">
                        <span className="text-[10px] font-bold w-8 text-gray-600">{label}</span>
                        <input type="time" value={sched[day]?.open || "06:00"} onChange={(e) => updateSchedule(l.id, day, "open", e.target.value)} className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded" />
                        <span className="text-gray-400 text-xs">a</span>
                        <input type="time" value={sched[day]?.close || "20:00"} onChange={(e) => updateSchedule(l.id, day, "close", e.target.value)} className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded" />
                      </div>
                    );
                  })}
                </div>
                <button onClick={() => saveSchedule(l.id)} className="w-full mt-2 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700">{t(lang, "ls_save_schedule")}</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── GRUPOS ────────────────────────────────────────────────────────
function GruposSection({ user }: { user: SessionUser }) {
  const lang = user.language || "es";
  const utils = trpc.useUtils();
  const groupList = trpc.group.list.useQuery();
  const createGroup = trpc.group.create.useMutation({ onSuccess: () => utils.group.list.invalidate() });
  const updateGroup = trpc.group.update.useMutation({ onSuccess: () => { utils.group.list.invalidate(); utils.lotteryUser.list.invalidate(); } });
  const deleteGroup = trpc.group.delete.useMutation({ onSuccess: () => utils.group.list.invalidate() });
  const userList = trpc.lotteryUser.list.useQuery();
  const updateUser = trpc.lotteryUser.update.useMutation({ onSuccess: () => utils.lotteryUser.list.invalidate() });
  const updateCredit = trpc.lotteryUser.updateCredit.useMutation({ onSuccess: () => utils.lotteryUser.list.invalidate() });

  const [msg, setMsg] = useState("");
  const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };
  const [name, setName] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [editGroupName, setEditGroupName] = useState("");
  const [showAddUser, setShowAddUser] = useState(false);
  const [editMember, setEditMember] = useState<any>(null);
  const [editMemberData, setEditMemberData] = useState({ name: "", username: "", password: "", phone: "", role: "user", credit: "", commission: "", active: true });
  const [creditModal, setCreditModal] = useState<any>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditAction, setCreditAction] = useState<"add" | "subtract">("add");

  const groups = groupList.data || [];
  const allUsers = userList.data || [];
  const roleLabels: Record<string, string> = { admin: t(lang, "role_admin"), supervisor: t(lang, "role_supervisor"), collector: t(lang, "role_collector"), user: t(lang, "role_user") };

  const add = () => {
    if (!name) { showMsg(t(lang, "gp_enter_name")); return; }
    createGroup.mutate({ name, maxSalesPerDay: "50000" }, {
      onSuccess: () => { setName(""); showMsg(t(lang, "gp_group_created")); },
      onError: (err) => showMsg("Error: " + err.message),
    });
  };

  const updateGroupNameFn = () => {
    if (!editGroupName.trim() || !selectedGroup) return;
    updateGroup.mutate({ id: selectedGroup.id, name: editGroupName });
    setSelectedGroup({ ...selectedGroup, name: editGroupName });
    showMsg(t(lang, "gp_name_updated"));
  };

  const removeUserFromGroup = (userId: number) => {
    if (!confirm(t(lang, "gp_remove_confirm"))) return;
    updateUser.mutate({ id: userId, groupId: null }, {
      onSuccess: () => showMsg(t(lang, "gp_user_removed")),
      onError: (err) => showMsg("Error: " + err.message),
    });
  };

  const addUserToGroup = (userId: number) => {
    if (!selectedGroup) return;
    updateUser.mutate({ id: userId, groupId: selectedGroup.id });
    showMsg(t(lang, "gp_user_added"));
  };

  const handleEditMember = () => {
    if (!editMember) return;
    const payload: any = { id: editMember.id };
    if (editMemberData.name !== editMember.name) payload.name = editMemberData.name;
    if (editMemberData.username !== editMember.username) payload.username = editMemberData.username;
    if (editMemberData.password) payload.password = editMemberData.password;
    if (editMemberData.phone !== (editMember.phone || "")) payload.phone = editMemberData.phone || null;
    if (editMemberData.role !== editMember.role) payload.role = editMemberData.role;
    if (editMemberData.credit !== String(editMember.credit)) payload.credit = editMemberData.credit;
    if (editMemberData.active !== !!editMember.active) payload.active = editMemberData.active;
    updateUser.mutate(payload);
    setEditMember(null);
    showMsg(t(lang, "gp_user_updated"));
  };

  const handleCreditChange = () => {
    if (!creditModal || !creditAmount || Number(creditAmount) <= 0) { showMsg(t(lang, "gp_invalid_amount")); return; }
    const amount = Number(creditAmount);
    const currentCredit = Number(creditModal.credit) || 0;
    const newCredit = creditAction === "add" ? currentCredit + amount : Math.max(0, currentCredit - amount);
    updateCredit.mutate({ id: creditModal.id, credit: String(newCredit) });
    setCreditModal(null); setCreditAmount("");
    logAudit({ type: "credit_add", userId: creditModal.id, userName: creditModal.name, groupId: creditModal.groupId, amount, description: `Credito ${creditAction === "add" ? "agregado" : "reducido"} en $${formatMoney(amount)}` });
    showMsg(`${creditAction === "add" ? t(lang, "gp_credit_added") : t(lang, "gp_credit_reduced")} $${formatMoney(amount)}!`);
  };

  // GROUP DETAIL VIEW
  if (selectedGroup) {
    const groupUsers = allUsers.filter((u: any) => u.groupId === selectedGroup.id);
    const availableUsers = allUsers.filter((u: any) => !u.groupId && u.role !== "admin");

    return (
      <div className="px-4 py-4 space-y-4">
        {msg && <div className="bg-[var(--bv-primary)] text-white px-3 py-2 rounded-lg text-sm text-center">{msg}</div>}
        <button onClick={() => setSelectedGroup(null)} className="flex items-center gap-1.5 text-sm text-[var(--bv-primary-dark)] font-bold">
          <ChevronLeft size={18} /> {t(lang, "gp_back_to_groups")}
        </button>
        <div className="bg-white rounded-xl border border-green-100 p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-[var(--bv-primary-dark)]">{t(lang, "gp_group_info")}</h3>
          <div className="flex gap-2">
            <input value={editGroupName} onChange={(e) => setEditGroupName(e.target.value)} className="flex-1 px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm font-bold" />
            <button onClick={updateGroupNameFn} className="px-3 py-2 bg-[var(--bv-primary)] text-white rounded-lg text-sm font-bold hover:bg-[var(--bv-primary-dark)]"><Pencil size={14} /></button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] px-2 py-1 bg-green-100 text-[var(--bv-primary-dark)] rounded-full font-bold">{groupUsers.length} usuario(s)</span>
            <span className="text-[10px] px-2 py-1 bg-blue-100 text-blue-700 rounded-full font-bold">ID: {selectedGroup.id}</span>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-bold text-gray-900">{t(lang, "gp_members_title")}</h4>
          {groupUsers.length === 0 && <p className="text-xs text-gray-400 text-center py-4">{t(lang, "gp_no_members")}</p>}
          {groupUsers.map((u: any) => (
            <div key={u.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-900 truncate">{u.name} <span className="text-[10px] font-normal text-[var(--bv-primary)]">({u.bankNumber})</span></p>
                  <p className="text-[10px] text-gray-500">{u.username} | {roleLabels[u.role] || u.role}{u.role === "user" ? ` | $${formatMoney(u.credit)} | Com: ${u.commission || 0}%` : ""}</p>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${u.active ? "bg-green-100 text-[var(--bv-primary-dark)]" : "bg-gray-100 text-gray-500"}`}>{u.active ? t(lang, "gp_active") : t(lang, "gp_blocked")}</span>
              </div>
              <div className="flex gap-1.5 mt-2 flex-wrap">
                <button onClick={() => { setEditMember(u); setEditMemberData({ name: u.name, username: u.username, password: "", phone: u.phone || "", role: u.role, credit: String(u.credit), commission: String(u.commission || "0"), active: !!u.active }); }} className="flex-1 py-1.5 bg-[var(--bv-primary-light)] text-[var(--bv-primary-dark)] rounded-lg text-[11px] font-bold hover:bg-[var(--bv-primary-soft)]">{t(lang, "gp_edit")}</button>
                {u.role === "user" && <button onClick={() => { setCreditModal(u); setCreditAmount(""); setCreditAction("add"); }} className="flex-1 py-1.5 bg-yellow-50 text-yellow-700 rounded-lg text-[11px] font-bold hover:bg-yellow-100">{t(lang, "gp_credit")}</button>}
                <button onClick={() => removeUserFromGroup(u.id)} className="flex-1 py-1.5 bg-red-50 text-red-600 rounded-lg text-[11px] font-bold hover:bg-red-100">{t(lang, "gp_remove")}</button>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          {!showAddUser ? (
            <button onClick={() => setShowAddUser(true)} className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700 flex items-center justify-center gap-2">
              <UserPlus size={16} /> {t(lang, "gp_add_existing_user")}
            </button>
          ) : (
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-3 space-y-2">
              <h4 className="text-sm font-bold text-blue-700">{t(lang, "gp_users_no_group")}</h4>
              {availableUsers.length === 0 && <p className="text-xs text-gray-400">{t(lang, "gp_no_available_users")}</p>}
              {availableUsers.map((u: any) => (
                <button key={u.id} onClick={() => { addUserToGroup(u.id); setShowAddUser(false); }} className="w-full flex items-center justify-between p-2 bg-white rounded-lg border border-blue-100 hover:border-blue-300 transition-all text-left">
                  <span className="text-sm font-medium text-gray-900">{u.name} <span className="text-[10px] text-gray-500">({u.username} - {roleLabels[u.role]})</span></span>
                  <UserPlus size={14} className="text-blue-600" />
                </button>
              ))}
              <button onClick={() => setShowAddUser(false)} className="w-full py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold">{t(lang, "gp_cancel")}</button>
            </div>
          )}
        </div>

        {editMember && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[85%] flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-gray-100"><h3 className="font-bold text-lg text-gray-900">{t(lang, "gp_edit_user")}</h3><button onClick={() => setEditMember(null)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={20} className="text-gray-500" /></button></div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
                <div><label className="text-[10px] font-medium text-gray-600 mb-1 block">{t(lang, "gp_name")}</label><input value={editMemberData.name} onChange={(e) => setEditMemberData({ ...editMemberData, name: e.target.value })} className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm" /></div>
                <div><label className="text-[10px] font-medium text-gray-600 mb-1 block">{t(lang, "gp_username")}</label><input value={editMemberData.username} onChange={(e) => setEditMemberData({ ...editMemberData, username: e.target.value })} className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm" /></div>
                <div><label className="text-[10px] font-medium text-gray-600 mb-1 block">{t(lang, "gp_password_label")}</label><input type="password" value={editMemberData.password} onChange={(e) => setEditMemberData({ ...editMemberData, password: e.target.value })} placeholder={t(lang, "gp_new_password")} className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm" /></div>
                <div><label className="text-[10px] font-medium text-gray-600 mb-1 block">{t(lang, "gp_phone")}</label><input value={editMemberData.phone} onChange={(e) => setEditMemberData({ ...editMemberData, phone: e.target.value })} className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm" /></div>
                <div><label className="text-[10px] font-medium text-gray-600 mb-1 block">{t(lang, "gp_role")}</label><select value={editMemberData.role} onChange={(e) => setEditMemberData({ ...editMemberData, role: e.target.value })} className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm"><option value="user">{t(lang, "role_user")}</option><option value="collector">{t(lang, "role_collector")}</option><option value="supervisor">{t(lang, "role_supervisor")}</option></select></div>
                {editMemberData.role === "user" && (
                  <>
                    <div><label className="text-[10px] font-medium text-gray-600 mb-1 block">{t(lang, "gp_credit_label")}</label><input type="number" value={editMemberData.credit} onChange={(e) => setEditMemberData({ ...editMemberData, credit: e.target.value })} className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm" /></div>
                    <div><label className="text-[10px] font-medium text-gray-600 mb-1 block">{t(lang, "gp_commission_label")}</label><input type="number" value={editMemberData.commission} onChange={(e) => setEditMemberData({ ...editMemberData, commission: e.target.value })} className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm" /></div>
                  </>
                )}
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editMemberData.active} onChange={(e) => setEditMemberData({ ...editMemberData, active: e.target.checked })} className="w-4 h-4 accent-green-600" /><span className={editMemberData.active ? "text-[var(--bv-primary-dark)] font-medium" : "text-gray-500"}>{editMemberData.active ? t(lang, "gp_active") : t(lang, "gp_blocked")}</span></label>
              </div>
              <div className="p-3 border-t border-gray-100"><button onClick={handleEditMember} className="w-full py-2.5 bg-[var(--bv-primary)] text-white rounded-lg font-bold text-sm hover:bg-[var(--bv-primary-dark)]">{t(lang, "gp_save_changes")}</button></div>
            </div>
          </div>
        )}

        {creditModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
              <div className="text-center mb-4">
                <div className="w-14 h-14 mx-auto bg-yellow-100 rounded-full flex items-center justify-center mb-2"><Wallet size={28} className="text-yellow-600" /></div>
                <h3 className="font-bold text-lg text-gray-900">{t(lang, "gp_manage_credit")}</h3>
                <p className="text-sm text-gray-500">{creditModal.name}</p>
                <p className="text-sm font-bold text-[var(--bv-primary-dark)] mt-1">{t(lang, "gp_current_credit")}: ${formatMoney(creditModal.credit)}</p>
              </div>
              <div className="flex gap-2 mb-3">
                <button onClick={() => setCreditAction("add")} className={`flex-1 py-2 rounded-lg text-sm font-bold ${creditAction === "add" ? "bg-[var(--bv-primary)] text-white" : "bg-gray-100 text-gray-600"}`}>{t(lang, "gp_add")}</button>
                <button onClick={() => setCreditAction("subtract")} className={`flex-1 py-2 rounded-lg text-sm font-bold ${creditAction === "subtract" ? "bg-red-600 text-white" : "bg-gray-100 text-gray-600"}`}>{t(lang, "gp_reduce")}</button>
              </div>
              <input type="number" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} placeholder={t(lang, "gp_amount_placeholder")} className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm font-bold text-center text-lg mb-3" autoFocus />
              <div className="flex gap-2">
                <button onClick={() => setCreditModal(null)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm hover:bg-gray-200">{t(lang, "gp_cancel")}</button>
                <button onClick={handleCreditChange} className={`flex-1 py-2.5 rounded-xl font-bold text-sm text-white ${creditAction === "add" ? "bg-[var(--bv-primary)] hover:bg-[var(--bv-primary-dark)]" : "bg-red-600 hover:bg-red-700"}`}>{creditAction === "add" ? t(lang, "gp_add") : t(lang, "gp_reduce")}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // GROUP LIST VIEW
  return (
    <div className="px-4 py-4 space-y-4">
      {msg && <div className="bg-[var(--bv-primary)] text-white px-3 py-2 rounded-lg text-sm text-center">{msg}</div>}
      {user.role === "admin" && (
      <div className="bg-white rounded-xl border border-green-100 p-4 shadow-sm space-y-3">
        <h3 className="text-sm font-bold text-[var(--bv-primary-dark)]">{t(lang, "gp_new_group")}</h3>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t(lang, "gp_name_placeholder")} className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm" />
        <button onClick={add} className="w-full py-2.5 bg-[var(--bv-primary)] text-white rounded-lg font-bold text-sm hover:bg-[var(--bv-primary-dark)] flex items-center justify-center gap-2">
          <Plus size={16} /> {t(lang, "gp_create_group")}
        </button>
      </div>
      )}
      <div className="space-y-2">
        {groups.map((g: any) => {
          const memberCount = allUsers.filter((u: any) => u.groupId === g.id).length;
          return (
            <div key={g.id} className="flex items-center gap-2">
              <button onClick={() => { setSelectedGroup(g); setEditGroupName(g.name); setShowAddUser(false); }} className="flex-1 flex items-center justify-between p-3 bg-white rounded-xl border border-gray-100 shadow-sm hover:border-[var(--bv-primary-soft)] transition-all text-left">
                <div>
                  <p className="text-sm font-bold text-gray-900">{g.name}</p>
                  <p className="text-[10px] text-gray-500">{memberCount} miembro(s) | {t(lang, "gp_tap_details")}</p>
                </div>
                <ChevronRight size={16} className="text-gray-300" />
              </button>
              <button onClick={() => { if (confirm(`${t(lang, "gp_delete_group_confirm")} "${g.name}"?`)) deleteGroup.mutate({ id: g.id }); }} className="p-3 bg-white rounded-xl border border-red-100 shadow-sm hover:bg-red-50 transition-all shrink-0">
                <Trash2 size={16} className="text-red-500" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ─── USUARIOS ──────────────────────────────────────────────────────
function UsuariosSection({ user }: { user: SessionUser }) {
  const lang = user.language || "es";
  const utils = trpc.useUtils();
  const userList = trpc.lotteryUser.list.useQuery();
  const createUser = trpc.lotteryUser.create.useMutation({ onSuccess: () => utils.lotteryUser.list.invalidate() });
  const updateUser = trpc.lotteryUser.update.useMutation({ onSuccess: () => utils.lotteryUser.list.invalidate() });
  const deleteUser = trpc.lotteryUser.deleteScoped.useMutation({ onSuccess: () => utils.lotteryUser.list.invalidate() });
  const updateCredit = trpc.lotteryUser.updateCredit.useMutation({ onSuccess: () => utils.lotteryUser.list.invalidate() });
  const groupList = trpc.group.list.useQuery();

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: "", username: "", password: "", phone: "", role: "user" as any, groupId: "", credit: "5000", commission: "10" });
  const [msg, setMsg] = useState("");
  const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };
  const [search, setSearch] = useState("");
  const [viewUser, setViewUser] = useState<any>(null);
  const [editUser, setEditUser] = useState<any>(null);
  const [editData, setEditData] = useState({ name: "", username: "", password: "", phone: "", role: "user", groupId: "", credit: "5000", commission: "10", active: true });
  const [creditModal, setCreditModal] = useState<any>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditAction, setCreditAction] = useState<"add" | "subtract">("add");
  const [deleteUserData, setDeleteUserData] = useState<any>(null);

  const users = userList.data || [];
  const groups = groupList.data || [];
  const roleLabels: Record<string, string> = { admin: t(lang, "role_admin_full"), supervisor: t(lang, "role_supervisor"), collector: t(lang, "role_collector"), user: t(lang, "role_user") };

  const filtered = search ? users.filter((u: any) => u.name.toLowerCase().includes(search.toLowerCase()) || u.username.toLowerCase().includes(search.toLowerCase())) : users;

  const handleCreate = () => {
    if (!formData.name || !formData.username || !formData.password) { showMsg(t(lang, "us_required_fields")); return; }
    if (formData.password.length < 4) { showMsg(t(lang, "us_password_length")); return; }
    createUser.mutate({
      name: formData.name,
      username: formData.username,
      password: formData.password,
      phone: formData.phone || undefined,
      role: formData.role,
      groupId: formData.groupId ? Number(formData.groupId) : undefined,
      credit: formData.credit,
      commission: formData.commission,
    }, {
      onSuccess: () => {
        setShowForm(false);
        setFormData({ name: "", username: "", password: "", phone: "", role: "user", groupId: "", credit: "5000", commission: "10" });
        showMsg(t(lang, "us_user_created"));
      },
      onError: (err) => showMsg("Error: " + err.message),
    });
  };

  const handleEditSave = () => {
    if (!editUser) return;
    const payload: any = { id: editUser.id };
    if (editData.name !== editUser.name) payload.name = editData.name;
    if (editData.username !== editUser.username) payload.username = editData.username;
    if (editData.password) payload.password = editData.password;
    if (editData.phone !== (editUser.phone || "")) payload.phone = editData.phone || null;
    if (editData.role !== editUser.role) payload.role = editData.role;
    if (editData.groupId !== (editUser.groupId || "")) payload.groupId = editData.groupId ? Number(editData.groupId) : 0;
    if (editData.credit !== String(editUser.credit)) payload.credit = editData.credit;
    if (editData.commission !== String(editUser.commission || "0")) payload.commission = editData.commission;
    if (editData.active !== !!editUser.active) payload.active = editData.active;
    updateUser.mutate(payload);
    setEditUser(null);
    showMsg(t(lang, "us_user_updated"));
  };

  const handleCreditChange = () => {
    if (!creditModal || !creditAmount || Number(creditAmount) <= 0) { showMsg(t(lang, "us_invalid_amount")); return; }
    const amount = Number(creditAmount);
    const currentCredit = Number(creditModal.credit) || 0;
    const newCredit = creditAction === "add" ? currentCredit + amount : Math.max(0, currentCredit - amount);
    updateCredit.mutate({ id: creditModal.id, credit: String(newCredit) });
    setCreditModal(null); setCreditAmount("");
    showMsg(`${creditAction === "add" ? t(lang, "us_credit_increased") : t(lang, "us_credit_reduced")} $${formatMoney(amount)}!`);
  };

  const handleDelete = () => {
    if (!deleteUserData) return;
    deleteUser.mutate({ id: deleteUserData.id });
    setDeleteUserData(null);
    showMsg(t(lang, "us_user_deleted"));
  };

  const openEdit = (u: any) => {
    setEditData({ name: u.name, username: u.username, password: "", phone: u.phone || "", role: u.role, groupId: u.groupId || "", credit: String(u.credit), commission: String(u.commission || "0"), active: !!u.active });
    setEditUser(u);
  };

  return (
    <div className="px-4 py-4 space-y-4">
      {msg && <div className="bg-[var(--bv-primary)] text-white px-3 py-2 rounded-lg text-sm text-center">{msg}</div>}
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t(lang, "us_search_placeholder")} className="w-full px-3 py-2.5 border border-[var(--bv-primary-soft)] rounded-lg text-sm focus:outline-none focus:border-[var(--bv-primary)]" />
      {user.role === "admin" && (
        <button onClick={() => setShowForm(!showForm)} className="w-full py-2.5 bg-[var(--bv-primary)] text-white rounded-lg font-bold text-sm hover:bg-[var(--bv-primary-dark)] flex items-center justify-center gap-2">
          <Plus size={16} /> {showForm ? t(lang, "us_cancel") : t(lang, "us_create_user")}
        </button>
      )}
      {user.role === "admin" && showForm && (
        <div className="bg-white rounded-xl border border-green-100 p-4 shadow-sm space-y-3">
          <h4 className="text-sm font-bold text-[var(--bv-primary-dark)]">{t(lang, "us_new_user")}</h4>
          <input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder={t(lang, "us_full_name")} className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm" />
          <input value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} placeholder={t(lang, "us_username")} className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm" autoCapitalize="none" />
          <input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder={t(lang, "us_password")} className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm" />
          <input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder={t(lang, "us_phone")} className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm" />
          <select value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })} className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm">
            <option value="user">{t(lang, "role_user")}</option><option value="collector">{t(lang, "role_collector")}</option><option value="supervisor">{t(lang, "role_supervisor")}</option><option value="admin">{t(lang, "role_admin_full")}</option>
          </select>
          <select value={formData.groupId} onChange={(e) => setFormData({ ...formData, groupId: e.target.value })} className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm">
            <option value="">{t(lang, "us_no_group")}</option>{groups.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          {formData.role === "user" && (
            <>
              <input type="number" value={formData.credit} onChange={(e) => setFormData({ ...formData, credit: e.target.value })} placeholder={t(lang, "us_initial_credit")} className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm" />
              <input type="number" value={formData.commission} onChange={(e) => setFormData({ ...formData, commission: e.target.value })} placeholder={t(lang, "us_commission_pct")} className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm" />
            </>
          )}
          <button onClick={handleCreate} className="w-full py-2.5 bg-[var(--bv-primary)] text-white rounded-lg font-bold text-sm hover:bg-[var(--bv-primary-dark)]">{t(lang, "us_save_user")}</button>
        </div>
      )}
      <div className="space-y-2">
        {filtered.length > 0 ? filtered.map((u: any) => (
          <div key={u.id} className="p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-gray-900 truncate">{u.name} <span className="text-[10px] font-normal text-[var(--bv-primary)]">({u.bankNumber})</span></p>
                <p className="text-[10px] text-gray-500">{u.username} | {roleLabels[u.role] || u.role}{u.role === "user" ? ` | $${formatMoney(u.credit)} | Com: ${u.commission || 0}%` : ""}</p>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${u.active ? "bg-green-100 text-[var(--bv-primary-dark)]" : "bg-gray-100 text-gray-500"}`}>{u.active ? t(lang, "us_active") : t(lang, "us_blocked")}</span>
            </div>
            <div className="flex gap-1.5 mt-2 flex-wrap">
              <button onClick={() => setViewUser(u)} className="flex-1 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-[11px] font-bold hover:bg-blue-100">{t(lang, "us_view_info")}</button>
              <button onClick={() => openEdit(u)} className="flex-1 py-1.5 bg-[var(--bv-primary-light)] text-[var(--bv-primary-dark)] rounded-lg text-[11px] font-bold hover:bg-[var(--bv-primary-soft)]">{t(lang, "us_edit")}</button>
              <button onClick={() => { setCreditModal(u); setCreditAmount(""); setCreditAction("add"); }} className="flex-1 py-1.5 bg-yellow-50 text-yellow-700 rounded-lg text-[11px] font-bold hover:bg-yellow-100">{t(lang, "us_credit")}</button>
              <button
                onClick={() => {
                  updateUser.mutate(
                    { id: u.id, active: !u.active },
                    { onSuccess: () => showMsg(u.active ? "Usuario bloqueado" : "Usuario activado") }
                  );
                }}
                className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold ${u.active ? "bg-orange-50 text-orange-700 hover:bg-orange-100" : "bg-green-50 text-green-700 hover:bg-green-100"}`}
              >
                {u.active ? "Bloquear" : "Activar"}
              </button>
              {user.role === "admin" && (
                <button onClick={() => setDeleteUserData(u)} className="flex-1 py-1.5 bg-red-50 text-red-600 rounded-lg text-[11px] font-bold hover:bg-red-100">{t(lang, "us_delete")}</button>
              )}
            </div>
          </div>
        )) : <p className="text-sm text-gray-400 text-center py-4">{t(lang, "us_no_users_found")}</p>}
      </div>

      {viewUser && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[85%] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100"><h3 className="font-bold text-lg text-gray-900">{t(lang, "us_user_info")}</h3><button onClick={() => setViewUser(null)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={20} className="text-gray-500" /></button></div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
              <div className="text-center p-4 bg-[var(--bv-primary-light)] rounded-xl">
                <div className="w-16 h-16 mx-auto bg-[var(--bv-primary)] rounded-full flex items-center justify-center text-white text-xl font-bold mb-2">{viewUser.name.charAt(0).toUpperCase()}</div>
                <p className="font-bold text-gray-900">{viewUser.name}</p><p className="text-xs text-[var(--bv-primary)]">{viewUser.bankNumber}</p>
              </div>
              {[[t(lang, "us_name"), viewUser.name], [t(lang, "us_username_label"), viewUser.username], [t(lang, "us_phone_label"), viewUser.phone || t(lang, "us_not_registered")], [t(lang, "us_role"), roleLabels[viewUser.role] || viewUser.role], [t(lang, "us_bank"), viewUser.bankNumber], ...(viewUser.role === "user" ? [[t(lang, "us_credit_label"), `$${formatMoney(viewUser.credit)}`], [t(lang, "us_commission_label"), `${viewUser.commission || 0}%`]] : []), [t(lang, "us_status"), viewUser.active ? t(lang, "us_active") : t(lang, "us_blocked")]].map(([label, value]) => (
                <div key={label} className="flex justify-between py-2 border-b border-gray-50"><span className="text-xs text-gray-500">{label}</span><span className="text-sm font-medium text-gray-900">{value}</span></div>
              ))}
            </div>
            <div className="p-3 border-t border-gray-100"><button onClick={() => { setViewUser(null); openEdit(viewUser); }} className="w-full py-2.5 bg-[var(--bv-primary)] text-white rounded-lg font-bold text-sm hover:bg-[var(--bv-primary-dark)]">{t(lang, "us_edit_user")}</button></div>
          </div>
        </div>
      )}
      {editUser && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[85%] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100"><h3 className="font-bold text-lg text-gray-900">{t(lang, "us_edit_user")}</h3><button onClick={() => setEditUser(null)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={20} className="text-gray-500" /></button></div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
              <div><label className="text-[10px] font-medium text-gray-600 mb-1 block">{t(lang, "us_name")}</label><input value={editData.name} onChange={(e) => setEditData({ ...editData, name: e.target.value })} className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm" /></div>
              <div><label className="text-[10px] font-medium text-gray-600 mb-1 block">{t(lang, "us_username_label")}</label><input value={editData.username} onChange={(e) => setEditData({ ...editData, username: e.target.value })} className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm" /></div>
              <div><label className="text-[10px] font-medium text-gray-600 mb-1 block">{t(lang, "us_new_password_label")}</label><input type="password" value={editData.password} onChange={(e) => setEditData({ ...editData, password: e.target.value })} placeholder={t(lang, "us_new_password_placeholder")} className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm" /></div>
              <div><label className="text-[10px] font-medium text-gray-600 mb-1 block">{t(lang, "us_phone_label")}</label><input value={editData.phone} onChange={(e) => setEditData({ ...editData, phone: e.target.value })} className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm" /></div>
              <div><label className="text-[10px] font-medium text-gray-600 mb-1 block">{t(lang, "us_role")}</label><select value={editData.role} onChange={(e) => setEditData({ ...editData, role: e.target.value })} className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm"><option value="user">{t(lang, "role_user")}</option><option value="collector">{t(lang, "role_collector")}</option><option value="supervisor">{t(lang, "role_supervisor")}</option><option value="admin">{t(lang, "role_admin_full")}</option></select></div>
              <div><label className="text-[10px] font-medium text-gray-600 mb-1 block">{t(lang, "us_group")}</label><select value={editData.groupId} onChange={(e) => setEditData({ ...editData, groupId: e.target.value })} className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm"><option value="">{t(lang, "us_no_group")}</option>{groups.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
              {editData.role === "user" && (
                <>
                  <div><label className="text-[10px] font-medium text-gray-600 mb-1 block">{t(lang, "us_credit_label")}</label><input type="number" value={editData.credit} onChange={(e) => setEditData({ ...editData, credit: e.target.value })} className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm" /></div>
                  <div><label className="text-[10px] font-medium text-gray-600 mb-1 block">{t(lang, "us_commission_label")} %</label><input type="number" value={editData.commission} onChange={(e) => setEditData({ ...editData, commission: e.target.value })} placeholder={t(lang, "us_commission_placeholder")} className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm" /></div>
                </>
              )}
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editData.active} onChange={(e) => setEditData({ ...editData, active: e.target.checked })} className="w-4 h-4 accent-green-600" /><span className={editData.active ? "text-[var(--bv-primary-dark)] font-medium" : "text-gray-500"}>{editData.active ? t(lang, "us_user_active") : t(lang, "us_user_blocked")}</span></label>
            </div>
            <div className="p-3 border-t border-gray-100"><button onClick={handleEditSave} className="w-full py-2.5 bg-[var(--bv-primary)] text-white rounded-lg font-bold text-sm hover:bg-[var(--bv-primary-dark)]">{t(lang, "us_save_changes")}</button></div>
          </div>
        </div>
      )}
      {deleteUserData && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
            <div className="w-12 h-12 mx-auto bg-red-100 rounded-full flex items-center justify-center mb-3"><Trash2 size={24} className="text-red-600" /></div>
            <h3 className="font-bold text-lg text-gray-900 text-center mb-1">{t(lang, "us_delete_user")}</h3>
            <p className="text-sm text-gray-500 text-center mb-4">{t(lang, "us_delete_confirm")} <strong>{deleteUserData.name}</strong> ({deleteUserData.bankNumber})?</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteUserData(null)} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm hover:bg-gray-200">{t(lang, "us_cancel")}</button>
              <button onClick={handleDelete} className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700">{t(lang, "us_delete")}</button>
            </div>
          </div>
        </div>
      )}
      {creditModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
            <div className="text-center mb-4">
              <div className="w-14 h-14 mx-auto bg-yellow-100 rounded-full flex items-center justify-center mb-2"><Wallet size={28} className="text-yellow-600" /></div>
              <h3 className="font-bold text-lg text-gray-900">{t(lang, "us_manage_credit")}</h3>
              <p className="text-sm text-gray-500">{creditModal.name} ({creditModal.bankNumber})</p>
              <p className="text-sm font-bold text-[var(--bv-primary-dark)] mt-1">{t(lang, "us_current_credit")}: ${formatMoney(creditModal.credit)}</p>
            </div>
            <div className="flex gap-2 mb-3">
              <button onClick={() => setCreditAction("add")} className={`flex-1 py-2 rounded-lg text-sm font-bold ${creditAction === "add" ? "bg-[var(--bv-primary)] text-white" : "bg-gray-100 text-gray-600"}`}>{t(lang, "us_add")}</button>
              <button onClick={() => setCreditAction("subtract")} className={`flex-1 py-2 rounded-lg text-sm font-bold ${creditAction === "subtract" ? "bg-red-600 text-white" : "bg-gray-100 text-gray-600"}`}>{t(lang, "us_reduce")}</button>
            </div>
            <input type="number" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} placeholder={t(lang, "us_amount")} className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm font-bold text-center text-lg mb-3" autoFocus />
            <div className="flex gap-2">
              <button onClick={() => setCreditModal(null)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm hover:bg-gray-200">{t(lang, "us_cancel")}</button>
              <button onClick={handleCreditChange} className={`flex-1 py-2.5 rounded-xl font-bold text-sm text-white ${creditAction === "add" ? "bg-[var(--bv-primary)] hover:bg-[var(--bv-primary-dark)]" : "bg-red-600 hover:bg-red-700"}`}>{creditAction === "add" ? t(lang, "us_add") : t(lang, "us_reduce")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ─── PREMIOS ───────────────────────────────────────────────────────
function PremiosSection({ user }: { user: SessionUser }) {
  const lang = user.language || "es";
  const utils = trpc.useUtils();
  const prizeList = trpc.prize.list.useQuery();
  const updatePrize = trpc.prize.update.useMutation({ onSuccess: () => utils.prize.list.invalidate() });
  const [msg, setMsg] = useState("");

  const prizes = prizeList.data || [];

  const update = (id: number, field: string, value: string) => {
    updatePrize.mutate({ id, [field]: value });
    setMsg(t(lang, "ps_updated")); setTimeout(() => setMsg(""), 2000);
  };

  const typeLabels: Record<string, string> = { directo: t(lang, "ps_directo"), pale: t(lang, "ps_pale"), terna: t(lang, "ps_terna"), cuatrena: t(lang, "ps_cuatrena"), tripleta: t(lang, "ps_tripleta") };

  return (
    <div className="px-4 py-4 space-y-4">
      {msg && <div className="bg-[var(--bv-primary)] text-white px-3 py-2 rounded-lg text-sm text-center">{msg}</div>}
      <p className="text-sm text-gray-600">{t(lang, "ps_desc")}</p>
      {prizes.map((prize: any) => (
        <div key={prize.id} className="bg-white rounded-xl border border-green-100 p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-[var(--bv-primary-dark)]">{typeLabels[prize.playType] || prize.playType}</h3>
          <p className="text-[10px] text-gray-500">{prize.description}</p>
          {prize.playType === "directo" && (
            <div className="grid grid-cols-3 gap-2">
              {[[t(lang, "ps_first_prize"), "firstPrizeMultiplier"], [t(lang, "ps_second_prize"), "secondPrizeMultiplier"], [t(lang, "ps_third_prize"), "thirdPrizeMultiplier"]].map(([label, field]) => (
                <div key={field}><label className="text-[10px] font-medium text-gray-700 block mb-1">{label}</label><input type="number" step="0.01" defaultValue={prize[field]} onBlur={(e) => update(prize.id, field, e.target.value)} className="w-full px-2 py-1.5 border border-[var(--bv-primary-soft)] rounded-lg text-sm text-center font-bold" /></div>
              ))}
            </div>
          )}
          {prize.playType === "pale" && (
            <div className="grid grid-cols-3 gap-2">
              {[[t(lang, "ps_pale_12"), "paleFirstSecondMultiplier"], [t(lang, "ps_pale_13"), "paleFirstThirdMultiplier"], [t(lang, "ps_pale_23"), "paleSecondThirdMultiplier"]].map(([label, field]) => (
                <div key={field}><label className="text-[10px] font-medium text-gray-700 block mb-1">{label}</label><input type="number" step="0.01" defaultValue={prize[field]} onBlur={(e) => update(prize.id, field, e.target.value)} className="w-full px-2 py-1.5 border border-[var(--bv-primary-soft)] rounded-lg text-sm text-center font-bold" /></div>
              ))}
            </div>
          )}
          {["terna", "cuatrena", "tripleta"].includes(prize.playType) && (
            <div><label className="text-[10px] font-medium text-gray-700 block mb-1">{t(lang, "ps_per_unit")}</label><input type="number" step="0.01" defaultValue={prize.fixedMultiplier} onBlur={(e) => update(prize.id, "fixedMultiplier", e.target.value)} className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm font-bold" /></div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── GANADORES ─────────────────────────────────────────────────────
function GanadoresSection({ user }: { user: SessionUser }) {
  const lang = user.language || "es";
  const utils = trpc.useUtils();
  const winnerList = trpc.winner.list.useQuery();
  const createWinner = trpc.winner.create.useMutation({ onSuccess: () => utils.winner.list.invalidate() });
  const updateWinner = trpc.winner.update.useMutation({ onSuccess: () => { utils.winner.list.invalidate(); setEditingId(null); } });
  const lotteryList = trpc.lottery.list.useQuery();
  const userList = trpc.lotteryUser.list.useQuery();
  const rank: Record<string, number> = { admin: 3, supervisor: 2, collector: 1 };
  const canEditEntry = (w: any) => {
    if (user.role !== "admin" && user.role !== "supervisor") return false;
    if (!w.createdBy) return true;
    const creator = allUsers.find((u: any) => u.id === w.createdBy);
    const creatorRank = creator ? (rank[creator.role] ?? 0) : 0;
    return (rank[user.role] ?? 0) >= creatorRank;
  };

  const [msg, setMsg] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [lottery, setLottery] = useState("");
  const [prizes, setPrizes] = useState({ first: "", second: "", third: "" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editPrizes, setEditPrizes] = useState({ first: "", second: "", third: "" });

  const winners = winnerList.data || [];
  const lotteries = lotteryList.data || [];
  const allUsers = userList.data || [];
  const nameOf = (id: number | null | undefined) => id ? (allUsers.find((u: any) => u.id === id)?.name || `#${id}`) : null;

  const [lastProcessed, setLastProcessed] = useState<any>(null);

  const handleSave = () => {
    if (!lottery || !prizes.first || !prizes.second || !prizes.third) { setMsg(t(lang, "gs_complete_fields")); setTimeout(() => setMsg(""), 3000); return; }
    createWinner.mutate({ lotteryId: Number(lottery), firstPrize: prizes.first, secondPrize: prizes.second, thirdPrize: prizes.third, drawDate: date.replace(/-/g, "") }, {
      onSuccess: (data) => {
        setPrizes({ first: "", second: "", third: "" });
        setLastProcessed(data);
        setMsg(`${t(lang, "gs_saved")} ${data.processed || 0} ${t(lang, "gs_tickets_processed")}`);
        setTimeout(() => setMsg(""), 4000);
      },
      onError: (err) => { setMsg("Error: " + err.message); setTimeout(() => setMsg(""), 3000); },
    });
  };

  const startEditWinner = (w: any) => {
    setEditingId(w.id);
    setEditPrizes({ first: w.firstPrize, second: w.secondPrize, third: w.thirdPrize });
  };

  const saveEditWinner = (id: number) => {
    updateWinner.mutate({ id, firstPrize: editPrizes.first, secondPrize: editPrizes.second, thirdPrize: editPrizes.third }, {
      onSuccess: (data: any) => {
        utils.lotteryUser.list.invalidate();
        utils.lotteryUser.creditHistory.invalidate();
        setLastProcessed({ processed: data.processed, winners: data.winners });
        if (data.processed > 0) {
          pushAppNotification("Tickets ganadores", `${data.processed} ticket(s) ganador(es) procesado(s)`, "winningTickets");
        }
        showMsgLocal(`${t(lang, "gs_updated")} ${t(lang, "gs_reverted")}: ${data.reversed} ($${formatMoney(data.reversedAmount)}) - ${t(lang, "gs_new_winners")}: ${data.processed}`);
      },
      onError: (err) => showMsgLocal("Error: " + err.message),
    });
  };
  const showMsgLocal = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 5000); };

  const filtered = winners.filter((w: any) => {
    const d = date.replace(/-/g, "");
    return (!lottery || w.lotteryId === Number(lottery)) && w.drawDate === d;
  });

  return (
    <div className="px-4 py-4 space-y-4">
      {msg && <div className="bg-[var(--bv-primary)] text-white px-3 py-2 rounded-lg text-sm text-center">{msg}</div>}
      <div className="bg-white rounded-xl border border-green-100 p-4 shadow-sm space-y-3">
        <h3 className="text-sm font-bold text-[var(--bv-primary-dark)]">{t(lang, "gs_register")}</h3>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm" />
        <select value={lottery} onChange={(e) => setLottery(e.target.value)} className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm"><option value="">{t(lang, "gs_select_lottery")}</option>{lotteries.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
        <div className="grid grid-cols-3 gap-2">
          {[["1er", "first"], ["2do", "second"], ["3er", "third"]].map(([label, field]) => (
            <div key={field}><label className="text-[10px] font-medium text-gray-700 block mb-1">{label}</label><input value={(prizes as any)[field]} onChange={(e) => setPrizes({ ...prizes, [field]: e.target.value })} placeholder={label} maxLength={6} className="w-full px-2 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm text-center font-bold" /></div>
          ))}
        </div>
        <button onClick={handleSave} className="w-full py-2.5 bg-[var(--bv-primary)] text-white rounded-lg font-bold text-sm hover:bg-[var(--bv-primary-dark)]">{t(lang, "gs_save")}</button>
      </div>
      <div className="space-y-2">
        {filtered.map((w: any) => {
          const lot = lotteries.find((l: any) => l.id === w.lotteryId);
          const isEditing = editingId === w.id;
          return (
            <div key={w.id} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-[var(--bv-primary-dark)]">{lot?.name || `Loteria #${w.lotteryId}`}</p>
                {canEditEntry(w) && !isEditing && (
                  <button onClick={() => startEditWinner(w)} className="text-xs text-blue-600 font-medium hover:underline">{t(lang, "gs_edit")}</button>
                )}
              </div>
              {isEditing ? (
                <div className="mt-2 space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    {[["1er", "first"], ["2do", "second"], ["3er", "third"]].map(([label, field]) => (
                      <input key={field} value={(editPrizes as any)[field]} onChange={(e) => setEditPrizes({ ...editPrizes, [field]: e.target.value })} placeholder={label} maxLength={6} className="px-2 py-2 border border-blue-200 rounded-lg text-sm text-center font-bold" />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditingId(null)} className="flex-1 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-bold">{t(lang, "gs_cancel")}</button>
                    <button onClick={() => saveEditWinner(w.id)} className="flex-1 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold">{t(lang, "gs_save")}</button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 mt-2">
                  <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs font-bold">{w.firstPrize}</span>
                  <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-bold">{w.secondPrize}</span>
                  <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-bold">{w.thirdPrize}</span>
                </div>
              )}
              <p className="text-[10px] text-gray-400 mt-2">
                {t(lang, "gs_entered_by")}: {nameOf(w.createdBy) || "?"}
                {w.updatedBy && ` - ${t(lang, "gs_modified_by")}: ${nameOf(w.updatedBy)}`}
              </p>
            </div>
          );
        })}
        {filtered.length === 0 && <p className="text-sm text-gray-400 text-center py-4">{t(lang, "gs_no_results")}</p>}
      </div>
      {lastProcessed && lastProcessed.winners && lastProcessed.winners.length > 0 && (
        <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-4">
          <h4 className="text-sm font-bold text-yellow-800 mb-2">{t(lang, "gs_processed")}</h4>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {lastProcessed.winners.map((w: any, i: number) => (
              <div key={i} className="bg-white rounded-lg p-2 text-xs">
                <p className="font-bold text-gray-900">{w.ticketCode} - ${formatMoney(w.totalPrize)}</p>
                <p className="text-gray-500">{w.details?.join(", ")}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ANULAR ────────────────────────────────────────────────────────
function AnularSection({ user }: { user: SessionUser }) {
  const lang = user.language || "es";
  const utils = trpc.useUtils();
  const ticketList = trpc.ticket.list.useQuery();
  const userList = trpc.lotteryUser.list.useQuery();
  const annulTicketMut = trpc.ticket.annul.useMutation({ onSuccess: () => { utils.ticket.list.invalidate(); utils.lotteryUser.list.invalidate(); } });

  const [search, setSearch] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [msg, setMsg] = useState("");

  const tickets = ticketList.data || [];
  const allUsers = userList.data || [];
  const users = user.role === "supervisor" ? allUsers.filter((u: any) => u.groupId === user.groupId) : allUsers;
  const visibleUserIds = new Set(users.map((u: any) => u.id));

  const filtered = tickets.filter((t: any) => {
    const matchCode = t.code.toLowerCase().includes(search.toLowerCase());
    const matchUser = !filterUser || t.userId === Number(filterUser);
    const matchGroup = user.role !== "supervisor" || visibleUserIds.has(t.userId);
    return matchCode && matchUser && matchGroup && t.status === "active";
  });

  const annulTicket = async (ticket: any) => {
    if (!confirm(`${t(lang, "as_annul_confirm")} ${ticket.code}? ${t(lang, "as_confirm")}`)) return;
    const total = Number(ticket.total) || 0;
    const commission = Number(ticket.commission || 0);
    const netDeduction = calculateNetDeduction(total, commission);
    const commissionKept = total - netDeduction;
    try {
      // La restauracion del credito la hace el servidor dentro de la transaccion de anulacion
      // (ver api/ticket-router.ts) - no se debe repetir aqui o se acredita dos veces.
      await annulTicketMut.mutateAsync({ id: ticket.id, annulledBy: user.id });
      setMsg(`${t(lang, "as_annulled")}: $${formatMoney(netDeduction)} | ${t(lang, "as_commission_kept")}: $${formatMoney(commissionKept)}`);
      setTimeout(() => setMsg(""), 5000);
    } catch (err: any) {
      setMsg("Error: " + err.message);
      setTimeout(() => setMsg(""), 3000);
    }
  };

  return (
    <div className="px-4 py-4 space-y-4">
      {msg && <div className="bg-[var(--bv-primary)] text-white px-3 py-2 rounded-lg text-sm text-center">{msg}</div>}
      <p className="text-sm text-gray-600">{user.role === "supervisor" ? t(lang, "as_supervisor_desc") : t(lang, "as_admin_desc")}</p>
      <div className="space-y-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t(lang, "as_search_placeholder")} className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm" />
        <select value={filterUser} onChange={(e) => setFilterUser(e.target.value)} className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm">
          <option value="">{t(lang, "as_all_users")}</option>
          {users.map((u: any) => <option key={u.id} value={u.id}>{u.name} ({u.bankNumber})</option>)}
        </select>
      </div>
      <div className="bg-[var(--bv-primary-light)] rounded-lg p-3 flex items-center justify-between">
        <span className="text-sm text-green-800 font-medium">{filtered.length} {t(lang, "as_active_tickets")}</span>
        <span className="text-sm text-[var(--bv-primary-dark)] font-bold">${formatMoney(filtered.reduce((sum: number, t: any) => sum + Number(t.total), 0))}</span>
      </div>
      <div className="space-y-2">
        {filtered.length > 0 ? filtered.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((tk: any) => {
          const seller = users.find((u: any) => u.id === tk.userId);
          return (
            <div key={tk.id} className="p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-900">{tk.code}</p>
                  <p className="text-[10px] text-gray-500">{new Date(tk.createdAt).toLocaleString()}</p>
                </div>
                <p className="text-sm font-bold text-[var(--bv-primary-dark)]">${formatMoney(tk.total)}</p>
              </div>
              <div className="flex items-center justify-between bg-gray-50 rounded-lg p-2 mb-2">
                <span className="text-xs text-gray-600">{t(lang, "as_seller")}: <strong className="text-gray-900">{seller?.name || t(lang, "as_unknown")}</strong></span>
              </div>
              <button onClick={() => annulTicket(tk)} className="w-full py-2 bg-red-100 text-red-600 rounded-lg text-xs font-bold hover:bg-red-200 flex items-center justify-center gap-1"><Ban size={12} /> {t(lang, "as_annul_ticket")}</button>
            </div>
          );
        }) : <p className="text-sm text-gray-400 text-center py-4">{t(lang, "as_no_active_tickets")}</p>}
      </div>
    </div>
  );
}

// ─── REPORTES ──────────────────────────────────────────────────────
function ReportesGrupoSection({ user }: { user: any }) {
  const lang = user.language || "es";
  const utils = trpc.useUtils();
  const userList = trpc.lotteryUser.list.useQuery();
  const ticketList = trpc.ticket.list.useQuery();
  const creditSummaryQuery = trpc.lotteryUser.creditSummary.useQuery();
  const [msg, setMsg] = useState("");
  const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [creditModal, setCreditModal] = useState<{ id: number; name: string; direction: "add" | "subtract" } | null>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditType, setCreditType] = useState<"deposit" | "payout" | "correction">("deposit");
  const [creditNote, setCreditNote] = useState("");

  const adjustCredit = trpc.lotteryUser.adjustCredit.useMutation({
    onSuccess: (_d, vars) => {
      utils.lotteryUser.list.invalidate(); utils.lotteryUser.creditHistory.invalidate(); utils.lotteryUser.creditSummary.invalidate();
      showMsg(t(lang, "rg_credit_updated")); setCreditModal(null); setCreditAmount(""); setCreditNote("");
      if (vars.type === "payout") pushAppNotification("Premio", `Pago de premio: $${vars.amount}`, "prizePayment");
      else if (vars.type === "deposit") pushAppNotification("Credito de venta", `Pago de credito de venta: $${vars.amount}`, "saleCreditPayment");
    },
    onError: (err) => showMsg("Error: " + err.message),
  });

  const users = (userList.data || []).filter((u: any) => u.role === "user");
  const tickets = ticketList.data || [];

  const statsFor = (userId: number) => {
    const userTickets = tickets.filter((tk: any) => tk.userId === userId);
    const active = userTickets.filter((tk: any) => tk.status === "active");
    const cancelled = userTickets.filter((tk: any) => tk.status === "cancelled");
    const totalVentas = active.reduce((sum: number, tk: any) => sum + Number(tk.total), 0);
    return { count: userTickets.length, activeCount: active.length, cancelledCount: cancelled.length, totalVentas };
  };

  const openCreditModal = (u: any, direction: "add" | "subtract") => {
    setCreditType(direction === "add" ? "deposit" : "payout");
    setCreditModal({ id: u.id, name: u.name, direction });
  };

  const confirmCredit = () => {
    if (!creditModal) return;
    const amt = Number(creditAmount);
    if (!amt || amt <= 0) { showMsg(t(lang, "rg_invalid_amount")); return; }
    adjustCredit.mutate({ id: creditModal.id, direction: creditModal.direction, amount: creditAmount, type: creditType, note: creditNote || undefined });
  };

  return (
    <div className="px-4 py-4 space-y-3">
      {msg && <div className="bg-[var(--bv-primary)] text-white px-3 py-2 rounded-lg text-sm text-center">{msg}</div>}
      <p className="text-sm text-gray-600">{user.role === "admin" ? t(lang, "rg_desc_admin") : t(lang, "rg_desc_supervisor")}</p>

      {creditSummaryQuery.data && (
        <div>
          <h3 className="text-sm font-bold text-gray-900 mb-2">{t(lang, "rg_pl_title")}</h3>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-[var(--bv-primary-light)] rounded-xl border border-green-100 p-2.5 text-center">
              <p className="text-[9px] text-[var(--bv-primary-dark)] font-medium">{t(lang, "rg_gains")}</p>
              <p className="text-sm font-bold text-[var(--bv-primary-dark)]">${formatMoney(creditSummaryQuery.data.totalGanancias)}</p>
              <p className="text-[8px] text-[var(--bv-primary)]">{t(lang, "rg_gains_desc")}</p>
            </div>
            <div className="bg-red-50 rounded-xl border border-red-100 p-2.5 text-center">
              <p className="text-[9px] text-red-600 font-medium">{t(lang, "rg_losses")}</p>
              <p className="text-sm font-bold text-red-600">${formatMoney(creditSummaryQuery.data.totalPerdidas)}</p>
              <p className="text-[8px] text-red-500">{t(lang, "rg_losses_desc")}</p>
            </div>
            <div className={`rounded-xl border p-2.5 text-center ${creditSummaryQuery.data.neto >= 0 ? "bg-blue-50 border-blue-100" : "bg-orange-50 border-orange-100"}`}>
              <p className={`text-[9px] font-medium ${creditSummaryQuery.data.neto >= 0 ? "text-blue-700" : "text-orange-700"}`}>{t(lang, "rg_net")}</p>
              <p className={`text-sm font-bold ${creditSummaryQuery.data.neto >= 0 ? "text-blue-700" : "text-orange-700"}`}>${formatMoney(creditSummaryQuery.data.neto)}</p>
              <p className={`text-[8px] ${creditSummaryQuery.data.neto >= 0 ? "text-blue-600" : "text-orange-600"}`}>{creditSummaryQuery.data.neto >= 0 ? t(lang, "rg_net_gain") : t(lang, "rg_net_loss")}</p>
            </div>
          </div>
        </div>
      )}

      {users.length === 0 && <p className="text-sm text-center text-gray-400 py-6">{t(lang, "rg_no_sellers")}</p>}

      {users.map((u: any) => {
        const stats = statsFor(u.id);
        return (
          <div key={u.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <button onClick={() => setExpandedId(expandedId === u.id ? null : u.id)} className="w-full flex items-center justify-between p-3 text-left">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-gray-900">{u.name} <span className="text-[10px] font-normal text-gray-400">({u.bankNumber})</span></p>
                <p className="text-[11px] text-gray-500">{stats.activeCount} {t(lang, "rg_active_tickets")}{stats.cancelledCount > 0 ? ` - ${stats.cancelledCount} ${t(lang, "rg_cancelled")}` : ""} - {t(lang, "rg_sales")}: ${formatMoney(stats.totalVentas)}</p>
              </div>
              <div className="text-right shrink-0 ml-2">
                <p className="text-sm font-bold text-[var(--bv-primary-dark)]">${formatMoney(u.credit)}</p>
                <p className="text-[10px] text-gray-400">{t(lang, "rg_balance")}</p>
              </div>
            </button>
            <div className="flex gap-2 px-3 pb-3">
              <button onClick={() => openCreditModal(u, "add")} className="flex-1 py-2 bg-[var(--bv-primary-light)] text-[var(--bv-primary-dark)] rounded-lg text-xs font-bold hover:bg-[var(--bv-primary-soft)]">{t(lang, "rg_add_credit")}</button>
              <button onClick={() => openCreditModal(u, "subtract")} className="flex-1 py-2 bg-red-50 text-red-700 rounded-lg text-xs font-bold hover:bg-red-100">{t(lang, "rg_subtract_credit")}</button>
            </div>
            {expandedId === u.id && <CreditHistoryPanel userId={u.id} users={userList.data || []} lang={lang} />}
          </div>
        );
      })}

      {creditModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
            <h3 className="font-bold text-lg text-gray-900 text-center mb-1">
              {creditModal.direction === "add" ? t(lang, "rg_add_credit_title") : t(lang, "rg_subtract_credit_title")}
            </h3>
            <p className="text-xs text-gray-500 text-center mb-4">{creditModal.name}</p>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-medium text-gray-600 mb-1 block">{t(lang, "rg_amount")}</label>
                <input type="number" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} placeholder="0.00" className="w-full px-3 py-2.5 border border-[var(--bv-primary-soft)] rounded-lg text-sm font-bold" autoFocus />
              </div>
              <div>
                <label className="text-[10px] font-medium text-gray-600 mb-1 block">{t(lang, "rg_reason")}</label>
                <select value={creditType} onChange={(e) => setCreditType(e.target.value as any)} className="w-full px-3 py-2.5 border border-[var(--bv-primary-soft)] rounded-lg text-sm">
                  {creditModal.direction === "add" ? (
                    <>
                      <option value="deposit">{t(lang, "rg_reason_deposit")}</option>
                      <option value="correction">{t(lang, "rg_reason_correction")}</option>
                    </>
                  ) : (
                    <>
                      <option value="payout">{t(lang, "rg_reason_payout")}</option>
                      <option value="correction">{t(lang, "rg_reason_correction")}</option>
                    </>
                  )}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-medium text-gray-600 mb-1 block">{t(lang, "rg_note_optional")}</label>
                <input value={creditNote} onChange={(e) => setCreditNote(e.target.value)} placeholder={t(lang, "rg_note_placeholder")} className="w-full px-3 py-2.5 border border-[var(--bv-primary-soft)] rounded-lg text-sm" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setCreditModal(null)} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm">{t(lang, "rg_cancel")}</button>
              <button onClick={confirmCredit} disabled={adjustCredit.isPending} className={`flex-1 py-3 rounded-xl text-white font-bold text-sm ${creditModal.direction === "add" ? "bg-[var(--bv-primary)] hover:bg-[var(--bv-primary-dark)]" : "bg-red-600 hover:bg-red-700"}`}>
                {t(lang, "rg_confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CreditHistoryPanel({ userId, users, lang }: { userId: number; users: any[]; lang: any }) {
  const historyQuery = trpc.lotteryUser.creditHistory.useQuery({ userId });
  const history = historyQuery.data || [];
  const typeLabels: Record<string, string> = {
    deposit: t(lang, "ventas_type_deposit"),
    payout: t(lang, "ventas_type_payout"),
    reversal: t(lang, "ventas_type_reversal"),
    correction: t(lang, "ventas_type_correction"),
  };
  const nameOf = (id: number) => users.find((u: any) => u.id === id)?.name || `#${id}`;

  return (
    <div className="border-t border-gray-100 px-3 py-3 bg-gray-50">
      <p className="text-[10px] font-bold text-gray-500 uppercase mb-2">{t(lang, "rg_history_title")}</p>
      {history.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-2">{t(lang, "rg_no_movements")}</p>
      ) : (
        <div className="space-y-1.5 max-h-56 overflow-y-auto">
          {history.map((h: any) => (
            <div key={h.id} className="flex items-center justify-between bg-white rounded-lg px-2.5 py-1.5 text-xs">
              <div className="min-w-0 flex-1">
                <p className={`font-bold ${h.direction === "subtract" ? "text-red-600" : "text-[var(--bv-primary)]"}`}>
                  {h.direction === "subtract" ? "-" : "+"}${formatMoney(h.amount)} <span className="font-normal text-gray-500">- {typeLabels[h.type] || h.type}</span>
                </p>
                <p className="text-[10px] text-gray-500">{t(lang, "rg_done_by")}: {nameOf(h.adjustedBy)}</p>
                {h.note && <p className="text-[10px] text-gray-400 truncate">{h.note}</p>}
                <p className="text-[9px] text-gray-400">{new Date(h.createdAt).toLocaleString()}</p>
              </div>
              <p className="text-gray-500 shrink-0 ml-2">{t(lang, "rg_balance_label")}: ${formatMoney(h.balanceAfter)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── CONFIG ────────────────────────────────────────────────────────
function ConfigSection({ user }: { user: SessionUser }) {
  const lang = user.language || "es";
  const utils = trpc.useUtils();
  const [msg, setMsg] = useState("");
  const configQuery = trpc.config.get.useQuery({ key: "system" });
  const setConfigServer = trpc.config.set.useMutation({ onSuccess: () => configQuery.refetch() });
  const userList = trpc.lotteryUser.list.useQuery();
  const groupList = trpc.group.list.useQuery();
  const resetUser = trpc.lotteryUser.resetUserAccounting.useMutation({
    onSuccess: (d) => { utils.lotteryUser.list.invalidate(); utils.ticket.list.invalidate(); showMsg(`${t(lang, "cs_reset_user_ok")} (${d.ticketsRemoved} tickets)`); },
    onError: (e) => showMsg("Error: " + e.message),
  });
  const resetGroup = trpc.lotteryUser.resetGroupAccounting.useMutation({
    onSuccess: (d) => { utils.lotteryUser.list.invalidate(); utils.ticket.list.invalidate(); showMsg(`${t(lang, "cs_reset_group_ok")} (${d.usersAffected} usuarios, ${d.ticketsRemoved} tickets)`); },
    onError: (e) => showMsg("Error: " + e.message),
  });
  const resetSystem = trpc.lotteryUser.resetSystemAccounting.useMutation({
    onSuccess: () => { utils.lotteryUser.list.invalidate(); utils.ticket.list.invalidate(); showMsg(t(lang, "cs_reset_system_ok")); },
    onError: (e) => showMsg("Error: " + e.message),
  });
  const [resetUserId, setResetUserId] = useState("");
  const [resetGroupId, setResetGroupId] = useState("");
  const config = (() => { try { return configQuery.data ? JSON.parse(configQuery.data) : { maxBetAmount: "" }; } catch { return { maxBetAmount: "" }; } })();

  const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 4000); };

  const saveConfig = (newConfig: any) => {
    setConfigServer.mutate({ key: "system", value: JSON.stringify(newConfig) });
    showMsg(t(lang, "cs_saved"));
  };

  const users = (userList.data || []).filter((u: any) => u.role === "user" || u.role === "collector" || u.role === "supervisor");
  const groups = groupList.data || [];

  return (
    <div className="px-4 py-4 space-y-4">
      {msg && <div className="bg-[var(--bv-primary)] text-white px-3 py-2 rounded-lg text-sm text-center">{msg}</div>}
      <div className="bg-white rounded-xl border border-green-100 p-4 shadow-sm">
        <h3 className="text-sm font-bold text-[var(--bv-primary-dark)] mb-3">{t(lang, "cs_limit_per_play")}</h3>
        <div className="flex gap-2">
          <input type="number" value={config.maxBetAmount} onChange={(e) => saveConfig({ ...config, maxBetAmount: e.target.value })} placeholder="Ej: 1000" className="flex-1 px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm font-bold" />
          <button onClick={() => saveConfig({ ...config, maxBetAmount: "" })} className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-bold">{t(lang, "cs_remove")}</button>
        </div>
      </div>

      {/* Reset contabilidad */}
      <div className="bg-white rounded-xl border border-red-100 p-4 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-red-700">{t(lang, "cs_reset_accounting")}</h3>
        <p className="text-[11px] text-gray-500">{t(lang, "cs_reset_hint")}</p>

        <div className="space-y-2">
          <label className="text-[10px] font-medium text-gray-600 block">{t(lang, "cs_reset_user")}</label>
          <div className="flex gap-2">
            <select value={resetUserId} onChange={(e) => setResetUserId(e.target.value)} className="flex-1 px-2 py-2 border border-gray-200 rounded-lg text-sm">
              <option value="">{t(lang, "cs_select_user")}</option>
              {users.map((u: any) => (
                <option key={u.id} value={u.id}>{u.name} ({u.bankNumber})</option>
              ))}
            </select>
            <button
              disabled={!resetUserId || resetUser.isPending}
              onClick={() => {
                if (!confirm(t(lang, "cs_reset_user_confirm"))) return;
                resetUser.mutate({ id: Number(resetUserId) });
              }}
              className="px-3 py-2 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 disabled:opacity-50"
            >
              {t(lang, "cs_reset_btn")}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-medium text-gray-600 block">{t(lang, "cs_reset_group")}</label>
          <div className="flex gap-2">
            <select value={resetGroupId} onChange={(e) => setResetGroupId(e.target.value)} className="flex-1 px-2 py-2 border border-gray-200 rounded-lg text-sm">
              <option value="">{t(lang, "cs_select_group")}</option>
              {groups.map((g: any) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <button
              disabled={!resetGroupId || resetGroup.isPending}
              onClick={() => {
                if (!confirm(t(lang, "cs_reset_group_confirm"))) return;
                resetGroup.mutate({ groupId: Number(resetGroupId) });
              }}
              className="px-3 py-2 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 disabled:opacity-50"
            >
              {t(lang, "cs_reset_btn")}
            </button>
          </div>
        </div>

        <div className="pt-2 border-t border-red-50">
          <button
            disabled={resetSystem.isPending}
            onClick={() => {
              if (!confirm(t(lang, "cs_reset_system_confirm"))) return;
              resetSystem.mutate({ confirm: "RESET_ALL" });
            }}
            className="w-full py-2.5 bg-red-700 text-white rounded-lg text-sm font-bold hover:bg-red-800 disabled:opacity-50"
          >
            {t(lang, "cs_reset_system")}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-green-100 p-4 shadow-sm">
        <h3 className="text-sm font-bold text-[var(--bv-primary-dark)] mb-3">{t(lang, "cs_system_info")}</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between py-2 border-b border-gray-50"><span className="text-gray-600">{t(lang, "cs_version")}</span><span className="font-medium">2.8.0</span></div>
          <div className="flex justify-between py-2 border-b border-gray-50"><span className="text-gray-600">{t(lang, "cs_mode")}</span><span className="font-medium text-[var(--bv-primary)]">{t(lang, "cs_online")}</span></div>
        </div>
      </div>
    </div>
  );
}

// ─── LIMITES ───────────────────────────────────────────────────────
interface LimitEntry { id: number; type: "global" | "user"; userId: number | null; lotteryId: number | null; playType: string | null; maxAmount: number; blockedNumbers: string[]; active: boolean; }
function getPlayTypes(lang: any): { value: string; label: string }[] {
  return [
    { value: "directo", label: t(lang, "lim_pt_directo") }, { value: "pale", label: t(lang, "lim_pt_pale") }, { value: "terna", label: t(lang, "lim_pt_3cifras") }, { value: "cuatrena", label: t(lang, "lim_pt_4cifras") }, { value: "tripleta", label: t(lang, "lim_pt_tripleta") },
  ];
}

function LimitesSection({ user }: { user: SessionUser }) {
  const lang = user.language || "es";
  const PLAY_TYPES = getPlayTypes(lang);
  const utils = trpc.useUtils();
  const [msg, setMsg] = useState("");
  const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };
  const limitsQuery = trpc.config.get.useQuery({ key: "limits" });
  const saveLimitsServer = trpc.config.set.useMutation({ onSuccess: () => limitsQuery.refetch() });
  const limits: LimitEntry[] = (() => { try { return limitsQuery.data ? JSON.parse(limitsQuery.data) : []; } catch { return []; } })();
  const userList = trpc.lotteryUser.list.useQuery();
  const lotteryList = trpc.lottery.list.useQuery();

  const allUsers = userList.data || [];
  const allLotteries = lotteryList.data || [];

  const saveLimits = (data: LimitEntry[]) => { saveLimitsServer.mutate({ key: "limits", value: JSON.stringify(data) }); };
  const [form, setForm] = useState({ type: "global" as "global" | "user", userId: "", lotteryId: "", playType: "", maxAmount: "", blockedNumbers: "" });
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState<"limits" | "blocked" | "palelimits">("limits");

  // Pale/Tripleta server limits
  const serverLimits = trpc.lottery.getLimits.useQuery();
  const setServerLimit = trpc.lottery.setLimit.useMutation({
    onSuccess: () => { utils.lottery.getLimits.invalidate(); showMsg(t(lang, "lim_saved")); },
    onError: (err) => showMsg("Error: " + err.message),
  });
  const deleteServerLimit = trpc.lottery.deleteLimit.useMutation({
    onSuccess: () => { utils.lottery.getLimits.invalidate(); showMsg(t(lang, "lim_deleted")); },
    onError: (err) => showMsg("Error: " + err.message),
  });
  const [paleForm, setPaleForm] = useState({ lotteryId: "", playType: "pale" as "pale" | "tripleta", numberCombo: "", maxAmount: "" });

  const addLimit = () => {
    const newLimit: LimitEntry = { id: Date.now(), type: form.type, userId: form.type === "user" && form.userId ? Number(form.userId) : null, lotteryId: form.lotteryId ? Number(form.lotteryId) : null, playType: form.playType || null, maxAmount: Number(form.maxAmount) || 0, blockedNumbers: form.blockedNumbers.split(",").map((s) => s.trim()).filter(Boolean), active: true };
    saveLimits([...limits, newLimit]);
    setForm({ type: "global", userId: "", lotteryId: "", playType: "", maxAmount: "", blockedNumbers: "" });
    setShowForm(false);
    showMsg(t(lang, "lim_created"));
  };

  const toggleActive = (id: number) => { saveLimits(limits.map((l) => l.id === id ? { ...l, active: !l.active } : l)); };
  const removeLimit = (id: number) => { if (confirm(t(lang, "lim_delete_confirm"))) saveLimits(limits.filter((l) => l.id !== id)); };
  const getLotteryName = (id: number | null) => { if (!id) return t(lang, "lim_todas"); const l = allLotteries.find((x: any) => x.id === id); return l ? l.name : `ID: ${id}`; };
  const getUserName = (id: number | null) => { if (!id) return t(lang, "lim_todos"); const u = allUsers.find((x: any) => x.id === id); return u ? `${u.name} (${u.bankNumber})` : `ID: ${id}`; };
  const getPlayTypeLabel = (pt: string | null) => { if (!pt) return t(lang, "lim_todos"); return PLAY_TYPES.find((pl) => pl.value === pt)?.label || pt; };

  return (
    <div className="px-4 py-4 space-y-4">
      {msg && <div className="bg-[var(--bv-primary)] text-white px-3 py-2 rounded-lg text-sm text-center">{msg}</div>}
      <div className="flex gap-2">
        <button onClick={() => setTab("limits")} className={`flex-1 py-2 rounded-lg text-sm font-bold ${tab === "limits" ? "bg-[var(--bv-primary)] text-white" : "bg-gray-100 text-gray-600"}`}>{t(lang, "lim_limits")}</button>
        <button onClick={() => setTab("blocked")} className={`flex-1 py-2 rounded-lg text-sm font-bold ${tab === "blocked" ? "bg-red-600 text-white" : "bg-gray-100 text-gray-600"}`}>{t(lang, "lim_blocked")}</button>
        <button onClick={() => setTab("palelimits")} className={`flex-1 py-2 rounded-lg text-sm font-bold ${tab === "palelimits" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"}`}>{t(lang, "lim_pale_tab")}</button>
      </div>
      {/* Pale/Tripleta Limits Tab */}
      {tab === "palelimits" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-blue-100 p-4 shadow-sm space-y-3">
            <h3 className="text-sm font-bold text-blue-700">{t(lang, "lim_pale_combo_title")}</h3>
            <p className="text-xs text-gray-500">{t(lang, "lim_pale_combo_desc")}</p>
            <select value={paleForm.lotteryId} onChange={(e) => setPaleForm({ ...paleForm, lotteryId: e.target.value })} className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm">
              <option value="">{t(lang, "lim_select_lottery")}</option>
              {allLotteries.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <select value={paleForm.playType} onChange={(e) => setPaleForm({ ...paleForm, playType: e.target.value as "pale" | "tripleta" })} className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm">
              <option value="pale">{t(lang, "lim_pale_2")}</option>
              <option value="tripleta">{t(lang, "lim_tripleta_3")}</option>
            </select>
            <input value={paleForm.numberCombo} onChange={(e) => setPaleForm({ ...paleForm, numberCombo: e.target.value })} placeholder={t(lang, "lim_combo_placeholder")} className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm" />
            <input type="number" value={paleForm.maxAmount} onChange={(e) => setPaleForm({ ...paleForm, maxAmount: e.target.value })} placeholder={t(lang, "lim_max_amount_placeholder")} className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm" />
            <button onClick={() => {
              if (!paleForm.lotteryId || !paleForm.numberCombo || !paleForm.maxAmount) { showMsg(t(lang, "lim_complete_fields")); return; }
              setServerLimit.mutate({ lotteryId: Number(paleForm.lotteryId), playType: paleForm.playType, numberCombo: paleForm.numberCombo, maxAmount: paleForm.maxAmount });
              setPaleForm({ lotteryId: "", playType: "pale", numberCombo: "", maxAmount: "" });
            }} className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700">{t(lang, "lim_save_limit")}</button>
          </div>
          <div className="space-y-2">
            {(serverLimits.data || []).length === 0 && <div className="text-center py-6 text-gray-400 text-sm">{t(lang, "lim_no_pale_limits")}</div>}
            {(serverLimits.data || []).map((lim: any) => (
              <div key={lim.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-gray-900">{lim.numberCombo} <span className="text-blue-600">({lim.playType})</span></p>
                  <p className="text-[10px] text-gray-500">{getLotteryName(lim.lotteryId)}</p>
                  <p className="text-xs font-bold text-[var(--bv-primary-dark)]">{t(lang, "lim_max")}: ${formatMoney(lim.maxAmount)}</p>
                </div>
                <button onClick={() => { if (confirm(t(lang, "lim_delete_q"))) deleteServerLimit.mutate({ id: lim.id }); }} className="p-1.5 rounded-lg hover:bg-red-50"><Trash2 size={16} className="text-red-500" /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab !== "palelimits" && !showForm && (
        <button onClick={() => setShowForm(true)} className="w-full py-2.5 bg-[var(--bv-primary)] text-white rounded-lg font-bold text-sm hover:bg-[var(--bv-primary-dark)] flex items-center justify-center gap-2">
          <Plus size={16} /> {tab === "limits" ? t(lang, "lim_new_limit") : t(lang, "lim_new_block")}
        </button>
      )}
      {showForm && (
        <div className="bg-white rounded-xl border border-green-100 p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-[var(--bv-primary-dark)]">{tab === "limits" ? t(lang, "lim_new_limit") : t(lang, "lim_new_block")}</h3>
          <div>
            <label className="text-[10px] font-medium text-gray-600 mb-1 block">{t(lang, "lim_apply_to")}</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as "global" | "user", userId: "" })} className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm">
              <option value="global">{t(lang, "lim_all_users")}</option>
              <option value="user">{t(lang, "lim_specific_user")}</option>
            </select>
          </div>
          {form.type === "user" && (
            <div>
              <label className="text-[10px] font-medium text-gray-600 mb-1 block">{t(lang, "lim_user")}</label>
              <select value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm">
                <option value="">{t(lang, "lim_select")}</option>
                {allUsers.filter((u: any) => u.role !== "admin").map((u: any) => <option key={u.id} value={u.id}>{u.name} ({u.bankNumber})</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="text-[10px] font-medium text-gray-600 mb-1 block">{t(lang, "lim_lottery")}</label>
            <select value={form.lotteryId} onChange={(e) => setForm({ ...form, lotteryId: e.target.value })} className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm">
              <option value="">{t(lang, "lim_all")}</option>
              {allLotteries.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-medium text-gray-600 mb-1 block">{t(lang, "lim_play_type")}</label>
            <select value={form.playType} onChange={(e) => setForm({ ...form, playType: e.target.value })} className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm">
              <option value="">{t(lang, "lim_all_types")}</option>
              {PLAY_TYPES.map((pl) => <option key={pl.value} value={pl.value}>{pl.label}</option>)}
            </select>
          </div>
          {tab === "limits" && (
            <div>
              <label className="text-[10px] font-medium text-gray-600 mb-1 block">{t(lang, "lim_max_amount")}</label>
              <input type="number" value={form.maxAmount} onChange={(e) => setForm({ ...form, maxAmount: e.target.value })} placeholder="Ej: 500" className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm" />
            </div>
          )}
          <div>
            <label className="text-[10px] font-medium text-gray-600 mb-1 block">{t(lang, "lim_blocked_numbers")}</label>
            <input value={form.blockedNumbers} onChange={(e) => setForm({ ...form, blockedNumbers: e.target.value })} placeholder={t(lang, "lim_blocked_placeholder")} className="w-full px-3 py-2 border border-[var(--bv-primary-soft)] rounded-lg text-sm" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-bold">{t(lang, "lim_cancel")}</button>
            <button onClick={addLimit} className="flex-1 py-2 bg-[var(--bv-primary)] text-white rounded-lg text-sm font-bold hover:bg-[var(--bv-primary-dark)]">{t(lang, "lim_save")}</button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {limits.filter((l) => tab === "blocked" ? l.blockedNumbers.length > 0 : true).length === 0 && (
          <div className="text-center py-8 text-gray-400">{tab === "limits" ? <Shield size={32} className="mx-auto mb-2 text-green-200" /> : <Lock size={32} className="mx-auto mb-2 text-red-200" />}<p className="text-sm">{t(lang, "lim_no_limits_configured")} {tab === "limits" ? t(lang, "lim_limits_lower") : t(lang, "lim_blocks_lower")} {t(lang, "lim_configured")}</p></div>
        )}
        {limits.filter((l) => tab === "blocked" ? l.blockedNumbers.length > 0 : true).map((limit) => (
          <div key={limit.id} className={`rounded-xl border shadow-sm p-3 ${limit.active ? "bg-white border-gray-100" : "bg-gray-50 border-gray-200 opacity-60"}`}>
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${limit.type === "global" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>{limit.type === "global" ? t(lang, "lim_global") : t(lang, "lim_user_badge")}</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-[var(--bv-primary-dark)] rounded font-bold">{getPlayTypeLabel(limit.playType)}</span>
                  {limit.blockedNumbers.length > 0 && <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-700 rounded font-bold flex items-center gap-0.5"><Lock size={8} /> {limit.blockedNumbers.length} {t(lang, "lim_blocked_count")}</span>}
                </div>
                <p className="text-xs text-gray-600 mt-1">{getLotteryName(limit.lotteryId)}</p>
                {limit.type === "user" && <p className="text-[10px] text-gray-500">{getUserName(limit.userId)}</p>}
                {limit.maxAmount > 0 && <p className="text-xs font-bold text-[var(--bv-primary-dark)]">{t(lang, "lim_max")}: ${formatMoney(limit.maxAmount)}</p>}
                {limit.blockedNumbers.length > 0 && <p className="text-[10px] text-red-500 font-medium">{t(lang, "lim_blocked_list")}: {limit.blockedNumbers.join(", ")}</p>}
              </div>
              <div className="flex items-center gap-1 ml-2">
                <button onClick={() => toggleActive(limit.id)} className={`px-2 py-1 rounded text-[10px] font-bold ${limit.active ? "bg-green-100 text-[var(--bv-primary-dark)]" : "bg-gray-100 text-gray-500"}`}>{limit.active ? "ON" : "OFF"}</button>
                <button onClick={() => removeLimit(limit.id)} className={`p-1 hover:bg-red-50 rounded`}><Trash2 size={14} className="text-red-500" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


// ─── DISPOSITIVOS (Device Binding) ─────────────────────────────────
function DispositivosSection({ user }: { user: SessionUser }) {
  const lang = user.language || "es";
  const utils = trpc.useUtils();
  const userList = trpc.lotteryUser.list.useQuery();
  const clearDevice = trpc.lotteryUser.clearDeviceBinding.useMutation({
    onSuccess: () => { utils.lotteryUser.list.invalidate(); setMsg("Dispositivo desvinculado"); setTimeout(() => setMsg(""), 2500); },
    onError: (e) => { setMsg("Error: " + e.message); setTimeout(() => setMsg(""), 3000); },
  });
  const [msg, setMsg] = useState("");
  const [search, setSearch] = useState("");
  const users = (userList.data || []).filter((u: any) => {
    if (u.role === "admin") return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (u.name || "").toLowerCase().includes(q) || (u.username || "").toLowerCase().includes(q) || (u.bankNumber || "").toLowerCase().includes(q);
  });

  return (
    <div className="px-4 py-4 space-y-3">
      <h2 className="text-lg font-bold text-gray-900">Vinculacion de dispositivos</h2>
      <p className="text-xs text-gray-500">Cada vendedor/supervisor queda ligado al celular donde inicio sesion. Si cambia de telefono, desvincule aqui.</p>
      {msg && <div className="bg-[var(--bv-primary)] text-white px-3 py-2 rounded-lg text-sm text-center">{msg}</div>}
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar usuario..." className="w-full px-3 py-2.5 border border-[var(--bv-primary-soft)] rounded-lg text-sm" />
      <div className="space-y-2">
        {users.map((u: any) => (
          <div key={u.id} className="p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900">{u.name} <span className="text-[10px] font-normal text-[var(--bv-primary)]">({u.bankNumber})</span></p>
                <p className="text-[10px] text-gray-500">{u.username} · {u.role}</p>
                {u.boundDeviceId ? (
                  <p className="text-[11px] text-gray-700 mt-1">
                    <span className="font-medium">Vinculado:</span> {u.boundDeviceLabel || "Dispositivo"}
                    {u.boundAt ? ` · ${new Date(u.boundAt).toLocaleString()}` : ""}
                  </p>
                ) : (
                  <p className="text-[11px] text-amber-600 mt-1">Sin dispositivo vinculado</p>
                )}
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${u.boundDeviceId ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                {u.boundDeviceId ? "Activo" : "Libre"}
              </span>
            </div>
            {u.boundDeviceId && (
              <button
                onClick={() => { if (confirm(`Desvincular dispositivo de ${u.name}?`)) clearDevice.mutate({ id: u.id }); }}
                className="w-full mt-2 py-1.5 bg-orange-50 text-orange-700 rounded-lg text-[11px] font-bold hover:bg-orange-100"
              >
                Desvincular dispositivo
              </button>
            )}
          </div>
        ))}
        {users.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No hay usuarios</p>}
      </div>
    </div>
  );
}
