import { useEffect, useState } from 'react';

const STORAGE_KEY = 'molho:backoffice:sidebar-collapsed';

/**
 * Estado da sidebar (Épico redesign do gestor): colapsado/fixo lembra por
 * NAVEGADOR (localStorage), não por tenant — é preferência do aparelho de
 * balcão, não da loja. Aberto/fechado do overlay mobile é transiente, nunca
 * persiste (sempre fecha ao trocar de rota).
 */
export function useSidebarState() {
  // Lido só depois do mount (evita mismatch de hidratação SSR/CSR): abre
  // expandido no primeiro paint sempre, e ajusta pro valor salvo em seguida
  // — o "flash" de 1 frame é preferível a hidratação divergente.
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === '1') setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  }

  return {
    collapsed,
    toggleCollapsed,
    mobileOpen,
    openMobile: () => setMobileOpen(true),
    closeMobile: () => setMobileOpen(false),
  };
}
