import type { ReactNode } from "react";

const baseClasses =
  "rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-800";

/** Use with Next.js Link: className={cardLinkClassName} */
export const cardLinkClassName =
  "block " +
  baseClasses +
  " transition hover:border-amber-400 dark:hover:border-amber-600";

interface CardProps {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
}

export function Card({ children, className = "", as: As = "div" }: CardProps) {
  return <As className={`${baseClasses} ${className}`.trim()}>{children}</As>;
}

interface CardLinkProps {
  children: ReactNode;
  href: string;
  className?: string;
}

export function CardLink({ children, href, className = "" }: CardLinkProps) {
  return (
    <a
      href={href}
      className={`block ${baseClasses} transition hover:border-amber-400 dark:hover:border-amber-600 ${className}`.trim()}
    >
      {children}
    </a>
  );
}

interface CardHeaderProps {
  children: ReactNode;
  className?: string;
}

export function CardHeader({ children, className = "" }: CardHeaderProps) {
  return (
    <h2
      className={`mb-3 font-medium text-stone-900 dark:text-white ${className}`.trim()}
    >
      {children}
    </h2>
  );
}
