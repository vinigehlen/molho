'use client';

import * as React from 'react';
import { cn } from '../lib/cn';

/**
 * MoSkeleton — doc de marca §5.1.
 *
 * Toda tela tem estado skeleton; nunca spinner de página inteira. O shimmer é
 * puro CSS sobre --border, sem cor solta.
 *
 * Por padrão é aria-hidden: é forma, não conteúdo. Quem quiser anunciar o
 * carregamento passa `label` — e aí sim vira role="status" com texto sr-only.
 */
const RAIOS = {
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  pill: 'rounded-pill',
} as const;

export interface MoSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  rounded?: keyof typeof RAIOS;
  /** Se presente, anuncia o carregamento a leitores de tela. */
  label?: string;
}

export function MoSkeleton({
  className,
  width,
  height,
  rounded = 'md',
  label,
  style,
  ...props
}: MoSkeletonProps) {
  return (
    <div
      role={label ? 'status' : undefined}
      aria-hidden={label ? undefined : true}
      className={cn('relative overflow-hidden bg-border', RAIOS[rounded], className)}
      style={{ width, height, ...style }}
      {...props}
    >
      <span
        className={cn(
          'absolute inset-0 animate-shimmer',
          'bg-gradient-to-r from-transparent via-white/60 to-transparent',
          'bg-[length:200%_100%]',
        )}
        aria-hidden="true"
      />
      {label ? <span className="sr-only">{label}</span> : null}
    </div>
  );
}

export interface MoSkeletonTextProps extends Omit<MoSkeletonProps, 'height'> {
  /** Quantidade de linhas. A última sai mais curta, como texto de verdade. */
  lines?: number;
}

export function MoSkeletonText({ lines = 3, className, label, ...props }: MoSkeletonTextProps) {
  return (
    <div
      role={label ? 'status' : undefined}
      aria-hidden={label ? undefined : true}
      className={cn('flex flex-col gap-2', className)}
    >
      {Array.from({ length: lines }, (_, i) => (
        <MoSkeleton
          key={i}
          height={12}
          rounded="pill"
          className={i === lines - 1 ? 'w-3/5' : 'w-full'}
          {...props}
        />
      ))}
      {label ? <span className="sr-only">{label}</span> : null}
    </div>
  );
}
