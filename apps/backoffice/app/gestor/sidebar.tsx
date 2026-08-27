'use client';

import React from 'react';
import {
  BarChart3,
  ClipboardList,
  LogOut,
  MapPin,
  PanelLeftClose,
  PanelLeftOpen,
  Printer,
  Settings,
  Store,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  href: string;
  label: string;
  icon: typeof ClipboardList;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/gestor', label: 'Pedidos', icon: ClipboardList },
  { href: '/gestor/balcao', label: 'Balcão', icon: Store },
  { href: '/gestor/entrega', label: 'Entrega', icon: MapPin },
  { href: '/gestor/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/gestor/impressao', label: 'Impressão', icon: Printer },
  { href: '/gestor/configuracao', label: 'Configuração', icon: Settings },
];

export interface SidebarProps {
  tenantName: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onLogout: () => void;
  loggingOut: boolean;
}

function NavList({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2" aria-label="Navegação do gestor">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            title={collapsed ? label : undefined}
            className={`flex items-center gap-3 min-h-11 rounded-[14px] px-3 py-2.5 text-sm font-medium transition-colors ${
              active ? 'bg-brand text-on-brand' : 'text-text-muted hover:bg-bg hover:text-text'
            } ${collapsed ? 'justify-center' : ''}`}
          >
            <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className={collapsed ? 'sr-only' : 'truncate'}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Sidebar única do gestor (redesign, benchmarks Cardápio Web/Cardápio.ai/
 * Goomer): rail fixo à esquerda em md+, colapsa pra só-ícone (preferência
 * por navegador, `use-sidebar-state.ts`); abaixo de md vira overlay atrás
 * de um botão hambúrguer no topbar (ver layout.tsx), nunca as duas ao
 * mesmo tempo.
 */
export function Sidebar({ tenantName, collapsed, onToggleCollapsed, mobileOpen, onCloseMobile, onLogout, loggingOut }: SidebarProps) {
  return (
    <>
      {/* Desktop: rail fixo, sempre no fluxo. */}
      <aside
        className={`hidden shrink-0 flex-col border-r border-border bg-bg-card transition-[width] duration-base ease-out md:flex ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        <div className={`flex items-center gap-2 border-b border-border px-3 py-4 ${collapsed ? 'justify-center' : 'justify-between'}`}>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-text">{tenantName || 'Molho'}</p>
              <p className="text-xs text-text-muted">Painel</p>
            </div>
          )}
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-text-muted hover:bg-bg hover:text-text focus-visible:outline-none focus-visible:shadow-focus"
          >
            {collapsed ? <PanelLeftOpen className="h-5 w-5" aria-hidden="true" /> : <PanelLeftClose className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
        <NavList collapsed={collapsed} />
        <div className="border-t border-border p-2">
          <button
            type="button"
            onClick={onLogout}
            disabled={loggingOut}
            title={collapsed ? 'Sair' : undefined}
            className={`flex w-full items-center gap-3 min-h-11 rounded-[14px] px-3 py-2.5 text-sm font-medium text-text-muted transition-colors hover:bg-bg hover:text-critical disabled:opacity-50 ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            <LogOut className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className={collapsed ? 'sr-only' : ''}>{loggingOut ? 'Saindo…' : 'Sair'}</span>
          </button>
        </div>
      </aside>

      {/* Mobile: overlay atrás do hambúrguer do topbar (layout.tsx). */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={onCloseMobile}
            className="absolute inset-0 bg-text/40"
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-bg-card shadow-3">
            <div className="flex items-center justify-between border-b border-border px-4 py-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-text">{tenantName || 'Molho'}</p>
                <p className="text-xs text-text-muted">Painel</p>
              </div>
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="Fechar menu"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-text-muted hover:bg-bg hover:text-text"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <NavList collapsed={false} onNavigate={onCloseMobile} />
            <div className="border-t border-border p-2">
              <button
                type="button"
                onClick={() => {
                  onCloseMobile();
                  onLogout();
                }}
                disabled={loggingOut}
                className="flex w-full items-center gap-3 min-h-11 rounded-[14px] px-3 py-2.5 text-sm font-medium text-text-muted hover:bg-bg hover:text-critical disabled:opacity-50"
              >
                <LogOut className="h-5 w-5 shrink-0" aria-hidden="true" />
                {loggingOut ? 'Saindo…' : 'Sair'}
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
