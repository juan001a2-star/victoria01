// Export/Import data via JSON files
// This allows sharing data between devices without a backend

export function exportAllData(): string {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    tickets: JSON.parse(localStorage.getItem("loteria_tickets") || "[]"),
    users: JSON.parse(localStorage.getItem("loteria_users") || "[]"),
    groups: JSON.parse(localStorage.getItem("loteria_groups") || "[]"),
    lotteries: JSON.parse(localStorage.getItem("loteria_loterias") || "[]"),
    winners: JSON.parse(localStorage.getItem("loteria_winners") || "[]"),
    prizes: JSON.parse(localStorage.getItem("loteria_prizes") || "[]"),
    limits: JSON.parse(localStorage.getItem("loteria_limits") || "[]"),
    config: JSON.parse(localStorage.getItem("loteria_config") || "{}"),
    auditLog: JSON.parse(localStorage.getItem("loteria_audit_log") || "[]"),
  };
  return JSON.stringify(data, null, 2);
}

export function downloadDataFile(userName: string) {
  const json = exportAllData();
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `banca-victoria-${userName}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function importDataFile(jsonText: string): { success: boolean; message: string; ticketCount: number } {
  try {
    const data = JSON.parse(jsonText);
    
    if (!data.tickets || !Array.isArray(data.tickets)) {
      return { success: false, message: "Archivo invalido", ticketCount: 0 };
    }

    // Merge tickets - avoid duplicates by code
    const existingTickets = JSON.parse(localStorage.getItem("loteria_tickets") || "[]");
    const existingCodes = new Set(existingTickets.map((t: any) => t.code));
    let added = 0;
    
    for (const ticket of data.tickets) {
      if (ticket.code && !existingCodes.has(ticket.code)) {
        existingTickets.push(ticket);
        existingCodes.add(ticket.code);
        added++;
      }
    }
    
    localStorage.setItem("loteria_tickets", JSON.stringify(existingTickets));

    // Optionally import other data
    if (data.users?.length) {
      const prompt = confirm(`El archivo contiene ${data.users.length} usuarios. Importar tambien?`);
      if (prompt) {
        localStorage.setItem("loteria_users", JSON.stringify(data.users));
      }
    }
    
    if (data.groups?.length) {
      const prompt = confirm(`El archivo contiene ${data.groups.length} grupos. Importar tambien?`);
      if (prompt) {
        localStorage.setItem("loteria_groups", JSON.stringify(data.groups));
      }
    }

    return { success: true, message: `Importados ${added} tickets nuevos`, ticketCount: added };
  } catch {
    return { success: false, message: "Error al leer el archivo", ticketCount: 0 };
  }
}
