import { Activity, CalendarClock, ClipboardList, FileChartColumn, Hourglass, Mail, MessageSquareText, Split, Wrench, type LucideIcon } from 'lucide-react';
import type { NodeType } from '../domain/types';

export const NODE_ICON: Record<NodeType, LucideIcon> = {
  ioForms: ClipboardList,
  scheduler: CalendarClock,
  deviceAlert: Activity,
  switch: Split,
  delay: Hourglass,
  email: Mail,
  sms: MessageSquareText,
  workOrder: Wrench,
  report: FileChartColumn,
};
