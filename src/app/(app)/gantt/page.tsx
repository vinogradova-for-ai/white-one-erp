import { redirect } from "next/navigation";

// Старая страница /gantt оставлена только как redirect на /gantt-v2,
// который теперь основной График Ганта. Так все сохранённые ссылки
// (закладки, упоминания в письмах) продолжают работать.
export default function GanttRedirectPage() {
  redirect("/gantt-v2");
}
