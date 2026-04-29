"use client";

import { useRouter } from "next/navigation";

/**
 * <tr>, который ведёт на href при клике в ЛЮБУЮ ячейку. Работает в паре
 * с серверной таблицей: внутри сохраняем обычные <td>. Внутренние ссылки
 * (например, на номер заказа) тоже работают — у них стоит stopPropagation
 * на лету не нужен, потому что <Link> обрабатывает клик через router сам.
 */
export function ClickableRow({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  return (
    <tr
      onClick={() => router.push(href)}
      className={`cursor-pointer ${className ?? ""}`}
    >
      {children}
    </tr>
  );
}
